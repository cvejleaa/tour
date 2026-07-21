// ---------------------------------------------------------------------------
// Superligaen 2026/27 — hold + Elo-startværdier.
//
// Elo-startværdierne er (1) BEREGNET fra historiske resultater (seneste 3
// sæsoner, 2023/24–2025/26, 579 kampe) via scripts/compute-superliga-elo.mjs,
// og derefter (2) KALIBRERET mod bookmakernes vinder-odds (Danske Spil +
// BetXpert, juli 2026) via scripts/calibrate-superliga-elo.mjs: en Monte
// Carlo-simulering af grundspillet justerer hvert holds Elo, indtil de
// simulerede titel-sandsynligheder matcher markedets afvigningsfrie gennemsnit.
// Bundhold med ~0 % titelchance bevarer deres historiske værdi (markedet er kun
// informativt i toppen). Kalibreringen rettede bl.a. FCK op (co-favorit) og AGF
// ned, i tråd med bookmakerne.
//
// Elo selv-korrigerer yderligere i sæsonen (den levende opdatering genberegner
// ratings + odds efter hvert resultat).
//
// `name` er de EKSAKTE navne fra api.superliga.dk (samme kilde som program +
// facit), så Elo-opslag og resultat-matchning altid rammer.
// ---------------------------------------------------------------------------

export const SUPERLIGA_TEAMS_2026 = [
  { name: 'FC Midtjylland',      short: 'FCM', elo: 1657 },
  { name: 'F.C. København',      short: 'FCK', elo: 1657 },
  { name: 'Brøndby IF',          short: 'BIF', elo: 1581 },
  { name: 'AGF',                 short: 'AGF', elo: 1578 },
  { name: 'FC Nordsjælland',     short: 'FCN', elo: 1537 },
  { name: 'Viborg FF',           short: 'VFF', elo: 1486 },
  { name: 'OB',                  short: 'OB',  elo: 1486 },
  { name: 'Randers FC',          short: 'RFC', elo: 1472 },
  { name: 'Sønderjyske Fodbold', short: 'SJF', elo: 1465 },
  { name: 'Silkeborg IF',        short: 'SIF', elo: 1453 },
  { name: 'AC Horsens',          short: 'ACH', elo: 1420 },
  { name: 'Lyngby Boldklub',     short: 'LBK', elo: 1413 },
];

/** Opslag holdnavn → Elo (fallback håndteres af teamElo i superligaSeed). */
export function superligaEloMap() {
  const map = {};
  for (const t of SUPERLIGA_TEAMS_2026) map[t.name] = t.elo;
  return map;
}
