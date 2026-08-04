/**
 * Ren hjælper til "Mine tips"-historikken: sammenstil spillerens tips med
 * kampenes facit + point pr. runde. Ingen Firebase-afhængigheder (testbar).
 */
import { round1 } from '../../../lib/superligaScoring';
import { buildRoundContext, combiBonus } from '../../../lib/pointOpdeling';

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
  // ÉN kontekst for hele historikken — samme funktion som serveren afregner
  // efter, så fladen og stillingen ikke kan blive uenige om combi.
  const roundCtx = buildRoundContext((rounds || []).flatMap((r) => r.matches));
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

    // Combi regnes IKKE her. Fladen havde sin egen udgave af reglen, og den
    // var allerede uenig med serverens: groupByRound samler kampe uden
    // rundenummer i en pseudo-runde 0 og udbetalte bonus for kampe, der ikke
    // hører sammen — noget serveren har afvist hele tiden.
    //
    // Nu spørger begge samme funktion. Kuponen er rundens kampe i samme uge,
    // så en udsat kamp hverken venter vi på eller kræver tippet.
    const rc = roundCtx.rounds[round] || null;
    const kupon = rc ? rc.combiCount : 0;
    const roundSettled = !!rc && kupon > 0 && rc.combiSettled === kupon;
    const iKupon = matches.filter((m) => roundCtx.byMatch[m.id]?.iVindue);
    const tippedAll = kupon > 0 && iKupon.every((m) => betsByMatch[m.id]?.pick);
    const roundBonus = combiBonus(
      iKupon.filter((m) => betsByMatch[m.id]?.pick)
        .map((m) => ({ matchId: m.id, pick: betsByMatch[m.id].pick })),
      roundCtx,
    );
    bonusSum += roundBonus;

    return {
      round, rows, total, tippedCount, hitCount, roundSettled, tippedAll, roundBonus,
      // Til skærmen: hvor mange af rundens kampe står på kuponen, og hvilke
      // gør ikke. Uden det kan fladen ikke forklare "4 af 6".
      kupon, udenfor: matches.filter((m) => !roundCtx.byMatch[m.id]?.iVindue),
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
