// ---------------------------------------------------------------------------
// Officielle rytterdata for Tour de France 2026 (letour.fr's rytter-fil):
// startnummer (bib) og letours egen profiltype pr. rytter. Statisk for hele
// touren — udtrukket fra riders_tdf_2026_frontend.json.
//
// Opslag matcher TOLERANT på navn: letour skriver "POGACAR Tadej", mens
// startlisten (TV2) skriver "Tadej Pogačar" — derfor normaliseres (accenter/
// versaler væk) og navnets ord SORTERES, så rækkefølgen er ligegyldig.
// ---------------------------------------------------------------------------
import RIDERS from './ridersTdf2026.json';

/** Navn → nøgle: små bogstaver, accenter væk, ord sorteret alfabetisk. */
function nameKey(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');
}

/** Ordmængde af et navn (til delvist match, fx "Isaac Del Toro" vs fuldt navn). */
function tokens(s) {
  return new Set(nameKey(s).split(' ').filter(Boolean));
}

const BY_KEY = new Map();
const BY_TEAM = new Map();
for (const r of RIDERS) {
  const entry = { bib: r.bib, profile: r.profile, first: r.first, last: r.last, nat: r.nat, team: r.team };
  BY_KEY.set(nameKey(`${r.first} ${r.last}`), entry);
  const arr = BY_TEAM.get(r.team) || [];
  arr.push(entry);
  BY_TEAM.set(r.team, arr);
}

/**
 * Slå en rytter op på navn (+ evt. holdkode som hjælp ved delvise navne).
 * @param {string} name      fx "Tadej Pogačar" eller "POGACAR Tadej"
 * @param {string} [teamCode] fx "UEX" — bruges ved delvist navnematch
 * @returns {{bib:number, profile:string}|null}
 */
export function riderInfo(name, teamCode) {
  if (!name) return null;
  const hit = BY_KEY.get(nameKey(name));
  if (hit) return hit;
  // Delvist match inden for holdet: mindst 2 fælles ord, eller præcis én
  // kandidat med ét fælles ord på 3+ tegn (8 ryttere pr. hold → trygt).
  const t = tokens(name);
  if (t.size === 0) return null;
  const pool = teamCode ? (BY_TEAM.get(teamCode) || []) : RIDERS.map((r) => BY_KEY.get(nameKey(`${r.first} ${r.last}`)));
  const scored = pool
    .map((r) => {
      const rt = tokens(`${r.first} ${r.last}`);
      let common = 0;
      let longCommon = 0;
      for (const w of t) if (rt.has(w)) { common += 1; if (w.length >= 3) longCommon += 1; }
      return { r, common, longCommon };
    })
    .filter((x) => x.common >= 2 || x.longCommon >= 1)
    .sort((a, b) => b.common - a.common);
  if (scored.length === 0) return null;
  if (scored[0].common >= 2) return scored[0].r;
  // Kun ét fælles ord: kræv at det er entydigt i puljen.
  return scored.length === 1 || scored[0].common > (scored[1]?.common ?? 0) ? scored[0].r : null;
}

/** Dansk visning af letours profiltyper (label + emoji). */
export function profileLabel(profile) {
  switch (String(profile || '').toLowerCase()) {
    case 'leader': return { label: 'Kaptajn', emoji: '⭐' };
    case 'climber': return { label: 'Bjergrytter', emoji: '⛰️' };
    case 'sprinter': return { label: 'Sprinter', emoji: '🚀' };
    case 'polyvalent': return { label: 'Allrounder', emoji: '🔄' };
    default: return null;
  }
}

/** Alle ryttere for et hold (sorteret efter bib). Bruges som fallback-liste. */
export function teamRiders(teamCode) {
  return (BY_TEAM.get(teamCode) || []).slice().sort((a, b) => a.bib - b.bib);
}

export { RIDERS };
