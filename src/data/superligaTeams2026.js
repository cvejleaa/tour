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
// FIRE HJEMMETRØJER BÆRER MØNSTER: OB, Horsens, Sønderjyske og Randers — plus
// Randers' tredje og Brøndbys ude, altså SEKS i alt. (Her stod "tre trøjer:
// OB, Horsens og Sønderjyske", skrevet før ude- og tredjetrøjerne blev målt.
// `superligaTeams2026.test.js` asserterer de fire og de seks, så tallene her
// sagde noget andet end testen i samme repo.)
//
// Det er en MÅLT beslutning, ikke en æstetisk. Grundtesten — en flade tæller
// kun over 12 %, og nr. 2 skal fylde mindst halvdelen af nr. 1 — er den, der
// gjorde Leeds' pinstriber til en ensfarvet hvid trøje. Den er siden DELT I TO,
// se afsnittet længere nede og `scripts/troejeMoenster.mjs`: halvdel-kravet
// gælder kun repeterende mønstre, mens én figur dømmes på kontrast.
//
// De tre hjemmetrøjer, grundtesten ramte:
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
// Silkeborg #CA202C er 1,23:1. De er ikke til at skelne på farve. Sønderjyskes
// hvide striber er desuden 1,55:1 mod deres egen lyseblå, altså nærmest
// usynlige ved 22 px; mønsteret er beholdt, fordi det er sandt, ikke fordi det
// kan ses.
//
// DET FØRSTE PAR ER SIDEN BLEVET LØST, og af noget andet end striberne: Randers
// har fået et marineblåt skråbånd i 6,18:1 mod deres egen lyseblå. De to hold
// står side om side i STILLINGSTABELLEN, hvor alle tolv hjemmetrøjer tegnes ved
// 22 px, og dér er det båndet, der skiller dem. På kampkortet mødtes de i
// forvejen ikke i lyseblå — Sønderjyske spiller ude i bordeaux.
//
// FCN mod Silkeborg står stadig som beskrevet: to røde, ingen af dem med
// mønster. Det er det eneste tætte par tilbage i tabellen.
//
// Begrundelsen for at leve med det har SKIFTET, og det er værd at vide hvorfor.
// Der stod, at "kortkoden står ved siden af badgen på alle fem brugssteder, så
// identifikation aldrig hviler på farven alene". Kortkoden er væk (#132):
// spillerne kunne ikke tyde forkortelserne. Argumentet holder alligevel — bedre
// end før — fordi det, der erstattede koden, er selve HOLDNAVNET, skrevet fuldt
// ud. Men det er nu navnet, der bærer identifikationen, ikke koden.
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
// UDE- OG TREDJEFARVER ER I ALT VÆSENTLIGT IKKE EFTERPRØVET. Hovedkilden viser
// kun hjemmetrøjer. De er kun rørt, hvor den nye hjemmefarve kolliderede med dem
// — FCK og Sønderjyske ville ellers have stået hvid mod hvid — og hvor den gamle
// primærfarve var klubbens ægte anden farve og derfor hørte hjemme som tredje.
//
// ELLEVE ER NU MÅLT (august 2026) med `node scripts/superliga-ude-tredje.mjs`.
// Kilderne er otte klubbutikker, én lanceringsside og én forhandler
// (unisport.dk for FCN — klubben sælger ikke selv trøjen).
//
// HVAD SCRIPTET FANGER, OG HVAD DET IKKE GØR. Det LÆSER denne fil og fejler,
// hvis nogen ændrer et tal her uden at måle om. Det opdager IKKE, at en klub har
// skiftet trøje: `billede`-felterne er faste URL'er til bestemte varenumre, og
// en ny trøje får et nyt varenummer. Den gamle URL leverer glad sidste sæsons
// foto videre, og kørslen bliver ved med at sige ✓. Her stod før, at "kommer der
// nye, siger scriptet fra" — det gør det ikke. Skal man vide det, må man kigge
// på klubbens kollektionsside. Læg det på sæsoneftersynet.
//
//   Sønderjyske ude    #1B3A6B marine       →  #682844 bordeaux
//   Lyngby 3. trøje    #111111 næsten sort  →  #25336D marineblå
//   FCK 3. trøje       #B0122E rød          →  #76CABF mintgrøn      (25/26)
//   Brøndby ude        #003C78 marine       →  #122859 mørkere marine
//   Brøndby 3. trøje   #111111 næsten sort  →  #2E2926 meget mørk brun
//   FCN ude            #111111 næsten sort  →  #111B34 mørk marine   (25/26)
//   OB ude             #FFFFFF hvid         →  #1E2121 sort
//   OB 3. trøje        #F26419 orange       →  #E5C6CB lyserød       (25/26)
//   Randers ude        #FFFFFF hvid         →  #33384F mørk blågrå
//   Randers 3. trøje   #003C7E blå          →  #FC8033 orange
//   Silkeborg 3. trøje #003DA5 blå          →  #FCB2B9 lyserød
//
// Fire af dem var direkte FORKERTE, ikke bare unøjagtige: OB og Randers stod
// begge med hvid udebane, hvor de spiller i sort og mørk blågrå, og deres
// tredjetrøjer var orange og blå, hvor de er lyserød og orange.
//
// Sønderjyskes er den sikreste: dagslys, tre efterprøvede felter rent stof, og
// klubben skriver det selv ("for første gang nogensinde er udebanetrøjen holdt
// i en dyb bordeauxfarve"). De fleste andre er flade produktfotos på hvid —
// ingen lyssætning at korrigere for. Lyngbys er den svageste: begge
// lanceringsfotos er badet i blåt lys, og tallet bygger på en hvidbalancering
// mod sponsorlogoet. Scriptet printer både den rå og den balancerede værdi, så
// korrektionens størrelse kan ses.
//
// TRE ER FORRIGE SÆSONS TRØJE (FCK, OB, FCN). Butikkerne har egne faner for
// 26/27-hjemme og -ude, men tredjetrøjen — og FCN's udebane — hedder stadig
// 25/26, fordi den nye ikke er udkommet. Klubberne spiller i dem indtil videre,
// og de er under alle omstændigheder rigtigere end de farver, der stod her og
// ikke svarede til nogen trøje. Kommer der nye, siger scriptet fra.
//
// TRE MØNSTRE TILFØJET, FIRE FRAVALGT. Tallene kommer fra
// `node scripts/superliga-ude-tredje.mjs --moenster`.
//
//   Randers hjemme TILFØJET  skråbånd, navy 21,3 %, kontrast 6,18:1
//   Randers 3.     TILFØJET  kvarterer, orange 52,9 % mod navy 47,1 %, 5,49:1
//                            (Farve-målingen bruger et andet filter og siger
//                            52,4/47,6 — samme deling, to udsnit. Tallene her
//                            er mønstertestens, som er dem, dommen bygger på.)
//   Brøndby ude    TILFØJET  ét brystbånd, gul 15,9 %, kontrast 8,32:1
//   Lyngby ude     fravalgt  bånd på 2,8 % af HØJDEN = 0,61 px ved 22 px.
//                            AFLÆST I HÅNDEN — trøjen har ingen post i
//                            harnessets mønsterliste, og tallet er en
//                            båndbredde, ikke en andel af fladen. Det stod
//                            en overgang i `troejeMoenster.test.mjs` som om
//                            det var et arealtal og bandt gulvet nedadtil.
//   Brøndby 3.     fravalgt  bronzemønster på 1,9 % — under 12 %-gulvet
//   Randers ude    fravalgt  lyserødt gitter, 16,5 % mod bundens 83,5 %
//   OB 3.          fravalgt  tern i to lyserøde, 28,2 % mod 71,8 % — under
//                            halvdelen. (Se nedenfor: den falder på AREALET,
//                            ikke på kontrasten på 1,12:1.)
//
// TESTEN ER DELT I TO, og det er dét, der gjorde de tre mulige. Kravet
// "nr. 2 skal fylde mindst halvdelen af nr. 1" giver kun mening for REPETERENDE
// mønstre, hvor to farver skiftevis dækker trøjen. Én figur — et brystbånd, et
// skråbånd, en deling i kvarterer — fylder i sagens natur 15-50 % og kunne
// aldrig bestå. For dem er kravet i stedet: over 12 % af fladen OG mindst 2:1
// i kontrast. Uden den skelnen stod Brøndbys bånd og Randers' skråbånd
// ensfarvede, selv om begge er umulige at overse på trøjen.
//
// Reglen for HVILKEN slags noget er, står i `scripts/troejeMoenster.mjs`.
//
// OB'S TERN FALDER PÅ AREALET, IKKE PÅ KONTRASTEN. Her stod det modsatte —
// "falder på netop kontrasten: 1,12:1" — og den påstand overlevede fem steder
// i repoet, efter at reglen var skrevet ned. Et skakbræt er repeterende, og
// derfor dømmes det på areal: de to lyserøde er 28,2 % mod 71,8 %, altså under
// halvdelen. Kontrasten på 1,12:1 er sand og siger det samme om synligheden,
// men det er ikke DEN, der fravælger trøjen.
//
// Ingen af de seks målte mønstre falder på kontrasten. Kravet er en vagt mod en
// fremtidig enkeltfigur i to næsten ens farver — se `troejeMoenster.mjs`.
//
// JEG TOG FEJL OM BADGE-SPROGET, og det er værd at skrive, fordi fejlen næsten
// kostede Randers begge sine mønstre. Her stod, at sproget "kun kan `striber`,
// `boejler` og `ternet`", og at kvarterer derfor ikke kunne tegnes. `ternet` ER
// kvarterer — to modstående kvadranter — og det stod i komponentens egen
// kommentar hele tiden. Sproget har nu OTTE former: de fem oprindelige plus
// `skraabaand`, `baand` og `firkanter`, som kom til her.
//
// Tilbage står ét sted, hvor "ingen passende form" stadig holder: OB's udetrøje
// har ÉN lodret stribe ned ad midten, og `halveret` fylder en hel halvdel.
// Den falder i forvejen på 12 %-gulvet.
//
// SØNDERJYSKES STRIBER PÅ 1,55:1 BEHOLDES — og grunden er en anden, end der
// stod. Her stod, at "to principper mødes": at Sønderjyske beholdes og OB
// fravælges, selv om begge har lav kontrast, fordi det er forskelligt, hvad man
// mister. Med den nedskrevne regel findes den konflikt ikke: begge er
// repeterende og dømmes begge på areal. Sønderjyske består (striberne fylder
// nok), OB falder (28,2 % mod 71,8 %). Ingen af dem afgøres af kontrasten.
//
// Tilbage står den ægte afvejning: striber på 1,55:1 er nærmest usynlige ved
// 22 px, og de beholdes alligevel, fordi de er sande — uden dem ligner
// Sønderjyske et ensfarvet lyseblåt hold, som de ikke er.
//
// Det koster mindre, end det gjorde. Parret, der bekymrede, var Randers mod
// Sønderjyske: to lyseblå på 1,23:1, som står side om side i stillingstabellen.
// Randers har nu et marineblåt skråbånd i 6,18:1, så det er DÉT, der skiller
// dem — ikke Sønderjyskes striber. Se afsnittet om de to lyseblå ovenfor.
//
// DE UMÅLTE. Elleve felter er målt; tretten er ikke. Værd at kende ved navn,
// fordi de kan skjule en fejl: FCM ude+3., FCK ude, AGF ude+3., FCN 3.,
// Viborg ude+3., OB 3. (målt), Sønderjyske 3., SILKEBORG UDE, Horsens ude+3.,
// Lyngby ude. Silkeborgs hvide udetrøje er den vigtigste af dem — se
// `badgeFarver.test.js`, hvor den er grunden til to af de tætte par.
// ---------------------------------------------------------------------------

