// ---------------------------------------------------------------------------
// functions-platform/index.js — Cloud Functions for den SAMLEDE tippeplatform
// (projekt spil-89af9 / tip.vejleaa.dk).
//
// Egen codebase ("platform" i firebase.json), adskilt fra Tour-motoren
// ("default" → tour-85928): Firebase-CLI'en validerer ALLE en codebases
// secrets mod målprojektet ved deploy, så Tour-funktionernes secrets
// (SMTP_PASSWORD m.fl., som kun findes i tour-85928) må ikke ligge i den
// codebase der deployes til spil-89af9 — og omvendt skal spil-afregningen
// ikke med i Tour-deploys.
// ---------------------------------------------------------------------------

'use strict';

const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { getStorage } = require('firebase-admin/storage');
const { initializeApp } = require('firebase-admin/app');
const crypto = require('crypto');

const {
  recomputeGameMatchCore, recomputeSeasonElo, recomputeAllPlayerTotals, rescoreAllBets,
  dryRunFraKald,
  puljeTipKomplet,
} = require('./gameScoring');
const {
  syncResultsCore, syncStandingsCore, runScheduledSyncAll, syncKickoffsCore, syncXgCore,

  tjekLivePuls,
  strandedMatches, allMatches,
} = require('./superligaSync');
const { PROVIDERS, SYNCED_GAMES } = require('./syncProviders');
const { statusSamler, meldAlarm, loesDriftAlarmer, naesteKoerselFoerMs, strandetBesked } = require('./driftlog');
const {
  syncKampDetaljerCore, efterFacitDetaljer, sweepKampDetaljer,
  DETALJE_BUDGET_BROEK, detaljeNiveau,
} = require('./kampDetaljer');

// Sweepets timer — SKAL følges ad med cron-udtrykket på syncSuperligaSweep.
const SWEEP_TIMER = [2, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];

// Driftstatus-skrivningen må ALDRIG vælte den kørsel, den beskriver —
// konsollen er bagstopperen, fladen er kun NU-billedet. naesteForventetFoerMs
// kan være en FUNKTION: så evalueres kadence-beregningen også inde i try'et
// (et argument evalueres FØR kaldet — en kastende beregning uden for ville
// vælte resten af kørslen, Security-fund).
async function skrivDriftStatus(st, db, opts) {
  try {
    const o = { ...opts };
    if (typeof o.naesteForventetFoerMs === 'function') o.naesteForventetFoerMs = o.naesteForventetFoerMs();
    await st.skriv(db, FieldValue, o);
  } catch (err) {
    console.error('driftlog-skrivning fejlede (ignoreret):', err?.message || err);
  }
}
const {
  redeemLeagueCodeCore, LEAGUE_ERR, hentLigaMedlemmer, saetLigaMedlemCore,
} = require('./gameLeagues');
const { setChanceCore, chanceFejl } = require('./chanceVagt');
const { buildTransport, sendEmail, escapeHtml, broadcastHtml, APP_URL } = require('./mailer');
const { runGameTipReminders, sendGameTestReminder, hentTipStatus, koerPaamindelserForSpil } = require('./reminders');
const { forventerPaamindelser } = require('./paamindelsesGate');
const { runGameRoundRecap } = require('./gameRecap');
const { skalAfsloere, runLeagueQuestionRecap } = require('./leagueQuestionRecap');
const { puljeKonfig } = require('./superligaScoring');
const { membershipDelta, applyMembershipDelta, rebuildGamePlayerLeagues } = require('./playerLeagues');
const { hentSpoergsmaalStatus } = require('./gameLeagues');
const { invitationsHtml, ligaProfil, invitationsFejl } = require('./inviteTemplate');
const { validerBroadcastBillede, broadcastBilledeSti } = require('./broadcastImage');

initializeApp();

const REGION = 'europe-west1';
// EKSPLICIT Storage-bucket. getStorage().bucket() uden argument falder tilbage
// på FIREBASE_CONFIG's default, som er det GAMLE `.appspot.com`-navn — men
// projektets faktiske bucket er den NYE `.firebasestorage.app` (samme værdi som
// klientens VITE_FIREBASE_STORAGE_BUCKET). Uden dette navn skriver upload til en
// bucket, der ikke findes, og fejler med "Billedet kunne ikke gemmes".
//
// LOCKSTEP: samme bucket-navn står tre steder i tre medier, der ikke kan dele
// en konstant — her (JS-runtime), `firebase.json` storage.bucket (CLI'ens
// regel-mål) og `.github/workflows/deploy-platform.yml` VITE_FIREBASE_STORAGE_
// BUCKET (klient-bundlen). Migreres bucket'en, skal alle tre flyttes samtidig.
const STORAGE_BUCKET = 'spil-89af9.firebasestorage.app';
const TZ = 'Europe/Copenhagen';

// SMTP-adgangskode for tip@vejleaa.dk. Sæt én gang (uden den no-op'er mail):
//   firebase functions:secrets:set SMTP_PASSWORD --project spil-89af9
const SMTP_PASSWORD = defineSecret('SMTP_PASSWORD');

// Claude-nøgle til Runde-Botten. Sæt én gang (uden den no-op'er botten):
//   firebase functions:secrets:set ANTHROPIC_API_KEY --project spil-89af9
const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');

/** Klar Anthropic-klient, eller null hvis nøglen ikke er sat. */
function anthropicClient() {
  const apiKey = ANTHROPIC_API_KEY.value();
  if (!apiKey) return null;
  // Lazy-require, så cold start uden botten ikke betaler for SDK'et.
  const Anthropic = require('@anthropic-ai/sdk');
  return new Anthropic({ apiKey });
}

// recomputeGameMatch — afregn point i den samlede platform når en kamps facit
// (result) sættes: score alle bets på kampen (1X2 + Chancen) og genberegn hver
// berørt spillers total. Spejler Tour-motorens recomputeStage, men spil-scoped.
exports.recomputeGameMatch = onDocumentWritten(
  { document: 'games/{gameId}/matches/{matchId}', region: REGION, secrets: [ANTHROPIC_API_KEY] },
  async (event) => {
    const db = getFirestore();
    const { gameId, matchId } = event.params;
    const after = event.data?.after?.data();
    if (!after) return; // kampen er slettet
    const before = event.data?.before?.data();
    // Kør kun når facit reelt ændrer sig (undgå løkker ved andre felt-skriv).
    // Bemærk: også når facit FJERNES (null) — så rulles pointene tilbage.
    const prevResult = before?.result ?? null;
    const nextResult = after.result ?? null;
    if (prevResult === nextResult) return;
    const { roundCompleted } = await recomputeGameMatchCore(db, FieldValue, gameId, matchId, after) || {};
    // Levende Elo: opdatér ratings + friske odds på fremtidige kampe.
    // (Odds-skriv på kampe uden facit gen-udløser IKKE denne funktion.)
    await recomputeSeasonElo(db, FieldValue, gameId, Date.now());
    // Runde-Botten: når rundens SIDSTE kamp netop er afregnet, generér og post
    // runde-opslaget på spillets liga-vægge. No-op'er pænt uden nøgle, og
    // botten er selv idempotent (game.recappedRounds) — et AI-udfald må aldrig
    // vælte selve afregningen, så fejl logges kun.
    if (roundCompleted != null) {
      try {
        const anthropic = anthropicClient();
        if (!anthropic) { console.log('rundeBot: ANTHROPIC_API_KEY ikke sat — springer over.'); return; }
        const out = await runGameRoundRecap(db, FieldValue, anthropic, gameId, roundCompleted);
        console.log(`rundeBot(${gameId}, runde ${roundCompleted}):`, JSON.stringify({ posted: out.posted, reason: out.reason || null }));
      } catch (e) {
        console.error('rundeBot fejlede:', e && e.message);
      }
    }
  },
);

// generateGameRecapNow — admin: generér runde-opslaget manuelt. dryRun=true
// (forhåndsvisning) poster ikke, men returnerer teksten; dryRun=false poster på
// alle spillets liga-vægge (idempotent pr. runde). Uden runde vælges den
// seneste helt afgjorte.
exports.generateGameRecapNow = onCall(
  { region: REGION, secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 300 },
  async (request) => {
    const db = getFirestore();
    await requireAdmin(db, request);
    const gameId = String(request.data?.gameId || '').trim();
    if (!gameId) throw new HttpsError('invalid-argument', 'Mangler spil-id.');
    const anthropic = anthropicClient();
    if (!anthropic) throw new HttpsError('failed-precondition', 'ANTHROPIC_API_KEY er ikke sat.');
    const roundNo = Number.isFinite(Number(request.data?.round)) && request.data?.round !== null && request.data?.round !== ''
      ? Number(request.data.round) : null;
    const dryRun = request.data?.dryRun !== false; // default: forhåndsvisning
    try {
      return await runGameRoundRecap(db, FieldValue, anthropic, gameId, roundNo, { dryRun });
    } catch (e) {
      console.error('generateGameRecapNow:', e && e.message);
      throw new HttpsError('internal', 'Kunne ikke generere opslaget: ' + (e && e.message));
    }
  },
);

// ---------------------------------------------------------------------------
// Runde-Botten afslører et LIGA-SPØRGSMÅL, når facit sættes (opgave #39).
// ÉT opslag pr. spørgsmål, ved facit — fladen viser selv svarene ved deadline
// (design-afgørelse fra QC/Spilfører på planen; se leagueQuestionRecap.js).
// Beslutningen "skal denne skrivning udløse et opslag?" er REN (skalAfsloere)
// og mutationstestet dér — wrapperen her er kun rørføring.
// ---------------------------------------------------------------------------
exports.leagueQuestionClosed = onDocumentWritten(
  { document: 'games/{gameId}/leagues/{leagueId}/questions/{qId}', region: REGION, secrets: [ANTHROPIC_API_KEY] },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!skalAfsloere(before, after)) return;
    // Et AI-udfald må aldrig vælte facit-skrivningen — fejl logges kun, og
    // markøren (botFacitAt) er ikke sat, så liga-ejerens knap kan samle op.
    try {
      const anthropic = anthropicClient();
      if (!anthropic) { console.log('lqBot: ANTHROPIC_API_KEY ikke sat — springer over.'); return; }
      const db = getFirestore();
      const { gameId, leagueId, qId } = event.params;
      const out = await runLeagueQuestionRecap(db, FieldValue, anthropic,
        { gameId, leagueId, questionId: qId }, { dryRun: false });
      console.log(`lqBot(${gameId}/${leagueId}/${qId}):`, JSON.stringify({ posted: out.posted, reason: out.reason || null }));
    } catch (e) {
      console.error('lqBot fejlede:', e && e.message);
    }
  },
);

