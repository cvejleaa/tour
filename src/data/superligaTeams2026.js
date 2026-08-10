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
//   FCM          rød      → SORT
//   FCK          marine   → HVID (marineblå er deres anden farve, ikke trøjen)
//   FCN          gul      → RØD
//   Randers      marine   → LYSEBLÅ
//   Sønderjyske  marine   → LYSEBLÅ, stribet med hvid
//   Silkeborg    blå      → RØD
//
// MÅLINGEN LIGGER I `scripts/superliga-troejefarver.mjs` og kan køres igen.
// Den skal kunne det: de tre FCM-tal, der først stod her, kunne ikke
// reproduceres af den, der efterprøvede dem — samme karakter, andre tal, og
// ingen kunne afgøre hvem der havde ret. Nu står harnesset i repoet, henter
// billederne selv og printer både fladerne og tofarvet-testen.
//
// HVORFOR IKKE WIKIPEDIA — og ikke af den grund, der først stod her.
// Jeg påstod, at Brøndby stod med `body1 = 003DA5`, "altså BLÅ for en gul
// trøje". Det var forkert: body1 er BUNDfarven under mønsteret, præcis den
// fælde `holdfarver-wikipedia.mjs` selv dokumenterer som "den fælde, jeg gik i
// først". Kører man metoden rigtigt, giver Brøndbys grafik GUL 76,5 %. Fem af
// de seks fejlfarver ville metoden faktisk have fanget.
//
// Grunden, der HOLDER, er aktualitet. Trøjefeltet for de tolv: FCK, Randers og
// Silkeborg står med 2026/27-grafik; FCM, Brøndby og FCN med 2025/26; AGF og OB
// med 2023/24; Horsens med 2019/20; Lyngby med `_adidascampeon23rb`, en generisk
// adidas-skabelon og ikke klubbens trøje; Viborg og Sønderjyske står tomme.
// TRE AF TOLV er indeværende sæson. At 5 af 6 alligevel ville være ramt skyldes,
// at klubber sjældent skifter grundfarve mellem sæsoner — ikke at kilden er
// aktuel. Fotoene er 2026/27 hele vejen rundt.
//
// TRE TRØJER BÆRER MØNSTER: OB, Horsens og Sønderjyske. Ikke flere, og det er
// en MÅLT beslutning, ikke en æstetisk. Samme test som i PL-scriptet — en flade
// tæller kun over 12 %, og nr. 2 skal fylde mindst halvdelen af nr. 1 — er den,
// der gjorde Leeds' pinstriber til en ensfarvet hvid trøje. Den samme test
// rammer tre danske hold:
//
//   AGF   pinstriber   foto 14,3 % mod krav 33,7 %   grafik: marine 1,7 %
//   FCN   bøjler       foto  1,4 %                   grafik: gul    6,9 %
//   FCM   pinstriber   foto  9,7 % (under 12 %-gulvet)
//
// AGF og FCN er bekræftet af BEGGE kilder — fotoet og den flade grafik er enige
// om, at stregerne er tynde. Første udgave af denne fil gav dem mønster
// alligevel, og det var inkonsekvent: AGF's striber er målbart TYNDERE end
// Leeds', som blev kaldt for tynde. Ved 22 px bliver to tynde streger tegnet som
// to brede bånd, og så ligner AGF pludselig OB. Horsens beholder sit mønster,
// fordi fotoet måler 35,8 % mod kravet 19,8 % — dér er striberne brede. Klubbens
// Wikipedia-grafik er fra 2019/20 og siger ensfarvet, men den er syv sæsoner
// gammel, og fotoet er kilden.
//
// KRYDSTJEK mod de tre aktuelle flade grafikker, så afvigelsen står på papir:
//
//   FCK        foto #FFFFFF   grafik #FBFBFB    enige
//   Randers    foto #78C5ED   grafik #80BFFF    grafikken lidt mættere
//   Silkeborg  foto #CA202C   grafik #F50000    grafikken TYDELIGT mættere
//
// Fotoværdien er beholdt alle tolv steder. En tabel fra én kilde med ét
// forbehold er nemmere at stole på end en, hvor tre rækker kommer et andet sted
// fra og ingen kan se hvilke. Forbeholdet: det er studiefotos, så farverne
// bærer lyssætning. Ser en badge for mat ud, står grafik-værdien ovenfor som
// det dokumenterede alternativ, og farven kan rettes i admin.
//
// TO PAR LIGGER TÆT, og det skal stå her frem for at blive opdaget på skærmen:
// Randers #78C5ED mod Sønderjyske #B3D6E9 er 1,23:1, og FCN #B80112 mod
// Silkeborg #CA202C er 1,23:1. Kortkoden står ved siden af badgen på ALLE fem
// brugssteder, så identifikation aldrig hviler på farven alene — men de er ikke
// til at skelne på farve. Sønderjyskes hvide striber er desuden 1,55:1 mod
// deres egen lyseblå, altså nærmest usynlige ved 22 px; mønsteret er beholdt,
// fordi det er sandt, ikke fordi det kan ses.
//
// FCM'S RØDE PINSTRIBER kunne slet ikke måles rent — hver måling gav en
// blanding med sort. Trøjen står derfor ensfarvet sort, og der er ingen
// opfundet rød i rækken.
//
// FCN'S RØDE deler sig i to næsten ens nuancer (#B1020F 49,1 % og #BF0114
// 45,1 %, kun 20 fra hinanden). #B80112 er deres vægtede gennemsnit — ikke et
// skøn. Delingen er fotografiets skygger, ikke to designfarver, og den er værd
// at kende: tofarvet-testen sagde "mønstret" om to røde, hvilket er
// meningsløst. En flad grafik har ikke det problem.
//
// UDE- OG TREDJEFARVER ER IKKE EFTERPRØVET. Kilden viser kun hjemmetrøjer. De
// er kun rørt, hvor den nye hjemmefarve kolliderede med dem — FCK og
// Sønderjyske ville ellers have stået hvid mod hvid — og hvor den gamle
// primærfarve var klubbens ægte anden farve og derfor hørte hjemme som tredje.
// ---------------------------------------------------------------------------

export const SUPERLIGA_TEAMS_2026 = [
  { name: 'FC Midtjylland',      short: 'FCM', elo: 1657, color: '#0B0807', awayColor: '#FFFFFF', thirdColor: '#E4002B', venue: 'MCH Arena' },
  { name: 'F.C. København',      short: 'FCK', elo: 1657, color: '#FFFFFF', awayColor: '#0A2240', thirdColor: '#B0122E', venue: 'Parken' },
  { name: 'Brøndby IF',          short: 'BIF', elo: 1581, color: '#E5B905', awayColor: '#003C78', thirdColor: '#111111', venue: 'Brøndby Stadion' },
  { name: 'AGF',                 short: 'AGF', elo: 1578, color: '#FFFFFF', awayColor: '#004C9B', thirdColor: '#111111', venue: 'Ceres Park' },
  { name: 'FC Nordsjælland',     short: 'FCN', elo: 1537, color: '#B80112', awayColor: '#111111', thirdColor: '#FFD200', venue: 'Right To Dream Park' },
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
