// ---------------------------------------------------------------------------
// functions-platform/superligaSync.js — resultat-synkens KERNER.
//
// Henter færdigspillede kampe fra spillets kilde (via provideren i
// syncProviders.js) og sætter kampens facit (result = 1X2) på det matchende
// dokument i games/{gameId}/matches. At skrive result udløser
// recomputeGameMatch (afregning + levende Elo).
//
// Alt kilde-specifikt — URL'er, parsing, status-oversættelse og hvordan en
// API-kamp genfinder sit dokument — bor i syncProviders.js. Herinde bor det,
// der er ens for alle ligaer: vagterne, batchingen, rækkefølgen og de tidlige
// exits. Kun ændrede facit skrives (idempotent).
// ---------------------------------------------------------------------------

const {
  PROVIDERS, SYNCED_GAMES, SEASON_ID, TOURNAMENT_ID, STAGE_ID,
  matchDocId, liveStatus, resultsUrl, liveUrl, standingsUrl,
} = require('./syncProviders');

const GAME_ID = 'superliga2627';

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

/**
 * Spillets provider + synk-konfiguration ud af opts — med Superligaen som
 * default, så alle eksisterende kaldeveje (og den manuelle synk uden
 * argumenter) opfører sig som før. opts.seasonId/stageId respekteres stadig
 * som enkeltfelts-overrides, fordi den manuelle synk og testene bruger dem.
 */
function providerAfOpts(opts) {
  const provider = opts.provider || PROVIDERS.superliga;
  const sync = opts.sync || {
    seasonId: opts.seasonId || SEASON_ID,
    stageId: opts.stageId || STAGE_ID,
  };
  return { provider, sync };
}

/**
 * Kernen (uden Cloud Functions-wrapper — kan unit-testes med injiceret fetch/db).
 * @param {object} db
 * @param {object} FieldValue
 * @param {{fetchFn?:Function, gameId?:string, seasonId?:number,
 *          provider?:object, sync?:object,
 *          only?:Array<{id:string,data:object}>}} [opts]
 * @returns {Promise<{checked:number, updated:number, rettede:string[]}>}
 */
