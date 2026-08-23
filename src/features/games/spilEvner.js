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
