// ---------------------------------------------------------------------------
// Tests for synk-provider-SNITTET: registret, den statiske spil-liste og
// dens paritet med scripts/games.mjs — samt flerspils-kørslen.
//
// Selve superliga-providerens parsing er dækket af superligaSync.test.js:
// kernerne kalder provideren som default, så alle 117 eksisterende tests
// løber igennem den. Her testes det, snittet TILFØJEDE.
// ---------------------------------------------------------------------------
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { GAMES } from '../scripts/games.mjs';

const require = createRequire(import.meta.url);
const { PROVIDERS, SYNCED_GAMES } = require('./syncProviders');
const { runScheduledSyncAll, syncResultsCore, syncLiveCore } = require('./superligaSync');

const FieldValue = {
  serverTimestamp: () => ({ __ts: true }),
  delete: () => ({ __delete: true }),
};

/**
 * Mindste skrivbare db: games/{id}/matches med batch og spil-dokument.
 * Superliga-suitens fake er bundet til superliga2627 — denne er spil-agnostisk,
 * for pointen HERUNDER er netop et spil, der ikke er Superligaen.
 */
function fakeDb(matchDocs) {
  const docs = new Map(Object.entries(matchDocs));
  const spil = {};
  const matchesCol = {
    async get() { return { docs: [...docs.entries()].map(([id, data]) => ({ id, data: () => data })) }; },
    doc: (id) => ({ __id: id }),
  };
  return {
    _docs: docs,
    _spil: spil,
    collection: () => ({
      doc: () => ({
        collection: () => matchesCol,
        async get() { return { data: () => spil }; },
        async set(patch, opts) {
          if (opts?.merge !== true) throw new Error('set() uden merge');
          Object.assign(spil, patch);
        },
      }),
    }),
    batch() {
      return {
        _ops: [],
        set(ref, data, opts) {
          if (opts?.merge !== true) throw new Error('batch.set() uden merge');
          this._ops.push({ id: ref.__id, data });
        },
        async commit() {
          for (const op of this._ops) docs.set(op.id, { ...(docs.get(op.id) || {}), ...op.data });
        },
      };
    },
  };
}

// KONTRAKTENS BÆRENDE KLAUSUL: kernen SKAL bruge providerens resolveDocs.
// For Superligaen er sourceKey og dokument-id identiske, så oversættelsen er
// en identitet, alle superligaSync-tests løber usynligt igennem — mutationen
// "drop resolveDocs" overlevede hele suiten. Denne provider har med vilje
// sourceKey ≠ dokument-id (pl-N ↔ r1-N), så identiteten ikke kan snyde.
// fetchFn kaster på ethvert kald: bruges der en RIGTIG provider i stedet for
// den injicerede (providerAfOpts-mutationen), fejler testen allerede dér.
const fetchEksploderer = async () => { throw new Error('kernen må ikke selv hente — det gør provideren'); };
const oversaetter = {
  resolveDocs(sourceKeys, docIds) {
    const kendte = new Set(docIds);
    const map = new Map();
    for (const k of sourceKeys) {
      const id = `r1-${String(k).slice(3)}`;
      if (kendte.has(id)) map.set(k, id);
    }
    return map;
  },
};

describe('kernerne bruger providerens resolveDocs — sourceKey er ikke dokument-id', () => {
  it('facit lander på det OVERSATTE dokument-id', async () => {
    const db = fakeDb({ 'r1-101': { kickoff: new Date('2026-08-21T19:00:00Z') } });
    const provider = {
      ...oversaetter,
      async hentFaerdige() { return [{ sourceKey: 'pl-101', homeGoals: 2, awayGoals: 0 }]; },
    };
    const ud = await syncResultsCore(db, FieldValue, {
      gameId: 'pl-test', provider, sync: {}, fetchFn: fetchEksploderer,
    });
    expect(ud.updated).toBe(1);
    expect(ud.rettede).toEqual(['r1-101']);
    expect(db._docs.get('r1-101').result).toBe('1');
    expect(db._docs.get('r1-101').homeGoals).toBe(2);
  });

  it('live-skrivning OG slut-markering rammer de oversatte dokumenter', async () => {
    const toTimerSiden = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const iGang = { kickoff: toTimerSiden, live: { home: 0, away: 0, status: 'foerste', at: 1 } };
    const forsvundet = { kickoff: toTimerSiden, live: { home: 1, away: 1, status: 'anden', at: 1 } };
    const db = fakeDb({ 'r1-101': iGang, 'r1-102': forsvundet });
    const provider = {
      ...oversaetter,
      async hentLive() {
        return {
          events: [{ sourceKey: 'pl-101', home: 1, away: 0, status: 'anden', statusRaw: 'x' }],
          // pl-102 er væk fra kildens liste → r1-102 skal markeres 'slut'.
          // Sammenlignes der på RÅ sourceKeys i stedet for oversatte id'er,
          // markeres r1-101 OGSÅ slut — og det er præcis mutationen, der
          // overlevede uden denne test.
          stadigIGang: new Set(['pl-101']),
        };
      },
    };
    const ud = await syncLiveCore(db, FieldValue, {
      gameId: 'pl-test',
      provider,
      sync: {},
      fetchFn: fetchEksploderer,
      nowMs: Date.now(),
      only: [
        { id: 'r1-101', data: iGang },
        { id: 'r1-102', data: forsvundet },
      ],
    });
    expect(ud.skrevet).toBe(1);
    expect(ud.sluttede).toEqual(['r1-102']);
    expect(db._docs.get('r1-101').live.status).toBe('anden'); // IKKE slut
    expect(db._docs.get('r1-102').live.status).toBe('slut');
  });
});

