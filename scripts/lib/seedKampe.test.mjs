import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { seedKampe, sportLinje } from './seedKampe.mjs';
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
describe('seed-football.mjs bruger seedKampe', () => {
  const kode = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../seed-football.mjs'), 'utf8')
    .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

  it('kampene bygges af seedKampe på den fulde plan og spillets egen reference', () => {
    expect(kode).toMatch(/await seedKampe\(\{ gameRef, fixtures: plan\.skriv, teams \}\)/);
  });

  it('scriptet kalder ikke buildMatches direkte og importerer det ikke', () => {
    expect(kode).not.toMatch(/buildMatches/);
  });

  it('sport-linjen bygges af det RÅ felt (sportLinje), ikke af den opløste profil alene', () => {
    // Linjen stod som `Sport: ${profil.sport}` og skrev "fodbold" for en
    // tastefejl. Nu kommer den fra sportLinje, der får sportRaa med.
    expect(kode).toMatch(/const \{ sportRaa, profil, matches \} = await seedKampe\(/);
    expect(kode).toMatch(/console\.log\(sportLinje\(\{ sportRaa, profil \}\)\)/);
    expect(kode).not.toMatch(/Sport: \$\{profil\.sport\}/);
  });

  it('en fejl fra seedKampe ender i exit ≠ 0 — run() fanges og afsluttes med 1', () => {
    expect(kode).toMatch(/\.catch\(\(err\) => \{ console\.error\('Seed-fejl:', err\.message\); process\.exit\(1\); \}\)/);
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
  });

  it('sportLinje viser det rå felt — og siger det, når feltet mangler', () => {
    const fodbold = SPORT_PROFILER.fodbold;
    expect(sportLinje({ sportRaa: undefined, profil: fodbold }))
      .toBe('Sport: fodbold (intet sport-felt på spillet → fodbold; hjemmebane 60, odds-gulv 1.1).');
    expect(sportLinje({ sportRaa: null, profil: fodbold })).toMatch(/intet sport-felt/);
    expect(sportLinje({ sportRaa: 'fodbold', profil: fodbold }))
      .toBe('Sport: fodbold (game.sport = "fodbold"; hjemmebane 60, odds-gulv 1.1).');
    expect(sportLinje({ sportRaa: 'proeve', profil: PROEVE }))
      .toBe('Sport: proeve (game.sport = "proeve"; hjemmebane 0, odds-gulv 1.01).');
  });

  describe('med en prøvesport på spillet', () => {
    medProeveSport();

    it('læser sporten AF SPIL-DOKUMENTET og prissætter med den', async () => {
      const { sportRaa, profil, matches } = await seedKampe({
        gameRef: ref({ sport: 'proeve' }), fixtures: FX, teams: TEAMS,
      });
      expect(sportRaa).toBe('proeve');
      expect(profil).toBe(PROEVE);
      // Prøvesportens odds (neutral bane, få uafgjorte, gulv 1,01) — fodbold
      // giver 1,15 / 9,21 / 51,23 for samme kamp.
      expect(matches[0].odds).toEqual({ 1: 1.07, X: 29.11, 2: 33.78 });
      // … og et ukendt hold får sportens neutrale rating, ikke fodboldens.
      expect(matches[1].eloHome).toBe(1000);
      expect(matches[2].eloAway).toBe(1000);
      expect(matches).toEqual(buildMatches(FX, TEAMS, PROEVE));
    });
  });
});
