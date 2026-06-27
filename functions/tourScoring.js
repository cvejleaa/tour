// ---------------------------------------------------------------------------
// functions/tourScoring.js — AUTORITATIV, hold-baseret pointlogik (CommonJS).
// SPEJL af src/lib/tourScoring.js — hold dem 100% identiske i opførsel!
// Cloud Functions beregner point; klienten viser kun.
//
// PODIE-POINT: et tip giver point efter holdets PLACERING i spørgsmålets top-3,
// pr. spørgsmål en faldende skala [1., 2., 3.]. Alle værdier er admin-redigerbare.
// ---------------------------------------------------------------------------

const DEFAULT_POINTS = {
  winnerTeam: 5,
  gcTeam: 4,
  mountainTeam: 3,
  sprintTeam: 3,
  untippedPenalty: 1,
};

const DEFAULT_PODIUM = {
  winnerTeam: [5, 3, 1],
  gcTeam: [4, 2, 1],
  mountainTeam: [3, 2, 1],
  sprintTeam: [3, 2, 1],
};

const DEFAULT_UNTIPPED_PENALTY = 1;
const DEFAULT_GC_TOP_N = 10;
const QUESTION_KEYS = ['winnerTeam', 'gcTeam', 'mountainTeam', 'sprintTeam'];

/**
 * Normaliser et bonus-svar/facit til en sammenlignings-streng. Håndterer både
 * skalar-værdier og ARRAYS (teams: vælg flere). Arrays sorteres, så rækkefølgen
 * er ligegyldig. Sammenligningen er trimmet og ufølsom for store/små bogstaver.
 */
function bonusNorm(x) {
  return Array.isArray(x)
    ? x.map((v) => String(v ?? '').trim().toLowerCase()).sort().join('|')
    : String(x ?? '').trim().toLowerCase();
}

/** Flad 1.-pladstabel (bagudkompatibel; til visning). Tal eller array ([0]). */
function normalizePoints(cfg) {
  const out = { ...DEFAULT_POINTS };
  if (cfg && typeof cfg === 'object') {
    for (const key of QUESTION_KEYS) {
      const raw = Array.isArray(cfg[key]) ? cfg[key][0] : cfg[key];
      const v = Number(raw);
      if (Number.isFinite(v)) out[key] = v;
    }
    const pen = Number(cfg.untippedPenalty);
    if (Number.isFinite(pen)) out.untippedPenalty = Math.abs(pen);
  }
  return out;
}

