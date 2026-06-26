// ---------------------------------------------------------------------------
// functions/index.js — Firebase Cloud Functions v2 til VM 2026 tippekonkurrence.
// Region: europe-west1, Node 22.
//
// Funktioner:
//   recomputeMatch    — Firestore onWrite: beregner point når kampresultat sættes
//   recomputeBonus    — Firestore onWrite: beregner point når bonus-facit sættes
//   buildKnockout     — callable: bygger knockout-bracket fra grupperesultater
//   resolveGroupWinnerOnFinish — Firestore onWrite: sætter gruppevinder-facit
//                       automatisk når en gruppes sidste kamp er færdig
//   syncGroupWinnersNow — callable (admin): afgør gruppevindere manuelt/dry-run
//
// Bemærk: bruger-oprettelse (users/{uid} med role:'player', status:'pending')
// håndteres på klienten ved registrering + Security Rules. Owner sættes manuelt
// én gang (se docs/firebase-setup.md, trin 8). Vi bruger derfor IKKE en blocking
// auth-function, som ville kræve Identity Platform (GCIP).
// ---------------------------------------------------------------------------

'use strict';

const { onCall, HttpsError }       = require('firebase-functions/v2/https');
const { onDocumentWritten }        = require('firebase-functions/v2/firestore');
const { onSchedule }               = require('firebase-functions/v2/scheduler');
const { defineSecret }             = require('firebase-functions/params');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { getAuth }                  = require('firebase-admin/auth');
const { initializeApp }            = require('firebase-admin/app');
const nodemailer                   = require('nodemailer');

// E-mail-udsendelse via SMTP (one.com med vm@vejleaa.dk).
// Kun adgangskoden er hemmelig (Secret Manager):
//   firebase functions:secrets:set SMTP_PASSWORD
// De øvrige SMTP-indstillinger er ikke følsomme og sættes som konstanter.
const SMTP_PASSWORD = defineSecret('SMTP_PASSWORD');
// football-data.org API-token (auto-resultater). Sættes med:
//   firebase functions:secrets:set FOOTBALL_DATA_TOKEN
const FOOTBALL_DATA_TOKEN = defineSecret('FOOTBALL_DATA_TOKEN');
// Anthropic API-nøgle til AI-morgenopslag. Sættes med:
//   firebase functions:secrets:set ANTHROPIC_API_KEY
const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');
const SMTP_HOST = 'send.one.com';
const SMTP_PORT = 465; // implicit TLS
const SMTP_USER = 'vm@vejleaa.dk';
const EMAIL_FROM = 'VM 2026 Tip <vm@vejleaa.dk>';
const APP_URL = 'https://vm.vejleaa.dk';
const TZ = 'Europe/Copenhagen';

const { scoreMatch, scoreKnockout, bonusPoints } = require('./scoring');
const { buildR32FromGroupMatches } = require('./knockout');
const { computeBreakdown } = require('./breakdown');
const { createClient, mapScorers, summarizeScorers, summarizeMatchDetail, summarizeStandings, mapMatchDetails, mapStandings, mapCompetition } = require('./footballData');
const { decideUpdate, matchFixture, patchChangesDoc, auditKickoffs } = require('./resultsSync');
const { resolveGroupWinners } = require('./bonusResolve');
const { redeemInviteCodeCore } = require('./invites');
const Anthropic = require('@anthropic-ai/sdk');
const { RECAP_SYSTEM, RECAP_DEFAULT_TIME, buildRecapFacts, recapWindowOpen, leagueMatchPoints, historicalMembers, windowDayPoints } = require('./leagueRecap');

// Initialiser Firebase Admin (singleton)
initializeApp();

// Region for alle funktioner
const REGION = 'europe-west1';

// ---------------------------------------------------------------------------
// recomputeMatch — beregner point for alle bets når et kampresultat ændres
// ---------------------------------------------------------------------------
exports.recomputeMatch = onDocumentWritten(
  { document: 'matches/{matchId}', region: REGION },
  async (event) => {
    const db = getFirestore();
    const { matchId } = event.params;

    const after = event.data?.after?.data();
    if (!after) return; // slettet kamp — intet at gøre

    // Beregn point når kampen er afsluttet ELLER live (foreløbige point),
    // så stillingen også opdateres løbende under kampe.
    const scored = after.status === 'finished' || after.status === 'live';
    if (!scored || !after.result) return;

    const before = event.data?.before?.data();
    // Undgå genberegning hvis hverken status eller result har ændret sig
    if (
      before?.status === after.status &&
      JSON.stringify(before?.result) === JSON.stringify(after.result)
    ) return;

    const result = after.result;
    // Afgør om det er en knockout-runde
    const isKnockout = after.round && after.round !== 'group';

    // Hent alle bets for denne kamp
    const betsSnap = await db
      .collection('bets')
      .where('matchId', '==', matchId)
      .get();

    if (betsSnap.empty) return;

    // Beregn point i batches (Firestore max 500 pr. batch)
    const BATCH_SIZE = 400;
    let batch = db.batch();
    let opsInBatch = 0;
    const batches = [batch];

    for (const betDoc of betsSnap.docs) {
      const bet = betDoc.data();
      const pts = isKnockout
        ? scoreKnockout(bet, result)
        : scoreMatch(bet, result);

      batch.update(betDoc.ref, { points: pts });
      opsInBatch++;

      if (opsInBatch >= BATCH_SIZE) {
        batch = db.batch();
        batches.push(batch);
        opsInBatch = 0;
      }
    }

    // Commit alle batches
    for (const b of batches) {
      await b.commit();
    }

    // Opdater totalPoints for hver berørt bruger
    const affectedUids = [...new Set(betsSnap.docs.map(d => d.data().uid))];

    for (const uid of affectedUids) {
      await recalcUserTotal(db, uid);
    }
  }
);

// ---------------------------------------------------------------------------
// recomputeBonus — beregner point for alle bonusBets når facit sættes
// ---------------------------------------------------------------------------
exports.recomputeBonus = onDocumentWritten(
  { document: 'bonusQuestions/{questionId}', region: REGION },
  async (event) => {
    const db = getFirestore();
    const { questionId } = event.params;

    const after = event.data?.after?.data();
    if (!after?.facit) return; // Facit ikke sat endnu

    // Stempl tidspunktet for afgørelsen første gang facit sættes — bruges af
    // VM-Botten til at fortælle, at et bonusspørgsmål er blevet afgjort.
    // (Sættet udløser funktionen igen, men da facit/accepted er uændret,
    // returnerer den hurtigt nedenfor — ingen løkke.)
    if (!after.resolvedAt && event.data?.after?.ref) {
      await event.data.after.ref.set({ resolvedAt: FieldValue.serverTimestamp() }, { merge: true });
    }

    const before = event.data?.before?.data();
    // Genberegn hvis facit ELLER de admin-godkendte svar er ændret
    const acceptedJSON = JSON.stringify(after.acceptedAnswers ?? []);
    const beforeAcceptedJSON = JSON.stringify(before?.acceptedAnswers ?? []);
    if (before?.facit === after.facit && beforeAcceptedJSON === acceptedJSON) return;

    const facit = after.facit;
    const acceptedAnswers = after.acceptedAnswers ?? [];
    const type = after.type;

    // Hent alle bonusBets for dette spørgsmål
    const betsSnap = await db
      .collection('bonusBets')
      .where('questionId', '==', questionId)
      .get();

    if (betsSnap.empty) return;

    // Opdater points i batches
    const BATCH_SIZE = 400;
    let batch = db.batch();
    let opsInBatch = 0;
    const batches = [batch];

    for (const betDoc of betsSnap.docs) {
      const bet = betDoc.data();
      const pts = bonusPoints({ answer: bet.answer, facit, type, acceptedAnswers });

      batch.update(betDoc.ref, { points: pts });
      opsInBatch++;

      if (opsInBatch >= BATCH_SIZE) {
        batch = db.batch();
        batches.push(batch);
        opsInBatch = 0;
      }
    }

    for (const b of batches) {
      await b.commit();
    }

    // Opdater totalPoints for berørte brugere
    const affectedUids = [...new Set(betsSnap.docs.map(d => d.data().uid))];
    for (const uid of affectedUids) {
      await recalcUserTotal(db, uid);
    }
  }
);

