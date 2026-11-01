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
  ELO, ODDS, OUTCOME, SPORT_PROFILER, STANDARD_SPORT, sportProfil, oddsParametre, eloParametre,
  outcomeOdds, outcomeProbabilities, fairOdds, updateElo,
} from './superligaScoring';
import { buildMatch, buildMatches, teamElo } from './superligaSeed';
import { pointModForventning } from '../features/games/football/holdStatistik';
import { SUPERLIGA_TEAMS_2026 } from '../data/superligaTeams2026';
import { PREMIER_LEAGUE_TEAMS_2026 } from '../data/premierLeagueTeams2026';
import golden from '../../functions-platform/testdata/sportprofil-golden.json';
import slProgram from '../../scripts/superliga-fixtures.json';
import plProgram from '../../scripts/premier-league-fixtures-2627.json';
import { goldenKampe } from '../../scripts/lib/sportprofilGolden.mjs';
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
  it('fodbold er standarden, og den er den eneste profil (endnu)', () => {
    expect(STANDARD_SPORT).toBe('fodbold');
    // FRAVÆRS-ASSERTION MED VILJE. Håndboldprofilen kommer i delopgave 4,
    // når dens tal er målt — og så SKAL denne linje vendes i samme PR.
    expect(Object.keys(SPORT_PROFILER)).toEqual(['fodbold']);
  });

  it('manglende, ukendt eller ugyldig sport giver fodbold', () => {
    const fodbold = SPORT_PROFILER.fodbold;
    for (const game of [
      undefined, null, {}, { sport: undefined }, { sport: null }, { sport: '' },
      { sport: 'curling' },        // ukendt — må ikke give en tom profil (ikke 'haandbold': det navn får sin profil i delopgave 4)
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
    expect(p).toEqual({ sport: 'fodbold', elo: { ...ELO }, odds: { min: ODDS.MIN } });
    // En KOPI: profilen fryses hele vejen ned, og delte den objekt med ELO,
    // blev konstanten selv frosset — og scripts/maal-*.mjs, der læser den, med.
    expect(p.elo).not.toBe(ELO);
    expect(Object.isFrozen(ELO)).toBe(false);
    // Literaler: profilen må ikke kunne flytte sig sammen med konstanterne,
    // uden at noget bliver rødt. Ændres modellen med vilje, ændres de her.
    expect(p.elo).toEqual({ START: 1500, HFA: 60, K: 20, DRAW_BASE: 0.305, DRAW_DECAY: 0.55 });
    expect(p.odds).toEqual({ min: 1.1 });
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
    expect(oddsParametre(sportProfil())).toEqual({ hfa: 60, drawBase: 0.305, drawDecay: 0.55, oddsMin: 1.1 });
    expect(eloParametre(sportProfil())).toEqual({ hfa: 60, k: 20 });
    expect(oddsParametre()).toEqual(oddsParametre(sportProfil()));
    expect(eloParametre()).toEqual(eloParametre(sportProfil()));
    // HVERT felt skal komme fra profilen — med en profil, hvor alle tal er
    // andre, så et byttet eller hardkodet felt ikke kan gemme sig.
    expect(oddsParametre(PROEVE)).toEqual({ hfa: 0, drawBase: 0.05, drawDecay: 0.2, oddsMin: 1.01 });
    expect(eloParametre(PROEVE)).toEqual({ hfa: 0, k: 40 });
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

// --- 3. Hvert kaldested bruger spillets profil -------------------------------
describe('kaldestederne bruger SPILLETS profil (prøvesport)', () => {
  medProeveSport();
  const TEAMS = [{ name: 'Stærk', elo: 1900 }, { name: 'Svag', elo: 1300 }];
  // Prøvesportens odds skrevet HELT ud — ikke via oddsParametre, så en fejl
  // i oversættelsen også bliver rød her.
  const PROEVE_ARGS = { hfa: 0, drawBase: 0.05, drawDecay: 0.2, oddsMin: 1.01 };

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
    // Gulvet, hjemmebanen og uafgjort-modellen slår alle igennem: fodbold
    // giver 1,15 / 9,21 / 51,23 her.
    expect(m.odds).toEqual({ 1: 1.07, X: 29.11, 2: 33.78 });
    expect(m.odds).not.toEqual(buildMatch({ round: 1, home: 'Stærk', away: 'Svag' }, TEAMS).odds);
  });

  it('buildMatch prissætter UDE-favoritten med profilens gulv', () => {
    // Spejlet af kampen ovenfor (neutral bane): 2 får gulvet 1,01 → 1,07.
    // Fodboldens gulv ville give 1,1.
    const m = buildMatch({ round: 1, home: 'Svag', away: 'Stærk' }, TEAMS, PROEVE);
    expect(m.odds).toEqual({ 1: 33.78, X: 29.11, 2: 1.07 });
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
    expect(m.odds).toEqual({ 1: 1.07, X: 29.11, 2: 33.78 });
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
