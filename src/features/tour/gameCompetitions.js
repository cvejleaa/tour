// ---------------------------------------------------------------------------
// gameCompetitions – beregner spillets fire konkurrencer (etapevinder-hold,
// bedste hold, flest bjergpoint, flest sprintpoint) som HOLD-stillinger med top-5
// hold og en specifikation af hvilke ryttere der udgør hvert holds resultat.
// Bygger på config/classifications (seneste etapes målrækkefølge + bjerg/sprint-
// stillinger). Rangeringen matcher tourScoring: højeste sum → flest tællende
// ryttere → alfabetisk.
// ---------------------------------------------------------------------------

function rankTeams(map) {
  return [...map.values()].sort((a, b) => (
    (b.total - a.total)
    || (b.riders.length - a.riders.length)
    || (a.team < b.team ? -1 : a.team > b.team ? 1 : 0)
  ));
}

/** Point-konkurrence (bjerg/sprint) fra klassement-rækker [{rider, team, points}]. */
function pointsComp(rows) {
  const map = new Map();
  for (const r of rows || []) {
    const team = r && r.team;
    const pts = Number(r && r.points) || 0;
    if (!team || pts <= 0) continue;
    const cur = map.get(team) || { team, total: 0, riders: [] };
    cur.total += pts;
    cur.riders.push({ rider: r.rider, points: pts });
    map.set(team, cur);
  }
  return rankTeams(map)
    .slice(0, 5)
    .map((t) => ({ team: t.team, total: t.total, riders: t.riders.sort((a, b) => b.points - a.points) }));
}

/** Etapevinder-hold: holdets placering = dets bedst placerede rytter i mål. */
function winnerComp(finish) {
  const map = new Map();
  (finish || []).forEach((r, i) => {
    const team = r && r.team;
    if (!team) return;
    const rank = Number(r.rank) || i + 1;
    const cur = map.get(team) || { team, best: Infinity, riders: [] };
    cur.best = Math.min(cur.best, rank);
    cur.riders.push({ rider: r.rider, rank });
    map.set(team, cur);
  });
  return [...map.values()]
    .sort((a, b) => (a.best - b.best) || (a.team < b.team ? -1 : a.team > b.team ? 1 : 0))
    .slice(0, 5)
    .map((t) => ({ team: t.team, best: t.best, riders: t.riders.sort((a, b) => a.rank - b.rank).slice(0, 4) }));
}

/** Bedste hold: point = (N − position + 1) for hver rytter i top-N, sum pr. hold. */
function gcComp(finish, topN) {
  const n = Math.max(1, Math.floor(Number(topN) || 10));
  const map = new Map();
  (finish || []).slice(0, n).forEach((r, i) => {
    const team = r && r.team;
    if (!team) return;
    const pts = n - i;
    const cur = map.get(team) || { team, total: 0, riders: [] };
    cur.total += pts;
    cur.riders.push({ rider: r.rider, rank: Number(r.rank) || i + 1, points: pts });
    map.set(team, cur);
  });
  return rankTeams(map)
    .slice(0, 5)
    .map((t) => ({ team: t.team, total: t.total, riders: t.riders.sort((a, b) => a.rank - b.rank) }));
}

/**
 * @param {object} data  config/classifications ({ stageResult, standings:{bjerg,sprint} })
 * @param {number} [gcTopN=10]
 * @returns {{winnerTeam:Array, gcTeam:Array, mountainTeam:Array, sprintTeam:Array}}
 */
export function gameCompetitions(data, gcTopN = 10) {
  const finish = data?.stageResult || [];
  return {
    winnerTeam: winnerComp(finish),
    gcTeam: gcComp(finish, gcTopN),
    mountainTeam: pointsComp(data?.standings?.bjerg),
    sprintTeam: pointsComp(data?.standings?.sprint),
  };
}
