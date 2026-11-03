// ---------------------------------------------------------------------------
// Sportsprofilen (sportProfil) — klientsiden.
//
// Tre ting skal bevises, og de er forskellige:
//   1. INGENTING FLYTTER SIG for Superligaen og Premier League. Bevist mod et
//      facit, koden FØR profilen skrev (functions-platform/testdata/
//      sportprofil-golden.json, se scripts/sportprofil-golden.mjs) — byte for
//      byte på hele programmet, ikke på et udvalgt par.
//   2. Profilen er korrekt i sig selv: ukendt sport → fodbold, frosset,
//      bygget af ELO/ODDS, og hjemmebane 0 giver et symmetrisk spil.
//   3. HVERT KALDESTED BRUGER SPILLETS PROFIL. Det kan kun ses med en profil,
//      der adskiller sig fra fodbold — se src/test/proeveSport.js.
// ---------------------------------------------------------------------------
import { describe, it, expect } from 'vitest';
import {
  ELO, ODDS, OUTCOME, SPORT_PROFILER, STANDARD_SPORT, sportProfil, ukendtSport, oddsParametre, eloParametre,
  outcomeOdds, outcomeProbabilities, fairOdds, updateElo, SPORT_ORD, sportOrd,
  SPORT_EVNER, sportEvner, harHjemmebane,
} from './superligaScoring';
import { buildMatch, buildMatches, teamElo } from './superligaSeed';
import { pointModForventning } from '../features/games/football/holdStatistik';
import { SUPERLIGA_TEAMS_2026 } from '../data/superligaTeams2026';
import { PREMIER_LEAGUE_TEAMS_2026 } from '../data/premierLeagueTeams2026';
import golden from '../../functions-platform/testdata/sportprofil-golden.json';
import slProgram from '../../scripts/superliga-fixtures.json';
import plProgram from '../../scripts/premier-league-fixtures-2627.json';
import { goldenKampe } from '../../scripts/lib/sportprofilGolden.mjs';
import hbProgram from '../../scripts/haandbold-vm2027-program.json';
import { HAANDBOLD_VM2027_HOLD } from '../data/haandboldVm2027Hold';
import { PROEVE, medProeveSport } from '../test/proeveSport';

const program = (d) => (Array.isArray(d) ? d : d.fixtures);
const LIGAER = {
  sl: { fixtures: program(slProgram), teams: SUPERLIGA_TEAMS_2026 },
  pl: { fixtures: program(plProgram), teams: PREMIER_LEAGUE_TEAMS_2026 },
};

/** Samme form som facit: id → [1, X, 2, eloHome, eloAway]. */
function somFacit(kampe) {
  const ud = {};
  for (const m of kampe) ud[m.id] = [m.odds['1'], m.odds.X, m.odds['2'], m.eloHome, m.eloAway];
  return ud;
}

describe('sportProfil — hvilken profil et spil får', () => {
  it('fodbold er standarden; håndbold er den eneste anden profil', () => {
    expect(STANDARD_SPORT).toBe('fodbold');
    // VENDT I D4: her stod en fraværs-assertion (['fodbold']), indtil
    // håndboldens tal var målt (scripts/maal-haandbold.mjs).
    expect(Object.keys(SPORT_PROFILER)).toEqual(['fodbold', 'haandbold']);
    expect(sportProfil({ sport: 'haandbold' })).toBe(SPORT_PROFILER.haandbold);
    expect(sportProfil({ sport: 'haandbold' })).not.toBe(SPORT_PROFILER.fodbold);
  });

  it('manglende, ukendt eller ugyldig sport giver fodbold', () => {
    const fodbold = SPORT_PROFILER.fodbold;
    for (const game of [
      undefined, null, {}, { sport: undefined }, { sport: null }, { sport: '' },
      { sport: 'curling' },        // ukendt — må ikke give en tom profil
      { sport: 'handbold' }, { sport: 'Haandbold' }, { sport: 'håndbold' }, // næsten-håndbold er IKKE håndbold
      { sport: 'Fodbold' },        // store bogstaver er en anden nøgle
      { sport: 123 }, { sport: ['fodbold'] }, { sport: { fodbold: true } },
      // Navne, der findes på ETHVERT objekt. Et naivt `SPORT_PROFILER[sport]`
      // ville give en funktion eller Object.prototype i stedet for en profil.
      { sport: 'toString' }, { sport: '__proto__' }, { sport: 'constructor' }, { sport: 'hasOwnProperty' },
    ]) {
      expect(sportProfil(game), JSON.stringify(game)).toBe(fodbold);
    }
    expect(sportProfil()).toBe(fodbold);
    expect(sportProfil({ sport: 'fodbold' })).toBe(fodbold);
  });

  it('fodbold er bygget AF ELO og ODDS — og har dagens tal', () => {
    const p = sportProfil();
    expect(p).toEqual({ sport: 'fodbold', elo: { ...ELO }, odds: { min: ODDS.MIN, max: null } });
    // En KOPI: profilen fryses hele vejen ned, og delte den objekt med ELO,
    // blev konstanten selv frosset — og scripts/maal-*.mjs, der læser den, med.
    expect(p.elo).not.toBe(ELO);
    expect(Object.isFrozen(ELO)).toBe(false);
    // Literaler: profilen må ikke kunne flytte sig sammen med konstanterne,
    // uden at noget bliver rødt. Ændres modellen med vilje, ændres de her.
    expect(p.elo).toEqual({ START: 1500, HFA: 60, K: 20, DRAW_BASE: 0.305, DRAW_DECAY: 0.55 });
    // max: null = BEVIDST intet loft (loftet på 6 blev fjernet). NØGLEN skal
    // stå — toEqual skelner ikke en manglende nøgle fra undefined, så det
    // kræves for sig.
    expect(p.odds).toEqual({ min: 1.1, max: null });
    expect(Object.prototype.hasOwnProperty.call(p.odds, 'max')).toBe(true);
    expect(p.odds.max).toBeNull();
  });

  it('profilen er frosset hele vejen ned', () => {
    // Profilen deles af alle spil i samme proces. En kalder, der skrev
    // `profil.elo.HFA = 0`, ville give alle de andre neutral bane.
    const p = sportProfil();
    expect(Object.isFrozen(p)).toBe(true);
    expect(Object.isFrozen(p.elo)).toBe(true);
    expect(Object.isFrozen(p.odds)).toBe(true);
    expect(() => { p.elo.HFA = 0; }).toThrow(TypeError);
    expect(() => { p.odds.min = 1; }).toThrow(TypeError);
    expect(sportProfil().elo.HFA).toBe(60);
  });

  it('oversætter profilen til de parametre, odds og Elo tager', () => {
    expect(oddsParametre(sportProfil())).toEqual({ hfa: 60, drawBase: 0.305, drawDecay: 0.55, oddsMin: 1.1, oddsMax: null });
    expect(eloParametre(sportProfil())).toEqual({ hfa: 60, k: 20 });
    expect(oddsParametre()).toEqual(oddsParametre(sportProfil()));
    expect(eloParametre()).toEqual(eloParametre(sportProfil()));
    // HVERT felt skal komme fra profilen — med en profil, hvor alle tal er
    // andre, så et byttet eller hardkodet felt ikke kan gemme sig.
    expect(oddsParametre(PROEVE)).toEqual({ hfa: 0, drawBase: 0.05, drawDecay: 0.2, oddsMin: 1.01, oddsMax: 20 });
    expect(eloParametre(PROEVE)).toEqual({ hfa: 0, k: 40 });
  });
});

