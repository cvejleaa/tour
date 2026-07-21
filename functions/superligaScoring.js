// ---------------------------------------------------------------------------
// functions/superligaScoring.js — AUTORITATIV Superliga-pointlogik (CommonJS).
// SPEJL af src/lib/superligaScoring.js — hold dem 100% identiske i opførsel!
// Cloud Functions beregner point; klienten viser kun.
//
// 1X2-point vægtet (hjemme 2 / uafgjort 4 / ude 3). "Chancen": indsats på ét
// 1X2-valg afregnes til kampens FROSNE odds (gemt på kamp-dokumentet, ikke på
// tippet — så en klient ikke kan puste gevinsten op). Tab koster kun indsatsen.
// ---------------------------------------------------------------------------

const OUTCOME = { HOME: '1', DRAW: 'X', AWAY: '2' };
const OUTCOMES = [OUTCOME.HOME, OUTCOME.DRAW, OUTCOME.AWAY];
const OUTCOME_POINTS = {
  [OUTCOME.HOME]: 2,
  [OUTCOME.DRAW]: 4,
  [OUTCOME.AWAY]: 3,
};

function isOutcome(v) {
  return v === OUTCOME.HOME || v === OUTCOME.DRAW || v === OUTCOME.AWAY;
}

function outcomeFromScore(homeGoals, awayGoals) {
  if (homeGoals == null || awayGoals == null || homeGoals === '' || awayGoals === '') return null;
  const h = Number(homeGoals);
  const a = Number(awayGoals);
  if (!Number.isFinite(h) || !Number.isFinite(a)) return null;
  if (h > a) return OUTCOME.HOME;
  if (h < a) return OUTCOME.AWAY;
  return OUTCOME.DRAW;
}

function outcomePoints(pick, result) {
  if (!isOutcome(pick) || !isOutcome(result)) return 0;
  return pick === result ? OUTCOME_POINTS[result] : 0;
}

/**
 * Afregn Chancen for ét tip. delta = korrekt ? +indsats×(odds−1) : −indsats.
 * @param {{correct:boolean, stake:number, fairOdds:number}} o
 * @returns {{delta:number, profit:number}}
 */
function settleChance({ correct, stake, fairOdds }) {
  const s = Math.max(0, Math.floor(Number(stake) || 0));
  if (s <= 0) return { delta: 0, profit: 0 };
  if (correct) {
    const profit = Math.round(s * (Number(fairOdds) - 1));
    return { delta: profit, profit };
  }
  return { delta: -s, profit: 0 };
}

/**
 * Samlet point for ét bet mod en kamps facit (1X2-point + Chancen-delta).
 * Bruger kampens frosne odds for spillerens valg. Returnerer et heltal.
 * @param {object} bet   – { pick, chanceStake }
 * @param {string} result – facit ('1'|'X'|'2')
 * @param {object} [odds] – kampens odds { '1','X','2' } (frosset)
 * @returns {number}
 */
function scoreBet(bet, result, odds) {
  if (!bet || !isOutcome(bet.pick) || !isOutcome(result)) return 0;
  const base = outcomePoints(bet.pick, result);
  const stake = Math.max(0, Math.floor(Number(bet.chanceStake) || 0));
  if (stake <= 0) return base;
  const o = odds && Number.isFinite(odds[bet.pick]) ? Number(odds[bet.pick]) : null;
  // Uden gyldige odds kan Chancen ikke afregnes fair → ingen gevinst/tab.
  if (o == null) return base;
  const { delta } = settleChance({ correct: bet.pick === result, stake, fairOdds: o });
  return base + delta;
}

module.exports = {
  OUTCOME, OUTCOMES, OUTCOME_POINTS,
  isOutcome, outcomeFromScore, outcomePoints, settleChance, scoreBet,
};
