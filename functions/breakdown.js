// ---------------------------------------------------------------------------
// functions/breakdown.js — ren logik til at opdele en spillers point i
// grundspil / slutspil / bonus, så ligaer kan rangere efter et udvalg.
// ---------------------------------------------------------------------------
'use strict';

/**
 * Opdel point i kategorier.
 * @param {Array<{matchId:string, points?:number}>} bets
 * @param {Array<{points?:number}>} bonusBets
 * @param {Record<string,string>} roundById  matchId → round ('group' | knockout)
 * @returns {{ total:number, groupPoints:number, knockoutPoints:number, bonusPoints:number }}
 */
function computeBreakdown(bets, bonusBets, roundById) {
  let groupPoints = 0;
  let knockoutPoints = 0;
  let bonusPoints = 0;

  for (const b of bets) {
    const pts = typeof b.points === 'number' ? b.points : 0;
    if (!pts) continue;
    const round = roundById[b.matchId];
    if (round && round !== 'group') knockoutPoints += pts;
    else groupPoints += pts;
  }
  for (const bb of bonusBets) {
    const pts = typeof bb.points === 'number' ? bb.points : 0;
    bonusPoints += pts;
  }

  return {
    total: groupPoints + knockoutPoints + bonusPoints,
    groupPoints,
    knockoutPoints,
    bonusPoints,
  };
}

module.exports = { computeBreakdown };
