// ---------------------------------------------------------------------------
// Ren, delt pointlogik for Tour de France-spillet (ingen Firebase-afhængigheder).
// Bruges af frontend til at vise mulige point, OG spejles 1:1 i Cloud Functions
// (functions/tourScoring.js) som den autoritative beregning. Hold dem identiske!
//
// Spillet er HOLD-baseret: pr. etape tipper man på cykelhold, ikke ryttere.
// Op til fire etape-spørgsmål (Q1–Q4):
//   Q1 winnerTeam   – hvilket hold kommer etapevinderen fra?
//   Q2 gcTeam       – hvilket hold har den laveste sum af sine XX bedst placerede rytteres placeringer?
//   Q3 mountainTeam – hvilket hold tager flest bjergpoint på etapen?
//   Q4 sprintTeam   – hvilket hold tager flest sprintpoint på etapen?
// XX (top-N til Q2) sættes af admin i config/settings (gcTopN).
//
// PODIE-POINT: et tip giver point efter holdets PLACERING i spørgsmålets top-3.
// Pr. spørgsmål en faldende skala [1.-plads, 2.-plads, 3.-plads]. Alle værdier er
// admin-redigerbare. Et ramt 1.-plads-tip giver mest; 2./3.-plads giver mindre,
// så langt flere tips udløser point.
// ---------------------------------------------------------------------------

/**
 * Standard 1.-pladspoint pr. spørgsmål (bagudkompatibel flad tabel — bruges til
 * visning og som standard for podiets 1.-plads).
 */
export const DEFAULT_POINTS = {
  winnerTeam: 5, // Q1: etapevinderens hold
  gcTeam: 4, // Q2: bedste hold på de XX første ryttere
  mountainTeam: 3, // Q3: flest bjergpoint
  sprintTeam: 3, // Q4: flest sprintpoint
  untippedPenalty: 1, // straf (trækkes fra) for en helt utippet etape
};

/** Standard PODIE-skala pr. spørgsmål: [1.-plads, 2.-plads, 3.-plads]. */
export const DEFAULT_PODIUM = {
  winnerTeam: [5, 3, 1],
  gcTeam: [4, 2, 1],
  mountainTeam: [3, 2, 1],
  sprintTeam: [3, 2, 1],
};

export const DEFAULT_UNTIPPED_PENALTY = 1;

/** Top-N ryttere der tæller med i Q2-holdberegningen, hvis admin ikke har sat andet. */
export const DEFAULT_GC_TOP_N = 10;

/** Nøglerne for de fire holdspørgsmål. */
const QUESTION_KEYS = ['winnerTeam', 'gcTeam', 'mountainTeam', 'sprintTeam'];

/**
 * Flad 1.-pladstabel fra en (evt. delvis) admin-config — bagudkompatibel.
 * Accepterer både tal (1.-plads direkte) og arrays (tager [0]). Bruges til visning.
 */