// ---------------------------------------------------------------------------
// backfillTipParticipation — callable (owner/global admin)
// Engangs-/vedligeholdelsesfunktion: genopbygger tipParticipation ud fra ALLE
// eksisterende bets, så tip-tælleren også dækker tips afgivet før
// syncTipParticipation blev deployet.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// redeemInviteCode — callable: selvbetjent godkendelse via en ligas join-kode.
// En logget-ind (men endnu ikke godkendt) bruger indtaster en kode; matcher den
// en ADMIN-GODKENDT liga, sættes status='approved' og brugeren tilmeldes ligaen.
// Hele beslutningen sker server-side med admin-rettigheder — klienten kan aldrig
// selv sætte 'approved'. Rate-limiting beskytter mod gæt af koder.
// ---------------------------------------------------------------------------
exports.redeemInviteCode = onCall({ region: REGION }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Du skal være logget ind.');
  }
  const db = getFirestore();
  const uid = request.auth.uid;

  const result = await redeemInviteCodeCore({
    uid,
    rawCode: request.data?.code,
    now: Date.now(),

    getAttempt: async (u) => {
      const snap = await db.collection('inviteAttempts').doc(u).get();
      return snap.exists ? snap.data() : null;
    },
    saveAttempt: (u, state) =>
      db.collection('inviteAttempts').doc(u).set(state, { merge: true }),

    findApprovedLeagueByCode: async (code) => {
      const snap = await db.collection('leagues')
        .where('joinCode', '==', code)
        .where('status', '==', 'approved')
        .limit(1)
        .get();
      if (snap.empty) return null;
      const d = snap.docs[0];
      return { id: d.id, name: d.data().name };
    },

    approveUserAndJoin: async ({ uid: u, leagueId }) => {
      const batch = db.batch();
      batch.set(db.collection('users').doc(u), {
        status: 'approved',
        approvedAt: FieldValue.serverTimestamp(),
        approvedViaInvite: true,
      }, { merge: true });
      batch.update(db.collection('leagues').doc(leagueId), {
        memberUids: FieldValue.arrayUnion(u),
      });
      await batch.commit();
    },
  });

  if (!result.ok) {
    throw new HttpsError(result.error, result.message);
  }
  return { leagueId: result.leagueId, leagueName: result.leagueName };
});

exports.backfillTipParticipation = onCall({ region: REGION }, async (request) => {
  const db = getFirestore();

  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Du skal være logget ind.');
  }
  const userDoc = await db.collection('users').doc(request.auth.uid).get();
  const role = userDoc.data()?.role;
  if (role !== 'owner' && role !== 'globalAdmin') {
    throw new HttpsError('permission-denied', 'Kun owner/global admin kan køre backfill.');
  }

  // Saml uids pr. matchId fra alle bets
  const betsSnap = await db.collection('bets').get();
  const byMatch = new Map();
  for (const d of betsSnap.docs) {
    const { matchId, uid } = d.data();
    if (!matchId || !uid) continue;
    if (!byMatch.has(matchId)) byMatch.set(matchId, new Set());
    byMatch.get(matchId).add(uid);
  }

  // Skriv tipParticipation-dokumenter i batches
  const BATCH_SIZE = 400;
  let batch = db.batch();
  let ops = 0;
  const batches = [batch];
  for (const [matchId, uidSet] of byMatch.entries()) {
    const ref = db.collection('tipParticipation').doc(matchId);
    batch.set(ref, { matchId, uids: [...uidSet] }, { merge: true });
    ops++;
    if (ops >= BATCH_SIZE) { batch = db.batch(); batches.push(batch); ops = 0; }
  }
  for (const b of batches) await b.commit();

  return {
    success: true,
    matches: byMatch.size,
    bets: betsSnap.size,
    message: `Backfill færdig: ${byMatch.size} kampe opdateret ud fra ${betsSnap.size} tips.`,
  };
});

// ---------------------------------------------------------------------------
// syncTipParticipation — vedligeholder tipParticipation/{matchId} = { uids: [...] }
// Holder styr på HVEM der har tippet på en kamp (men ikke hvad de tippede),
// så ligaer kan vise "X af N har tippet" og hvem der mangler — uden at afsløre
// nogen forudsigelser før kickoff.
// ---------------------------------------------------------------------------
exports.syncTipParticipation = onDocumentWritten(
  { document: 'bets/{betId}', region: REGION },
  async (event) => {
    const db = getFirestore();
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();

    const matchId = after?.matchId ?? before?.matchId;
    const uid = after?.uid ?? before?.uid;
    if (!matchId || !uid) return;

    const ref = db.collection('tipParticipation').doc(matchId);

    if (after) {
      // Bet oprettet eller opdateret → uid har tippet på kampen
      await ref.set(
        { matchId, uids: FieldValue.arrayUnion(uid) },
        { merge: true },
      );
    } else {
      // Bet slettet → fjern uid (sker normalt ikke fra klienten)
      await ref.set(
        { matchId, uids: FieldValue.arrayRemove(uid) },
        { merge: true },
      );
    }
  }
);

// ---------------------------------------------------------------------------
// buildKnockout — callable funktion (kun owner/global admin)
// Beregner grupperangering og udfylder holdnavne på knockout-kampe
// ---------------------------------------------------------------------------
exports.buildKnockout = onCall({ region: REGION }, async (request) => {
  const db = getFirestore();

  // Tjek autentificering
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Du skal være logget ind.');
  }

  // Hent brugerens rolle
  const userDoc = await db.collection('users').doc(request.auth.uid).get();
  if (!userDoc.exists) {
    throw new HttpsError('permission-denied', 'Brugerprofil ikke fundet.');
  }

  const userRole = userDoc.data()?.role;
  if (userRole !== 'owner' && userRole !== 'globalAdmin') {
    throw new HttpsError('permission-denied', 'Kun owner/global admin kan bygge knockout-bracket.');
  }

  // Hent alle gruppekampe der er finished
  const groupMatchesSnap = await db
    .collection('matches')
    .where('round', '==', 'group')
    .where('status', '==', 'finished')
    .get();

  const finishedGroupMatches = groupMatchesSnap.docs.map((d) => d.data());

  // Byg r32 ud fra grupperesultaterne (ren, testet logik i knockout.js)
  const { assignments: r32Assignments, best8ThirdsGroups, missingGroups } =
    buildR32FromGroupMatches(finishedGroupMatches);

  if (missingGroups.length > 0) {
    throw new HttpsError(
      'failed-precondition',
      `Følgende grupper har ikke alle 6 finished kampe: ${missingGroups.join(', ')}`
    );
  }

  // Opdater knockout-kampe med hold og sæt status til 'scheduled'
  const writeBatch = db.batch();
  let updatedCount = 0;

  for (const assignment of r32Assignments) {
    if (!assignment.home || !assignment.away) continue;

    const matchRef = db.collection('matches').doc(assignment.id);
    writeBatch.update(matchRef, {
      homeTeam:          assignment.home,
      awayTeam:          assignment.away,
      homePlaceholder:   null,
      awayPlaceholder:   null,
      status:            'scheduled',
    });
    updatedCount++;
  }

  await writeBatch.commit();

  return {
    success: true,
    message: `Knockout-bracket bygget. ${updatedCount} r32-kampe opdateret.`,
    best8ThirdsGroups,
  };
});

// ---------------------------------------------------------------------------
// pruneOrphanMatches — callable (kun owner): sletter forældede knockout-kampe.
// Tidligere blev knockout seedet med id'er som 'r32_m01'; efter opdateringen
// hedder de 'ko_r32_1' osv. De gamle dokumenter blev aldrig slettet og fik
// kamp-tællere til at vise for mange kampe. Her fjernes alle knockout-kampe
// (round != 'group') hvis id IKKE starter med 'ko_'.
// ---------------------------------------------------------------------------
exports.pruneOrphanMatches = onCall({ region: REGION }, async (request) => {
  const db = getFirestore();
  if (!request.auth) throw new HttpsError('unauthenticated', 'Du skal være logget ind.');
  const userDoc = await db.collection('users').doc(request.auth.uid).get();
  if (userDoc.data()?.role !== 'owner') {
    throw new HttpsError('permission-denied', 'Kun ejeren kan rydde forældede kampe.');
  }

  const snap = await db.collection('matches').get();
  const orphans = snap.docs.filter((d) => {
    const m = d.data();
    return m.round && m.round !== 'group' && !d.id.startsWith('ko_');
  });

  let batch = db.batch();
  let ops = 0;
  const batches = [batch];
  for (const d of orphans) {
    batch.delete(d.ref);
    if (++ops >= 400) { batch = db.batch(); batches.push(batch); ops = 0; }
  }
  for (const b of batches) await b.commit();

  return {
    success: true,
    deleted: orphans.length,
    ids: orphans.map((d) => d.id),
    remaining: snap.size - orphans.length,
  };
});

// ---------------------------------------------------------------------------
// postSharpshooterNote — callable (kun owner): slå en fast, klar forklaring af
// "🎯 Skarpskytten" op på væggen i alle ligaer, forfattet af VM-Botten.
// dryRun=true poster ikke, men returnerer teksten + antal vægge til forhåndsvisning.
// ---------------------------------------------------------------------------
function fmtPenaltyText(penalty) {
  const n = Math.abs(Number(penalty) || 0);
  const rounded = Number.isInteger(n) ? n : Math.round(n * 10) / 10;
  return rounded === 0 ? '0' : `−${rounded}`;
}

function buildSharpshooterNote(penalty) {
  return [
    '🎯 Ny stilling: Skarpskytten!',
    '',
    'Der er kommet en ny måde at score på under "Stilling" → fanen 🎯 Skarpskytten. Her belønnes du for at ramme antal mål for HVERT hold i hver afsluttede kamp — ikke kun hvem der vinder.',
    '',
    `• Rigtigt antal mål for et hold: +(antal + 1) point (rammer du fx 3 mål = +4). Rigtigt 0 = +1.`,
    `• Forkert antal: minus forskellen — men højst −2 pr. hold, så én vild kamp ikke ødelægger alt.`,
    `• +1 bonus hvis du rammer kampens udfald (hjemmesejr, uafgjort eller udesejr).`,
    `• Ikke tippet en kamp: ${fmtPenaltyText(penalty)} point.`,
    '',
    'Point lægges sammen over alle afsluttede kampe, og hvert hold tæller for sig. Skarpe øjne belønnes — held og lykke! 🍀',
  ].join('\n');
}

