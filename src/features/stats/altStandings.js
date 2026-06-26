// ---------------------------------------------------------------------------
// Alternative point-regnskaber baseret på antal mål pr. hold. To varianter:
//   A) "Hård" (nuværende): rigtigt 0 → +2, rigtigt N → +N, forkert → −|forskel|.
//   B) "🎯 Skarpskytten" (blødere + monoton): rigtigt N → +(N+1) (rigtigt 0 = +1),
//      forkert → −min(forskel, 2) (kappet pr. hold), +1 hvis kampens udfald rammes.
// I begge giver en kamp man IKKE har tippet −2 point.
// ---------------------------------------------------------------------------
import { outcome } from '../../lib/scoring';

/**
 * Point for ÉT holds måltal.
 * @param {number} predicted  tippet antal mål for holdet
 * @param {number} actual     faktisk antal mål for holdet
 * @returns {number}
 */
export function altTeamPoints(predicted, actual) {
  if (predicted == null || actual == null) return 0;
  const p = Number(predicted);
  const a = Number(actual);
  if (!Number.isFinite(p) || !Number.isFinite(a)) return 0;
  const diff = Math.abs(p - a);
  if (diff === 0) return a === 0 ? 2 : a; // rigtigt: 0 giver +2, ellers +antal mål
  return -diff; // forkert: minus forskellen
}

/**
 * Point for én kamp (hjemme + ude). Returnerer 0 hvis tip eller resultat mangler.
 * @param {{home:number, away:number}} bet
 * @param {{home:number, away:number}} result
 * @returns {number}
 */
export function altMatchPoints(bet, result) {
  if (!bet || !result) return 0;
  if (!Number.isFinite(bet.home) || !Number.isFinite(bet.away)) return 0;
  return altTeamPoints(bet.home, result.home) + altTeamPoints(bet.away, result.away);
}

/**
 * Alternativ stilling pr. spiller over alle afsluttede kampe.
 * Hver kamp en spiller IKKE har tippet (gyldigt) giver −2 point.
 * @param {Array<object>} matches  kampe med .id og .result
 * @param {Map<string,Array>|{get?:Function}} betsByMatch  matchId → bets[]
 * @param {Array<{uid:string, name?:string}>} players  spillere der skal rangeres
 * @returns {Array<{uid,name,points,matches,tipped,untipped,avg}>} sorteret faldende
 */
export function computeAltStandings(matches, betsByMatch, players) {
  const finished = (matches || []).filter((m) => m && m.result);
  const rows = (players || []).map((p) => {
    let points = 0;
    let tipped = 0;
    let untipped = 0;
    for (const m of finished) {
      const bets = betsByMatch?.get?.(m.id) || [];
      const bet = bets.find((b) => b.uid === p.uid);
      if (bet && Number.isFinite(bet.home) && Number.isFinite(bet.away)) {
        points += altMatchPoints(bet, m.result);
        tipped += 1;
      } else {
        points += -2; // ikke tippet → −2
        untipped += 1;
      }
    }
    return {
      uid: p.uid,
      name: p.name || 'Spiller',
      points,
      matches: finished.length,
      tipped,
      untipped,
      avg: finished.length ? Math.round((points / finished.length) * 10) / 10 : 0,
    };
  });
  return rows.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, 'da'));
}

// ─── Variant B: "🎯 Skarpskytten" (blødere + monoton) ───────────────────────

/** Point for ét holds måltal i Skarpskytten: rigtigt N → +(N+1); forkert → −min(forskel,2). */
export function sharpTeamPoints(predicted, actual) {
  if (predicted == null || actual == null) return 0;
  const p = Number(predicted);
  const a = Number(actual);
  if (!Number.isFinite(p) || !Number.isFinite(a)) return 0;
  const diff = Math.abs(p - a);
  if (diff === 0) return a + 1; // monoton: rigtigt 0 = +1, rigtigt 1 = +2 …
  return -Math.min(diff, 2); // blødere straf, højst −2 pr. hold
}

/** Point for én kamp i Skarpskytten (hjemme + ude + udfalds-bonus). */
export function sharpMatchPoints(bet, result) {
  if (!bet || !result) return 0;
  if (!Number.isFinite(bet.home) || !Number.isFinite(bet.away)) return 0;
  let pts = sharpTeamPoints(bet.home, result.home) + sharpTeamPoints(bet.away, result.away);
  if (outcome(bet.home, bet.away) === outcome(result.home, result.away)) pts += 1; // rammer udfaldet
  return pts;
}

/**
 * Begge regnskaber pr. spiller i én udregning (til sammenligning på admin-fanen).
 * En kamp man ikke har tippet (gyldigt) giver −2 i begge.
 * @returns {Array<{uid,name,matches,tipped,untipped,hard,sharp}>}
 */
export function computeComparison(matches, betsByMatch, players, untippedPenalty = -2) {
  const finished = (matches || []).filter((m) => m && m.result);
  return (players || []).map((p) => {
    let hard = 0;
    let sharp = 0;
    let tipped = 0;
    let untipped = 0;
    for (const m of finished) {
      const bet = (betsByMatch?.get?.(m.id) || []).find((b) => b.uid === p.uid);
      const valid = bet && Number.isFinite(bet.home) && Number.isFinite(bet.away);
      if (valid) {
        hard += altMatchPoints(bet, m.result);
        sharp += sharpMatchPoints(bet, m.result);
        tipped += 1;
      } else {
        hard += untippedPenalty;
        sharp += untippedPenalty;
        untipped += 1;
      }
    }
    // Afrund til 1 decimal (penalty kan vaere decimal).
    const round1 = (v) => Math.round(v * 10) / 10;
    return {
      uid: p.uid, name: p.name || 'Spiller', matches: finished.length,
      tipped, untipped, hard: round1(hard), sharp: round1(sharp),
    };
  });
}
