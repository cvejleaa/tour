import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  recomputeGameMatchCore, recomputeSeasonElo, buildRoundContext, playerRoundBonus,
  computeRanks, snapshotRoundRanks, settlePuljeBets, officialTop6,
  gatedIds, recomputeAllPlayerTotals,
} = require('./gameScoring');

// --- Minimal in-memory fake-Firestore, kun nok til gameScoring-kernen. -------
// Understøtter: games/{g}/bets (where uid==, where matchId==), games/{g}/matches
// (.get()), games/{g}/players (.get() + .doc(uid)), spil-dok (.get()/.set()),
// batch().update/commit, runTransaction(tx.get(query)/tx.set(ref)).
function makeDb(betList, matchList = [], gameData = {}, playerSeed = {}, puljeSeed = {}) {
  const bets = betList.map((b) => ({ data: { ...b } }));
  bets.forEach((b) => { b.ref = { __bet: b }; });
  const players = { ...playerSeed }; // uid -> data (forud-seedede placeringer mv.)
  const pulje = {}; // uid -> data
  for (const [uid, d] of Object.entries(puljeSeed)) pulje[uid] = { uid, ...d };
  const game = { ...gameData };

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
    get: async () => ({ docs: matchList.map((m) => ({ id: m.id, data: () => m })) }),
  };
  const playersCollection = {
    doc: (uid) => ({ __player: uid }),
    get: async () => ({
      docs: Object.keys(players).map((uid) => ({
        id: uid, ref: { __player: uid }, data: () => players[uid],
      })),
    }),
  };
  const puljeCollection = {
    doc: (uid) => ({ __pulje: uid }),
    get: async () => ({
      empty: Object.keys(pulje).length === 0,
      docs: Object.keys(pulje).map((uid) => ({
        id: uid, ref: { __pulje: uid }, data: () => pulje[uid],
      })),
    }),
  };
  const gameDoc = {
    get: async () => ({ exists: Object.keys(game).length > 0, data: () => game }),
    set: (data) => {
      for (const [k, v] of Object.entries(data)) {
        if (v && v.__arrayUnion) {
          const cur = Array.isArray(game[k]) ? game[k] : [];
          game[k] = [...new Set([...cur, ...v.__arrayUnion])];
        } else { game[k] = v; }
      }
    },
    collection: (name) => {
      if (name === 'bets') return betsCollection;
      if (name === 'matches') return matchesCollection;
      if (name === 'puljeBets') return puljeCollection;
      return playersCollection;
    },
  };
  const applyOp = (ref, data) => {
    if (ref.__bet) { Object.assign(ref.__bet.data, data); return; }
    if (ref.__player) { players[ref.__player] = { ...(players[ref.__player] || {}), ...data }; return; }
    if (ref.__pulje) { pulje[ref.__pulje] = { ...(pulje[ref.__pulje] || {}), ...data }; }
  };
  // tx.get skal kunne læse både queries (som har .get) og player-refs.
  const txGet = async (q) => {
    if (q && q.__player) return { exists: q.__player in players, data: () => players[q.__player] || {} };
    return q.get();
  };
  const db = {
    collection: (name) => {
      if (name !== 'games') throw new Error(`uventet collection ${name}`);
      return { doc: () => gameDoc };
    },
    batch: () => ({
      _ops: [],
      update(ref, data) { this._ops.push({ ref, data }); },
      set(ref, data) { this._ops.push({ ref, data }); },
      async commit() { for (const op of this._ops) applyOp(op.ref, op.data); },
    }),
    async runTransaction(fn) {
      await fn({
        get: txGet,
        set: (ref, data) => applyOp(ref, data),
      });
    },
    _players: players,
    _bets: bets,
    _game: game,
    _pulje: pulje,
  };
  return db;
}

const FieldValue = {
  serverTimestamp: () => '@ts',
  arrayUnion: (...vals) => ({ __arrayUnion: vals }),
};

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

describe('gatedIds (kampe før spillets start)', () => {
  it('uden startAt: tom mængde', () => {
    expect(gatedIds([{ id: 'm1', kickoff: 100 }], null).size).toBe(0);
  });
  it('markerer kun kampe med kickoff FØR start', () => {
    const g = gatedIds([{ id: 'm1', kickoff: 100 }, { id: 'm2', kickoff: 500 }, { id: 'm3', kickoff: 900 }], 500);
    expect([...g]).toEqual(['m1']); // 500 er PÅ start → tæller med
  });
});

