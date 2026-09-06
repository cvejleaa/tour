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
  matchDocId, liveStatus, resultsUrl, liveUrl, standingsUrl, rundeTal,
} = require('./syncProviders');

const { kickoffPlan } = require('./seedFootball');
// driftlog er afhængighedsfrit, så der opstår ingen cyklus.
const { meldAlarm } = require('./driftlog');
const { puljeLockFraRunde } = require('./pointOpdeling');

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
        && cur.live == null
        && cur.liveMaal == null) continue;
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
      // Live-målene (opgave #78) ryddes af FACIT, samme sted og af samme
      // grund: den validerede liste (kampDetaljer) afløser dem. Leddet i
      // skip-vagten ovenfor er den anden halvdel — uden det ville en kamp,
      // der fik facit og sidste live-skrivning i samme kørsel, beholde
      // begge lister for evigt.
      liveMaal: FieldValue.delete(),
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
  //
  // KUN når mindst én live-hændelse hører til SPILLET (Security-fund):
  // kildernes lister er hele ligaen, så en fremmed kamp — en anden rundes
  // weekend, en playoff-kamp uden dokument — må ikke kunne holde pulsen
  // falsk-frisk; så slog klientens "forældet"-dæmpning aldrig til på en
  // strandet stilling. resolved indeholder netop kun nøgler med dokument.
  const pulsSkrevet = events.some((e) => resolved.get(e.sourceKey) != null);
  if (pulsSkrevet) {
    await db.collection('games').doc(gameId).set({ liveHeartbeatAt: nowMs }, { merge: true });
  }
  // pulsSkrevet rapporteres OP: udebliver pulsen, mens kampe er i vinduet,
  // står kortene med "OPDATERING AFBRUDT" — og det er i dag den ENESTE fejl,
  // ingen kan se bagefter (minut-kortet overskrives af næste grønne kørsel).
  // Se livetavsAlarm nedenfor.
  return { live: events.length, skrevet, sluttet, sluttede, pulsSkrevet };
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
 * `rettede` er de kampe, der NETOP fik facit — minut-jobbet henter deres
 * målscorere allersidst (efterFacitDetaljer), så kortet ikke står med facit
 * og uden scorere i op til en time.
 *
 * @returns {Promise<{pending:number, updated:number, live:object|null,
 *          standings:object|null, fejl:string|null, rettede:string[]}>}
 */
async function runScheduledSync(db, FieldValue, nowMs, opts = {}) {
  let venter;
  try {
    venter = await pendingMatches(db, nowMs, opts);
  } catch (err) {
    return { pending: 0, updated: 0, live: null, standings: null, fejl: `opslag: ${err?.message || err}`, rettede: [] };
  }
  if (venter.length === 0) return { pending: 0, updated: 0, live: null, standings: null, fejl: null, rettede: [] };
  // Kampe med en levende stilling på skærmen LIGE NU — alarmens grundlag.
  // Læses FØR synken skriver, så et kildesvigt ikke kan skjule dem.
  const liveIGang = kampeMedLevendeStilling(venter);

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

  if (updated === 0) return { pending: venter.length, updated, live, standings: null, fejl, liveIGang, rettede };

  let standings = null;
  try {
    standings = await syncStandingsCore(db, FieldValue, opts);
  } catch (err) {
    fejl = `${fejl ? `${fejl}; ` : ''}stilling: ${err?.message || err}`;
  }
  return { pending: venter.length, updated, live, standings, fejl, liveIGang, rettede };
}

// Hvornår er en levende stilling "forældet" for spillerne? SPEJL af klientens
// LIVE_STALE_MS (src/features/games/football/footballRounds.js) — bundet af en
// paritetstest.
const LIVE_STALE_MS = 5 * 60 * 1000;

/**
 * Kampe, der LIGE NU viser en levende stilling på spillernes kort.
 *
 * Dette er alarmens grundlag, og valget ER rettelsen af to fejl (Security-
 * fund): tidligere talte vi `pending` — "kampe i 2,5-timers vinduet uden
 * facit" — men det er en PROXY, ikke symptomet:
 *
 *   - Efter slutfløjt dropper kilden kampen, og serveren sætter live.status
 *     'slut'. Kortet siger da "Slut · afventer facit", og pulsen er tavs helt
 *     efter hensigten. `pending` var stadig > 0, så alarmen råbte hver eneste
 *     kampaften, hvor facit var mere end fem minutter forsinket.
 *   - Før kilden har flippet kampen i gang, findes `live` slet ikke: kortet
 *     står låst uden stilling. Intet symptom, ingen grund til alarm. (Er
 *     kilden nede hele aftenen, fanges det af strandet-alarmen i sweep'et.)
 *
 * Vi tæller derfor præcis de kampe, hvis kort ville skifte til "Opdatering
 * afbrudt", hvis pulsen udebliver: en skrevet live-stilling, der hverken er
 * markeret slut eller afbrudt, og som endnu ikke har facit.
 *
 * @param {Array<{data:object}>} kampe – dokumenterne, som pendingMatches gav dem
 */
