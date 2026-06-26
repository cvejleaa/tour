import { TIMEZONE } from '../../lib/constants';

/** Konverter Firestore Timestamp / Date / ms til Date (eller null). */
function toDate(ts) {
  if (!ts) return null;
  if (typeof ts.toDate === 'function') return ts.toDate();
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Formatér et tidspunkt til kompakt dansk visning.
 *  - i dag:   "14:32"
 *  - ellers:  "3. jun 14:32"
 * @param {*} ts  Firestore Timestamp, Date eller ms
 * @param {Date} [now]
 * @returns {string}
 */
export function formatTimestamp(ts, now = new Date()) {
  const d = toDate(ts);
  if (!d) return '';
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();

  const time = new Intl.DateTimeFormat('da-DK', {
    timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit',
  }).format(d);

  if (sameDay) return time;

  const date = new Intl.DateTimeFormat('da-DK', {
    timeZone: TIMEZONE, day: 'numeric', month: 'short',
  }).format(d);
  return `${date} ${time}`;
}
