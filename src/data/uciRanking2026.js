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

// Rækkefølge-uafhængig navnenøgle (accent/store-små-ufølsom, sorterede ord).
function nameKey(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z\s]/g, ' ')
    .split(/\s+/).filter(Boolean).sort()
    .join(' ');
}

const BY_NAME = new Map();
for (const r of RIDER_RANK.riders) {
  const k = nameKey(r.name);
  if (k) BY_NAME.set(k, r);
}

/**
 * Slå en rytters verdensrang op på navn (rækkefølge-uafhængigt).
 * @param {string} name
 * @returns {{rank:number, points:number}|null}
 */
export function riderWorldRank(name) {
  return BY_NAME.get(nameKey(name)) || null;
}

/** Flag-emoji ud fra ISO-3166-1 alpha-2 (fx 'dk' → 🇩🇰). */
export function flagEmoji(iso2) {
  const c = String(iso2 || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return '';
  return String.fromCodePoint(...[...c].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}