function kampeMedLevendeStilling(kampe) {
  return (kampe || []).filter((m) => erIGang(m?.data)).length;
}

/**
 * Er kampen I GANG lige nu — set fra dens eget dokument? ÉT prædikat, delt
 * mellem puls-alarmen ovenfor og live-mål-jobbet (liveMaal.js): en skrevet
 * live-stilling, der hverken er slut eller afbrudt, på en kamp uden facit.
 * Bor her, så de to aldrig kan drive fra hinanden — en proxy-gate ("pending")
 * var netop fejlen, kampeMedLevendeStilling blev skrevet for at rette.
 * Kaster aldrig: et giftigt dokument svarer false.
 */
function erIGang(data) {
  const l = data?.live;
  if (!l || typeof l !== 'object') return false;
  if (data.result != null && data.result !== '') return false;
  return l.status !== 'slut' && l.status !== 'afbrudt';
}

/**
 * Skal vi melde "live-pulsen står stille"? Ren funktion, fordi den er hele
 * dommen: den afgør, om ejeren vækkes.
 *
 * `liveIGang` kommer fra kampenes EGNE dokumenter, ikke fra kildesvaret — og
 * det er den anden halvdel af Security-rettelsen: kaster `hentLive` (HTTP 500,
 * timeout, formatbrud), er kildesvaret `null`, og en betingelse, der hang på
 * det, ville tie ved præcis det totale kildesvigt, alarmen findes for.
 * Dokumenterne ved stadig, at kampene var i gang.
 *
 * En puls, der aldrig er skrevet, tæller som forældet.
 *
 * @param {{liveIGang:number, pulsSkrevet:boolean, pulsAtMs:number|null, nowMs:number}} o
 */
function skalMeldeLiveTavs({ liveIGang, pulsSkrevet, pulsAtMs, nowMs }) {
  if (!(liveIGang > 0)) return false;
  if (pulsSkrevet) return false;
  if (!Number.isFinite(pulsAtMs)) return true;
  return nowMs - pulsAtMs > LIVE_STALE_MS;
}

/**
 * Alarmens tekst. Ren funktion, så INDHOLDET kan mutationstestes — teksten er
 * ejerens eneste vej fra rødt kort til handling, og den må kun nævne det
 * symptom, spillerne faktisk ser (se liveTavsSymptom).
 */
function liveTavsBesked({ liveIGang }) {
  return `Live-stillingen opdateres ikke for ${liveIGang} kamp${liveIGang === 1 ? '' : 'e'}, `
    + 'der er i gang: kortene står med den sidste stilling og "Opdatering afbrudt". '
    + 'Facit og point rammes IKKE — de lander via sweep\'et. '
    + 'Fejlteksten står på minut-kortet ovenfor, mens udfaldet står på. '
    + '(Er pulsen frisk her, men mærkatet gult i en browser, er det browserens '
    + 'forbindelse — genindlæs siden.)';
}

/**
 * Hele live-puls-vagten: læs spillets puls, fæld dommen, meld alarm.
 *
 * Bor HER og ikke i index.js, fordi index.js ikke kan unit-testes — en
 * tastefejl, der vender `!pulsSkrevet` om, ville ellers lande med grøn suite
 * (TM-fund). `meld` injiceres, så en test kan se, hvad der blev meldt.
 *
 * Læser KUN spil-dokumentet i den mistænkelige gren, så et normalt minut ikke
 * koster en ekstra læsning. Fejler ALDRIG hårdt: en fejlet vagt må ikke vælte
 * minut-kørslen for de øvrige spil.
 *
 * @returns {Promise<{meldt:boolean, besked?:string, fejl?:string}>}
 */
