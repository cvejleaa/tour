// ---------------------------------------------------------------------------
// stageTimes.js — officielle starttider fra letour racecenter.
//
// racecenter.letour.fr/api/stage-{år} leverer alle 21 etaper med den OFFICIELLE
// tidsplan (startTime/endTime/dato/tidszone). Letour justerer tiderne løbende
// (fx etape 10: 13:25 → 13:15), så de seedede tider kan blive forældede — og
// kickoff styrer tip-låsen, så en for sen tid lader spillere tippe efter start.
//
// syncStageTimesCore sammenligner racecenterets tider med etape-dokumenterne og
// retter date/startTime/kickoff hvor de afviger. Afgjorte etaper røres ikke.
// Ren og testbar: fetch/db/klokke injiceres. Samme endpoint-familie (og UA/
// cache-rationale) som liveTicker/liveMap.
// ---------------------------------------------------------------------------

'use strict';

const RACECENTER = 'https://racecenter.letour.fr/api';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  Accept: 'application/json',
};

// Samme offset som frontendens kickoffFromStartTime (Tour-tid, CEST).
const TOUR_TZ_OFFSET = '+02:00';

/** '13:25:00' | '13:25' → 'HH:MM' (null ved ugyldigt input). */
function normTime(s) {
  const m = /^\s*(\d{1,2}):(\d{2})/.exec(String(s || ''));
  if (!m) return null;
  const hh = String(Math.max(0, Math.min(23, Number(m[1])))).padStart(2, '0');
  const mm = String(Math.max(0, Math.min(59, Number(m[2])))).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** '2026-07-14T00:00:00+02:00' → '2026-07-14' (null ved ugyldigt input). */
function normDate(s) {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(s || ''));
  return m ? m[1] : null;
}

/** Kickoff-ISO i Tour-tid — SPEJL af src/lib/tourStages.kickoffFromStartTime. */
function kickoffIso(date, startTime) {
  if (!date || !startTime) return null;
  return `${date}T${startTime}:00${TOUR_TZ_OFFSET}`;
}

/**
 * Normalisér racecenterets stage-payload til det vi sammenligner på.
 * @param {Array} json  rå api/stage-{år}-payload
 * @returns {Array<{stage:number, date:?string, startTime:?string, endTime:?string, cancelled:boolean}>}
 */
function mapOfficialStages(json) {
  const arr = Array.isArray(json) ? json : [];
  return arr
    .map((s) => ({
      stage: Number(s && s.stage),
      date: normDate(s && s.date),
      startTime: normTime(s && s.startTime),
      endTime: normTime(s && s.endTime),
      cancelled: !!(s && s.isCancelled),
    }))
    .filter((s) => Number.isInteger(s.stage) && s.stage >= 1)
    .sort((a, b) => a.stage - b.stage);
}

/**
 * Find de etaper hvor den officielle tid/dato afviger fra dokumentet.
 * Afgjorte etaper (status 'done') og aflyste/ufuldstændige officielle poster
 * springes over.
 * @param {Array<{id:string, data:object}>} stageDocs
 * @param {Array} official  fra mapOfficialStages
 * @returns {Array<{id, number, from:{date,startTime,kickoff}, to:{date,startTime,kickoff}}>}
 */
function diffStageTimes(stageDocs, official) {
  const byNumber = new Map(official.map((o) => [o.stage, o]));
  const changes = [];
  for (const { id, data } of stageDocs || []) {
    const n = Number(data && data.number);
    const o = byNumber.get(n);
    if (!o || o.cancelled || !o.date || !o.startTime) continue;
    if (data.status === 'done') continue; // afgjort — låsen er ligegyldig nu
    const curDate = data.date || null;
    const curStart = normTime(data.startTime);
    const newKickoff = kickoffIso(o.date, o.startTime);
    if (curDate === o.date && curStart === o.startTime) continue;
    changes.push({
      id,
      number: n,
      from: { date: curDate, startTime: curStart, kickoff: data.kickoff || null },
      to: { date: o.date, startTime: o.startTime, kickoff: newKickoff },
    });
  }
  return changes;
}

/**
 * Hent officielle tider og ret etape-dokumenterne. dryRun viser kun diffen.
 * @param {object} db  Firestore (admin SDK)
 * @param {object} opts
 * @param {number} opts.season
 * @param {Function} opts.fetchImpl
 * @param {Function} opts.toTimestamp  ISO-streng → Firestore Timestamp
 * @param {*} [opts.serverTimestamp]
 * @param {boolean} [opts.dryRun]
 * @returns {Promise<{ok:boolean, checked:number, changes:Array, applied:number, reason?:string}>}
 */
async function syncStageTimesCore(db, {
  season, fetchImpl, toTimestamp, serverTimestamp, dryRun = false,
} = {}) {
  let json;
  try {
    const res = await fetchImpl(`${RACECENTER}/stage-${season}`, { headers: HEADERS });
    if (!res.ok) return { ok: false, checked: 0, changes: [], applied: 0, reason: `http-${res.status}` };
    json = await res.json();
  } catch (e) {
    return { ok: false, checked: 0, changes: [], applied: 0, reason: String((e && e.message) || e) };
  }

  const official = mapOfficialStages(json);
  if (!official.length) return { ok: false, checked: 0, changes: [], applied: 0, reason: 'empty-payload' };

  const snap = await db.collection('stages').where('season', '==', Number(season)).get();
  const stageDocs = snap.docs.map((d) => ({ id: d.id, data: d.data(), ref: d.ref }));
  const changes = diffStageTimes(stageDocs, official);

  let applied = 0;
  if (!dryRun) {
    for (const c of changes) {
      const doc = stageDocs.find((d) => d.id === c.id);
      if (!doc) continue;
      await doc.ref.set({
        date: c.to.date,
        startTime: c.to.startTime,
        kickoff: toTimestamp(c.to.kickoff),
        startTimeUpdatedAt: serverTimestamp,
      }, { merge: true });
      applied += 1;
    }
  }
  return { ok: true, checked: stageDocs.length, changes, applied };
}

module.exports = {
  RACECENTER,
  TOUR_TZ_OFFSET,
  normTime,
  normDate,
  kickoffIso,
  mapOfficialStages,
  diffStageTimes,
  syncStageTimesCore,
};
