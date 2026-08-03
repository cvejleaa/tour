// ---------------------------------------------------------------------------
// Udspecificeret stilling: point pr. spørgsmål (Q1–Q4) pr. spiller, regnet
// klient-side af alle stageBets på AFGJORTE etaper (læsbare efter etapestart,
// jf. firestore.rules) mod etapernes facit. Straffe (-1 for utippet) fanges
// som differencen mellem bettets samlede point og summen af spørgsmålene.
// ---------------------------------------------------------------------------
import { scoreStageBet, STAGE_FIELDS, activeQuestionsForStage } from '../../lib/tourScoring';

/** Tom breakdown-post. */
export function emptyBreakdown() {
  return { winnerTeam: 0, gcTeam: 0, mountainTeam: 0, sprintTeam: 0, straf: 0 };
}

/**
 * @param {Array<object>} stages  AFGJORTE etaper (med result)
 * @param {Record<string, Array<object>>} betsByStageId  stageId -> bet-docs
 * @param {object} [points]  point-config
 * @returns {Record<string, {winnerTeam:number, gcTeam:number, mountainTeam:number, sprintTeam:number, straf:number}>}
 */
export function computeStandingsBreakdown(stages, betsByStageId, points = {}) {
  const byUid = {};
  for (const s of stages || []) {
    if (!s?.result) continue;
    const active = activeQuestionsForStage(s);
    for (const bet of betsByStageId?.[s.id] || []) {
      if (!bet?.uid) continue;
      const scored = scoreStageBet(bet, s.result, points, active);
      const e = byUid[bet.uid] || (byUid[bet.uid] = emptyBreakdown());
      let fieldSum = 0;
      for (const { key } of STAGE_FIELDS) {
        const p = scored.breakdown?.[key] ?? 0;
        e[key] += p;
        fieldSum += p;
      }
      // Alt der ikke stammer fra et spørgsmål (i praksis utippet-straffen).
      e.straf += scored.points - fieldSum;
    }
  }
  return byUid;
}