describe('recomputeGameMatchCore — start-gate (game.startAt)', () => {
  it('scorer ikke en kamp før spillets start', async () => {
    const db = makeDb(
      [{ uid: 'A', matchId: 'm1', pick: 'X', chanceStake: 0, points: 0 }],
      [{ id: 'm1', round: 1, kickoff: 100, result: 'X', odds: { 1: 2, X: 3, 2: 4 } }],
      { startAt: 500 },
    );
    const res = await recomputeGameMatchCore(db, FieldValue, 'g1', 'm1', {
      result: 'X', odds: { 1: 2, X: 3, 2: 4 }, round: 1, kickoff: 100,
    });
    expect(res.gated).toBe(true);
    expect(res.rescored).toBe(0);
    expect(Object.keys(db._players)).toHaveLength(0);
  });

  it('udelader point fra runde FØR start i totalen', async () => {
    const matches = [
      { id: 'm1', round: 1, kickoff: 100, result: '1', odds: { 1: 5, X: 5, 2: 5 } },
      { id: 'm2', round: 2, kickoff: 900, result: 'X', odds: { 1: 2, X: 3, 2: 4 } },
    ];
    const db = makeDb([
      { uid: 'A', matchId: 'm1', pick: '1', chanceStake: 0, points: 5 }, // runde 1 → skal IKKE tælle
      { uid: 'A', matchId: 'm2', pick: 'X', chanceStake: 0, points: 0 }, // runde 2 → scores nu til 3
    ], matches, { startAt: 500 });
    const res = await recomputeGameMatchCore(db, FieldValue, 'g1', 'm2', {
      result: 'X', odds: { 1: 2, X: 3, 2: 4 }, round: 2, kickoff: 900,
    });
    expect(res.rescored).toBe(1);
    expect(db._players.A.totalPoints).toBe(3); // kun m2; m1's 5 point gated væk
  });
});

