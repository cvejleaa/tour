// ---------------------------------------------------------------------------
// teamNameAudit — ren logik for "Holdnavne-gennemgang" i admin:
// find alle holdnavne der optræder i data (etape-tip + teams-kollektionen),
// og klassificér dem mod den officielle 2026-liste:
//   official : præcis det officielle navn — alt vel
//   variant  : anden stavemåde/alias af et kendt hold (matcher via kanonisk
//              nøgle) — scoring og visning håndterer det automatisk
//   unknown  : navn der IKKE kan knyttes til noget hold (fx et 2025-navn fra
//              en gammel holdliste) — skal omdøbes med remapTeamName
// ---------------------------------------------------------------------------
import { canonicalTeamKey } from '../../lib/tourTeams';

export const BET_TEAM_FIELDS = ['winnerTeam', 'gcTeam', 'mountainTeam', 'sprintTeam'];

/**
 * @param {Array<object>} bets       stageBets-docs (data)
 * @param {Array<{name?:string}>} teamDocs teams-docs (data)
 * @param {string[]} officialNames   den officielle holdliste (TOUR_TEAMS)
 * @returns {Array<{name:string, count:number, inTeamsCol:boolean, status:'official'|'variant'|'unknown', official:?string}>}
 *          sorteret: unknown først, dernæst variant, dernæst official (efter antal).
 */
export function auditTeamNames(bets, teamDocs, officialNames) {
  const officialByKey = new Map((officialNames || []).map((n) => [canonicalTeamKey(n), n]));
  const officialSet = new Set(officialNames || []);

  const counts = new Map(); // navn -> {count, inTeamsCol}
  const seen = (name, inTeamsCol) => {
    const n = String(name || '').trim();
    if (!n) return;
    const e = counts.get(n) || { count: 0, inTeamsCol: false };
    if (inTeamsCol) e.inTeamsCol = true;
    else e.count += 1;
    counts.set(n, e);
  };

  for (const bet of bets || []) {
    for (const f of BET_TEAM_FIELDS) seen(bet?.[f], false);
  }
  for (const t of teamDocs || []) seen(t?.name, true);

  const RANK = { unknown: 0, variant: 1, official: 2 };
  return [...counts.entries()]
    .map(([name, e]) => {
      const official = officialByKey.get(canonicalTeamKey(name)) || null;
      const status = officialSet.has(name) ? 'official' : (official ? 'variant' : 'unknown');
      return { name, count: e.count, inTeamsCol: e.inTeamsCol, status, official };
    })
    .sort((a, b) => (RANK[a.status] - RANK[b.status]) || (b.count - a.count)
      || a.name.localeCompare(b.name, 'da'));
}
