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
const { initializeApp } = require('firebase-admin/app');

const {
  recomputeGameMatchCore, recomputeSeasonElo, recomputeAllPlayerTotals, rescoreAllBets,
  dryRunFraKald,
} = require('./gameScoring');
const {
  syncResultsCore, syncStandingsCore, runScheduledSyncAll, strandedMatches, allMatches,
} = require('./superligaSync');
const { PROVIDERS, SYNCED_GAMES } = require('./syncProviders');
const { redeemLeagueCodeCore, LEAGUE_ERR } = require('./gameLeagues');
const { buildTransport, sendEmail, escapeHtml, broadcastHtml, APP_URL } = require('./mailer');
const { runGameTipReminders, sendGameTestReminder } = require('./reminders');
const { runGameRoundRecap } = require('./gameRecap');
const { membershipDelta, applyMembershipDelta, rebuildGamePlayerLeagues } = require('./playerLeagues');
const { superligaInviteHtml } = require('./inviteTemplate');

initializeApp();

const REGION = 'europe-west1';
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
exports.syncSuperligaResults = onSchedule(
  { schedule: '* 12-23 * * *', timeZone: TZ, region: REGION },
  async () => {
    // Selve rækkefølgen — og det tidlige exit — bor i superligaSync, så den
    // kan unit-testes. Her logges kun resultatet.
    const alle = await runScheduledSyncAll(getFirestore(), FieldValue, Date.now());
    for (const out of alle) {
      if (out.fejl) console.error(`Synk ${out.gameId} (ignoreret):`, out.fejl);
      if (out.pending === 0) continue; // stille minut: intet i gang, intet rørt
      console.log(`Synk ${out.gameId}: ${out.pending} kampe uden facit, ${out.updated} nye facit.`
        + (out.live ? ` ${out.live.live} i gang, ${out.live.skrevet} live-opdateringer`
          + `${out.live.sluttet ? `, slut: ${out.live.sluttede.join(', ')}` : ''}.` : '')
        + (out.standings ? ` Stilling ${out.standings.changed ? 'opdateret' : 'uændret'}.` : ''));
    }
  },
);

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
exports.syncSuperligaSweep = onSchedule(
  { schedule: '25 2,13-23 * * *', timeZone: TZ, region: REGION },
  async () => {
    const db = getFirestore();
    // Sweep'et — og strandede-alarmen — løber over SAMME spil-liste som
    // minut-synken. Før dækkede alarmen kun Superligaen, så en strandet
    // PL-kamp ville have stået uafregnet uden en lyd.
    for (const g of SYNCED_GAMES) {
      const provider = PROVIDERS[g.provider];
      if (!provider) continue; // logget af minut-synken — sweep'et gentager ikke
      const opts = { gameId: g.gameId, provider, sync: g.sync };
      let alle = null;
      let netopRettet = new Set();
      try {
        // Ét opslag, to formål: både gen-synken og alarmen bygger på det.
        alle = await allMatches(db, opts);
        const { checked, updated, rettede } = await syncResultsCore(db, FieldValue, { ...opts, only: alle });
        netopRettet = new Set(rettede);
        if (updated > 0) {
          console.warn(`Sweep ${g.gameId}: ${updated} facit som minut-synken IKKE nåede — undersøg hvorfor.`);
        } else {
          console.log(`Sweep ${g.gameId}: ${checked} færdige kampe, intet manglede.`);
        }
      } catch (err) {
        console.error(`Sweep ${g.gameId} fejlede (ignoreret):`, err?.message || err);
      }
      try {
        const { rows, changed } = await syncStandingsCore(db, FieldValue, opts);
        console.log(`Stilling ${g.gameId} (sweep): ${rows} hold, ${changed ? 'opdateret' : 'uændret'}.`);
      } catch (err) {
        console.error(`Stilling-synk ${g.gameId} fejlede (ignoreret):`, err?.message || err);
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
          }
        }
      } catch (err) {
        console.error(`Kunne ikke tjekke for strandede kampe i ${g.gameId} (ignoreret):`, err?.message || err);
      }
    }
  },
);

