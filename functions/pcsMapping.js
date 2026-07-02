// ---------------------------------------------------------------------------
// functions/pcsMapping.js — Bro fra PCS-proxy-payload til tourScoring (CommonJS).
// SPEJL af src/lib/pcsMapping.js — hold dem identiske!
// ---------------------------------------------------------------------------

function classRows(payload, key) {
  const rows = payload && payload.classifications && payload.classifications[key]
    ? payload.classifications[key].rows
    : null;
  return Array.isArray(rows) ? rows : [];
}

function finishOrderFromPcs(payload) {
  return classRows(payload, 'etape').map((r, i) => ({
    rider: (r && r.rider_name) || null,
    team: (r && r.team_name) || null,
    rank: Number.isFinite(Number(r && r.rank)) ? Number(r.rank) : i + 1,
  }));
}

function pointsListFromPcs(payload, key) {
  return classRows(payload, key)
    .filter((r) => r && r.team_name)
    .map((r) => ({
      rider: r.rider_name || null,
      team: r.team_name,
      points: Number(r.points) || 0,
    }));
}

function deltaPointsList(payload, prevPayload, key) {
  const prev = new Map();
  for (const r of classRows(prevPayload, key)) {
    const id = (r && (r.rider_url || r.rider_name)) || null;
    if (id) prev.set(id, Number(r.points) || 0);
  }
  return classRows(payload, key)
    .filter((r) => r && r.team_name)
    .map((r) => {
      const id = r.rider_url || r.rider_name;
      const now = Number(r.points) || 0;
      const before = id != null ? prev.get(id) || 0 : 0;
      return { rider: r.rider_name || null, team: r.team_name, points: Math.max(0, now - before) };
    })
    .filter((e) => e.points > 0);
}

function pcsToStageInput(payload, opts = {}) {
  const { gcTopN, prevPayload } = opts;
  const useDelta = prevPayload !== undefined;
  return {
    finishOrder: finishOrderFromPcs(payload),
    mountainPoints: useDelta
      ? deltaPointsList(payload, prevPayload, 'bjerg')
      : pointsListFromPcs(payload, 'bjerg'),
    sprintPoints: useDelta
      ? deltaPointsList(payload, prevPayload, 'sprint')
      : pointsListFromPcs(payload, 'sprint'),
    gcTopN,
  };
}

function jerseyHolders(payload) {
  const top = (key) => classRows(payload, key)[0] || null;
  const rider = (key) => {
    const t = top(key);
    return (t && t.rider_name) || null;
  };
  const teamRow = top('hold');
  return {
    yellow: rider('samlet'),
    green: rider('sprint'),
    polka: rider('bjerg'),
    white: rider('ungdom'),
    teamLead: (teamRow && teamRow.team_name) || null,
  };
}

const COMPETITIONS = ['samlet', 'sprint', 'bjerg', 'ungdom', 'hold'];

function standingRow(r, i) {
  return {
    rank: Number.isFinite(Number(r && r.rank)) ? Number(r.rank) : i + 1,
    rider: (r && r.rider_name) || null,
    team: (r && r.team_name) || null,
    time: (r && r.time) || null,
    points: (r && r.points != null && r.points !== '') ? Number(r.points) || 0 : null,
  };
}

function classificationStandings(payload, topN = 200) {
  const out = {};
  for (const key of COMPETITIONS) {
    out[key] = classRows(payload, key).slice(0, topN).map(standingRow);
  }
  return out;
}

function stageResultRows(payload, topN = 200) {
  return classRows(payload, 'etape').slice(0, topN).map(standingRow);
}

function stageMetaFromPcs(payload) {
  const m = (payload && payload.meta) || {};
  return {
    number: (payload && payload.number) != null ? payload.number : null,
    date: m.date || null,
    startCity: m.departure || null,
    finishCity: m.arrival || null,
    km: m.distance_km != null ? m.distance_km : null,
    type: m.stage_type || null,
    profileIcon: m.profile_icon || null,
  };
}

module.exports = {
  classRows,
  finishOrderFromPcs,
  pointsListFromPcs,
  deltaPointsList,
  pcsToStageInput,
  jerseyHolders,
  classificationStandings,
  stageResultRows,
  COMPETITIONS,
  stageMetaFromPcs,
};