// leagueQuestionRecapNow — den BEVIDSTE start på afsløringen (CLAUDE.md: en
// funktion, der kun kan startes af en tilfældig hændelse, er ikke færdig).
// Adgang: LIGA-EJEREN (der satte facit og savner opslaget) eller
// owner/globalAdmin som recovery. Forhåndsvisning (dryRun) viser svar og
// navne og kræver derfor MEDLEMSKAB af ligaen — en admin uden for ligaen må
// gerne (gen)poste blindt, men aldrig læse svarene her.
exports.leagueQuestionRecapNow = onCall(
  { region: REGION, secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 300 },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Du skal være logget ind.');
    const db = getFirestore();
    const ID_RE = /^[A-Za-z0-9_-]{1,200}$/;
    const gameId = String(request.data?.gameId || '').trim();
    const leagueId = String(request.data?.leagueId || '').trim();
    const questionId = String(request.data?.questionId || '').trim();
    for (const id of [gameId, leagueId, questionId]) {
      if (!ID_RE.test(id) || /^__.*__$/.test(id)) {
        throw new HttpsError('invalid-argument', 'Ugyldigt id.');
      }
    }
    const leagueRef = db.collection('games').doc(gameId).collection('leagues').doc(leagueId);
    const [leagueSnap, callerSnap] = await Promise.all([
      leagueRef.get(),
      db.collection('users').doc(request.auth.uid).get(),
    ]);
    const bruger = callerSnap.exists ? callerSnap.data() : null;
    // Approved-tjekket FØR eksistens-svaret — samme dørmands-rækkefølge som
    // leagueQuestionStatus (en ikke-godkendt må ikke kunne sondere liga-id'er).
    if (!bruger || bruger.status !== 'approved') {
      throw new HttpsError('permission-denied', 'Din bruger er ikke godkendt.');
    }
    if (!leagueSnap.exists) throw new HttpsError('not-found', 'Ligaen findes ikke.');
    const liga = leagueSnap.data();
    const erEjer = liga.ownerUid === request.auth.uid;
    const erAdmin = bruger.role === 'owner' || bruger.role === 'globalAdmin';
    if (!erEjer && !erAdmin) {
      throw new HttpsError('permission-denied', 'Kun ligaens ejer kan poste afsløringen.');
    }
    const dryRun = request.data?.dryRun !== false; // default: forhåndsvisning
    const erMedlem = (liga.memberUids || []).includes(request.auth.uid);
    if (dryRun && !erMedlem) {
      throw new HttpsError('permission-denied', 'Forhåndsvisningen viser svarene og kræver medlemskab af ligaen.');
    }
    // tvingNy (genudsendelse) kræver medlemskab eller admin: en ejer, der har
    // FORLADT sin liga, skal ikke kunne spamme en væg, hen ikke selv må læse
    // (Security-fund). Kernen lægger derudover 10 min cooldown pr. opslag.
    if (request.data?.tvingNy === true && !erMedlem && !erAdmin) {
      throw new HttpsError('permission-denied', 'Genudsendelse kræver medlemskab af ligaen.');
    }
    const anthropic = anthropicClient();
    if (!anthropic) throw new HttpsError('failed-precondition', 'ANTHROPIC_API_KEY er ikke sat.');
    try {
      return await runLeagueQuestionRecap(db, FieldValue, anthropic,
        { gameId, leagueId, questionId },
        { dryRun, tvingNy: request.data?.tvingNy === true });
    } catch (e) {
      console.error('leagueQuestionRecapNow:', e && e.message);
      throw new HttpsError('internal', 'Kunne ikke generere afsløringen.');
    }
  },
);

// recomputeGameScores — admin: genberegn ALLE spilleres totaler i et spil med
// den aktuelle start-gate (game.startRound). Bruges efter at have sat/ændret
// starttidspunktet, så tidligere runders point fjernes fra stillingen straks.
// syncPlayerLeagues — hold games/{gameId}/players/{uid}.leagueIds i sync med
// ligaernes memberUids. Feltet er dét, security rules bruger til at afgøre,
// hvem der må se hvis point: kun spillere der deler mindst én liga. Klienten
// må ikke skrive feltet, så serveren gør det her ved enhver liga-ændring.
exports.syncPlayerLeagues = onDocumentWritten(
  { document: 'games/{gameId}/leagues/{leagueId}', region: REGION },
  async (event) => {
    const { gameId, leagueId } = event.params;
    const delta = membershipDelta(event.data?.before?.data() || null, event.data?.after?.data() || null);
    if (delta.added.length === 0 && delta.removed.length === 0) return;
    const db = getFirestore();
    const out = await applyMembershipDelta(db, FieldValue, gameId, leagueId, delta);
    console.log(`syncPlayerLeagues(${gameId}/${leagueId}):`, JSON.stringify(out));
  },
);

// backfillPlayerLeagues — engangs-/vedligeholdelseskørsel: genopbyg leagueIds
// for alle spillere i ét spil ud fra ligaernes memberUids.
exports.backfillPlayerLeagues = onCall({ region: REGION }, async (request) => {
  const db = getFirestore();
  await requireAdmin(db, request);
  const gameId = String(request.data?.gameId || '').trim();
  if (!gameId) throw new HttpsError('invalid-argument', 'Mangler spil-id.');
  return rebuildGamePlayerLeagues(db, gameId);
});

exports.recomputeGameScores = onCall({ region: REGION }, async (request) => {
  const db = getFirestore();
  await requireAdmin(db, request);
  const gameId = String(request.data?.gameId || '').trim();
  if (!gameId) throw new HttpsError('invalid-argument', 'Mangler spil-id.');
  return recomputeAllPlayerTotals(db, FieldValue, gameId);
});

// rescoreGameBets — genscor ALLE bets mod deres kamps facit.
//
// Kun nødvendig når selve POINTREGLEN har ændret sig. Den almindelige trigger
// skriver kun bet-point, når en kamps facit ændrer sig, så en regelændring
// efterlader alle gamle bets med deres gamle tal — og `chance`, der udledes som
// (gemte point − 1X2-point), ville gå i minus.
//
// dryRun er DEFAULT SAND. Den her rører hver eneste spillers point, og
// CLAUDE.md kræver tør-kørsel først på alt, der skriver i produktionsdata.
exports.rescoreGameBets = onCall({ region: REGION }, async (request) => {
  const db = getFirestore();
  await requireAdmin(db, request);
  const gameId = String(request.data?.gameId || '').trim();
  if (!gameId) throw new HttpsError('invalid-argument', 'Mangler spil-id.');
  // Kun et EKSPLICIT dryRun: false skriver. Udelades feltet, tørkøres der.
  const dryRun = request.data?.dryRun !== false;
  return rescoreAllBets(db, FieldValue, gameId, { dryRun });
});

// repriceGameOdds — genberegn Elo og skriv friske odds på alle IKKE-LÅSTE kampe.
//
// HVORFOR DEN FINDES. recomputeSeasonElo kunne indtil nu KUN startes af, at en
// kamps facit ændrede sig. En ændring i odds-modellen lå derfor død i koden,
// indtil en tilfældig kamp blev afgjort — og den kamp var som regel selv låst
// på det tidspunkt. Det gjorde enhver model-ændring til en timing-øvelse: man
// skulle gætte, hvilket resultat der ville udløse omprisningen, og håbe det
// faldt i det rigtige vindue. Da odds-loftet blev fjernet, var vinduet under
// et døgn bredt, og det er ikke en holdbar måde at rette en fejl på.
//
// HVAD DEN IKKE GØR. Den rører ikke låste eller spillede kampe (samme to
// filtre som altid), den ændrer ingen point, og den scorer ingen bets om.
// Odds på en kamp, der er gået i gang, er frosne — det er hele grunden til at
// fryse dem, og en knap må ikke kunne omgå det.
//
// dryRun er DEFAULT SAND, som rescoreGameBets. Den skriver i produktionsdata
// på hver eneste ikke-låst kamp, og der er ingen oddsHistory at rulle tilbage
// til. `aendringer` er derfor den eneste kvittering, der findes — gem den.
exports.repriceGameOdds = onCall({ region: REGION, timeoutSeconds: 300 }, async (request) => {
  const db = getFirestore();
  await requireAdmin(db, request);
  const gameId = String(request.data?.gameId || '').trim();
  if (!gameId) throw new HttpsError('invalid-argument', 'Mangler spil-id.');
  // Et ukendt spil-id gav før tavst {updated: 0}, og fladen meldte så "oddsene
  // er allerede i takt med modellen" om et spil, der slet ikke findes.
  const snap = await db.collection('games').doc(gameId).get();
  if (!snap.exists) throw new HttpsError('not-found', `Spillet "${gameId}" findes ikke.`);
  // Reglen bor i gameScoring, hvor den er unit-testet — ikke som en
  // sammenligning her, der kunne vendes uden at nogen test sagde fra.
  const dryRun = dryRunFraKald(request.data);
  const out = await recomputeSeasonElo(db, FieldValue, gameId, Date.now(), { dryRun });
  console.log(`repriceGameOdds(${gameId}, dryRun=${dryRun}): ${out.updated} kampe`);
  // HELE listen logges ved en rigtig skrivning, ikke bare antallet. Der er
  // ingen oddsHistory, og browserens tabel forsvinder, når fanen lukkes — så
  // Cloud-loggen ER kvitteringen. Uden den findes de gamle odds ingen steder
  // det sekund, klikket er sket.
  if (!dryRun && out.updated) {
    console.log(`repriceGameOdds ændringer(${gameId}):`, JSON.stringify(out.aendringer));
  }
  return { ...out, dryRun };
});

// syncSuperligaResults — hent færdigspillede kampe fra api.superliga.dk og sæt
// facit på de matchende kampe. At skrive result udløser recomputeGameMatch
// (afregning + levende Elo). Fail-silent som Tour-synken.
//
// Kører HVERT MINUT i tidsrummet, hvor der overhovedet kan være kampe i gang —
// men gør intet, med mindre en kamp faktisk er sat i gang og stadig mangler
// facit. Samme kørsel henter den LEVENDE stilling på kampe midt i spillet, så
// man kan følge med på tip-fladen. Det tidlige exit er dét, der gør frekvensen
// billig:
//
//   før:  hvert kvarter 14-23, HVER dag året rundt, 132 læsninger pr. kørsel
//         = 14.600 kørsler og ~1,9 mio. læsninger om året
//   nu:   ét kald i minuttet, men kun mens der spilles — resten af tiden ét
//         enkelt (tomt) opslag. En tom range-forespørgsel koster én læsning.
//
// Kampprogrammet har ét kickoff kl. 12 og det seneste kl. 20, så 12-23 dækker
// hele sæsonen. Dækningen er asymmetrisk: fortil beskytter vinduet os (en kamp
// kl. 11 fanges stadig kl. 12), mens en kamp fra kl. 21.30 og senere ville få
// sit vindue klippet ved midnat. Nattens fuldsweep tager den slags.
// Funktionsnavnet er historisk (deployet under det) — kørslen dækker ALLE
// spil i SYNCED_GAMES, ét ad gangen. Det tidlige exit gælder pr. spil, så et
// stille minut koster ét tomt opslag pr. synket spil.
// timeoutSeconds: værste tilfælde er nu to spil × fuld sæson-liste × to veje
// (facit + live à 10 s pr. side) — default 60 s kunne klippe kørslen midt i
// et langsomt kampvindue (Security-fund). 120 s dækker med god margin.
// Minut-jobbets loft. Står som konstant, fordi budgettet for målscorere
// efter facit afledes af det (se EFTERFACIT_BUDGET_MS) — ikke som en literal
// to steder, der kan drive fra hinanden.
const MINUT_TIMEOUT_S = 120;

