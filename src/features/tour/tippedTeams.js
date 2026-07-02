// ---------------------------------------------------------------------------
// tippedTeams – ren logik: saml de holdnavne der optræder i et sæt etape-tips.
// Bruges til at fremhæve ryttere fra tippede hold på Tour-stillingen.
// ---------------------------------------------------------------------------
const TEAM_KEYS = ['winnerTeam', 'gcTeam', 'mountainTeam', 'sprintTeam'];

/**
 * @param {Array<object>} bets  etape-tips (hver med op til fire holdvalg)
 * @returns {Set<string>}  distinkte, ikke-tomme holdnavne
 */
export function collectTippedTeams(bets) {
  const set = new Set();
  for (const b of Array.isArray(bets) ? bets : []) {
    if (!b) continue;
    for (const k of TEAM_KEYS) {
      const v = b[k];
      if (v) set.add(v);
    }
  }
  return set;
}
