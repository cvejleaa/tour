// ---------------------------------------------------------------------------
// Hold-identitet og tolerant navne-matchning.
//
// Spillere tipper på cykelhold; resultaterne kommer fra PCS-proxyen, hvor
// holdnavnet (`team_name`) kan variere lidt (sponsor-suffiks, tegnsætning,
// årstal i team_url). For at et tip og et facit peger på SAMME hold uden et
// skrøbeligt håndholdt roster:
//   1. Holdene "udfylder sig selv" fra resultaterne (sync tilføjer ukendte hold).
//   2. Sammenligning sker på en NORMALISERET nøgle, ikke rå streng.
//
// Spejles til functions/tourTeams.js — hold dem identiske!
// ---------------------------------------------------------------------------

/**
 * Reducerer et holdnavn til en stabil nøgle: små bogstaver, accenter strippet,
 * kun a-z0-9. "Visma | Lease a Bike" og "Visma | Lease a bike" → samme nøgle.
 */
export function normalizeTeam(name) {
  return String(name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // diakritiske tegn
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Udleder en stabil hold-nøgle af en PCS-resultatrække. Foretrækker team_url
 * (uden årstal-suffiks), falder tilbage til normaliseret team_name.
 * "team/uae-team-emirates-xrg-2025" → "uae-team-emirates-xrg".
 */
export function teamKeyFromRow(row) {
  const url = row && row.team_url;
  if (url) {
    const slug = String(url).split('/').pop() || '';
    const noYear = slug.replace(/-\d{4}$/, '');
    if (noYear) return noYear;
  }
  const name = row && row.team_name;
  return name ? normalizeTeam(name) : null;
}

/** True hvis to holdnavne/-nøgler refererer til samme hold (normaliseret). */
export function sameTeam(a, b) {
  if (a == null || b == null) return false;
  return normalizeTeam(a) === normalizeTeam(b);
}

/**
 * Finder et eksisterende hold der matcher `name` blandt kendte hold, ellers null.
 * @param {string} name
 * @param {Array<{key?:string, name:string}>} known
 * @returns {{key?:string, name:string}|null}
 */
export function findKnownTeam(name, known) {
  const n = normalizeTeam(name);
  if (!n) return null;
  for (const t of known || []) {
    if (normalizeTeam(t.name) === n || (t.key && normalizeTeam(t.key) === n)) return t;
  }
  return null;
}

/**
 * Samler de unikke hold fra et sæt resultatrækker (til selv-udfyldning af
 * `teams`-kollektionen). Bevarer det først sete display-navn pr. nøgle.
 * @param {Array<{team_name?:string, team_url?:string}>} rows
 * @returns {Array<{key:string, name:string}>}
 */
export function teamsFromRows(rows) {
  const byKey = new Map();
  for (const r of rows || []) {
    if (!r || !r.team_name) continue;
    const key = teamKeyFromRow(r);
    if (key && !byKey.has(key)) byKey.set(key, { key, name: r.team_name });
  }
  return [...byKey.values()];
}
