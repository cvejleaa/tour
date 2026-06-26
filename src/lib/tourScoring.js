// ---------------------------------------------------------------------------
// Ren, delt pointlogik for Tour de France-spillet (ingen Firebase-afhængigheder).
// Bruges af frontend til at vise mulige point, OG spejles 1:1 i Cloud Functions
// (functions/tourScoring.js) som den autoritative beregning. Hold dem identiske!
//
// Spillet er HOLD-baseret: pr. etape tipper man på cykelhold, ikke ryttere.
// Op til fire etape-spørgsmål (Q1–Q4):
//   Q1 winnerTeam   – hvilket hold kommer etapevinderen fra?
//   Q2 gcTeam       – hvilket hold har samlet bedste resultat på de XX første ryttere?
//   Q3 mountainTeam – hvilket hold tager flest bjergpoint på etapen?
//   Q4 sprintTeam   – hvilket hold tager flest sprintpoint på etapen?
// XX (top-N til Q2) sættes af admin i config/settings (gcTopN).
// ---------------------------------------------------------------------------

/**
 * Standard-pointtabel. Kan overskrives pr. liga/spil via config/settings
 * (admin-redigerbar), så ALLE værdier er justerbare uden kodeændring.
 */
export const DEFAULT_POINTS = {
  winnerTeam: 5, // Q1: etapevinderens hold ramt
  gcTeam: 4, // Q2: bedste hold på de XX første ryttere ramt
  mountainTeam: 3, // Q3: flest bjergpoint-hold ramt
  sprintTeam: 3, // Q4: flest sprintpoint-hold ramt
  untippedPenalty: 1, // straf (trækkes fra) for en helt utippet etape
};

/** Top-N ryttere der tæller med i Q2-holdberegningen, hvis admin ikke har sat andet. */
export const DEFAULT_GC_TOP_N = 10;

/**
 * Fletter en (evt. delvis) admin-config sammen med standardværdierne, så vi
 * altid har et komplet, gyldigt point-objekt. Ikke-numeriske felter ignoreres.
 */
