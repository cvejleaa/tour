// ---------------------------------------------------------------------------
// leagueBonus.js — server-side beregning af LIGA-lokale bonuspoint:
//   1) ligaens egne bonusspørgsmål (leagueBonus/leagueBonusAnswers)
//   2) manuelle tildelinger på fælles spørgsmål (leagueBonusAwards)
//
// SPEJL af src/features/leagues/leagueBonusScoring.js + leagueAwards.js —
// samme regler (NUMBER = nærmest-vinder pr. liga; øvrige typer eksakt,
// rækkefølge-uafhængigt for arrays). Eneste bevidste afvigelse: TEXT scores
// med normaliseret eksakt match + acceptedAnswers (som de officielle
// bonusspørgsmål på serveren) frem for frontendens fuzzy-match.
//
// Bruges af AI-morgenopslaget, så bottens stilling matcher ligaens stilling.
// ---------------------------------------------------------------------------

'use strict';

const { bonusNorm } = require('./tourScoring');

const DEFAULT_LB_POINTS = 5;

/** Spørgsmålets point (positivt tal, ellers standard). */
function questionPoints(question) {
  const p = Number(question && question.points);
  return Number.isFinite(p) && p > 0 ? p : DEFAULT_LB_POINTS;
}

/** Er en værdi (facit/svar) tom? Tomt array tæller som tomt. */
function valueEmpty(v) {
  if (v == null) return true;
  if (Array.isArray(v)) return v.length === 0;
  return String(v).trim() === '';
}

/**
 * Vinder-uid'er for et NUMBER-spørgsmål: nærmest facit; alle nærmeste ved
 * uafgjort. Spejl af frontendens closestWinners.
 */
function closestWinners(facit, submissions = []) {
  const winners = new Set();
  if (facit == null || facit === '') return winners;
  const target = Number(facit);
  if (!Number.isFinite(target)) return winners;
  let best = Infinity;
  const dists = [];
  for (const s of submissions || []) {
    const v = Number(s && s.answer);
    if (!Number.isFinite(v)) continue;
    const d = Math.abs(v - target);
    dists.push([s.uid, d]);
    if (d < best) best = d;
  }
  if (!Number.isFinite(best)) return winners;
  for (const [uid, d] of dists) if (d === best) winners.add(uid);
  return winners;
}

/**
 * Point pr. uid for ÉT liga-bonusspørgsmål, givet alle ligaens svar.
 * @param {object} question  {type, facit, points, acceptedAnswers?}
 * @param {Array<{uid:string, answer:*}>} submissions
 * @returns {Object<string, number>}
 */
function scoreLeagueBonusAll(question, submissions = []) {
  const out = {};
  if (!question || valueEmpty(question.facit)) return out;
  const pts = questionPoints(question);

  if (question.type === 'number') {
    const winners = closestWinners(question.facit, submissions);
    for (const s of submissions || []) out[s.uid] = winners.has(s.uid) ? pts : 0;
    return out;
  }

  // Eksakt (normaliseret) match; TEXT accepterer også admin-godkendte svar.
  const correct = new Set([bonusNorm(question.facit)]);
  for (const a of Array.isArray(question.acceptedAnswers) ? question.acceptedAnswers : []) {
    const an = bonusNorm(a);
    if (an !== '') correct.add(an);
  }
  for (const s of submissions || []) {
    if (valueEmpty(s && s.answer)) { out[s.uid] = 0; continue; }
    out[s.uid] = correct.has(bonusNorm(s.answer)) ? pts : 0;
  }
  return out;
}

/**
 * Samlet liga-lokal bonus pr. uid for ÉN liga: egne spørgsmål + tildelinger.
 * @param {Array<object>} questions       ligaens leagueBonus-docs (med id)
 * @param {Object<string, Array>} answersByQid  qid → [{uid, answer}]
 * @param {Array<{awards?: object}>} awardDocs  ligaens leagueBonusAwards-docs
 * @returns {Object<string, number>} uid → point
 */
function leagueBonusTotalsByUid(questions = [], answersByQid = {}, awardDocs = []) {
  const totals = {};
  for (const q of questions) {
    const perUid = scoreLeagueBonusAll(q, answersByQid[q.id] || []);
    for (const [uid, pts] of Object.entries(perUid)) {
      if (pts) totals[uid] = (totals[uid] || 0) + pts;
    }
  }
  for (const d of awardDocs || []) {
    for (const [uid, v] of Object.entries((d && d.awards) || {})) {
      const n = Number(v);
      if (Number.isFinite(n) && n !== 0) totals[uid] = (totals[uid] || 0) + n;
    }
  }
  return totals;
}

module.exports = {
  DEFAULT_LB_POINTS,
  questionPoints,
  closestWinners,
  scoreLeagueBonusAll,
  leagueBonusTotalsByUid,
};