// --- Et SAT, men ukendt sport er en tastefejl, ikke fodbold ------------------
// sportProfil falder tavst tilbage (serveren må ikke gå i stå i drift), så
// skrivevejene spørger ukendtSport og afviser (scripts/lib/seedKampe.mjs og
// repriceGameOdds via afvisUkendtSport), og triggeren advarer (recomputeSeasonElo). Mangler feltet, er det fodbold MED
// VILJE — SL og PL har intet felt og må aldrig blive "ukendte".
describe('ukendtSport — sat, men ikke i registret', () => {
  it('manglende felt er IKKE ukendt (SL og PL)', () => {
    for (const game of [undefined, null, {}, { sport: undefined }, { sport: null }, { teams: [] }]) {
      expect(ukendtSport(game), JSON.stringify(game)).toBe(false);
    }
    expect(ukendtSport({ sport: 'fodbold' })).toBe(false);
  });

  it('en tastefejl, et forkert bogstav, en tom streng og ikke-strenge ER ukendte', () => {
    for (const sport of ['handbold', 'Haandbold', 'håndbold', 'Fodbold', '', ' fodbold', 0, 123, false, ['fodbold'], ['haandbold'], { fodbold: true }]) {
      expect(ukendtSport({ sport }), JSON.stringify(sport)).toBe(true);
    }
  });

  it('haandbold er KENDT, siden profilen blev målt (D4) — seed og Ompris afviser den ikke længere', () => {
    expect(ukendtSport({ sport: 'haandbold' })).toBe(false);
  });

  it('prototype-navne er ukendte — de findes på ethvert objekt, ikke i registret', () => {
    for (const sport of ['toString', '__proto__', 'constructor', 'hasOwnProperty', 'valueOf']) {
      expect(ukendtSport({ sport }), sport).toBe(true);
    }
  });

  describe('med en prøvesport registreret', () => {
    medProeveSport();
    it('en registreret sport er kendt — og sportProfil er enig', () => {
      expect(ukendtSport({ sport: 'proeve' })).toBe(false);
      expect(sportProfil({ sport: 'proeve' })).toBe(PROEVE);
      // Kun en STRENG tæller: et array, der bliver til nøglen 'proeve', er ukendt.
      expect(ukendtSport({ sport: ['proeve'] })).toBe(true);
    });
  });
});

// --- Profilernes FORM -------------------------------------------------------
// En profil med en stavefejl i en nøgle får ikke en fejl, men fodboldens tal:
// `odds: {minimum: 1.01}` gav før oddsMin = undefined, og så gav outcomeOdds
// tavst 1,1. Formen bevises her over HELE registret — også en profil, der
// lægges til i delopgave 4, uden at nogen husker at skrive en test for den.
// Formkontrollen er skrevet i testen (ikke importeret), så den ikke kan
// arve en fejl fra koden, den efterprøver.
function profilFormFejl(navn, p) {
  const fejl = [];
  if (!p || typeof p !== 'object') return ['ikke et objekt'];
  const noegler = Object.keys(p).sort();
  if (JSON.stringify(noegler) !== JSON.stringify(['elo', 'odds', 'sport'])) fejl.push(`nøgler ${noegler}`);
  if (p.sport !== navn) fejl.push(`sport ${String(p.sport)} ≠ ${navn}`);
  const eloNoegler = Object.keys(p.elo || {}).sort();
  if (JSON.stringify(eloNoegler) !== JSON.stringify(Object.keys(ELO).sort())) fejl.push(`elo-nøgler ${eloNoegler}`);
  for (const k of Object.keys(ELO)) {
    if (!Number.isFinite(p.elo?.[k])) fejl.push(`elo.${k} ${String(p.elo?.[k])}`);
  }
  // VENDT (odds-loftet, §11-tillæg 4): her stod præcis ['min']. Nu skal BEGGE
  // nøgler stå — også i fodbold, hvor max er null. En manglende max-nøgle er
  // en stavefejl (samme fælde som {minimum}), ikke «intet loft».
  const oddsNoegler = Object.keys(p.odds || {}).sort();
  if (JSON.stringify(oddsNoegler) !== JSON.stringify(['max', 'min'])) fejl.push(`odds-nøgler ${oddsNoegler}`);
  if (!(Number.isFinite(p.odds?.min) && p.odds.min > 1)) fejl.push(`odds.min ${String(p.odds?.min)}`);
  const max = p.odds?.max;
  if (!(max === null || (Number.isFinite(max) && max > p.odds?.min))) fejl.push(`odds.max ${String(max)}`);
  return fejl;
}