async function syncResultsCore(db, FieldValue, opts = {}) {
  const gameId = opts.gameId || GAME_ID;
  const fetchFn = opts.fetchFn || fetch;
  const { provider, sync } = providerAfOpts(opts);

  const events = await provider.hentFaerdige(sync, fetchFn);

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

  // Hvordan en API-kamp genfinder sit dokument, er providerens viden — SL
  // genskaber seed-id'et af runde+holdnavne, PL slår kilde-id'et op som
  // suffiks. Ukendte nøgler er udeladt af mappet og springes over som altid.
  const resolved = provider.resolveDocs(events.map((e) => e.sourceKey), current.keys());

  const batch = db.batch();
  const rettede = [];
  for (const e of events) {
    const id = resolved.get(e.sourceKey);
    const cur = id == null ? null : current.get(id);
    if (!cur) continue; // ukendt kamp (bør ikke ske — samme kilde som seedet)
    const result = outcomeFromScore(e.homeGoals, e.awayGoals);
    if (!result) continue;
    // Sammenlign på BÅDE facit og mål. Så længe kun facit talte, kunne en
    // rettet score aldrig komme ind: 2-1 → 3-1 er samme 1X2, så dokumentet
    // blev sprunget over for altid — også ved manuel synk. Usynligt dengang
    // målene ikke blev vist; synligt nu, hvor de står på kampkortet.
    // ...og på om der stadig ligger en live-stilling, der skal ryddes. Uden
    // det sidste led kunne en kamp, hvor facit og den sidste live-skrivning
    // landede i samme kørsel, stå med BÅDE slutresultat og "DIREKTE" for evigt.
    if (cur.result === result
        && cur.homeGoals === e.homeGoals
        && cur.awayGoals === e.awayGoals
        && cur.live == null) continue;
    batch.set(matchesCol.doc(id), {
      result,
      homeGoals: e.homeGoals,
      awayGoals: e.awayGoals,
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
  const fetchFn = opts.fetchFn || fetch;
  const nowMs = opts.nowMs ?? Date.now();
  const { provider, sync } = providerAfOpts(opts);

  // Provideren SKAL kaste på et svar uden liste (se kontrakten): fravær af
  // data er et SKRIVE-signal her (det markerer kampe slut), så et svar, vi
  // ikke forstod, må aldrig ligne "ingen kampe i gang".
  //
  // stadigIGang === null betyder "kilden kan ikke levere live" (kontrakten):
  // så ved vi INTET om, hvem der stadig spiller, og slut-markeringen springes
  // over. En tom Set ville betyde det modsatte — alle kampe væk fra listen —
  // og give hver spillende kamp et falsk "Slut".
  const { events, stadigIGang } = await provider.hentLive(sync, fetchFn);

  const current = new Map((opts.only || []).map((m) => [m.id, m.data]));
  // Én opløsning for BÅDE stillings-events og stadig-i-gang-nøglerne, så
  // slut-løkken nedenfor kan sammenligne på dokument-id'er.
  const resolved = provider.resolveDocs(
    [...new Set([...events.map((e) => e.sourceKey), ...(stadigIGang || [])])],
    current.keys(),
  );
  const stadigDocs = stadigIGang == null
    ? null
    : new Set([...stadigIGang].map((k) => resolved.get(k)).filter((v) => v != null));

  const matchesCol = db.collection('games').doc(gameId).collection('matches');
  const batch = db.batch();
  let skrevet = 0;
  for (const e of events) {
    const id = resolved.get(e.sourceKey);
    const cur = id == null ? null : current.get(id);
    if (!cur) continue;
    if (cur.result != null && cur.result !== '') continue; // facit slår live
    const f = cur.live;
    // Skriv KUN når stillingen eller halvlegen faktisk har flyttet sig. Hvert
    // kampdokument lyttes på af hver åben browser, så en skrivning uden
    // ændring koster én læsning pr. klient — og under en kamp sidder folk der.
    if (f && f.home === e.home && f.away === e.away && f.status === e.status) continue;
    batch.set(matchesCol.doc(id), {
      live: {
        home: e.home,
        away: e.away,
        status: e.status,
        // Kun til fejlsøgning i loggen — må ALDRIG renderes. Klippet af
        // provideren: feltet kommer fra en fremmed kilde og udleveres til
        // alle klienter. Det renderes ikke i dag — og skal ikke kunne blive
        // en fælde for den, der en dag beslutter at vise det.
        statusRaw: e.statusRaw,
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
  // stadigDocs === null: kilden kan ikke fortælle, hvem der stadig spiller —
  // så er der intet fraværs-signal at markere slut på (se kontrakten).
  for (const m of (stadigDocs == null ? [] : (opts.only || []))) {
    const f = m.data.live;
    if (f == null) continue;
    // Facit slår live — samme vagt som skriveløkken har. Lander resultatet i
    // vinduet mellem pendingMatches og denne løkke, ville vi ellers hæfte en
    // live-stilling tilbage på en kamp, der lige er afgjort.
    if (m.data.result != null && m.data.result !== '') continue;
    if (stadigDocs.has(m.id)) continue;
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

/**
 * Synk den OFFICIELLE stilling fra spillets kilde til spil-dokumentet
 * (games/{gameId}.standings). Vi BEREGNER ikke selv tabellen — den hentes som
 * autoritativ kilde (samme princip som resultaterne). Provideren normaliserer
 * til FootballTable-formen, så klienten aldrig ser kildens egne feltnavne.
 * @returns {Promise<{rows:number}>}
 */
async function syncStandingsCore(db, FieldValue, opts = {}) {
  const gameId = opts.gameId || GAME_ID;
  const fetchFn = opts.fetchFn || fetch;
  const { provider, sync } = providerAfOpts(opts);

  const rows = await provider.hentStandings(sync, fetchFn);
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

/**
 * Den skemalagte kørsel for ALLE synkede spil — én ad gangen, i listens
 * rækkefølge. Et spil, hvis provider mangler i registret, logges og springes
 * over; det må aldrig kunne vælte de andre spils synk. Sekventielt og ikke
 * parallelt: kørslen er billig (tidligt exit pr. spil), og så kan to spils
 * batches aldrig kappes om samme kvote i samme øjeblik.
 *
 * @returns {Promise<Array<{gameId:string, pending:number, updated:number,
 *          live:object|null, standings:object|null, fejl:string|null}>>}
 */
async function runScheduledSyncAll(db, FieldValue, nowMs, opts = {}) {
  const ud = [];
  for (const g of (opts.games || SYNCED_GAMES)) {
    // Object.hasOwn og ikke et rått opslag: PROVIDERS['constructor'] er
    // truthy (Object-konstruktøren), så en fejlskrevet statisk post ville
    // slippe forbi en !-vagt — samme fælde som LIVE_STATUS dokumenterer.
    const provider = Object.hasOwn(PROVIDERS, g.provider) ? PROVIDERS[g.provider] : null;
    if (!provider) {
      console.error(`synk: ukendt provider "${g.provider}" for ${g.gameId} — springes over.`);
      continue;
    }
    const r = await runScheduledSync(db, FieldValue, nowMs, {
      ...opts, gameId: g.gameId, provider, sync: g.sync,
    });
    ud.push({ gameId: g.gameId, ...r });
  }
  return ud;
}

module.exports = {
  GAME_ID, SEASON_ID, TOURNAMENT_ID, STAGE_ID,
  outcomeFromScore, matchDocId, resultsUrl, syncResultsCore, pendingMatches, WINDOW_MS,
  liveUrl, liveStatus, syncLiveCore,
  standingsUrl, syncStandingsCore, runScheduledSync, runScheduledSyncAll,
  strandedMatches, allMatches,
};
