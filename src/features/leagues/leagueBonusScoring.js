/**
 * Ren scoring-logik for individuelle liga-bonusspørgsmål.
 * Bruges klient-side (point tæller kun i den pågældende liga).
 *
 * Liga-bonus har samme typer som de officielle bonusspørgsmål
 * (LEAGUE_BONUS_TYPE === BONUS_ANSWER_TYPES) og et frit pointfelt pr. spørgsmål.
 * 'number' afgøres relativt pr. liga: den/de nærmeste på facit vinder.
 */
import { LEAGUE_BONUS_TYPE } from '../../lib/constants';
import { bonusPoints } from '../../lib/scoring';

/** Standardpoint hvis et spørgsmål ikke har et point-felt. */
export const DEFAULT_LB_POINTS = 5;

/** Spørgsmålets point (positivt tal, ellers standard). */
function questionPoints(question) {
  const p = Number(question?.points);
  return Number.isFinite(p) && p > 0 ? p : DEFAULT_LB_POINTS;
}

/** Er facit tomt (ikke sat)? Tomt array tæller som tomt. */
function facitEmpty(facit) {
  if (facit == null) return true;
  if (Array.isArray(facit)) return facit.length === 0;
  return String(facit).trim() === '';
}

/** Er et svar tomt? Tomt array tæller som tomt. */
function answerEmpty(answer) {
  if (answer == null) return true;
  if (Array.isArray(answer)) return answer.length === 0;
  return String(answer).trim() === '';
}

/**
 * Normalisér til eksakt sammenligning (hold/tid/ja-nej). Arrays sammenlignes
 * rækkefølge-uafhængigt (flere hold).
 */
function norm(v) {
  if (Array.isArray(v)) {
    return v.map((x) => String(x ?? '').trim().toLowerCase()).filter(Boolean).sort().join('|');
  }
  return String(v ?? '').trim().toLowerCase();
}

/**
 * Beregn point for ÉT svar på et liga-bonusspørgsmål (individuelle typer).
 * 'number' er relativ og kan ikke scores isoleret → 0 her; brug
 * scoreLeagueBonusAll/closestWinners.
 * @param {{type:string, facit:any, points?:number, acceptedAnswers?:string[]}} question
 * @param {any} answer  – svarets værdi (string | string[] afhængig af type)
 * @returns {number}
 */
export function scoreLeagueBonus(question, answer) {
  if (!question || facitEmpty(question.facit) || answerEmpty(answer)) return 0;
  const pts = questionPoints(question);
  switch (question.type) {
    case LEAGUE_BONUS_TYPE.NUMBER:
      return 0; // relativ — afgøres i scoreLeagueBonusAll
    case LEAGUE_BONUS_TYPE.TEXT:
      // Fuzzy-match mod facit eller en manuelt godkendt stavemåde (som officiel).
      return bonusPoints({ answer, facit: question.facit, acceptedAnswers: question.acceptedAnswers }) > 0 ? pts : 0;
    default: // team, teams, time, boolean → eksakt (rækkefølge-uafhængig for arrays)
      return norm(answer) === norm(question.facit) ? pts : 0;
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
  if (!question || facitEmpty(question.facit)) return out;
  if (question.type === LEAGUE_BONUS_TYPE.NUMBER) {
    const pts = questionPoints(question);
    const winners = closestWinners(question.facit, submissions);
    for (const s of submissions) out[s.uid] = winners.has(s.uid) ? pts : 0;
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
