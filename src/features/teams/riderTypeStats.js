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

/**
 * Alle ryttere med en given profiltype. Med et valgfrit typeOverrides-kort
 * (bib → type) vinder en manuel override over den statiske letour-profil, så en
 * rytter kan flyttes til en anden type på admin-siden.
 * @param {string} profile
 * @param {Map<number,string>} [typeOverrides]
 */
export function ridersOfProfile(profile, typeOverrides = null) {
  const p = String(profile || '').toLowerCase();
  const effType = (r) => {
    const o = typeOverrides && typeOverrides.get(Number(r.bib));
    return String(o || r.profile || '').toLowerCase();
  };
  return RIDERS.filter((r) => effType(r) === p)
    .map((r) => ({ bib: r.bib, first: r.first, last: r.last, nat: r.nat, team: r.team }));
}

/**
 * Sammensæt tabelrækker for en profiltype: rytter + stats pr. konkurrence.
 * @param {string} profile
 * @param {Map<number,object>} statsByBib
 * @param {Map<number,string>} [typeOverrides]
 * @returns {Array<{bib,first,last,nat,team,stats:object}>}
 */
export function riderRowsForProfile(profile, statsByBib, typeOverrides = null) {
  return ridersOfProfile(profile, typeOverrides).map((r) => ({ ...r, stats: statsByBib.get(r.bib) || {} }));
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
  if (col === 'team') {
    return (a, b) => {
      const r = String(a.teamName || a.team || '').localeCompare(String(b.teamName || b.team || ''), 'da')
        || `${a.last} ${a.first}`.localeCompare(`${b.last} ${b.first}`, 'da');
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

/**
 * Holdets samlede værdi i en kolonne: SUM af point (point-konkurrencer) eller
 * BEDSTE (laveste) placering (tids-konkurrencer). null når kolonnen ikke er en
 * konkurrence (navn/hold) eller holdet ingen data har.
 */
export function teamAggregate(teamRows, col) {
  const comp = STAT_COMPS.find((c) => c.key === col);
  if (!comp) return null;
  if (comp.valueType === 'points') {
    let any = false;
    let sum = 0;
    for (const r of teamRows) {
      const p = r.stats?.[col]?.points;
      if (p != null) { any = true; sum += p; }
    }
    return any ? sum : null;
  }
  const ranks = teamRows.map((r) => r.stats?.[col]?.rank).filter((x) => x != null);
  return ranks.length ? Math.min(...ranks) : null;
}

/**
 * Gruppér rytter-rækker på hold og sortér HOLDENE efter deres samlede værdi i
 * den valgte kolonne (point-konkurrence: flest samlede point først; tids-
 * konkurrence: bedste placering først; navn/hold: alfabetisk). Rækkerne inden
 * for hvert hold bevarer den rækkefølge de kommer i (dvs. rytter-sorteringen).
 * @returns {Array<{teamName:string, rows:Array, agg:number|null}>}
 */
export function groupRowsByTeam(rows, col, desc = false) {
  const m = new Map();
  for (const r of rows || []) {
    const key = r.teamName || r.team || '—';
    if (!m.has(key)) m.set(key, []);
    m.get(key).push(r);
  }
  const comp = STAT_COMPS.find((c) => c.key === col);
  const entries = [...m.entries()].map(([teamName, teamRows]) => ({
    teamName, rows: teamRows, agg: teamAggregate(teamRows, col),
  }));
  entries.sort((a, b) => {
    if (!comp) {
      const r = a.teamName.localeCompare(b.teamName, 'da');
      return desc ? -r : r;
    }
    if (a.agg == null && b.agg == null) return a.teamName.localeCompare(b.teamName, 'da');
    if (a.agg == null) return 1; // hold uden data → sidst
    if (b.agg == null) return -1;
    const d = comp.valueType === 'points' ? (b.agg - a.agg) : (a.agg - b.agg);
    return desc ? -d : d;
  });
  return entries;
}