describe('hver sportsprofil har præcis den forventede form', () => {
  it('hele registret — og prøvesporten, der bruges som stand-in for en anden sport', () => {
    // Ikke tomt: et tomt register ville gøre løkken grøn uden at se noget.
    expect(Object.keys(SPORT_PROFILER).length).toBeGreaterThan(0);
    for (const [navn, p] of Object.entries(SPORT_PROFILER)) {
      expect(profilFormFejl(navn, p), navn).toEqual([]);
    }
    expect(profilFormFejl('proeve', PROEVE)).toEqual([]);
  });

  it('formkontrollen fanger de stavefejl, den er skrevet til (ellers beviser den ikke noget)', () => {
    const god = { sport: 'x', elo: { ...ELO }, odds: { min: 1.01, max: null } };
    expect(profilFormFejl('x', god)).toEqual([]);
    // Et loft er gyldigt — VENDT: { min: 1.01, max: 6 } stod nedenfor som «en
    // ekstra nøgle, ingen kode læser». Nu læser prisningen den.
    expect(profilFormFejl('x', { ...god, odds: { min: 1.01, max: 6 } })).toEqual([]);
    expect(profilFormFejl('x', { ...god, odds: { min: 1.01, max: 25 } })).toEqual([]);
    const daarlige = [
      { ...god, odds: { minimum: 1.01, max: null } }, // stavefejl — gav tavst fodboldens 1,1
      { ...god, odds: { min: null, max: null } },
      { ...god, odds: { min: NaN, max: null } },
      { ...god, odds: { min: 1, max: null } },        // et ramt tip må ikke kunne betale indsatsen
      { ...god, odds: { min: '1.01', max: null } },
      { ...god, odds: { min: 1.01 } },                // max-nøglen mangler: ikke «intet loft», en glemt nøgle
      { ...god, odds: { min: 1.01, maks: 25 } },      // stavefejl — ville tavst give intet loft
      { ...god, odds: { min: 1.01, max: undefined } },
      { ...god, odds: { min: 1.01, max: NaN } },
      { ...god, odds: { min: 1.01, max: '25' } },
      { ...god, odds: { min: 1.01, max: 1.01 } },     // loft = gulv: alle udfald samme pris
      { ...god, odds: { min: 1.01, max: Infinity } }, // «intet loft» staves null
      { ...god, odds: { min: 1.01, max: null, ekstra: 1 } },
      { ...god, elo: { ...ELO, HFA: undefined } },
      { ...god, elo: { START: 1500, HFA: 0, K: 20, DRAW_BASE: 0.1 } }, // DRAW_DECAY mangler → fodboldens
      { ...god, elo: { ...ELO, hfa: 0 } },          // lille h: en ny nøgle, HFA står stadig på 60
      { ...god, sport: 'y' },                       // navn og nøgle uenige
      { elo: { ...ELO }, odds: { min: 1.01 } },     // sport mangler
      { ...god, ekstra: true },
    ];
    for (const p of daarlige) expect(profilFormFejl('x', p), JSON.stringify(p)).not.toEqual([]);
  });

  it('oddsParametre AFVISER et gulv, der ikke er et endeligt tal over 1 — i stedet for at falde tavst tilbage', () => {
    // Uden vagten: manglende → fodboldens 1,1; null → INTET gulv
    // (Math.max(null, x) = x); NaN → NaN-odds. Alle tre tavse.
    const elo = { ...ELO };
    for (const odds of [{ minimum: 1.01 }, { min: null }, { min: undefined }, { min: NaN }, { min: Infinity },
      { min: 1 }, { min: 0.5 }, { min: '1.01' }, {}, undefined]) {
      expect(() => oddsParametre({ sport: 'x', elo, odds }), JSON.stringify(odds)).toThrow(/odds-gulv/);
    }
    // Beskeden er det eneste, der står i loggen/CI, når en profil er forkert: den
    // skal nævne SPORTEN og den RÅ værdi — ikke bare «odds-gulv». (Mutant: sporten
    // eller værdien udeladt overlevede, fordi testen over kun matchede /odds-gulv/.)
    expect(() => oddsParametre({ sport: 'haandbold', elo, odds: { min: NaN } }))
      .toThrow('Sportsprofilen "haandbold" har intet gyldigt odds-gulv (odds.min = NaN).');
    expect(() => oddsParametre({ sport: 'x', elo, odds: { minimum: 1.01 } }))
      .toThrow('Sportsprofilen "x" har intet gyldigt odds-gulv (odds.min = undefined).');
    expect(() => oddsParametre({ sport: 'x', elo, odds: { min: 1 } }))
      .toThrow('(odds.min = 1).');
    // Det, der skal virke, virker — også lige over 1.
    expect(oddsParametre({ sport: 'x', elo, odds: { min: 1.01, max: null } }).oddsMin).toBe(1.01);
    expect(oddsParametre({ sport: 'x', elo, odds: { min: 1.0001, max: null } }).oddsMin).toBe(1.0001);
  });

  // LOFTET. Samme vagt: en manglende nøgle eller et forkert tal giver ellers
  // TAVST intet loft (outcomeOdds læser oddsMax ?? null).
  it('oddsParametre AFVISER et loft, der hverken er null eller et endeligt tal over gulvet', () => {
    const elo = { ...ELO };
    for (const odds of [{ min: 1.01 }, { min: 1.01, maks: 25 }, { min: 1.01, max: undefined }, { min: 1.01, max: NaN },
      { min: 1.01, max: Infinity }, { min: 1.01, max: '25' }, { min: 1.01, max: 1.01 }, { min: 1.1, max: 1.05 }, { min: 1.01, max: 0 }]) {
      expect(() => oddsParametre({ sport: 'x', elo, odds }), JSON.stringify(odds)).toThrow(/odds-loft/);
    }
    expect(() => oddsParametre({ sport: 'haandbold', elo, odds: { min: 1.01 } }))
      .toThrow('Sportsprofilen "haandbold" har intet gyldigt odds-loft (odds.max = mangler; null = intet loft).');
    expect(() => oddsParametre({ sport: 'x', elo, odds: { min: 1.01, max: undefined } }))
      .toThrow('Sportsprofilen "x" har intet gyldigt odds-loft (odds.max = undefined; null = intet loft).');
    expect(() => oddsParametre({ sport: 'x', elo, odds: { min: 1.01, max: 1.01 } })).toThrow('(odds.max = 1.01;');
    // Det gyldige: null (intet loft) og et tal lige over gulvet.
    expect(oddsParametre({ sport: 'x', elo, odds: { min: 1.01, max: null } }).oddsMax).toBeNull();
    expect(oddsParametre({ sport: 'x', elo, odds: { min: 1.01, max: 1.02 } }).oddsMax).toBe(1.02);
    expect(oddsParametre({ sport: 'x', elo, odds: { min: 1.01, max: 25 } }).oddsMax).toBe(25);
  });
});

