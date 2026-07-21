import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  recomputeGameMatchCore, recomputeSeasonElo, buildRoundContext, playerRoundBonus,
} = require('./gameScoring');

// --- Minimal in-memory fake-Firestore, kun nok til gameScoring-kernen. -------
// Understøtter: games/{g}/bets (where uid==, where matchId==), games/{g}/matches
// (.get() → alle), games/{g}/players/{uid}, batch().update/commit,
// runTransaction(tx.get(query)/tx.set(ref)).
function makeDb(betList, matchList = []) {
  const bets = betList.map((b) => ({ data: { ...b } }));
  bets.forEach((b) => { b.ref = { __bet: b }; });
  const players = {}; // uid -> data

  const betsCollection = {
    where: (field, _op, val) => ({
      get: async () => ({
        docs: bets
          .filter((b) => b.data[field] === val)
          .map((b) => ({ ref: b.ref, data: () => b.data })),
      }),
    }),
  };
  const matchesCollection = {
    get: async () => ({
      docs: matchList.map((m) => ({ id: m.id, data: () => m })),
    }),
  };
  const playersCollection = {
    doc: (uid) => ({ __player: uid }),
  };
  const gameDoc = {
    collection: (name) => {
      if (name === 'bets') return betsCollection;
      if (name === 'matches') return matchesCollection;
      return playersCollection;
    },
  };
  const db = {
    collection: (name) => {
      if (name !== 'games') throw new Error(`uventet collection ${name}`);
      return { doc: () => gameDoc };
    },
    batch: () => ({
      _ops: [],
      update(ref, data) { this._ops.push({ ref, data }); },
      async commit() { for (const op of this._ops) Object.assign(op.ref.__bet.data, op.data); },
    }),
    async runTransaction(fn) {
      await fn({
        get: async (q) => q.get(),
        set: (ref, data) => { players[ref.__player] = { ...(players[ref.__player] || {}), ...data }; },
      });
    },
    _players: players,
    _bets: bets,
  };
  return db;
}

const FieldValue = { serverTimestamp: () => '@ts' };

describe('recomputeGameMatchCore', () => {
  it('scorer bets og gulver spillerens total (ingen negativ saldo)', async () => {
    // Point følger oddsene: base = kampens odds (1 decimal).
    // A: pick X rammer facit X → 3.0 base (odds X) + chance 8@3.0 = +16 → 19
    // B: pick 1, facit X → 0, chance 5@2.0 forbi → −5 (skal gulves til 0 i total)
    const db = makeDb([
      { uid: 'A', matchId: 'm1', pick: 'X', chanceStake: 8, points: 0 },
      { uid: 'B', matchId: 'm1', pick: '1', chanceStake: 5, points: 0 },
      { uid: 'C', matchId: 'other', pick: '1', chanceStake: 0, points: 3 }, // anden kamp, urørt
    ]);
    const res = await recomputeGameMatchCore(db, FieldValue, 'g1', 'm1', {
      result: 'X', odds: { 1: 2.0, X: 3.0, 2: 4.0 },
    });
    expect(res.rescored).toBe(2);
    expect(res.players).toBe(2);
    expect(db._players.A.totalPoints).toBe(19);
    expect(db._players.B.totalPoints).toBe(0); // −5 gulvet til 0
    expect(db._players.C).toBeUndefined();     // ikke berørt
  });

  it('rører ikke bets hvis pointtallet er uændret', async () => {
    const db = makeDb([
      { uid: 'A', matchId: 'm1', pick: 'X', chanceStake: 0, points: 4 }, // allerede korrekt
    ]);
    const res = await recomputeGameMatchCore(db, FieldValue, 'g1', 'm1', { result: 'X' });
    expect(res.rescored).toBe(0);
    expect(Object.keys(db._players)).toHaveLength(0);
  });

  it('gør intet uden facit', async () => {
    const db = makeDb([{ uid: 'A', matchId: 'm1', pick: '1', points: 0 }]);
    const res = await recomputeGameMatchCore(db, FieldValue, 'g1', 'm1', { result: null });
    expect(res).toEqual({ rescored: 0, players: 0 });
  });

  it('lægger combi-runde-bonus til når hele runden er ramt', async () => {
    // Runde 1 = to kampe. A tipper begge og rammer begge → bonus = 2.0×3.0 = 6.0.
    // B tipper kun m1 → ingen bonus (tippede ikke hele runden).
    const matches = [
      { id: 'm1', round: 1, result: '1', odds: { 1: 2.0, X: 4, 2: 4 } },
      { id: 'm2', round: 1, result: 'X', odds: { 1: 2, X: 3.0, 2: 4 } },
    ];
    const db = makeDb([
      { uid: 'A', matchId: 'm1', pick: '1', chanceStake: 0, points: 2 }, // allerede scoret
      { uid: 'A', matchId: 'm2', pick: 'X', chanceStake: 0, points: 0 }, // scores nu
      { uid: 'B', matchId: 'm1', pick: '1', chanceStake: 0, points: 2 },
    ], matches);
    const res = await recomputeGameMatchCore(db, FieldValue, 'g1', 'm2', {
      result: 'X', odds: { 1: 2, X: 3.0, 2: 4 }, round: 1,
    });
    expect(res.rescored).toBe(1);              // kun A's m2-bet ændrede sig
    // A: 2 (m1) + 3 (m2) + 6 (combi 2.0×3.0) = 11
    expect(db._players.A.totalPoints).toBe(11);
    expect(db._players.A.roundBonus).toBe(6);
    // B rørt ikke (ingen bet på m2) → ingen genberegning
    expect(db._players.B).toBeUndefined();
  });
});