exports.syncSuperligaResults = onSchedule(
  { schedule: '* 12-23 * * *', timeZone: TZ, region: REGION, timeoutSeconds: MINUT_TIMEOUT_S },
  async () => {
    // Selve rækkefølgen — og det tidlige exit — bor i superligaSync, så den
    // kan unit-testes. Her logges kun resultatet.
    const db = getFirestore();
    const alle = await runScheduledSyncAll(db, FieldValue, Date.now());
    for (const out of alle) {
      if (out.fejl) console.error(`Synk ${out.gameId} (ignoreret):`, out.fejl);
      // Driftstatus KUN ved aktivitet eller fejl: 720 stille minutter i døgnet
      // må ikke koste 720 skrivninger — og sweep'et ER minut-synkens alarm
      // ("N facit som minut-synken IKKE nåede"), så et hjerteslag behøves ikke.
      if (out.fejl || out.pending > 0) {
        const st = statusSamler({ type: 'minut', gameId: out.gameId });
        if (out.fejl) st.fejl(out.fejl);
        else st.ok(`${out.pending} kampe i vinduet, ${out.updated} nye facit.`, { pending: out.pending, updated: out.updated });
        await skrivDriftStatus(st, db, { naesteForventetFoerMs: null });
      }
      // LIVE-PULSEN. Udebliver den, mens kampe viser en levende stilling, er
      // det den fejl, ingen kunne se BAGEFTER: minut-kortet overskrives af
      // næste grønne kørsel, så et 20-minutters udfald forsvandt sporløst.
      // Hele vagten bor i superligaSync (tjekLivePuls), fordi den her fil
      // ikke kan unit-testes — en tastefejl i betingelsen ville ellers lande
      // med grøn suite (TM-fund).
      await tjekLivePuls(db, FieldValue, { ud: { gameId: out.gameId, ...out } });

      if (out.pending === 0) continue; // stille minut: intet i gang, intet rørt
      console.log(`Synk ${out.gameId}: ${out.pending} kampe uden facit, ${out.updated} nye facit.`
        + (out.live ? ` ${out.live.live} i gang, ${out.live.skrevet} live-opdateringer`
          + `${out.live.sluttet ? `, slut: ${out.live.sluttede.join(', ')}` : ''}.` : '')
        + (out.standings ? ` Stilling ${out.standings.changed ? 'opdateret' : 'uændret'}.` : ''));
    }

    // MÅLSCORERE FOR DE KAMPE, DER NETOP FIK FACIT — ALLERSIDST.
    //
    // Efter driftlog og puls-vagt for ALLE spil, af samme grund som detaljerne
    // står sidst i sweep'et (se kampDetaljer.js' kontrakt): en fremmed kilde
    // må aldrig kunne koste facit, puls-alarmen eller næste spil. Rammer
    // livescore sit budget her, er alt ovenfor allerede gjort, og sweep'et
    // henter detaljerne om højst en time — som det gjorde før denne vej fandtes.
    //
    // Ingen egen driftlog-linje: minut-kortet er skrevet ovenfor (før dette
    // trin, med vilje), og sweep'ets kort viser efterslæbet ("N færdige kampe
    // mangler detaljer"), som nu normalt er 0. Kun 429/403 — kilden lukker os
    // ude, og det rammer naboerne gennem den delte NAT — er en alarm nu.
    for (const out of alle) {
      if (!out.rettede?.length) continue;
      const g = SYNCED_GAMES.find((x) => x.gameId === out.gameId);
      if (!g?.livescore) continue;
      try {
        const d = await efterFacitDetaljer(db, FieldValue, {
          gameId: g.gameId, livescore: g.livescore, rettede: out.rettede, budgetMs: EFTERFACIT_BUDGET_MS,
        });
        if (!d) continue;
        const linje = `Målscorere efter facit: ${d.skrevet} af ${out.rettede.length} hentet`
          + `${d.uenige ? `, ${d.uenige} uenige` : ''}${d.uparsede ? `, ${d.uparsede} uparsede` : ''}`
          + `${d.utilgaengelige ? `, ${d.utilgaengelige} utilgængelige` : ''}${d.ukendte ? `, ${d.ukendte} ukendte` : ''}.`;
        console.log(`Kampdetaljer ${g.gameId} efter facit: ${linje}`);
        // Minut-kortet skrives IGEN med linjen føjet til — efter trinnet, ikke
        // ved at bytte rækkefølgen (så ville en timeout her koste kortet).
        // Kun når kørslen ellers gik godt: et fejl-kort må ikke overskrives af
        // et grønt. Uden linjen kunne den hurtige vej fejle hver gang, uden at
        // nogen så det: sweep'et henter en time senere og melder "hentet"
        // (QC-fund). Advarsel, når kilden ikke gav noget for nogen af kampene.
        if (!out.fejl) {
          const st = statusSamler({ type: 'minut', gameId: g.gameId });
          const tekst = `${out.pending} kampe i vinduet, ${out.updated} nye facit. ${linje}`;
          const ekstra = { pending: out.pending, updated: out.updated, efterFacit: d.skrevet, efterFacitAf: out.rettede.length };
          if (d.afbrudt || (d.forsoegt > 0 && d.skrevet === 0)) st.advarsel(tekst, ekstra);
          else st.ok(tekst, ekstra);
          await skrivDriftStatus(st, db, { naesteForventetFoerMs: null });
        }
        if (d.afbrudt) {
          console.error(`Kampdetaljer ${g.gameId} efter facit: kilden lukkede os ude.`);
          await meldAlarm(db, FieldValue, {
            type: 'detaljerLukket',
            gameId: g.gameId,
            besked: `Livescore afviste ${g.gameId} med 429/403 lige efter facit. Synken stopper sig selv `
              + 'for ikke at ramme de andre kilder gennem den delte udgående IP. '
              + 'Sker det igen i næste kørsel, er vi rate-limited.',
          });
        }
      } catch (err) {
        console.warn(`Kampdetaljer ${out.gameId} efter facit fejlede (sweepet henter dem):`, err?.message || err);
      }
    }
  },
);

// Budget for målscorere lige efter facit — pr. spil, allersidst i minut-jobbet.
// En fjerdedel af minut-jobbets loft, delt ligeligt mellem spillene — AFLEDT
// som XG_BUDGET_MS/DETALJE_BUDGET_MS, ikke skrevet af: et tredje spil
// skrumper budgettet af sig selv i stedet for at tredoble halens værste
// tilfælde (Test Manager-fund). Med to spil er det 15 s pr. spil.
//
// Facit, live og stilling for to spil bruger typisk få sekunder, og efter-
// facit-vejen henter højst de 1–3 kampe, der lige blev afgjort. Målt
// (scripts/maal-livescore-detaljer.mjs, latens-tabellen, 2/9-2026): stage-
// kaldet 259 ms, et kampopslag ~130 ms median og 1,2 s maks. Budgettet binder
// derfor kun, når kilden hænger. Det REELLE vægur-loft er budgettet + 5 s:
// stage-kaldets timeout (10 s) ligger før første budget-tjek, og tjekket
// sidder i toppen af løkken, så ét kald-sæt (10 s) kan gå over (Security
// Reviewer målte 20.000 ms med simuleret ur ved 15 s). To spil: højst ~40 s.
const EFTERFACIT_BUDGET_MS = Math.floor((MINUT_TIMEOUT_S * 1000) / 4 / SYNCED_GAMES.length);

// syncSuperligaSweep — SIKKERHEDSNETTET.
//
// Minut-synken ser kun kampe inden for 2,5 time efter kickoff. Falder en kamp
// ud af det vindue uden facit, blev den før i tiden alligevel rettet op: den
// gamle synk skannede hele sæsonen hvert kvarter. Uden et sweep ville en
// forsinket kamp, et API-udfald i vinduet, en kamp der slutter efter midnat
// eller et forældet kickoff (ligaen flytter en kamp — vi har kun det seedede
// tidspunkt) betyde, at point ALDRIG blev afregnet. Tavst. Og puljebonussen
// kræver, at alle kampe har mål, så én strandet kamp blokerer hele
// sæsonafregningen.
//
// Timen kl. 2 er med, fordi netop dét scenarie — en kamp der bliver færdig
// efter midnat — ellers skulle vente fra 23.25 til 13.25 næste dag.
//
// Sweep'et henter samtidig den officielle stilling. API'et tæller ofte tabellen
// op et stykke tid EFTER resultatet, så den synk der følger med et nyt facit
// kan nå at hente en tabel, der endnu ikke er opdateret; timen efter fanger det.
// De to opgaver deler ét job, fordi de alligevel skal bruge samme fuldskanning.
//
// Pris: ÉT opslag af de 132 kampe pr. kørsel, 12 kørsler = ~1.600 læsninger i
// døgnet — mod de ~5.300, den gamle kvartersynk brugte alene. Alarmen deler
// opslaget med gen-synken og trækker de netop rettede kampe fra, i stedet for
// at hente et friskt billede.
// timeoutSeconds SKAL stå her. Uden den kører sweep'et på gen2-defaulten 60 s,
// og xG-trinnet alene kan bruge mere end det (30 kald à 10 s pr. spil). Rammer
// jobbet sit loft, dør HELE løkken: spil nr. 2 får hverken facit-synk, tabel
// eller strandet-alarm, og driftlog-kortet — der skrives sidst — bliver aldrig
// skrevet. Fejlen ville altså være tavs. 300 s er samme budget som
// syncSuperligaResultsNow, der laver den samme fuldskanning.
const SWEEP_TIMEOUT_S = 300;
// xG må højst bruge en tredjedel af budgettet, delt ligeligt mellem spillene,
// så facit, tabel og alarm har rigeligt tilbage. Afledt og ikke skrevet af:
// får SYNCED_GAMES et spil mere, skrumper budgettet af sig selv.
const XG_BUDGET_MS = Math.floor((SWEEP_TIMEOUT_S * 1000) / 3 / SYNCED_GAMES.length);
// Kampdetaljerne får HALVDELEN af xG's andel, og regnestykket står her — ikke
// som en literal i kampDetaljer.js med en kommentar, der påstår udledningen.
// Begge roller fandt den samme svaghed: tallet passede i dag og ville stille
// blive forkert ved et tredje spil, fordi kun xG's blev divideret.
const DETALJE_BUDGET_MS = Math.floor((SWEEP_TIMEOUT_S * 1000) / DETALJE_BUDGET_BROEK / SYNCED_GAMES.length);

