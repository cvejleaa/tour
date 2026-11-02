import { describe, it, expect } from 'vitest';
import { koerFuldtSeed } from './fuldtSeed.mjs';
import { buildMatches, matchId } from '../../src/lib/superligaSeed.js';
import { SPORT_PROFILER } from '../../src/lib/superligaScoring.js';

// En fake af det, Firestore giver os. Den TÆLLER skrivninger, for det er hele
// pointen: det gamle seed skrev `teams` og `eloCurrent` ubetinget ved hvert
// gen-seed, og ingen test kunne se det, fordi skrivningen stod i et script
// uden dækning. Samme mønster som teamsOnly.test.mjs.
const fakeDb = (game) => {
  const gameKald = [];
  const batchKald = [];
  let commits = 0;
  return {
    gameKald,
    batchKald,
    commits: () => commits,
    gameRef: {
      id: 'sl-test',
      get: async () => ({ exists: game !== null, data: () => game }),
      set: async (data, opts) => { gameKald.push({ data, opts }); },
    },
    matchesRef: { doc: (id) => ({ id }) },
    batch: {
      set: (ref, data, opts) => { batchKald.push({ id: ref.id, data, opts }); },
      commit: async () => { commits += 1; },
    },
  };
};

const FIL_HOLD = [
  { name: 'Stærk', elo: 1900, color: '#111111' },
  { name: 'Svag', elo: 1300, color: '#222222' },
];
// Spillets LEVENDE tilstand: holdlisten har en anden startrating for Stærk
// end filen, og eloCurrent har flyttet sig efter sæsonens kampe.
const SPIL_HOLD = [
  { name: 'Stærk', elo: 1850, color: '#111111' },
  { name: 'Svag', elo: 1300, color: '#222222' },
];
const LEVENDE_ELO = { Stærk: 1871, Svag: 1279 };
const FX = [
  { round: 1, home: 'Stærk', away: 'Svag', kickoff: '2026-08-01T17:00:00Z' },
  { round: 2, home: 'Svag', away: 'Stærk', kickoff: '2026-08-08T17:00:00Z' },
];

const koer = (db, o = {}) => {
  const log = [];
  return koerFuldtSeed({
    gameRef: db.gameRef,
    matchesRef: db.matchesRef,
    batch: db.batch,
    fixtures: o.fixtures ?? FX,
    eksisterende: o.eksisterende ?? new Map(),
    teams: o.teams ?? FIL_HOLD,
    skriv: o.skriv ?? true,
    overskrivHold: o.overskrivHold ?? false,
    serverTimestamp: 'NU',
    tilTimestamp: (ms) => ({ ms }),
    log: (s) => log.push(s),
  }).then((r) => ({ ...r, log: log.join('\n') }));
};

describe('koerFuldtSeed — spil-dokumentet', () => {
  it('FØRSTE SEED (spillet har hverken teams eller eloCurrent) skriver begge fra holdlisten', async () => {
    const db = fakeDb({ name: 'Nyt spil' });
    const r = await koer(db);
    expect(db.gameKald).toHaveLength(1);
    expect(db.gameKald[0].data).toEqual({
      teams: FIL_HOLD,
      eloCurrent: { Stærk: 1900, Svag: 1300 },
      updatedAt: 'NU',
    });
    expect(db.gameKald[0].opts).toEqual({ merge: true });
    expect(r.dok.grund).toBe('foerste');
    expect(r.log).toMatch(/første seed — teams \(2 hold\) og eloCurrent skrives fra holdlisten/);
    expect(r.log).not.toMatch(/BEVARES/);
  });

  it('GEN-SEED (spillet har begge) rører IKKE spil-dokumentet — kun kampene skrives', async () => {
    const db = fakeDb({ teams: SPIL_HOLD, eloCurrent: LEVENDE_ELO });
    const r = await koer(db);
    // Hele fejlen i ét tal: før var det 1 skrivning med teams + eloCurrent.
    expect(db.gameKald).toHaveLength(0);
    expect(db.batchKald).toHaveLength(2);
    expect(db.commits()).toBe(1);
    for (const k of db.batchKald) {
      expect(k.data).not.toHaveProperty('teams');
      expect(k.data).not.toHaveProperty('eloCurrent');
    }
    expect(r.dok.grund).toBe('bevar');
    expect(r.log).toMatch(/teams BEVARES \(spillet har 2 hold\)/);
    expect(r.log).toMatch(/eloCurrent BEVARES \(levende Elo for 2 hold\)/);
    expect(r.log).toMatch(/Kun kampe skrives/);
    expect(r.log).not.toMatch(/første seed/);
    expect(r.log).not.toMatch(/OVERSKRIVES/);
  });

  it('gen-seed prissætter nye kampe med SPILLETS holdliste, ikke filens', async () => {
    const db = fakeDb({ teams: SPIL_HOLD, eloCurrent: LEVENDE_ELO });
    await koer(db);
    const forventet = buildMatches(FX, SPIL_HOLD, SPORT_PROFILER.fodbold);
    expect(db.batchKald.map((k) => k.data.eloHome)).toEqual(forventet.map((m) => m.eloHome));
    expect(db.batchKald[0].data.eloHome).toBe(1850);
    expect(db.batchKald[0].data.odds).toEqual(forventet[0].odds);
    // Og IKKE med filens 1900 — det var de to ratings for samme hold.
    expect(db.batchKald[0].data.eloHome).not.toBe(1900);
  });

  it('gen-seed viser, at filen afviger fra spillet, og peger på de to veje', async () => {
    const db = fakeDb({ teams: SPIL_HOLD, eloCurrent: LEVENDE_ELO });
    const r = await koer(db, { skriv: false });
    expect(r.log).toMatch(/holdlisten i filen afviger fra spillets: 1 feltændringer, 0 hold kommer til, 0 forsvinder/);
    expect(r.log).toMatch(/--teams-only/);
    expect(r.log).toMatch(/--overskriv-hold/);
  });

  it('--overskriv-hold skriver teams og eloCurrent fra holdlisten, også når spillet har dem', async () => {
    const db = fakeDb({ teams: SPIL_HOLD, eloCurrent: LEVENDE_ELO });
    const r = await koer(db, { overskrivHold: true });
    expect(db.gameKald).toHaveLength(1);
    expect(db.gameKald[0].data).toEqual({
      teams: FIL_HOLD,
      eloCurrent: { Stærk: 1900, Svag: 1300 },
      updatedAt: 'NU',
    });
    expect(r.dok.grund).toBe('overskriv');
    expect(r.log).toMatch(/--overskriv-hold: teams \(2 hold\) og eloCurrent OVERSKRIVES/);
    // Forhåndsvisningen, det gamle seed manglede: hver feltændring vises.
    expect(r.log).toMatch(/Stærk {2}elo: 1850 → 1900/);
    expect(r.log).not.toMatch(/BEVARES/);
  });

  it('delvis: spillet har teams men ingen eloCurrent → kun eloCurrent, bygget af SPILLETS hold', async () => {
    const db = fakeDb({ teams: SPIL_HOLD });
    await koer(db);
    expect(db.gameKald).toHaveLength(1);
    expect(db.gameKald[0].data).toEqual({ eloCurrent: { Stærk: 1850, Svag: 1300 }, updatedAt: 'NU' });
  });

  it('delvis: spillet har eloCurrent men ingen teams → kun teams fra holdlisten', async () => {
    const db = fakeDb({ eloCurrent: LEVENDE_ELO });
    await koer(db);
    expect(db.gameKald).toHaveLength(1);
    expect(db.gameKald[0].data).toEqual({ teams: FIL_HOLD, updatedAt: 'NU' });
  });

  it('TØR-KØRSEL skriver intet — heller ikke ved første seed', async () => {
    for (const game of [{}, { teams: SPIL_HOLD, eloCurrent: LEVENDE_ELO }]) {
      const db = fakeDb(game);
      const r = await koer(db, { skriv: false });
      expect(db.gameKald).toHaveLength(0);
      expect(db.batchKald).toHaveLength(0);
      expect(db.commits()).toBe(0);
      expect(r.skrevet).toBe(false);
      expect(r.log).toMatch(/Tør-kørsel — der er IKKE skrevet noget/);
    }
  });
});

