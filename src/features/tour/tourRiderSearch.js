// ---------------------------------------------------------------------------
// Rytter-søgning på tværs af ALLE Tour-stillinger (samlet/point/bjerg/ungdom
// + seneste etaperesultat). Ren logik — UI'et bor i TourRiderSearch.jsx.
// ---------------------------------------------------------------------------

/** Konkurrencerne der søges i, med visningsmetadata. */
export const SEARCH_COMPS = [
  { key: 'samlet', label: 'Samlet', icon: '🟡' },
  { key: 'sprint', label: 'Point', icon: '🟢' },
  { key: 'bjerg', label: 'Bjerg', icon: '🔴' },
  { key: 'ungdom', label: 'Ungdom', icon: '⚪' },
];

function norm(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/**
 * Find ryttere der matcher søgningen, med deres placering i HVER stilling.
 * @param {object} standings   {samlet:[], sprint:[], bjerg:[], ungdom:[], hold:[]}
 * @param {Array}  stageResult seneste etaperesultat (rækker med rank/rider/team)
 * @param {string} query
 * @param {number} [limit]
 * @returns {Array<{rider:string, team:?string, places:Record<string,{rank:number, points:?number, time:?string}>}>}
 */
export function searchTourStandings(standings, stageResult, query, limit = 8) {
  const q = norm(query).trim();
  if (q.length < 2) return [];

  const byRider = new Map();
  const scan = (rows, compKey) => {
    for (const r of rows || []) {
      if (!r?.rider || !norm(r.rider).includes(q)) continue;
      const key = norm(r.rider);
      const e = byRider.get(key) || { rider: r.rider, team: r.team ?? null, places: {} };
      if (!e.places[compKey]) {
        e.places[compKey] = { rank: r.rank ?? null, points: r.points ?? null, time: r.time ?? null };
      }
      if (!e.team && r.team) e.team = r.team;
      byRider.set(key, e);
    }
  };

  for (const { key } of SEARCH_COMPS) scan(standings?.[key], key);
  scan(stageResult, 'etape');

  return [...byRider.values()]
    .sort((a, b) => (a.places.samlet?.rank ?? Infinity) - (b.places.samlet?.rank ?? Infinity))
    .slice(0, limit);
}
