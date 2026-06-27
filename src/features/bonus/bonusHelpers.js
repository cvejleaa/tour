// ---------------------------------------------------------------------------
// Rene hjælpefunktioner til bonus-logik. Ingen Firebase-afhængigheder.
// ---------------------------------------------------------------------------
import { TIMEZONE } from '../../lib/constants';
import { prettyTeam } from '../../data/tourTeams2026';

// Re-eksporter så bonus-moduler kan importere typen ét sted fra.
export { bonusAnswerType } from '../../lib/constants';

/**
 * Afgør om et svar er "tomt" (intet valgt/skrevet) for en given type.
 * For 'teams' er et tomt array tomt.
 * @param {*} value
 * @returns {boolean}
 */
export function isBonusAnswerEmpty(value) {
  if (Array.isArray(value)) return value.length === 0;
  return String(value ?? '').trim() === '';
}

/**
 * Formater et bonus-svar/facit til en læsbar streng ud fra spørgsmålets type.
 * Hold vises via prettyTeam; flere hold sammenkædes med komma; boolean → Ja/Nej.
 * @param {*} value
 * @param {string} type
 * @returns {string}
 */
export function formatBonusAnswer(value, type) {
  if (value == null || value === '') return '';
  if (type === 'teams') {
    const arr = Array.isArray(value) ? value : [value];
    return arr.map((t) => prettyTeam(t)).join(', ');
  }
  if (type === 'team') return prettyTeam(value);
  if (type === 'boolean') {
    const v = String(value).trim().toLowerCase();
    return v === 'ja' ? 'Ja' : v === 'nej' ? 'Nej' : String(value);
  }
  return String(value);
}

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
 * Sorterer bonusspørgsmål efter deadline (tidligst først), derefter efter tekst.
 * Spørgsmål uden deadline sorteres til sidst. Muterer ikke input-arrayet.
 * @param {Array<object>} questions
 * @returns {Array<object>}
 */
export function sortBonusQuestions(questions) {
  const ms = (q) => {
    const dl = q?.deadline;
    if (!dl) return Infinity;
    const d = typeof dl.toDate === 'function' ? dl.toDate() : new Date(dl);
    const t = d.getTime();
    return Number.isNaN(t) ? Infinity : t;
  };
  return [...(questions ?? [])].sort((a, b) => {
    const d = ms(a) - ms(b);
    if (d !== 0) return d;
    return String(a.text ?? a.label ?? '').localeCompare(String(b.text ?? b.label ?? ''), 'da');
  });
}
