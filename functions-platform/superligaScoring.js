// ---------------------------------------------------------------------------
// functions-platform/superligaScoring.js — AUTORITATIV Superliga-pointlogik (CommonJS).
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

// Combi-bonus: 2 × kvadratroden af de ramte odds ganget sammen, med loft.
// Kaldes kun når spilleren har tippet ALLE kuponens kampe. Hver ramt kamp
// tæller — der er ikke længere et krav om højst én fejl.
//
// Kvadratroden er ikke pynt: den gamle regel STRAFFEDE mod (−1,3 point pr.
// runde for den, der tippede tre outsidere) og afgjorde sæsonvinderen i
// halvdelen af alle sæsoner, selv om den kun var 19 % af pointene.
// SPEJLET: src/lib/superligaScoring.js skal følges ad (CLAUDE.md).
const COMBI = { FAKTOR: 2, LOFT: 25 };

/** Bagudkompatibelt opslag: det højeste, en kupon kan give. */
const ROUND_BONUS = { PERFECT_CAP: COMBI.LOFT, NEAR_CAP: COMBI.LOFT };

function roundComboBonus(hitOdds, matchCount) {
  if (!Array.isArray(hitOdds) || !Number.isFinite(matchCount) || matchCount < 2) return 0;
  // Under to ramte er der ingen kupon at gange — én ramt kamp har allerede
  // fået sine 1X2-point.
  if (hitOdds.length < 2) return 0;
  const product = hitOdds.reduce((a, b) => a * (Number(b) || 0), 1);
  return round1(Math.min(COMBI.FAKTOR * Math.sqrt(product), COMBI.LOFT));
}

// Chancen: samme loft som klienten (src/lib/superligaScoring.js). Serveren er
// eneste autoritet — klientens validering kan omgås, så indsatsen SKAL klippes
// her, ellers ville et forfalsket chanceStake give ubegrænset gevinst.
const CHANCE = { MIN: 1, MAX_ABS: 8, CAP_FRACTION: 0.15 };

/** Maksimal tilladt indsats givet spillerens saldo: min(loft, 15 % af saldo). */
function chanceMaxStake(bank) {
  const b = Number(bank);
  if (!Number.isFinite(b) || b <= 0) return 0;
  return Math.max(0, Math.min(CHANCE.MAX_ABS, Math.floor(b * CHANCE.CAP_FRACTION)));
}

/**
 * Klip en indsats til det tilladte: heltal, aldrig over det absolutte loft, og
 * aldrig over saldo-andelen når saldoen kendes. Ukendt saldo → kun loftet.
 * @param {number} stake
 * @param {number} [bank] spillerens point FØR runden (udelades = kun MAX_ABS)
 */
function clampStake(stake, bank) {
  const s = Math.max(0, Math.floor(Number(stake) || 0));
  if (s <= 0) return 0;
  const cap = bank == null ? CHANCE.MAX_ABS : chanceMaxStake(bank);
  return Math.min(s, cap);
}

/**
 * Afregn Chancen for ét tip. delta = korrekt ? +indsats×(odds−1) : −indsats.
 * Indsatsen klippes til loftet — se clampStake.
 * @param {{correct:boolean, stake:number, fairOdds:number, bank?:number}} o
 * @returns {{delta:number, profit:number}}
 */