// Spejlfils-pariteten. games.mjs er kilden til, hvad der SEEDES på
// spil-dokumenterne (klienten læser provider-navnet derfra til kildelinjen);
// SYNCED_GAMES er, hvad serveren faktisk SYNKER. Driver de to fra hinanden,
// synker serveren mod en anden konfiguration, end skærmen påstår.
describe('SYNCED_GAMES ⇄ scripts/games.mjs', () => {
  it('hver synket konfiguration står ordret i games.mjs', () => {
    for (const g of SYNCED_GAMES) {
      const game = GAMES.find((x) => x.id === g.gameId);
      expect(game, `${g.gameId} findes ikke i games.mjs`).toBeTruthy();
      expect(game.sync?.provider, `${g.gameId}: provider`).toBe(g.provider);
      for (const [k, v] of Object.entries(g.sync)) {
        expect(game.sync[k], `${g.gameId}: sync.${k}`).toBe(v);
      }
    }
  });

  // TRIPWIREN for næste delopgave: i samme øjeblik en provider implementeres
  // i PROVIDERS (fx pulselive), KRÆVER denne test, at spillene med den
  // provider også kommer med i SYNCED_GAMES. En implementeret kilde, ingen
  // synker fra, er præcis den slags halve tilstand, der ellers opdages ved,
  // at point aldrig afregnes.
  it('hvert games.mjs-spil med en IMPLEMENTERET provider er med i synken', () => {
    const burde = GAMES
      .filter((x) => x.sync && PROVIDERS[x.sync.provider])
      .map((x) => x.id)
      .sort();
    expect(SYNCED_GAMES.map((g) => g.gameId).sort()).toEqual(burde);
  });

  it('hver post i SYNCED_GAMES peger på en provider, der findes', () => {
    for (const g of SYNCED_GAMES) {
      expect(PROVIDERS[g.provider], `${g.gameId}: "${g.provider}"`).toBeTruthy();
    }
  });
});

describe('provider-kontrakten (superliga)', () => {
  it('resolveDocs udelader nøgler uden dokument — kernen skal kunne springe dem over', () => {
    const map = PROVIDERS.superliga.resolveDocs(['r1-a-b', 'r1-x-y'], ['r1-a-b', 'r1-c-d']);
    expect([...map.entries()]).toEqual([['r1-a-b', 'r1-a-b']]);
  });
});

describe('runScheduledSyncAll', () => {
  // Mindste db, pendingMatches kan løbe tør på: range-forespørgslen svarer tomt.
  const tomDb = {
    collection: () => ({
      doc: () => ({
        collection: () => ({
          where: () => ({ where: () => ({ get: async () => ({ docs: [] }) }) }),
        }),
      }),
    }),
  };

  it('kører hvert spil i listen og mærker resultatet med gameId', async () => {
    const ud = await runScheduledSyncAll(tomDb, {}, Date.now());
    expect(ud.map((o) => o.gameId)).toEqual(SYNCED_GAMES.map((g) => g.gameId));
    for (const o of ud) {
      expect(o.pending).toBe(0);
      expect(o.fejl).toBeNull();
    }
  });

  it('kører ALLE spil i listen — ikke kun det første', async () => {
    const ud = await runScheduledSyncAll(tomDb, {}, Date.now(), {
      games: [
        { gameId: 'spil-a', provider: 'superliga', sync: {} },
        { gameId: 'spil-b', provider: 'superliga', sync: {} },
      ],
    });
    expect(ud.map((o) => o.gameId)).toEqual(['spil-a', 'spil-b']);
  });

  it('en ukendt provider springes over — og vælter ikke de andre spil', async () => {
    const ud = await runScheduledSyncAll(tomDb, {}, Date.now(), {
      games: [
        { gameId: 'fremmed', provider: 'findes-ikke', sync: {} },
        { gameId: 'superliga2627', provider: 'superliga', sync: {} },
      ],
    });
    expect(ud.map((o) => o.gameId)).toEqual(['superliga2627']);
  });
});
