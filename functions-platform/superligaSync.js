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
const TOURNAMENT_ID = 46; // 3F Superliga (template)
const STAGE_ID = 935487; // grundspillet 2026/27 (fra tournament_by_season.stages)
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

/** URL til den OFFICIELLE stilling (grundspil-stage), med form (last5). */
function standingsUrl(seasonId = SEASON_ID, stageId = STAGE_ID) {
  return `${API_BASE}/tournaments/${TOURNAMENT_ID}/standings?appName=superligadk&access_token=${ACCESS_TOKEN}`
    + `&env=production&locale=da&addResults=true&resultsLimit=6&form=last5&seasonId=${seasonId}&stageId=${stageId}`;
}

/**
 * Synk den OFFICIELLE stilling fra api.superliga.dk til spil-dokumentet
 * (games/{gameId}.standings). Vi BEREGNER ikke selv tabellen — den hentes som
 * autoritativ kilde (samme princip som resultaterne).
 * @returns {Promise<{rows:number}>}
 */
async function syncStandingsCore(db, FieldValue, opts = {}) {
  const gameId = opts.gameId || GAME_ID;
  const seasonId = opts.seasonId || SEASON_ID;
  const stageId = opts.stageId || STAGE_ID;
  const fetchFn = opts.fetchFn || fetch;

  const res = await fetchFn(standingsUrl(seasonId, stageId));
  if (!res.ok) throw new Error(`superliga standings HTTP ${res.status}`);
  const data = await res.json();
  const rows = (Array.isArray(data) ? data : [])
    .map((r) => ({
      rank: Number(r.rank) || 0,
      teamName: r.teamName,
      teamShortName: r.teamShortName || null,
      points: Number(r.points) || 0,
      played: Number(r.matchesPlayed) || 0,
      won: Number(r.matchesWon) || 0,
      draw: Number(r.matchesDraw) || 0,
      lost: Number(r.matchesLost) || 0,
      gf: Number(r.goalsScored) || 0,
      ga: Number(r.goalsConceded) || 0,
      rankType: r.rankType || null,
    }))
    .filter((r) => r.teamName)
    .sort((a, b) => a.rank - b.rank);
  if (rows.length === 0) return { rows: 0 };

  await db.collection('games').doc(gameId).set({
    standings: rows,
    standingsSyncedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { rows: rows.length };
}

module.exports = {
  GAME_ID, SEASON_ID, TOURNAMENT_ID, STAGE_ID,
  outcomeFromScore, matchDocId, resultsUrl, syncResultsCore,
  standingsUrl, syncStandingsCore,
};
