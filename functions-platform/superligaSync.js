// ---------------------------------------------------------------------------
// functions-platform/superligaSync.js — automatisk resultat-synk for Superligaen.
//
// Henter færdigspillede kampe fra api.superliga.dk (samme officielle API som
// programmet blev seedet fra — rent JSON, ingen signatur) og sætter kampens
// facit (result = 1X2) på det matchende dokument i games/superliga2627/matches.
// At skrive result udløser recomputeGameMatch (afregning + levende Elo).
//
// Matcher API-kampe til vores dokumenter ved at genskabe seed-id'et
// (r{runde}-{slug(hjemme)}-{slug(ude)}) — begge stammer fra SAMME API, så
// holdnavnene er identiske. Kun ændrede facit skrives (idempotent).
// ---------------------------------------------------------------------------

const GAME_ID = 'superliga2627';
const SEASON_ID = 35802; // 3F Superliga 2026/2027 (fra tournament_by_season)
const API_BASE = 'https://api.superliga.dk';
// Offentligt app-token (ligger i superliga.dk's offentlige app — ikke en secret).
const ACCESS_TOKEN = '5b6ab6f5eb84c60031bbbd24';
const APP_NAME = 'dk.releaze.livecenter.spdk';

/** 1X2-udfald af mål (spejler superligaScoring.outcomeFromScore). */
function outcomeFromScore(h, a) {
  if (h == null || a == null) return null;
  const hn = Number(h);
  const an = Number(a);
  if (!Number.isFinite(hn) || !Number.isFinite(an)) return null;
  if (hn > an) return '1';
  if (hn < an) return '2';
  return 'X';
}

/** Dokument-id: r{runde}-{slug(hjemme)}-{slug(ude)} (spejler superligaSeed.matchId). */
function matchDocId(round, home, away) {
  const slug = (s) => String(s ?? '')
    .toLowerCase()
    .replace(/ø/g, 'o').replace(/å/g, 'a').replace(/æ/g, 'ae')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
  return `r${round}-${slug(home)}-${slug(away)}`;
}

/** URL til færdigspillede kampe i en sæson. */
function resultsUrl(seasonId) {
  return `${API_BASE}/events-v2?appName=${APP_NAME}&access_token=${ACCESS_TOKEN}`
    + `&env=production&locale=da&seasonId=${seasonId}&status=finished`;
}

/**
 * Kernen (uden Cloud Functions-wrapper — kan unit-testes med injiceret fetch/db).
 * @param {object} db
 * @param {object} FieldValue
 * @param {{fetchFn?:Function, gameId?:string, seasonId?:number}} [opts]
 * @returns {Promise<{checked:number, updated:number}>}
 */
async function syncResultsCore(db, FieldValue, opts = {}) {
  const gameId = opts.gameId || GAME_ID;
  const seasonId = opts.seasonId || SEASON_ID;
  const fetchFn = opts.fetchFn || fetch;

  const res = await fetchFn(resultsUrl(seasonId));
  if (!res.ok) throw new Error(`superliga API HTTP ${res.status}`);
  const data = await res.json();
  const events = (data.events || []).filter((e) => e.statusType === 'finished'
    && e.score && Number.isFinite(e.score.home) && Number.isFinite(e.score.away));

  // Nuværende kamp-dokumenter (så vi kun skriver ændrede facit).
  const matchesCol = db.collection('games').doc(gameId).collection('matches');
  const snap = await matchesCol.get();
  const current = new Map();
  snap.docs.forEach((d) => current.set(d.id, d.data()));

  const batch = db.batch();
  let updated = 0;
  for (const e of events) {
    const id = matchDocId(e.round, e.homeName, e.awayName);
    const cur = current.get(id);
    if (!cur) continue; // ukendt kamp (bør ikke ske — samme kilde)
    const result = outcomeFromScore(e.score.home, e.score.away);
    if (!result || cur.result === result) continue; // uændret
    batch.set(matchesCol.doc(id), {
      result,
      homeGoals: e.score.home,
      awayGoals: e.score.away,
      status: 'finished',
      resultSyncedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    updated += 1;
  }
  if (updated) await batch.commit();
  return { checked: events.length, updated };
}

module.exports = {
  GAME_ID, SEASON_ID, outcomeFromScore, matchDocId, resultsUrl, syncResultsCore,
};
