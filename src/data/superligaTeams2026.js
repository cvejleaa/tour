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
//
// HJEMMEFARVERNE ER RETTET EFTER FOTOS AF DE FAKTISKE 2026/27-TRØJER
// (bold.dk, "Bedøm selv: Her er de nye Superliga-trøjer"). Seks af de tolv
// havde forkert primærfarve — de var skrevet fra hukommelsen om klubbernes
// farver, og hukommelsen huskede klubfarven, ikke trøjen:
//
//   FCM          rød      → SORT med røde pinstriber
//   FCK          marine   → HVID (marineblå er deres anden farve, ikke trøjen)
//   FCN          gul      → RØD med gule bøjler
//   Randers      marine   → LYSEBLÅ med et marineblåt skråbånd
//   Sønderjyske  marine   → LYSEBLÅ/hvid stribet
//   Silkeborg    blå      → RØD
//
// HVORFOR IKKE SAMME METODE SOM PREMIER LEAGUE. PL-farverne hentes af
// `scripts/holdfarver-wikipedia.mjs` fra {{Infobox football club}}. Den kilde
// duer ikke her: Brøndby står med `_brondby2526h` og `body1 = 003DA5` — altså
// BLÅ for en gul trøje og en sæson for gammel — AGF står med `_agf2324h` fra
// 2023/24, og Viborg har slet ingen trøjefelter. Tre af de seks, jeg tjekkede,
// var forældede eller tomme. Tolv hold er få nok til at læse i hånden, og en
// hentning fra et dårligere grundlag ville være mere maskineri og mindre
// sandhed.
//
// TALLENE ER MÅLT, ikke gættet: hvert foto er samplet i et rent stofområde
// under sponsoren (y 62-86 %, x 30-70 %) og klynget med samme afstand 40 som
// PL-scriptet bruger. Trim- og båndfarver er målt ved kraven, hvor de står som
// massive flader i stedet for tynde kanter.
//
// DEN MÅLTE VÆRDI ER BRUGT OGSÅ DÉR, HVOR DEN GAMLE VAR RIGTIG I ART. Brøndby
// stod som #F5C500 og måler #E5B905; Horsens stod #FFC600 og måler #E8C45C.
// Fristelsen var at beholde de gamle, fordi de er mere mættede og står
// kraftigere i en 24 px badge. Det ville have gjort halvdelen af tabellen
// målt og halvdelen husket — uden at man kunne se hvilken var hvad. Nu er
// ALLE tolv fra samme kilde, og forbeholdet gælder dem alle: det er
// studiefotos, så farverne bærer lyssætning. Er en badge tydeligt for mat på
// skærmen, så ret den i admin — det er en bevidst handling, hvor et blandet
// grundlag ville have været en tavs.
//
// TO TING KAN BADGEN IKKE VISE, og det er med vilje:
//   Randers   Skråbåndet. `ClubBadge` har striber, bøjler, tern, halvering og
//             vandret deling — ikke et diagonalbånd. Trøjen står ensfarvet
//             lyseblå, hvilket er rigtigt for den flade, der fylder mest.
//   FCM       Pinstripernes røde kunne ikke måles rent — de er så tynde, at
//             hver måling gav en blanding med sort (#38080D, #5E1723, #8A0B1B).
//             Sekundærfarven er derfor #E4002B, klubbens røde, som allerede
//             stod i denne fil. Det er den ENESTE farve herunder, der ikke er
//             målt på trøjen.
//
// UDE- OG TREDJEFARVER ER IKKE EFTERPRØVET. Kilden viser kun hjemmetrøjer. De
// er kun rørt, hvor den nye hjemmefarve kolliderede med dem — FCK og
// Sønderjyske ville ellers have stået hvid mod hvid — og hvor den gamle
// primærfarve var klubbens ægte anden farve og derfor hørte hjemme som tredje.
// ---------------------------------------------------------------------------

export const SUPERLIGA_TEAMS_2026 = [
  { name: 'FC Midtjylland',      short: 'FCM', elo: 1657, color: '#0B0807', awayColor: '#FFFFFF', thirdColor: '#E4002B', troejer: { hjemme: { sekundaer: '#E4002B', moenster: 'striber' } }, venue: 'MCH Arena' },
  { name: 'F.C. København',      short: 'FCK', elo: 1657, color: '#FFFFFF', awayColor: '#0A2240', thirdColor: '#B0122E', venue: 'Parken' },
  { name: 'Brøndby IF',          short: 'BIF', elo: 1581, color: '#E5B905', awayColor: '#003C78', thirdColor: '#111111', venue: 'Brøndby Stadion' },
  { name: 'AGF',                 short: 'AGF', elo: 1578, color: '#FFFFFF', awayColor: '#004C9B', thirdColor: '#111111', troejer: { hjemme: { sekundaer: '#1E1E23', moenster: 'striber' } }, venue: 'Ceres Park' },
  { name: 'FC Nordsjælland',     short: 'FCN', elo: 1537, color: '#B80112', awayColor: '#111111', thirdColor: '#FFD200', troejer: { hjemme: { sekundaer: '#FDDF16', moenster: 'boejler' } }, venue: 'Right To Dream Park' },
  { name: 'Viborg FF',           short: 'VFF', elo: 1486, color: '#026B41', awayColor: '#FFFFFF', thirdColor: '#111111', venue: 'Energi Viborg Arena' },
  { name: 'OB',                  short: 'OB',  elo: 1486, color: '#0A4AA5', awayColor: '#FFFFFF', thirdColor: '#F26419', troejer: { hjemme: { sekundaer: '#FFFFFF', moenster: 'striber' } }, venue: 'Nature Energy Park' },
  { name: 'Randers FC',          short: 'RFC', elo: 1472, color: '#78C5ED', awayColor: '#FFFFFF', thirdColor: '#003C7E', venue: 'Cepheus Park Randers' },
  { name: 'Sønderjyske Fodbold', short: 'SJF', elo: 1465, color: '#B3D6E9', awayColor: '#1B3A6B', thirdColor: '#B0122E', troejer: { hjemme: { sekundaer: '#FFFFFF', moenster: 'striber' } }, venue: 'Sydbank Park' },
  { name: 'Silkeborg IF',        short: 'SIF', elo: 1453, color: '#CA202C', awayColor: '#FFFFFF', thirdColor: '#003DA5', venue: 'JYSK Park' },
  { name: 'AC Horsens',          short: 'ACH', elo: 1420, color: '#E8C45C', awayColor: '#111111', thirdColor: '#E4002B', troejer: { hjemme: { sekundaer: '#292724', moenster: 'striber' } }, venue: 'Hybel Arena' },
  { name: 'Lyngby Boldklub',     short: 'LBK', elo: 1413, color: '#022592', awayColor: '#FFFFFF', thirdColor: '#111111', venue: 'Lyngby Stadion' },
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
