// ---------------------------------------------------------------------------
// Superligaen 2026/27 — hold + Elo-startværdier.
//
// Elo-værdierne er STARTGÆT (relativ styrke ved sæsonstart). De behøver ikke
// være perfekte: elo-lite selv-korrigerer efter hver kamp (se updateElo), og
// odds fryses pr. kamp ud fra Elo på seedet-tidspunktet. Justér `elo` her hvis
// et hold er åbenlyst fejlvurderet, og verificér HOLD-LISTEN mod det officielle
// program før go-live (op-/nedrykning kan ændre 1-2 hold).
//
// `name` er det kanoniske holdnavn (skal matche kampprogrammet/facit).
// `short` bruges til kompakt visning.
// ---------------------------------------------------------------------------

// Navnene er de EKSAKTE fra api.superliga.dk (samme kilde som kampprogram +
// facit), så Elo-opslag og resultat-matchning altid rammer. Elo = startgæt.
export const SUPERLIGA_TEAMS_2026 = [
  { name: 'F.C. København',      short: 'FCK', elo: 1680 },
  { name: 'FC Midtjylland',      short: 'FCM', elo: 1660 },
  { name: 'Brøndby IF',          short: 'BIF', elo: 1580 },
  { name: 'FC Nordsjælland',     short: 'FCN', elo: 1560 },
  { name: 'AGF',                 short: 'AGF', elo: 1520 },
  { name: 'Silkeborg IF',        short: 'SIF', elo: 1495 },
  { name: 'Randers FC',          short: 'RFC', elo: 1480 },
  { name: 'Viborg FF',           short: 'VFF', elo: 1480 },
  { name: 'OB',                  short: 'OB',  elo: 1470 },
  { name: 'Sønderjyske Fodbold', short: 'SJF', elo: 1450 },
  { name: 'Lyngby Boldklub',     short: 'LBK', elo: 1450 },
  { name: 'AC Horsens',          short: 'ACH', elo: 1400 },
];

/** Opslag holdnavn → Elo (fallback håndteres af teamElo i superligaSeed). */
export function superligaEloMap() {
  const map = {};
  for (const t of SUPERLIGA_TEAMS_2026) map[t.name] = t.elo;
  return map;
}