async function tjekLivePuls(db, FieldValue, { ud, nowMs = Date.now(), meld = meldAlarm } = {}) {
  // pulsSkrevet læses gennem !! — er kildesvaret null (hentLive kastede), er
  // pulsen ikke skrevet, og DET er netop det tilfælde, alarmen skal fange.
  const pulsSkrevet = !!(ud?.live && ud.live.pulsSkrevet);
  const liveIGang = ud?.liveIGang ?? 0;
  if (!(liveIGang > 0) || pulsSkrevet) return { meldt: false };
  try {
    const snap = await db.collection('games').doc(ud.gameId).get();
    const pulsAtMs = Number(snap.exists ? snap.data().liveHeartbeatAt : NaN);
    if (!skalMeldeLiveTavs({ liveIGang, pulsSkrevet: false, pulsAtMs, nowMs })) return { meldt: false };
    const besked = liveTavsBesked({ liveIGang });
    // kraeverKvittering + INGEN auto-lukning: et udfald, der heler sig selv,
    // må ikke slette sit eget spor, før ejeren har set det (QC-fund).
    await meld(db, FieldValue, {
      type: 'livetavs', gameId: ud.gameId, kampId: null, kraeverKvittering: true, besked,
    });
    return { meldt: true, besked };
  } catch (e) {
    console.error(`Live-puls-tjek ${ud?.gameId} (ignoreret):`, e && e.message);
    return { meldt: false, fejl: (e && e.message) || String(e) };
  }
}

/**
 * Daglig kickoff-synk: ret kamptider fra kilden — og INTET andet.
 *
 * PL flytter kampe løbende (tv-aftaler), og kickoff ER tip-deadlinen, så en
 * forældet tid er en forkert deadline. Beslutningerne (spring spillede over,
 * ryd aldrig en tid, alarm ved useedede kampe) er SPEJLET fra seed-vejens
 * kickoffPlan — samme svar ad begge veje, paritetstestet.
 *
 * INVARIANTEN, sagt højt: en kickoff-ændring rører ALDRIG round eller
 * dokument-id. Spillene er skåret på VORES rundenummer; en runde 18-kamp
 * flyttet til januar er stadig efterårets. Skrivningen er derfor update af
 * PRÆCIS to felter — kan hverken oprette kampe eller ændre andet.
 *
 * Tør-kørsel er default og fejler lukket: kun eksplicit dryRun === false
 * skriver — dét er den ENE vagt om skrivningen ("én vagt pr. sikkerhedsregel").
 *
 * @returns {Promise<{understoettet:boolean, dryRun?:boolean,
 *   aendringer?:Array<{id:string, fraMs:number|null, tilMs:number|null}>,
 *   mangler?:string[], spillet?:number, snart?:string[]}>}
 */