exports.syncSuperligaSweep = onSchedule(
  {
    schedule: '25 2,13-23 * * *', timeZone: TZ, region: REGION,
    timeoutSeconds: SWEEP_TIMEOUT_S,
  },
  async () => {
    const db = getFirestore();
    // Sweep'et — og strandede-alarmen — løber over SAMME spil-liste som
    // minut-synken. Før dækkede alarmen kun Superligaen, så en strandet
    // PL-kamp ville have stået uafregnet uden en lyd.
    for (const g of SYNCED_GAMES) {
      // Object.hasOwn: se vagten i runScheduledSyncAll — et rått opslag kan
      // ramme Object.prototype.
      const provider = Object.hasOwn(PROVIDERS, g.provider) ? PROVIDERS[g.provider] : null;
      if (!provider) continue; // logget af minut-synken — sweep'et gentager ikke
      const opts = { gameId: g.gameId, provider, sync: g.sync };
      // ÉN samlet status pr. kørsel: sweep'et har tre uafhængige led, og
      // skrev hvert led sit eget niveau, ville det sidste (grønne) overskrive
      // det første (røde) — kortet stod grønt på en fejlet kørsel.
      const st = statusSamler({ type: 'sweep', gameId: g.gameId });
      let alle = null;
      let netopRettet = new Set();
      try {
        // Ét opslag, to formål: både gen-synken og alarmen bygger på det.
        alle = await allMatches(db, opts);
        const { checked, updated, rettede } = await syncResultsCore(db, FieldValue, { ...opts, only: alle });
        netopRettet = new Set(rettede);
        if (updated > 0) {
          console.warn(`Sweep ${g.gameId}: ${updated} facit som minut-synken IKKE nåede — undersøg hvorfor.`);
          st.advarsel(`${updated} facit, som minut-synken ikke nåede — undersøg hvorfor.`);
        } else {
          console.log(`Sweep ${g.gameId}: ${checked} færdige kampe, intet manglede.`);
          st.ok(`${checked} færdige kampe, intet manglede.`, { checked, updated });
        }
      } catch (err) {
        console.error(`Sweep ${g.gameId} fejlede (ignoreret):`, err?.message || err);
        st.fejl(`Resultat-synken fejlede: ${err?.message || err}`);
      }
      try {
        const { rows, changed } = await syncStandingsCore(db, FieldValue, opts);
        console.log(`Stilling ${g.gameId} (sweep): ${rows} hold, ${changed ? 'opdateret' : 'uændret'}.`);
        st.ok(`Tabellen: ${rows} hold, ${changed ? 'opdateret' : 'uændret'}.`, { rows });
      } catch (err) {
        console.error(`Stilling-synk ${g.gameId} fejlede (ignoreret):`, err?.message || err);
        st.fejl(`Tabel-synken fejlede: ${err?.message || err}`);
      }
      // Alarmen: kampe der for længst er begyndt og stadig mangler facit. Uden
      // den ser "ingen kampe i gang" og "kampen bliver aldrig afregnet" ens ud
      // i loggen. Bygger på listen ovenfor — den er hentet FØR gen-synken, så
      // en kamp, sweep'et lige har reddet, ville ellers blive meldt strandet.
      try {
        if (alle) {
          // Kampene, sweep'et lige har reddet, er ikke strandede — de står bare
          // stadig uden facit i listen fra før gen-synken.
          const strandede = strandedMatches(
            alle.filter((m) => !netopRettet.has(m.id)), Date.now(),
          );
          if (strandede.length > 0) {
            console.error(`${g.gameId}: kampe UDEN facit længe efter kickoff — point er ikke afregnet:`,
              strandede.map((m) => m.id).join(', '));
            st.fejl(`${strandede.length} kampe uden facit længe efter kickoff — point er ikke afregnet.`);
            for (const m of strandede) {
              await meldAlarm(db, FieldValue, {
                type: 'strandet', gameId: g.gameId, kampId: m.id,
                // Remediet står I alarmen — en alarm uden næste skridt er en
                // blindgyde. Teksten bor i driftlog.js, hvor den kan testes
                // på indhold (index.js kan ikke unit-testes).
                besked: strandetBesked(m.id),
              });
            }
          }
          // Auto-luk: en strandet kamp, der siden fik facit, er løst — ellers
          // hober døde røde kort sig op, og ejeren lærer at ignorere fladen.
          await loesDriftAlarmer(db, FieldValue, {
            type: 'strandet', gameId: g.gameId,
            aktuelleKampIds: strandede.map((m) => m.id),
          });
        }
      } catch (err) {
        console.error(`Kunne ikke tjekke for strandede kampe i ${g.gameId} (ignoreret):`, err?.message || err);
        st.fejl(`Strandede-tjekket fejlede: ${err?.message || err}`);
      }
      // xG hentes HER og ikke i minut-synken. Kontrakten i syncProviders.js
      // siger hvorfor: tallet koster ét kald pr. kamp, og hentFaerdige kaster
      // ved timeout med en slugt fejl — xG i minut-synken kunne altså tavst
      // standse facit-synken midt på en kampaften.
      //
      // Og den står SIDST i løkkekroppen med vilje. Første udgave lagde den
      // før tabellen og strandede-alarmen, og dermed var den fejl, der lige
      // var flyttet ud af minut-synken, flyttet oven på sikkerhedsnettet i
      // stedet: en langsom kilde kunne bruge budgettet op, så platformen
      // dræbte invocation'en, og hverken alarm, tabel eller driftlog-kort
      // nåede at køre — heller ikke for det NÆSTE spil i løkken. En
      // platform-timeout kan ikke fanges af try/catch nedenfor.
      //
      // `alle` er null, hvis kampopslaget fejlede tidligere i kørslen. Så
      // springes xG over: syncXgCore ville ellers lave sit EGET fulde opslag
      // netop i den situation, hvor Firestore allerede haltede. Det koster
      // intet at vente — xG er selvhelende over døgnets kørsler.
      //
      // Kørslen er OGSÅ bagfyldningen: en kamp fra i august mangler xG på
      // præcis samme måde som en fra i aftes, og loftet gør efterslæbet til
      // nogle kørsler i stedet for én timeout. Tallet `manglede` skal gå mod
      // nul — står det stille over flere kørsler, er kilden holdt op med at
      // levere, og DET er, hvad linjen her gør synligt.
      try {
        if (!alle) throw new Error('kamplisten manglede i denne kørsel');
        const { manglede, skrevet } = await syncXgCore(
          db, FieldValue, { ...opts, only: alle, budgetMs: XG_BUDGET_MS },
        );
        if (manglede === 0) {
          console.log(`xG ${g.gameId}: alle færdige kampe har xG.`);
          st.ok('xG: alle færdige kampe har tal.', { xgMangler: 0 });
        } else if (skrevet > 0) {
          console.log(`xG ${g.gameId}: ${skrevet} hentet, ${manglede - skrevet} tilbage.`);
          st.ok(`xG: ${skrevet} hentet, ${manglede - skrevet} færdige kampe mangler endnu.`,
            { xgMangler: manglede - skrevet });
        } else {
          // Kampe mangler, og INGEN blev hentet. Det er den tavse fejl, linjen
          // findes for: kilden svarer ikke, eller den er holdt op med at give
          // xG for netop de kampe.
          console.warn(`xG ${g.gameId}: ${manglede} færdige kampe mangler xG, ingen hentet.`);
          st.advarsel(`xG: ${manglede} færdige kampe mangler tal, og ingen blev hentet.`,
            { xgMangler: manglede });
        }
      } catch (err) {
        console.error(`xG-synk ${g.gameId} fejlede (ignoreret):`, err?.message || err);
        st.fejl(`xG-synken fejlede: ${err?.message || err}`);
      }

      // Kampdetaljer (halvleg, målscorere, tilskuertal) fra livescore. Står
      // ALLERSIDST, efter xG, af samme grund som xG står efter alarmen: den
      // er den dyreste og mest fremmede del af kørslen, og en platform-timeout
      // kan ikke fanges af try/catch. Hvad der ligger FØR den, er allerede
      // gjort; hvad der lå efter, ville gå tabt for både dette og næste spil.
      //
      // Kilden er et browser-endpoint uden aftale bag. Derfor to vagter, der
      // begge er synlige i linjen herunder: et kald-loft (kvote) og en
      // kredsløbsafbryder på 429/403 (delt NAT — bliver vi lukket ude, rammer
      // det nabo-synken, som intet har med livescore at gøre).
      try {
        if (!g.livescore) throw new Error('SPRING_OVER');
        if (!alle) throw new Error('kamplisten manglede i denne kørsel');
        // Eid-kortlægning af hele kamplisten og detaljerne i ÉT kald med ÉN
        // vagt om kredsløbsafbryderen — se sweepKampDetaljer. Kortlægningen
        // lå før som et separat kald her, og et 429 dér gik forbi afbrudt-
        // grenen herunder til den generiske fejl-linje: ingen alarm.
        const d = await sweepKampDetaljer(db, FieldValue, {
          gameId: g.gameId, livescore: g.livescore, only: alle, budgetMs: DETALJE_BUDGET_MS,
        });
        if (d.eid?.manglede) console.log(`Eid ${g.gameId}: ${d.eid.skrevet} af ${d.eid.manglede} kortlagt, ${d.eid.ukendte} ukendte.`);
        const tilbage = d.manglede - d.skrevet;
        if (d.afbrudt) {
          // SYSTEMISK: kilden har lukket os ude. Det er en alarm, fordi den
          // ikke retter sig selv, og fordi den kan ramme naboerne.
          console.error(`Kampdetaljer ${g.gameId}: kilden lukkede os ude.`);
          st.fejl('Kampdetaljer: kilden afviste os (429/403) — kørslen blev afbrudt.');
          await meldAlarm(db, FieldValue, {
            type: 'detaljerLukket',
            gameId: g.gameId,
            besked: `Livescore afviste ${g.gameId} med 429/403. Synken stopper sig selv `
              + 'for ikke at ramme de andre kilder gennem den delte udgående IP. '
              + 'Sker det igen i næste kørsel, er vi rate-limited.',
          });
        } else if (d.manglede === 0) {
          console.log(`Kampdetaljer ${g.gameId}: alle færdige kampe har detaljer.`);
          st.ok('Kampdetaljer: alle færdige kampe har halvleg og målscorere.', { detaljerMangler: 0 });
        } else if (d.utilgaengelige > 0 && d.skrevet === 0 && d.uenige === 0 && d.uparsede === 0) {
          // KILDEN SVAREDE IKKE. Det er en ADVARSEL, ikke en alarm: en times
          // nedetid hos livescore retter sig selv, og kørslen prøver igen om
          // en time. Grenen står FØR afvist-alarmen, fordi den ellers ville
          // fyre "kilden har skiftet form — se kampDetaljer.js" og sende
          // ejeren på kodejagt under et helt almindeligt udfald.
          console.warn(`Kampdetaljer ${g.gameId}: kilden svarede ikke på ${d.utilgaengelige} kampe.`);
          st.advarsel(`Kampdetaljer: kilden svarede ikke (${d.utilgaengelige} kampe). Prøves igen ved næste kørsel.`,
            { detaljerMangler: tilbage });
        } else if (d.forsoegt > 0 && d.skrevet === 0 && d.ukendte === 0 && d.utilgaengelige === 0) {
          // ALT blev afvist, og kilden SVAREDE. Enten har den skiftet form,
          // eller vores parsning er drevet fra den — begge dele er systemiske.
          console.error(`Kampdetaljer ${g.gameId}: alle ${d.forsoegt} forsøg blev afvist.`);
          st.fejl(`Kampdetaljer: alle ${d.forsoegt} forsøgte kampe blev afvist.`,
            { detaljerMangler: tilbage });
          await meldAlarm(db, FieldValue, {
            type: 'detaljerAfvist',
            gameId: g.gameId,
            besked: `Ingen af ${d.forsoegt} kampe i ${g.gameId} kunne læses fra livescore `
              + `(${d.uenige} uenige om facit, ${d.uparsede} kunne ikke parses). `
              + 'Kilden har sandsynligvis skiftet form — se kampDetaljer.js.',
          });
        } else if (d.valgte > 0 && d.ukendte === d.valgte) {
          // INGEN nøglematch overhovedet. Kortlægningen i livescoreHold.js er
          // død — det er præcis dét, den fil findes for at fange.
          //
          // Sammenligningen er mod `valgte` og IKKE mod `manglede`: `manglede`
          // er hele efterslæbet, og loftet slipper kun 8 igennem ad gangen, så
          // `ukendte === manglede` ville aldrig være sand ved et stort
          // efterslæb — altså præcis når man mest har brug for at høre det.
          console.error(`Kampdetaljer ${g.gameId}: nul af ${d.valgte} forsøgte kampe kunne kobles.`);
          st.fejl(`Kampdetaljer: ingen af ${d.valgte} kampe kunne kobles til kilden.`,
            { detaljerMangler: tilbage });
          await meldAlarm(db, FieldValue, {
            type: 'detaljerKobling',
            gameId: g.gameId,
            besked: `Ingen af ${d.manglede} kampe i ${g.gameId} fandt sin modpart hos livescore. `
              + 'Holdkoderne eller kickoff-tiderne er drevet — kør '
              + 'scripts/maal-livescore.mjs og ret functions-platform/livescoreHold.js.',
          });
        } else {
          // Den almindelige linje. `uenige` og `uparsede` står HVER FOR SIG:
          // de har hver sin remedie (et menneske skal se på kampen / vores
          // parsning er mangelfuld), og ét fælles tal kunne ikke sige hvilken.
          // De er ADVARSLER, ikke alarmer: en uenighed kan være permanent og
          // legitim (en afbrudt kamp med tildelt resultat), og et rødt kort,
          // der aldrig kan lukkes, lærer ejeren at ignorere fladen.
          const dele = [`${d.skrevet} hentet`, `${tilbage} tilbage`];
          if (d.uenige) dele.push(`${d.uenige} uenige om facit`);
          if (d.uparsede) dele.push(`${d.uparsede} kunne ikke parses`);
          if (d.utilgaengelige) dele.push(`${d.utilgaengelige} hvor kilden ikke svarede`);
          if (d.ukendte) dele.push(`${d.ukendte} uden kobling`);
          const besked = `Kampdetaljer: ${dele.join(', ')}.`;
          console.log(`Kampdetaljer ${g.gameId}: ${dele.join(', ')}.`);
          // Reglen bor i kampDetaljer.js, ikke her. Den stod inline og var
          // derfor udaekket — og forkert: `ukendte` manglede, saa 33 skrevne
          // og 1 ukoblet gav GROENT kort, mens knappen for samme tal sagde
          // roedt. Quality Controls fund efter udrulningen.
          st[detaljeNiveau(d)](besked, { detaljerMangler: tilbage });
        }
      } catch (err) {
        if (err?.message === 'SPRING_OVER') {
          // Spillet har ikke evnen. Ikke en fejl, og ikke et kort — et spil
          // uden kilden skal ikke stå med en tom rubrik resten af sæsonen.
        } else {
          console.error(`Kampdetalje-synk ${g.gameId} fejlede (ignoreret):`, err?.message || err);
          st.fejl(`Kampdetalje-synken fejlede: ${err?.message || err}`);
        }
      }

      await skrivDriftStatus(st, db, {
        naesteForventetFoerMs: () => naesteKoerselFoerMs(Date.now(), { timer: SWEEP_TIMER }),
      });
    }
  },
);

