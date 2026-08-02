// ---------------------------------------------------------------------------
// gameCompetitions – beregner spillets fire konkurrencer (etapevinder-hold,
// bedste hold, flest bjergpoint, flest sprintpoint) som HOLD-stillinger med top-5
// hold og en specifikation af hvilke ryttere der udgør hvert holds resultat.
// Bygger på config/classifications (seneste etapes målrækkefølge + bjerg/sprint-
// stillinger). Rangeringen matcher tourScoring.
// ---------------------------------------------------------------------------
import { gcTeamStanding, DEFAULT_GC_TOP_N } from '../../lib/tourScoring';

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

/**
 * Bedste hold: holdets N bedst placerede rytteres målplaceringer summeres;
 * LAVEST sum vinder. Genbruger scoringens gcTeamStanding, så visning = facit.
 */
function gcComp(finish, topN) {
  return gcTeamStanding(finish, topN)
    .slice(0, 5)
    .map((t) => ({ team: t.team, sum: t.sum, riders: t.riders }));
}

/**
 * @param {object} data  config/classifications ({ stageResult, standings:{bjerg,sprint} })
 * @param {number} [gcTopN=DEFAULT_GC_TOP_N]
 * @returns {{winnerTeam:Array, gcTeam:Array, mountainTeam:Array, sprintTeam:Array}}
 */
export function gameCompetitions(data, gcTopN = DEFAULT_GC_TOP_N) {
  const finish = data?.stageResult || [];
  // Bjerg/sprint = point PÅ seneste etape (det man tipper), ikke kumulativt.
  // `stagePoints` skrives af synken; falder tilbage til de kumulative
  // klassementer for gamle classifications-docs (før feltet fandtes).
  const bjerg = data?.stagePoints?.bjerg ?? data?.standings?.bjerg;
  const sprint = data?.stagePoints?.sprint ?? data?.standings?.sprint;
  return {
    winnerTeam: winnerComp(finish),
    gcTeam: gcComp(finish, gcTopN),
    mountainTeam: pointsComp(bjerg),
    sprintTeam: pointsComp(sprint),
  };
}
