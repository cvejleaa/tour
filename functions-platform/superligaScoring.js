// ---------------------------------------------------------------------------
// functions/superligaScoring.js — AUTORITATIV Superliga-pointlogik (CommonJS).
// SPEJL af src/lib/superligaScoring.js — hold dem 100% identiske i opførsel!
// Cloud Functions beregner point; klienten viser kun.
//
// 1X2-point FØLGER oddsene: et ramt udfald giver kampens FROSNE odds afrundet
// til 1 decimal (fx 3.1 / 4.3 / 2.3). "Chancen": indsats på ét 1X2-valg afregnes
// til de samme frosne odds (gemt på kamp-dokumentet, ikke på tippet — så en
// klient ikke kan puste gevinsten op). Tab koster kun indsatsen.
// ---------------------------------------------------------------------------

const OUTCOME = { HOME: '1', DRAW: 'X', AWAY: '2' };
const OUTCOMES = [OUTCOME.HOME, OUTCOME.DRAW, OUTCOME.AWAY];
// Fallback-point hvis en kamp mangler frosne odds (bør ikke ske).
const DEFAULT_POINTS = {
  [OUTCOME.HOME]: 2,
  [OUTCOME.DRAW]: 4,
  [OUTCOME.AWAY]: 3,
};

function isOutcome(v) {
  return v === OUTCOME.HOME || v === OUTCOME.DRAW || v === OUTCOME.AWAY;
}

function round1(x) {
  const n = Number(x);
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : 0;
}

function outcomeReward(outcome, odds) {
  if (!isOutcome(outcome)) return 0;
  const raw = odds ? Number(odds[outcome]) : NaN;
  return Number.isFinite(raw) ? round1(raw) : DEFAULT_POINTS[outcome];
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

function outcomePoints(pick, result, odds) {
  if (!isOutcome(pick) || !isOutcome(result)) return 0;
  return pick === result ? outcomeReward(result, odds) : 0;
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
  const base = outcomePoints(bet.pick, result, odds);
  const stake = Math.max(0, Math.floor(Number(bet.chanceStake) || 0));
  if (stake <= 0) return base;
  const o = odds && Number.isFinite(odds[bet.pick]) ? Number(odds[bet.pick]) : null;
  // Uden gyldige odds kan Chancen ikke afregnes fair → ingen gevinst/tab.
  if (o == null) return base;
  const { delta } = settleChance({ correct: bet.pick === result, stake, fairOdds: o });
  return base + delta;
}

// --- Elo-lite: sandsynligheder, odds + vedligeholdelse (spejl af src) --------

const ELO = { START: 1500, HFA: 60, K: 20, DRAW_BASE: 0.28, DRAW_DECAY: 0.55 };
const ODDS = { MIN: 1.1, MAX: 6.0 };

function eloExpectedHome(eloHome, eloAway, hfa = ELO.HFA) {
  const dr = (Number(eloHome) + hfa) - Number(eloAway);
  return 1 / (1 + 10 ** (-dr / 400));
}

function outcomeProbabilities({
  eloHome = ELO.START, eloAway = ELO.START, hfa = ELO.HFA,
  drawBase = ELO.DRAW_BASE, drawDecay = ELO.DRAW_DECAY,
} = {}) {
  const e = eloExpectedHome(eloHome, eloAway, hfa);
  const skew = Math.abs(2 * e - 1);
  const pDraw = drawBase * Math.exp(-drawDecay * skew * 2);
  const rest = 1 - pDraw;
  return { [OUTCOME.HOME]: rest * e, [OUTCOME.DRAW]: pDraw, [OUTCOME.AWAY]: rest * (1 - e) };
}

function fairOdds(p) {
  const prob = Number(p);
  if (!Number.isFinite(prob) || prob <= 0) return ODDS.MAX;
  const clamped = Math.min(ODDS.MAX, Math.max(ODDS.MIN, 1 / prob));
  return Math.round(clamped * 100) / 100;
}

function outcomeOdds(eloArgs) {
  const p = outcomeProbabilities(eloArgs);
  return {
    [OUTCOME.HOME]: fairOdds(p[OUTCOME.HOME]),
    [OUTCOME.DRAW]: fairOdds(p[OUTCOME.DRAW]),
    [OUTCOME.AWAY]: fairOdds(p[OUTCOME.AWAY]),
  };
}

function updateElo(eloHome, eloAway, actualHome, { hfa = ELO.HFA, k = ELO.K } = {}) {
  const expH = eloExpectedHome(eloHome, eloAway, hfa);
  const home = Number(eloHome) + k * (actualHome - expH);
  const away = Number(eloAway) + k * ((1 - actualHome) - (1 - expH));
  return { home, away };
}

function actualHomeFromOutcome(outcome) {
  if (outcome === OUTCOME.HOME) return 1;
  if (outcome === OUTCOME.AWAY) return 0;
  return 0.5;
}

module.exports = {
  OUTCOME, OUTCOMES, DEFAULT_POINTS, ELO, ODDS,
  isOutcome, outcomeFromScore, round1, outcomeReward, outcomePoints,
  settleChance, scoreBet,
  eloExpectedHome, outcomeProbabilities, fairOdds, outcomeOdds,
  updateElo, actualHomeFromOutcome,
};
