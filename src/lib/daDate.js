/**
 * Danske dato-/tidsformatteringer (ét sted). Bruger Intl med 'da-DK', som
 * giver klokkeslæt med punktum (18.00) og små måneder (aug, sep).
 */
const fmtDay = new Intl.DateTimeFormat('da-DK', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtTime = new Intl.DateTimeFormat('da-DK', { hour: '2-digit', minute: '2-digit' });

function toDate(d) {
  if (d == null) return null;
  if (d instanceof Date) return d;
  if (typeof d === 'number') return new Date(d);
  if (typeof d === 'string') { const t = Date.parse(d); return Number.isNaN(t) ? null : new Date(t); }
  if (typeof d.toMillis === 'function') return new Date(d.toMillis());
  if (d.seconds != null) return new Date(d.seconds * 1000);
  return null;
}

/** "lør 9. aug · 18.00" */
export function formatKickoff(d) {
  const date = toDate(d);
  if (!date) return '';
  return `${fmtDay.format(date).replace('.', '')} · ${fmtTime.format(date)}`;
}

/** "9. aug" (kort, uden ugedag) — til datospænd. */
export function formatDayShort(d) {
  const date = toDate(d);
  if (!date) return '';
  return new Intl.DateTimeFormat('da-DK', { day: 'numeric', month: 'short' }).format(date).replace('.', '');
}

/** Kun klokkeslæt "18.00". */
export function formatTime(d) {
  const date = toDate(d);
  return date ? fmtTime.format(date) : '';
}

/** Ental/flertal på dansk: 1 dag, 2 dage. */
function dage(n) {
  return n === 1 ? '1 dag' : `${n} dage`;
}

/** Relativ deadline: "om 4 t", "om 2 dage", "om 12 min", "lukket". */
export function relativeDeadline(d, now = new Date()) {
  const date = toDate(d);
  if (!date) return '';
  const min = Math.round((date.getTime() - now.getTime()) / 60000);
  if (min < 0) return 'lukket';
  if (min < 60) return `om ${min} min`;
  if (min < 1440) return `om ${Math.round(min / 60)} t`;
  return `om ${dage(Math.round(min / 1440))}`;
}

/** Relativ FORTID: "nu", "for 4 min siden", "for 2 t siden", "for 3 dage siden". */
export function relativeTime(d, now = new Date()) {
  const date = toDate(d);
  if (!date) return '';
  const min = Math.round((now.getTime() - date.getTime()) / 60000);
  if (min < 1) return 'nu';
  if (min < 60) return `for ${min} min siden`;
  if (min < 1440) return `for ${Math.round(min / 60)} t siden`;
  return `for ${dage(Math.round(min / 1440))} siden`;
}

/** Datospænd for en runde: "8.–10. aug" eller "9. aug" hvis samme dag. */
export function formatDateRange(fromD, toD) {
  const a = toDate(fromD);
  const b = toDate(toD);
  if (!a) return '';
  if (!b || formatDayShort(a) === formatDayShort(b)) return formatDayShort(a);
  return `${formatDayShort(a)} – ${formatDayShort(b)}`;
}
