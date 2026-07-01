// ---------------------------------------------------------------------------
// splitRiderName – gør de to startliste-former ens.
//
// Den statiske snapshot har ryttere som { name: "Jonas Vingegaard",
// country: "Danmark" } (adskilt), mens den live-synkede startliste (skrabet fra
// TV2) kan bage landet ind i navnet — "Ben Healy (Irland)" — uden et separat
// country-felt. Uden normalisering vises de to hold derfor forskelligt.
//
// splitRiderName trækker et afsluttende "(Land)" ud af navnet og bruger det som
// land, hvis der ikke allerede er et. Navne uden parentes røres ikke.
// ---------------------------------------------------------------------------
export function splitRiderName(name, country) {
  const raw = String(name || '').trim();
  const c = String(country || '').trim();
  const m = raw.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (m && m[1].trim()) {
    return { name: m[1].trim(), country: c || m[2].trim() };
  }
  return { name: raw, country: c };
}
