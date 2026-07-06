// ---------------------------------------------------------------------------
// functions/tourSync.js — ren logik for resultat-sync (testbar, ingen IO).
// Oversætter et proxy-payload (/api/stages/{n}) til den opdatering der skrives
// på et stages-dokument: facit (de fire vinderhold), trøje-indehavere, meta,
// og de hold der skal selv-udfyldes i `teams`.
// ---------------------------------------------------------------------------

const { pcsToStageInput, jerseyHolders, stageMetaFromPcs } = require('./pcsMapping');
const { resolveStageResult } = require('./tourScoring');
const { teamsFromRows } = require('./tourTeams');

/**
 * @param {object} payload  proxy /api/stages/{n}
 * @param {number} [gcTopN] top-N til Q2
 * @param {object} [prevPayload] proxy /api/stages/{n-1} — delta-basis for de
 *   KUMULATIVE point-klassementer (2026-stakken mangler per-etape ipe/ime på
 *   nogle etaper). Kun nødvendig når needsPrevForPoints(payload) er true.
 * @returns {{result, jerseys, meta, teams, resultsPresent}}
 */
function buildStageUpdate(payload, gcTopN, prevPayload = null) {
  // letour leverer sprint/bjerg PÅ etapen når ipe/ime findes; ellers regnes
  // delta af de kumulative klassementer (sprintKlass/bjergKlass) mod n-1.
  const input = pcsToStageInput(payload, { gcTopN, prevCumulative: prevPayload });
  const result = resolveStageResult(input);
  const etapeRows = (payload && payload.classifications && payload.classifications.etape
    && payload.classifications.etape.rows) || [];
  return {
    result,
    jerseys: jerseyHolders(payload),
    meta: stageMetaFromPcs(payload),
    teams: teamsFromRows(etapeRows),
    resultsPresent: Boolean(payload && payload.results_present) || etapeRows.length > 0,
    // Point PÅ etapen (delta når letour kun leverer kumulativt) — bruges til
    // etapesidens bjerg-/sprint-resultat, samme lister som Q3/Q4-facit bygger på.
    pointsLists: {
      sprint: input.sprintPoints || [],
      mountain: input.mountainPoints || [],
    },
  };
}

/**
 * Oversæt ét stage-info-payload fra proxyen (/api/stage-info/{n}) til de felter
 * der skrives på et stages-dokument. Ren transform (ingen IO). Skriver KUN de
 * felter der faktisk er til stede, så et merge aldrig nulstiller berigede
 * dokumenter (fx admins `questions`). `awards` lægges i `pointsAwarded` som ren
 * info — admin kan bruge den, men den overskriver intet selv.
 *
 * @param {{stage:number, km?:number|null, type?:string|null, elevation?:number|null, awards?:{sprint?:boolean,mountain?:boolean}}} info
 * @returns {{ update: object, hasElevation: boolean, hasAwards: boolean }}
 */
function stageInfoUpdate(info) {
  const update = {};
  let hasElevation = false;
  let hasAwards = false;
  if (info && info.elevation != null && Number.isFinite(Number(info.elevation))) {
    update.elevation = Number(info.elevation);
    hasElevation = true;
  }
  if (info && info.awards && (typeof info.awards.sprint === 'boolean' || typeof info.awards.mountain === 'boolean')) {
    update.pointsAwarded = {
      sprint: info.awards.sprint === true,
      mountain: info.awards.mountain === true,
    };
    hasAwards = true;
  }
  // Præsentations-felter (profil, stigninger, sprints) — kun når til stede, så et
  // merge aldrig nulstiller berigede dokumenter.
  let hasExtra = false;
  if (info && typeof info.profileImage === 'string' && info.profileImage) {
    update.profileImage = info.profileImage;
    hasExtra = true;
  }
  if (info && Array.isArray(info.climbs) && info.climbs.length) {
    update.climbs = info.climbs;
    hasExtra = true;
  }
  if (info && Array.isArray(info.sprints) && info.sprints.length) {
    update.sprints = info.sprints;
    hasExtra = true;
  }
  return { update, hasElevation, hasAwards, hasExtra };
}

/**
 * Hent per-etape stamdata fra proxyen og skriv elevation + pointsAwarded på de
 * matchende etape-dokumenter. IO injiceres (`db`, `fetchImpl`, `serverTimestamp`)
 * så funktionen er fuldt testbar uden netværk/Firestore.
 *
 * @param {object} opts
 * @param {object} opts.db                Firestore-instans (admin)
 * @param {string} opts.proxyUrl          basis-URL til proxyen
 * @param {number} opts.season            aktiv sæson (doc-id-præfiks)
 * @param {Function} opts.fetchImpl       fetch (mockes i test)
 * @param {Function} [opts.serverTimestamp] FieldValue.serverTimestamp-fabrik
 * @param {boolean} [opts.dryRun]
 * @returns {Promise<{season:number, checked:number, updated:number, dryRun:boolean, stages:Array}>}
 */
async function syncStageInfoCore({ db, proxyUrl, season, fetchImpl, serverTimestamp = () => null, dryRun = false }) {
  const res = await fetchImpl(`${proxyUrl}/api/stage-info`);
  if (!res.ok) throw new Error(`proxy /api/stage-info: HTTP ${res.status}`);
  const data = await res.json();
  const stages = Array.isArray(data && data.stages) ? data.stages : [];

  let checked = 0;
  let updated = 0;
  const preview = [];

  for (const info of stages) {
    const n = Number(info && info.stage);
    if (!Number.isFinite(n)) continue;
    checked++;
    const { update, hasElevation, hasAwards, hasExtra } = stageInfoUpdate(info);
    if (!hasElevation && !hasAwards && !hasExtra) continue;
    preview.push({
      stage: n,
      elevation: hasElevation ? update.elevation : null,
      pointsAwarded: hasAwards ? update.pointsAwarded : null,
      climbs: update.climbs ? update.climbs.length : 0,
      profileImage: update.profileImage ? true : false,
    });
    if (!dryRun) {
      const docId = `${season}-stage-${n}`;
      await db.collection('stages').doc(docId).set(
        { season, number: n, ...update, stageInfoUpdatedAt: serverTimestamp() },
        { merge: true },
      );
    }
    updated++;
  }
  return { season, checked, updated, dryRun, stages: preview };
}

module.exports = { buildStageUpdate, stageInfoUpdate, syncStageInfoCore };