describe('recomputeAllPlayerTotals — genberegn med gate', () => {
  it('fjerner point før start for ALLE spillere', async () => {
    const matches = [
      { id: 'm1', round: 1, kickoff: 100 },
      { id: 'm2', round: 2, kickoff: 900 },
    ];
    const db = makeDb([
      { uid: 'A', matchId: 'm1', pick: '1', points: 5 },
      { uid: 'A', matchId: 'm2', pick: 'X', points: 3 },
      { uid: 'B', matchId: 'm1', pick: '1', points: 5 },
    ], matches, { startAt: 500 }, { A: { totalPoints: 8 }, B: { totalPoints: 5 } });
    const res = await recomputeAllPlayerTotals(db, FieldValue, 'g1');
    expect(res).toEqual({ players: 2, gatedMatches: 1 });
    expect(db._players.A.totalPoints).toBe(3); // kun m2
    expect(db._players.B.totalPoints).toBe(0); // kun m1 (gated)
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

describe('computeRanks', () => {
  it('standard-konkurrence-rang (1,2,2,4) efter point', () => {
    const r = computeRanks([
      { uid: 'a', totalPoints: 12 }, { uid: 'b', totalPoints: 8 },
      { uid: 'c', totalPoints: 8 }, { uid: 'd', totalPoints: 5 },
    ]);
    expect(r.get('a')).toBe(1);
    expect(r.get('b')).toBe(2);
    expect(r.get('c')).toBe(2); // delt 2.-plads
    expect(r.get('d')).toBe(4); // springer 3 over
  });
  it('deterministisk tie-break på uid ved lige point', () => {
    const r1 = computeRanks([{ uid: 'z', totalPoints: 5 }, { uid: 'a', totalPoints: 5 }]);
    const r2 = computeRanks([{ uid: 'a', totalPoints: 5 }, { uid: 'z', totalPoints: 5 }]);
    expect(r1.get('a')).toBe(r2.get('a')); // samme rang uanset input-orden
  });
});

describe('snapshotRoundRanks', () => {
  it('sætter previousRank = hidtidig rank, rank = ny rang', async () => {
    // Før: A var nr. 1, B nr. 2 (gemt rank). Nu har B overhalet A på point.
    const db = makeDb([], [], {}, {
      A: { totalPoints: 10, rank: 1 },
      B: { totalPoints: 20, rank: 2 },
    });
    const res = await snapshotRoundRanks(db, FieldValue, 'g1');
    expect(res.ranked).toBe(2);
    expect(db._players.B.rank).toBe(1);           // B nu nr. 1
    expect(db._players.B.previousRank).toBe(2);   // B var nr. 2
    expect(db._players.A.rank).toBe(2);           // A nu nr. 2
    expect(db._players.A.previousRank).toBe(1);   // A var nr. 1 → rankDelta -1 (faldt)
  });
  it('første snapshot: previousRank = rank (ingen bevægelse)', async () => {
    const db = makeDb([], [], {}, { A: { totalPoints: 10 }, B: { totalPoints: 5 } });
    await snapshotRoundRanks(db, FieldValue, 'g1');
    expect(db._players.A).toMatchObject({ rank: 1, previousRank: 1 });
    expect(db._players.B).toMatchObject({ rank: 2, previousRank: 2 });
  });
});

describe('recomputeGameMatchCore — placerings-snapshot ved rundeafslutning', () => {
  it('snapshotter ranks når sidste kamp i runden afgøres (én gang)', async () => {
    // Runde 1 = to kampe. m1 allerede afgjort; m2 afgøres nu → runden komplet.
    const matches = [
      { id: 'm1', round: 1, result: '1', odds: { 1: 2.0, X: 4, 2: 4 } },
      { id: 'm2', round: 1, result: 'X', odds: { 1: 2, X: 3.0, 2: 4 } },
    ];
    const db = makeDb([
      { uid: 'A', matchId: 'm1', pick: '1', chanceStake: 0, points: 2 },
      { uid: 'A', matchId: 'm2', pick: 'X', chanceStake: 0, points: 0 },
      { uid: 'B', matchId: 'm2', pick: '1', chanceStake: 0, points: 0 },
    ], matches, {}, { A: {}, B: {} });
    await recomputeGameMatchCore(db, FieldValue, 'g1', 'm2', {
      result: 'X', odds: { 1: 2, X: 3.0, 2: 4 }, round: 1,
    });
    // A ramte begge (+combi) → foran B; ranks snapshottet, runden markeret.
    expect(db._players.A.rank).toBe(1);
    expect(db._game.snapshottedRounds).toEqual([1]);
  });

  it('snapshotter IKKE igen for en allerede-snapshottet runde (resultat-rettelse)', async () => {
    const matches = [
      { id: 'm1', round: 1, result: '1', odds: { 1: 2.0, X: 4, 2: 4 } },
      { id: 'm2', round: 1, result: 'X', odds: { 1: 2, X: 3.0, 2: 4 } },
    ];
    // Runde 1 er allerede snapshottet; A's m2-bet har et forkert gemt pointtal,
    // så en genberegning rescorer (og recalc kører) — men snapshot skal springes over.
    const db = makeDb([
      { uid: 'A', matchId: 'm2', pick: 'X', chanceStake: 0, points: 99 },
    ], matches, { snapshottedRounds: [1] }, { A: { rank: 7, previousRank: 7 } });
    const res = await recomputeGameMatchCore(db, FieldValue, 'g1', 'm2', {
      result: 'X', odds: { 1: 2, X: 3.0, 2: 4 }, round: 1,
    });
    expect(res.rescored).toBe(1);           // pointtallet blev rettet
    expect(db._players.A.rank).toBe(7);     // rank urørt → snapshot kørte ikke igen
    expect(db._players.A.previousRank).toBe(7);
  });
});

describe('settlePuljeBets', () => {
  // 3 hold spillet færdigt: A > B > C. top-6 (slice) = [A, B, C].
  const matches = [
    { id: 'm1', home: 'A', away: 'B', homeGoals: 2, awayGoals: 0 },
    { id: 'm2', home: 'A', away: 'C', homeGoals: 1, awayGoals: 0 },
    { id: 'm3', home: 'B', away: 'C', homeGoals: 3, awayGoals: 1 },
  ];
  it('scorer pulje-tip og lægger bonusPoints i spillerens total', async () => {
    const db = makeDb([], matches, {}, { P1: {}, P2: {} }, {
      P1: { championship: ['A', 'B', 'C'] }, // alle 3 i top → 3×4 = 12
      P2: { championship: ['A', 'X', 'Y'] }, // 1 rigtig → 4
    });
    const res = await settlePuljeBets(db, FieldValue, 'g1', matches);
    expect(res.settled).toBe(2);
    expect(db._pulje.P1).toMatchObject({ correct: 3, points: 12 });
    expect(db._pulje.P2).toMatchObject({ correct: 1, points: 4 });
    expect(db._players.P1).toMatchObject({ bonusPoints: 12, totalPoints: 12 });
    expect(db._players.P2).toMatchObject({ bonusPoints: 4, totalPoints: 4 });
  });
  it('gør intet før grundspillet er helt spillet', async () => {
    const partial = [...matches.slice(0, 2), { id: 'm3', home: 'B', away: 'C', homeGoals: null, awayGoals: null }];
    const db = makeDb([], partial, {}, { P1: {} }, { P1: { championship: ['A', 'B', 'C'] } });
    const res = await settlePuljeBets(db, FieldValue, 'g1', partial);
    expect(res.settled).toBe(0);
    expect(db._pulje.P1.points).toBeUndefined();
  });

  it('bruger den OFFICIELLE stilling til top-6 (ikke beregnet tabel)', async () => {
    // Dummy-kamp mellem Y/Z (så en beregnet tabel ville give top = [Y,Z]).
    // Den officielle stilling siger derimod at A–F er top-6.
    const standings = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']
      .map((name, i) => ({ rank: i + 1, teamName: name, played: 1 }));
    const dummy = [{ id: 'm1', home: 'Y', away: 'Z', homeGoals: 1, awayGoals: 0 }];
    const db = makeDb([], dummy, { standings }, { P1: {}, P2: {} }, {
      P1: { championship: ['A', 'B', 'C', 'D', 'E', 'F'] }, // alle 6 rigtige → 34
      P2: { championship: ['A', 'B', 'C', 'D', 'E', 'X'] }, // 5 rigtige → 20
    });
    await settlePuljeBets(db, FieldValue, 'g1', dummy);
    expect(db._pulje.P1).toMatchObject({ correct: 6, points: 34 });
    expect(db._pulje.P2).toMatchObject({ correct: 5, points: 20 });
  });
});

describe('officialTop6', () => {
  const std = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']
    .map((name, i) => ({ rank: i + 1, teamName: name, played: 22 }));
  it('tager rank 1–6 fra den officielle stilling', () => {
    expect(officialTop6(std, 22)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
  });
  it('returnerer null hvis stillingen ikke er helt spillet igennem', () => {
    expect(officialTop6(std, 30)).toBeNull(); // forventer 30 spillede, har 22
  });
  it('returnerer null uden en fuld 12-holds stilling', () => {
    expect(officialTop6(null)).toBeNull();
    expect(officialTop6(std.slice(0, 5))).toBeNull();
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

  it('gemmer Elo-historik pr. HELT spillet runde', async () => {
    const db = makeEloDb({ teams }, [
      // Runde 1 = én kamp, spillet → giver et historik-snapshot.
      { id: 'r1', round: 1, home: 'A', away: 'B', kickoff: past, result: '1' },
      // Runde 2 = to kampe, kun den ene spillet → INTET snapshot for runde 2.
      { id: 'r2a', round: 2, home: 'A', away: 'B', kickoff: past + 1, result: 'X' },
      { id: 'r2b', round: 2, home: 'B', away: 'A', kickoff: future },
    ]);
    await recomputeSeasonElo(db, FieldValue, 'g1', 2_000_000_000_000);
    expect(Array.isArray(db._game.eloHistory)).toBe(true);
    expect(db._game.eloHistory.map((h) => h.round)).toEqual([1]); // kun runde 1 komplet
    expect(db._game.eloHistory[0].elo.A).toBeGreaterThan(db._game.eloHistory[0].elo.B);
  });
});
