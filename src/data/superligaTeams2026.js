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
//
// `color` = hjemmebane-farve, `awayColor` = udebane-farve, `thirdColor` =
// tertiær (3.) farve — bruges automatisk hvis udeholdets udefarve er for tæt på
// hjemmeholdets hjemmefarve (trøje-clash). Selvstændige hold-badges — vi
// hotlinker IKKE officielle logoer. `venue` = hjemmestadion (api.superliga.dk).
// Alle farver er redigerbare i admin.
// ---------------------------------------------------------------------------

export const SUPERLIGA_TEAMS_2026 = [
  { name: 'FC Midtjylland',      short: 'FCM', elo: 1657, color: '#E4002B', awayColor: '#FFFFFF', thirdColor: '#111111', venue: 'MCH Arena' },
  { name: 'F.C. København',      short: 'FCK', elo: 1657, color: '#0A2240', awayColor: '#FFFFFF', thirdColor: '#B0122E', venue: 'Parken' },
  { name: 'Brøndby IF',          short: 'BIF', elo: 1581, color: '#F5C500', awayColor: '#003C78', thirdColor: '#111111', venue: 'Brøndby Stadion' },
  { name: 'AGF',                 short: 'AGF', elo: 1578, color: '#FFFFFF', awayColor: '#004C9B', thirdColor: '#111111', venue: 'Ceres Park' },
  { name: 'FC Nordsjælland',     short: 'FCN', elo: 1537, color: '#FFD200', awayColor: '#111111', thirdColor: '#E4002B', venue: 'Right To Dream Park' },
  { name: 'Viborg FF',           short: 'VFF', elo: 1486, color: '#1E7A46', awayColor: '#FFFFFF', thirdColor: '#111111', venue: 'Energi Viborg Arena' },
  { name: 'OB',                  short: 'OB',  elo: 1486, color: '#0A56A5', awayColor: '#FFFFFF', thirdColor: '#F26419', venue: 'Nature Energy Park' },
  { name: 'Randers FC',          short: 'RFC', elo: 1472, color: '#003C7E', awayColor: '#FFFFFF', thirdColor: '#111111', venue: 'Cepheus Park Randers' },
  { name: 'Sønderjyske Fodbold', short: 'SJF', elo: 1465, color: '#1B3A6B', awayColor: '#FFFFFF', thirdColor: '#B0122E', venue: 'Sydbank Park' },
  { name: 'Silkeborg IF',        short: 'SIF', elo: 1453, color: '#003DA5', awayColor: '#FFFFFF', thirdColor: '#111111', venue: 'JYSK Park' },
  { name: 'AC Horsens',          short: 'ACH', elo: 1420, color: '#FFC600', awayColor: '#111111', thirdColor: '#E4002B', venue: 'Hybel Arena' },
  { name: 'Lyngby Boldklub',     short: 'LBK', elo: 1413, color: '#123C82', awayColor: '#FFFFFF', thirdColor: '#111111', venue: 'Lyngby Stadion' },
];

/** Opslag holdnavn → Elo (fallback håndteres af teamElo i superligaSeed). */
export function superligaEloMap() {
  const map = {};
  for (const t of SUPERLIGA_TEAMS_2026) map[t.name] = t.elo;
  return map;
}

/** Opslag holdnavn → { short, color, venue } til visning (badges/kamp-kort). */
export function superligaTeamInfo(name) {
  return SUPERLIGA_TEAMS_2026.find((t) => t.name === name) || null;
}
