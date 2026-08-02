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

// Hvor længe efter kickoff vi holder øje med en kamp. En kamp varer ~2 timer;
// den sidste halve time er luft til forlænget spilletid, afbrydelser og API'ets
// egen forsinkelse. Vinduet er et LOFT, ikke en fast pris: så snart kampen har
// facit, holder vi op med at spørge.
const WINDOW_MS = 2.5 * 60 * 60 * 1000;

// Et hængende kald holder funktionen kørende, til dens egen timeout løber ud —
// og vi ringer nu 15 gange så ofte.
//
// Funktion og ikke en konstant: AbortSignal.timeout() starter uret med det
// samme, så et delt signal ville udløbe 10 sekunder efter modulet blev
// indlæst og derefter afbryde hvert eneste kald.
const hentOpt = () => ({ signal: AbortSignal.timeout(10000) });

/**
 * Kampe, der er sat i gang inden for vinduet og STADIG mangler facit.
 *
 * Det er dette opslag, der gør ét kald i minuttet billigere end det gamle
 * kvarters-raster: en tom range-forespørgsel koster én enkelt læsning, mod de
 * 132 dokumenter syncResultsCore ellers henter hver gang. Uden for kampvinduet
 * er svaret tomt, og så røres hverken API eller resten af databasen.
 *
 * @returns {Promise<Array<{id:string, data:object}>>}
 */
async function pendingMatches(db, nowMs, opts = {}) {
  const gameId = opts.gameId || GAME_ID;
  const snap = await db.collection('games').doc(gameId).collection('matches')
    .where('kickoff', '>=', new Date(nowMs - WINDOW_MS))
    .where('kickoff', '<=', new Date(nowMs))
    .get();
  return snap.docs
    .map((d) => ({ id: d.id, data: d.data() }))
    .filter((m) => m.data.result == null || m.data.result === '');
}

/**
 * Kampe, der for længst er begyndt og STADIG mangler facit — dem vinduet har
 * sluppet. En kamp uden kickoff-felt tælles med: den kan aldrig komme i noget
 * vindue overhovedet.
 *
 * Findes der nogen af dem, er point ikke afregnet, og ingen ville opdage det:
 * puljebonussen kræver, at ALLE kampe har mål, så én strandet kamp blokerer
 * hele sæsonafregningen.
 */
async function strandedMatches(db, nowMs, opts = {}) {
  const gameId = opts.gameId || GAME_ID;
  const snap = await db.collection('games').doc(gameId).collection('matches').get();
  const graense = nowMs - WINDOW_MS;
  return snap.docs
    .map((d) => ({ id: d.id, data: d.data() }))
    .filter((m) => m.data.result == null || m.data.result === '')
    .filter((m) => {
      const k = m.data.kickoff;
      if (k == null) return true; // uden kickoff rammer den aldrig et vindue
      const ms = typeof k.toMillis === 'function' ? k.toMillis() : new Date(k).getTime();
      return Number.isFinite(ms) && ms < graense;
    });
}

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
 * @param {{fetchFn?:Function, gameId?:string, seasonId?:number,
 *          only?:Array<{id:string,data:object}>}} [opts]
 * @returns {Promise<{checked:number, updated:number}>}
 */
