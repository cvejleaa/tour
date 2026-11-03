// ---------------------------------------------------------------------------
// LANDEFLAG-EVNEN — hvilke koder der har et bundtet flag, og om en holdliste
// har flag. RENE FUNKTIONER UDEN IMPORTS, med vilje.
//
// Filen her og `landeflag.js` er delt i to, fordi evnen skal kunne regnes af
// to slags kode: klienten (via `teamsOf`, som lægger `flag` på holdene) og
// node-scripts, der ikke kan importere en .svg — tør-kørslen af «Ret
// holdlisten» skriver «landeflag: N af 32 hold» med netop `antalMedLandeflag`
// herfra (scripts/lib/teamsOnly.mjs). Begge veje spørger altså den SAMME
// funktion, og tør-kørslen viser, om gaten bliver sand, før der skrives.
//
// Listen er et SPEJL af importerne i `landeflag.js` (Vite kan ikke importere
// en fil, der ikke findes, og node kan ikke importere en svg). Spejlet er
// bundet af `landeflag.test.js`, som kræver præcis de samme nøgler begge
// steder — og af holdfilens test, som kræver præcis holdfilens `iso2`.
//
// Ligger IKKE i src/lib/: der er ingen server-modpart (spejl-reglen gælder
// src/lib ⇄ functions*), og serveren har intet med flag at gøre.
// ---------------------------------------------------------------------------

/**
 * De bundtede flag (ISO 3166-1 alpha-2, små bogstaver — filnavnene i
 * flag-icons/flags/4x3). Kun håndbold-VM 2027's 32 lande: hvert flag er en
 * fil i bundtet, og et land uden et spil er vægt uden brug.
 */
export const LANDEFLAG_KODER = Object.freeze([
  'ao', 'ar', 'bh', 'br', 'cl', 'cv', 'de', 'dk', 'dz', 'eg', 'es', 'fo', 'fr',
  'gr', 'hr', 'is', 'it', 'jp', 'kw', 'mk', 'no', 'pl', 'pt', 'qa', 'rs', 'sa',
  'se', 'si', 'tn', 'tr', 'us', 'uy',
]);

const SAET = new Set(LANDEFLAG_KODER);

/**
 * Har koden et bundtet flag? Kun en EKSAKT kode med små bogstaver: 'DK' er
 * ikke 'dk' — feltet matches aldrig mod en kilde, så der er intet at
 * normalisere, og en stor kode i holdfilen er en tastefejl, der skal ses.
 * Et Set i stedet for et objekt-opslag, så 'constructor' og 'toString' ikke
 * kan svare ja — og så alt, der ikke er en af de 32 strenge (null, et tal,
 * et objekt), svarer nej uden et typetjek ved siden af.
 */
export function harFlagKode(iso2) {
  return SAET.has(iso2);
}

/** Hvor mange af holdene har et bundtet flag. Til tør-kørslens linje. */
export function antalMedLandeflag(teams) {
  if (!Array.isArray(teams)) return 0;
  return teams.filter((t) => harFlagKode(t?.iso2)).length;
}

/**
 * ALT ELLER INTET: sand kun, når listen har hold, og HVERT hold har et flag.
 * Et spil, hvor ét hold mangler, får ingen flag nogen steder — ellers ville
 * en tabelkolonne blande flag og trøjer (ClubBadge.jsx: formen må aldrig
 * skifte inden for en kolonne).
 */
export function alleHarLandeflag(teams) {
  return Array.isArray(teams) && teams.length > 0 && antalMedLandeflag(teams) === teams.length;
}