/** Fuld PODIE-config: pr. spørgsmål [1., 2., 3.] + untippedPenalty. */
function normalizePodium(cfg) {
  const out = {};
  for (const key of QUESTION_KEYS) {
    const def = DEFAULT_PODIUM[key];
    const raw = cfg && cfg[key];
    let arr;
    if (Array.isArray(raw)) arr = raw;
    else if (raw != null && Number.isFinite(Number(raw))) arr = [Number(raw), def[1], def[2]];
    else arr = def;
    out[key] = [0, 1, 2].map((i) => {
      const v = Number(arr[i]);
      return Number.isFinite(v) ? v : def[i];
    });
  }
  const pen = cfg && Number(cfg.untippedPenalty);
  out.untippedPenalty = Number.isFinite(pen) ? Math.abs(pen) : DEFAULT_UNTIPPED_PENALTY;
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

function rankTeams(totals, counts) {
  return [...totals.keys()].sort((a, b) => {
    const dv = totals.get(b) - totals.get(a);
    if (dv) return dv;
    const dc = (counts ? counts.get(b) || 0 : 0) - (counts ? counts.get(a) || 0 : 0);
    if (dc) return dc;
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

function bestTeam(totals, counts) {
  const r = rankTeams(totals, counts);
  return r.length ? r[0] : null;
}

function gcTotals(finishOrder, topN = DEFAULT_GC_TOP_N) {
  const n = Math.max(1, Math.floor(Number(topN) || DEFAULT_GC_TOP_N));
  const top = (finishOrder || []).slice(0, n);
  const counts = new Map();
  const points = top.map((e, i) => {
    if (e && e.team) counts.set(e.team, (counts.get(e.team) || 0) + 1);
    return { team: e && e.team, value: n - i };
  });
  return { totals: sumByTeam(points, (e) => e.value), counts };
}

function pointsTotals(pointList) {
  const counts = new Map();
  for (const e of pointList || []) {
    if (e && e.team && Number(e.points) > 0) counts.set(e.team, (counts.get(e.team) || 0) + 1);
  }
  return { totals: sumByTeam(pointList, (e) => e.points), counts };
}

function teamPodiumFromFinish(finishOrder, k = 3) {
  const out = [];
  for (const e of finishOrder || []) {
    const t = e && e.team;
    if (t == null || t === '' || out.includes(t)) continue;
    out.push(t);
    if (out.length >= k) break;
  }
  return out;
}

function stageWinnerTeam(finishOrder) {
  const first = (finishOrder || [])[0];
  return first && first.team != null && first.team !== '' ? first.team : null;
}

function stageGcTeam(finishOrder, topN = DEFAULT_GC_TOP_N) {
  const { totals, counts } = gcTotals(finishOrder, topN);
  return bestTeam(totals, counts);
}

function topPointsTeam(pointList) {
  const { totals, counts } = pointsTotals(pointList);
  return bestTeam(totals, counts);
}

function resolveStageResult(raw = {}) {
  const { finishOrder, mountainPoints, sprintPoints, gcTopN } = raw;
  const gc = finishOrder && finishOrder.length ? gcTotals(finishOrder, gcTopN) : null;
  const mt = mountainPoints && mountainPoints.length ? pointsTotals(mountainPoints) : null;
  const sp = sprintPoints && sprintPoints.length ? pointsTotals(sprintPoints) : null;
  const podium = {
    winnerTeam: teamPodiumFromFinish(finishOrder),
    gcTeam: gc ? rankTeams(gc.totals, gc.counts).slice(0, 3) : [],
    mountainTeam: mt ? rankTeams(mt.totals, mt.counts).slice(0, 3) : [],
    sprintTeam: sp ? rankTeams(sp.totals, sp.counts).slice(0, 3) : [],
  };
  return {
    winnerTeam: podium.winnerTeam[0] ?? null,
    gcTeam: podium.gcTeam[0] ?? null,
    mountainTeam: podium.mountainTeam[0] ?? null,
    sprintTeam: podium.sprintTeam[0] ?? null,
    podium,
  };
}

const STAGE_FIELDS = [
  { key: 'winnerTeam', points: 'winnerTeam' },
  { key: 'gcTeam', points: 'gcTeam' },
  { key: 'mountainTeam', points: 'mountainTeam' },
  { key: 'sprintTeam', points: 'sprintTeam' },
];

const QUESTION_DEFAULTS_BY_TYPE = {
  ttt: { winnerTeam: true, gcTeam: false, mountainTeam: false, sprintTeam: false },
  itt: { winnerTeam: true, gcTeam: true, mountainTeam: false, sprintTeam: false },
  flat: { winnerTeam: true, gcTeam: true, mountainTeam: false, sprintTeam: true },
  hilly: { winnerTeam: true, gcTeam: true, mountainTeam: true, sprintTeam: true },
  mountain: { winnerTeam: true, gcTeam: true, mountainTeam: true, sprintTeam: true },
  unknown: { winnerTeam: true, gcTeam: true, mountainTeam: true, sprintTeam: true },
};

function isQuestionsObject(x) {
  return (
    x != null &&
    typeof x === 'object' &&
    STAGE_FIELDS.every(({ key }) => typeof x[key] === 'boolean')
  );
}

function activeQuestionsForStage(stage) {
  if (stage && isQuestionsObject(stage.questions)) {
    return {
      winnerTeam: stage.questions.winnerTeam,
      gcTeam: stage.questions.gcTeam,
      mountainTeam: stage.questions.mountainTeam,
      sprintTeam: stage.questions.sprintTeam,
    };
  }
  const type = stage && stage.type;
  return { ...(QUESTION_DEFAULTS_BY_TYPE[type] || QUESTION_DEFAULTS_BY_TYPE.unknown) };
}

function isUntipped(bet, active) {
  if (!bet || typeof bet !== 'object') return true;
  return STAGE_FIELDS.every(
    ({ key }) => (active && !active[key]) || bet[key] == null || bet[key] === '',
  );
}

function podiumFor(res, key) {
  if (res.podium && Array.isArray(res.podium[key])) return res.podium[key];
  return res[key] != null && res[key] !== '' ? [res[key]] : [];
}

function scoreStageBet(bet, result, pointsCfg, stageOrActive) {
  const P = normalizePodium(pointsCfg);
  const res = result || {};
  const active = stageOrActive == null
    ? { winnerTeam: true, gcTeam: true, mountainTeam: true, sprintTeam: true }
    : (isQuestionsObject(stageOrActive)
      ? stageOrActive
      : activeQuestionsForStage(stageOrActive));
  const hasFacit = STAGE_FIELDS.some(
    ({ key }) => active[key] && podiumFor(res, key).length > 0,
  );

  if (isUntipped(bet, active)) {
    const penalty = hasFacit ? -P.untippedPenalty : 0;
    return { points: penalty, breakdown: {}, untipped: true };
  }

  let total = 0;
  const breakdown = {};
  for (const { key } of STAGE_FIELDS) {
    if (!active[key]) continue;
    const podium = podiumFor(res, key);
    if (!podium.length) continue;
    const pick = bet && bet[key];
    if (pick == null || pick === '') { breakdown[key] = 0; continue; }
    const rank = podium.findIndex((t) => t === pick);
    const pts = rank >= 0 ? (P[key][rank] || 0) : 0;
    breakdown[key] = pts;
    total += pts;
  }
  return { points: total, breakdown, untipped: false };
}

module.exports = {
  DEFAULT_POINTS,
  DEFAULT_PODIUM,
  DEFAULT_UNTIPPED_PENALTY,
  DEFAULT_GC_TOP_N,
  normalizePoints,
  normalizePodium,
  stageWinnerTeam,
  stageGcTeam,
  topPointsTeam,
  resolveStageResult,
  STAGE_FIELDS,
  QUESTION_DEFAULTS_BY_TYPE,
  activeQuestionsForStage,
  isUntipped,
  scoreStageBet,
  bonusNorm,
};
