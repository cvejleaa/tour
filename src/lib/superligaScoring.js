// ---------------------------------------------------------------------------
// Superliga-scoring — ren logik (ingen Firebase). Bruges af frontend og
// spejles i Cloud Functions ved afregning. Hold identisk begge steder!
//
// Spillet: man tipper 1X2 (ikke resultat) på hver kamp i en runde, og kan
// (valgfrit) bruge "Chancen" på ÉN kamp pr. runde: sæt point på spil til
// elo-lite fair odds. Design låst med ejeren 20/7-2026:
//   - 1X2-point: point FØLGER oddsene — et ramt udfald giver kampens frosne
//     odds afrundet til 1 decimal (fx 3.1 / 4.3 / 2.3). Så en favorit-tip
//     giver få point og et overraskende udfald giver mange, i takt med oddsene.
//   - Chancen: indsats mellem MIN og MAX, hvor MAX cappes til < 50 % af saldo.
//   - Gevinst = indsats × (fair odds − 1). Tab = kun indsatsen (ingen bøde).
//   - Saldoen kan aldrig gå i minus (garanteret af 40 %-cappet).
// ---------------------------------------------------------------------------

/** Kamp-udfald (1X2). '1' = hjemmesejr, 'X' = uafgjort, '2' = udesejr. */
export const OUTCOME = { HOME: '1', DRAW: 'X', AWAY: '2' };

/** Alle gyldige udfald i fast rækkefølge (til iteration/visning). */
export const OUTCOMES = [OUTCOME.HOME, OUTCOME.DRAW, OUTCOME.AWAY];

/**
 * Standard-point pr. udfald — bruges KUN som fallback, hvis en kamp mangler
 * frosne odds (bør ikke ske; odds fryses ved seeding). Normalt følger pointene
 * oddsene, se outcomeReward().
 */
export const DEFAULT_POINTS = {
  [OUTCOME.HOME]: 2,
  [OUTCOME.DRAW]: 4,
  [OUTCOME.AWAY]: 3,
};

/** Afrund et tal til 1 decimal (0 for ugyldigt). Bruges til point = odds. */
export function round1(x) {
  const n = Number(x);
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : 0;
}

/**
 * Point for et RAMT udfald = kampens frosne odds (1 decimal). Falder tilbage til
 * DEFAULT_POINTS, hvis kampen ikke har gyldige odds for udfaldet.
 * @param {string} outcome – '1'|'X'|'2'
 * @param {object} [odds]   – kampens frosne odds { '1','X','2' }
 * @returns {number}
 */
export function outcomeReward(outcome, odds) {
  if (!isOutcome(outcome)) return 0;
  const raw = odds ? Number(odds[outcome]) : NaN;
  return Number.isFinite(raw) ? round1(raw) : DEFAULT_POINTS[outcome];
}

/** Er en værdi et gyldigt 1X2-udfald? */
export function isOutcome(v) {
  return v === OUTCOME.HOME || v === OUTCOME.DRAW || v === OUTCOME.AWAY;
}

/** Udled 1X2-udfald af et resultat (mål). Returnerer null hvis ufuldstændigt. */
export function outcomeFromScore(homeGoals, awayGoals) {
  if (homeGoals == null || awayGoals == null || homeGoals === '' || awayGoals === '') return null;
  const h = Number(homeGoals);
  const a = Number(awayGoals);
  if (!Number.isFinite(h) || !Number.isFinite(a)) return null;
  if (h > a) return OUTCOME.HOME;
  if (h < a) return OUTCOME.AWAY;
  return OUTCOME.DRAW;
}

/**
 * Point for ét 1X2-tip mod facit. Et ramt udfald giver kampens frosne odds
 * (1 decimal); forkert giver 0. Odds trådes ind fra kamp-dokumentet.
 * @param {string} pick   – spillerens tip ('1'|'X'|'2')
 * @param {string} result – facit ('1'|'X'|'2')
 * @param {object} [odds] – kampens frosne odds { '1','X','2' }
 * @returns {number} point (0 hvis forkert eller ugyldigt)
 */
export function outcomePoints(pick, result, odds) {
  if (!isOutcome(pick) || !isOutcome(result)) return 0;
  return pick === result ? outcomeReward(result, odds) : 0;
}

// --- Elo-lite: sandsynligheder + fair odds -----------------------------------

/** Standard Elo-parametre for Superligaen. */
export const ELO = {
  START: 1500,      // rating for et nyt/ukendt hold
  HFA: 60,          // hjemmebane-fordel i Elo-point (~0.09 forventning)
  K: 20,            // opdateringshastighed pr. kamp
  DRAW_BASE: 0.28,  // uafgjort-sandsynlighed når holdene er lige stærke
  DRAW_DECAY: 0.55, // hvor hurtigt uafgjort-chancen falder med styrkeforskel
};

/**
 * Forventet hjemme-score (0..1) i ren Elo (uden uafgjort-split).
 * Højere = hjemmeholdet er favorit.
 */
export function eloExpectedHome(eloHome, eloAway, hfa = ELO.HFA) {
  const dr = (Number(eloHome) + hfa) - Number(eloAway);
  return 1 / (1 + 10 ** (-dr / 400));
}

