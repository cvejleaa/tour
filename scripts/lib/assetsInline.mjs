// ---------------------------------------------------------------------------
// scripts/lib/assetsInline.mjs — hvilke assets Vite må inline som data-URI.
//
// LANDEFLAGENE MÅ IKKE INLINES. Vite 5.4 inliner alt under 4096 B i det modul,
// der importerer det; 25 af de 32 flag (flag-icons) er under grænsen, og
// landeflag.js importeres via teamInfo.js af GamePage, som ikke er lazy
// (App.jsx). Uden prædikatet lå de 25 som tekst i HOVEDBUNDTET for begge apps
// og for hver SL/PL-spiller — vægt, der hentes ved hver ny version, mens en
// selvstændig fil hentes én gang og caches immutable under /assets/.
// Vite 5.4 har ikke `?no-inline` (kom i 6), så funktionsformen er vejen
// (node_modules/vite/dist/node/index.d.ts: assetsInlineLimit).
//
// Prædikatet ligger her og ikke inde i vite.config.js, så en test kan se det:
// en mutation til `true` eller en forkert sti skal være rød. Efterprøvet på
// buildet af scripts/maal-flag.mjs (32 svg-filer, 0 data:image/svg+xml i JS).
// ---------------------------------------------------------------------------

/**
 * `build.assetsInlineLimit` som funktion.
 * @param {string} fil  absolut sti til assettet
 * @returns {false|undefined}  false = aldrig inline; undefined = Vites standard (4096 B)
 */
export function assetsInlineLimit(fil) {
  // Skråstreger normaliseres, så Windows-stier (\node_modules\) også rammes.
  return String(fil).replace(/\\/g, '/').includes('/node_modules/flag-icons/') ? false : undefined;
}
