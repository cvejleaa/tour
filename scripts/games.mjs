// ---------------------------------------------------------------------------
// scripts/games.js — DE SPIL, PLATFORMEN KENDER. Ét sted, importeret to steder.
//
// Ligger i sin egen fil, fordi listen skal kunne TESTES. seed-games.mjs
// initialiserer firebase-admin på øverste niveau og kan derfor ikke importeres
// fra en test — så listen stod uden for enhver kontrol, samtidig med at den
// beskriver præcis de felter, en fejl er dyrest i (sync-provider, pulje).
// ---------------------------------------------------------------------------

// De spil platformen kender. status/joinable afspejler virkeligheden 20/7-2026:
// VM er afsluttet, Touren kører, Superligaen åbner 24/7. gameId'erne matcher
// migreringens data-stier (games/vm2026/…, games/tour2026/…).
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
//
// Et spil UDEN `sync` synkes ikke. Den tavshed fanges af den eksisterende
// strandede-alarm (superligaSync.strandedMatches), som råber op om kampe uden
// facit længe efter kickoff.
export const GAMES = [
  {
    id: 'vm2026',
    name: 'VM 2026', shortName: 'VM', emoji: '⚽',
    type: 'football', status: 'finished', joinable: false,
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
    type: 'football', status: 'open', joinable: true,
    season: '2026-27', order: 4,
    sync: { provider: 'pulselive', competitionId: 8, season: 2026 },
    // INTET pulje-felt. Premier League har ingen mesterskabs-/nedrykningsspil,
    // så der er ikke noget at tippe om. Superligaens pulje er en egenskab ved
    // DEN liga, ikke ved fodbold.
  },
];
