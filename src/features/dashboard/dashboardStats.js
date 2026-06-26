// Rene hjælpefunktioner til forsidens "egen statistik" og "seneste resultater".
import { scoreMatch, scoreKnockout, outcome } from '../../lib/scoring';
import { ROUNDS } from '../../lib/constants';

const isKnockout = (m) => m.round && m.round !== ROUNDS.GROUP;
const hasScore = (b) => b && Number.isFinite(b.home) && Number.isFinite(b.away);

function kickoffMs(kickoff) {
  if (!kickoff) return 0;
  const d = typeof kickoff.toDate === 'function' ? kickoff.toDate() : new Date(kickoff);
  const t = d.getTime();
  return Number.isNaN(t) ? 0 : t;
}

function pointsFor(match, bet) {
  return isKnockout(match) ? scoreKnockout(bet, match.result) : scoreMatch(bet, match.result);
}

/**
 * Brugerens egen træfsikkerhed over alle afsluttede kampe, hvor han har tippet.
 * @param {Array<object>} matches
 * @param {Map<string,object>|{get?:Function}} betsMap  matchId -> bet
 * @returns {{tips:number, exact:number, correctOutcome:number, points:number,
 *            exactPct:number, outcomePct:number, avgPoints:number}}
 */
export function computeMyStats(matches, betsMap) {
  let tips = 0;
  let exact = 0;
  let correctOutcome = 0;
  let points = 0;
  for (const m of matches ?? []) {
    if (!m.result) continue;
    const bet = betsMap?.get?.(m.id);
    if (!hasScore(bet)) continue;
    tips += 1;
    points += pointsFor(m, bet);
    if (bet.home === m.result.home && bet.away === m.result.away) exact += 1;
    if (outcome(bet.home, bet.away) === outcome(m.result.home, m.result.away)) correctOutcome += 1;
  }
  return {
    tips,
    exact,
    correctOutcome,
    points,
    exactPct: tips ? Math.round((exact / tips) * 100) : 0,
    outcomePct: tips ? Math.round((correctOutcome / tips) * 100) : 0,
    avgPoints: tips ? Math.round((points / tips) * 10) / 10 : 0,
  };
}

/**
 * De seneste afsluttede kampe (nyeste først) med de point brugeren fik på hver.
 * @param {Array<object>} matches
 * @param {Map<string,object>|{get?:Function}} betsMap
 * @param {number} [limit]
 * @returns {Array<{match:object, points:number|null, bet:object|null}>}
 */
export function recentResults(matches, betsMap, limit = 5) {
  return (matches ?? [])
    .filter((m) => m.result)
    .sort((a, b) => kickoffMs(b.kickoff) - kickoffMs(a.kickoff))
    .slice(0, limit)
    .map((m) => {
      const bet = betsMap?.get?.(m.id);
      const has = hasScore(bet);
      return { match: m, points: has ? pointsFor(m, bet) : null, bet: has ? bet : null };
    });
}
