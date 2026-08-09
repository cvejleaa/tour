/**
 * Ren hjælper til "Mine tips"-historikken: sammenstil spillerens tips med
 * kampenes facit + point pr. runde. Ingen Firebase-afhængigheder (testbar).
 */
import { round1, outcomePoints } from '../../../lib/superligaScoring';
import { buildRoundContext, combiBonus } from '../../../lib/pointOpdeling';

/**
 * HVAD CHANCEN KOSTEDE ELLER GAV på ét tip.
 *
 * Serveren gemmer kun SUMMEN på bettet — scoreBet returnerer 1X2-point plus
 * chance-delta — så deltaet skal regnes tilbage. Det sker her og kun her:
 * både kampkortet på tip-fladen, "Mine tips" og spillerdetaljen viser tallet,
 * og tre udgaver af formlen ville drive fra hinanden ved næste ændring. Samme
 * udledning som opdelPoint bruger til ⚡ Chancen-rubrikken, så kampens linje og
 * rubrikken over den ikke kan blive uenige.
 *
 * ODDS TAGES FRA KAMPEN, ikke fra bettet. Spillerdetaljens dokument gemmer kun
 * { pick, points, chanceStake } og har ingen odds — læste vi dem fra bettet,
 * ville tallet være rigtigt i Mine tips og forkert i spillerdetaljen for
 * præcis det samme tip.
 *
 * @param {object} bet    – { pick, points, chanceStake }
 * @param {object} match  – kampen (result + frosne odds)
 * @returns {{afregnet: boolean, delta: number}|null} null = ingen chance i spil
 */
export function chanceUdfald(bet, match) {
  const stake = Number(bet?.chanceStake) || 0;
  const pick = bet?.pick ?? null;
  const result = match?.result ?? null;
  if (stake <= 0 || !pick || result == null || result === '') return null;

  // FACIT KOMMER FØR POINTENE. Resultatet står på KAMPEN, mens points skrives
  // på BETTET af en Firestore-trigger — så der går sekunder, hvor kampen er
  // afgjort og bettet endnu ikke er scoret. Regnede vi deltaet dér, ville
  // points være 0, og visningen ville sige det MODSATTE af sandheden: et
  // forkert tip blev til et grønt "⚡ +0 · Chancen vundet", og et rigtigt tip
  // til et rødt "⚡ −3,9 · Chancen tabt" — på præcis den skærm, man står på
  // lige efter kampen.
  //
  // `points == null` er et pålideligt "ikke scoret endnu": serveren skriver
  // ALTID et tal, når den har scoret — også 0.
  if (bet?.points == null) return { afregnet: false, grund: 'afventer', delta: 0 };

  // Uden gyldige odds afregner serveren IKKE chancen (scoreBet returnerer sin
  // base, når oddsene mangler). Så er der hverken tab eller gevinst at vise,
  // og et fortegnstal ville være et gæt.
  //
  // Bemærk, at delta = 0 også kan være en ÆGTE afregning: en gevinst på
  // indsats 1 til odds 1,1 giver Math.round(0,1) = 0 — og med indsats 1 gør
  // ethvert odds under 1,50 det samme, så det er helt almindeligt for en ny
  // spiller. Derfor afgør oddsene, om chancen er afregnet — ikke om deltaet
  // tilfældigvis blev nul.
  const oddsForPick = Number.isFinite(match?.odds?.[pick]) ? Number(match.odds[pick]) : null;
  if (oddsForPick == null) return { afregnet: false, grund: 'ingen-odds', delta: 0 };

  const points = Number(bet.points) || 0;
  return { afregnet: true, grund: null, delta: round1(points - outcomePoints(pick, result, match.odds)) };
}

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

      const udfald = chanceUdfald(bet, m);
      const chanceAfregnet = !!udfald?.afregnet;
      const chanceDelta = udfald?.delta ?? 0;
      // Tippets egen andel — så visningen ikke selv skal regne. Den er "ren
      // visning" og skal ikke kende scoringsreglerne.
      const tipPoints = round1(points - chanceDelta);

      return {
        id: m.id, home: m.home, away: m.away, kickoff: m.kickoff, odds: m.odds,
        pick, result, settled, hit, points, chanceStake, isChance: chanceStake > 0,
        chanceAfregnet, chanceDelta, chanceGrund: udfald?.grund ?? null, tipPoints,
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