export function normalizePoints(cfg) {
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

/**
 * Fuld PODIE-config fra en (evt. delvis) admin-config. Hvert spørgsmål bliver et
 * 3-tal [1., 2., 3.]. Accepterer både arrays ([5,3,1]) og enkelt-tal (= 1.-plads,
 * 2./3. tages fra standard), så gammel flad config virker uændret.
 * @returns {{winnerTeam:number[], gcTeam:number[], mountainTeam:number[], sprintTeam:number[], untippedPenalty:number}}
 */
export function normalizePodium(cfg) {
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
 * Rangordner hold deterministisk: højeste sum → flest tællende poster →
 * alfabetisk holdnavn. Returnerer en ordnet liste af holdnavne (bedst først).
 * @param {Map<string, number>} totals
 * @param {Map<string, number>} [counts]
 * @returns {string[]}
 */
function rankTeams(totals, counts) {
  return [...totals.keys()].sort((a, b) => {
    const dv = totals.get(b) - totals.get(a);
    if (dv) return dv;
    const dc = (counts ? counts.get(b) || 0 : 0) - (counts ? counts.get(a) || 0 : 0);
    if (dc) return dc;
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

/** Holdet med den HØJESTE sum (eller null). Tie-break som rankTeams. */
function bestTeam(totals, counts) {
  const r = rankTeams(totals, counts);
  return r.length ? r[0] : null;
}

/**
 * Q2-holdstilling: for HVERT hold summeres dets N bedst placerede rytteres
 * MÅLPLACERINGER, og LAVEST sum vinder (som holdkonkurrencen — færre/lavere
 * placeringer er bedre). Kun hold med mindst N ryttere i mål kvalificerer.
 * Eksempel (N=4): hold med ryttere på 2,3,8,12,… → sum 25; hold på 1,5,7,11,…
 * → sum 24 → sidstnævnte vinder.
 * @returns {Array<{team:string, sum:number, riders:Array<{rider:?string, rank:number}>}>}
 *   bedst (lavest sum) først; tie-break: flere data ⇒ alfabetisk holdnavn.
 */
export function gcTeamStanding(finishOrder, topN = DEFAULT_GC_TOP_N) {
  const n = Math.max(1, Math.floor(Number(topN) || DEFAULT_GC_TOP_N));
  const byTeam = new Map();
  (finishOrder || []).forEach((e, i) => {
    const team = e?.team;
    if (team == null || team === '') return;
    const rank = Number.isFinite(Number(e?.rank)) ? Number(e.rank) : i + 1;
    const arr = byTeam.get(team) || [];
    arr.push({ rider: e?.rider ?? null, rank });
    byTeam.set(team, arr);
  });
  const rows = [];
  for (const [team, riders] of byTeam) {
    if (riders.length < n) continue; // ikke nok ryttere i mål → kvalificerer ikke
    const best = [...riders].sort((a, b) => a.rank - b.rank).slice(0, n);
    rows.push({ team, sum: best.reduce((s, r) => s + r.rank, 0), riders: best });
  }
  rows.sort((a, b) => (a.sum - b.sum) || (a.team < b.team ? -1 : a.team > b.team ? 1 : 0));
  return rows;
}

/** {totals, counts} for en klassement-pointliste (bjerg/sprint). */
function pointsTotals(pointList) {
  const counts = new Map();
  for (const e of pointList || []) {
    if (e?.team && Number(e.points) > 0) counts.set(e.team, (counts.get(e.team) || 0) + 1);
  }
  return { totals: sumByTeam(pointList, (e) => e.points), counts };
}

/**
 * De første K FORSKELLIGE hold i målrækkefølgen (et holds placering = dets
 * bedst placerede rytter). Bruges til etapevinder-podiet.
 */
function teamPodiumFromFinish(finishOrder, k = 3) {
  const out = [];
  for (const e of finishOrder || []) {
    const t = e?.team;
    if (t == null || t === '' || out.includes(t)) continue;
    out.push(t);
    if (out.length >= k) break;
  }
  return out;
}

/**
 * Q1: holdet som etapevinderen (rytter nr. 1 i mål) kører for.
 * @returns {string|null}
 */
export function stageWinnerTeam(finishOrder) {
  const first = (finishOrder || [])[0];
  return first && first.team != null && first.team !== '' ? first.team : null;
}

/**
 * Q2: holdet med den laveste sum af sine N bedst placerede rytteres placeringer.
 * @returns {string|null}
 */
export function stageGcTeam(finishOrder, topN = DEFAULT_GC_TOP_N) {
  const r = gcTeamStanding(finishOrder, topN);
  return r.length ? r[0].team : null;
}

/**
 * Q3/Q4: holdet med flest point i en klassement-liste (bjerg eller sprint).
 * @returns {string|null}
 */
export function topPointsTeam(pointList) {
  const { totals, counts } = pointsTotals(pointList);
  return bestTeam(totals, counts);
}

/**
 * Beregner det fulde etape-facit ud fra rå etapedata: vinderholdet pr. spørgsmål
 * PLUS et `podium` med top-3 hold pr. spørgsmål (til podie-point). Felter der
 * mangler data udelades (afgøres ikke / tomt podium).
 * @param {object} raw
 * @param {Array} raw.finishOrder  ryttere i målrækkefølge, hver {rider, team}
 * @param {Array} [raw.mountainPoints]  {rider, team, points}
 * @param {Array} [raw.sprintPoints]    {rider, team, points}
 * @param {number} [raw.gcTopN]
 * @returns {{winnerTeam:?string, gcTeam:?string, mountainTeam:?string, sprintTeam:?string, podium:object}}
 */
export function resolveStageResult(raw = {}) {
  const { finishOrder, mountainPoints, sprintPoints, gcTopN } = raw;
  const gcOrder = finishOrder && finishOrder.length ? gcTeamStanding(finishOrder, gcTopN) : [];
  const mt = mountainPoints && mountainPoints.length ? pointsTotals(mountainPoints) : null;
  const sp = sprintPoints && sprintPoints.length ? pointsTotals(sprintPoints) : null;
  const podium = {
    winnerTeam: teamPodiumFromFinish(finishOrder),
    gcTeam: gcOrder.slice(0, 3).map((r) => r.team),
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

/**
 * Hvilke af de fire spørgsmål er aktive pr. etapetype som standard.
 * En holdtidskørsel (ttt) har fx hverken bedste-hold-, bjerg- eller
 * sprint-spørgsmål; en flad etape har ingen bjergpoint, osv.
 * Ukendt (og enhver ikke-mappet type) → alle fire aktive.
 */
export const QUESTION_DEFAULTS_BY_TYPE = {
  ttt: { winnerTeam: true, gcTeam: false, mountainTeam: false, sprintTeam: false },
  itt: { winnerTeam: true, gcTeam: true, mountainTeam: false, sprintTeam: false },
  flat: { winnerTeam: true, gcTeam: true, mountainTeam: false, sprintTeam: true },
  hilly: { winnerTeam: true, gcTeam: true, mountainTeam: true, sprintTeam: true },
  mountain: { winnerTeam: true, gcTeam: true, mountainTeam: true, sprintTeam: true },
  unknown: { winnerTeam: true, gcTeam: true, mountainTeam: true, sprintTeam: true },
};

/** True hvis x er et objekt med de fire boolean-nøgler (et gyldigt override). */
function isQuestionsObject(x) {
  return (
    x != null &&
    typeof x === 'object' &&
    STAGE_FIELDS.every(({ key }) => typeof x[key] === 'boolean')
  );
}

/**
 * Hvilke spørgsmål er aktive for en given etape:
 * - et eksplicit `stage.questions`-override (med de fire boolean-nøgler) vinder,
 * - ellers type-standarden for `stage.type` (ukendt/umappet → alle fire).
 */
export function activeQuestionsForStage(stage) {
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

/**
 * True hvis tippet ikke indeholder ét eneste udfyldt holdvalg blandt de
 * AKTIVE spørgsmål (inaktive spørgsmål kan aldrig udløse straf).
 */
export function isUntipped(bet, active) {
  if (!bet || typeof bet !== 'object') return true;
  return STAGE_FIELDS.every(
    ({ key }) => (active && !active[key]) || bet[key] == null || bet[key] === '',
  );
}

/**
 * Er etapens hold-tip komplet? Dvs. er ALLE de aktive spørgsmål (jf. etapens
 * type eller et `questions`-override) besvaret? En holdtidskørsel kræver fx kun
 * "etapevinderens hold". Bruges ens på forsiden, etape-listen og etape-kortet,
 * så "mangler tip" altid betyder det samme.
 * @param {object} stage
 * @param {object|null} bet
 * @returns {boolean}
 */
export function stageTipComplete(stage, bet) {
  if (!bet || typeof bet !== 'object') return false;
  const active = activeQuestionsForStage(stage);
  const activeKeys = STAGE_FIELDS.filter(({ key }) => active[key]);
  if (activeKeys.length === 0) return true; // ingen spørgsmål → intet at mangle
  return activeKeys.every(({ key }) => bet[key] != null && bet[key] !== '');
}

/** Podiet (top-3 hold) for et spørgsmål — fra `result.podium`, ellers blot vinderen. */
function podiumFor(res, key) {
  if (res.podium && Array.isArray(res.podium[key])) return res.podium[key];
  return res[key] != null && res[key] !== '' ? [res[key]] : [];
}

/**
 * Point for et etape-tip mod facit, MED podie-point:
 * - Et holdvalg der rammer spørgsmålets podium giver point efter placering:
 *   1.-plads → skala[0], 2.-plads → skala[1], 3.-plads → skala[2].
 * - Et felt uden facit (endnu ikke afgjort / ikke relevant) giver 0, ikke straf.
 * - Et HELT utippet etape giver -untippedPenalty (kun når facit findes).
 *
 * @param {object} bet  spillerens holdvalg
 * @param {object} result  facit inkl. `podium`
 * @param {object} [pointsCfg]  rå point-/podie-config (flettes med standarden)
 * @param {object} [stageOrActive]  etape ELLER aktive-spørgsmål-objekt
 * @returns {{points:number, breakdown:object, untipped:boolean}}
 */
export function scoreStageBet(bet, result, pointsCfg, stageOrActive) {
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
    if (!active[key]) continue; // spørgsmålet stilles ikke → ingen point/straf
    const podium = podiumFor(res, key);
    if (!podium.length) continue; // ikke afgjort → ingen point
    const pick = bet && bet[key];
    if (pick == null || pick === '') { breakdown[key] = 0; continue; }
    const rank = podium.findIndex((t) => t === pick);
    const pts = rank >= 0 ? (P[key][rank] || 0) : 0;
    breakdown[key] = pts;
    total += pts;
  }
  return { points: total, breakdown, untipped: false };
}
