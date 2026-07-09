// ---------------------------------------------------------------------------
// riderTypeStats — kobler rytter-profiltyper (leader/climber/sprinter/
// polyvalent) sammen med de FULDE Tour-klassementer (config/classifications),
// så holdsiden kan vise fx "alle bjergryttere" med deres placering/point/tid i
// hver konkurrence indtil videre. Ren logik — UI'et bor i RiderTypeExplorer.
// ---------------------------------------------------------------------------
import { RIDERS, riderInfo } from '../../data/ridersTdf2026';

// Konkurrence-kolonner der vises (nøgle i standings + værditype).
export const STAT_COMPS = [
  { key: 'samlet', label: 'Samlet', icon: '🟡', valueType: 'time' },
  { key: 'sprint', label: 'Point', icon: '🟢', valueType: 'points' },
  { key: 'bjerg', label: 'Bjerg', icon: '🔴', valueType: 'points' },
  { key: 'ungdom', label: 'Ungdom', icon: '⚪', valueType: 'time' },
];

/**
 * Byg et opslag bib → { samlet:{rank,time}, sprint:{rank,points}, ... } ud fra
 * de fulde klassementer. Rytternavnene i stillingen (letour-format) matches
 * tolerant til rytter-filen via riderInfo, så vi kan nøgle på startnummer.
 * @param {object} standings  {samlet,sprint,bjerg,ungdom,hold}
 * @returns {Map<number, object>}
 */
export function buildRiderStats(standings) {
  const byBib = new Map();
  for (const { key } of STAT_COMPS) {
    const rows = (standings && standings[key]) || [];
    for (const r of rows) {
      if (!r || !r.rider) continue;
      const info = riderInfo(r.rider);
      if (!info || info.bib == null) continue;
      const e = byBib.get(info.bib) || {};
      if (!e[key]) {
        e[key] = {
          rank: Number.isFinite(Number(r.rank)) ? Number(r.rank) : null,
          points: r.points != null ? Number(r.points) : null,
          time: r.time ?? null,
        };
      }
      byBib.set(info.bib, e);
    }
  }
  return byBib;
}

/** Alle ryttere med en given profiltype (fra rytter-filen). */
export function ridersOfProfile(profile) {
  const p = String(profile || '').toLowerCase();
  return RIDERS.filter((r) => String(r.profile || '').toLowerCase() === p)
    .map((r) => ({ bib: r.bib, first: r.first, last: r.last, nat: r.nat, team: r.team }));
}

/**
 * Sammensæt tabelrækker for en profiltype: rytter + stats pr. konkurrence.
 * @param {string} profile
 * @param {Map<number,object>} statsByBib
 * @returns {Array<{bib,first,last,nat,team,stats:object}>}
 */
export function riderRowsForProfile(profile, statsByBib) {
  return ridersOfProfile(profile).map((r) => ({ ...r, stats: statsByBib.get(r.bib) || {} }));
}

/**
 * Sorter-komparator for en kolonne. Kolonner:
 *   'name' → alfabetisk (efternavn, dansk).
 *   comp-nøgle → point-konkurrencer sorteres FALDENDE efter point (flest
 *     først), tids-konkurrencer STIGENDE efter placering (bedst først).
 * Ryttere uden værdi i kolonnen lægges altid sidst.
 * @param {string} col
 * @param {boolean} desc  vend retningen (kun for name; comp-kolonner har naturlig retning)
 */
export function riderRowComparator(col, desc = false) {
  if (col === 'name') {
    return (a, b) => {
      const r = `${a.last} ${a.first}`.localeCompare(`${b.last} ${b.first}`, 'da');
      return desc ? -r : r;
    };
  }
  const comp = STAT_COMPS.find((c) => c.key === col);
  if (!comp) return () => 0;
  return (a, b) => {
    const sa = a.stats[col];
    const sb = b.stats[col];
    const has = (s) => s && (comp.valueType === 'points' ? s.points != null : s.rank != null);
    if (!has(sa) && !has(sb)) return 0;
    if (!has(sa)) return 1; // a mangler → sidst
    if (!has(sb)) return -1;
    if (comp.valueType === 'points') {
      const d = (sb.points || 0) - (sa.points || 0); // flest point først
      return desc ? -d : d;
    }
    const d = (sa.rank || Infinity) - (sb.rank || Infinity); // bedste placering først
    return desc ? -d : d;
  };
}