// syncGameKickoffs — DAGLIG rettelse af kamptider fra kilden (alle spil, hvis
// provider kan levere dem — nu både Premier League og Superligaen). Ligaerne
// flytter kampe forud (tv-aftaler), og kickoff ER tip-deadlinen. Én gang i
// døgnet er nok: minut-kadence ville være spild på ændringer, der meldes uger
// før kampdag. Kl. 6.10 dansk tid: før dagens første tips, efter nattens API-
// opdateringer. Fejler et spil, fortsætter de andre — og fejlen står i loggen.
// En kamp, hvis FORKERTE tid allerede er passeret, kan synken ikke flytte
// (genåbnings-vagten) — den slags rettes ad seed-vejen (drift.md).
exports.syncGameKickoffs = onSchedule(
  { schedule: '10 6 * * *', timeZone: TZ, region: REGION },
  async () => {
    const db = getFirestore();
    for (const g of SYNCED_GAMES) {
      const provider = Object.hasOwn(PROVIDERS, g.provider) ? PROVIDERS[g.provider] : null;
      if (!provider) continue;
      if (typeof provider.hentKickoffs !== 'function') continue; // provider uden kickoff-kilde
      const st = statusSamler({ type: 'kickoff', gameId: g.gameId });
      try {
        const ud = await syncKickoffsCore(db, FieldValue, {
          gameId: g.gameId, provider, sync: g.sync, dryRun: false,
        });
        console.log(`Kickoff-synk ${g.gameId}: ${ud.aendringer.length} rettet, ${ud.spillet} spillede urørt`
          + (ud.mangler.length ? `, MANGLER dokument: ${ud.mangler.join(', ')}` : '')
          + (ud.genaabninger.length ? `, GENÅBNING afvist: ${ud.genaabninger.join(', ')}` : '')
          + (ud.snart.length ? `, <48t-alarm: ${ud.snart.join(', ')}` : '')
          + (ud.puljeLock ? `, pulje-deadline (runde ${ud.puljeLock.runde}) sat til ${new Date(ud.puljeLock.tilMs).toISOString()}` : '')
          + (ud.puljeLockAfvist ? `, pulje-deadline GENÅBNING afvist (runde ${ud.puljeLockAfvist.runde})` : '') + '.');
        st.ok(`${ud.aendringer.length} kamptider rettet, ${ud.spillet} spillede urørt.`,
          { rettet: ud.aendringer.length, spillet: ud.spillet });
        if (ud.mangler.length) st.fejl(`${ud.mangler.length} kilde-kampe uden dokument: ${ud.mangler.join(', ')}`);
        // Alarmer, der kræver et menneske. Genåbning/<48t løser ALDRIG sig
        // selv — de bliver stående til ejerens kvittering. Mangler auto-lukkes,
        // når kampen dukker op (eller kilden holder op med at melde den).
        for (const id of ud.genaabninger) {
          await meldAlarm(db, FieldValue, {
            type: 'genaabning', gameId: g.gameId, kampId: id, kraeverKvittering: true,
            besked: `Kilden ville flytte en PASSERET kickoff til fremtiden på ${id} — afvist. Ægte genopsat kamp rettes ad seed-vejen (drift.md).`,
          });
        }
        for (const id of ud.snart) {
          await meldAlarm(db, FieldValue, {
            type: 'kickoff48t', gameId: g.gameId, kampId: id, kraeverKvittering: true,
            besked: `${id} er flyttet til under 48 timer ude — tjek om nogen har tippet med facit i hånden.`,
          });
        }
        // Pulje-deadlinen sidder fast: den kan ikke rettes til rundens rigtige
        // tid, fordi den nuværende værdi allerede er passeret/eksponeret. Løser
        // ALDRIG sig selv — kræver et menneske (typisk en placeholder-dato sat
        // for tidligt i Spil-tidsplan). Uden denne alarm ville puljen stå med en
        // forkert deadline i tavshed.
        if (ud.puljeLockAfvist) {
          await meldAlarm(db, FieldValue, {
            type: 'puljeLockGenaabning', gameId: g.gameId, kraeverKvittering: true,
            besked: `Pulje-deadlinen (runde ${ud.puljeLockAfvist.runde}) kunne ikke sættes til rundens tidligste kickoff, fordi den nuværende deadline allerede er passeret — en genåbning ville vise alles pulje-tip igen. Ret puljeLockAt i Firebase-konsollen til den rigtige runde-dato, eller fjern en for tidligt sat placeholder-dato.`,
          });
        }
        for (const id of ud.mangler) {
          await meldAlarm(db, FieldValue, {
            type: 'mangler', gameId: g.gameId, kampId: String(id),
            besked: `Kilden melder en kamp (${id}) i spillets runder, som ikke findes som dokument — er den aldrig seedet?`,
          });
        }
        await loesDriftAlarmer(db, FieldValue, {
          type: 'mangler', gameId: g.gameId, aktuelleKampIds: ud.mangler.map(String),
        });
      } catch (err) {
        console.error(`Kickoff-synk ${g.gameId} fejlede (ignoreret):`, err?.message || err);
        st.fejl(`Kørslen fejlede: ${err?.message || err}`);
      }
      // Dagligt skema kl. 6.10 → næste kørsel inden 26 timer.
      await skrivDriftStatus(st, db, { naesteForventetFoerMs: Date.now() + 26 * 3600 * 1000 });
    }
  },
);

// syncGameKickoffsNow — manuel udløsning (admin/owner) med TØR-KØRSEL som
// default: kun { dryRun: false } skriver. Det er "start med vilje"-vejen —
// og forhåndsvisningen, som drift.md kræver før produktionsskrivninger.
// timeoutSeconds matcher klientens timeout (adminActions.js: 120000 ms) —
// v2-defaulten er 60 s, så uden den dræbte serveren kaldet, mens klienten
// stadig ventede, og admin fik en rå intern fejl.
exports.syncGameKickoffsNow = onCall({ region: REGION, timeoutSeconds: 120 }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Log ind.');
  const db = getFirestore();
  const userSnap = await db.collection('users').doc(uid).get();
  const role = userSnap.exists ? userSnap.data().role : null;
  if (role !== 'owner' && role !== 'globalAdmin') {
    throw new HttpsError('permission-denied', 'Kun admin kan rette kamptider.');
  }
  const gameId = request.data?.gameId || 'pl2627-efteraar';
  const g = SYNCED_GAMES.find((x) => x.gameId === gameId);
  if (!g || !Object.hasOwn(PROVIDERS, g.provider)) {
    throw new HttpsError('invalid-argument', `Ingen synk-provider for "${gameId}".`);
  }
  const ud = await syncKickoffsCore(db, FieldValue, {
    gameId: g.gameId, provider: PROVIDERS[g.provider], sync: g.sync,
    dryRun: dryRunFraKald(request.data),
  });
  if (!ud.understoettet) {
    throw new HttpsError('failed-precondition', `${gameId}s kilde kan ikke levere kamptider — brug seedKickoffs-vejen.`);
  }
  return { gameId: g.gameId, ...ud };
});

// kvitterDriftAlarm — ejeren kvitterer en alarm, der ikke kan løse sig selv
// (genåbning, <48t-flytning). Kvittering går gennem en callable og ikke en
// skrive-regel: "serveren er eneste autoritet", og en snæver regel på
// kvitteretAt ville være endnu en vagt at holde styr på. Badget i Admin-
// navigationen drives af UKVITTEREDE alarmer — kvitteringen er den eneste
// måde at slukke det på, så en alarm aldrig forsvinder, før et menneske SÅ den.
exports.kvitterDriftAlarm = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Log ind.');
  const db = getFirestore();
  const userSnap = await db.collection('users').doc(uid).get();
  const role = userSnap.exists ? userSnap.data().role : null;
  if (role !== 'owner' && role !== 'globalAdmin') {
    throw new HttpsError('permission-denied', 'Kun admin kan kvittere driftalarmer.');
  }
  // Whitelist, ikke blacklist (Security-anbefaling): '.'/'..'/'__proto__'
  // slap forbi et rent '/'-tjek og gav en rå SDK-fejl i stedet for en dansk.
  const alarmId = String(request.data?.alarmId || '');
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(alarmId)) {
    throw new HttpsError('invalid-argument', 'Ugyldigt alarm-id.');
  }
  const ref = db.collection('driftAlarmer').doc(alarmId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Alarmen findes ikke.');
  await ref.set({ kvitteretAt: Date.now(), kvitteretAf: uid }, { merge: true });
  return { ok: true };
});

// syncSuperligaResultsNow — manuel udløsning (admin/owner). Til test/tvungen
// synk. Navnet er historisk (deployet under det); den synker et VALGFRIT spil
// fra SYNCED_GAMES — uden gameId Superligaen, som den altid har gjort.
// Gennemgår hele sæsonen (ingen `only`), så den også fanger rettede facit på
// gamle kampe. Det er den "start med vilje"-vej, reglen om nyt maskineri
// kræver — også for et spil, hvis første kamp endnu ikke er spillet.
// timeoutSeconds: hele sæsonen skannes + standings — samme budget som
// repriceGameOdds, og samme tal som klientens timeout (adminActions.js).
exports.syncSuperligaResultsNow = onCall({ region: REGION, timeoutSeconds: 300 }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Log ind.');
  const db = getFirestore();
  const userSnap = await db.collection('users').doc(uid).get();
  const role = userSnap.exists ? userSnap.data().role : null;
  if (role !== 'owner' && role !== 'globalAdmin') {
    throw new HttpsError('permission-denied', 'Kun admin kan synke resultater.');
  }
  const gameId = request.data?.gameId || 'superliga2627';
  // Kun spil fra den statiske liste: et frit gameId ville ellers kunne rette
  // et vilkårligt spils kampe mod den forkerte kilde.
  const g = SYNCED_GAMES.find((x) => x.gameId === gameId);
  // Object.hasOwn: se vagten i runScheduledSyncAll — et rått opslag kan
  // ramme Object.prototype.
  if (!g || !Object.hasOwn(PROVIDERS, g.provider)) {
    throw new HttpsError('invalid-argument', `Ingen synk-provider for "${gameId}".`);
  }
  const opts = { gameId: g.gameId, provider: PROVIDERS[g.provider], sync: g.sync };
  const results = await syncResultsCore(db, FieldValue, opts);
  const standings = await syncStandingsCore(db, FieldValue, opts).catch((e) => ({ error: e?.message }));
  return { gameId: g.gameId, ...results, standings };
});