exports.postSharpshooterNote = onCall({ region: REGION }, async (request) => {
  const db = getFirestore();
  if (!request.auth) throw new HttpsError('unauthenticated', 'Du skal være logget ind.');
  const userDoc = await db.collection('users').doc(request.auth.uid).get();
  if (userDoc.data()?.role !== 'owner') {
    throw new HttpsError('permission-denied', 'Kun ejeren kan slå opslag op på alle vægge.');
  }

  const dryRun = request.data?.dryRun !== false; // default: tør-kør (sikkerhed)

  const cfg = await db.collection('config').doc('settings').get();
  const penalty = cfg.exists && Number.isFinite(Number(cfg.data().untippedPenalty))
    ? Math.abs(Number(cfg.data().untippedPenalty)) : 2;
  const text = buildSharpshooterNote(penalty);

  const leaguesSnap = await db.collection('leagues').get();
  if (dryRun) {
    return { dryRun: true, text, leagues: leaguesSnap.size };
  }

  let posted = 0;
  for (const league of leaguesSnap.docs) {
    await db.collection('leagueComments').add({
      leagueId: league.id, uid: 'ai-bot', displayName: 'VM-Botten', avatarEmoji: '🤖',
      favoriteTeam: null, text, system: true, createdAt: FieldValue.serverTimestamp(),
    });
    posted += 1;
  }
  return { dryRun: false, text, leagues: posted };
});

// ---------------------------------------------------------------------------
// Hjælpefunktion: genberegn totalPoints for en bruger
// Summer alle bets.points + bonusBets.points for brugeren
// ---------------------------------------------------------------------------
async function recalcUserTotal(db, uid) {
  // Hent brugerens bets/bonusBets samt alle kampe (til runde-opslag)
  const [betsSnap, bonusBetsSnap, matchesSnap] = await Promise.all([
    db.collection('bets').where('uid', '==', uid).get(),
    db.collection('bonusBets').where('uid', '==', uid).get(),
    db.collection('matches').get(),
  ]);

  const roundById = {};
  for (const m of matchesSnap.docs) roundById[m.id] = m.data().round;

  const { total, groupPoints, knockoutPoints, bonusPoints } = computeBreakdown(
    betsSnap.docs.map((d) => d.data()),
    bonusBetsSnap.docs.map((d) => d.data()),
    roundById,
  );

  await db.collection('users').doc(uid).update({
    totalPoints: total,
    groupPoints,
    knockoutPoints,
    bonusPoints,
  });
}

// ---------------------------------------------------------------------------
// snapshotRanks — scheduled: gemmer hver brugers nuværende placering som
// previousRank, så frontenden kan vise bevægelse i stillingen "siden i går".
// Kører tidligt om morgenen (CPH-tid).
// ---------------------------------------------------------------------------
exports.snapshotRanks = onSchedule(
  { schedule: '5 4 * * *', timeZone: TZ, region: REGION },
  async () => {
    const db = getFirestore();
    const snap = await db
      .collection('users')
      .where('status', '==', 'approved')
      .get();

    const users = snap.docs
      .map((d) => ({ id: d.id, total: d.data().totalPoints ?? 0 }))
      .sort((a, b) => b.total - a.total);

    let batch = db.batch();
    let ops = 0;
    const batches = [batch];
    users.forEach((u, idx) => {
      batch.update(db.collection('users').doc(u.id), { previousRank: idx + 1 });
      if (++ops >= 400) { batch = db.batch(); batches.push(batch); ops = 0; }
    });
    for (const b of batches) await b.commit();
    console.log(`snapshotRanks: opdaterede ${users.length} brugere.`);
  }
);

// ---------------------------------------------------------------------------
// tipReminders — scheduled: sender e-mail til spillere der mangler at tippe
// på kampe der spilles i dag (CPH). Bruger Resend-API'et via fetch.
// Sender intet hvis RESEND_API_KEY ikke er sat (graceful no-op).
// ---------------------------------------------------------------------------
function cphDateStr(d) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

// Byg en SMTP-transporter ud fra parametre/secret. Returnerer null hvis der
// ikke er sat en adgangskode (så mail-udsendelse blot springes over).
function buildTransport(password) {
  if (!password) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465, // 465 = implicit TLS; 587 = STARTTLS
    auth: { user: SMTP_USER, pass: password },
  });
}

// Skriv en linje i mail-loggen (emailLog). Fejler aldrig hårdt.
async function logEmail(db, entry) {
  try {
    await db.collection('emailLog').add({ ...entry, createdAt: FieldValue.serverTimestamp() });
  } catch (e) {
    console.error('logEmail: kunne ikke skrive log', e?.message || e);
  }
}

async function sendEmail(db, transporter, { to, subject, html, type }) {
  try {
    await transporter.sendMail({ from: EMAIL_FROM, to, subject, html });
    await logEmail(db, { to, subject, type: type || 'other', status: 'sent', error: null });
  } catch (err) {
    await logEmail(db, { to, subject, type: type || 'other', status: 'failed', error: String(err?.message || err) });
    throw err;
  }
}

// Kerne-logik: send påmindelser om dagens utippede kampe. Returnerer antal sendte.
async function runTipReminders(db, transporter) {
  if (!transporter) { console.log('tipReminders: ingen SMTP_PASSWORD — springer over.'); return { sent: 0, reason: 'no-smtp-password' }; }

  const now = new Date();
  // Rullende 24-timers vindue fra køretidspunktet: kører kl. 09:00, så det dækker
  // kampe fra kl. 09:00 i dag til kl. 08:59 i morgen — uafhængigt af kalenderdag.
  const windowEnd = new Date(now.getTime() + 24 * 3600 * 1000);

  // Kampe det næste døgn der stadig kan tippes (kendte hold, ikke kickoff endnu)
  const matchesSnap = await db
    .collection('matches')
    .where('status', '==', 'scheduled')
    .get();

  const upcomingMatches = matchesSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((m) => m.homeTeam && m.awayTeam && m.kickoff?.toDate
      && m.kickoff.toDate() > now
      && m.kickoff.toDate() < windowEnd);

  if (upcomingMatches.length === 0) { console.log('tipReminders: ingen kampe det næste døgn.'); return { sent: 0, reason: 'no-matches' }; }

  // Hvem har tippet hver kamp (fra tipParticipation)
  const tippedByMatch = {};
  await Promise.all(upcomingMatches.map(async (m) => {
    const p = await db.collection('tipParticipation').doc(m.id).get();
    tippedByMatch[m.id] = new Set(p.exists ? (p.data().uids ?? []) : []);
  }));

  const usersSnap = await db
    .collection('users')
    .where('status', '==', 'approved')
    .get();

  let sent = 0;
  for (const userDoc of usersSnap.docs) {
    const u = userDoc.data();
    if (u.emailOptOut || !u.email) continue;

    const missing = upcomingMatches.filter((m) => !tippedByMatch[m.id].has(userDoc.id));
    if (missing.length === 0) continue;

    const list = missing
      .map((m) => `<li>${m.homeTeam} – ${m.awayTeam}</li>`)
      .join('');
    const html = `
      <p>Hej ${u.displayName || 'spiller'} 👋</p>
      <p>Du mangler at tippe på <strong>${missing.length}</strong> kamp${missing.length === 1 ? '' : 'e'} det næste døgn:</p>
      <ul>${list}</ul>
      <p><a href="${APP_URL}">Afgiv dine tips på vm.vejleaa.dk</a> inden kampstart.</p>
      <p style="color:#888;font-size:12px">Du kan slå disse påmindelser fra på din profilside.</p>`;

    try {
      await sendEmail(db, transporter, {
        to: u.email,
        subject: `⚽ Du mangler at tippe på ${missing.length} kamp${missing.length === 1 ? '' : 'e'} det næste døgn`,
        html,
        type: 'reminder',
      });
      sent++;
    } catch (e) {
      console.error(`tipReminders: kunne ikke sende til ${u.email}:`, e.message);
    }
  }
  console.log(`tipReminders: sendte ${sent} påmindelser.`);
  return { sent, candidates: upcomingMatches.length };
}

exports.tipReminders = onSchedule(
  { schedule: '0 9 * * *', timeZone: TZ, region: REGION, secrets: [SMTP_PASSWORD] },
  async () => { await runTipReminders(getFirestore(), buildTransport(SMTP_PASSWORD.value())); }
);

// Callable: admin kan udløse påmindelserne manuelt (til test).
exports.sendTipRemindersNow = onCall(
  { region: REGION, secrets: [SMTP_PASSWORD] },
  async (request) => {
    const db = getFirestore();
    if (!request.auth) throw new HttpsError('unauthenticated', 'Du skal være logget ind.');
    const userDoc = await db.collection('users').doc(request.auth.uid).get();
    const role = userDoc.data()?.role;
    if (role !== 'owner' && role !== 'globalAdmin') {
      throw new HttpsError('permission-denied', 'Kun owner/global admin kan sende påmindelser.');
    }
    const transporter = buildTransport(SMTP_PASSWORD.value());
    if (!transporter) throw new HttpsError('failed-precondition', 'SMTP_PASSWORD er ikke sat endnu.');
    const result = await runTipReminders(db, transporter);
    return { success: true, ...result };
  }
);