export function normalizePoints(cfg) {
  const out = { ...DEFAULT_POINTS };
  if (cfg && typeof cfg === 'object') {
    for (const key of Object.keys(DEFAULT_POINTS)) {
      const v = Number(cfg[key]);
      if (Number.isFinite(v)) out[key] = key === 'untippedPenalty' ? Math.abs(v) : v;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Holdberegning fra rå etapedata (det facit som tippene scores imod).
// Disse funktioner er rene og deterministiske: samme input → samme output.
// ---------------------------------------------------------------------------

/**
 * Summerer en talværdi pr. hold ud fra en liste af {team, value}-poster.
 * @returns {Map<string, number>} hold → sum
 */
function sumByTeam(entries, valueFn) {
  const totals = new Map();
  for (const e of entries || []) {
    const team = e?.team;
    if (team == null || team === '') continue;
    const v = Number(valueFn(e));
    if (!Number.isFinite(v)) continue;
    totals.set(team, (totals.get(team) || 0) + v);
  }
  return totals;
}

/**
 * Finder holdet med den HØJESTE sum. Deterministisk tie-break:
 * højeste sum → flest tællende poster → alfabetisk holdnavn.
 * @param {Map<string, number>} totals
 * @param {Map<string, number>} [counts]  antal tællende ryttere pr. hold (tie-break)
 * @returns {string|null}
 */
function bestTeam(totals, counts) {
  let best = null;
  let bestVal = -Infinity;
  let bestCount = -Infinity;
  // Sortér holdnavne for stabil, deterministisk afgørelse ved lige sum.
  for (const team of [...totals.keys()].sort()) {
    const val = totals.get(team);
    const cnt = counts ? counts.get(team) || 0 : 0;
    if (val > bestVal || (val === bestVal && cnt > bestCount)) {
      best = team;
      bestVal = val;
      bestCount = cnt;
    }
  }
  return best;
}

/**
 * Q1: holdet som etapevinderen (rytter nr. 1 i mål) kører for.
 * @param {Array<{rider?:string, team:string, rank?:number}>} finishOrder  ordnet efter placering
 * @returns {string|null}
 */
export function stageWinnerTeam(finishOrder) {
  const first = (finishOrder || [])[0];
  return first && first.team != null && first.team !== '' ? first.team : null;
}

/**
 * Q2: holdet med samlet bedste resultat blandt de første N ryttere i mål.
 * Placerings-point: nr. 1 giver N point, nr. 2 giver N-1 … nr. N giver 1 point.
 * Holdet med flest samlede placerings-point vinder (belønner både høje
 * placeringer OG flere ryttere højt oppe). Tie-break via bestTeam().
 * @param {Array<{rider?:string, team:string}>} finishOrder  ordnet efter placering
 * @param {number} topN
 * @returns {string|null}
 */
export function stageGcTeam(finishOrder, topN = DEFAULT_GC_TOP_N) {
  const n = Math.max(1, Math.floor(Number(topN) || DEFAULT_GC_TOP_N));
  const top = (finishOrder || []).slice(0, n);
  const counts = new Map();
  const points = top.map((e, i) => {
    if (e?.team) counts.set(e.team, (counts.get(e.team) || 0) + 1);
    return { team: e?.team, value: n - i }; // nr. (i+1) → (n - i) point
  });
  return bestTeam(sumByTeam(points, (e) => e.value), counts);
}

/**
 * Q3/Q4: holdet med flest point i en klassement-liste (bjerg eller sprint).
 * @param {Array<{rider?:string, team:string, points:number}>} pointList
 * @returns {string|null}
 */
export function topPointsTeam(pointList) {
  const counts = new Map();
  for (const e of pointList || []) {
    if (e?.team && Number(e.points) > 0) counts.set(e.team, (counts.get(e.team) || 0) + 1);
  }
  return bestTeam(sumByTeam(pointList, (e) => e.points), counts);
}

/**
 * Beregner det fulde etape-facit (de fire vinderhold) ud fra rå etapedata.
 * Dette er hvad admin-indtastning / auto-sync producerer, og som tippene
 * scores imod. Felter der mangler data udelades (afgøres ikke).
 * @param {object} raw
 * @param {Array} raw.finishOrder  ryttere i målrækkefølge, hver {rider, team}
 * @param {Array} [raw.mountainPoints]  {rider, team, points} for bjergpoint på etapen
 * @param {Array} [raw.sprintPoints]    {rider, team, points} for sprintpoint på etapen
 * @param {number} [raw.gcTopN]  top-N til Q2 (default DEFAULT_GC_TOP_N)
 * @returns {{winnerTeam:?string, gcTeam:?string, mountainTeam:?string, sprintTeam:?string}}
 */
export function resolveStageResult(raw = {}) {
  const { finishOrder, mountainPoints, sprintPoints, gcTopN } = raw;
  return {
    winnerTeam: stageWinnerTeam(finishOrder),
    gcTeam: finishOrder && finishOrder.length ? stageGcTeam(finishOrder, gcTopN) : null,
    mountainTeam: mountainPoints && mountainPoints.length ? topPointsTeam(mountainPoints) : null,
    sprintTeam: sprintPoints && sprintPoints.length ? topPointsTeam(sprintPoints) : null,
  };
}

// ---------------------------------------------------------------------------
// Scoring af et spillers etape-tip mod facit.
// ---------------------------------------------------------------------------

/** De fire tip-felter og hvilken point-nøgle de udløser. */
export const STAGE_FIELDS = [
  { key: 'winnerTeam', points: 'winnerTeam' },
  { key: 'gcTeam', points: 'gcTeam' },
  { key: 'mountainTeam', points: 'mountainTeam' },
  { key: 'sprintTeam', points: 'sprintTeam' },
];

/** True hvis tippet ikke indeholder ét eneste udfyldt holdvalg. */
export function isUntipped(bet) {
  if (!bet || typeof bet !== 'object') return true;
  return STAGE_FIELDS.every(({ key }) => bet[key] == null || bet[key] === '');
}

/**
 * Point for et etape-tip mod facit.
 * - Hvert ramt holdvalg giver det konfigurerede antal point.
 * - Et felt uden facit (endnu ikke afgjort / ikke relevant) giver 0, ikke straf.
 * - Et HELT utippet etape giver -untippedPenalty (kun når facit findes).
 *
 * @param {{winnerTeam?,gcTeam?,mountainTeam?,sprintTeam?}} bet  spillerens holdvalg
 * @param {{winnerTeam?,gcTeam?,mountainTeam?,sprintTeam?}} result  facit (vinderhold)
 * @param {object} [pointsCfg]  rå point-config (flettes med DEFAULT_POINTS)
 * @returns {{points:number, breakdown:object, untipped:boolean}}
 */
export function scoreStageBet(bet, result, pointsCfg) {
  const P = normalizePoints(pointsCfg);
  const res = result || {};
  const hasFacit = STAGE_FIELDS.some(({ key }) => res[key] != null && res[key] !== '');

  if (isUntipped(bet)) {
    const penalty = hasFacit ? -P.untippedPenalty : 0;
    return { points: penalty, breakdown: {}, untipped: true };
  }

  let total = 0;
  const breakdown = {};
  for (const { key, points } of STAGE_FIELDS) {
    const facit = res[key];
    if (facit == null || facit === '') continue; // ikke afgjort → ingen point
    const hit = bet && bet[key] != null && bet[key] !== '' && bet[key] === facit;
    if (hit) {
      breakdown[key] = P[points];
      total += P[points];
    } else {
      breakdown[key] = 0;
    }
  }
  return { points: total, breakdown, untipped: false };
}
