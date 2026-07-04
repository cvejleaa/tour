// Rene hjælpere til live-tickeren (letour racecenter-opslag).

/** letour-picto → emoji. Ukendte/manglende pictos får cykel-fallback. */
export function pictoEmoji(picto) {
  const p = String(picto ?? '').toLowerCase();
  if (p.includes('finish')) return '🏁';
  if (p.includes('actual_start')) return '🟢';
  if (p.includes('start')) return '📣';
  if (p.includes('chrono')) return '⏱️';
  if (p.includes('yellow')) return '💛';
  if (p.includes('green')) return '💚';
  if (p.includes('polka') || p.includes('climber') || p.includes('mountain')) return '🔴';
  if (p.includes('white')) return '🤍';
  if (p.includes('crash') || p.includes('fall')) return '💥';
  if (p.includes('attack')) return '⚡';
  if (p.includes('sprint')) return '🚀';
  if (p.includes('withdrawal') || p.includes('abandon')) return '🚑';
  if (p.includes('statistic')) return '📊';
  if (p.includes('story')) return '📖';
  return '🚴';
}

/** ISO-tidspunkt → "HH.MM" i dansk tid (tom streng ved ugyldigt input). */
export function formatPostTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('da-DK', {
    timeZone: 'Europe/Copenhagen', hour: '2-digit', minute: '2-digit',
  }).format(d);
}

/** Er datoen (kickoff) i dag i dansk tid? Bruges til at vise tickeren på etapedage. */
export function isTodayInCopenhagen(kickoff, now = new Date()) {
  if (!kickoff) return false;
  const d = typeof kickoff?.toDate === 'function' ? kickoff.toDate() : new Date(kickoff);
  if (Number.isNaN(d.getTime())) return false;
  const fmt = new Intl.DateTimeFormat('da-DK', { timeZone: 'Europe/Copenhagen', dateStyle: 'short' });
  return fmt.format(d) === fmt.format(now);
}
