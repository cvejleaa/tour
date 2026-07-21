import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  outcomeFromScore, matchDocId, resultsUrl, syncResultsCore,
  standingsUrl, syncStandingsCore,
} = require('./superligaSync');

const FieldValue = { serverTimestamp: () => '@ts' };

// Fake-Firestore: games/{g}/matches med get()/doc(id) + batch.set/commit.
function makeDb(matchDocs) {
  const docs = new Map(matchDocs.map((m) => [m.id, { ...m.data }]));
  const matchesCol = {
    async get() {
      return { docs: [...docs.entries()].map(([id, data]) => ({ id, data: () => data })) };
    },
    doc: (id) => ({ __id: id }),
  };
  return {
    collection(name) {
      if (name !== 'games') throw new Error(`uventet ${name}`);
      return { doc: () => ({ collection: () => matchesCol }) };
    },
    batch() {
      return {
        _ops: [],
        set(ref, data) { this._ops.push({ id: ref.__id, data }); },
        async commit() {
          for (const op of this._ops) docs.set(op.id, { ...(docs.get(op.id) || {}), ...op.data });
        },
      };
    },
    _docs: docs,
  };
}

function fakeFetch(events, ok = true) {
  return async () => ({ ok, status: ok ? 200 : 500, json: async () => ({ events }) });
}

describe('outcomeFromScore', () => {
  it('mapper mål til 1X2', () => {
    expect(outcomeFromScore(2, 0)).toBe('1');
    expect(outcomeFromScore(1, 1)).toBe('X');
    expect(outcomeFromScore(1, 2)).toBe('2');
    expect(outcomeFromScore(null, 1)).toBeNull();
  });
});

describe('matchDocId', () => {
  it('genskaber seed-id-formatet (danske bogstaver)', () => {
    expect(matchDocId(1, 'Viborg FF', 'OB')).toBe('r1-viborgff-ob');
    expect(matchDocId(1, 'F.C. København', 'Lyngby Boldklub')).toBe('r1-fckobenhavn-lyngbyboldklub');
  });
  it('matcher superligaSeed.matchId', async () => {
    const seed = await import('../src/lib/superligaSeed.js');
    for (const [round, home, away] of [
      [1, 'Viborg FF', 'OB'], [5, 'Sønderjyske Fodbold', 'AGF'], [22, 'Brøndby IF', 'AC Horsens'],
    ]) {
      expect(matchDocId(round, home, away)).toBe(seed.matchId({ round, home, away }));
    }
  });
});

describe('resultsUrl', () => {
  it('indeholder sæson + status=finished', () => {
    const u = resultsUrl(35802);
    expect(u).toContain('seasonId=35802');
    expect(u).toContain('status=finished');
  });
});

describe('syncResultsCore', () => {
  it('sætter nye facit og springer uændrede over', async () => {
    const db = makeDb([
      { id: 'r1-viborgff-ob', data: { round: 1, home: 'Viborg FF', away: 'OB' } }, // intet facit
      { id: 'r1-agf-brondbyif', data: { round: 1, home: 'AGF', away: 'Brøndby IF', result: '1' } }, // allerede sat
    ]);
    const events = [
      { statusType: 'finished', round: 1, homeName: 'Viborg FF', awayName: 'OB', score: { home: 1, away: 2 } },
      { statusType: 'finished', round: 1, homeName: 'AGF', awayName: 'Brøndby IF', score: { home: 2, away: 0 } }, // → '1' = uændret
    ];
    const res = await syncResultsCore(db, FieldValue, { fetchFn: fakeFetch(events) });
    expect(res.checked).toBe(2);
    expect(res.updated).toBe(1);
    expect(db._docs.get('r1-viborgff-ob').result).toBe('2'); // udesejr
    expect(db._docs.get('r1-viborgff-ob').homeGoals).toBe(1);
  });

  it('ignorerer ukendte kampe og ikke-færdige', async () => {
    const db = makeDb([{ id: 'r1-viborgff-ob', data: { round: 1 } }]);
    const events = [
      { statusType: 'finished', round: 9, homeName: 'Ukendt', awayName: 'Hold', score: { home: 1, away: 0 } },
      { statusType: 'live', round: 1, homeName: 'Viborg FF', awayName: 'OB', score: { home: 0, away: 0 } },
    ];
    const res = await syncResultsCore(db, FieldValue, { fetchFn: fakeFetch(events) });
    expect(res.updated).toBe(0);
  });

  it('kaster ved API-fejl', async () => {
    const db = makeDb([]);
    await expect(syncResultsCore(db, FieldValue, { fetchFn: fakeFetch([], false) }))
      .rejects.toThrow(/HTTP 500/);
  });
});

// --- Officiel stilling-synk --------------------------------------------------
function makeGameDb() {
  const game = {};
  return {
    collection(name) {
      if (name !== 'games') throw new Error(`uventet ${name}`);
      return { doc: () => ({ set: (data) => Object.assign(game, data) }) };
    },
    _game: game,
  };
}
const fakeStandingsFetch = (rows, ok = true) => async () => ({ ok, status: ok ? 200 : 500, json: async () => rows });

describe('syncStandingsCore (officiel stilling)', () => {
  it('bygger URL med stage + form', () => {
    const u = standingsUrl(35802, 935487);
    expect(u).toContain('/tournaments/46/standings');
    expect(u).toContain('seasonId=35802');
    expect(u).toContain('stageId=935487');
    expect(u).toContain('form=last5');
  });

  it('gemmer trimmet, rang-sorteret stilling på spillet', async () => {
    const db = makeGameDb();
    const rows = [
      { rank: 2, teamName: 'B', teamShortName: 'B', points: 1, matchesPlayed: 1, matchesWon: 0, matchesDraw: 1, matchesLost: 0, goalsScored: 1, goalsConceded: 1, rankType: 'championship_playoff' },
      { rank: 1, teamName: 'A', teamShortName: 'A', points: 3, matchesPlayed: 1, matchesWon: 1, matchesDraw: 0, matchesLost: 0, goalsScored: 2, goalsConceded: 0, rankType: 'championship_playoff' },
    ];
    const res = await syncStandingsCore(db, FieldValue, { fetchFn: fakeStandingsFetch(rows) });
    expect(res.rows).toBe(2);
    expect(db._game.standings.map((r) => r.teamName)).toEqual(['A', 'B']); // sorteret på rank
    expect(db._game.standings[0]).toMatchObject({ rank: 1, points: 3, played: 1, won: 1, gf: 2, ga: 0 });
  });

  it('kaster ved API-fejl', async () => {
    await expect(syncStandingsCore(makeGameDb(), FieldValue, { fetchFn: fakeStandingsFetch([], false) }))
      .rejects.toThrow(/HTTP 500/);
  });
});