describe('hjemmebane 0 giver et symmetrisk spil', () => {
  const neutral = { ...sportProfil(), elo: { ...sportProfil().elo, HFA: 0 } };

  it('byttes holdene, byttes 1 og 2 — og X står stille', () => {
    for (const [a, b] of [[1500, 1500], [1600, 1450], [1390, 1620], [1900, 1200]]) {
      const ud = outcomeOdds({ eloHome: a, eloAway: b, ...oddsParametre(neutral) });
      const ind = outcomeOdds({ eloHome: b, eloAway: a, ...oddsParametre(neutral) });
      expect(ud[OUTCOME.HOME], `${a}-${b}`).toBe(ind[OUTCOME.AWAY]);
      expect(ud[OUTCOME.AWAY], `${a}-${b}`).toBe(ind[OUTCOME.HOME]);
      expect(ud[OUTCOME.DRAW], `${a}-${b}`).toBe(ind[OUTCOME.DRAW]);
    }
  });

  it('lige hold giver 1 = 2 — og det gør fodbold IKKE', () => {
    // Uden modprøven ville testen også bestå, hvis hfa slet ikke blev sendt
    // videre — så ville fodbold jo bare også være symmetrisk.
    const lige = outcomeOdds({ eloHome: 1500, eloAway: 1500, ...oddsParametre(neutral) });
    expect(lige['1']).toBe(lige['2']);
    const fodbold = outcomeOdds({ eloHome: 1500, eloAway: 1500, ...oddsParametre(sportProfil()) });
    expect(fodbold['1']).toBeLessThan(fodbold['2']);
  });

  it('Elo: hjemmesejr mellem lige hold giver præcis K/2 hver vej', () => {
    expect(updateElo(1500, 1500, 1, eloParametre(neutral))).toEqual({ home: 1510, away: 1490 });
    // Fodbold: hjemmeholdet var ventet at vinde, så det får mindre end K/2.
    expect(updateElo(1500, 1500, 1, eloParametre(sportProfil())).home).toBeLessThan(1510);
  });
});

describe('odds-gulvet er en profilværdi', () => {
  it('outcomeOdds bruger oddsMin — og fodbold-gulvet, når det mangler', () => {
    // p(1) = 0,936 med få uafgjorte og stor styrkeforskel → fair 1,068.
    const args = { eloHome: 1900, eloAway: 1300, hfa: 0, drawBase: 0.05, drawDecay: 0.2 };
    expect(outcomeProbabilities(args)['1']).toBeGreaterThan(1 / ODDS.MIN);
    expect(outcomeOdds({ ...args, oddsMin: 1.01 })['1']).toBe(1.07);
    expect(outcomeOdds(args)['1']).toBe(1.1);
  });

  // 0,936 i ODDS-kommentaren (superligaScoring.js) er ET EKSEMPEL, ikke et
  // loft. Med drawBase 0,05 og drawDecay 0,2 stiger p(1) med styrkeforskellen
  // mod 1 − 0,05·e^(−0,4) ≈ 0,966 — og når aldrig dertil.
  it('0,936 er et eksempel (1900 mod 1300), ikke et loft — p stiger mod ≈ 0,966', () => {
    const p = (eloHome, eloAway) => outcomeProbabilities({ eloHome, eloAway, hfa: 0, drawBase: 0.05, drawDecay: 0.2 })['1'];
    expect(p(1900, 1300)).toBeCloseTo(0.936, 3);
    const graense = 1 - 0.05 * Math.exp(-0.4);
    expect(p(2500, 1000)).toBeGreaterThan(0.95);
    expect(p(4000, 1000)).toBeGreaterThan(p(2500, 1000));
    expect(p(4000, 1000)).toBeLessThan(graense);
    expect(graense - p(6000, 1000)).toBeLessThan(1e-4);
  });

  it('… også for UDE-favoritten', () => {
    // Spejlet: 1300 mod 1900 på neutral bane. Hvert udfald har sit eget
    // fairOdds-kald, så gulvet skal bevises på '2' for sig — et kald, der
    // glemte oddsMin dér, gav 1,1 i stedet for 1,07 med alle andre tests grønne.
    const args = { eloHome: 1300, eloAway: 1900, hfa: 0, drawBase: 0.05, drawDecay: 0.2 };
    expect(outcomeProbabilities(args)['2']).toBeGreaterThan(1 / ODDS.MIN);
    expect(outcomeOdds({ ...args, oddsMin: 1.01 })['2']).toBe(1.07);
    expect(outcomeOdds(args)['2']).toBe(1.1);
  });

  it('… også for uafgjort (X har sit eget fairOdds-kald)', () => {
    // X ligger altid omkring 3-4 i odds, så et almindeligt gulv (1,1) binder
    // aldrig dér — et kald, der glemte oddsMin på X, ville være usynligt. Et
    // gulv over X's fair pris (≈ 3,3) viser det: alle tre udfald skal hæves.
    const args = { eloHome: 1500, eloAway: 1500, hfa: 0, drawBase: 0.305, drawDecay: 0.55 };
    expect(outcomeOdds(args).X).toBeLessThan(5);
    expect(outcomeOdds({ ...args, oddsMin: 5 })).toEqual({ 1: 5, X: 5, 2: 5 });
  });

  it('fairOdds tager gulvet som argument', () => {
    expect(fairOdds(0.99, 1.01)).toBe(1.01);
    expect(fairOdds(0.99)).toBe(1.1);
    expect(fairOdds(0, 1.01)).toBe(ODDS.UGYLDIG);
  });
});

