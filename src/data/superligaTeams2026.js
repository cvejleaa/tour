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

export const SUPERLIGA_TEAMS_2026 = [
  { name: 'FC København',    short: 'FCK', elo: 1680 },
  { name: 'FC Midtjylland',  short: 'FCM', elo: 1660 },
  { name: 'Brøndby IF',      short: 'BIF', elo: 1580 },
  { name: 'FC Nordsjælland', short: 'FCN', elo: 1560 },
  { name: 'AGF',             short: 'AGF', elo: 1520 },
  { name: 'Randers FC',      short: 'RFC', elo: 1490 },
  { name: 'Silkeborg IF',    short: 'SIF', elo: 1490 },
  { name: 'Viborg FF',       short: 'VFF', elo: 1470 },
  { name: 'AaB',             short: 'AAB', elo: 1440 },
  { name: 'Sønderjyske',     short: 'SØN', elo: 1450 },
  { name: 'Lyngby BK',       short: 'LBK', elo: 1450 },
  { name: 'Vejle BK',        short: 'VBK', elo: 1420 },
];

/** Opslag holdnavn → Elo (fallback håndteres af teamElo i superligaSeed). */
export function superligaEloMap() {
  const map = {};
  for (const t of SUPERLIGA_TEAMS_2026) map[t.name] = t.elo;
  return map;
}
