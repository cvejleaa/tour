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

const { recomputeGameMatchCore, recomputeSeasonElo } = require('./gameScoring');
const { syncResultsCore, syncStandingsCore } = require('./superligaSync');
const { redeemLeagueCodeCore } = require('./gameLeagues');
const { buildTransport, sendEmail, escapeHtml, APP_URL } = require('./mailer');

initializeApp();

const REGION = 'europe-west1';
const TZ = 'Europe/Copenhagen';

// SMTP-adgangskode for tip@vejleaa.dk. Sæt én gang (uden den no-op'er mail):
//   firebase functions:secrets:set SMTP_PASSWORD --project spil-89af9
const SMTP_PASSWORD = defineSecret('SMTP_PASSWORD');

// recomputeGameMatch — afregn point i den samlede platform når en kamps facit
// (result) sættes: score alle bets på kampen (1X2 + Chancen) og genberegn hver
// berørt spillers total. Spejler Tour-motorens recomputeStage, men spil-scoped.
exports.recomputeGameMatch = onDocumentWritten(
  { document: 'games/{gameId}/matches/{matchId}', region: REGION },
  async (event) => {
    const db = getFirestore();
    const { gameId, matchId } = event.params;
    const after = event.data?.after?.data();
    if (!after || !after.result) return;
    const before = event.data?.before?.data();
    // Kør kun når facit reelt ændrer sig (undgå løkker ved andre felt-skriv).
    if (before?.result === after.result) return;
    await recomputeGameMatchCore(db, FieldValue, gameId, matchId, after);
    // Levende Elo: opdatér ratings + friske odds på fremtidige kampe.
    // (Odds-skriv på kampe uden facit gen-udløser IKKE denne funktion.)
    await recomputeSeasonElo(db, FieldValue, gameId, Date.now());
  },
);

// syncSuperligaResults — hent færdigspillede kampe fra api.superliga.dk og sæt
// facit på de matchende kampe. At skrive result udløser recomputeGameMatch
// (afregning + levende Elo). Kører i kamp-vinduet; fail-silent som Tour-synken.
exports.syncSuperligaResults = onSchedule(
  { schedule: '*/15 14-23 * * *', timeZone: TZ, region: REGION },
  async () => {
    try {
      const db = getFirestore();
      const { checked, updated } = await syncResultsCore(db, FieldValue);
      console.log(`Superliga-synk: ${checked} færdige kampe, ${updated} nye facit.`);
    } catch (err) {
      console.error('Superliga-synk fejlede (ignoreret):', err?.message || err);
    }
    // Officiel stilling (autoritativ kilde — vi beregner den ikke selv).
    try {
      const db = getFirestore();
      const { rows } = await syncStandingsCore(db, FieldValue);
      console.log(`Superliga-stilling synket: ${rows} hold.`);
    } catch (err) {
      console.error('Stilling-synk fejlede (ignoreret):', err?.message || err);
    }
  },
);

// syncSuperligaResultsNow — manuel udløsning (admin/owner). Til test/tvungen synk.
exports.syncSuperligaResultsNow = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Log ind.');
  const db = getFirestore();
  const userSnap = await db.collection('users').doc(uid).get();
  const role = userSnap.exists ? userSnap.data().role : null;
  if (role !== 'owner' && role !== 'globalAdmin') {
    throw new HttpsError('permission-denied', 'Kun admin kan synke resultater.');
  }
  const results = await syncResultsCore(db, FieldValue);
  const standings = await syncStandingsCore(db, FieldValue).catch((e) => ({ error: e?.message }));
  return { ...results, standings };
});

// redeemGameLeagueCode — deltag i en privat mini-liga via invitationskode.
const LEAGUE_ERR = {
  unauthenticated: ['unauthenticated', 'Log ind for at deltage.'],
  'bad-code': ['invalid-argument', 'Indtast en gyldig kode.'],
  'not-approved': ['permission-denied', 'Din konto er ikke godkendt endnu.'],
  'not-member': ['failed-precondition', 'Du skal deltage i spillet, før du kan være med i en liga.'],
  'not-found': ['not-found', 'Ingen liga fundet med den kode.'],
};
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
