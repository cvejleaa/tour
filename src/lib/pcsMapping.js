// ---------------------------------------------------------------------------
// Bro mellem brugerens PCS-proxy (FastAPI + procyclingstats) og vores rene
// scoring (tourScoring.js). Oversætter et /api/stages/{n}-payload til det input
// resolveStageResult() forventer, og udtrækker trøje-indehavere + etape-metadata.
//
// Payload-form (fra tdf_results.scrape_stage):
//   { number, url, meta:{date,departure,arrival,distance_km,stage_type,...},
//     classifications: {
//       etape:  { rows: [{rank, rider_name, team_name, time, points}, ...] },
//       samlet: {...}, sprint: {...}, bjerg: {...}, ungdom: {...}, hold: {...}
//     }, results_present }
// Hver række: { rank?, rider_name?, team_name?, time?, points? }
// ---------------------------------------------------------------------------

/** Henter rækkerne for et klassement (etape/samlet/sprint/bjerg/ungdom/hold). */
export function classRows(payload, key) {
  const rows = payload?.classifications?.[key]?.rows;
  return Array.isArray(rows) ? rows : [];
}

/**
 * Målrækkefølge fra etape-klassementet (allerede sorteret efter placering).
 * @returns {Array<{rider:?string, team:?string, rank:number}>}
 */
export function finishOrderFromPcs(payload) {
  return classRows(payload, 'etape').map((r, i) => ({
    rider: r?.rider_name ?? null,
    team: r?.team_name ?? null,
    rank: Number.isFinite(Number(r?.rank)) ? Number(r.rank) : i + 1,
  }));
}

/**
 * Point-liste (rytter, hold, point) fra et klassement-blok (sprint eller bjerg).
 * Bemærk: PCS' point-/bjerg-blok er KUMULATIV klassement-stilling efter etapen.
 * Med kun ét payload bliver Q3/Q4 derfor "holdet der fører klassementet". For
 * ægte point PÅ etapen, brug deltaPointsList() med forrige etapes payload.
 */
export function pointsListFromPcs(payload, key) {
  return classRows(payload, key)
    .filter((r) => r?.team_name)
    .map((r) => ({
      rider: r.rider_name ?? null,
      team: r.team_name,
      points: Number(r?.points) || 0,
    }));
}

/**
 * Ægte point PÅ etapen = kumulativ stilling efter etape N minus efter N-1,
 * pr. rytter (matchet på rider_url/rider_name). Riddere uden tidligere point
 * tæller fuldt; negative deltaer (sjældent, fx justeringer) klippes til 0.
 * @param {object} payload  etape N
 * @param {object} [prevPayload]  etape N-1 (udelad for etape 1)
 * @param {'sprint'|'bjerg'} key
 */
export function deltaPointsList(payload, prevPayload, key) {
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

/**
 * Byg input til resolveStageResult() ud fra et PCS-payload.
 * @param {object} payload  /api/stages/{n}
 * @param {object} [opts]
 * @param {number} [opts.gcTopN]  top-N til Q2
 * @param {object} [opts.prevPayload]  forrige etape — udløser delta-baserede Q3/Q4
 */
export function pcsToStageInput(payload, { gcTopN, prevPayload } = {}) {
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

/**
 * Aktuelle trøje-indehavere efter etapen (til klassement-visning + sæson-bonus).
 * @returns {{yellow:?string, green:?string, polka:?string, white:?string, teamLead:?string}}
 */
export function jerseyHolders(payload) {
  const top = (key) => classRows(payload, key)[0] || null;
  const rider = (key) => top(key)?.rider_name ?? null;
  return {
    yellow: rider('samlet'),
    green: rider('sprint'),
    polka: rider('bjerg'),
    white: rider('ungdom'),
    teamLead: top('hold')?.team_name ?? null,
  };
}

/** De fem Tour-konkurrencer i visningsrækkefølge (klassement-nøgler fra PCS). */
export const COMPETITIONS = ['samlet', 'sprint', 'bjerg', 'ungdom', 'hold'];

/** Normalisér én klassement-række til visning (rank/rytter/hold/tid/point). */
function standingRow(r, i) {
  return {
    rank: Number.isFinite(Number(r?.rank)) ? Number(r.rank) : i + 1,
    rider: r?.rider_name ?? null,
    team: r?.team_name ?? null,
    time: r?.time ?? null,
    points: (r?.points != null && r?.points !== '') ? Number(r.points) || 0 : null,
  };
}

/**
 * Fulde stillinger pr. konkurrence (samlet/sprint/bjerg/ungdom/hold), op til
 * topN rækker hver. Bruges af Tour-stillingssiden.
 * @returns {{samlet:Array, sprint:Array, bjerg:Array, ungdom:Array, hold:Array}}
 */
export function classificationStandings(payload, topN = 200) {
  const out = {};
  for (const key of COMPETITIONS) {
    out[key] = classRows(payload, key).slice(0, topN).map(standingRow);
  }
  return out;
}

/** Etaperesultatet (målrækkefølge) normaliseret til visning, op til topN. */
export function stageResultRows(payload, topN = 200) {
  return classRows(payload, 'etape').slice(0, topN).map(standingRow);
}

/** Etape-metadata til seed/visning. */
export function stageMetaFromPcs(payload) {
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