// --- 1. Ingenting flytter sig: facit fra koden FØR profilen --------------------
describe('SL og PL er byte-identiske med koden før sportsprofilen', () => {
  it('facit dækker hele programmet', () => {
    // Et tomt eller afkortet facit ville gøre sammenligningerne nedenfor tomme
    // og grønne.
    expect(Object.keys(golden.sl.seedet)).toHaveLength(132);
    expect(Object.keys(golden.pl.seedet)).toHaveLength(380);
    expect(Object.keys(golden.pl.forventning)).toHaveLength(20);
  });

  for (const [liga, { fixtures, teams }] of Object.entries(LIGAER)) {
    it(`${liga}: de frosne odds ved seed er uændrede — uanset hvordan "fodbold" nås`, () => {
      expect(somFacit(buildMatches(fixtures, teams))).toEqual(golden[liga].seedet);
      for (const game of [{}, { sport: 'fodbold' }, { sport: 'curling' }, null]) {
        expect(somFacit(buildMatches(fixtures, teams, sportProfil(game))), JSON.stringify(game))
          .toEqual(golden[liga].seedet);
      }
    });

    it(`${liga}: Holdsidens "mod modellens forventning" er uændret`, () => {
      const seedElo = Object.fromEntries(teams.map((t) => [t.name, t.elo]));
      const historik = Object.entries(golden[liga].eloHistory)
        .map(([round, elo]) => ({ round: Number(round), elo }));
      const spillede = goldenKampe(buildMatches(fixtures, teams)).filter((m) => m.result);
      for (const t of teams) {
        const uden = pointModForventning(spillede, t.name, historik, seedElo);
        const med = pointModForventning(spillede, t.name, historik, seedElo, sportProfil({}));
        const facit = golden[liga].forventning[t.name];
        expect([uden.faktiske, uden.ventede, uden.forskel, uden.kampe], t.name).toEqual(facit);
        expect([med.faktiske, med.ventede, med.forskel, med.kampe], t.name).toEqual(facit);
      }
    });
  }
});

