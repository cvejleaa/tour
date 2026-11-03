// ---------------------------------------------------------------------------
// BEVIDSTE HULLER I RESULTAT-SYNKEN — aktive kampspil i scripts/games.mjs, der
// med vilje seedes UDEN `sync`, fordi deres provider ikke er bygget endnu.
//
// Én liste, læst af to tests: scripts/games.test.mjs (hvert aktivt kampspil
// har en provider ELLER står her) og functions-platform/syncProviders.test.js
// (SYNCED_GAMES ⇄ games.mjs). Uden listen ville et spil uden synk enten bryde
// paritetstesten eller blive en tavs undtagelse, ingen husker hvorfor.
//
// Et spil her er IKKE uvogtet: facit sættes i hånden (✍️ under Spil-tidsplan),
// og facit-vagten (functions-platform/facitVagt.js: spilUdenSynk) melder
// strandede kampe. Når provideren lander, skal spillet UD herfra i samme PR,
// som giver det `sync` — testene afviser et hul, der har fået en provider.
// ---------------------------------------------------------------------------
export const SYNK_HULLER = Object.freeze({
  hvm2027: 'planens D8: provideren til håndbold-VM 2027 er ikke bygget',
});
