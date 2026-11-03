// ---------------------------------------------------------------------------
// scripts/games.mjs — DE SPIL, PLATFORMEN KENDER. Ét sted, importeret to steder.
//
// Ligger i sin egen fil, fordi listen skal kunne TESTES. seed-games.mjs
// initialiserer firebase-admin på øverste niveau og kan derfor ikke importeres
// fra en test — så listen stod uden for enhver kontrol, samtidig med at den
// beskriver præcis de felter, en fejl er dyrest i (sync-provider, pulje).
// ---------------------------------------------------------------------------

// De spil platformen kender. gameId'erne matcher migreringens data-stier
// (games/vm2026/…, games/tour2026/…) og kan IKKE ændres bagefter: players,
// bets, leagues og matches hænger alle under games/{gameId}/.
//
// `status` og `joinable` i listen gælder kun, når spillet OPRETTES — derefter
// ejer admin dem (ADMIN_OWNED nedenfor). Her stod tidligere en datostemplet
// beskrivelse af, hvilke spil der kørte; den var forældet inden for en måned
// og modsagde posterne længere nede.
//
// TO FELTER BÆRER LIGAENS FORM, og de er med vilje skrevet HER frem for i en
// tabel i koden — så en ny liga er en post i denne liste, ikke et deploy af
// ny logik:
//
//   sync   Hvor facit og stilling hentes fra. `provider` slås op i en
//          WHITELIST i koden; resten er nøgler, kun den provider forstår.
//          Superligaen og pulselive har intet id til fælles, så formen kan
//          ikke være fast. Der må ALDRIG stå en URL her: firestore.rules
//          giver isGlobalAdmin() skriveadgang til hele spil-dokumentet, og en
//          vært fra Firestore ville være en SSRF-vej ud af en Cloud Function.
//          Værdierne må kun bruges som tal i en query-string.
//
//   pulje  Findes KUN på ligaer med et mesterskabsspil at tippe om. Mangler
//          feltet, har spillet ingen pulje. Superligaens top-6 er en egenskab
//          ved den liga — ikke ved fodbold, og ikke ved platformen.
//          En TURNERING kan have en runde-pulje: `facitKilde: 'runde'` og
//          `facitFase: 'Semifinaler'` (et navn i `faser`) — facit er holdene i
//          den fases kampe, og den afgøres, så snart fasen er HELT lagt ind
//          (src/lib/puljeFacit.js). poolSize skal være fasens antal hold
//          (2 × antalKampe); games.test.mjs afviser andet. Ordene (fx
//          "semifinalerne") kommer af kalenderen, ikke af labels.
//          `maksStartRunde` er den sidste startrunde, en liga må have og stadig
//          få puljen med (standard 3 i KODEN — se ligaPoint.js — men kun for
//          Superligaen og Premier League). I en turnering er en runde en DAG,
//          så 3 betyder, at en liga oprettet på 4. spilledag mister
//          puljebonussen. Ejeren 2/11: et NYT spil sætter værdien eksplicit
//          (håndbold-VM: 1 — kun ligaer fra første spilledag), og
//          games.test.mjs afviser en runde-pulje uden den.
//          DEADLINEN — ÉN af to former, og altid i SAMME post som `pulje` (en
//          pulje uden deadline står "Endnu ikke åbnet", og en deadline uden
//          pulje er en deadline uden fane — GamePage: kraever):
//            · med kickoff-synk: `puljeLockRound` — synken udleder
//              puljeLockAt af rundens tidligste kickoff;
//            · uden kickoff-synk og uden at én er på vej: `puljeLockAt` som
//              fast dato HER. (Kommer synken senere — som for håndbold-VM —
//              så brug mellemformen nedenfor, ikke denne.) Feltet under
//              Spil-tidsplan er redigerbart (GameScheduleTab), men
//              puljeLockAt er ikke admin-ejet (seed-payload.mjs), så næste
//              seed skriver værdien herfra tilbage — ret den derfor her.
//            Mellemformen: `puljeLockRound` på et spil, hvis kickoff-synk
//            KOMMER (håndbold-VM indtil D8). Indtil den lander, sætter admin
//            puljeLockAt under Spil-tidsplan (samme redigerbare felt); seedet
//            rører den ikke, for den står ikke her. Synken flytter den
//            bagefter til rundens tidligste kickoff, så længe den ikke er
//            passeret (superligaSync.js: puljeLockFraRunde).
//
// ET SPIL UDEN IMPLEMENTERET PROVIDER SYNKES IKKE — OG INGEN OPDAGER DET.
// Synk, sweep og strandede-alarm løber over SYNCED_GAMES i functions-
// platform/syncProviders.js (spejlet af `sync`-feltet her — paritetstesten i
// syncProviders.test.js holder dem i trit). Men et spil kommer først med i
// den liste, når dets provider er IMPLEMENTERET: står der en provider her,
// som ikke findes i PROVIDERS, er spillet tavst — kampe kan stå uden facit i
// det uendelige, uden at nogen får besked. (Begge nuværende providere —
// superliga og pulselive — ER implementeret og synkes automatisk; advarslen
// gælder det NÆSTE spil, der seedes før dets provider er bygget.)
// Håndbold-VM 2027 seedes UDEN `sync`, indtil provideren findes (planens D8) —
// ikke med en provider, der ikke er bygget. Det er ikke tavst: et aktivt
// kampspil uden synk vogtes af facit-vagten (functions-platform/facitVagt.js),
// og hullet er navngivet i functions-platform/syncProviders.test.js.
export const GAMES = [
  {
    id: 'vm2026',
    name: 'VM 2026', shortName: 'VM', emoji: '⚽',
    type: 'football', status: 'finished', joinable: false,
    // Kørte i sin egen app, og spildata blev aldrig migreret ind — så uden
    // externalUrl er spillet hverken "mit", åbent eller eksternt og forsvinder
    // fra ALLE afledte flader (splitGames' tre lister). Et afsluttet spil skal
    // stå som link-ud med Afsluttet-mærkat, ikke forsvinde (QC-fund, #43).
    externalUrl: 'https://vm.vejleaa.dk',
    season: '2026', order: 1,
  },
  {
    id: 'tour2026',
    name: 'Tour de France 2026', shortName: 'Tour', emoji: '🚴',
    // Kører i sin egen app; forsiden linker UD hertil indtil spillet migreres
    // ind i platformen. joinable: false → intet Deltag, kun link.
    // Touren 2026 er kørt færdig. Står den som 'live' her, sætter en senere
    // seed-kørsel (deploy-platform.yml med seedGames: true) den stille tilbage
    // til "I gang" — merge-skrivningen giver hverken fejl eller spor.
    type: 'cycling', status: 'finished', joinable: false,
    externalUrl: 'https://tour.vejleaa.dk',
    season: '2026', order: 2,
  },
  {
    id: 'superliga2627',
    name: 'Superligaen 2026/27', shortName: 'Superliga', emoji: '⚽',
    // Spil-specifikt logo (fodbold-mærket) — platform-logoet er neutralt.
    logo: '/logo-superliga.svg',
    type: 'football', status: 'open', joinable: true,
    season: '2026-27', order: 3,
    sync: { provider: 'superliga', seasonId: 35802, tournamentId: 46, stageId: 935487 },
    pulje: { poolSize: 6 },
  },
  {
    // Premier League er skåret i TO spil på rundenummer, ikke på dato: en
    // udsat runde 18-kamp, der spilles i januar, hører stadig til efteråret —
    // ellers ville en kamp skifte spil, efter folk har tippet på den.
    // Forårsspillet (runde 19-38) oprettes først, når det bliver aktuelt; et
    // tomt, usynligt spil i fem måneder køber ingenting.
    id: 'pl2627-efteraar',
    name: 'Premier League 2026/27 — efterår', shortName: 'PL efterår', emoji: '⚽',
    // OPRETTES SKJULT. Seedet skriver spillet og de 180 kampe, og uden
    // joinable: false ville spillet stå under "Åbne spil — deltag" i samme
    // sekund — før nogen havde set holdnavne, kickoff-tider og odds efter.
    // Synligheden slås til fra Spil-tidsplan, når gennemgangen er færdig;
    // derefter ejer admin feltet (ADMIN_OWNED i seed-payload.mjs), så en senere
    // seed-kørsel ikke skjuler spillet igen.
    type: 'football', status: 'open', joinable: false,
    season: '2026-27', order: 4,
    sync: { provider: 'pulselive', competitionId: 8, season: 2026 },
    // 🎄 JULETABELLEN (#8): to sæson-spørgsmål — hvem sidder i top 4, og hvem
    // hænger i nedrykningszonen, når efterårets 18 runder er spillet. Facit er
    // spillets EGEN sluttabel ('egneKampe'): et halvsæson-spil må aldrig
    // afregnes mod forårets officielle tabel. tabelDeling: false — PL's tabel
    // er flad; puljen er et tip, ikke et liga-format (QC-fund).
    //
    // DEADLINE SOM RUNDE (puljeLockRound), ikke som fast dato: kickoff-synken
    // udleder selv puljeLockAt fra det tidligste kickoff i runden, så
    // deadlinen følger de faktiske kamptider frem for en dato, en
    // landsholdspause kan ramme forbi. Runde 3 er valgt, fordi
    // PULJE_MAKS_STARTRUNDE=3: en pulje, der lukker senere, ville tavst tage
    // bonussen fra ligaer med senere startrunde (spilfører-afgørelse).
    //
    // puljeLockAt sættes IKKE her — den udledes ved kickoff-synken (kør
    // syncGameKickoffsNow med skriv lige efter seedGames). Indtil da viser
    // pulje-fanen "Endnu ikke åbnet".
    pulje: {
      poolSize: 4, nedSize: 3, perTeam: 4, perfectBonus: 10,
      facitKilde: 'egneKampe', tabelDeling: false,
      // "juleaften" er BEVIDST flavor (Juletabellen er et dansk fodboldbegreb),
      // ikke en dato-garanti — det egentlige kriterium står i `facit` og er
      // rundebaseret. Runde 18 spilles omkring jul, men en udsat kamp kan
      // rykke; teksten lover derfor "når alle 18 runder er spillet", ikke en
      // dato (QC-note på planen).
      labels: {
        overskrift: '🎄 Juletabellen',
        top: 'top 4 juleaften',
        ned: 'nedrykningszonen juleaften',
        facit: 'stillingen, når alle efterårets 18 runder er spillet',
      },
    },
    puljeLockRound: 3,
  },
  {
    // HÅNDBOLD-VM 2027 (herrer), Tyskland 13.-31. januar 2027. Et kampspil
    // (`type: 'football'` = kampe med 1/X/2) med sporten på `sport` — fladerne
    // gater på sportsprofilen og fasekalenderen, aldrig på spil-id'et.
    id: 'hvm2027',
    name: 'Håndbold-VM 2027', shortName: 'Håndbold-VM', emoji: '🤾',
    type: 'football', sport: 'haandbold',
    // OPRETTES SKJULT, som Premier League: seedGames skriver spillet, og
    // seedKampe lægger den indledende runde ind bagefter. Uden joinable: false
    // stod spillet under "Åbne spil — deltag" i samme sekund — før nogen havde
    // set holdnavne, kickoff-tider og odds efter. Synligheden slås til fra
    // Spil-tidsplan; derefter ejer admin feltet (ADMIN_OWNED).
    status: 'open', joinable: false,
    // INGEN `season`: GameLayout skriver «Sæson {season}» foran overskriften
    // (dér gated på fasekalenderen), og forsidens kort viser feltet som en
    // mærkat. En turnering har ingen sæson — årstallet står i navnet.
    order: 5,
    // INGEN `sync` ENDNU. Provideren (planens D8) er ikke bygget, og en
    // provider-post her, som serveren ikke kender, ville give et spil, der
    // LIGNER et synket spil (kildelinje) uden at blive det. Indtil D8 er
    // spillet et bevidst hul i synken: facit sættes i hånden (✍️ under
    // Spil-tidsplan), og facit-vagten vogter det (functions-platform/
    // facitVagt.js: spilUdenSynk). Navngivet i syncProviders.test.js.
    //
    // FASEKALENDEREN — én runde pr. spilledag. Kopieret fra `faser` i
    // scripts/haandbold-vm2027-program.json (bygget af det FILTREREDE program:
    // uden Presidents Cup og placeringskampe 5-8, med bronzekampen på
    // finaledagen). games.test.mjs binder de to ordret: bygges programmet om,
    // bliver testen rød i stedet for at seede en gammel kalender med merge.
    faser: [
      { navn: 'Indledende runde', bestemt: 'Den indledende runde', fra: 1, til: 7, start: '2027-01-13', antalKampe: 48 },
      { navn: 'Hovedrunde', bestemt: 'Hovedrunden', fra: 8, til: 13, start: '2027-01-20', antalKampe: 36 },
      { navn: 'Kvartfinaler', bestemt: 'Kvartfinalerne', fra: 14, til: 15, start: '2027-01-26', antalKampe: 4, knockout: true },
      { navn: 'Semifinaler', bestemt: 'Semifinalerne', fra: 16, til: 16, start: '2027-01-29', antalKampe: 2, knockout: true },
      { navn: 'Finaledag', bestemt: 'Finaledagen', fra: 17, til: 17, start: '2027-01-31', antalKampe: 2, knockout: true },
    ],
    // GRUPPERNE — hvem der er i hvilken gruppe, og hvilke indledende grupper
    // en hovedrundegruppe kommer fra. Kopieret ordret fra `grupper` i
    // scripts/haandbold-vm2027-program.json, ligesom `faser` (games.test.mjs
    // binder dem). Et EGET felt, ikke en nøgle på faserne: faseKalenderFejl
    // afviser ukendte nøgler, så en fejl her ville ellers slå hele kalenderen
    // ihjel — nu forsvinder kun det, der læser grupperne.
    // `hold` står i PROGRAMRÆKKEFØLGE (første kamp i programmet), ikke i en
    // placering. Hovedrundens hold gemmes ikke: de udledes af de kampe, der
    // lægges ind med 📥 Læg næste fases kampe ind — IHF afgør, hvem der gik
    // videre, ikke vores regnestykke. point/videre er formatets konstanter
    // (VM2027_FORMAT i scripts/lib/haandboldProgram.mjs), efterprøvet mod siden.
    grupper: {
      point: { sejr: 2, uafgjort: 1 },
      faser: [
        {
          fase: 'Indledende runde',
          videre: 3,
          grupper: [
            { navn: 'A', hold: ['Serbien', 'Uruguay', 'Tyskland', 'Tunesien'] },
            { navn: 'B', hold: ['Italien', 'Saudi-Arabien', 'Egypten', 'Kap Verde'] },
            { navn: 'C', hold: ['Spanien', 'Tyrkiet', 'Kroatien', 'Chile'] },
            { navn: 'D', hold: ['Argentina', 'Brasilien', 'Frankrig', 'Kuwait'] },
            { navn: 'E', hold: ['Sverige', 'Grækenland', 'Norge', 'Qatar'] },
            { navn: 'F', hold: ['Færøerne', 'Algeriet', 'Portugal', 'Polen'] },
            { navn: 'G', hold: ['Slovenien', 'Angola', 'Danmark', 'USA'] },
            { navn: 'H', hold: ['Nordmakedonien', 'Japan', 'Island', 'Bahrain'] },
          ],
        },
        {
          fase: 'Hovedrunde',
          videre: 2,
          grupper: [
            { navn: 'I', fra: ['A', 'B'] },
            { navn: 'II', fra: ['C', 'D'] },
            { navn: 'III', fra: ['E', 'F'] },
            { navn: 'IV', fra: ['G', 'H'] },
          ],
        },
      ],
    },
    // 🏆 SEMIFINALISTERNE: hvilke fire hold når semifinalerne? Facit er
    // holdene i fasen «Semifinaler» (2 kampe = 4 hold), afgjort så snart
    // fasen er HELT lagt ind (src/lib/puljeFacit.js).
    // maksStartRunde: 1 og puljeLockRound: 1 er ejerens valg (planen,
    // §11-tillæg 3): deadline = første kamp på første spilledag, og kun ligaer,
    // der starter på første spilledag, får puljen med.
    //
    // DEADLINEN UDEN KICKOFF-SYNK. puljeLockRound udleder først puljeLockAt,
    // når spillet får en kickoff-synk (D8). Indtil da sætter admin deadlinen
    // under Spil-tidsplan (feltet er redigerbart netop her —
    // GameScheduleTab: puljeRundeUdenSynk) til første kickoff, 13/1 kl. 17.30.
    // puljeLockAt står med vilje IKKE her: så ville seedet skrive den tilbage,
    // og når synken lander, ville to kilder bestemme samme deadline.
    pulje: {
      poolSize: 4, facitKilde: 'runde', facitFase: 'Semifinaler', maksStartRunde: 1,
      labels: { overskrift: '🏆 Semifinalisterne' },
    },
    puljeLockRound: 1,
  },
];