// --- Håndboldprofilen (D4): målt, ikke skrevet af ---------------------------
// Tallene og deres begrundelse står ved SPORT_PROFILER.haandbold; at de ER
// målingens, efterprøves i scripts/lib/haandboldMaaling.test.mjs. Her: at
// profilen når frem gennem sportProfil for et spil med sport:'haandbold', og
// hvad den gør ved oddsene. BÅNDENE er røde for fodboldens værdier.
describe('håndboldprofilen — gennem sportProfil for et spil med sport:\'haandbold\'', () => {
  const HB = { id: 'hvm2027', type: 'football', sport: 'haandbold' };
  const p = sportProfil(HB);

  it('literalerne, frosset hele vejen ned', () => {
    // odds.max 25: ejerens valg (§11-tillæg 4).
    expect(p).toEqual({ sport: 'haandbold', elo: { START: 1500, HFA: 0, K: 120, DRAW_BASE: 0.157, DRAW_DECAY: 0.55 }, odds: { min: 1.01, max: 25 } });
    expect(Object.isFrozen(p) && Object.isFrozen(p.elo) && Object.isFrozen(p.odds)).toBe(true);
    expect(() => { p.elo.K = 20; }).toThrow(TypeError);
  });

  it('K og DRAW_BASE ligger i målingens 95 %-intervaller — og fodboldens tal gør IKKE', () => {
    // K: interval 80-160 (scripts/maal-haandbold.mjs afsnit 3). Håndbold 120, fodbold 20.
    expect(p.elo.K).toBeGreaterThanOrEqual(80);
    expect(p.elo.K).toBeLessThanOrEqual(160);
    expect(ELO.K).toBeLessThan(80);
    // DRAW_BASE: interval 0,118-0,203 (afsnit 4). Håndbold 0,157, fodbold 0,305.
    expect(p.elo.DRAW_BASE).toBeGreaterThanOrEqual(0.118);
    expect(p.elo.DRAW_BASE).toBeLessThanOrEqual(0.203);
    expect(ELO.DRAW_BASE).toBeGreaterThan(0.203);
    // DRAW_DECAY er LÅST på fodboldens 0,55 — med vilje, fordi den er
    // umålelig (95 % 0-0,88). Et bånd kan ikke være rødt for fodbold her;
    // låsen og dens begrundelse testes i haandboldMaaling.test.mjs.
    expect(p.elo.DRAW_DECAY).toBe(ELO.DRAW_DECAY);
  });

  it('oddsParametre og eloParametre giver håndboldens tal — ikke fodboldens', () => {
    expect(oddsParametre(p)).toEqual({ hfa: 0, drawBase: 0.157, drawDecay: 0.55, oddsMin: 1.01, oddsMax: 25 });
    expect(eloParametre(p)).toEqual({ hfa: 0, k: 120 });
  });

  it('lige hold på neutral bane: 1 = 2 = 2,37 og X = 6,37 (fodbold med hjemmebane: 2,46 / 3,28 / 3,47)', () => {
    const lige = [{ name: 'A', elo: 1500 }, { name: 'B', elo: 1500 }];
    expect(buildMatch({ round: 1, home: 'A', away: 'B' }, lige, p).odds).toEqual({ 1: 2.37, X: 6.37, 2: 2.37 });
    expect(buildMatch({ round: 1, home: 'A', away: 'B' }, lige).odds).toEqual({ 1: 2.46, X: 3.28, 2: 3.47 });
  });

  it('gulvet 1,01 binder ALDRIG: højeste p er 1 − 0,157·e^(−1,1) ≈ 0,948 → laveste odds 1,06', () => {
    const pMax = 1 - p.elo.DRAW_BASE * Math.exp(-2 * p.elo.DRAW_DECAY);
    expect(pMax).toBeCloseTo(0.9477, 4);
    expect(1 / pMax).toBeGreaterThan(p.odds.min);
    // Det mest ensidige, modellen overhovedet kan møde (3000 Elo-point), giver 1,06 …
    const ekstrem = { eloHome: 3500, eloAway: 500, ...oddsParametre(p) };
    expect(outcomeOdds(ekstrem)['1']).toBe(1.06);
    // … og fodboldens gulv på 1,1 VILLE binde dér — derfor er gulvet en profilværdi.
    expect(outcomeOdds({ ...ekstrem, oddsMin: ODDS.MIN })['1']).toBe(1.1);
  });

  // ODDS-LOFTET 25 (ejerens valg) på det RIGTIGE program og den committede
  // holdfil — samme kald som seedet. Tallene er scripts/maal-haandbold.mjs
  // afsnit 8/8c: uden loft står 11 udfald over 25 (Uruguay–Tyskland «1»
  // 461,77 højest), med loftet står præcis de 11 til 25, og intet andet
  // flytter sig — heller ikke Japan–Island «1» 24,54 lige under.
  it('loftet 25 klipper præcis de 11 udfald over 25 i den indledende runde — og intet andet', () => {
    const fair = buildMatches(hbProgram.fixtures, HAANDBOLD_VM2027_HOLD, { ...p, odds: { min: 1.01, max: null } });
    const seedet = buildMatches(hbProgram.fixtures, HAANDBOLD_VM2027_HOLD, p);
    expect(seedet).toHaveLength(48);
    const uru = (k) => k.find((m) => m.home === 'Uruguay' && m.away === 'Tyskland').odds['1'];
    expect(uru(fair)).toBe(461.77);
    expect(uru(seedet)).toBe(25);
    const jap = (k) => k.find((m) => m.home === 'Japan' && m.away === 'Island').odds['1'];
    expect(jap(seedet)).toBe(24.54);
    expect(jap(seedet)).toBe(jap(fair));
    let klippet = 0;
    seedet.forEach((m, i) => {
      for (const u of ['1', 'X', '2']) {
        if (fair[i].odds[u] > 25) { klippet += 1; expect(m.odds[u], `${m.id} ${u}`).toBe(25); } else expect(m.odds[u], `${m.id} ${u}`).toBe(fair[i].odds[u]);
      }
    });
    expect(klippet).toBe(11);
    expect(Math.max(...seedet.flatMap((m) => Object.values(m.odds)))).toBe(25);
    // X klippes aldrig (højst 19,04).
    expect(Math.max(...seedet.map((m) => m.odds.X))).toBe(19.04);
  });

  it('SL og PL er UÆNDREDE med håndbold i registret — og håndboldprofilen giver andre odds på samme program', () => {
    for (const [liga, { fixtures, teams }] of Object.entries(LIGAER)) {
      expect(somFacit(buildMatches(fixtures, teams, sportProfil({}))), liga).toEqual(golden[liga].seedet);
      expect(somFacit(buildMatches(fixtures, teams, p)), liga).not.toEqual(golden[liga].seedet);
    }
  });

  it('Elo: K 120 — en sejr mellem lige hold flytter 60 hver vej (fodbold ≈ 8,3 for en hjemmesejr)', () => {
    expect(updateElo(1500, 1500, 1, eloParametre(p))).toEqual({ home: 1560, away: 1440 });
    const f = updateElo(1500, 1500, 1, eloParametre(sportProfil()));
    expect(f.home - 1500).toBeCloseTo(20 * (1 - 1 / (1 + 10 ** (-60 / 400))), 10);
    expect(f.home - 1500).toBeLessThan(10);
  });
});

