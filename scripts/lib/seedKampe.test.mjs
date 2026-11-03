import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { seedKampe, sportLinje, loftLinje } from './seedKampe.mjs';
import { buildMatches } from '../../src/lib/superligaSeed.js';
import { SPORT_PROFILER } from '../../src/lib/superligaScoring.js';
import { PROEVE, medProeveSport } from '../../src/test/proeveSport.js';

// seed-football.mjs prissætter nye kampe med SPILLETS sportsprofil, læst af
// spil-dokumentet — samme felt, serveren omprisser med. Scriptet selv har
// ingen tests (det kræver en rigtig database), så beslutningen bor her.
const ref = (data) => ({ get: async () => ({ exists: data !== null, data: () => data }) });

const TEAMS = [{ name: 'Stærk', elo: 1900 }, { name: 'Svag', elo: 1300 }];
const FX = [
  { round: 1, home: 'Stærk', away: 'Svag' },
  { round: 1, home: 'Ukendt', away: 'Svag' },
  { round: 1, home: 'Svag', away: 'Ukendt' }, // ukendt UDEhold slås op for sig
];

// Selve scriptet kræver en rigtig database og kan ikke køres her, så dets
// LEDNING bevogtes som tekst: kampene skal gå gennem seedKampe (der læser
// spillets sport). Et direkte buildMatches(...) i scriptet gav fodboldens odds
// til alle spil, med hele denne fil grøn.
//
// Forløbet bor nu i scripts/lib/fuldtSeed.mjs (og køres med en fake Firestore
// i fuldtSeed.test.mjs). Tekstvagterne gælder derfor BEGGE filer: scriptet må
// kun kalde forløbet, og forløbet skal kalde seedKampe.
const laes = (fil) => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), fil), 'utf8')
  .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

