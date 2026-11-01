// ---------------------------------------------------------------------------
// scripts/lib/seedKampe.mjs — de kampe, et fuldt seed skriver, prissat med
// SPILLETS sportsprofil.
//
// Trukket ud af seed-football.mjs af samme grund som teamsOnly.mjs: scriptet
// selv kræver en rigtig database og har ingen tests, så et kald, der stod
// derinde, kunne miste profilen med hele suiten grøn. Her kan det ikke.
//
// Sporten LÆSES AF SPIL-DOKUMENTET — det samme felt, serveren læser, når den
// omprisser (recomputeSeasonElo). Stod sporten i stedet som et flag til
// scriptet, kunne seedet og serveren prise samme spil med to modeller, og så
// ville den første omprisning flytte alle odds, ingen havde bedt om at flytte.
//
// ET UKENDT SPORT AFVISES. sportProfil falder tavst tilbage på fodbold — med
// vilje, for serveren må ikke gå i stå i drift. Men på skrivevejen skjulte det
// en tastefejl: `sport: 'handbold'` blev seedet med fodboldens hjemmebane og
// gulv, og linjen "Sport: fodbold" så rigtig ud. Derfor returneres det RÅ felt
// ved siden af den opløste profil, og et sat-men-ukendt sport kaster — også i
// tør-kørslen, for dens odds ville være fodboldens og altså forkerte.
// ---------------------------------------------------------------------------

import { buildMatches } from '../../src/lib/superligaSeed.js';
import { sportProfil, ukendtSport } from '../../src/lib/superligaScoring.js';

/**
 * @param {{gameRef: {get: Function}, fixtures: Array, teams: Array}} o
 * @returns {Promise<{sportRaa: *, profil: object, matches: Array}>}
 *   sportRaa er `game.sport` præcis som det står på dokumentet (undefined,
 *   når feltet mangler eller spillet ikke findes).
 */
export async function seedKampe({ gameRef, fixtures, teams }) {
  const snap = await gameRef.get();
  const game = snap.exists ? snap.data() : null;
  const sportRaa = game?.sport;
  if (ukendtSport(game)) {
    throw new Error(
      `Spillet har sport ${JSON.stringify(sportRaa)}, men den sport findes ikke i sportsprofilerne `
      + '(SPORT_PROFILER). Der er IKKE skrevet noget. Ret game.sport i scripts/games.mjs, '
      + 'eller fjern feltet for fodbold.',
    );
  }
  const profil = sportProfil(game);
  return { sportRaa, profil, matches: buildMatches(fixtures, teams, profil) };
}

/** Linjen, seedet skriver om sporten — med det RÅ felt, ikke kun den opløste profil. */
export function sportLinje({ sportRaa, profil }) {
  // PRÆCIST undefined/null — ikke `!sportRaa`: en tom streng, 0 og false er
  // SATTE værdier (seedKampe afviser dem som ukendte) og skal vises som det,
  // ikke som "intet sport-felt".
  const kilde = sportRaa === undefined || sportRaa === null
    ? `intet sport-felt på spillet → ${profil.sport}`
    : `game.sport = ${JSON.stringify(sportRaa)}`;
  return `Sport: ${profil.sport} (${kilde}; hjemmebane ${profil.elo.HFA}, odds-gulv ${profil.odds.min}).`;
}