/**
 * 1X2-sandsynligheder ud fra Elo-ratings (elo-lite).
 * Uafgjort modelleres størst når holdene er lige, og falder med styrkeforskel;
 * resten fordeles på hjemme/ude efter Elo-forventningen. Summen er altid 1.
 * @returns {{'1':number,'X':number,'2':number}}
 */
export function outcomeProbabilities({
  eloHome = ELO.START,
  eloAway = ELO.START,
  hfa = ELO.HFA,
  drawBase = ELO.DRAW_BASE,
  drawDecay = ELO.DRAW_DECAY,
} = {}) {
  const e = eloExpectedHome(eloHome, eloAway, hfa); // 0..1
  // |2e-1| er 0 når holdene er lige, 1 når det er totalt ensidigt.
  const skew = Math.abs(2 * e - 1);
  const pDraw = drawBase * Math.exp(-drawDecay * skew * 2);
  const rest = 1 - pDraw;
  return {
    [OUTCOME.HOME]: rest * e,
    [OUTCOME.DRAW]: pDraw,
    [OUTCOME.AWAY]: rest * (1 - e),
  };
}

/** Grænser for Chancen-odds, så en enkelt kamp ikke bliver ekstrem. */
export const ODDS = { MIN: 1.1, MAX: 6.0 };

/**
 * Fair (EV-neutral) decimal-odds for en sandsynlighed, klippet til [MIN,MAX].
 * Afrundes til 2 decimaler. p ≤ 0 giver MAX.
 */
export function fairOdds(p) {
  const prob = Number(p);
  if (!Number.isFinite(prob) || prob <= 0) return ODDS.MAX;
  const raw = 1 / prob;
  const clamped = Math.min(ODDS.MAX, Math.max(ODDS.MIN, raw));
  return Math.round(clamped * 100) / 100;
}

/** Fair odds for hvert 1X2-udfald ud fra Elo-ratings. */
export function outcomeOdds(eloArgs) {
  const p = outcomeProbabilities(eloArgs);
  return {
    [OUTCOME.HOME]: fairOdds(p[OUTCOME.HOME]),
    [OUTCOME.DRAW]: fairOdds(p[OUTCOME.DRAW]),
    [OUTCOME.AWAY]: fairOdds(p[OUTCOME.AWAY]),
  };
}

// --- Chancen: indsats-grænser + afregning ------------------------------------

/** Chancen-parametre. Cap er bevidst < 50 % af saldoen (kan aldrig gå i minus). */
export const CHANCE = {
  MIN: 1,             // mindste indsats
  MAX_ABS: 20,        // absolut loft uanset saldo
  CAP_FRACTION: 0.40, // maks. andel af saldoen (< 0.5 ⇒ ingen negativ saldo)
};

/**
 * Maksimal tilladt indsats givet spillerens nuværende saldo (point).
 * = min(absolut loft, 40 % af saldoen), rundet ned. 0 hvis for lav saldo.
 */
export function chanceMaxStake(bank) {
  const b = Number(bank);
  if (!Number.isFinite(b) || b <= 0) return 0;
  const byFraction = Math.floor(b * CHANCE.CAP_FRACTION);
  return Math.max(0, Math.min(CHANCE.MAX_ABS, byFraction));
}

/** Kan spilleren overhovedet bruge Chancen (har råd til mindste indsats)? */
export function canUseChance(bank) {
  return chanceMaxStake(bank) >= CHANCE.MIN;
}

/** Er en indsats gyldig for saldoen? (heltal, MIN ≤ stake ≤ maxStake). */
export function isValidStake(stake, bank) {
  const s = Number(stake);
  if (!Number.isInteger(s)) return false;
  return s >= CHANCE.MIN && s <= chanceMaxStake(bank);
}

/**
 * Afregn Chancen for ÉN kamp. Ren funktion — kaldes server-side ved facit.
 * Point-ændringen lægges oven i de normale 1X2-point for runden.
 * @param {{correct:boolean, stake:number, fairOdds:number}} o
 * @returns {{delta:number, profit:number}} delta = korrekt ? +profit : −indsats
 */
export function settleChance({ correct, stake, fairOdds: odds }) {
  const s = Math.max(0, Math.floor(Number(stake) || 0));
  if (s <= 0) return { delta: 0, profit: 0 };
  if (correct) {
    const profit = Math.round(s * (Number(odds) - 1));
    return { delta: profit, profit };
  }
  return { delta: -s, profit: 0 };
}

// --- Elo-vedligeholdelse (til sæson-beregning) -------------------------------

/**
 * Opdater to holds Elo-ratings efter en kamp. actualHome ∈ {1, 0.5, 0}.
 * Returnerer nye ratings; muterer ikke input.
 * @returns {{home:number, away:number}}
 */
export function updateElo(eloHome, eloAway, actualHome, { hfa = ELO.HFA, k = ELO.K } = {}) {
  const expH = eloExpectedHome(eloHome, eloAway, hfa);
  const home = Number(eloHome) + k * (actualHome - expH);
  const away = Number(eloAway) + k * ((1 - actualHome) - (1 - expH));
  return { home, away };
}

/** actualHome-værdi (1/0.5/0) ud fra et 1X2-udfald. */
export function actualHomeFromOutcome(outcome) {
  if (outcome === OUTCOME.HOME) return 1;
  if (outcome === OUTCOME.AWAY) return 0;
  return 0.5;
}
