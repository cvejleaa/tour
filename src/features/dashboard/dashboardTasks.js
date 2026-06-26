/**
 * Rene hjælpefunktioner til "Mine opgaver"-aggregeringen på forsiden.
 * Ingen Firebase — nemme at teste isoleret.
 */
import { isBonusLocked } from '../bonus/bonusHelpers';

/**
 * Har en spiller afgivet et (ikke-tomt) svar?
 * Strenge: ikke-tom efter trim. Arrays (top-liste): mindst ét ikke-tomt felt.
 * @param {*} value
 * @returns {boolean}
 */
export function hasAnswerValue(value) {
  if (Array.isArray(value)) return value.some((v) => String(v ?? '').trim() !== '');
  return String(value ?? '').trim() !== '';
}

/**
 * Antal ÅBNE globale bonusspørgsmål, brugeren endnu ikke har svaret på.
 * @param {Array<{id:string,deadline:*}>} questions
 * @param {(id:string)=>boolean} hasBet  – har brugeren et svar på spørgsmålet?
 * @param {Date} [now]
 * @returns {number}
 */
export function countOpenUnansweredBonus(questions, hasBet, now = new Date()) {
  const has = typeof hasBet === 'function' ? hasBet : () => false;
  return (questions ?? []).filter(
    (q) => !isBonusLocked(q.deadline, now) && !has(q.id),
  ).length;
}

/**
 * Antal ÅBNE liga-bonusspørgsmål i én liga, brugeren endnu ikke har svaret på.
 * @param {Array<{id:string,deadline:*}>} questions
 * @param {Record<string,*>} answersByQid – qid → svarets værdi for brugeren
 * @param {Date} [now]
 * @returns {number}
 */
export function countOpenLeagueBonus(questions, answersByQid = {}, now = new Date()) {
  return (questions ?? []).filter(
    (q) => !isBonusLocked(q.deadline, now) && !hasAnswerValue(answersByQid[q.id]),
  ).length;
}