describe('koerFuldtSeed — vagterne', () => {
  it('et spil uden dokument afvises — også i tør-kørslen — og intet skrives', async () => {
    for (const skriv of [false, true]) {
      const db = fakeDb(null);
      await expect(koer(db, { skriv })).rejects.toThrow(/games\/sl-test findes ikke\. Kør seedGames først/);
      expect(db.gameKald).toHaveLength(0);
      expect(db.batchKald).toHaveLength(0);
    }
  });

  it('et hold, der kun står i filen, er ukendt for spillet ved et gen-seed — afvises under --skriv', async () => {
    const db = fakeDb({ teams: SPIL_HOLD, eloCurrent: LEVENDE_ELO });
    const nyFil = [...FIL_HOLD, { name: 'Ny', elo: 1500 }];
    const fx = [...FX, { round: 3, home: 'Ny', away: 'Svag', kickoff: '2026-08-15T17:00:00Z' }];
    await expect(koer(db, { teams: nyFil, fixtures: fx })).rejects.toThrow(/Ukendte holdnavne/);
    expect(db.gameKald).toHaveLength(0);
    expect(db.batchKald).toHaveLength(0);
  });

  it('… og tør-kørslen siger HVOR holdet mangler', async () => {
    const db = fakeDb({ teams: SPIL_HOLD, eloCurrent: LEVENDE_ELO });
    const fx = [...FX, { round: 3, home: 'Ny', away: 'Svag', kickoff: '2026-08-15T17:00:00Z' }];
    const r = await koer(db, { teams: [...FIL_HOLD, { name: 'Ny', elo: 1500 }], fixtures: fx, skriv: false });
    expect(r.log).toMatch(/findes IKKE i spillets holdliste \(games\/sl-test\.teams\)/);
    expect(r.log).toMatch(/^ {3}Ny$/m);
  });

  it('kampe med frosne odds springes over; spil-dokumentet røres stadig ikke', async () => {
    const db = fakeDb({ teams: SPIL_HOLD, eloCurrent: LEVENDE_ELO });
    const eks = new Map([[matchId(FX[0]), { odds: { 1: 1.5, X: 4, 2: 6 } }]]);
    const r = await koer(db, { eksisterende: eks });
    expect(r.medOdds).toBe(1);
    expect(db.batchKald.map((k) => k.id)).toEqual([matchId(FX[1])]);
    expect(db.gameKald).toHaveLength(0);
  });

  it('kickoff skrives som tidsstempel fra kickoffMs, ikke som streng', async () => {
    const db = fakeDb({});
    await koer(db);
    expect(db.batchKald[0].data.kickoff).toEqual({ ms: Date.UTC(2026, 7, 1, 17) });
  });

  it('et sat-men-ukendt sport afvises, før noget skrives', async () => {
    const db = fakeDb({ sport: 'handbold' });
    await expect(koer(db)).rejects.toThrow(/findes ikke i sportsprofilerne/);
    expect(db.gameKald).toHaveLength(0);
    expect(db.batchKald).toHaveLength(0);
  });
});