describe('buildRoundContext + playerRoundBonus', () => {
  const matches = [
    { id: 'r1-a', round: 1, result: '1', odds: { 1: 2.0, X: 4, 2: 4 } },
    { id: 'r1-b', round: 1, result: 'X', odds: { 1: 2, X: 3.0, 2: 4 } },
    { id: 'r1-c', round: 1, result: '2', odds: { 1: 2, X: 4, 2: 2.5 } }, // ikke afgjort endnu nedenfor
  ];
  it('bygger opslag pr. kamp og pr. runde', () => {
    const ctx = buildRoundContext(matches);
    expect(ctx.rounds[1]).toEqual({ count: 3, settledCount: 3 });
    expect(ctx.byMatch['r1-b'].result).toBe('X');
  });
  it('kræver at HELE runden er afgjort + at spilleren tippede alle kampe', () => {
    const ctx = buildRoundContext(matches);
    // tippede kun 2 af 3 → ingen bonus
    expect(playerRoundBonus([
      { matchId: 'r1-a', pick: '1' }, { matchId: 'r1-b', pick: 'X' },
    ], ctx)).toBe(0);
    // tippede alle 3, ramte alle → 2.0×3.0×2.5 = 15
    expect(playerRoundBonus([
      { matchId: 'r1-a', pick: '1' }, { matchId: 'r1-b', pick: 'X' }, { matchId: 'r1-c', pick: '2' },
    ], ctx)).toBe(15);
  });
  it('giver ingen bonus når en kamp i runden mangler facit', () => {
    const partial = [
      { id: 'r1-a', round: 1, result: '1', odds: { 1: 2, X: 4, 2: 4 } },
      { id: 'r1-b', round: 1, result: null, odds: { 1: 2, X: 3, 2: 4 } },
    ];
    const ctx = buildRoundContext(partial);
    expect(ctx.rounds[1].settledCount).toBe(1);
    expect(playerRoundBonus([
      { matchId: 'r1-a', pick: '1' }, { matchId: 'r1-b', pick: 'X' },
    ], ctx)).toBe(0);
  });
  it('uden roundCtx gives 0', () => {
    expect(playerRoundBonus([{ matchId: 'x', pick: '1' }], null)).toBe(0);
  });
});

// --- Fake-Firestore for recomputeSeasonElo (spil-dok + kampe) ----------------
function makeEloDb(gameData, matchList) {
  const game = { ...gameData };
  const matches = matchList.map((m) => ({ data: { ...m } }));
  matches.forEach((m) => { m.ref = { __match: m }; });
  const gameRef = {
    async get() { return { exists: true, data: () => game }; },
    set(data) { Object.assign(game, data); },
    collection() {
      return { async get() { return { docs: matches.map((m) => ({ id: m.data.id, ref: m.ref, data: () => m.data })) }; } };
    },
  };
  return {
    _game: game,
    _matches: matches,
    collection: () => ({ doc: () => gameRef }),
    batch: () => ({
      _ops: [],
      update(ref, data) { this._ops.push({ ref, data }); },
      async commit() { for (const op of this._ops) Object.assign(op.ref.__match.data, op.data); },
    }),
  };
}

describe('recomputeSeasonElo (levende Elo)', () => {
  const teams = [{ name: 'A', elo: 1500 }, { name: 'B', elo: 1500 }];
  const future = 5_000_000_000_000; // langt ude i fremtiden
  const past = 1_000;

  it('opdaterer Elo efter spillet kamp og friske odds på fremtidig kamp', async () => {
    const db = makeEloDb({ teams }, [
      { id: 'm1', home: 'A', away: 'B', kickoff: past, result: '1' },        // A vandt
      { id: 'm2', home: 'A', away: 'B', kickoff: future, odds: { 1: 9, X: 9, 2: 9 } }, // fremtidig
    ]);
    const res = await recomputeSeasonElo(db, FieldValue, 'g1', 2_000_000_000_000);
    // A's rating steg over B's.
    expect(db._game.eloCurrent.A).toBeGreaterThan(db._game.eloCurrent.B);
    // Den fremtidige kamps odds blev opdateret (var urealistiske 9/9/9).
    expect(res.updated).toBe(1);
    const m2 = db._matches.find((m) => m.data.id === 'm2').data;
    expect(m2.odds['1']).not.toBe(9);
    expect(m2.eloHome).toBeGreaterThan(m2.eloAway);
  });

  it('rører ikke låste (allerede spillede/kickoff-passerede) kampe', async () => {
    const db = makeEloDb({ teams }, [
      { id: 'm1', home: 'A', away: 'B', kickoff: past, result: '1' },
      { id: 'm2', home: 'B', away: 'A', kickoff: past, odds: { 1: 9, X: 9, 2: 9 } }, // kickoff passeret → låst
    ]);
    const res = await recomputeSeasonElo(db, FieldValue, 'g1', 2_000_000_000_000);
    expect(res.updated).toBe(0);
    const m2 = db._matches.find((m) => m.data.id === 'm2').data;
    expect(m2.odds['1']).toBe(9); // uændret
  });

  it('gør intet uden seed-hold', async () => {
    const db = makeEloDb({}, [{ id: 'm1', home: 'A', away: 'B', kickoff: future }]);
    const res = await recomputeSeasonElo(db, FieldValue, 'g1', 1_000_000);
    expect(res).toEqual({ updated: 0 });
  });
});
