import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { recomputeGameMatchCore } = require('./gameScoring');

// --- Minimal in-memory fake-Firestore, kun nok til gameScoring-kernen. -------
// Understøtter: games/{g}/bets (where uid==, where matchId==), games/{g}/players/{uid},
// batch().update/commit, runTransaction(tx.get(query)/tx.set(ref)).
function makeDb(betList) {
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
  const playersCollection = {
    doc: (uid) => ({ __player: uid }),
  };
  const gameDoc = {
    collection: (name) => (name === 'bets' ? betsCollection : playersCollection),
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
    // A: pick X rammer facit X → 4 base + chance 8@3.0 = +16 → 20
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
    expect(db._players.A.totalPoints).toBe(20);
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
});
