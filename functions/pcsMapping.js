// ---------------------------------------------------------------------------
// functions/pcsMapping.js — Bro fra PCS-proxy-payload til tourScoring (CommonJS).
// SPEJL af src/lib/pcsMapping.js — hold dem identiske! Hvert udtryk herunder
// matcher 1:1 den tilsvarende linje i ESM-udgaven (samme optional chaining og
// samme ??/||), så de to moduler ALTID giver samme resultat på samme input.
// ---------------------------------------------------------------------------

function classRows(payload, key) {
  const rows = payload?.classifications?.[key]?.rows;
  return Array.isArray(rows) ? rows : [];
}

function finishOrderFromPcs(payload) {
  return classRows(payload, 'etape').map((r, i) => ({
    rider: r?.rider_name ?? null,
    team: r?.team_name ?? null,
    rank: Number.isFinite(Number(r?.rank)) ? Number(r.rank) : i + 1,
  }));
}

function pointsListFromPcs(payload, key) {
  return classRows(payload, key)
    .filter((r) => r?.team_name)
    .map((r) => ({
      rider: r.rider_name ?? null,
      team: r.team_name,
      points: Number(r?.points) || 0,
    }));
}

function deltaPointsList(payload, prevPayload, key) {
  const prev = new Map();
  for (const r of classRows(prevPayload, key)) {
    const id = r?.rider_url || r?.rider_name;
    if (id) prev.set(id, Number(r?.points) || 0);
  }
  return classRows(payload, key)
    .filter((r) => r?.team_name)
    .map((r) => {
      const id = r?.rider_url || r?.rider_name;
      const now = Number(r?.points) || 0;
      const before = id != null ? prev.get(id) || 0 : 0;
      return { rider: r.rider_name ?? null, team: r.team_name, points: Math.max(0, now - before) };
    })
    .filter((e) => e.points > 0);
}

function needsPrevForPoints(payload) {
  const missing = (stageKey, cumKey) =>
    classRows(payload, stageKey).length === 0 && classRows(payload, cumKey).length > 0;
  return (Number(payload?.number) || 0) > 1
    && (missing('sprint', 'sprintKlass') || missing('bjerg', 'bjergKlass'));
}

function pcsToStageInput(payload, opts = {}) {
  const { gcTopN, prevPayload, prevCumulative } = opts;
  const useDelta = prevPayload !== undefined;
  const pick = (stageKey, cumKey) => {
    if (useDelta) return deltaPointsList(payload, prevPayload, stageKey);
    const perStage = pointsListFromPcs(payload, stageKey);
    if (perStage.length) return perStage;
    // letour 2026: per-etape-koderne mangler → kumulativ klassement-delta.
    if (classRows(payload, cumKey).length) {
      return deltaPointsList(payload, prevCumulative ?? null, cumKey);
    }
    return perStage;
  };
  return {
    finishOrder: finishOrderFromPcs(payload),
    mountainPoints: pick('bjerg', 'bjergKlass'),
    sprintPoints: pick('sprint', 'sprintKlass'),
    gcTopN,
  };
}

function jerseyHolders(payload) {
  const top = (key) => classRows(payload, key)[0] || null;
  const rider = (key) => top(key)?.rider_name ?? null;
  return {
    yellow: rider('samlet'),
    // Trøjen bæres af KLASSEMENTETS fører — foretræk de kumulative
    // klassementer (2026-stakken); per-etape-listen er kun fallback.
    green: rider('sprintKlass') ?? rider('sprint'),
    polka: rider('bjergKlass') ?? rider('bjerg'),
    white: rider('ungdom'),
    teamLead: top('hold')?.team_name ?? null,
  };
}

const COMPETITIONS = ['samlet', 'sprint', 'bjerg', 'ungdom', 'hold'];

function standingRow(r, i) {
  return {
    rank: Number.isFinite(Number(r?.rank)) ? Number(r.rank) : i + 1,
    rider: r?.rider_name ?? null,
    team: r?.team_name ?? null,
    time: r?.time ?? null,
    points: (r?.points != null && r?.points !== '') ? Number(r.points) || 0 : null,
  };
}

// Stillingen i point-konkurrencerne er den KUMULATIVE klassement-stilling —
// foretræk 2026-stakkens ipg/img (sprintKlass/bjergKlass) når de findes.
const CUMULATIVE_PREF = { sprint: 'sprintKlass', bjerg: 'bjergKlass' };

function classificationStandings(payload, topN = 200) {
  const out = {};
  for (const key of COMPETITIONS) {
    const cum = CUMULATIVE_PREF[key] ? classRows(payload, CUMULATIVE_PREF[key]) : [];
    const rows = cum.length ? cum : classRows(payload, key);
    out[key] = rows.slice(0, topN).map(standingRow);
  }
  return out;
}

function stageResultRows(payload, topN = 200) {
  return classRows(payload, 'etape').slice(0, topN).map(standingRow);
}

function stageMetaFromPcs(payload) {
  const m = payload?.meta || {};
  return {
    number: payload?.number ?? null,
    date: m.date ?? null,
    startCity: m.departure ?? null,
    finishCity: m.arrival ?? null,
    km: m.distance_km ?? null,
    type: m.stage_type ?? null,
    profileIcon: m.profile_icon ?? null,
  };
}

module.exports = {
  classRows,
  finishOrderFromPcs,
  pointsListFromPcs,
  deltaPointsList,
  needsPrevForPoints,
  pcsToStageInput,
  jerseyHolders,
  classificationStandings,
  stageResultRows,
  COMPETITIONS,
  stageMetaFromPcs,
};