export const SUPERLIGA_TEAMS_2026 = [
  { name: 'FC Midtjylland',      short: 'FCM', elo: 1657, color: '#0B0807', awayColor: '#FFFFFF', thirdColor: '#E4002B', venue: 'MCH Arena' },
  { name: 'F.C. København',      short: 'FCK', elo: 1657, color: '#FFFFFF', awayColor: '#0A2240', thirdColor: '#76CABF', venue: 'Parken' },
  { name: 'Brøndby IF',          short: 'BIF', elo: 1581, color: '#E5B905', awayColor: '#122859', thirdColor: '#2E2926', troejer: { ude: { sekundaer: '#EBBF4D', moenster: 'baand' } }, venue: 'Brøndby Stadion' },
  { name: 'AGF',                 short: 'AGF', elo: 1578, color: '#FFFFFF', awayColor: '#004C9B', thirdColor: '#111111', venue: 'Ceres Park' },
  { name: 'FC Nordsjælland',     short: 'FCN', elo: 1537, color: '#B80112', awayColor: '#111B34', thirdColor: '#FFD200', venue: 'Right To Dream Park' },
  { name: 'Viborg FF',           short: 'VFF', elo: 1486, color: '#026B41', awayColor: '#FFFFFF', thirdColor: '#111111', venue: 'Energi Viborg Arena' },
  { name: 'OB',                  short: 'OB',  elo: 1486, color: '#0A4AA5', awayColor: '#1E2121', thirdColor: '#E5C6CB', troejer: { hjemme: { sekundaer: '#FFFFFF', moenster: 'striber' } }, venue: 'Nature Energy Park' },
  { name: 'Randers FC',          short: 'RFC', elo: 1472, color: '#78C5ED', awayColor: '#33384F', thirdColor: '#FC8033', troejer: { hjemme: { sekundaer: '#30374F', moenster: 'skraabaand' }, tredje: { sekundaer: '#292A3F', moenster: 'ternet' } }, venue: 'Cepheus Park Randers' },
  { name: 'Sønderjyske Fodbold', short: 'SJF', elo: 1465, color: '#B3D6E9', awayColor: '#682844', thirdColor: '#B0122E', troejer: { hjemme: { sekundaer: '#FFFFFF', moenster: 'striber' } }, venue: 'Sydbank Park' },
  { name: 'Silkeborg IF',        short: 'SIF', elo: 1453, color: '#CA202C', awayColor: '#FFFFFF', thirdColor: '#FCB2B9', venue: 'JYSK Park' },
  { name: 'AC Horsens',          short: 'ACH', elo: 1420, color: '#E8C45C', awayColor: '#111111', thirdColor: '#E4002B', troejer: { hjemme: { sekundaer: '#292724', moenster: 'striber' } }, venue: 'Hybel Arena' },
  { name: 'Lyngby Boldklub',     short: 'LBK', elo: 1413, color: '#022592', awayColor: '#FFFFFF', thirdColor: '#25336D', venue: 'Lyngby Stadion' },
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