// Callable: send en testmail KUN til admin selv, med alle kampe for de
// første 3 spilledage (uanset om de er tippet).
exports.sendTestReminderToMe = onCall(
  { region: REGION, secrets: [SMTP_PASSWORD] },
  async (request) => {
    const db = getFirestore();
    if (!request.auth) throw new HttpsError('unauthenticated', 'Du skal være logget ind.');
    const userDoc = await db.collection('users').doc(request.auth.uid).get();
    const u = userDoc.data();
    if (!u || (u.role !== 'owner' && u.role !== 'globalAdmin')) {
      throw new HttpsError('permission-denied', 'Kun owner/global admin kan sende testmail.');
    }
    if (!u.email) throw new HttpsError('failed-precondition', 'Din profil har ingen e-mailadresse.');

    const transporter = buildTransport(SMTP_PASSWORD.value());
    if (!transporter) throw new HttpsError('failed-precondition', 'SMTP_PASSWORD er ikke sat endnu.');

    // Alle kampe med kendte hold, sorteret efter kickoff
    const snap = await db.collection('matches').get();
    const playable = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((m) => m.homeTeam && m.awayTeam && m.kickoff?.toDate)
      .sort((a, b) => a.kickoff.toDate() - b.kickoff.toDate());

    // Saml de første 3 spilledage (distinkte CPH-datoer)
    const days = [];
    const byDay = new Map();
    for (const m of playable) {
      const day = cphDateStr(m.kickoff.toDate());
      if (!byDay.has(day)) {
        if (days.length >= 3) break; // sorteret → alle tidligere dage er med
        days.push(day);
        byDay.set(day, []);
      }
      byDay.get(day).push(m);
    }

    if (days.length === 0) throw new HttpsError('failed-precondition', 'Ingen kampe med kendte hold fundet.');

    const dayLabel = (d) => new Intl.DateTimeFormat('da-DK', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' }).format(d);
    const timeLabel = (d) => new Intl.DateTimeFormat('da-DK', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(d);

    let total = 0;
    let html = `<p>Hej ${u.displayName || 'spiller'} 👋</p><p>Testmail — kampene for de første 3 spilledage:</p>`;
    for (const day of days) {
      const ms = byDay.get(day);
      total += ms.length;
      html += `<h3 style="margin:14px 0 4px">${dayLabel(ms[0].kickoff.toDate())}</h3><ul style="margin:0">`;
      for (const m of ms) {
        html += `<li>${timeLabel(m.kickoff.toDate())} — ${m.homeTeam} – ${m.awayTeam}</li>`;
      }
      html += '</ul>';
    }
    html += `<p style="margin-top:14px"><a href="${APP_URL}">Gå til vm.vejleaa.dk</a></p>
      <p style="color:#888;font-size:12px">Dette er en testmail sendt kun til dig.</p>`;

    await sendEmail(db, transporter, {
      to: u.email,
      subject: '🧪 Testmail: kampe for de første 3 spilledage',
      html,
      type: 'test-reminder',
    });

    return { success: true, sentTo: u.email, days: days.length, matches: total };
  }
);

// ---------------------------------------------------------------------------
// Auto-resultater fra football-data.org
//   syncResults    — onSchedule (hvert minut): henter live/afsluttede resultater
//   syncResultsNow — callable (admin): kør synk manuelt (evt. dry-run)
//   syncFixtures   — callable (admin): map vores kampe → football-data-id'er
//
// Klæbende manuel override: når admin retter et resultat sættes manualLock=true,
// og synken rører aldrig den kamp igen (før admin gendanner automatikken).
// ---------------------------------------------------------------------------
const utcDateStr = (ms) => new Date(ms).toISOString().slice(0, 10);

async function requireAdmin(db, request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Du skal være logget ind.');
  const snap = await db.collection('users').doc(request.auth.uid).get();
  const role = snap.data()?.role;
  if (role !== 'owner' && role !== 'globalAdmin') {
    throw new HttpsError('permission-denied', 'Kun owner/global admin har adgang.');
  }
}

// Kerne: synk resultater for kampe i "vinduet" (lige startet / i gang).
// Returnerer en oversigt. Laver kun ét football-data-kald, når der er kampe.
async function runSyncResults(db, token, { now = new Date(), dryRun = false, full = false } = {}) {
  const client = createClient({ token });
  let candidates;
  let fdById;

  if (full) {
    // Backfill: ALLE ikke-færdige kampe med externalId — uanset tidspunkt.
    const snap = await db.collection('matches').get();
    candidates = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((m) => m.externalId && !m.manualLock && m.status !== 'finished');
    if (candidates.length === 0) return { checked: 0, updated: 0, reason: 'no-unfinished-matches' };
    const data = await client.getSeasonMatches(now.getUTCFullYear());
    fdById = new Map((data.matches || []).map((m) => [String(m.id), m]));
  } else {
    // Standard: kun "vinduet" omkring nu (live / netop startede kampe).
    const fromTs = Timestamp.fromMillis(now.getTime() - 3.5 * 3600 * 1000);
    const toTs = Timestamp.fromMillis(now.getTime() + 15 * 60 * 1000);
    const snap = await db.collection('matches')
      .where('kickoff', '>=', fromTs)
      .where('kickoff', '<=', toTs)
      .get();
    candidates = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((m) => m.externalId && !m.manualLock && m.status !== 'finished');
    if (candidates.length === 0) return { checked: 0, updated: 0, reason: 'no-window-matches' };

    // Datospan (UTC) der dækker kandidaterne — typisk samme dag.
    const times = candidates.map((m) => m.kickoff.toMillis());
    const dateFrom = utcDateStr(Math.min(...times));
    const dateTo = utcDateStr(Math.max(...times) + 6 * 3600 * 1000); // dæk kampe der trækker ud
    const data = await client.getMatchesInRange(dateFrom, dateTo);
    fdById = new Map((data.matches || []).map((m) => [String(m.id), m]));
  }

  let updated = 0; const changes = []; let review = 0;
  for (const m of candidates) {
    const fd = fdById.get(String(m.externalId));
    if (!fd) continue;
    const { action, patch } = decideUpdate(m, fd, now);
    if (action === 'skip' || !patch) continue;
    if (action === 'review') review++;
    if (!patchChangesDoc(m, patch)) continue;
    changes.push({ id: m.id, action, result: patch.result, status: patch.status, needsReview: !!patch.needsReview });
    if (!dryRun) {
      // Spred patch og erstat klientens Date med servertid.
      await db.collection('matches').doc(m.id).update({ ...patch, autoUpdatedAt: FieldValue.serverTimestamp() });
    }
    updated++;
  }
  return { checked: candidates.length, updated, review, dryRun, changes };
}

// ---------------------------------------------------------------------------
// AI-morgenopslag (VM-Botten) — genererer hver morgen kl. 07:00 et kort dansk
// vægopslag pr. liga om seneste døgns udvikling. Bruger Claude (Opus 4.8).
// ---------------------------------------------------------------------------

/** ms-tidsstempel fra et Firestore-Timestamp/Date/ms, ellers null. */
function tsToMs(ts) {
  if (!ts) return null;
  if (typeof ts.toDate === 'function') return ts.toDate().getTime();
  const t = new Date(ts).getTime();
  return Number.isNaN(t) ? null : t;
}

// Saml fakta ÉN gang (deles af alle ligaer): afsluttede kampe (med runde +
// kickoff) i et bredt vindue, rå tip-point pr. kamp/spiller, og kommende kampe.
// Selve "siden sidste opslag"-afgrænsningen + ligaens scoring påføres pr. liga.
async function gatherRecapData(db, now) {
  const startMs = now.getTime() - 72 * 3600 * 1000; // bredt nok til 'siden sidste opslag'
  const finSnap = await db.collection('matches')
    .where('kickoff', '>=', Timestamp.fromMillis(startMs))
    .where('kickoff', '<=', Timestamp.fromMillis(now.getTime()))
    .get();
  const finished = finSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((m) => m.status === 'finished' && m.result)
    .map((m) => ({
      id: m.id,
      round: m.round || 'group',
      home: m.homeTeam,
      away: m.awayTeam,
      score: `${m.result.home}-${m.result.away}`,
      kickoffMs: tsToMs(m.kickoff) ?? 0,
    }));

  // Rå tip-point pr. kamp pr. spiller (uden ligaens scoring-regler endnu).
  const pointsByMatchUid = {};
  for (const m of finished) {
    const bets = await db.collection('bets').where('matchId', '==', m.id).get();
    const map = {};
    for (const b of bets.docs) {
      const x = b.data();
      map[x.uid] = Number(x.points || 0);
    }
    pointsByMatchUid[m.id] = map;
  }

  const upSnap = await db.collection('matches')
    .where('kickoff', '>=', Timestamp.fromMillis(now.getTime()))
    .where('kickoff', '<=', Timestamp.fromMillis(now.getTime() + 24 * 3600 * 1000))
    .get();
  const upcoming = upSnap.docs
    .map((d) => d.data())
    .filter((m) => m.homeTeam && m.awayTeam)
    .map((m) => ({
      home: m.homeTeam, away: m.awayTeam,
      time: m.kickoff.toDate().toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit', timeZone: TZ }),
    }));

  // Officielle bonusspørgsmål (topscorer/gruppevinder) afgjort i vinduet, så
  // VM-Botten kan nævne dem og lade nattens point afspejle dem.
  const bqSnap = await db.collection('bonusQuestions').get();
  const resolvedBonus = [];
  for (const d of bqSnap.docs) {
    const q = d.data();
    const resolvedMs = tsToMs(q.resolvedAt);
    if (!q.facit || resolvedMs == null || resolvedMs < startMs) continue;
    resolvedBonus.push({ id: d.id, type: q.type || null, label: q.label || '', facit: q.facit, resolvedMs });
  }
  // Point pr. spiller for hvert afgjort spørgsmål (til at fordele nattens bonus).
  const bonusPtsByQ = {};
  for (const q of resolvedBonus) {
    const bets = await db.collection('bonusBets').where('questionId', '==', q.id).get();
    const map = {};
    for (const b of bets.docs) {
      const x = b.data();
      if (x.points) map[x.uid] = Number(x.points);
    }
    bonusPtsByQ[q.id] = map;
  }

  return { finished, pointsByMatchUid, upcoming, resolvedBonus, bonusPtsByQ };
}

/**
 * Afgræns til kampe siden ligaens sidste opslag og påfør ligaens scoring, så
 * "dayPoints" hviler på samme grundlag som totalen (leagueTotal).
 */
function recapWindowForLeague({ league, finished, pointsByMatchUid, resolvedBonus = [], bonusPtsByQ = {}, now }) {
  const lastMs = tsToMs(league.lastRecapAt) ?? (now.getTime() - 26 * 3600 * 1000);
  const windowMatches = finished.filter((m) => m.kickoffMs > lastMs);
  const memberUids = league.memberUids || [];
  const dayPointsByUid = {};
  for (const m of windowMatches) {
    const map = pointsByMatchUid[m.id] || {};
    for (const uid of memberUids) {
      const pts = leagueMatchPoints(map[uid], m.round, league.scoring);
      if (pts) dayPointsByUid[uid] = (dayPointsByUid[uid] || 0) + pts;
    }
  }

  // Officiel bonus tæller kun, hvis ligaen ikke har slået den fra (default til).
  const countsBonus = !league.scoring || league.scoring.bonus !== false;
  const windowBonus = countsBonus ? resolvedBonus.filter((q) => q.resolvedMs > lastMs) : [];
  for (const q of windowBonus) {
    const map = bonusPtsByQ[q.id] || {};
    for (const uid of memberUids) {
      const pts = Number(map[uid] || 0);
      if (pts) dayPointsByUid[uid] = (dayPointsByUid[uid] || 0) + pts;
    }
  }

  const matches = windowMatches.map((m) => ({ home: m.home, away: m.away, score: m.score }));
  const bonusResolved = windowBonus.map((q) => ({ type: q.type, label: q.label, facit: q.facit }));
  return { dayPointsByUid, matches, bonusResolved };
}

function recapAlreadyToday(ts, now) {
  if (!ts) return false;
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const fmt = (x) => x.toLocaleDateString('da-DK', { timeZone: TZ });
  return fmt(d) === fmt(now);
}

async function generateRecapText(anthropic, facts) {
  // Prøv igen ved midlertidige fejl (rate-limit/overbelastning) med backoff.
  let attempt = 0;
  for (;;) {
    try {
      const res = await anthropic.messages.create({
        model: 'claude-opus-4-8',
        max_tokens: 600,
        thinking: { type: 'adaptive' },
        system: RECAP_SYSTEM,
        messages: [{ role: 'user', content: JSON.stringify(facts) }],
      });
      return (res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
    } catch (err) {
      attempt += 1;
      const status = err?.status;
      const retryable = status === 429 || status === 500 || status === 503 || status === 529;
      if (retryable && attempt < 4) {
        await new Promise((r) => setTimeout(r, attempt * 5000)); // 5s, 10s, 15s
        continue;
      }
      throw err;
    }
  }
}

async function runGenerateLeagueRecaps(db, apiKey, { now = new Date(), dryRun = false, onlyLeagueId = null } = {}) {
  const anthropic = new Anthropic({ apiKey });
  const { finished, pointsByMatchUid, upcoming, resolvedBonus, bonusPtsByQ } = await gatherRecapData(db, now);

  const usersSnap = await db.collection('users').get();
  const usersById = new Map(usersSnap.docs.map((d) => [d.id, { id: d.id, ...d.data() }]));

  const leaguesSnap = await db.collection('leagues').where('status', '==', 'approved').get();
  const results = [];
  for (const ld of leaguesSnap.docs) {
    const league = { id: ld.id, ...ld.data() };
    if (onlyLeagueId && league.id !== onlyLeagueId) continue;
    if (league.aiRecaps === false) continue; // ejer har slået det fra
    const members = (league.memberUids || []).map((uid) => usersById.get(uid)).filter(Boolean);
    if (members.length < 2) continue;
    if (!dryRun && recapAlreadyToday(league.lastRecapAt, now)) continue;

    // Kun kampe/point siden ligaens sidste opslag, med ligaens scoring påført.
    const { dayPointsByUid, matches, bonusResolved } = recapWindowForLeague({
      league, finished, pointsByMatchUid, resolvedBonus, bonusPtsByQ, now,
    });
    const facts = buildRecapFacts({ league, members, dayPointsByUid, matches, bonusResolved, upcoming, now });
    let text;
    try {
      text = await generateRecapText(anthropic, facts);
    } catch (err) {
      console.error('leagueRecap: AI-fejl for liga', league.id, err?.message || err);
      continue;
    }
    if (!text) continue;
    results.push({ leagueId: league.id, leagueName: league.name, text });

    if (!dryRun) {
      await db.collection('leagueComments').add({
        leagueId: league.id, uid: 'ai-bot', displayName: 'VM-Botten', avatarEmoji: '🤖',
        favoriteTeam: null, text, system: true, createdAt: FieldValue.serverTimestamp(),
      });
      await db.collection('leagues').doc(league.id).set(
        { lastRecapAt: FieldValue.serverTimestamp() }, { merge: true });
    }
  }
  return { leagues: results.length, results };
}

/** Nuværende 'HH:MM' i Europe/Copenhagen (robust mod "24:00" ved midnat). */
function cphHourMinute(now) {
  const s = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(now);
  return s.replace(/^24:/, '00:');
}

// Skemalagt: kører hvert 5. minut, men poster kun på det tidspunkt admin har
// valgt i config/settings.recapTime (default 08:15, Europe/Copenhagen) — og
// kun én gang i døgnet. Det gør tidspunktet justerbart uden gen-deploy.
exports.generateLeagueRecaps = onSchedule(
  { schedule: '*/5 * * * *', timeZone: TZ, region: REGION, secrets: [ANTHROPIC_API_KEY] },
  async () => {
    const db = getFirestore();
    const apiKey = ANTHROPIC_API_KEY.value();
    if (!apiKey) { console.log('generateLeagueRecaps: ANTHROPIC_API_KEY ikke sat — springer over.'); return; }

    const now = new Date();
    const settingsSnap = await db.collection('config').doc('settings').get();
    const recapTime = (settingsSnap.exists && settingsSnap.data().recapTime) || RECAP_DEFAULT_TIME;

    // Uden for det valgte tidsvindue: gør intet.
    if (!recapWindowOpen(cphHourMinute(now), recapTime, 60)) return;

    // Vent hvis en kamp er i gang: live-kampe får foreløbige point, som ville
    // forurene stillingen i opslaget. Prøver igen ved næste tick (inden for vinduet).
    const liveSnap = await db.collection('matches').where('status', '==', 'live').limit(1).get();
    if (!liveSnap.empty) {
      console.log('generateLeagueRecaps: kamp i gang — udskyder opslaget.');
      return;
    }

    // Kør højst én gang pr. dag.
    const runRef = db.collection('config').doc('aiRecapRun');
    const runSnap = await runRef.get();
    const todayStr = now.toLocaleDateString('da-DK', { timeZone: TZ });
    if (runSnap.exists && runSnap.data().lastRunDate === todayStr) return;

    try {
      const res = await runGenerateLeagueRecaps(db, apiKey, { now });
      await runRef.set(
        { lastRunDate: todayStr, leagues: res.leagues, at: FieldValue.serverTimestamp() },
        { merge: true },
      );
      console.log(`generateLeagueRecaps: postede i ${res.leagues} liga(er) (kl. ${recapTime}).`);
    } catch (err) {
      console.error('generateLeagueRecaps: fejl', err);
    }
  }
);

// Manuel forhåndsvisning/kørsel (owner/global admin). dryRun=true poster ikke.
exports.generateLeagueRecapNow = onCall(
  { region: REGION, secrets: [ANTHROPIC_API_KEY] },
  async (request) => {
    const db = getFirestore();
    await requireAdmin(db, request);
    const apiKey = ANTHROPIC_API_KEY.value();
    if (!apiKey) throw new HttpsError('failed-precondition', 'ANTHROPIC_API_KEY er ikke sat.');
    return runGenerateLeagueRecaps(db, apiKey, {
      dryRun: request.data?.dryRun === true,
      onlyLeagueId: request.data?.leagueId || null,
    });
  }
);

// ---------------------------------------------------------------------------
// Engangs: genskriv ALLE VM-Bottens gamle opslag med den korrekte logik, ud fra
// stillingen som den var DA opslaget blev lavet. Kun teksten ændres — createdAt
// (tidspunktet) røres aldrig. Totaler rekonstrueres fra kampresultater (bonus
// medregnes ikke; forsvindende i gruppespillet).
async function gatherAllMatchesAndPoints(db) {
  const snap = await db.collection('matches').get();
  const all = snap.docs.map((d) => {
    const m = d.data();
    return {
      id: d.id, round: m.round || 'group', home: m.homeTeam, away: m.awayTeam,
      status: m.status, result: m.result || null, kickoffMs: tsToMs(m.kickoff) ?? 0,
    };
  });
  const finished = all
    .filter((m) => m.status === 'finished' && m.result)
    .map((m) => ({
      id: m.id, round: m.round, home: m.home, away: m.away,
      score: `${m.result.home}-${m.result.away}`, kickoffMs: m.kickoffMs,
    }));
  const pointsByMatchUid = {};
  for (const m of finished) {
    const bets = await db.collection('bets').where('matchId', '==', m.id).get();
    const map = {};
    for (const b of bets.docs) { const x = b.data(); map[x.uid] = Number(x.points || 0); }
    pointsByMatchUid[m.id] = map;
  }
  return { all, finished, pointsByMatchUid };
}

// Genskriv bottens opslag i SMÅ BIDDER, så det ikke timer ud, kan genoptages,
// og springer allerede-genskrevne over (markeret med regeneratedAt). reset=true
// fjerner markeringen, så man kan starte forfra.
async function runRegenerateRecaps(db, apiKey, { apply = false, reset = false, limit = 8 } = {}) {
  const usersSnap = await db.collection('users').get();
  const usersById = new Map(usersSnap.docs.map((d) => [d.id, { id: d.id, ...d.data() }]));
  const leaguesSnap = await db.collection('leagues').where('status', '==', 'approved').get();

  // Byg pr-liga liste af bot-opslag (ældste først) med "done"-flag.
  const leagueBlocks = [];
  for (const ld of leaguesSnap.docs) {
    const league = { id: ld.id, ...ld.data() };
    const memberDocs = (league.memberUids || []).map((uid) => usersById.get(uid)).filter(Boolean);
    if (memberDocs.length < 2) continue;
    const postsSnap = await db.collection('leagueComments').where('leagueId', '==', league.id).get();
    const posts = postsSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((p) => p.uid === 'ai-bot' && tsToMs(p.createdAt) != null)
      .map((p) => ({ id: p.id, createdAtMs: tsToMs(p.createdAt), oldText: p.text || '', done: !!p.regeneratedAt }))
      .sort((a, b) => a.createdAtMs - b.createdAtMs);
    leagueBlocks.push({ league, memberDocs, memberIds: memberDocs.map((u) => u.id), posts });
  }
  const totalBot = leagueBlocks.reduce((n, b) => n + b.posts.length, 0);

  if (reset) {
    let cleared = 0;
    for (const b of leagueBlocks) {
      for (const p of b.posts) {
        if (!p.done) continue;
        await db.collection('leagueComments').doc(p.id).update({ regeneratedAt: FieldValue.delete() });
        cleared++;
      }
    }
    return { reset: true, cleared, totalBot };
  }

  const anthropic = new Anthropic({ apiKey });
  const { all, finished, pointsByMatchUid } = await gatherAllMatchesAndPoints(db);

  const previews = [];
  let updated = 0;
  let processed = 0;
  let stop = false;
  let lastError = null;
  for (const blk of leagueBlocks) {
    if (stop) break;
    const { league, memberDocs, memberIds, posts } = blk;
    for (let i = 0; i < posts.length; i++) {
      const p = posts[i];
      if (apply && p.done) continue; // genoptagelig: spring allerede-genskrevne over
      if (processed >= limit) { stop = true; break; }

      const T = p.createdAtMs;
      const prevMs = i > 0 ? posts[i - 1].createdAtMs : (T - 26 * 3600 * 1000);
      const windowMatches = finished.filter((m) => m.kickoffMs > prevMs && m.kickoffMs <= T);
      const members = historicalMembers(memberDocs, finished, pointsByMatchUid, T);
      const dayPointsByUid = windowDayPoints(memberIds, windowMatches, pointsByMatchUid, league.scoring);
      const matches = windowMatches.map((m) => ({ home: m.home, away: m.away, score: m.score }));
      const upcoming = all
        .filter((m) => m.home && m.away && m.kickoffMs > T && m.kickoffMs <= T + 24 * 3600 * 1000)
        .sort((a, b) => a.kickoffMs - b.kickoffMs)
        .map((m) => ({
          home: m.home, away: m.away,
          time: new Date(m.kickoffMs).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit', timeZone: TZ }),
        }));
      const facts = buildRecapFacts({ league, members, dayPointsByUid, matches, upcoming, now: new Date(T) });

      let newText;
      try {
        newText = await generateRecapText(anthropic, facts);
      } catch (err) {
        lastError = err?.message || String(err);
        console.error('regenerateRecaps: AI-fejl', league.id, p.id, lastError);
        continue; // ikke markeret → prøves igen næste gang
      }
      if (!newText) continue;

      processed++;
      const dateStr = new Date(T).toLocaleString('da-DK', { timeZone: TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      previews.push({ leagueName: league.name || 'ligaen', date: dateStr, oldText: p.oldText, newText });

      if (apply) {
        await db.collection('leagueComments').doc(p.id).update({
          text: newText, regeneratedAt: FieldValue.serverTimestamp(),
        });
        updated++;
        p.done = true;
      }
    }
  }

  const doneCount = leagueBlocks.reduce((n, b) => n + b.posts.filter((x) => x.done).length, 0);
  const remaining = apply ? Math.max(totalBot - doneCount, 0) : 0;
  return { apply, leagues: leagueBlocks.length, totalBot, processed, updated, remaining, previews, lastError };
}

// Owner-only. Tør-kør (apply=false) viser eksempler; apply=true gemmer i bidder
// (kald gentagne gange til remaining=0); reset=true rydder genskrivnings-markeringen.
exports.regenerateRecaps = onCall(
  { region: REGION, secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 540, memory: '512MiB' },
  async (request) => {
    const db = getFirestore();
    if (!request.auth) throw new HttpsError('unauthenticated', 'Du skal være logget ind.');
    const role = (await db.collection('users').doc(request.auth.uid).get()).data()?.role;
    if (role !== 'owner') throw new HttpsError('permission-denied', 'Kun ejeren kan genskrive botopslag.');
    const apiKey = ANTHROPIC_API_KEY.value();
    if (!apiKey) throw new HttpsError('failed-precondition', 'ANTHROPIC_API_KEY er ikke sat.');
    return runRegenerateRecaps(db, apiKey, {
      apply: request.data?.apply === true,
      reset: request.data?.reset === true,
      limit: Math.min(Math.max(Number(request.data?.limit) || 8, 1), 20),
    });
  }
);

exports.syncResults = onSchedule(
  { schedule: 'every 1 minutes', timeZone: TZ, region: REGION, secrets: [FOOTBALL_DATA_TOKEN] },
  async () => {
    const db = getFirestore();
    const statusRef = db.collection('config').doc('syncStatus');
    const token = FOOTBALL_DATA_TOKEN.value();
    if (!token) {
      console.log('syncResults: FOOTBALL_DATA_TOKEN ikke sat — springer over.');
      await statusRef.set({
        lastRunAt: FieldValue.serverTimestamp(),
        lastError: 'FOOTBALL_DATA_TOKEN ikke sat',
        lastErrorAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return;
    }
    try {
      const res = await runSyncResults(db, token);
      await statusRef.set({
        lastRunAt: FieldValue.serverTimestamp(),
        lastSuccessAt: FieldValue.serverTimestamp(),
        checked: res.checked ?? 0,
        updated: res.updated ?? 0,
        reason: res.reason ?? null,
        lastError: null,
      }, { merge: true });
      if (res.updated) console.log(`syncResults: opdaterede ${res.updated} kamp(e).`, res.changes);
    } catch (err) {
      console.error('syncResults: fejl', err);
      await statusRef.set({
        lastRunAt: FieldValue.serverTimestamp(),
        lastError: String(err?.message || err),
        lastErrorAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      throw err; // lad Cloud Function-kørslen markeres som fejlet (synlig i logs)
    }
  }
);

exports.syncResultsNow = onCall(
  { region: REGION, secrets: [FOOTBALL_DATA_TOKEN] },
  async (request) => {
    const db = getFirestore();
    await requireAdmin(db, request);
    const token = FOOTBALL_DATA_TOKEN.value();
    if (!token) throw new HttpsError('failed-precondition', 'FOOTBALL_DATA_TOKEN er ikke sat.');
    return runSyncResults(db, token, {
      dryRun: request.data?.dryRun === true,
      full: request.data?.full === true,
    });
  }
);

// Map vores kampe til football-data-id'er (gemmes som externalId på kampen).
exports.syncFixtures = onCall(
  { region: REGION, secrets: [FOOTBALL_DATA_TOKEN] },
  async (request) => {
    const db = getFirestore();
    await requireAdmin(db, request);
    const token = FOOTBALL_DATA_TOKEN.value();
    if (!token) throw new HttpsError('failed-precondition', 'FOOTBALL_DATA_TOKEN er ikke sat.');

    const season = Number(request.data?.season) || new Date().getUTCFullYear();
    const dryRun = request.data?.dryRun === true;
    const fixKickoff = request.data?.fixKickoff === true;
    const client = createClient({ token });
    const data = await client.getSeasonMatches(season);
    const fdMatches = data.matches || [];

    const snap = await db.collection('matches').get();
    const ours = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    let mapped = 0; let already = 0; const unmatched = []; const unmatchedDetail = [];
    const batch = db.batch();
    for (const m of ours) {
      if (!m.homeTeam || !m.awayTeam) continue; // ukendte hold (knockout-pladsholdere)
      const fd = matchFixture(m, fdMatches);
      if (!fd) {
        unmatched.push(m.id);
        unmatchedDetail.push({ id: m.id, home: m.homeTeam, away: m.awayTeam });
        continue;
      }
      if (String(m.externalId) === String(fd.id)) { already++; continue; }
      if (!dryRun) batch.update(db.collection('matches').doc(m.id), { externalId: String(fd.id) });
      mapped++;
    }
    if (mapped > 0 && !dryRun) await batch.commit();

    // Tjek/ret kamptider mod football-data (matcher på hold → fanger også store fejl).
    let kickoffChanges = [];
    if (fixKickoff) {
      kickoffChanges = auditKickoffs(ours, fdMatches);
      if (!dryRun && kickoffChanges.length > 0) {
        const kb = db.batch();
        for (const c of kickoffChanges) {
          kb.update(db.collection('matches').doc(c.id), {
            kickoff: Timestamp.fromMillis(Date.parse(c.toISO)),
            externalId: c.fdId,
          });
        }
        await kb.commit();
      }
    }

    return {
      season, totalFixtures: fdMatches.length, mapped, already, unmatched, unmatchedDetail,
      dryRun, kickoffChanges,
    };
  }
);

// ---------------------------------------------------------------------------
// Topscorere (Golden Boot) — synk fra football-data.org /scorers og gem som
// config/topScorers, så frontenden kan vise et live "kapløb om guldstøvlen".
// ---------------------------------------------------------------------------
async function runSyncScorers(db, token, { limit = 20 } = {}) {
  const client = createClient({ token });
  const data = await client.getScorers(limit);
  const list = mapScorers(data);
  await db.collection('config').doc('topScorers').set({
    list,
    count: list.length,
    season: data?.season?.startDate ? String(data.season.startDate).slice(0, 4) : null,
    updatedAt: FieldValue.serverTimestamp(),
    lastError: null,
  }, { merge: true });
  return { count: list.length, top: list[0]?.playerName || null };
}

// Skemalagt: hver 30. minut (topscorere ændrer sig langsomt).
exports.syncScorers = onSchedule(
  { schedule: 'every 30 minutes', timeZone: TZ, region: REGION, secrets: [FOOTBALL_DATA_TOKEN] },
  async () => {
    const db = getFirestore();
    const token = FOOTBALL_DATA_TOKEN.value();
    if (!token) { console.log('syncScorers: FOOTBALL_DATA_TOKEN ikke sat — springer over.'); return; }
    try {
      const res = await runSyncScorers(db, token);
      if (res.count) console.log(`syncScorers: ${res.count} scorere, top: ${res.top}`);
    } catch (err) {
      console.error('syncScorers: fejl', err);
      // Gem fejlen, men kast ikke videre (topscorere er ikke kritiske).
      await db.collection('config').doc('topScorers').set({
        lastError: String(err?.message || err),
        lastErrorAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
  }
);

// Manuel opdatering (owner/global admin).
exports.syncScorersNow = onCall(
  { region: REGION, secrets: [FOOTBALL_DATA_TOKEN] },
  async (request) => {
    const db = getFirestore();
    await requireAdmin(db, request);
    const token = FOOTBALL_DATA_TOKEN.value();
    if (!token) throw new HttpsError('failed-precondition', 'FOOTBALL_DATA_TOKEN er ikke sat.');
    return runSyncScorers(db, token, { limit: Number(request.data?.limit) || 20 });
  }
);

// ---------------------------------------------------------------------------
// Kampdetaljer — mål, kort og opstillinger pr. kamp fra /matches/{id}.
// Henter detaljer for kampe i "vinduet" (snart i gang / live / netop afsluttet)
// og gemmer dem som `details` på kamp-doc'et. Rører ALDRIG result/status, så
// det kan ikke forstyrre point-beregningen. Skriver kun ved ændringer.
// ---------------------------------------------------------------------------
async function runSyncMatchDetails(db, token, { now = new Date() } = {}) {
  const fromTs = Timestamp.fromMillis(now.getTime() - 3.5 * 3600 * 1000);
  const toTs = Timestamp.fromMillis(now.getTime() + 75 * 60 * 1000); // dæk opstillinger ~1t før

  const snap = await db.collection('matches')
    .where('kickoff', '>=', fromTs)
    .where('kickoff', '<=', toTs)
    .get();

  const candidates = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((m) => m.externalId);

  if (candidates.length === 0) return { checked: 0, updated: 0, reason: 'no-window-matches' };

  const client = createClient({ token });
  let updated = 0;
  for (const m of candidates) {
    let raw;
    try {
      raw = await client.getMatch(m.externalId);
    } catch (err) {
      console.error(`syncMatchDetails: kunne ikke hente kamp ${m.id}/${m.externalId}`, err?.message || err);
      continue;
    }
    const details = mapMatchDetails(raw);
    // Skriv kun hvis noget faktisk har ændret sig (sparer skrivninger).
    if (JSON.stringify(m.details || null) === JSON.stringify(details)) continue;
    await db.collection('matches').doc(m.id).set(
      { details, detailsUpdatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    updated++;
  }
  return { checked: candidates.length, updated };
}

// Skemalagt: hver 2. minut (kun når der er kampe i vinduet).
exports.syncMatchDetails = onSchedule(
  { schedule: 'every 2 minutes', timeZone: TZ, region: REGION, secrets: [FOOTBALL_DATA_TOKEN] },
  async () => {
    const db = getFirestore();
    const token = FOOTBALL_DATA_TOKEN.value();
    if (!token) { console.log('syncMatchDetails: FOOTBALL_DATA_TOKEN ikke sat — springer over.'); return; }
    try {
      const res = await runSyncMatchDetails(db, token);
      if (res.updated) console.log(`syncMatchDetails: opdaterede detaljer for ${res.updated} kamp(e).`);
    } catch (err) {
      console.error('syncMatchDetails: fejl', err);
    }
  }
);

// Manuel opdatering (owner/global admin).
exports.syncMatchDetailsNow = onCall(
  { region: REGION, secrets: [FOOTBALL_DATA_TOKEN] },
  async (request) => {
    const db = getFirestore();
    await requireAdmin(db, request);
    const token = FOOTBALL_DATA_TOKEN.value();
    if (!token) throw new HttpsError('failed-precondition', 'FOOTBALL_DATA_TOKEN er ikke sat.');
    return runSyncMatchDetails(db, token);
  }
);

// ---------------------------------------------------------------------------
// Officiel stilling — gruppetabeller med form fra football-data.org /standings.
// Gemmes som config/standings, så frontenden kan vise den officielle tabel.
// ---------------------------------------------------------------------------
async function runSyncStandings(db, token) {
  const client = createClient({ token });
  const data = await client.getStandings();
  const tables = mapStandings(data);
  await db.collection('config').doc('standings').set({
    tables,
    updatedAt: FieldValue.serverTimestamp(),
    lastError: null,
  }, { merge: true });

  // Hent også turneringsmeta (logo, navn, spilledag) — ændrer sig sjældent.
  let competition = null;
  try {
    competition = mapCompetition(await client.getCompetition());
    await db.collection('config').doc('competition').set({
      ...competition, updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  } catch (err) {
    console.error('runSyncStandings: kunne ikke hente turneringsmeta', err?.message || err);
  }
  return { tables: tables.length, emblem: competition?.emblem ?? null };
}

exports.syncStandings = onSchedule(
  { schedule: 'every 30 minutes', timeZone: TZ, region: REGION, secrets: [FOOTBALL_DATA_TOKEN] },
  async () => {
    const db = getFirestore();
    const token = FOOTBALL_DATA_TOKEN.value();
    if (!token) { console.log('syncStandings: FOOTBALL_DATA_TOKEN ikke sat — springer over.'); return; }
    try {
      const res = await runSyncStandings(db, token);
      if (res.tables) console.log(`syncStandings: ${res.tables} tabel(ler).`);
    } catch (err) {
      console.error('syncStandings: fejl', err);
      await db.collection('config').doc('standings').set({
        lastError: String(err?.message || err), lastErrorAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
  }
);

exports.syncStandingsNow = onCall(
  { region: REGION, secrets: [FOOTBALL_DATA_TOKEN] },
  async (request) => {
    const db = getFirestore();
    await requireAdmin(db, request);
    const token = FOOTBALL_DATA_TOKEN.value();
    if (!token) throw new HttpsError('failed-precondition', 'FOOTBALL_DATA_TOKEN er ikke sat.');
    return runSyncStandings(db, token);
  }
);

// ---------------------------------------------------------------------------
// previewFootballData — owner/global admin: henter LIVE data fra en valgfri
// turnering (default Bundesliga BL1, indeværende sæson) og returnerer det
// normaliseret, så admin kan forhåndsvise hvordan topscorere, stilling og
// kampdetaljer kommer til at se ud — før VM går i gang. Skriver intet i basen.
// ---------------------------------------------------------------------------
exports.previewFootballData = onCall(
  { region: REGION, secrets: [FOOTBALL_DATA_TOKEN] },
  async (request) => {
    const db = getFirestore();
    await requireAdmin(db, request);
    const token = FOOTBALL_DATA_TOKEN.value();
    if (!token) throw new HttpsError('failed-precondition', 'FOOTBALL_DATA_TOKEN er ikke sat.');
    const code = String(request.data?.code || 'BL1').toUpperCase();
    const client = createClient({ token });

    const out = { code };
    try { out.scorers = mapScorers(await client.getScorers(15, code)); }
    catch (err) { out.scorersError = String(err?.message || err); out.scorers = []; }
    try { out.standings = mapStandings(await client.getStandings(code)); }
    catch (err) { out.standingsError = String(err?.message || err); out.standings = []; }

    // Seneste afsluttede kamp → fuld detalje (mål, kort, opstillinger).
    out.sampleMatch = null;
    try {
      const fin = await client.getFinishedMatches(code);
      const matches = Array.isArray(fin?.matches) ? fin.matches : [];
      const last = matches[matches.length - 1];
      if (last?.id) {
        const raw = await client.getMatch(last.id);
        const ft = last.score?.fullTime || {};
        out.sampleMatch = {
          homeName: last.homeTeam?.name ?? 'Hjemme',
          awayName: last.awayTeam?.name ?? 'Ude',
          utcDate: last.utcDate ?? null,
          result: (ft.home != null) ? { home: ft.home, away: ft.away } : null,
          details: mapMatchDetails(raw),
        };
      }
    } catch (err) { out.sampleMatchError = String(err?.message || err); }

    return out;
  }
);

// ---------------------------------------------------------------------------
// inspectFootballData — owner/global admin: prober football-data.org-endpoints
// med jeres token og rapporterer hvilke felter jeres TIER giver adgang til.
// Henter intet ind i basen; bruges kun til at beslutte hvad vi kan bygge på.
// ---------------------------------------------------------------------------
exports.inspectFootballData = onCall(
  { region: REGION, secrets: [FOOTBALL_DATA_TOKEN] },
  async (request) => {
    const db = getFirestore();
    await requireAdmin(db, request);
    const token = FOOTBALL_DATA_TOKEN.value();
    if (!token) throw new HttpsError('failed-precondition', 'FOOTBALL_DATA_TOKEN er ikke sat.');
    const client = createClient({ token });

    // Prober hvert endpoint isoleret, så ét manglende (403) ikke vælter resten.
    const probe = async (label, fn, summarize) => {
      try {
        const data = await fn();
        return { label, ok: true, ...summarize(data) };
      } catch (err) {
        const msg = String(err?.message || err);
        const forbidden = /403/.test(msg);
        return { label, ok: false, forbidden, error: forbidden ? 'Ikke tilgængelig på jeres tier (403).' : msg };
      }
    };

    // Find en allerede-spillet kamp at probe detaljer på.
    let sampleMatchId = null;
    const finishedSnap = await db.collection('matches')
      .where('status', '==', 'finished').limit(1).get();
    if (!finishedSnap.empty) sampleMatchId = finishedSnap.docs[0].data().externalId || null;

    const result = {
      checkedAt: new Date().toISOString(),
      competitionCode: client.competitionCode,
      scorers: await probe('scorers', () => client.getScorers(5), summarizeScorers),
      standings: await probe('standings', () => client.getStandings(), summarizeStandings),
    };
    if (sampleMatchId) {
      result.matchDetail = await probe('matchDetail', () => client.getMatch(sampleMatchId), summarizeMatchDetail);
      result.matchDetail.sampleMatchId = String(sampleMatchId);
    } else {
      result.matchDetail = { label: 'matchDetail', ok: false, error: 'Ingen afsluttet VM-kamp endnu (turneringen er ikke begyndt).' };
    }

    // VM 2026 er måske ikke begyndt endnu → tomme svar siger intet om tieren.
    // Prob derfor en AKTIV reference-turnering (default Premier League) med
    // rigtige data, så vi entydigt kan se hvilke felter tieren leverer.
    const refCode = String(request.data?.referenceCode || 'PL').toUpperCase();
    const reference = { code: refCode };
    reference.scorers = await probe('refScorers', () => client.getScorers(5, refCode), summarizeScorers);
    try {
      const fin = await client.getFinishedMatches(refCode);
      const matches = Array.isArray(fin?.matches) ? fin.matches : [];
      const last = matches[matches.length - 1];
      if (last?.id) {
        reference.matchDetail = await probe('refMatchDetail', () => client.getMatch(last.id), summarizeMatchDetail);
        reference.matchDetail.sampleMatchId = String(last.id);
      } else {
        reference.matchDetail = { label: 'refMatchDetail', ok: false, error: 'Ingen afsluttede kampe i reference-turneringen.' };
      }
    } catch (err) {
      const msg = String(err?.message || err);
      reference.matchDetail = { label: 'refMatchDetail', ok: false, forbidden: /403/.test(msg), error: msg };
    }
    result.reference = reference;

    return result;
  }
);

// ---------------------------------------------------------------------------
// Gruppevindere — afgøres automatisk ud fra grupperesultaterne, på samme måde
// som auto-resultater. Når en gruppe er færdigspillet (6 finished kampe),
// sættes facit på det tilsvarende groupWinner-bonusspørgsmål; recomputeBonus
// giver så automatisk point. Allerede satte facit (fx manuelt) røres aldrig.
// ---------------------------------------------------------------------------
async function runResolveGroupWinners(db, { dryRun = false } = {}) {
  const qSnap = await db.collection('bonusQuestions').where('type', '==', 'groupWinner').get();
  const questions = qSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const open = questions.filter((q) => q.facit == null || String(q.facit).trim() === '');
  if (open.length === 0) return { resolved: 0, pending: 0, changes: [] };

  const mSnap = await db.collection('matches')
    .where('round', '==', 'group')
    .where('status', '==', 'finished')
    .get();
  const finishedGroupMatches = mSnap.docs.map((d) => d.data());

  const resolutions = resolveGroupWinners(open, finishedGroupMatches);
  if (!dryRun && resolutions.length > 0) {
    const batch = db.batch();
    for (const r of resolutions) {
      batch.update(db.collection('bonusQuestions').doc(r.questionId), {
        facit: r.facit,
        facitSource: 'auto',
        autoResolvedAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
  }
  return { resolved: resolutions.length, pending: open.length - resolutions.length, dryRun, changes: resolutions };
}

// Trigger: når en gruppekamp netop er blevet finished, så prøv at afgøre
// gruppevindere (gør kun noget, når en gruppe dermed er fuldt færdigspillet).
exports.resolveGroupWinnerOnFinish = onDocumentWritten(
  { document: 'matches/{matchId}', region: REGION },
  async (event) => {
    const after = event.data?.after?.data();
    if (!after || after.round !== 'group' || after.status !== 'finished') return;
    const before = event.data?.before?.data();
    if (before?.status === 'finished') return; // var allerede færdig — undgå gentagne kørsler

    const res = await runResolveGroupWinners(getFirestore());
    if (res.resolved) console.log(`resolveGroupWinnerOnFinish: afgjorde ${res.resolved} gruppevinder(e).`, res.changes);
  }
);

// Callable (admin): afgør gruppevindere nu. dryRun=true viser kun hvad der ville ske.
exports.syncGroupWinnersNow = onCall(
  { region: REGION },
  async (request) => {
    const db = getFirestore();
    await requireAdmin(db, request);
    return runResolveGroupWinners(db, { dryRun: request.data?.dryRun === true });
  }
);

// ---------------------------------------------------------------------------
// adminSendPasswordReset — KUN ejeren: generér et nulstillingslink server-side
// og send det via vores egen SMTP (vm@vejleaa.dk). Bruges når Firebase' egen
// reset-mail ikke når frem (fx udbyder der blokerer firebaseapp.com).
// Returnerer også selve linket, så ejeren kan sende det manuelt om nødvendigt.
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

    // Generér det officielle nulstillingslink (Firebase Admin SDK).
    const link = await getAuth().generatePasswordResetLink(email);

    // Send via vores egen SMTP, hvis adgangskoden er sat.
    const transporter = buildTransport(SMTP_PASSWORD.value());
    let sent = false;
    if (transporter) {
      const name = userRecord.displayName || 'spiller';
      const html = `
        <p>Hej ${name},</p>
        <p>Du (eller en administrator) har bedt om at nulstille din adgangskode til
        <strong>VM 2026 Tip</strong>. Klik på linket nedenfor for at vælge en ny:</p>
        <p><a href="${link}">Nulstil min adgangskode</a></p>
        <p>Hvis knappen ikke virker, kopiér dette link ind i din browser:<br>
        <span style="word-break:break-all">${link}</span></p>
        <p>Bagefter kan du logge ind på <a href="${APP_URL}">${APP_URL}</a>.</p>
        <p>Mvh. VM 2026 Tip</p>`;
      await sendEmail(db, transporter, { to: email, subject: 'Nulstil din adgangskode – VM 2026 Tip', html, type: 'password-reset' });
      sent = true;
    }

    return { ok: true, email, sent, link };
  }
);
