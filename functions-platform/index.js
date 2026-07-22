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
const { buildTransport, sendEmail, escapeHtml, broadcastHtml, APP_URL } = require('./mailer');
const { runGameTipReminders, sendGameTestReminder } = require('./reminders');

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
  'no-user': ['failed-precondition', 'Opret en bruger først, så tilmelder vi dig ligaen.'],
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

    const html = broadcastHtml(body);
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
