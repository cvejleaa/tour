/**
 * Ren scoring-logik for individuelle liga-bonusspørgsmål.
 * Bruges klient-side (point tæller kun i den pågældende liga).
 */
import { LEAGUE_BONUS_TYPE } from '../../lib/constants';
import { fuzzyNameMatch, normalizeName } from '../../lib/scoring';

export const LB_POINTS = {
  TEXT: 3,
  CHOICE: 3,
  YESNO: 2,
  TOPLIST_NAME: 2,      // pr. korrekt navn (uanset plads)
  TOPLIST_POSITION: 1,  // ekstra hvis navnet står på den rigtige plads
};

/** Normalisér en streng til simpel sammenligning (valg/ja-nej). */
function norm(s) {
  return String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Beregn point for ét svar på et liga-bonusspørgsmål.
 * @param {{type:string, facit:any, acceptedAnswers?:string[]}} question
 * @param {any} answer  – svarets værdi (string | string[] afhængig af type)
 * @returns {number}
 */
export function scoreLeagueBonus(question, answer) {
  if (!question || question.facit == null || question.facit === '') return 0;
  if (answer == null || answer === '') return 0;
  const { type, facit } = question;
  const accepted = Array.isArray(question.acceptedAnswers) ? question.acceptedAnswers : [];

  switch (type) {
    case LEAGUE_BONUS_TYPE.TEXT: {
      // Fuzzy-match mod facit eller en manuelt godkendt stavemåde
      const candidates = [facit, ...accepted].filter((c) => c != null && String(c).trim() !== '');
      return candidates.some((c) => fuzzyNameMatch(answer, c)) ? LB_POINTS.TEXT : 0;
    }

    case LEAGUE_BONUS_TYPE.CHOICE:
      return norm(answer) === norm(facit) ? LB_POINTS.CHOICE : 0;

    case LEAGUE_BONUS_TYPE.YESNO:
      return norm(answer) === norm(facit) ? LB_POINTS.YESNO : 0;

    case LEAGUE_BONUS_TYPE.TOPLIST: {
      const facitArr = Array.isArray(facit) ? facit : [];
      const ansArr = Array.isArray(answer) ? answer : [];
      const consumed = new Array(facitArr.length).fill(false);
      const seen = new Set(); // dedupliker svarets navne
      let pts = 0;
      ansArr.forEach((name, idx) => {
        const key = normalizeName(name);
        if (!key || seen.has(key)) return; // tomt eller dublet
        seen.add(key);
        // Find første ikke-brugte facit-plads der matcher (fuzzy)
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
 * Summér en spillers point på tværs af en ligas bonusspørgsmål.
 * @param {Array<object>} questions
 * @param {Record<string, any>} answersByQid – qid → svarets værdi for denne spiller
 * @returns {number}
 */
export function sumLeagueBonus(questions, answersByQid) {
  let total = 0;
  for (const q of questions) {
    total += scoreLeagueBonus(q, answersByQid[q.id]);
  }
  return total;
}
