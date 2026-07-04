// ---------------------------------------------------------------------------
// tippedTeams – ren logik: saml de hold der optræder i et sæt etape-tips.
// Bruges til at fremhæve ryttere fra tippede hold på Tour-stillingen.
// Sættet indeholder KANONISKE hold-nøgler (normaliseret + alias), så et tip
// på "Netcompany Ineos" også fremhæver rækker hvor resultattabellen skriver
// "INEOS GRENADIERS". Sammenlign altid med canonicalTeamKey(row.team).
// ---------------------------------------------------------------------------
import { canonicalTeamKey } from '../../lib/tourTeams';

const TEAM_KEYS = ['winnerTeam', 'gcTeam', 'mountainTeam', 'sprintTeam'];

/**
 * @param {Array<object>} bets  etape-tips (hver med op til fire holdvalg)
 * @returns {Set<string>}  distinkte kanoniske hold-nøgler
 */
export function collectTippedTeams(bets) {
  const set = new Set();
  for (const b of Array.isArray(bets) ? bets : []) {
    if (!b) continue;
    for (const k of TEAM_KEYS) {
      const v = b[k];
      if (v) set.add(canonicalTeamKey(v));
    }
  }
  return set;
}
