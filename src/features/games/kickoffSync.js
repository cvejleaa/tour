// Hvilke spil har en DAGLIG kickoff-synk? Kilder, hvis provider har en
// hentKickoffs på serveren (functions-platform/syncProviders.js: PROVIDERS).
//
// Klienten kan ikke importere serverens SYNCED_GAMES/PROVIDERS, så dette sæt er
// en SPEJLING og SKAL følge den. Får en kilde kickoff-synk på serveren uden at
// stå her, mister spillet BÅDE sit Drift-kort ("afventer/fejlede") OG sin
// manuelle "🗓️ Synk kamptider nu"-knap — dvs. en tavst fejlende synk bliver
// usynlig, og en flyttet kamp kan ikke rettes med vilje. Ét sted, så en tredje
// kilde er én rettelse — ikke et hardkodet provider-navn spredt i fladen.
export const KICKOFF_PROVIDERE = new Set(['pulselive', 'superliga']);

/**
 * Har spillet en daglig kickoff-synk (og dermed et Drift-kort + en manuel
 * "Synk kamptider nu"-udløser)?
 * @param {{sync?: {provider?: string}}} game
 * @returns {boolean}
 */
export function harKickoffSynk(game) {
  return KICKOFF_PROVIDERE.has(game?.sync?.provider);
}
