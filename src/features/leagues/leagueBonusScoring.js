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
  NUMBER: 3,            // til den/de nærmeste på facit i ligaen
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

    // NUMBER afgøres relativt (mod ligaens øvrige svar) og kan derfor ikke
    // scores isoleret — brug scoreLeagueBonusAll/closestWinners i stedet.
    default:
      return 0;
  }
}

/**
 * Find vinder-uid'erne for et NUMBER-spørgsmål: dem hvis svar er tættest på
 * facit. Ved uafgjort vinder ALLE de nærmeste (fuldt point hver).
 * @param {number|string} facit
 * @param {Array<{uid:string, answer:any}>} submissions
 * @returns {Set<string>} vinder-uid'er
 */
export function closestWinners(facit, submissions = []) {
  const winners = new Set();
  if (facit == null || facit === '') return winners; // Number('') === 0 — undgå falsk facit
  const target = Number(facit);
  if (!Number.isFinite(target)) return winners;
  let best = Infinity;
  const dists = [];
  for (const s of submissions) {
    const v = Number(s?.answer);
    if (!Number.isFinite(v)) continue; // tomt/ugyldigt svar kan ikke vinde
    const d = Math.abs(v - target);
    dists.push([s.uid, d]);
    if (d < best) best = d;
  }
  if (!Number.isFinite(best)) return winners;
  for (const [uid, d] of dists) if (d === best) winners.add(uid);
  return winners;
}

/**
 * Point pr. uid for ÉT spørgsmål, givet alle ligaens svar.
 * NUMBER afgøres relativt (nærmeste vinder); øvrige typer scores individuelt.
 * @param {object} question
 * @param {Array<{uid:string, answer:any}>} submissions
 * @returns {Record<string, number>} uid → point
 */
export function scoreLeagueBonusAll(question, submissions = []) {
  const out = {};
  if (!question || question.facit == null || question.facit === '') return out;
  if (question.type === LEAGUE_BONUS_TYPE.NUMBER) {
    const winners = closestWinners(question.facit, submissions);
    for (const s of submissions) out[s.uid] = winners.has(s.uid) ? LB_POINTS.NUMBER : 0;
    return out;
  }
  for (const s of submissions) out[s.uid] = scoreLeagueBonus(question, s.answer);
  return out;
}

/**
 * Summér en spillers point på tværs af en ligas bonusspørgsmål.
 * (Bemærk: dækker ikke NUMBER, der er relativ — brug scoreLeagueBonusAll.)
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
