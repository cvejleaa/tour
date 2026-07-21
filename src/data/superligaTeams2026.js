// ---------------------------------------------------------------------------
// Superligaen 2026/27 — hold + Elo-startværdier.
//
// Elo-værdierne er BEREGNET fra historiske resultater (de seneste 3 sæsoner,
// 2023/24–2025/26, 579 kampe) via scripts/compute-superliga-elo.mjs: alle hold
// starter i 1500, kampene køres kronologisk gennem updateElo (K=20, HFA=60),
// med 25 % regression mod middel mellem sæsoner. Slutværdien = startværdi her.
//
// Undtagelse: AC Horsens er oprykker uden top-historik i perioden og får en
// oprykker-basisværdi (1425 — bevidst under det svageste etablerede hold).
//
// Elo selv-korrigerer i sæsonen (den levende opdatering genberegner ratings +
// odds efter hvert resultat), så små unøjagtigheder udlignes hurtigt.
//
// `name` er de EKSAKTE navne fra api.superliga.dk (samme kilde som program +
// facit), så Elo-opslag og resultat-matchning altid rammer.
// ---------------------------------------------------------------------------

export const SUPERLIGA_TEAMS_2026 = [
  { name: 'FC Midtjylland',      short: 'FCM', elo: 1623 },
  { name: 'AGF',                 short: 'AGF', elo: 1620 },
  { name: 'F.C. København',      short: 'FCK', elo: 1574 },
  { name: 'FC Nordsjælland',     short: 'FCN', elo: 1565 },
  { name: 'Brøndby IF',          short: 'BIF', elo: 1526 },
  { name: 'Viborg FF',           short: 'VFF', elo: 1521 },
  { name: 'Sønderjyske Fodbold', short: 'SJF', elo: 1509 },
  { name: 'Silkeborg IF',        short: 'SIF', elo: 1471 },
  { name: 'OB',                  short: 'OB',  elo: 1468 },
  { name: 'Randers FC',          short: 'RFC', elo: 1458 },
  { name: 'Lyngby Boldklub',     short: 'LBK', elo: 1443 },
  { name: 'AC Horsens',          short: 'ACH', elo: 1425 },
];

/** Opslag holdnavn → Elo (fallback håndteres af teamElo i superligaSeed). */
export function superligaEloMap() {
  const map = {};
  for (const t of SUPERLIGA_TEAMS_2026) map[t.name] = t.elo;
  return map;
}
