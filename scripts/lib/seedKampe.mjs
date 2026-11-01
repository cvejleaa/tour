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
// ---------------------------------------------------------------------------

import { buildMatches } from '../../src/lib/superligaSeed.js';
import { sportProfil } from '../../src/lib/superligaScoring.js';

/**
 * @param {{gameRef: {get: Function}, fixtures: Array, teams: Array}} o
 * @returns {Promise<{profil: object, matches: Array}>}
 */
export async function seedKampe({ gameRef, fixtures, teams }) {
  const snap = await gameRef.get();
  const profil = sportProfil(snap.exists ? snap.data() : null);
  return { profil, matches: buildMatches(fixtures, teams, profil) };
}