async function syncKickoffsCore(db, FieldValue, opts = {}) {
  const gameId = opts.gameId || GAME_ID;
  const fetchFn = opts.fetchFn || fetch;
  const nowMs = opts.nowMs ?? Date.now();
  const { provider, sync } = providerAfOpts(opts);
  const dryRun = opts.dryRun !== false;

  // En kilde uden hentKickoffs (kickoff-provider) springes over uden støj —
  // dens tider rettes kun ad seedKickoffs-vejen. Både PL og Superligaen HAR
  // metoden nu og synkes dagligt.
  if (typeof provider.hentKickoffs !== 'function') return { understoettet: false };

  const alle = await allMatches(db, { gameId });
  // Spil-dokumentet: bruges kun til den runde-udledte pulje-deadline nederst.
  const gameSnap = await db.collection('games').doc(gameId).get();
  // Kun kilde-kampe i SPILLETS runder tolkes (se kontrakten): ellers står
  // mangler-alarmen med 200 forårskampe hver morgen, og den ene ægte
  // manglende kamp bliver usynlig — og én ulæselig tid i en kamp, spillet
  // ikke har, kunne vælte hele dagens kørsel.
  // Begge operander gennem rundeTal: kilden sender strenge, og fik et dokument
  // en streng-runde (seed skriver tal, men matches har ingen type-vagt), ville
  // præcis den tavse fejl fra 6/9 vende tilbage — 0 rettet, 0 mangler, grønt
  // kort (Security-fund på #224).
  const runder = new Set(alle.map((m) => rundeTal(m.data.round)).filter(Number.isFinite));
  const fixtures = await provider.hentKickoffs(sync, fetchFn, runder);
  const resolved = provider.resolveDocs(fixtures.map((f) => f.sourceKey), alle.map((m) => m.id));
  const nuvaerende = new Map(alle.map((m) => {
    const ms = kickoffMs(m.data.kickoff);
    return [m.id, { result: m.data.result, kickoffMs: Number.isFinite(ms) ? ms : null }];
  }));

  const plan = kickoffPlan(
    fixtures.filter((f) => resolved.has(f.sourceKey))
      .map((f) => ({ id: resolved.get(f.sourceKey), kickoff: f.kickoff })),
    nuvaerende,
  );
  // Kilde-kampe uden dokument er samme alarm som plan.mangler: aftenen før en
  // runde betyder det "aldrig seedet", og det må ikke drukne i de spillede.
  const mangler = [...plan.mangler, ...fixtures.filter((f) => !resolved.has(f.sourceKey)).map((f) => f.sourceKey)];

  // GENÅBNINGS-FORBUDDET (Security-fund, bevist mod regel-emulatoren): en
  // kickoff i FORTIDEN, der flyttes til fremtiden, gør `request.time <
  // kickoff` sand igen — og så kan tips OPRETTES på en kamp, der er i gang
  // eller spillet, EFTER at alles tips har været synlige. Samme klasse af
  // usynlig beslutning som at rydde en tid: rutinekørslen nægter, fejlen står
  // i loggen, og en ægte genopsat kamp rettes bevidst ad seed-vejen.
  const genaabninger = plan.aendringer
    .filter((a) => a.fraMs != null && a.fraMs <= nowMs && a.tilMs != null && a.tilMs > nowMs)
    .map((a) => a.id);
  for (const id of genaabninger) {
    console.error(`kickoff-synk ${gameId}: ${id} ville flytte en PASSERET kickoff til fremtiden og GENÅBNE tips på en lukket kamp — afvist. Er kampen ægte genopsat, så ret den ad seed-vejen (drift.md).`);
  }
  const skrives = plan.aendringer.filter((a) => !genaabninger.includes(a.id));

  // Rules validerer tips mod deadlinen i skriveøjeblikket, så tips afgivet før
  // en FREMRYKNING var lovlige og kan ikke maskinelt annulleres. Vagten er et
  // menneske: en ny tid i fortiden eller mindre end 48 timer ude skal SES.
  const snart = skrives
    .filter((a) => a.tilMs != null && a.tilMs - nowMs < 48 * 60 * 60 * 1000)
    .map((a) => a.id);
  for (const id of snart) {
    console.error(`kickoff-synk ${gameId}: ${id} flyttes til et tidspunkt under 48 timer ude (eller i fortiden) — tjek om nogen har tippet med facit i hånden.`);
  }

  if (!dryRun && skrives.length) {
    const matchesCol = db.collection('games').doc(gameId).collection('matches');
    const batch = db.batch();
    for (const a of skrives) {
      // update, aldrig set: kan ikke oprette kampe — og rører PRÆCIS to felter.
      batch.update(matchesCol.doc(a.id), {
        kickoff: new Date(a.tilMs),
        kickoffSyncedAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
  }

  // Pulje-deadline UDLEDT af en runde (game.puljeLockRound): puljen lukker ved
  // det tidligste kickoff i den runde, og følger dermed kamptiderne, vi netop
  // har rettet. KUN spil med puljeLockRound røres — Superligaens FASTE
  // puljeLockAt (uden puljeLockRound) er derfor urørt.
  //
  // GENÅBNINGS-FORBUD (samme klasse som kickoff-forbuddet ovenfor): er
  // deadlinen PASSERET, er alles pulje-tips blevet synlige. En kamp, der så
  // flyttes frem i tid, må ALDRIG skubbe deadlinen ud i fremtiden igen og
  // genåbne puljen, efter folk har set hinandens tip. Så en ny deadline i
  // fremtiden afvises, når den gamle allerede er passeret.
  let puljeLock = null;
  let puljeLockAfvist = null; // udfyldt KUN når en genåbning afvises (til alarm)
  const game = gameSnap && gameSnap.exists ? gameSnap.data() : null;
  const lockRunde = game ? game.puljeLockRound : null;
  if (lockRunde != null) {
    // Udled fra de OPDATEREDE kickoffs (anvend dagens ændringer in-memory).
    const nyeTider = new Map(skrives.map((a) => [a.id, a.tilMs]));
    const opdaterede = alle.map((m) => ({
      round: m.data.round,
      kickoff: nyeTider.has(m.id) ? nyeTider.get(m.id) : m.data.kickoff,
    }));
    const nyMs = puljeLockFraRunde(opdaterede, lockRunde);
    const nuMs = kickoffMs(game.puljeLockAt);
    // Er den NUVÆRENDE deadline allerede EKSPONERET (alle tips synlige)? Kun et
    // FRAVÆRENDE felt (allerførste udledning) er trygt: puljen har aldrig været
    // åben, og rules holder den lukket, til feltet sættes. Alt andet, der er SAT
    // men ikke et gyldigt FREMTIDIGT tidspunkt — et passeret kickoff (nuMs <=
    // now) ELLER en uparselig værdi (NaN, fx et felt sat til null, som rules
    // eksponerer) — regnes eksponeret. `nuMs != null` fangede IKKE NaN, så en
    // null-deadline slap forbi og kunne genåbnes; derfor Number.isFinite. Kan
    // vi ikke BEVISE, at puljen stadig er lukket, må deadlinen aldrig frem.
    const nuEksponeret = game.puljeLockAt !== undefined
      && (!Number.isFinite(nuMs) || nuMs <= nowMs);
    const genaabner = nuEksponeret && nyMs != null && nyMs > nowMs;
    if (nyMs != null && nyMs !== nuMs && !genaabner) {
      puljeLock = { fraMs: Number.isFinite(nuMs) ? nuMs : null, tilMs: nyMs, runde: lockRunde };
      if (!dryRun) {
        await db.collection('games').doc(gameId)
          .set({ puljeLockAt: new Date(nyMs) }, { merge: true });
      }
    } else if (genaabner) {
      // Afvist genåbning er en TAVS fejl uden dette: deadlinen sidder fast på en
      // passeret/eksponeret værdi, og puljen kan aldrig få sin rigtige runde-
      // dato. Returnér detaljen, så den scheduled function kan meldAlarm (som
      // kickoff-søsteren) — ikke kun console.error, som ingen læser. nuMs kan
      // være NaN (felt sat til null), så new Date(nuMs).toISOString() ville
      // kaste; vis råværdien i stedet.
      puljeLockAfvist = { fraMs: Number.isFinite(nuMs) ? nuMs : null, tilMs: nyMs, runde: lockRunde };
      const fraTekst = Number.isFinite(nuMs) ? new Date(nuMs).toISOString() : String(game.puljeLockAt);
      console.error(`pulje-lock ${gameId}: runde ${lockRunde} ville skubbe en allerede EKSPONERET deadline (${fraTekst}) ud i fremtiden (${new Date(nyMs).toISOString()}) — afvist for ikke at genåbne puljen.`);
    }
  }

  return { understoettet: true, dryRun, aendringer: skrives, mangler, spillet: plan.spillet, snart, genaabninger, puljeLock, puljeLockAfvist };
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

/**
 * Højst så mange xG-kald pr. sweep-kørsel.
 *
 * xG koster ÉT kald pr. kamp hos begge kilder. Uden et loft ville den første
 * kørsel efter udrulningen forsøge ~132 kald for Superligaen alene og ramme
 * sweep'ets timeout — og så ville INGEN blive skrevet, hver gang. Med loftet
 * tager bagfyldningen nogle kørsler og bliver færdig af sig selv.
 *
 * 30 er valgt så en fuld sæsons efterslæb er hentet på under et døgn
 * (12 kørsler i døgnet), mens en normal runde på 6-10 kampe altid nås i den
 * første kørsel efter runden.
 */
const XG_LOFT = 30;
// Wall-clock-budget for ÉN xG-kørsel. Loftet ovenfor er sat efter kvote (132
// kampe, 12 kørsler i døgnet), ikke efter tid — og tid var det, der manglede:
// 30 sekventielle kald à 10 s er 300 s, hvilket alene overskrider budgettet
// for det job, kaldet sidder i. Kalderen sætter tallet ud fra SIT budget
// (se index.js); dette er gulvet, hvis ingen siger noget.
const XG_BUDGET_MS = 30000;

/**
 * Hent og skriv xG for FÆRDIGE kampe, der mangler det.
 *
 * KØRES KUN FRA SWEEP'ET. Se kontrakten i syncProviders.js: xG i minut-synken
 * ville være ~132 ekstra kald i minuttet og kunne tavst standse facit-synken,
 * fordi hentFaerdige kaster ved timeout og fejlen sluges.
 *
 * Funktionen er også BAGFYLDNINGEN. Der findes ikke et separat script: de
 * kampe, der allerede er spillet, mangler xG på præcis samme måde som en kamp
 * fra i aftes, og sweep'et kan ikke se forskel. Derfor henter den sig selv
 * ned mod nul, uden en tør-kørsel og uden en engangsskrivning i
 * produktionsdata. recomputeGameMatch returnerer tidligt, når `result` er
 * uændret, så en xG-skrivning på en afgjort kamp udløser hverken point, Elo
 * eller Runde-Bot.
 *
 * @returns {Promise<{manglede:number, hentet:number, skrevet:number}>}
 *   `manglede` er tallet FØR kørslen — det er dét, driftlog-kortet viser, og
 *   det skal gå mod 0.
 */
async function syncXgCore(db, FieldValue, opts = {}) {
  const gameId = opts.gameId || GAME_ID;
  const fetchFn = opts.fetchFn || fetch;
  const provider = opts.provider;
  // En kilde uden hentXg er ikke en fejl — den har bare ikke evnen.
  if (!provider || typeof provider.hentXg !== 'function') {
    return { manglede: 0, hentet: 0, skrevet: 0 };
  }
  const alle = opts.only || await allMatches(db, opts);

  // Kun kampe der ER afgjort og mangler tallet. `xgHome` er nok som prøve:
  // de to felter skrives altid sammen, aldrig det ene alene.
  // `typeof === 'number'` og ikke Number(): et felt med null ville ellers give
  // Number(null) === 0, tælle som "har xG" og aldrig blive prøvet igen.
  const harXg = (v) => typeof v === 'number' && Number.isFinite(v);
  const mangler = alle.filter((m) => m.data?.result && !harXg(m.data?.xgHome));
  if (!mangler.length) return { manglede: 0, hentet: 0, skrevet: 0 };

  const iAlt = mangler.length;
  const valgte = mangler.slice(0, XG_LOFT);
  // resolveDocs oversætter kildens nøgler til vores dokument-id'er. Vi skal
  // den anden vej, så mappet vendes — kun for de valgte, så en stor base
  // ikke bygger et map over hele sæsonen.
  const docIds = valgte.map((m) => m.id);
  // hentXg tager VORES id'er og giver KILDENS nøgler tilbage; resolveDocs
  // oversætter dem så den modsatte vej. Kernen kender dermed ikke id-formen
  // hos nogen af kilderne — se kontrakten i syncProviders.js.
  // Budgettet regnes HER og gives til provideren, som tjekker det pr. kamp.
  // Kernen kan ikke selv afbryde et await, og en Promise.race ville lade
  // kaldet løbe videre i baggrunden og stadig holde funktionen i live.
  const budgetMs = Number.isFinite(Number(opts.budgetMs)) && Number(opts.budgetMs) > 0
    ? Number(opts.budgetMs) : XG_BUDGET_MS;
  const rows = await provider.hentXg(opts.sync, fetchFn, docIds, Date.now() + budgetMs);
  const tilbage = provider.resolveDocs(rows.map((r) => r.sourceKey), docIds);

  const batch = db.batch();
  const matchesCol = db.collection('games').doc(gameId).collection('matches');
  let skrevet = 0;
  for (const r of rows) {
    const id = tilbage.get(r.sourceKey);
    if (!id) continue;
    // UDELAD frem for at sætte undefined: der er ingen
    // ignoreUndefinedProperties i dette projekt, og et undefined i en batch
    // KASTER og river hele skrivningen med.
    if (!harXg(r.xgHome) || !harXg(r.xgAway)) continue;
    // update og ikke set(merge): set ville OPRETTE et kamp-dokument, hvis en
    // nøgle nogensinde pegede forkert. Samme vagt som syncResultsCore bruger.
    batch.update(matchesCol.doc(id), {
      xgHome: r.xgHome,
      xgAway: r.xgAway,
      xgSyncedAt: FieldValue.serverTimestamp(),
    });
    skrevet += 1;
  }
  if (skrevet) await batch.commit();
  return { manglede: iAlt, hentet: rows.length, skrevet };
}

module.exports = {
  GAME_ID, SEASON_ID, TOURNAMENT_ID, STAGE_ID,
  outcomeFromScore, matchDocId, resultsUrl, syncResultsCore, pendingMatches, WINDOW_MS,
  skalMeldeLiveTavs, kampeMedLevendeStilling, erIGang, liveTavsBesked, tjekLivePuls, LIVE_STALE_MS,
  liveUrl, liveStatus, syncLiveCore,
  standingsUrl, syncStandingsCore, runScheduledSync, runScheduledSyncAll,
  syncKickoffsCore, strandedMatches, allMatches,
  syncXgCore, XG_LOFT, XG_BUDGET_MS,
};
