// ---------------------------------------------------------------------------
// Rene hjælpefunktioner til bonus-logik. Ingen Firebase-afhængigheder.
// ---------------------------------------------------------------------------
import { TIMEZONE, BONUS_TYPE } from '../../lib/constants';

/**
 * Afgør om et bonusspørgsmål er låst (nu >= deadline).
 * @param {Date|number|{toDate:()=>Date}|null} deadline
 * @param {Date} [now]  Injiceret tidspunkt til test (default: new Date())
 * @returns {boolean}
 */
export function isBonusLocked(deadline, now = new Date()) {
  if (!deadline) return false;
  const dl =
    typeof deadline.toDate === 'function' ? deadline.toDate() : new Date(deadline);
  return now >= dl;
}

/**
 * Formaterer en Firestore-deadline til læsbar dansk dato+tid.
 * @param {*} deadline
 * @returns {string}
 */
export function formatDeadline(deadline) {
  if (!deadline) return 'Ukendt';
  const d =
    typeof deadline.toDate === 'function' ? deadline.toDate() : new Date(deadline);
  return new Intl.DateTimeFormat('da-DK', {
    timeZone: TIMEZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

/**
 * Sorterer bonusspørgsmål: topscorer øverst, derefter gruppevindere efter
 * gruppebogstav (A → L). Muterer ikke input-arrayet.
 * @param {Array<object>} questions
 * @returns {Array<object>}
 */
export function sortBonusQuestions(questions) {
  const rank = (q) => (q.type === BONUS_TYPE.TOP_SCORER ? 0 : 1);
  return [...(questions ?? [])].sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    // Begge gruppevindere: sortér efter gruppenavn (A, B, C …)
    return String(a.groupName ?? '').localeCompare(String(b.groupName ?? ''), 'da');
  });
}
