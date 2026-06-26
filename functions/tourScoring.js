// ---------------------------------------------------------------------------
// functions/tourScoring.js — AUTORITATIV, hold-baseret pointlogik (CommonJS).
// SPEJL af src/lib/tourScoring.js — hold dem 100% identiske i opførsel!
// Cloud Functions beregner point; klienten viser kun.
// ---------------------------------------------------------------------------

const DEFAULT_POINTS = {
  winnerTeam: 5, // Q1: etapevinderens hold ramt
  gcTeam: 4, // Q2: bedste hold på de XX første ryttere ramt
  mountainTeam: 3, // Q3: flest bjergpoint-hold ramt
  sprintTeam: 3, // Q4: flest sprintpoint-hold ramt
  untippedPenalty: 1, // straf (trækkes fra) for en helt utippet etape
};

const DEFAULT_GC_TOP_N = 10;

function normalizePoints(cfg) {
  const out = { ...DEFAULT_POINTS };
  if (cfg && typeof cfg === 'object') {
    for (const key of Object.keys(DEFAULT_POINTS)) {
      const v = Number(cfg[key]);
      if (Number.isFinite(v)) out[key] = key === 'untippedPenalty' ? Math.abs(v) : v;
    }
  }
  return out;
}

function sumByTeam(entries, valueFn) {
  const totals = new Map();
  for (const e of entries || []) {
    const team = e && e.team;
    if (team == null || team === '') continue;
    const v = Number(valueFn(e));
    if (!Number.isFinite(v)) continue;
    totals.set(team, (totals.get(team) || 0) + v);
  }
  return totals;
}

function bestTeam(totals, counts) {
  let best = null;
  let bestVal = -Infinity;
  let bestCount = -Infinity;
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

function stageWinnerTeam(finishOrder) {
  const first = (finishOrder || [])[0];
  return first && first.team != null && first.team !== '' ? first.team : null;
}

function stageGcTeam(finishOrder, topN = DEFAULT_GC_TOP_N) {
  const n = Math.max(1, Math.floor(Number(topN) || DEFAULT_GC_TOP_N));
  const top = (finishOrder || []).slice(0, n);
  const counts = new Map();
  const points = top.map((e, i) => {
    if (e && e.team) counts.set(e.team, (counts.get(e.team) || 0) + 1);
    return { team: e && e.team, value: n - i };
  });
  return bestTeam(sumByTeam(points, (e) => e.value), counts);
}

function topPointsTeam(pointList) {
  const counts = new Map();
  for (const e of pointList || []) {
    if (e && e.team && Number(e.points) > 0) counts.set(e.team, (counts.get(e.team) || 0) + 1);
  }
  return bestTeam(sumByTeam(pointList, (e) => e.points), counts);
}

function resolveStageResult(raw = {}) {
  const { finishOrder, mountainPoints, sprintPoints, gcTopN } = raw;
  return {
    winnerTeam: stageWinnerTeam(finishOrder),
    gcTeam: finishOrder && finishOrder.length ? stageGcTeam(finishOrder, gcTopN) : null,
    mountainTeam: mountainPoints && mountainPoints.length ? topPointsTeam(mountainPoints) : null,
    sprintTeam: sprintPoints && sprintPoints.length ? topPointsTeam(sprintPoints) : null,
  };
}

const STAGE_FIELDS = [
  { key: 'winnerTeam', points: 'winnerTeam' },
  { key: 'gcTeam', points: 'gcTeam' },
  { key: 'mountainTeam', points: 'mountainTeam' },
  { key: 'sprintTeam', points: 'sprintTeam' },
];

function isUntipped(bet) {
  if (!bet || typeof bet !== 'object') return true;
  return STAGE_FIELDS.every(({ key }) => bet[key] == null || bet[key] === '');
}

function scoreStageBet(bet, result, pointsCfg) {
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
    if (facit == null || facit === '') continue;
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

module.exports = {
  DEFAULT_POINTS,
  DEFAULT_GC_TOP_N,
  normalizePoints,
  stageWinnerTeam,
  stageGcTeam,
  topPointsTeam,
  resolveStageResult,
  STAGE_FIELDS,
  isUntipped,
  scoreStageBet,
};
