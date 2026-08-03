/**
 * Ren hjælper til "Mine tips"-historikken: sammenstil spillerens tips med
 * kampenes facit + point pr. runde. Ingen Firebase-afhængigheder (testbar).
 */
import { outcomeReward, roundComboBonus, round1 } from '../../../lib/superligaScoring';

/**
 * @param {Array<{round:number, matches:Array<object>}>} rounds  – fra groupByRound
 * @param {Record<string, object>} betsByMatch                    – matchId → tip
 * @param {number} puljeBonus – spillerens bonusPoints (mesterskabsspillet)
 * @returns {{
 *   rounds: Array<object>,
 *   totals: { tipped:number, settled:number, hits:number, hitRate:number, points:number, roundBonus:number }
 * }}
 */
export function buildTipsHistory(rounds, betsByMatch = {}, puljeBonus = 0) {
  let tipped = 0;
  let settledTips = 0;
  let hits = 0;
  let betPointsSum = 0;
  let bonusSum = 0;

  const out = (rounds || []).map(({ round, matches }) => {
    const rows = matches.map((m) => {
      const bet = betsByMatch[m.id];
      const pick = bet?.pick ?? null;
      const result = m.result ?? null;
      const settled = result != null && result !== '';
      const hit = settled && pick ? pick === result : null;
      const points = Number(bet?.points) || 0;
      const chanceStake = Number(bet?.chanceStake) || 0;
      if (pick) tipped += 1;
      if (pick && settled) { settledTips += 1; if (hit) hits += 1; }
      betPointsSum += points;
      return {
        id: m.id, home: m.home, away: m.away, kickoff: m.kickoff, odds: m.odds,
        pick, result, settled, hit, points, chanceStake, isChance: chanceStake > 0,
      };
    });

    const total = matches.length;
    const tippedCount = rows.filter((r) => r.pick).length;
    const hitCount = rows.filter((r) => r.hit === true).length;
    const roundSettled = total > 0 && matches.every((m) => m.result != null && m.result !== '');
    const tippedAll = total > 0 && matches.every((m) => betsByMatch[m.id]?.pick);
    const hitOdds = tippedAll
      ? matches.filter((m) => m.result && betsByMatch[m.id].pick === m.result)
        .map((m) => outcomeReward(m.result, m.odds))
      : [];
    const roundBonus = roundSettled && tippedAll ? roundComboBonus(hitOdds, total) : 0;
    bonusSum += roundBonus;

    return {
      round, rows, total, tippedCount, hitCount, roundSettled, tippedAll, roundBonus,
    };
  });

  return {
    rounds: out,
    totals: {
      tipped,
      settled: settledTips,
      hits,
      hitRate: settledTips > 0 ? Math.round((hits / settledTips) * 1000) / 10 : 0,
      // Puljebonussen SKAL med. Uden den viste Mine tips et lavere tal end
      // Stilling for samme spiller, fra det øjeblik puljen blev afregnet — to
      // formler for "point i alt", der allerede var uenige. Serveren regner den
      // samme vej (opdelPoint), og den er den autoritative.
      points: Math.max(0, round1(betPointsSum + bonusSum + (Number(puljeBonus) || 0))),
      roundBonus: round1(bonusSum),
    },
  };
}
