// Nøglen, der binder et interaktivt JSX-element i kildekoden til det element,
// en test rørte ved i DOM'en: `fil:linje:kolonne`.
//
// ÉT STED FOR KONVERTERINGEN. Scanneren (scan-flade.mjs) læser positionen fra
// @babel/parser, hvor kolonnen er 0-indekseret. Tappen (src/test/setup.js)
// læser den fra Reacts `_debugSource`, som babels jsx-source-plugin skriver
// med `column + 1` (plugin-transform-react-jsx-source/lib/index.js:19). De to
// sider skal mødes præcist, ellers krediteres INGENTING, og hele fladen står
// som utestet. Konverteringen må derfor kun findes her — begge sider kalder
// den samme funktion med den samme konvention.

/** Nøgle for en position, hvor `kolonne` er 1-indekseret (Reacts konvention). */
export function noegle(fil, linje, kolonne) {
  return `${fil}:${linje}:${kolonne}`;
}

/** Nøgle for en babel-position (0-indekseret kolonne). */
export function noegleFraBabel(fil, loc) {
  return noegle(fil, loc.line, loc.column + 1);
}

/** Nøgle for Reacts `_debugSource` ({ fileName, lineNumber, columnNumber }). */
export function noegleFraDebugSource(kilde, rod) {
  if (!kilde || !kilde.fileName) return null;
  const fil = relativ(kilde.fileName, rod);
  return noegle(fil, kilde.lineNumber, kilde.columnNumber);
}

/** Gør en absolut sti relativ til roden, uden at røre en allerede relativ. */
export function relativ(sti, rod) {
  if (!rod) return sti;
  const r = rod.endsWith('/') ? rod : `${rod}/`;
  return sti.startsWith(r) ? sti.slice(r.length) : sti;
}

/** Splitter en nøgle op igen. */
export function delNoegle(k) {
  const m = /^(.*):(\d+):(\d+)$/.exec(k);
  return m ? { fil: m[1], linje: Number(m[2]), kolonne: Number(m[3]) } : null;
}
