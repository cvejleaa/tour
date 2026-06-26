/**
 * Hjælpefunktioner til forside-hub'en.
 */
import { isMatchLocked, dayKey } from './matchHelpers';

/** Konverter kickoff (Timestamp/Date/ms) til Date eller null. */
function toDate(kickoff) {
  if (!kickoff) return null;
  if (typeof kickoff.toDate === 'function') return kickoff.toDate();
  const d = new Date(kickoff);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Beregn nøgletal til hub'en.
 * @param {Array<object>} matches  – alle kampe (med .kickoff, .id, .status, .homeTeam, .awayTeam)
 * @param {Set<string>|Map<string,*>} bets – id'er på kampe brugeren har tippet (Set eller Map med .has)
 * @param {Date} [now]
 * @returns {{
 *   todayLabel: string,
 *   todayMatches: Array<object>,
 *   missingToday: Array<object>,
 *   missingTotal: number,
 *   nextMatch: object|null,
 * }}
 */
export function computeDashboard(matches, bets, now = new Date()) {
  const today = dayKey(now);
  const has = (id) => (typeof bets?.has === 'function' ? bets.has(id) : false);

  const playable = matches.filter((m) => m.homeTeam && m.awayTeam);

  const todayMatches = playable.filter((m) => dayKey(m.kickoff) === today);

  // Kampe der stadig kan tippes (ikke låst) og mangler tip
  const missingAll = playable.filter((m) => !isMatchLocked(m.kickoff, now) && !has(m.id));
  const missingToday = missingAll.filter((m) => dayKey(m.kickoff) === today);

  // Næste kommende kamp (tidligste kickoff i fremtiden)
  const upcoming = playable
    .filter((m) => !isMatchLocked(m.kickoff, now))
    .map((m) => ({ m, t: toDate(m.kickoff)?.getTime() ?? Infinity }))
    .sort((a, b) => a.t - b.t);

  return {
    todayLabel: today,
    todayMatches,
    missingToday,
    missingTotal: missingAll.length,
    nextMatch: upcoming[0]?.m ?? null,
  };
}
