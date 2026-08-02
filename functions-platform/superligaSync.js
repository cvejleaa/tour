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

// Hvor længe der MINDST skal være gået siden kickoff, før vi tør kalde en kamp
// slut: 2×45 minutter plus pausen plus lidt tillægstid.
//
// Vagten findes for HALVLEGSPAUSEN. Melder kilden en kamp ud af sin
// inprogress-liste i de 15 minutter, ville fraværet blive læst som slutfløjt,
// og så sagde hver eneste kamp "Slut · afventer facit" midt i kampen — en løgn
// to gange pr. kamp, hver kamp. Vi ved ikke, om kilden gør det; vagten koster
// os ingenting, hvis den ikke gør, for en kamp der FAKTISK er slut, er altid
// mere end 95 minutter gammel.
const MIN_SPILLETID_MS = 95 * 60 * 1000;

/** Millisekunder ud af et kickoff-felt (Firestore-Timestamp, Date eller streng). */
function kickoffMs(k) {
  if (k == null) return NaN;
  const ms = typeof k.toMillis === 'function' ? k.toMillis() : new Date(k).getTime();
  return Number.isFinite(ms) ? ms : NaN;
}

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

/** Alle kampe i spillet, som {id, data} — ét opslag, der kan deles. */
async function allMatches(db, opts = {}) {
  const gameId = opts.gameId || GAME_ID;
  const snap = await db.collection('games').doc(gameId).collection('matches').get();
  return snap.docs.map((d) => ({ id: d.id, data: d.data() }));
}

/**
 * Kampe, der for længst er begyndt og STADIG mangler facit — dem vinduet har
 * sluppet. Ren funktion over en liste, så sweep'et kan nøjes med ÉT opslag
 * frem for at skanne de 132 kampe to gange.
 *
 * Findes der nogen af dem, er point ikke afregnet, og ingen ville opdage det:
 * puljebonussen kræver, at ALLE kampe har mål, så én strandet kamp blokerer
 * hele sæsonafregningen.
 *
 * Alt, vi ikke kan læse et tidspunkt ud af, rapporteres. Det er den sikre
 * retning: en kamp med et ubrugeligt kickoff kan aldrig komme i et vindue, så
 * tav alarmen om den, ville den stå uafregnet for evigt — og netop de
 * dokumenter, hvor data ser mærkelige ud, er dem man helst vil høre om.
 */
