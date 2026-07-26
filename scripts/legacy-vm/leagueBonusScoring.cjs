// VENDORED fra cvejleaa/VM functions/leagueBonusScoring.js — VM-appens egen scoring-logik,
// kopieret uændret så eksporten af gamle liga-slutstillinger regner PRÆCIS som appen gjorde.
'use strict';
// ---------------------------------------------------------------------------
// leagueBonusScoring.js — server-side spejl af frontendens leagueBonusScoring
// (individuelle liga-bonusspørgsmål). Bruges af takke-mailen til at inkludere
// liga-bonus i slutstillingerne. Genbruger fuzzyNameMatch/normalizeName fra
// scoring.js, så pointene matcher app'ens visning.
// ---------------------------------------------------------------------------
const { normalizeName, fuzzyNameMatch } = require('./scoring.cjs');

const LB_TYPE = { TEXT: 'text', CHOICE: 'choice', TOPLIST: 'toplist', YESNO: 'yesno' };
const LB_POINTS = { TEXT: 3, CHOICE: 3, YESNO: 2, TOPLIST_NAME: 2, TOPLIST_POSITION: 1 };

function norm(s) {
  return String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Point for ét svar på et liga-bonusspørgsmål (spejler frontend).
 * @param {{type:string, facit:any, acceptedAnswers?:string[]}} question
 * @param {any} answer
 * @returns {number}
 */
function scoreLeagueBonus(question, answer) {
  if (!question || question.facit == null || question.facit === '') return 0;
  if (answer == null || answer === '') return 0;
  const { type, facit } = question;
  const accepted = Array.isArray(question.acceptedAnswers) ? question.acceptedAnswers : [];

  switch (type) {
    case LB_TYPE.TEXT: {
      const candidates = [facit, ...accepted].filter((c) => c != null && String(c).trim() !== '');
      return candidates.some((c) => fuzzyNameMatch(answer, c)) ? LB_POINTS.TEXT : 0;
    }
    case LB_TYPE.CHOICE:
      return norm(answer) === norm(facit) ? LB_POINTS.CHOICE : 0;
    case LB_TYPE.YESNO:
      return norm(answer) === norm(facit) ? LB_POINTS.YESNO : 0;
    case LB_TYPE.TOPLIST: {
      const facitArr = Array.isArray(facit) ? facit : [];
      const ansArr = Array.isArray(answer) ? answer : [];
      const consumed = new Array(facitArr.length).fill(false);
      const seen = new Set();
      let pts = 0;
      ansArr.forEach((name, idx) => {
        const key = normalizeName(name);
        if (!key || seen.has(key)) return;
        seen.add(key);
        let facitIdx = -1;
        for (let i = 0; i < facitArr.length; i++) {
          if (!consumed[i] && fuzzyNameMatch(name, facitArr[i])) { facitIdx = i; break; }
        }
        if (facitIdx === -1) return;
        consumed[facitIdx] = true;
        pts += LB_POINTS.TOPLIST_NAME;
        if (facitIdx === idx) pts += LB_POINTS.TOPLIST_POSITION;
      });
      return pts;
    }
    default:
      return 0;
  }
}

/**
 * Point pr. uid for en ligas bonusspørgsmål. Kun spørgsmål med facit tæller
 * (samme regel som app'ens pointsByUid).
 * @param {Array<object>} questions  ligaens spørgsmål ({id, facit, type, ...})
 * @param {Array<{uid:string, questionId:string, answer:any}>} answers  alle svar i ligaen
 * @returns {Object<string, number>} uid → point
 */
function leagueBonusPointsByUid(questions, answers) {
  const qById = {};
  for (const q of (questions || [])) qById[q.id] = q;
  const totals = {};
  for (const a of (answers || [])) {
    const q = qById[a.questionId];
    if (!q || q.facit == null || q.facit === '') continue;
    const pts = scoreLeagueBonus(q, a.answer);
    if (pts) totals[a.uid] = (totals[a.uid] || 0) + pts;
  }
  return totals;
}

module.exports = { scoreLeagueBonus, leagueBonusPointsByUid, LB_POINTS, LB_TYPE };