// --- 3. Hvert kaldested bruger spillets profil -------------------------------
describe('kaldestederne bruger SPILLETS profil (prøvesport)', () => {
  medProeveSport();
  const TEAMS = [{ name: 'Stærk', elo: 1900 }, { name: 'Svag', elo: 1300 }];
  // Prøvesportens odds skrevet HELT ud — ikke via oddsParametre, så en fejl
  // i oversættelsen også bliver rød her.
  const PROEVE_ARGS = { hfa: 0, drawBase: 0.05, drawDecay: 0.2, oddsMin: 1.01, oddsMax: 20 };

  it('registret finder prøvesporten', () => {
    expect(sportProfil({ sport: 'proeve' })).toBe(PROEVE);
  });

  it('kun en STRENG finder den — ikke noget, der bliver til "proeve" som nøgle', () => {
    // Uden typeof-vagten ville hasOwnProperty gøre ['proeve'] til nøglen
    // 'proeve' og give prøvesporten. Kun synligt, mens en anden sport end
    // fodbold er registreret — derfor står sagen HER og ikke ovenfor.
    for (const sport of [['proeve'], { toString: () => 'proeve' }]) {
      expect(sportProfil({ sport }), String(sport)).toBe(SPORT_PROFILER.fodbold);
    }
  });

  it('buildMatch prissætter med profilen', () => {
    const m = buildMatch({ round: 1, home: 'Stærk', away: 'Svag' }, TEAMS, sportProfil({ sport: 'proeve' }));
    expect(m.odds).toEqual(outcomeOdds({ eloHome: 1900, eloAway: 1300, ...PROEVE_ARGS }));
    // Gulvet, LOFTET, hjemmebanen og uafgjort-modellen slår alle igennem:
    // fodbold giver 1,15 / 9,21 / 51,23 her. Uden prøvesportens loft på 20
    // stod X 29,11 og 2 33,78 — loftet klipper begge.
    expect(m.odds).toEqual({ 1: 1.07, X: 20, 2: 20 });
    expect(m.odds).not.toEqual(buildMatch({ round: 1, home: 'Stærk', away: 'Svag' }, TEAMS, { ...PROEVE, odds: { min: 1.01, max: null } }).odds);
    expect(m.odds).not.toEqual(buildMatch({ round: 1, home: 'Stærk', away: 'Svag' }, TEAMS).odds);
  });

  it('buildMatch prissætter UDE-favoritten med profilens gulv', () => {
    // Spejlet af kampen ovenfor (neutral bane): 2 får gulvet 1,01 → 1,07.
    // Fodboldens gulv ville give 1,1.
    const m = buildMatch({ round: 1, home: 'Svag', away: 'Stærk' }, TEAMS, PROEVE);
    expect(m.odds).toEqual({ 1: 20, X: 20, 2: 1.07 });
  });

  it('buildMatch giver et ukendt hold SPORTENS neutrale rating', () => {
    const m = buildMatch({ round: 1, home: 'Ukendt', away: 'Svag' }, TEAMS, PROEVE);
    expect(m.eloHome).toBe(1000);
    expect(teamElo(TEAMS, 'Ukendt', PROEVE.elo.START)).toBe(1000);
    expect(teamElo(TEAMS, 'Ukendt')).toBe(1500);
    // UDEholdet slås op for sig — samme krav dér.
    const ude = buildMatch({ round: 1, home: 'Svag', away: 'Ukendt' }, TEAMS, PROEVE);
    expect(ude.eloHome).toBe(1300);
    expect(ude.eloAway).toBe(1000);
    // Ingen holdliste overhovedet: begge får sportens START.
    const tom = buildMatch({ round: 1, home: 'Stærk', away: 'Svag' }, null, PROEVE);
    expect([tom.eloHome, tom.eloAway]).toEqual([1000, 1000]);
    expect(teamElo(null, 'Stærk', PROEVE.elo.START)).toBe(1000);
  });

  it('buildMatches sender profilen videre til hver kamp', () => {
    const [m] = buildMatches([{ round: 1, home: 'Stærk', away: 'Svag' }], TEAMS, PROEVE);
    expect(m.odds).toEqual({ 1: 1.07, X: 20, 2: 20 });
  });

  it('pointModForventning regner med profilen', () => {
    const kampe = [{ id: 'a', round: 1, home: 'Stærk', away: 'Svag', result: '1' }];
    const seed = { Stærk: 1600, Svag: 1450 };
    const p = outcomeProbabilities({ eloHome: 1600, eloAway: 1450, ...PROEVE_ARGS });
    const r = pointModForventning(kampe, 'Stærk', [], seed, PROEVE);
    expect(r.ventede).toBe(Math.round((3 * p['1'] + p.X) * 10) / 10);
    // Fodbold giver 2,1 her, prøvesporten 2,1 også efter afrunding — derfor
    // en kamp, hvor forskellen overlever afrundingen:
    const svag = pointModForventning(kampe, 'Svag', [], { Stærk: 1900, Svag: 1300 }, PROEVE);
    const svagFodbold = pointModForventning(kampe, 'Svag', [], { Stærk: 1900, Svag: 1300 });
    const ps = outcomeProbabilities({ eloHome: 1900, eloAway: 1300, ...PROEVE_ARGS });
    expect(svag.ventede).toBe(Math.round((3 * ps['2'] + ps.X) * 10) / 10);
    expect(svag.ventede).not.toBe(svagFodbold.ventede);
  });

  it('pointModForventning giver et hold uden seed SPORTENS neutrale rating', () => {
    // Begge hold uden seed: fodbold → 1500 mod 1500 med hjemmebane;
    // prøvesporten → 1000 mod 1000 uden. Mod et hold MED seed (1300) afgør
    // START, hvem der er favorit.
    const kampe = [{ id: 'a', round: 1, home: 'Ny', away: 'Svag', result: 'X' }];
    const r = pointModForventning(kampe, 'Ny', [], { Svag: 1300 }, PROEVE);
    const p = outcomeProbabilities({ eloHome: 1000, eloAway: 1300, ...PROEVE_ARGS });
    expect(r.ventede).toBe(Math.round((3 * p['1'] + p.X) * 10) / 10);
    expect(r.ventede).toBeLessThan(1);
  });

  it('… også når holdet uden seed er UDEholdet', () => {
    // 1300 hjemme mod et usedet udehold: prøvesporten → 1000, svag outsider.
    // Fik udeholdet fodboldens 1500, blev det favorit (forventning over 2).
    const kampe = [{ id: 'a', round: 1, home: 'Svag', away: 'Ny', result: 'X' }];
    const r = pointModForventning(kampe, 'Ny', [], { Svag: 1300 }, PROEVE);
    const p = outcomeProbabilities({ eloHome: 1300, eloAway: 1000, ...PROEVE_ARGS });
    expect(r.ventede).toBe(Math.round((3 * p['2'] + p.X) * 10) / 10);
    expect(r.ventede).toBeLessThan(1);
  });
});

