import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { koerFuldtSeed } from './fuldtSeed.mjs';
import { OVERSKRIV_VEJ } from '../../src/lib/seedFootball.js';
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
    expect(r.log).toMatch(/Farver og stadion rettes med --teams-only \(seedTeams i workflowet\)/);
    expect(r.log).toContain(`Skal elo, kortkode eller antallet af hold ændres, hører det til ${OVERSKRIV_VEJ}.`);
    // --teams-only AFVISER en ændret kortkode (teamsVagt) — teksten må ikke
    // sende operatøren dertil med den.
    expect(r.log).not.toMatch(/kortkoder rettes med --teams-only/);
  });

  // Før stod kun ANTALLET («1 feltændringer») — operatøren skulle vælge mellem
  // --teams-only og --overskriv-hold uden at vide, om det var en farve eller
  // en elo. Listen vises nu i alle tilstande, ikke kun ved overskrivning.
  it('gen-seed viser HVER feltændring, ikke kun antallet', async () => {
    const spil = [...SPIL_HOLD.slice(0, 1), { ...SPIL_HOLD[1], color: '#333333' }, { name: 'Gammel', elo: 1400 }];
    const db = fakeDb({ teams: spil, eloCurrent: { ...LEVENDE_ELO, Gammel: 1400 } });
    const fil = [...FIL_HOLD, { name: 'Ny', elo: 1500 }];
    const r = await koer(db, { skriv: false, teams: fil });
    expect(r.dok.grund).toBe('bevar');
    expect(r.log).toMatch(/2 feltændringer, 1 hold kommer til, 1 forsvinder/);
    expect(r.log).toMatch(/^ {4}Stærk {2}elo: 1850 → 1900$/m);
    expect(r.log).toMatch(/^ {4}Svag {2}color: "#333333" → "#222222"$/m);
    expect(r.log).toMatch(/^ {4}hold der kommer til : Ny$/m);
    expect(r.log).toMatch(/^ {4}hold der forsvinder : Gammel$/m);
    expect(r.log).toMatch(/teams BEVARES/);
  });

  it('… og intet afvigende → ingen liste og ingen vej-tekst', async () => {
    const db = fakeDb({ teams: FIL_HOLD, eloCurrent: LEVENDE_ELO });
    const r = await koer(db, { skriv: false });
    expect(r.log).not.toMatch(/afviger fra spillets/);
    expect(r.log).not.toMatch(/--teams-only|--overskriv-hold/);
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
    // Vej-teksten hører til gen-seedet: her ER operatøren på den vej, og et
    // «kør med --overskriv-hold» midt i overskrivningen ville forvirre.
    expect(r.log).not.toMatch(/rettes med --teams-only|hører det til et fuldt seed/);
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
  // En DELVIS eloCurrent tæller som «har den» og bevares — men et hold uden
  // nøgle har ingen levende Elo. Det skal siges, ikke repareres af seedet.
  it('en eloCurrent, der mangler hold, bevares — men tør-kørslen siger hvilke', async () => {
    const db = fakeDb({ teams: SPIL_HOLD, eloCurrent: { Stærk: 1871 } });
    const r = await koer(db, { skriv: false });
    expect(r.dok.skrivElo).toBe(false);
    expect(r.log).toMatch(/⚠️ {2}eloCurrent mangler 1 af 2 hold: Svag\./);
    expect(r.log).toMatch(/Næste facit skriver eloCurrent for hvert hold/);
    // Ompris lover vi ikke som sikker vej: dens skriv-knap vises kun ved
    // odds-ændringer (GameScheduleTab.jsx).
    expect(r.log).toMatch(/kun når den har odds-ændringer at skrive/);
    // Og under --skriv røres spil-dokumentet stadig ikke.
    const db2 = fakeDb({ teams: SPIL_HOLD, eloCurrent: { Stærk: 1871 } });
    await koer(db2);
    expect(db2.gameKald).toHaveLength(0);
  });

  it('en komplet eloCurrent giver ingen advarsel', async () => {
    const r = await koer(fakeDb({ teams: SPIL_HOLD, eloCurrent: LEVENDE_ELO }), { skriv: false });
    expect(r.log).not.toMatch(/eloCurrent mangler/);
  });

  // teamElo giver START for en elo, der ikke er et endeligt tal — mens
  // recomputeSeasonElo læser `Number(t.elo) || start`. En streng-elo i
  // PRODUKTIONENS holdliste ville give to priser for samme hold.
  it('et hold med en elo, der ikke er et tal, afvises under --skriv — og tør-kørslen siger hvilket', async () => {
    const spil = [{ ...SPIL_HOLD[0], elo: '1850' }, SPIL_HOLD[1], { name: 'Uden kampe', elo: null }];
    const db = fakeDb({ teams: spil, eloCurrent: LEVENDE_ELO });
    const r = await koer(db, { skriv: false });
    expect(r.log).toMatch(/⚠️ {2}1 hold i spillets holdliste \(games\/sl-test\.teams\) har ingen elo, der er et tal:/);
    expect(r.log).toMatch(/^ {3}Stærk \("1850"\)$/m);
    // Et hold uden kampe prises aldrig og nævnes ikke i elo-advarslen.
    expect(r.log).not.toMatch(/^ {3}.*Uden kampe \(/m);
    await expect(koer(fakeDb({ teams: spil, eloCurrent: LEVENDE_ELO }))).rejects.toThrow(/Hold uden en elo, der er et tal/);
  });

  it('… også ved første seed, mod filens holdliste — og intet skrives', async () => {
    const db = fakeDb({});
    await expect(koer(db, { teams: [FIL_HOLD[0], { name: 'Svag' }] })).rejects.toThrow(/Hold uden en elo/);
    expect(db.gameKald).toHaveLength(0);
    expect(db.batchKald).toHaveLength(0);
    const r = await koer(fakeDb({}), { skriv: false, teams: [FIL_HOLD[0], { name: 'Svag' }] });
    expect(r.log).toMatch(/1 hold i holdlisten har ingen elo, der er et tal:\n {3}Svag \(—\)/);
  });

  it('gyldige tal-elo giver ingen advarsel', async () => {
    const r = await koer(fakeDb({}), { skriv: false });
    expect(r.log).not.toMatch(/ingen elo, der er et tal/);
  });

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

// Selve scriptet kræver en rigtig database, så dets LEDNING bevogtes som
// tekst. Mutationstesten fandt fire linjer, der kunne ændres med hele suiten
// grøn: opslaget, kombinationstjekket og de to flag, der sendes videre. En
// vagt, hvis kald er udækket, er ikke en vagt (samme fund som teamsOnly.mjs).
describe('seed-football.mjs — ledningen til opslaget, vagten og forløbet', () => {
  const kode = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../seed-football.mjs'), 'utf8')
    .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

  it('argumenterne går gennem opslaget og kombinationstjekket, før noget andet', () => {
    expect(kode).toMatch(/args = udfyldFraOpslag\(parseArgs\(process\.argv\.slice\(2\)\)\);\n\s*tjekFlagKombination\(args\.flags\);/);
  });

  it('flagene læses af argumenterne og sendes uændret til forløbet', () => {
    expect(kode).toMatch(/const SKRIV = args\.flags\.has\('skriv'\);/);
    expect(kode).toMatch(/const OVERSKRIV_HOLD = args\.flags\.has\('overskriv-hold'\);/);
    const kald = /await koerFuldtSeed\(\{([\s\S]*?)\}\);/.exec(kode)?.[1] ?? '';
    expect(kald).toMatch(/^\s*skriv: SKRIV,$/m);
    expect(kald).toMatch(/^\s*overskrivHold: OVERSKRIV_HOLD,$/m);
    expect(kald).not.toMatch(/: true,/);
  });

  // Mutationsfund (M39): linjen kunne fjernes med grøn suite. Den er den
  // eneste, der viser stien til kampprogrammet.
  it('loggen siger, hvilke filer opslaget gav — med kampprogrammets sti', () => {
    expect(kode).toMatch(/if \(args\.kilde === 'seed-filer'\) \{\n\s*console\.log\(`Filer fra scripts\/seed-filer\.mjs for \$\{GAME_ID\}: holdliste \$\{TEAMS_PATH\}, `\n\s*\+ `kampprogram \$\{FIXTURES_PATH\}/);
  });

  it('«Mangler argumenter» siger, når en egen fil slog opslaget fra', () => {
    expect(kode).toMatch(/const note = opslagSlaaetFra\(args\);\n\s*console\.error\(`\nMangler argumenter\.\$\{note \? `\\n\\n {2}\$\{note\}` : ''\}/);
  });
});
