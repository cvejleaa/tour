// ---------------------------------------------------------------------------
// functions/bonusResolve.js — ren, testbar logik til at afgøre gruppevinder-
// bonusspørgsmål ud fra færdigspillede gruppekampe. Ingen Firebase/HTTP.
//
// Når alle 6 kampe i en gruppe er finished, beregnes gruppevinderen med samme
// FIFA-rangering som knockout-bracketten (computeGroupStandings) og foreslås
// som facit. Allerede satte facit (fx manuelt rettet af admin) røres aldrig.
// ---------------------------------------------------------------------------
'use strict';

const { computeGroupStandings } = require('./standings');

// 4 hold i en gruppe → 6 kampe. Gruppen regnes som færdigspillet ved 6 finished.
const GROUP_MATCH_COUNT = 6;

/** Er facit reelt tomt (ikke afgjort endnu)? */
function isUnset(facit) {
  return facit == null || String(facit).trim() === '';
}

/**
 * Find gruppevindere der kan afgøres nu.
 *
 * @param {Array<{id:string, type:string, groupName:string, facit?:string, options?:string[]}>} questions
 *   Bonusspørgsmål (forventer id sat).
 * @param {Array<{groupName:string, homeTeam:string, awayTeam:string, result:object}>} finishedGroupMatches
 *   Kun finished gruppekampe (round === 'group').
 * @returns {Array<{questionId:string, groupName:string, facit:string}>}
 *   Én post pr. gruppe der nu kan afgøres (uafgjorte spørgsmål med fuld gruppe).
 */
function resolveGroupWinners(questions, finishedGroupMatches) {
  const byGroup = {};
  for (const m of finishedGroupMatches || []) {
    if (!m || !m.groupName) continue;
    (byGroup[m.groupName] ||= []).push(m);
  }

  const out = [];
  for (const q of questions || []) {
    if (!q || q.type !== 'groupWinner' || !q.groupName) continue;
    if (!isUnset(q.facit)) continue; // allerede afgjort (evt. manuelt) — rør ikke
    const gm = byGroup[q.groupName] || [];
    if (gm.length < GROUP_MATCH_COUNT) continue; // gruppen er ikke færdigspillet

    // Brug spørgsmålets valgmuligheder som holdliste når den findes (robust),
    // ellers udled holdene fra kampene.
    let teams = Array.isArray(q.options) && q.options.length ? q.options : null;
    if (!teams) {
      const set = new Set();
      for (const m of gm) { set.add(m.homeTeam); set.add(m.awayTeam); }
      teams = [...set];
    }

    const standings = computeGroupStandings(teams, gm);
    const winner = standings[0]?.team;
    if (!winner) continue;
    out.push({ questionId: q.id, groupName: q.groupName, facit: winner });
  }
  return out;
}

module.exports = { resolveGroupWinners, isUnset, GROUP_MATCH_COUNT };