async function syncResultsCore(db, FieldValue, opts = {}) {
  const gameId = opts.gameId || GAME_ID;
  const seasonId = opts.seasonId || SEASON_ID;
  const fetchFn = opts.fetchFn || fetch;

  const res = await fetchFn(resultsUrl(seasonId), hentOpt());
  if (!res.ok) throw new Error(`superliga API HTTP ${res.status}`);
  const data = await res.json();
  const events = (data.events || []).filter((e) => e.statusType === 'finished'
    && e.score && Number.isFinite(e.score.home) && Number.isFinite(e.score.away));

  // Nuværende kamp-dokumenter (så vi kun skriver ændrede facit).
  //
  // opts.only er kampene fra pendingMatches — dem der er i gang lige nu. Uden
  // den henter vi alle 132, og ved ét kald i minuttet ville det alene løbe op
  // i ~40.000 læsninger på en kampdag. Den manuelle synk sender ingen `only`
  // og gennemgår derfor stadig hele sæsonen.
  const matchesCol = db.collection('games').doc(gameId).collection('matches');
  const current = new Map();
  if (opts.only) {
    opts.only.forEach((m) => current.set(m.id, m.data));
  } else {
    const snap = await matchesCol.get();
    snap.docs.forEach((d) => current.set(d.id, d.data()));
  }

  const batch = db.batch();
  let updated = 0;
  for (const e of events) {
    const id = matchDocId(e.round, e.homeName, e.awayName);
    const cur = current.get(id);
    if (!cur) continue; // ukendt kamp (bør ikke ske — samme kilde)
    const result = outcomeFromScore(e.score.home, e.score.away);
    if (!result) continue;
    // Sammenlign på BÅDE facit og mål. Så længe kun facit talte, kunne en
    // rettet score aldrig komme ind: 2-1 → 3-1 er samme 1X2, så dokumentet
    // blev sprunget over for altid — også ved manuel synk. Usynligt dengang
    // målene ikke blev vist; synligt nu, hvor de står på kampkortet.
    if (cur.result === result
        && cur.homeGoals === e.score.home
        && cur.awayGoals === e.score.away) continue;
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

  const res = await fetchFn(standingsUrl(seasonId, stageId), hentOpt());
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
  if (rows.length === 0) return { rows: 0, changed: false };

  // Skriv KUN når tabellen faktisk har flyttet sig. Spil-dokumentet lyttes på
  // af hver eneste åbne browser (useGame), så en skrivning uden ændring koster
  // én læsning pr. tilsluttet klient — og fik dem alle til at gentegne. Før
  // skrev vi ved hver kørsel, også midt om eftermiddagen uden en kamp i gang.
  const gameRef = db.collection('games').doc(gameId);
  const cur = await gameRef.get();
  if (JSON.stringify(cur.data()?.standings || null) === JSON.stringify(rows)) {
    return { rows: rows.length, changed: false };
  }

  await gameRef.set({
    standings: rows,
    standingsSyncedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { rows: rows.length, changed: true };
}

/**
 * ÉN skemalagt kørsel. Bor her og ikke i index.js, fordi index.js ikke kan
 * importeres uden firebase-functions — og så ville det tidlige exit, som er
 * hele pointen med at køre hvert minut, være udækket af tests.
 *
 * Rækkefølgen er selve besparelsen:
 *   1. Er en kamp overhovedet i gang uden facit? (ét opslag, ofte tomt)
 *   2. Kun i så fald: spørg API'et om resultater.
 *   3. Kun hvis et facit rent faktisk landede: hent den officielle stilling.
 *
 * Fejler tavst i hvert led, som Tour-synken: en nedbrudt kilde må hverken
 * vælte funktionen eller forhindre næste led i at prøve.
 *
 * @param {number} nowMs
 * @returns {Promise<{pending:number, updated:number, standings:object|null, fejl:string|null}>}
 */
async function runScheduledSync(db, FieldValue, nowMs, opts = {}) {
  let venter;
  try {
    venter = await pendingMatches(db, nowMs, opts);
  } catch (err) {
    return { pending: 0, updated: 0, standings: null, fejl: `opslag: ${err?.message || err}` };
  }
  if (venter.length === 0) return { pending: 0, updated: 0, standings: null, fejl: null };

  let updated = 0;
  let fejl = null;
  try {
    ({ updated } = await syncResultsCore(db, FieldValue, { ...opts, only: venter }));
  } catch (err) {
    fejl = `resultater: ${err?.message || err}`;
  }
  if (updated === 0) return { pending: venter.length, updated, standings: null, fejl };

  let standings = null;
  try {
    standings = await syncStandingsCore(db, FieldValue, opts);
  } catch (err) {
    fejl = `${fejl ? `${fejl}; ` : ''}stilling: ${err?.message || err}`;
  }
  return { pending: venter.length, updated, standings, fejl };
}

module.exports = {
  GAME_ID, SEASON_ID, TOURNAMENT_ID, STAGE_ID,
  outcomeFromScore, matchDocId, resultsUrl, syncResultsCore, pendingMatches, WINDOW_MS,
  standingsUrl, syncStandingsCore, runScheduledSync, strandedMatches,
};