// --- Sportens ORD -----------------------------------------------------------
// Et eget register (SPORT_ORD), ikke et felt på profilen: håndboldens ord er
// besluttet (§11.2), dens Elo-tal er ikke (delopgave 4). Se kommentaren ved
// SPORT_ORD for begrundelsen.
describe('sportOrd — hvad tingene hedder i sporten', () => {
  it('fodboldens ord er dagens — literaler, så en ændring bliver rød', () => {
    expect(sportOrd()).toEqual({
      sport: 'fodbold', rundeKonge: 'Rundekongen', rundeSejr: 'rundesejr', rundeSejre: 'rundesejre',
      ordinaerTid: '90 min', emoji: '⚽',
    });
  });

  it('håndbold: "Dagens konge" (ejerens beslutning) — ordene og profilen er hver sit register', () => {
    expect(sportOrd({ sport: 'haandbold' })).toEqual({
      sport: 'håndbold', rundeKonge: 'Dagens konge', rundeSejr: 'dagssejr', rundeSejre: 'dagssejre',
      ordinaerTid: '60 min', emoji: '🤾',
    });
    // Ordene kom før tallene. Nu er profilen målt (D4) — og den er håndboldens
    // egen, ikke fodboldens.
    expect(ukendtSport({ sport: 'haandbold' })).toBe(false);
    expect(sportProfil({ sport: 'haandbold' })).toBe(SPORT_PROFILER.haandbold);
  });

  it('manglende, ukendt eller ugyldig sport giver fodboldens ord — også prototype-navne', () => {
    for (const game of [undefined, null, {}, { sport: null }, { sport: 'curling' }, { sport: 'Haandbold' },
      { sport: ['haandbold'] }, { sport: 'toString' }, { sport: '__proto__' }, { sport: 'constructor' }]) {
      expect(sportOrd(game), JSON.stringify(game)).toBe(SPORT_ORD.fodbold);
    }
  });

  it('hver sport har præcis fodboldens nøgler, alle som ikke-tomme tekster', () => {
    const noegler = Object.keys(SPORT_ORD.fodbold).sort();
    expect(Object.keys(SPORT_ORD)).toEqual(['fodbold', 'haandbold']);
    for (const [navn, ord] of Object.entries(SPORT_ORD)) {
      expect(Object.keys(ord).sort(), navn).toEqual(noegler);
      for (const [k, v] of Object.entries(ord)) {
        expect(typeof v === 'string' && v.trim().length > 0, `${navn}.${k}`).toBe(true);
      }
      expect(Object.isFrozen(ord), navn).toBe(true);
    }
    // Hver sport med en profil har også ord — ellers fik den tavst fodboldens.
    for (const navn of Object.keys(SPORT_PROFILER)) expect(SPORT_ORD, navn).toHaveProperty(navn);
  });
});

// --- Sportens EVNER ---------------------------------------------------------
// harHjemmebane kræver JA fra BÅDE sporten (neutral bane?) og modellen
// (HFA > 0). Prøvesporten har HFA 0 og ingen evne-post; håndbold har en
// evne-post (neutral bane) og endnu ingen profil.
describe('harHjemmebane — sporten og modellen skal begge sige ja', () => {
  it('fodbold (SL, PL, intet sport-felt): ja', () => {
    for (const g of [undefined, null, {}, { sport: 'fodbold' }, { id: 'superliga2627' }]) {
      expect(harHjemmebane(g), JSON.stringify(g)).toBe(true);
    }
  });
  it('håndbold: nej — neutral bane i sporten OG HFA 0 i den målte profil', () => {
    expect(sportEvner({ sport: 'haandbold' })).toEqual({ hjemmebane: false });
    expect(harHjemmebane({ sport: 'haandbold' })).toBe(false);
    expect(sportProfil({ sport: 'haandbold' }).elo.HFA).toBe(0);
  });
  it('ukendt og prototype-navne giver fodboldens evner', () => {
    for (const sport of ['curling', 'toString', '__proto__', ['haandbold']]) {
      expect(sportEvner({ sport }), String(sport)).toBe(SPORT_EVNER.fodbold);
    }
  });
  describe('med prøvesporten (HFA 0)', () => {
    medProeveSport();
    it('nej: en model uden hjemmebanefordel har ingen hjemmebane at tale om', () => {
      expect(sportEvner({ sport: 'proeve' })).toBe(SPORT_EVNER.fodbold);
      expect(harHjemmebane({ sport: 'proeve' })).toBe(false);
    });
  });
  it('registrene modsiger ikke hinanden: har en sport begge, er evnen = HFA > 0', () => {
    // Får håndboldprofilen en dag HFA > 0, bliver denne rød og kræver en
    // beslutning: enten er banen ikke neutral, eller tallet er forkert. (D4
    // målte værtsfordelen og lagde den i værtens start-Elo, ikke i HFA.)
    for (const navn of Object.keys(SPORT_PROFILER).filter((s) => s in SPORT_EVNER)) {
      expect(SPORT_EVNER[navn].hjemmebane, navn).toBe(SPORT_PROFILER[navn].elo.HFA > 0);
    }
    expect(Object.keys(SPORT_EVNER)).toEqual(Object.keys(SPORT_ORD));
    for (const e of Object.values(SPORT_EVNER)) expect(Object.isFrozen(e)).toBe(true);
  });
});