// ---------------------------------------------------------------------------
// syncGameKampdetaljerNu — MANUEL udløser for kampdetalje-synken.
//
// Findes, fordi et maskineri, der kun kan startes af skemaet, ikke er færdigt
// (CLAUDE.md). Sweep'et kører 12 gange i døgnet, og uden knappen ville enhver
// rettelse i parsningen ligge død, til en vilkårlig kørsel tilfældigvis kom
// forbi — samme timing-øvelse som recomputeSeasonElo før den fik sin knap.
//
// INGEN TØR-KØRSEL, og det er en beslutning, ikke en forglemmelse. Husets
// regel er tør-kørsel FØRST på alt, der skriver i produktionsdata, fordi en
// forkert skrivning koster point. Denne kan ikke: forbudslisten i
// kampDetaljer.js udelukker `result`, `homeGoals`, `awayGoals` og `kickoff`,
// og `recomputeGameMatch` returnerer tidligt, når `result` er uændret — så
// hverken point, Elo eller Runde-Bot kan udløses. Det, der skrives, er
// felter, ingen anden kode læser til at regne med.
//
// timeoutSeconds skal matche klientens egen timeout. Uenige timeouts er fundet
// forkert to gange før: brugeren ser en fejl, mens serveren skriver videre.
// ---------------------------------------------------------------------------
exports.syncGameKampdetaljerNu = onCall({ region: REGION, timeoutSeconds: 120 }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Log ind.');
  const db = getFirestore();
  const userSnap = await db.collection('users').doc(uid).get();
  const role = userSnap.exists ? userSnap.data().role : null;
  if (role !== 'owner' && role !== 'globalAdmin') {
    throw new HttpsError('permission-denied', 'Kun admin kan synke kampdetaljer.');
  }
  const gameId = request.data?.gameId;
  // Kun spil fra den STATISKE liste: et frit gameId ville ellers kunne rette
  // et vilkaarligt spils kampe mod den forkerte liga hos kilden.
  const g = SYNCED_GAMES.find((x) => x.gameId === gameId);
  if (!g || !g.livescore) {
    throw new HttpsError('invalid-argument', `"${gameId}" har ikke kampdetalje-synk.`);
  }
  const alle = await allMatches(db, { gameId: g.gameId });
  // Budgettet er knappens eget, ikke sweep'ets: her er der 120 s at tage af,
  // og den, der trykker, staar og venter. Loftet haeves tilsvarende, saa en
  // bagfyldning kan drives i haanden i stedet for at vente 12 koersler.
  return syncKampDetaljerCore(db, FieldValue, {
    gameId: g.gameId, livescore: g.livescore, only: alle, budgetMs: 90000, loft: 40,
  });
});

// ---------------------------------------------------------------------------
// setGameChance — SERVEREN ejer chanceStake. Hele reglen ("én ⚡ pr. runde",
// "ikke på en kamp i gang") bor i chanceVagt.js, fordi rules ikke kan køre
// forespørgsler. Klienten skriver stadig selv sit 1X2-valg; kun chancen går
// denne vej. Fejltabellen bor sammen med de throws, den oversætter.
// ---------------------------------------------------------------------------
exports.setGameChance = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid;
  const { gameId, matchId, stake } = request.data || {};
  try {
    return await setChanceCore(getFirestore(), FieldValue, { uid, gameId, matchId, stake });
  } catch (err) {
    const [httpCode, msg] = chanceFejl(err);
    throw new HttpsError(httpCode, msg);
  }
});

// redeemGameLeagueCode — deltag i en privat mini-liga via invitationskode.
// Fejltabellen bor i gameLeagues.js, sammen med de throws den oversætter.
exports.redeemGameLeagueCode = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid;
  const { gameId, code } = request.data || {};
  try {
    return await redeemLeagueCodeCore(getFirestore(), FieldValue, { uid, gameId, code });
  } catch (err) {
    const [httpCode, msg] = LEAGUE_ERR[err.message] || ['internal', 'Kunne ikke deltage i ligaen.'];
    throw new HttpsError(httpCode, msg);
  }
});

// ---------------------------------------------------------------------------
// Liga-medlemmer, admin (#61). TO callables, fordi BEGGE veje er lukkede for
// klienten: firestore.rules:952 tillader kun at LÆSE en spil-liga, hvis man
// selv er medlem (ingen admin-gren, modsat top-niveau leagues:344), og
// rules:979-995 tillader kun ejer-omdøbning med medlemmer uændret eller at et
// medlem fjerner præcis sig selv. Reglerne åbnes IKKE — de er det eneste, der
// forhindrer et medlem i at skrive en ny medlemsliste og lukke fremmede ind.
// ---------------------------------------------------------------------------
exports.adminHentLigaMedlemmer = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid;
  const { gameId } = request.data || {};
  try {
    return await hentLigaMedlemmer(getFirestore(), { uid, gameId });
  } catch (err) {
    const [httpCode, msg] = LEAGUE_ERR[err.message] || ['internal', 'Kunne ikke hente ligaerne.'];
    throw new HttpsError(httpCode, msg);
  }
});

exports.adminSaetLigaMedlem = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid;
  const { gameId, leagueId, maalUid, medlem } = request.data || {};
  try {
    // `medlem === true` alene ville gøre ENHVER anden værdi til en fjernelse:
    // et udeladt felt, 'false', 0, {} — alt havde meldt offeret ud uden fejl.
    // Fladen sender altid en boolean, så det er ikke nåbart i dag, men
    // destruktiv-som-standard er den forkerte retning at fejle i for et felt,
    // der afgør hvem der ser hvis tips.
    if (medlem !== true && medlem !== false) throw new Error('bad-code');
    const r = await saetLigaMedlemCore(getFirestore(), FieldValue, {
      uid, gameId, leagueId, maalUid, medlem,
    });
    // Medlemskab afgør, hvem der ser hvis tips, så hver ÆNDRING skal kunne
    // spores til en person. Ikke et driftlog-kort: funktionen svarer klienten
    // og kan derfor ikke fejle tavst — men en tilføjelse afslører historik
    // begge veje, og så skal der være et spor efter hvem der gjorde det.
    if (r.aendret) {
      console.log(`Liga-medlem ${r.medlem ? 'TILFOEJET' : 'FJERNET'}: `
        + `spil=${gameId} liga=${leagueId} maal=${maalUid} af=${uid}`);
    }
    return r;
  } catch (err) {
    const [httpCode, msg] = LEAGUE_ERR[err.message] || ['internal', 'Kunne ikke ændre medlemskabet.'];
    throw new HttpsError(httpCode, msg);
  }
});

// ---------------------------------------------------------------------------
// adminSendPasswordReset — KUN ejeren: generér et nulstillingslink server-side
// og send det via platformens egen SMTP (tip@vejleaa.dk). Platform-globalt
// (gælder brugeren, ikke ét spil) — nyttigt for de migrerede VM-brugere med
// kodeord. No-op'er pænt uden SMTP_PASSWORD (returnerer stadig linket).
// ---------------------------------------------------------------------------
exports.adminSendPasswordReset = onCall(
  { region: REGION, secrets: [SMTP_PASSWORD] },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Du skal være logget ind.');
    const db = getFirestore();
    const callerSnap = await db.collection('users').doc(request.auth.uid).get();
    if (callerSnap.data()?.role !== 'owner') {
      throw new HttpsError('permission-denied', 'Kun ejeren kan sende nulstillingslink.');
    }

    const uid = request.data?.uid;
    if (!uid) throw new HttpsError('invalid-argument', 'Mangler bruger-id.');

    let userRecord;
    try {
      userRecord = await getAuth().getUser(uid);
    } catch {
      throw new HttpsError('not-found', 'Brugeren findes ikke i Authentication.');
    }
    const email = userRecord.email;
    if (!email) throw new HttpsError('failed-precondition', 'Brugeren har ingen e-mailadresse.');

    const link = await getAuth().generatePasswordResetLink(email);

    const transporter = buildTransport(SMTP_PASSWORD.value());
    let sent = false;
    if (transporter) {
      const name = escapeHtml(userRecord.displayName || 'spiller');
      const html = `
        <p>Hej ${name},</p>
        <p>Du (eller en administrator) har bedt om at nulstille din adgangskode til
        <strong>Vejleaa Tip</strong>. Klik på linket nedenfor for at vælge en ny:</p>
        <p><a href="${link}">Nulstil min adgangskode</a></p>
        <p>Hvis knappen ikke virker, kopiér dette link ind i din browser:<br>
        <span style="word-break:break-all">${link}</span></p>
        <p>Bagefter kan du logge ind på <a href="${APP_URL}">${APP_URL}</a>.</p>
        <p>Mvh. Vejleaa Tip</p>`;
      await sendEmail(db, transporter, { to: email, subject: 'Nulstil din adgangskode – Vejleaa Tip', html, type: 'password-reset' });
      sent = true;
    }

    return { ok: true, email, sent, link };
  },
);

// --- Fælles: kræv owner/globalAdmin --------------------------------------
async function requireAdmin(db, request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Du skal være logget ind.');
  const snap = await db.collection('users').doc(request.auth.uid).get();
  const role = snap.data()?.role;
  if (role !== 'owner' && role !== 'globalAdmin') {
    throw new HttpsError('permission-denied', 'Kun owner/global admin har adgang.');
  }
  return snap.data();
}

// ---------------------------------------------------------------------------
// sendBroadcastEmail — masseudsendelse (platform-globalt). Fritekst-emne + body
// til en liste modtagere. Logges som 'broadcast'. No-op-sikker uden SMTP.
// ---------------------------------------------------------------------------
exports.sendBroadcastEmail = onCall(
  { region: REGION, secrets: [SMTP_PASSWORD] },
  async (request) => {
    const db = getFirestore();
    await requireAdmin(db, request);

    const subject = String(request.data?.subject || '').trim();
    const body = String(request.data?.body || '').trim();
    const raw = Array.isArray(request.data?.recipients) ? request.data.recipients : [];
    if (!subject) throw new HttpsError('invalid-argument', 'Emne mangler.');
    if (!body) throw new HttpsError('invalid-argument', 'Beskeden er tom.');

    const seen = new Set();
    const valid = [];
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (const r of raw) {
      const e = String(r || '').trim();
      if (!e) continue;
      const key = e.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      if (re.test(e)) valid.push(e);
    }
    if (valid.length === 0) throw new HttpsError('invalid-argument', 'Ingen gyldige modtagere.');
    if (valid.length > 300) throw new HttpsError('invalid-argument', 'For mange modtagere (max 300).');

    const transporter = buildTransport(SMTP_PASSWORD.value());
    if (!transporter) throw new HttpsError('failed-precondition', 'SMTP_PASSWORD er ikke sat endnu.');

    // Invitations-skabelon (grøn hero + salgstale + gul tilmeldingsknap).
    // Kræver et joinLink på vores eget domæne, så knappen aldrig kan pege ud
    // af huset. SKABELONEN FØLGER SPILLET: klienten sender gameId, og profilen
    // (liganavn, pulje-kapitel, billeder) afledes af spil-dokumentet — den
    // første udgave var hardcodet til Superligaen, så PL-invitationen lovede
    // et pulje-tip, spillet ikke har. 'superliga' accepteres stadig som
    // skabelon-navn: en åben, gammel klient sender den uden gameId og skal
    // blive ved med at få den gamle mail.
    let html;
    const template = request.data?.template;
    if (template === 'invitation' || template === 'superliga') {
      const joinLink = String(request.data?.joinLink || '').trim();
      const gameId = String(request.data?.gameId || '').trim();
      // Én vagt, ét sted: ren funktion i inviteTemplate.js, mutationstestet.
      const fejl = invitationsFejl({ template, joinLink, gameId, appUrl: APP_URL });
      if (fejl) throw new HttpsError('invalid-argument', fejl);
      let game = null;
      if (gameId) {
        const snap = await db.collection('games').doc(gameId).get();
        if (!snap.exists) throw new HttpsError('invalid-argument', 'Ukendt spil til invitationen.');
        game = snap.data();
      }
      html = invitationsHtml({
        liga: ligaProfil(game),
        intro: body, joinLink,
        leagueName: String(request.data?.leagueName || '').slice(0, 60),
        appUrl: APP_URL,
      });
    } else {
      html = broadcastHtml(body);
    }
    let sent = 0;
    const failed = [];
    for (const to of valid) {
      try {
        await sendEmail(db, transporter, { to, subject, html, type: 'broadcast' });
        sent += 1;
      } catch (e) {
        failed.push(to);
        console.error('broadcast: kunne ikke sende til', to, e && e.message);
      }
    }
    return { success: true, sent, failed };
  },
);