describe('seed-football.mjs bruger seedKampe — via fuldtSeed.mjs', () => {
  const script = laes('../seed-football.mjs');
  const forloeb = laes('./fuldtSeed.mjs');

  it('scriptets fulde seed går gennem koerFuldtSeed', () => {
    expect(script).toMatch(/await koerFuldtSeed\(\{/);
  });

  it('kampene bygges af seedKampe på den fulde plan og spillets egen reference', () => {
    // `dok.prisHold`: den holdliste, spillet står med — filens ved første
    // seed, spillets egen ved et gen-seed (spilDokPlan).
    expect(forloeb).toMatch(/await seedKampe\(\{ gameRef, fixtures: plan\.skriv, teams: dok\.prisHold \}\)/);
  });

  it('hverken scriptet eller forløbet kalder buildMatches direkte', () => {
    expect(script).not.toMatch(/buildMatches/);
    expect(forloeb).not.toMatch(/buildMatches/);
  });

  it('sport-linjen bygges af det RÅ felt (sportLinje), ikke af den opløste profil alene', () => {
    // Linjen stod som `Sport: ${profil.sport}` og skrev "fodbold" for en
    // tastefejl. Nu kommer den fra sportLinje, der får sportRaa med.
    expect(forloeb).toMatch(/const \{ sportRaa, profil, matches \} = await seedKampe\(/);
    expect(forloeb).toMatch(/log\(sportLinje\(\{ sportRaa, profil \}\)\)/);
    expect(forloeb).not.toMatch(/Sport: \$\{profil\.sport\}/);
    expect(script).not.toMatch(/Sport: \$\{profil\.sport\}/);
  });

  it('en fejl fra seedKampe ender i exit ≠ 0 — run() fanges og afsluttes med 1', () => {
    expect(script).toMatch(/\.catch\(\(err\) => \{ console\.error\('Seed-fejl:', err\.message\); process\.exit\(1\); \}\)/);
  });
});

describe('seedKampe', () => {
  it('et spil uden sport — og et spil, der ikke findes endnu — seedes som fodbold', async () => {
    for (const data of [null, {}, { teams: TEAMS }, { sport: 'fodbold' }]) {
      const { profil, matches } = await seedKampe({ gameRef: ref(data), fixtures: FX, teams: TEAMS });
      expect(profil, JSON.stringify(data)).toBe(SPORT_PROFILER.fodbold);
      expect(matches).toEqual(buildMatches(FX, TEAMS));
    }
  });

  it('returnerer det RÅ game.sport ved siden af profilen', async () => {
    for (const [data, raa] of [[null, undefined], [{}, undefined], [{ sport: null }, null], [{ sport: 'fodbold' }, 'fodbold']]) {
      const { sportRaa, profil } = await seedKampe({ gameRef: ref(data), fixtures: FX, teams: TEAMS });
      expect(sportRaa, JSON.stringify(data)).toBe(raa);
      expect(profil).toBe(SPORT_PROFILER.fodbold);
    }
  });

  // Tastefejlen, QC fandt: sportProfil({sport:'handbold'}) giver fodbold, og
  // seedet skrev så kampene med hjemmebane 60 og gulv 1,1 — og linjen
  // "Sport: fodbold" så rigtig ud. Nu afvises den, FØR der er bygget en kamp.
  it('et SAT, men ukendt sport afvises med en dansk besked — også i tør-kørslen', async () => {
    for (const sport of ['handbold', 'Fodbold', '', 'toString', '__proto__', 123, ['fodbold']]) {
      await expect(
        seedKampe({ gameRef: ref({ sport }), fixtures: FX, teams: TEAMS }), JSON.stringify(sport),
      ).rejects.toThrow(/findes ikke i sportsprofilerne.*IKKE skrevet noget/);
    }
    await expect(seedKampe({ gameRef: ref({ sport: 'handbold' }), fixtures: FX, teams: TEAMS }))
      .rejects.toThrow(/sport "handbold"/);
    // Vejen ud skal virke: seedGames er tør-kørsel som default (D6), så
    // «kør seedGames» alene ville ikke rette noget.
    await expect(seedKampe({ gameRef: ref({ sport: 'handbold' }), fixtures: FX, teams: TEAMS }))
      .rejects.toThrow('Står sport i scripts/games.mjs, så ret det dér og kør seedGames — først som tør-kørsel, '
        + 'så med seedGamesSkriv; skal feltet væk (fodbold), så fjern det i Firebase-konsollen — seedGames kan ikke fjerne et felt.');
    // Den RÅ værdi — ikke String(...). Et array ['fodbold'] stod før som
    // sport "fodbold" i fejlen, altså som netop den sport, det IKKE er; og en
    // tom streng skal stå som "", ikke forsvinde.
    await expect(seedKampe({ gameRef: ref({ sport: ['fodbold'] }), fixtures: FX, teams: TEAMS }))
      .rejects.toThrow(/sport \["fodbold"\], men/);
    await expect(seedKampe({ gameRef: ref({ sport: '' }), fixtures: FX, teams: TEAMS }))
      .rejects.toThrow(/sport "", men/);
    await expect(seedKampe({ gameRef: ref({ sport: 123 }), fixtures: FX, teams: TEAMS }))
      .rejects.toThrow(/sport 123, men/);
    // JSON.stringify(NaN) er "null": fejlen sagde "sport null" om et SAT felt.
    for (const [sport, vist] of [[NaN, /sport NaN, men/], [Infinity, /sport Infinity, men/]]) {
      const fejl = await seedKampe({ gameRef: ref({ sport }), fixtures: FX, teams: TEAMS }).catch((e) => e);
      expect(fejl.message, String(sport)).toMatch(vist);
      expect(fejl.message, String(sport)).not.toMatch(/sport null/);
    }
  });

  it('sportLinje viser det rå felt — og siger det, når feltet mangler', () => {
    const fodbold = SPORT_PROFILER.fodbold;
    expect(sportLinje({ sportRaa: undefined, profil: fodbold }))
      .toBe('Sport: fodbold (intet sport-felt på spillet → fodbold; hjemmebane 60, odds-gulv 1.1, odds-loft intet (null)).');
    expect(sportLinje({ sportRaa: null, profil: fodbold })).toMatch(/intet sport-felt/);
    // Grenen er PRÆCIST undefined/null. En tom streng, 0 og false er SATTE
    // værdier (seedKampe kaster for dem) — med `!sportRaa` stod de som
    // "intet sport-felt", altså som et spil, der bevidst er fodbold.
    expect(sportLinje({ sportRaa: '', profil: fodbold }))
      .toBe('Sport: fodbold (game.sport = ""; hjemmebane 60, odds-gulv 1.1, odds-loft intet (null)).');
    for (const sportRaa of [0, false]) {
      expect(sportLinje({ sportRaa, profil: fodbold }), String(sportRaa)).not.toMatch(/intet sport-felt/);
      expect(sportLinje({ sportRaa, profil: fodbold })).toContain(`game.sport = ${sportRaa}`);
    }
    expect(sportLinje({ sportRaa: 'fodbold', profil: fodbold }))
      .toBe('Sport: fodbold (game.sport = "fodbold"; hjemmebane 60, odds-gulv 1.1, odds-loft intet (null)).');
    expect(sportLinje({ sportRaa: 'proeve', profil: PROEVE }))
      .toBe('Sport: proeve (game.sport = "proeve"; hjemmebane 0, odds-gulv 1.01, odds-loft 20).');
    // Linjen må ALDRIG skjule det rå felt bag profilens navn — heller ikke,
    // hvis den en dag kaldes uden om seedKampes vagt. Det var præcis fejlen:
    // "Sport: fodbold" for et spil med sport 'handbold'.
    expect(sportLinje({ sportRaa: 'handbold', profil: fodbold }))
      .toBe('Sport: fodbold (game.sport = "handbold"; hjemmebane 60, odds-gulv 1.1, odds-loft intet (null)).');
    // Håndbold: loftet står som tallet — og en profil UDEN nøglen står ikke som «intet».
    expect(sportLinje({ sportRaa: 'haandbold', profil: SPORT_PROFILER.haandbold }))
      .toBe('Sport: haandbold (game.sport = "haandbold"; hjemmebane 0, odds-gulv 1.01, odds-loft 25).');
    expect(sportLinje({ sportRaa: 'x', profil: { sport: 'x', elo: { HFA: 0 }, odds: { min: 1.01 } } }))
      .toContain('odds-loft undefined).');
  });

  // Tør-kørslen siger, hvad loftet GØR ved de kampe, der skal skrives — og
  // intet for en sport uden loft (SL/PL: ingen ny linje).
  it('loftLinje tæller udfaldene til loftet — og er null uden loft', () => {
    const hold = [{ name: 'Stærk', elo: 1900 }, { name: 'Svag', elo: 1300 }, { name: 'Lige', elo: 1500 }];
    const fx = [{ round: 1, home: 'Stærk', away: 'Svag' }, { round: 1, home: 'Svag', away: 'Stærk' }, { round: 1, home: 'Lige', away: 'Lige' }];
    const hb = SPORT_PROFILER.haandbold;
    const matches = buildMatches(fx, hold, hb);
    // Fair pris for Svag er over 25 (uden loft): det er det, der klippes.
    const raa = buildMatches(fx, hold, { ...hb, odds: { min: 1.01, max: null } });
    expect(raa[0].odds['2']).toBeGreaterThan(25);
    expect(matches[0].odds['2']).toBe(25);
    expect(loftLinje({ profil: hb, matches }))
      .toBe('Odds-loft 25: 2 udfald i 2 af 3 kampe står til loftet (fair pris over 25).');
    expect(loftLinje({ profil: SPORT_PROFILER.fodbold, matches: buildMatches(fx, hold) })).toBeNull();
    expect(loftLinje({ profil: hb, matches: [] })).toBe('Odds-loft 25: 0 udfald i 0 af 0 kampe står til loftet (fair pris over 25).');
  });

  describe('med en prøvesport på spillet', () => {
    medProeveSport();

    it('læser sporten AF SPIL-DOKUMENTET og prissætter med den', async () => {
      const { sportRaa, profil, matches } = await seedKampe({
        gameRef: ref({ sport: 'proeve' }), fixtures: FX, teams: TEAMS,
      });
      expect(sportRaa).toBe('proeve');
      expect(profil).toBe(PROEVE);
      // Prøvesportens odds (neutral bane, få uafgjorte, gulv 1,01, loft 20:
      // fair X 29,11 og 2 33,78 klippes) — fodbold giver 1,15 / 9,21 / 51,23.
      expect(matches[0].odds).toEqual({ 1: 1.07, X: 20, 2: 20 });
      // … og et ukendt hold får sportens neutrale rating, ikke fodboldens.
      expect(matches[1].eloHome).toBe(1000);
      expect(matches[2].eloAway).toBe(1000);
      expect(matches).toEqual(buildMatches(FX, TEAMS, PROEVE));
    });
  });
});
