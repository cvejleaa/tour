// Hvilke EVNER har et spil — afgjort af dets synk-provider. Klienten kan ikke
// importere serverens SYNCED_GAMES/PROVIDERS, så sættene her er SPEJLINGER og
// SKAL følge functions-platform/syncProviders.js. Ét sted, så en tredje kilde
// er én rettelse — ikke et hardkodet provider-navn spredt i fladen.
//
// Allowlister, ALDRIG `!!sync.provider`: et spil kan seedes med en provider,
// der endnu ikke er implementeret på serveren (games.mjs advarer selv om
// præcis det) — og så ville en sandheds-gate vise knapper, hvis kald kun kan
// fejle. En evne findes først, når serverens del af den findes.

// Kilder med DAGLIG kickoff-synk (provider har hentKickoffs på serveren).
// Mangler en kilde her, mister spillet BÅDE sit Drift-kort ("afventer/
// fejlede") OG sin manuelle "🗓️ Synk kamptider nu"-knap — dvs. en tavst
// fejlende synk bliver usynlig, og en flyttet kamp kan ikke rettes med vilje.
export const KICKOFF_PROVIDERE = new Set(['pulselive', 'superliga']);

// Kilder med resultat-synk (provider har hentFaerdige/hentStandings — de er
// obligatoriske i provider-kontrakten, så listen er identisk med de
// IMPLEMENTEREDE providere). Gater den manuelle "⬇️ Synk resultater nu"-knap.
export const RESULTAT_PROVIDERE = new Set(['pulselive', 'superliga']);

// Kilder med xG (provider har hentXg på serveren — VALGFRI i kontrakten,
// modsat hentFaerdige). Gater den SPIL-brede forklaring i guiden.
//
// Bemærk forskellen på de to gates omkring xG: selve TALLET vises pr. KAMP,
// gatet på om felterne findes, fordi en netop afsluttet kamp mangler dem,
// indtil sweep'et har kørt. FORKLARINGEN kan ikke gates sådan — guiden er
// spil-scopet (FootballHelp.jsx:57-60), og en regelbog må ikke forklare et
// tal, spillet aldrig får. Derfor denne evne ved siden af felt-tjekket.
export const XG_PROVIDERE = new Set(['pulselive', 'superliga']);

// Spil med KAMPDETALJER fra livescore (halvleg, målscorere, tilskuertal).
//
// NØGLET PÅ SPILLET, ikke på provideren — som den eneste af listerne her, og
// det er med vilje. De andre evner ER egenskaber ved facit-kilden: kan
// api.superliga.dk levere xG, kan pulselive levere kamptider. Livescore er en
// TREDJE, ortogonal kilde: den er den samme for begge spil, uanset hvor facit
// kommer fra. Gatede man på {'pulselive','superliga'}, gættede man på en
// korrelation, der kun tilfældigvis holder i dag, fordi begge spil har begge
// dele — og et fremtidigt pulselive-spil uden livescore-kortlægning ville få
// knap og hjælpetekst gratis. Det er `puljeLockRound`-fejlen: en gate, der
// tester en nabo-egenskab i stedet for evnen selv, knækker tavst den dag
// korrelationen brydes, og den kan ikke findes med grep, fordi den ikke
// indeholder evnens navn.
//
// SPEJLER functions-platform/syncProviders.js' SYNCED_GAMES[].livescore.
// Mangler et spil her, mister det BÅDE sit Drift-kort OG sin manuelle
// "⚽ Synk kampdetaljer nu"-knap — altså bliver en tavst fejlende synk
// usynlig, og en rettelse i parsningen kan ikke prøves af med vilje.
export const KAMPDETALJE_SPIL = new Set(['superliga2627', 'pl2627-efteraar']);

/**
 * Har spillet kampdetaljer fra livescore — og dermed et Drift-kort, en manuel
 * udløser og guidens afsnit om halvleg og målscorere?
 *
 * EVNENS FLADER (optalt, så en udvidelse følges hele vejen ud): kampkortets
 * facit-liste (FootballTip: match-card__maal) og LIVE-liste under den levende
 * stilling (match-card__live-maal, feltet `liveMaal`), Drift-kortene
 * "Times-sweep" (Kampdetaljer-linjen) og "Live-mål" (kampdage), knappen
 * "⚽ Synk kampdetaljer nu" (facit + kampe i gang), guidens ⚽-afsnit.
 *
 * Bemærk skellet, som xG også har: SELVE TALLENE vises pr. kamp, gatet på om
 * felterne findes, fordi en netop afsluttet kamp mangler dem indtil sweep'et
 * har kørt. FORKLARINGEN kan ikke gates sådan — guiden er spil-scopet, og en
 * regelbog må ikke forklare et tal, spillet aldrig får.
 *
 * @param {{id?: string}} game
 * @returns {boolean}
 */
export function harKampdetaljer(game) {
  return KAMPDETALJE_SPIL.has(game?.id);
}

/**
 * Kan spillets kilde levere xG (målchancer)?
 * @param {{sync?: {provider?: string}}} game
 * @returns {boolean}
 */
export function harXg(game) {
  return XG_PROVIDERE.has(game?.sync?.provider);
}

/**
 * Har spillet en daglig kickoff-synk (og dermed et Drift-kort + en manuel
 * "Synk kamptider nu"-udløser)?
 * @param {{sync?: {provider?: string}}} game
 * @returns {boolean}
 */
export function harKickoffSynk(game) {
  return KICKOFF_PROVIDERE.has(game?.sync?.provider);
}

/**
 * Har spillet resultat-synk (og dermed en manuel "Synk resultater nu"-udløser)?
 * @param {{sync?: {provider?: string}}} game
 * @returns {boolean}
 */
export function harResultatSynk(game) {
  return RESULTAT_PROVIDERE.has(game?.sync?.provider);
}

/**
 * Forventer spillet daglige tip-påmindelser (og dermed et Drift-kort for
 * 09-jobbet)? SPEJLET PAR med functions-platform/paamindelsesGate.js — samme
 * prædikat som selve jobbets, og det ENESTE sted klienten må spørge (før
 * fandtes tre uenige kopier: jobbet, Påmindelser-fanen og ingen i DriftTab).
 *
 * `paused` indgår med vilje IKKE: pausen er en TILSTAND, kortet rapporterer
 * (gult/rødt), ikke en gate der fjerner kortet — ellers blev "nogen har slået
 * påmindelserne fra" usynligt netop dér, hvor man leder efter tavse udfald.
 * Heller ikke gated på sync.provider: påmindelser afhænger ikke af en kilde.
 * @param {{type?: string, status?: string}} game
 * @returns {boolean}
 */
export function forventerPaamindelser(game) {
  return game?.type === 'football' && (game?.status === 'open' || game?.status === 'live');
}
