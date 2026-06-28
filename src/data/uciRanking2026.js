// UCI verdensrangliste 2026 (snapshot fra dataride.uci.ch) — hold + ryttere.
// Vores holdkoder er identiske med UCI's (UEX, RBH, TVL, …), så hold matches
// direkte på kode. Ryttere matches på navn (rækkefølge-uafhængigt), så de kan
// kobles på startlisten når den fyldes.
import TEAM_RANK from './uciTeamRanking2026.json';
import RIDER_RANK from './uciRiderRanking2026.json';

/** Dato for ranglisten (Date eller null). */
export const UCI_RANKING_DATE = TEAM_RANK.date_ms ? new Date(TEAM_RANK.date_ms) : null;

/** Antal ryttere i snapshot'et (verdens top-N). */
export const UCI_RIDER_TOP_N = RIDER_RANK.riders.length;

/**
 * UCI verdensrang for et hold.
 * @param {string} code  holdkode (= UCI-kode)
 * @returns {{rank:number, points:number}|null}
 */
export function teamWorldRank(code) {
  return (code && TEAM_RANK.teams[code]) || null;
}

/**
 * Holdets ryttere der ligger i verdens top-N, sorteret efter rang.
 * @param {string} code
 * @returns {Array<{rank:number,name:string,points:number,team:string,nat:string,flag:string,age:number}>}
 */
export function teamWorldRiders(code) {
  return RIDER_RANK.riders
    .filter((r) => r.team === code)
    .sort((a, b) => a.rank - b.rank);
}

// Robust navne-match: for-/efternavn er adskilt i data (UCI har efternavnet i
// caps). En rytter matcher hvis FORnavnet optræder i søgenavnet OG mindst ét
// EFTERnavn-ord gør. Det håndterer mellemnavne (UCI: "Lenny Sydney Martinez"
// vs startliste: "Lenny Martinez"), omvendt rækkefølge og accenter.
function normWord(w) {
  return String(w || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
}
function nameTokens(name) {
  return new Set(String(name || '').split(/\s+/).map(normWord).filter(Boolean));
}

// Forindekser ryttere med normaliseret for-/efternavn (samme NFD-normalisering
// som søgenavnet), så accenter (fx Pogačar) altid matcher.
const INDEXED = RIDER_RANK.riders.map((r) => ({
  ref: r,
  first: normWord(r.first),
  last: (Array.isArray(r.last) ? r.last : []).map(normWord).filter(Boolean),
}));

/**
 * Slå en rytters verdensrang op på navn. Hvis `team` (holdkode) gives, søges
 * kun blandt holdets ryttere — det fjerner risiko for navnesammenfald.
 * @param {string} name
 * @param {string} [team]
 * @returns {{rank:number, points:number, name:string}|null}
 */
export function riderWorldRank(name, team) {
  const q = nameTokens(name);
  if (q.size === 0) return null;
  let best = null;
  for (const x of INDEXED) {
    if (team && x.ref.team !== team) continue;
    if (!x.first || !q.has(x.first)) continue;
    if (!x.last.some((t) => q.has(t))) continue;
    if (!best || x.ref.rank < best.rank) best = x.ref;
  }
  return best;
}

/** Flag-emoji ud fra ISO-3166-1 alpha-2 (fx 'dk' → 🇩🇰). */
export function flagEmoji(iso2) {
  const c = String(iso2 || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return '';
  return String.fromCodePoint(...[...c].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}