function settleChance({ correct, stake, fairOdds, bank }) {
  const s = clampStake(stake, bank);
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
function scoreBet(bet, result, odds, bank) {
  if (!bet || !isOutcome(bet.pick) || !isOutcome(result)) return 0;
  const base = outcomePoints(bet.pick, result, odds);
  const stake = clampStake(bet.chanceStake, bank);
  if (stake <= 0) return base;
  const o = odds && Number.isFinite(odds[bet.pick]) ? Number(odds[bet.pick]) : null;
  // Uden gyldige odds kan Chancen ikke afregnes fair → ingen gevinst/tab.
  if (o == null) return base;
  const { delta } = settleChance({ correct: bet.pick === result, stake, fairOdds: o });
  return base + delta;
}

// --- Elo-lite: sandsynligheder, odds + vedligeholdelse (spejl af src) --------

const ELO = { START: 1500, HFA: 60, K: 20, DRAW_BASE: 0.26, DRAW_DECAY: 0.55 };
const ODDS = { MIN: 1.1, MAX: 6.0 };

function eloExpectedHome(eloHome, eloAway, hfa = ELO.HFA) {
  const dr = (Number(eloHome) + hfa) - Number(eloAway);
  return 1 / (1 + 10 ** (-dr / 400));
}

function outcomeProbabilities({
  eloHome = ELO.START, eloAway = ELO.START, hfa = ELO.HFA,
  drawBase = ELO.DRAW_BASE, drawDecay = ELO.DRAW_DECAY,
} = {}) {
  const e = eloExpectedHome(eloHome, eloAway, hfa); // med hjemmebane — til fordeling
  // Uafgjort topper ved REELT lige hold: mål skævheden UDEN hjemmebane, så
  // hjemmefordelen ikke lækker ind og trækker uafgjort-niveauet kunstigt ned.
  const eLevel = eloExpectedHome(eloHome, eloAway, 0);
  const skew = Math.abs(2 * eLevel - 1);
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

// --- Pulje-tip (spejl af src): slutstilling + pulje-score ---------------------
const PULJE = { POOL_SIZE: 6, PER_TEAM: 4, PERFECT_BONUS: 10 };

function leagueTable(matches) {
  const table = new Map();
  const row = (name) => {
    if (!table.has(name)) table.set(name, { name, played: 0, points: 0, gf: 0, ga: 0, gd: 0 });
    return table.get(name);
  };
  const goalOf = (g) => (g == null || g === '' ? NaN : Number(g));
  for (const m of matches || []) {
    const hg = goalOf(m.homeGoals);
    const ag = goalOf(m.awayGoals);
    if (!m.home || !m.away || !Number.isFinite(hg) || !Number.isFinite(ag)) continue;
    const h = row(m.home);
    const a = row(m.away);
    h.played += 1; a.played += 1;
    h.gf += hg; h.ga += ag; a.gf += ag; a.ga += hg;
    if (hg > ag) h.points += 3;
    else if (hg < ag) a.points += 3;
    else { h.points += 1; a.points += 1; }
  }
  const rows = [...table.values()];
  for (const r of rows) r.gd = r.gf - r.ga;
  rows.sort((x, y) => (y.points - x.points) || (y.gd - x.gd) || (y.gf - x.gf)
    || x.name.localeCompare(y.name, 'da'));
  return rows;
}

function championshipTeams(matches, poolSize = PULJE.POOL_SIZE) {
  return leagueTable(matches).slice(0, poolSize).map((r) => r.name);
}

function puljeScore(championshipPick, actualTop6) {
  const top = actualTop6 instanceof Set ? actualTop6 : new Set(actualTop6 || []);
  const picks = Array.isArray(championshipPick) ? [...new Set(championshipPick)] : [];
  const correct = picks.filter((t) => top.has(t)).length;
  const perfect = correct === PULJE.POOL_SIZE && picks.length === PULJE.POOL_SIZE;
  const points = correct * PULJE.PER_TEAM + (perfect ? PULJE.PERFECT_BONUS : 0);
  return { correct, points };
}

module.exports = {
  PULJE, leagueTable, championshipTeams, puljeScore,
  OUTCOME, OUTCOMES, DEFAULT_POINTS, ROUND_BONUS, COMBI, ELO, ODDS, CHANCE,
  isOutcome, outcomeFromScore, round1, outcomeReward, outcomePoints, roundComboBonus,
  settleChance, scoreBet, chanceMaxStake, clampStake,
  eloExpectedHome, outcomeProbabilities, fairOdds, outcomeOdds,
  updateElo, actualHomeFromOutcome,
};