function strandedMatches(matches, nowMs) {
  const graense = nowMs - WINDOW_MS;
  return matches
    .filter((m) => m.data.result == null || m.data.result === '')
    .filter((m) => {
      const k = m.data.kickoff;
      if (k == null) return true;
      const ms = typeof k.toMillis === 'function' ? k.toMillis() : new Date(k).getTime();
      if (!Number.isFinite(ms)) return true; // tom streng, skrald, råt objekt
      return ms < graense;
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

// API'ets statusFull er engelsk fritekst. Oversæt til et LUKKET sæt server-side,
// så der aldrig kan slippe engelsk ud på skærmen — og så en værdi, vi ikke har
// set før, ikke vælter noget.
//
// 'afbrudt' er den vigtige: en afbrudt kamp har stadig statusType 'inprogress',
// og at kalde den "DIREKTE" ville være en løgn.
const LIVE_STATUS = {
  '1st half': 'foerste',
  'halftime': 'pause',
  'half time': 'pause',
  'ht': 'pause',
  '2nd half': 'anden',
  'extra time': 'forlaenget',
  '1st extra': 'forlaenget',
  '2nd extra': 'forlaenget',
  'awaiting extra time': 'forlaenget',
  'penalties': 'straffe',
  'penalty shootout': 'straffe',
  'interrupted': 'afbrudt',
  'abandoned': 'afbrudt',
  'postponed': 'afbrudt',
};

/** statusFull → vores lukkede sæt. Ukendt bliver 'ukendt' og logges. */
function liveStatus(raw) {
  const n = String(raw ?? '').trim().toLowerCase();
  // hasOwnProperty og ikke et almindeligt opslag: `LIVE_STATUS['constructor']`
  // rammer Object.prototype og giver en FUNKTION tilbage. Den kan Admin SDK
  // ikke serialisere, så hele synken ville kaste hvert minut — tavst, fordi
  // runScheduledSync fanger fejlen — og hverken live eller slut blev skrevet
  // for nogen kamp. '__proto__' giver tilsvarende et objekt, som skrive-vagten
  // aldrig kan sammenligne sig ud af, så hver kørsel ville skrive igen.
  const kendt = Object.prototype.hasOwnProperty.call(LIVE_STATUS, n) ? LIVE_STATUS[n] : null;
  if (!kendt && n) console.warn(`superliga: ukendt live-status "${raw}" — vises som blot "direkte".`);
  return kendt || 'ukendt';
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

/** URL til kampe, der er I GANG lige nu. */
function liveUrl(seasonId) {
  return `${API_BASE}/events-v2?appName=${APP_NAME}&access_token=${ACCESS_TOKEN}`
    + `&env=production&locale=da&seasonId=${seasonId}&status=inprogress`;
}

/**
 * Kernen (uden Cloud Functions-wrapper — kan unit-testes med injiceret fetch/db).
 * @param {object} db
 * @param {object} FieldValue
 * @param {{fetchFn?:Function, gameId?:string, seasonId?:number,
 *          only?:Array<{id:string,data:object}>}} [opts]
 * @returns {Promise<{checked:number, updated:number, rettede:string[]}>}
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
  const rettede = [];
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
    // ...og på om der stadig ligger en live-stilling, der skal ryddes. Uden
    // det sidste led kunne en kamp, hvor facit og den sidste live-skrivning
    // landede i samme kørsel, stå med BÅDE slutresultat og "DIREKTE" for evigt.
    if (cur.result === result
        && cur.homeGoals === e.score.home
        && cur.awayGoals === e.score.away
        && cur.live == null) continue;
    batch.set(matchesCol.doc(id), {
      result,
      homeGoals: e.score.home,
      awayGoals: e.score.away,
      status: 'finished',
      resultSyncedAt: FieldValue.serverTimestamp(),
      // Facit slår live. Rydningen ligger HER og ikke i live-stien, fordi
      // sweep'et også sætter facit — og så er det den eneste kørsel, der kan
      // rydde op efter en kamp, minut-synken ikke nåede.
      live: FieldValue.delete(),
    }, { merge: true });
    rettede.push(id);
  }
  if (rettede.length) await batch.commit();
  // rettede: hvilke kampe der netop fik facit. Sweep'et bruger listen til at
  // lade være med at melde dem strandet i samme åndedrag — så slipper det for
  // at skanne alle 132 kampe en ekstra gang bare for at få et friskt billede.
  return { checked: events.length, updated: rettede.length, rettede };
}

/**
 * Levende stilling på kampe, der er i gang lige nu.
 *
 * Skriver KUN til feltet `live` — aldrig result, homeGoals, awayGoals eller
 * status. Det er ikke en høflighed: matchOutcome() i gameScoring udleder facit
 * FRA MÅLENE, når result mangler, så en levende 1-0 i homeGoals ville flytte
 * Elo på en halvlegsstilling, standse friske odds og få runden til at se
 * afgjort ud — hvorefter snapshotRoundRanks og Runde-Botten fyrer idempotent,
 * så det RIGTIGE snapshot aldrig blev taget. Og settlePuljeBets ville regne
 * kampen for spillet.
 *
 * Ét map-felt og ikke fire løse: så er rydningen én delete og kan ikke gøres
 * halvt.
 *
 * @param {{fetchFn?:Function, gameId?:string, seasonId?:number, nowMs?:number,
 *          only?:Array<{id:string,data:object}>}} [opts]
 * @returns {Promise<{live:number, skrevet:number, sluttet:number, sluttede:string[]}>}
 */
async function syncLiveCore(db, FieldValue, opts = {}) {
  const gameId = opts.gameId || GAME_ID;
  const seasonId = opts.seasonId || SEASON_ID;
  const fetchFn = opts.fetchFn || fetch;
  const nowMs = opts.nowMs ?? Date.now();

  const res = await fetchFn(liveUrl(seasonId), hentOpt());
  if (!res.ok) throw new Error(`superliga live HTTP ${res.status}`);
  const data = await res.json();
  // Fravær af data er nu et SKRIVE-signal (det rydder live), og derfor skal en
  // tom liste kunne skelnes fra et svar, vi ikke forstod. Uden dette led ville
  // et HTTP 200 med `{}` — afkortet krop, ændret format, fejl pakket som
  // succes — betyde "ingen kampe i gang" og rydde stillingen på hver eneste
  // kamp, der spillede. Ved at kaste følger vi samme fail-silent-vej som en
  // HTTP-fejl: intet skrives, og næste minut prøver igen.
  //
  // Bemærk, at syncResultsCore med vilje beholder sin `|| []`: dér betyder et
  // manglende felt bare "intet facit fundet", og det er harmløst.
  if (!data || !Array.isArray(data.events)) throw new Error('superliga live: svar uden events-liste');
  const iGang = data.events.filter((e) => e.statusType === 'inprogress');
  const events = iGang.filter((e) => e.score
    && Number.isFinite(e.score.home) && Number.isFinite(e.score.away));

  // Hvilke kampe kilden STADIG kalder i gang. Bygget på den UFILTREREDE liste:
  // bruger vi `events`, ville vores eget score-filter blive brugt som bevis på,
  // at kampen er slut, og en kamp i gang med en ubrugelig score ville få ryddet
  // sin live-stilling midt i det hele.
  const stadigIGang = new Set(iGang.map((e) => matchDocId(e.round, e.homeName, e.awayName)));

  const current = new Map((opts.only || []).map((m) => [m.id, m.data]));
  const matchesCol = db.collection('games').doc(gameId).collection('matches');
  const batch = db.batch();
  let skrevet = 0;
  for (const e of events) {
    const cur = current.get(matchDocId(e.round, e.homeName, e.awayName));
    if (!cur) continue;
    if (cur.result != null && cur.result !== '') continue; // facit slår live
    const status = liveStatus(e.statusFull);
    const f = cur.live;
    // Skriv KUN når stillingen eller halvlegen faktisk har flyttet sig. Hvert
    // kampdokument lyttes på af hver åben browser, så en skrivning uden
    // ændring koster én læsning pr. klient — og under en kamp sidder folk der.
    if (f && f.home === e.score.home && f.away === e.score.away && f.status === status) continue;
    batch.set(matchesCol.doc(matchDocId(e.round, e.homeName, e.awayName)), {
      live: {
        home: e.score.home,
        away: e.score.away,
        status,
        // Kun til fejlsøgning i loggen — må ALDRIG renderes.
        // Klippet: feltet kommer fra en fremmed kilde og udleveres til alle
        // klienter. Det renderes ikke i dag — og skal ikke kunne blive en
        // fælde for den, der en dag beslutter at vise det.
        statusRaw: String(e.statusFull ?? '').slice(0, 40),
        at: nowMs,
      },
    }, { merge: true });
    skrevet += 1;
  }

  // Er kampen forsvundet fra kildens liste, er den ikke i gang længere — og så
  // skal "DIREKTE" væk med det samme.
  //
  // Uden dette led kunne live KUN ryddes af facit. Kilden flytter ikke en kamp
  // fra 'inprogress' til 'finished' i samme øjeblik, så i hullet imellem stod
  // kortet med en rød, levende stilling på en kamp, der var fløjtet af. Værre:
  // pendingMatches slipper kampen 2,5 time efter kickoff, så landede facit
  // ikke inden da, rørte minut-synken den aldrig igen, og stillingen blev
  // stående til nattens sweep.
  //
  // Vi MARKERER, vi sletter ikke. Første udgave slettede feltet, og det kostede
  // en ægte fejl: en kamp, der stadig blev spillet, fik tallet visket ud, fordi
  // ét enkelt fravær fra kildens liste blev taget som bevis for slutfløjt. Et
  // fravær er et svagt signal — kilden kan flakke, og den melder fra, før den
  // melder facit. At slette på det signal modsiger klientens eget princip i
  // footballRounds.js: "Forældet, ikke forsvundet ... vi sletter aldrig
  // stillingen, vi dæmper den."
  //
  // Med 'slut' bliver tallet stående, kortet siger "Slut · afventer facit", og
  // et flakkende minut koster et forkert "Slut" i 60 sekunder i stedet for et
  // slettet resultat. Kommer kampen igen i kildens liste, skriver løkken
  // ovenfor den levende status tilbage — status er forskellig, så skrive-
  // vagten slipper den igennem. Selvhelbredende.
  //
  // Feltet ryddes stadig — men af facit (syncResultsCore), som er det stærke
  // signal. Indtil da er "Slut · afventer facit" sandt.
  //
  // Kun kampe, vi har spurgt om (opts.only), kun dem der faktisk HAR en
  // live-stilling, og kun dem der ikke allerede er markeret: ellers ville hvert
  // minut uden kampe koste en tom skrivning pr. kamp i vinduet.
  let sluttet = 0;
  const sluttede = [];
  for (const m of (opts.only || [])) {
    const f = m.data.live;
    if (f == null) continue;
    // Facit slår live — samme vagt som skriveløkken har. Lander resultatet i
    // vinduet mellem pendingMatches og denne løkke, ville vi ellers hæfte en
    // live-stilling tilbage på en kamp, der lige er afgjort.
    if (m.data.result != null && m.data.result !== '') continue;
    if (stadigIGang.has(m.id)) continue;
    if (f.status === 'slut') continue;
    // En afbrudt kamp er ikke slut, den er afbrudt. Overskrev vi statussen her,
    // ville kortet holde op med at sige "Afbrudt" og begynde at sige "Slut",
    // og det er en anden — og forkert — påstand.
    if (f.status === 'afbrudt') continue;
    // Kan kampen overhovedet være slut endnu? Se MIN_SPILLETID_MS. Uden
    // kickoff kan vi ikke afgøre det; så markerer vi, for markeringen er
    // ikke-destruktiv, og alternativet var at lade kortet sige DIREKTE.
    const ko = kickoffMs(m.data.kickoff);
    if (Number.isFinite(ko) && nowMs - ko < MIN_SPILLETID_MS) continue;
    // `at` beholdes med vilje: det fortæller, hvornår stillingen sidst flyttede
    // sig, og det bliver ikke sandere af, at kampen er fløjtet af.
    batch.set(matchesCol.doc(m.id), { live: { ...f, status: 'slut' } }, { merge: true });
    sluttet += 1;
    sluttede.push(m.id);
  }

  if (skrevet || sluttet) await batch.commit();

  // Pulsen. Uden den ville et 0-0, der står stille i 40 minutter, give et
  // live.at fra kampens start — og kortet ville se dødt ud, selv om synken
  // kørte fint. Ét felt på SPIL-dokumentet i stedet for på hver kamp: det
  // koster én læsning pr. klient i minuttet frem for én pr. kamp, og useGame
  // lytter på dokumentet i forvejen. Ingen trigger hænger på games/{id}.
  if (events.length > 0) {
    await db.collection('games').doc(gameId).set({ liveHeartbeatAt: nowMs }, { merge: true });
  }
  return { live: events.length, skrevet, sluttet, sluttede };
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
 * @returns {Promise<{pending:number, updated:number, live:object|null,
 *          standings:object|null, fejl:string|null}>}
 */
async function runScheduledSync(db, FieldValue, nowMs, opts = {}) {
  let venter;
  try {
    venter = await pendingMatches(db, nowMs, opts);
  } catch (err) {
    return { pending: 0, updated: 0, live: null, standings: null, fejl: `opslag: ${err?.message || err}` };
  }
  if (venter.length === 0) return { pending: 0, updated: 0, live: null, standings: null, fejl: null };

  let updated = 0;
  let rettede = [];
  let fejl = null;
  try {
    ({ updated, rettede } = await syncResultsCore(db, FieldValue, { ...opts, only: venter }));
  } catch (err) {
    fejl = `resultater: ${err?.message || err}`;
  }

  // Levende stilling på dem, der STADIG spiller. Kampe, der lige fik facit,
  // holdes udenfor: listen `venter` er hentet FØR gen-synken, så uden det
  // ville vi skrive en live-stilling oven på en kamp, der lige er afgjort.
  //
  // Ligger efter resultaterne, men FØR det tidlige exit nedenfor — ellers
  // ville en kamp uden nyt facit (altså en kamp midt i spillet) aldrig få sin
  // live-stilling opdateret, hvilket er præcis det tilfælde, feltet findes for.
  const nyFacit = new Set(rettede);
  let live = null;
  try {
    live = await syncLiveCore(db, FieldValue, {
      ...opts,
      nowMs,
      only: venter.filter((m) => !nyFacit.has(m.id)),
    });
  } catch (err) {
    fejl = `${fejl ? `${fejl}; ` : ''}live: ${err?.message || err}`;
  }

  if (updated === 0) return { pending: venter.length, updated, live, standings: null, fejl };

  let standings = null;
  try {
    standings = await syncStandingsCore(db, FieldValue, opts);
  } catch (err) {
    fejl = `${fejl ? `${fejl}; ` : ''}stilling: ${err?.message || err}`;
  }
  return { pending: venter.length, updated, live, standings, fejl };
}

module.exports = {
  GAME_ID, SEASON_ID, TOURNAMENT_ID, STAGE_ID,
  outcomeFromScore, matchDocId, resultsUrl, syncResultsCore, pendingMatches, WINDOW_MS,
  liveUrl, liveStatus, syncLiveCore,
  standingsUrl, syncStandingsCore, runScheduledSync, strandedMatches, allMatches,
};