// syncSuperligaResultsNow — manuel udløsning (admin/owner). Til test/tvungen
// synk. Navnet er historisk (deployet under det); den synker et VALGFRIT spil
// fra SYNCED_GAMES — uden gameId Superligaen, som den altid har gjort.
// Gennemgår hele sæsonen (ingen `only`), så den også fanger rettede facit på
// gamle kampe. Det er den "start med vilje"-vej, reglen om nyt maskineri
// kræver — også for et spil, hvis første kamp endnu ikke er spillet.
exports.syncSuperligaResultsNow = onCall({ region: REGION }, async (request) => {
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
  if (!g || !PROVIDERS[g.provider]) {
    throw new HttpsError('invalid-argument', `Ingen synk-provider for "${gameId}".`);
  }
  const opts = { gameId: g.gameId, provider: PROVIDERS[g.provider], sync: g.sync };
  const results = await syncResultsCore(db, FieldValue, opts);
  const standings = await syncStandingsCore(db, FieldValue, opts).catch((e) => ({ error: e?.message }));
  return { gameId: g.gameId, ...results, standings };
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

    // Invitations-skabelon (grøn hero + pulje-skærmbillede + gul tilmeldings-
    // knap). Kræver et joinLink på vores eget domæne, så knappen aldrig kan
    // pege ud af huset.
    let html;
    if (request.data?.template === 'superliga') {
      const joinLink = String(request.data?.joinLink || '').trim();
      if (!joinLink.startsWith(APP_URL)) {
        throw new HttpsError('invalid-argument', 'Skabelonen kræver et tilmeldingslink på tip.vejleaa.dk.');
      }
      html = superligaInviteHtml({
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
// Per-spil tip-påmindelser. gameId styrer hvilket spil. Kun owner/globalAdmin.
// ---------------------------------------------------------------------------
exports.sendGameTipRemindersNow = onCall(
  { region: REGION, secrets: [SMTP_PASSWORD] },
  async (request) => {
    const db = getFirestore();
    await requireAdmin(db, request);
    const gameId = String(request.data?.gameId || '').trim();
    if (!gameId) throw new HttpsError('invalid-argument', 'Mangler spil-id.');
    const transporter = buildTransport(SMTP_PASSWORD.value());
    if (!transporter) throw new HttpsError('failed-precondition', 'SMTP_PASSWORD er ikke sat endnu.');
    const result = await runGameTipReminders(db, transporter, gameId);
    return { success: true, ...result };
  },
);

exports.sendGameTestReminderToMe = onCall(
  { region: REGION, secrets: [SMTP_PASSWORD] },
  async (request) => {
    const db = getFirestore();
    const caller = await requireAdmin(db, request);
    const gameId = String(request.data?.gameId || '').trim();
    if (!gameId) throw new HttpsError('invalid-argument', 'Mangler spil-id.');
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
// gamePuljeStatus — admin: hvem har/mangler pulje-tippet (mesterskabsspillet)?
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
    const hasPulje = new Set(
      puljeSnap.docs.filter((d) => Array.isArray(d.data().championship) && d.data().championship.length > 0).map((d) => d.id),
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
          <p>Du mangler at sætte dit <strong>pulje-tip</strong> (mesterskabsspillet) i ${escapeHtml(gameName)} —
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

// Skemalagt: kl. 09:00 hver dag. Kør påmindelser for alle aktive fodbold-spil
// (status open/live), medmindre spillet er sat på pause (game.paused).
exports.gameTipReminders = onSchedule(
  { schedule: '0 9 * * *', timeZone: TZ, region: REGION, secrets: [SMTP_PASSWORD] },
  async () => {
    const db = getFirestore();
    const transporter = buildTransport(SMTP_PASSWORD.value());
    if (!transporter) { console.log('gameTipReminders: ingen SMTP_PASSWORD — springer over.'); return; }
    const snap = await db.collection('games').where('type', '==', 'football').get();
    for (const d of snap.docs) {
      const g = d.data();
      if (g.paused) continue;
      if (g.status !== 'open' && g.status !== 'live') continue;
      try {
        const r = await runGameTipReminders(db, transporter, d.id);
        console.log(`gameTipReminders(${d.id}): sendte ${r.sent}${r.reason ? ` (${r.reason})` : ''}.`);
      } catch (e) {
        console.error(`gameTipReminders(${d.id}) fejl:`, e && e.message);
      }
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
