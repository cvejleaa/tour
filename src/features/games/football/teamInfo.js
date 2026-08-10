// ---------------------------------------------------------------------------
// Holdopslag PR. SPIL.
//
// Fejlen, det her retter: `superligaTeamInfo(navn)` slår altid op i den DANSKE
// holdliste, uanset hvilket spil man ser på. Så længe platformen kun kørte
// Superligaen, gjorde det ingen forskel. Med Premier League ved siden af ville
// hvert engelsk hold få `null` tilbage — ingen farve, ingen kortkode, intet
// stadion — og badgen ville falde tilbage på at udlede tre bogstaver af navnet.
// Den udledning giver i øvrigt "MAN" til BÅDE Manchester City og United.
//
// Holdene står allerede på spillet (`games/{id}.teams`, skrevet af seedingen),
// så opslaget skal bare bruge dem i stedet for en import.
// ---------------------------------------------------------------------------

import { SUPERLIGA_TEAMS_2026 } from '../../../data/superligaTeams2026';
import { medVisningsnavn } from './visningsnavn';

/**
 * Spillets holdliste. Falder tilbage på Superligaens, hvis spillet ikke har
 * nogen — det gælder kun et spil, der ikke er seedet endnu, og fallbacken
 * bevarer den adfærd, fladen havde før.
 * @param {object} game
 * @returns {Array<{name:string, short?:string, elo?:number, color?:string}>}
 */
export function teamsOf(game) {
  const t = game?.teams;
  const liste = Array.isArray(t) && t.length ? t : SUPERLIGA_TEAMS_2026;
  // `vis` lægges på HER, ikke på hvert brugssted. Så får alle fem flader
  // visningsnavnet af sig selv — modsat farve-overrides, der kun slår igennem
  // på tip-fladen, fordi hver flade selv skulle huske at slå dem op.
  // medVisningsnavn cacher, så samme spil giver samme array-objekt igen.
  return medVisningsnavn(liste, game?.teamStyles);
}

/** Navnet som det skal på skærmen. Falder tilbage på det eksakte navn. */
export function visOf(teams, name) {
  return teamInfo(teams, name)?.vis || name;
}

/**
 * Slå ét hold op i en holdliste. Navnet skal matche EKSAKT — listerne og
 * kampprogrammet stammer fra samme kilde, så et afvig er en tastefejl hos os.
 * @param {Array<object>} teams
 * @param {string} name
 * @returns {object|null}
 */
export function teamInfo(teams, name) {
  if (!Array.isArray(teams) || name == null) return null;
  return teams.find((t) => t?.name === name) || null;
}

/** Kortkoden til en badge — falder tilbage på holdets fulde navn. */
export function shortOf(teams, name) {
  return teamInfo(teams, name)?.short || name;
}