// ---------------------------------------------------------------------------
// uploadBroadcastImage — admin uploader et billede til brug i Send mail.
// Går gennem en callable (IKKE en klient-Storage-write), fordi Storage-regler
// ikke kan læse Firestore-roller: adgangsbeslutningen er `requireAdmin` HER,
// ét sted. Serveren skriver via Admin SDK til broadcast/{unikt}.{ext} og
// returnerer en public download-URL. UNIKT navn pr. upload — Gmails billed-
// proxy cacher pr. URL, så to billeder må aldrig dele URL.
// ---------------------------------------------------------------------------
exports.uploadBroadcastImage = onCall({ region: REGION }, async (request) => {
  const db = getFirestore();
  await requireAdmin(db, request);

  const contentType = String(request.data?.contentType || '').toLowerCase();
  // Klienten sender base64 (evt. med data:-præfiks). Afkod og MÅL på de rå
  // bytes — payloadens strengelængde er ikke filstørrelsen.
  const b64 = String(request.data?.data || '').replace(/^data:[^;,]*;base64,/, '');
  // Buffer.from kaster IKKE på ugyldig base64 (giver bare en kortere/tom
  // buffer); et tomt eller ugyldigt billede fanges af validerBroadcastBillede.
  const buffer = Buffer.from(b64, 'base64');
  const check = validerBroadcastBillede({ contentType, bytes: buffer.length });
  if (!check.ok) throw new HttpsError('invalid-argument', check.error);

  const unik = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
  const sti = broadcastBilledeSti(check.ext, unik);
  if (!sti) throw new HttpsError('internal', 'Kunne ikke bygge billed-sti.');

  // .bucket(navn) bygger blot en reference (ingen I/O) og kaster ikke — den
  // ægte "Storage ikke sat op"/adgangs-fejl rammer .save() nedenfor og vises dér.
  const bucket = getStorage().bucket(STORAGE_BUCKET);
  // Download-token gør ?alt=media&token=…-URL'en offentligt læsbar UDEN om
  // reglerne (tokenet afgør download). Storage-reglen nægter kun klient-writes.
  const token = crypto.randomUUID();
  try {
    await bucket.file(sti).save(buffer, {
      resumable: false,
      contentType,
      metadata: { metadata: { firebaseStorageDownloadTokens: token } },
    });
  } catch (e) {
    // Vis den ægte årsag til admin (kun-admin-værktøj): en blind "prøv igen"
    // kan ikke fejlsøges. Typisk enten manglende Storage-rettighed på
    // funktionens service-konto (403) eller forkert bucket-navn (404).
    const detalje = String((e && (e.message || e.code)) || 'ukendt fejl');
    console.error('uploadBroadcastImage: kunne ikke skrive til Storage', detalje);
    throw new HttpsError('internal', `Billedet kunne ikke gemmes (bucket ${STORAGE_BUCKET}): ${detalje}`);
  }
  const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(sti)}?alt=media&token=${token}`;
  return { url };
});

// ---------------------------------------------------------------------------
// Per-spil tip-påmindelser. gameId styrer hvilket spil. Kun owner/globalAdmin.
// ---------------------------------------------------------------------------
exports.sendGameTipRemindersNow = onCall(
  { region: REGION, secrets: [SMTP_PASSWORD] },
  async (request) => {
    const db = getFirestore();
    await requireAdmin(db, request);
    const gameId = String(request.data?.gameId || '').trim();
    if (!gameId) throw new HttpsError('invalid-argument', 'Mangler spil-id.');
    // SAMME gate som fanen og det daglige job — serveren er eneste autoritet.
    // Uden den kunne en håndlavet payload sende påmindelser for et afsluttet
    // spil, som fladen har slået knapperne fra for (Security-fund).
    const gSnap = await db.collection('games').doc(gameId).get();
    if (!forventerPaamindelser(gSnap.exists ? gSnap.data() : null)) {
      throw new HttpsError('failed-precondition',
        'Spillet får ikke påmindelser (kræver et fodbold-spil med status Åbent eller I gang).');
    }
    const transporter = buildTransport(SMTP_PASSWORD.value());
    if (!transporter) throw new HttpsError('failed-precondition', 'SMTP_PASSWORD er ikke sat endnu.');
    const result = await runGameTipReminders(db, transporter, gameId);
    return { success: true, ...result };
  },
);

// ---------------------------------------------------------------------------
// leagueQuestionStatus — hvem mangler at svare på ligaens ÅBNE spørgsmål?
// (opgave #38). Adgang: LIGA-MEDLEM eller owner/globalAdmin — symmetrisk
// (spilfører-krav): alle i ligaen må se HVEM der har svaret; HVAD de svarede
// er stadig lukket til facit/deadline (rules, questionAnswers — den regel
// har med vilje ingen admin-gren, og denne callable læser aldrig svar-data:
// kun dokument-eksistens på deterministiske id'er).
// ---------------------------------------------------------------------------
exports.leagueQuestionStatus = onCall(
  { region: REGION },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Du skal være logget ind.');
    const db = getFirestore();
    const ID_RE = /^[A-Za-z0-9_-]{1,200}$/;
    const gameId = String(request.data?.gameId || '').trim();
    const leagueId = String(request.data?.leagueId || '').trim();
    if (!ID_RE.test(gameId) || /^__.*__$/.test(gameId)
      || !ID_RE.test(leagueId) || /^__.*__$/.test(leagueId)) {
      throw new HttpsError('invalid-argument', 'Ugyldigt spil- eller liga-id.');
    }
    // Dørmanden bor i hentSpoergsmaalStatus (tjekSvarStatusAdgang, gameLeagues.js)
    // og løber FØR de dyre læsninger: godkendt bruger OG (medlem ELLER
    // owner/globalAdmin) — samme krav som rules stiller i browseren. Her
    // oversættes kun fejlkoderne.
    let status;
    try {
      status = await hentSpoergsmaalStatus(db, { gameId, leagueId, uid: request.auth.uid });
    } catch (err) {
      const [httpCode, msg] = LEAGUE_ERR[err.message] || ['internal', 'Kunne ikke hente svar-status.'];
      throw new HttpsError(httpCode, msg);
    }
    if (!status) throw new HttpsError('not-found', 'Ligaen findes ikke.');
    // memberUids er intern (adgangstjekket ovenfor) — ud af svaret.
    return { success: true, leagueName: status.leagueName, spoergsmaal: status.spoergsmaal };
  },
);

// ---------------------------------------------------------------------------
// gameTipStatus — admin: hvem mangler at tippe i én runde? (opgave #37)
//
// Callable og IKKE en klient-query, selvom firestore.rules faktisk TILLADER
// admin at læse alle bets: pointen er, at andres 1X2-valg aldrig skal ned i
// admins browser (admin spiller selv med). Serveren læser kun matchId af
// hvert bet — se hentTipStatus. "Forenkl" den derfor aldrig til en query.
// ---------------------------------------------------------------------------
exports.gameTipStatus = onCall(
  { region: REGION },
  async (request) => {
    const db = getFirestore();
    await requireAdmin(db, request);
    const gameId = String(request.data?.gameId || '').trim();
    // Regexen alene slap '__proto__' igennem — Firestore reserverer __x__-
    // formen og kaster først ved get() som en ubehandlet 'internal'
    // (Security-fund, emulator-bekræftet).
    if (!/^[A-Za-z0-9_-]{1,200}$/.test(gameId) || /^__.*__$/.test(gameId)) {
      throw new HttpsError('invalid-argument', 'Ugyldigt spil-id.');
    }
    const round = Number(request.data?.round);
    if (!Number.isInteger(round) || round < 1 || round > 99) {
      throw new HttpsError('invalid-argument', 'Ugyldig runde.');
    }
    const status = await hentTipStatus(db, gameId, round);
    if (!status) throw new HttpsError('not-found', 'Spillet findes ikke.');
    return { success: true, ...status };
  },
);

exports.sendGameTestReminderToMe = onCall(
  { region: REGION, secrets: [SMTP_PASSWORD] },
  async (request) => {
    const db = getFirestore();
    const caller = await requireAdmin(db, request);
    const gameId = String(request.data?.gameId || '').trim();
    if (!gameId) throw new HttpsError('invalid-argument', 'Mangler spil-id.');
    // SAMME gate som "Send nu" og som fanens knap: begge knapper slås fra for
    // et spil, jobbet springer over, så serveren skal svare ens på begge veje
    // (Security-nit). Testmailen går kun til kalderen selv, men en flade og en
    // server, der er uenige om hvad et spil KAN, er præcis den slags divergens,
    // der bider et halvt år senere.
    const gSnap = await db.collection('games').doc(gameId).get();
    if (!forventerPaamindelser(gSnap.exists ? gSnap.data() : null)) {
      throw new HttpsError('failed-precondition',
        'Spillet får ikke påmindelser (kræver et fodbold-spil med status Åbent eller I gang).');
    }
    const contactSnap = await db.collection('userContacts').doc(request.auth.uid).get();
    const email = request.auth.token?.email || contactSnap.data()?.email || caller?.email;
    if (!email) throw new HttpsError('failed-precondition', 'Din profil har ingen e-mailadresse.');
    const transporter = buildTransport(SMTP_PASSWORD.value());
    if (!transporter) throw new HttpsError('failed-precondition', 'SMTP_PASSWORD er ikke sat endnu.');
    const result = await sendGameTestReminder(db, transporter, gameId, email, caller?.displayName);
    return { success: true, ...result };
  },
);

// ---------------------------------------------------------------------------
// gamePuljeStatus — admin: hvem har/mangler pulje-tippet (sæson-spørgsmålene)?
// Med remind=true sendes samtidig en påmindelses-mail til dem der mangler
// (respekterer emailOptOut; kræver SMTP og at deadline ikke er passeret).
// ---------------------------------------------------------------------------
exports.gamePuljeStatus = onCall(
  { region: REGION, secrets: [SMTP_PASSWORD] },
  async (request) => {
    const db = getFirestore();
    await requireAdmin(db, request);
    const gameId = String(request.data?.gameId || '').trim();
    if (!gameId) throw new HttpsError('invalid-argument', 'Mangler spil-id.');
    const remind = request.data?.remind === true;

    const gameRef = db.collection('games').doc(gameId);
    const [gameSnap, playersSnap, puljeSnap, usersSnap, contactsSnap] = await Promise.all([
      gameRef.get(),
      gameRef.collection('players').get(),
      gameRef.collection('puljeBets').get(),
      db.collection('users').get(),
      db.collection('userContacts').get(),
    ]);
    if (!gameSnap.exists) throw new HttpsError('not-found', 'Spillet findes ikke.');
    const game = gameSnap.data();
    const lockRaw = game.puljeLockAt;
    const lockMs = lockRaw == null ? null
      : (typeof lockRaw === 'number' ? lockRaw
        : (typeof lockRaw.toMillis === 'function' ? lockRaw.toMillis() : Date.parse(lockRaw)));
    const locked = lockMs != null && lockMs <= Date.now();

    const nameOf = new Map(usersSnap.docs.map((d) => [d.id, d.data().displayName || 'Spiller']));
    const optOut = new Set(usersSnap.docs.filter((d) => d.data().emailOptOut).map((d) => d.id));
    const emailOf = new Map(contactsSnap.docs.map((d) => [d.id, d.data().email]));
    // "Har tippet" måles mod KONFIGURATIONEN, ikke mod "listen er ikke tom":
    // med to spørgsmål (PL: top 4 + bund 3) ville et halvt svar ellers tælle
    // som færdigt, og ryk-mailen ville springe netop dem over, den er til for
    // (QC-fund). Rules kræver i dag begge lister i samme skrivning, men gamle
    // dokumenter og fremtidige regel-ændringer skal ikke kunne vælte tallet.
    const konfig = puljeKonfig(game);
    const hasPulje = new Set(
      puljeSnap.docs.filter((d) => puljeTipKomplet(d.data(), konfig)).map((d) => d.id),
    );
    const tipped = [];
    const missing = [];
    for (const p of playersSnap.docs) {
      const row = { uid: p.id, name: nameOf.get(p.id) || 'Spiller' };
      (hasPulje.has(p.id) ? tipped : missing).push(row);
    }
    const byName = (a, b) => a.name.localeCompare(b.name, 'da');
    tipped.sort(byName); missing.sort(byName);

    let reminded = 0;
    if (remind && missing.length > 0) {
      if (locked) throw new HttpsError('failed-precondition', 'Puljen er låst — det giver ikke mening at rykke nu.');
      const transporter = buildTransport(SMTP_PASSWORD.value());
      if (!transporter) throw new HttpsError('failed-precondition', 'SMTP_PASSWORD er ikke sat endnu.');
      const deadlineTxt = lockMs != null
        ? new Date(lockMs).toLocaleString('da-DK', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
        : null;
      const gameName = game.name || 'spillet';
      for (const m of missing) {
        const email = emailOf.get(m.uid);
        if (!email || optOut.has(m.uid)) continue;
        const html = `
          <p>Hej ${escapeHtml(m.name)} 👋</p>
          <p>Du mangler at sætte dit <strong>pulje-tip</strong> (sæsonens bonusspørgsmål) i ${escapeHtml(gameName)} —
          det er dér, de store bonuspoint ligger til sæsonafslutningen.</p>
          ${deadlineTxt ? `<p>Deadline: <strong>${escapeHtml(deadlineTxt)}</strong>.</p>` : ''}
          <p><a href="${APP_URL}">Sæt dit pulje-tip på tip.vejleaa.dk</a> — det tager to minutter.</p>
          <p style="color:#888;font-size:12px">Du kan slå påmindelser fra på din profilside.</p>`;
        try {
          await sendEmail(db, transporter, {
            to: email,
            subject: `Husk pulje-tippet i ${gameName}${deadlineTxt ? ` — deadline ${deadlineTxt}` : ''}`,
            html,
            type: 'pulje-reminder',
          });
          reminded += 1;
        } catch (e) {
          console.error(`gamePuljeStatus: kunne ikke sende til ${email}:`, e && e.message);
        }
      }
    }

    return {
      total: playersSnap.size, locked, lockAt: lockMs,
      tipped, missing, reminded: remind ? reminded : null,
    };
  },
);

// Skemalagt: kl. 09:00 hver dag ('0 9 * * *' — timer:[9]/minut:0 i
// driftstatus-kadencen nedenfor SKAL følges ad med dette udtryk, som
// SWEEP_TIMER). Kør påmindelser for alle aktive fodbold-spil
// (forventerPaamindelser — SAMME gate som DriftTabs forventede kort og
// Påmindelser-fanen) og skriv driftstatus pr. spil, OGSÅ når intet sendes:
// manglende SMTP returnerede før globalt uden ét spor, og en pause var
// usynlig alle andre steder end i Firestore-konsollen.
exports.gameTipReminders = onSchedule(
  { schedule: '0 9 * * *', timeZone: TZ, region: REGION, secrets: [SMTP_PASSWORD] },
  async () => {
    const db = getFirestore();
    const transporter = buildTransport(SMTP_PASSWORD.value());
    const snap = await db.collection('games').where('type', '==', 'football').get();
    for (const d of snap.docs) {
      const g = { ...d.data(), id: d.id };
      if (!forventerPaamindelser(g)) {
        // Et spil, der IKKE længere kvalificerer (typisk: sat til finished),
        // må ikke efterlade et kort med passeret naesteForventetFoer — det
        // ville stå RØDT "HAR IKKE KØRT" for evigt. Luk kortet pænt med
        // naesteForventetFoer: null — men KUN hvis dokumentet findes (et spil,
        // der aldrig har haft påmindelser, skal aldrig have et kort), og kun
        // én gang (ellers koster det en skrivning pr. døgn for evigt).
        try {
          const ref = db.collection('driftlog').doc(`reminder-${d.id}`);
          const cur = await ref.get();
          if (cur.exists && cur.data().naesteForventetFoer != null) {
            const st = statusSamler({ type: 'reminder', gameId: d.id, gameNavn: g.name });
            st.ok('Spillet er afsluttet — der sendes ikke flere påmindelser.');
            await skrivDriftStatus(st, db, { naesteForventetFoerMs: null });
          }
        } catch (e) {
          console.error(`gameTipReminders(${d.id}): kunne ikke lukke driftkortet (ignoreret):`, e && e.message);
        }
        continue;
      }
      const st = statusSamler({ type: 'reminder', gameId: d.id, gameNavn: g.name });
      const linje = await koerPaamindelserForSpil(db, transporter, g);
      st[linje.niveau](linje.besked, linje.tal);
      await skrivDriftStatus(st, db, {
        naesteForventetFoerMs: () => naesteKoerselFoerMs(Date.now(), { timer: [9], minut: 0, slaekMin: 45 }),
      });
      console.log(`gameTipReminders(${d.id}): ${linje.niveau} — ${linje.besked}`);
    }
  },
);

// ---------------------------------------------------------------------------
// adminAuthUserInfo — owner/globalAdmin: hent login-metode (providers) m.m. for
// alle Auth-brugere, så to konti med samme e-mail kan skelnes i admin-listen.
// ---------------------------------------------------------------------------
exports.adminAuthUserInfo = onCall({ region: REGION }, async (request) => {
  const db = getFirestore();
  await requireAdmin(db, request);
  const auth = getAuth();
  const out = [];
  let token;
  do {
    const res = await auth.listUsers(1000, token);
    for (const u of res.users) {
      out.push({
        uid: u.uid,
        email: u.email || null,
        providers: (u.providerData || []).map((p) => p.providerId),
        lastSignIn: (u.metadata && u.metadata.lastSignInTime) || null,
        creation: (u.metadata && u.metadata.creationTime) || null,
        disabled: !!u.disabled,
      });
    }
    token = res.pageToken;
  } while (token);
  return { users: out };
});

// ---------------------------------------------------------------------------
// adminDeleteUser — KUN ejeren: slet en bruger helt (Auth-konto + users-profil +
// userContacts + spil-medlemskaber). Kan ikke slette sig selv. Blokerer hvis
// brugeren har optjent point i et spil (medmindre force), så en rigtig spiller
// ikke fjernes ved en fejl. Bruges bl.a. til at rydde dublet-konti op.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// adminSetUserEmail — KUN ejeren: skift en brugers e-mail direkte (Auth-kontoen
// + users.email + userContacts.email). Ingen bekræftelses-mail — admin-skiftet
// gælder med det samme. Mest til e-mail/kodeord-konti (en Google-konto logger
// stadig ind med sin Google-adresse, selv om Auth-mailen ændres).
// ---------------------------------------------------------------------------
exports.adminSetUserEmail = onCall({ region: REGION }, async (request) => {
  const db = getFirestore();
  const caller = await requireAdmin(db, request);
  if (caller?.role !== 'owner') throw new HttpsError('permission-denied', 'Kun ejeren kan skifte brugeres e-mail.');
  const uid = String(request.data?.uid || '').trim();
  const newEmail = String(request.data?.email || '').trim().toLowerCase();
  if (!uid) throw new HttpsError('invalid-argument', 'Mangler bruger-id.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    throw new HttpsError('invalid-argument', 'Angiv en gyldig e-mailadresse.');
  }
  try {
    await getAuth().updateUser(uid, { email: newEmail, emailVerified: true });
  } catch (e) {
    if (e.code === 'auth/email-already-exists') {
      throw new HttpsError('already-exists', 'Der findes allerede en konto med den e-mail.');
    }
    if (e.code === 'auth/user-not-found') {
      throw new HttpsError('not-found', 'Brugeren findes ikke i Authentication.');
    }
    console.error('adminSetUserEmail:', e && e.message);
    throw new HttpsError('internal', 'Kunne ikke ændre e-mailen.');
  }
  // E-mailen hører KUN hjemme i userContacts (kun brugeren selv + admin kan
  // læse den). users/{uid} er den offentlige profil, som alle godkendte kan
  // læse — den må aldrig indeholde adressen. Et evt. gammelt felt ryddes med.
  const batch = db.batch();
  batch.set(db.collection('userContacts').doc(uid), { uid, email: newEmail }, { merge: true });
  batch.set(db.collection('users').doc(uid), { email: FieldValue.delete() }, { merge: true });
  await batch.commit();
  return { ok: true, uid, email: newEmail };
});

exports.adminDeleteUser = onCall({ region: REGION }, async (request) => {
  const db = getFirestore();
  const caller = await requireAdmin(db, request);
  if (caller?.role !== 'owner') throw new HttpsError('permission-denied', 'Kun ejeren kan slette brugere.');
  const uid = String(request.data?.uid || '').trim();
  if (!uid) throw new HttpsError('invalid-argument', 'Mangler bruger-id.');
  if (uid === request.auth.uid) throw new HttpsError('failed-precondition', 'Du kan ikke slette dig selv.');

  const gamesSnap = await db.collection('games').get();
  if (!request.data?.force) {
    for (const g of gamesSnap.docs) {
      const p = await g.ref.collection('players').doc(uid).get();
      if (p.exists && (Number(p.data().totalPoints) || 0) > 0) {
        throw new HttpsError('failed-precondition', `Brugeren har point i "${g.data().name || g.id}". Bekræft med force for at slette alligevel.`);
      }
    }
  }

  try {
    await getAuth().deleteUser(uid);
  } catch (e) {
    if (e.code !== 'auth/user-not-found') throw new HttpsError('internal', 'Kunne ikke slette Auth-kontoen.');
  }

  const batch = db.batch();
  batch.delete(db.collection('users').doc(uid));
  batch.delete(db.collection('userContacts').doc(uid));
  for (const g of gamesSnap.docs) batch.delete(g.ref.collection('players').doc(uid));
  await batch.commit();

  return { ok: true, uid };
});
