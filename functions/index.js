// ---------------------------------------------------------------------------
// functions/index.js — Firebase Cloud Functions v2 til Tour de France tippekonkurrence.
// Region: europe-west1, Node 22.
//
// Funktioner:
//   recomputeBonus    — Firestore onWrite: beregner point når bonus-facit sættes
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

// E-mail-udsendelse via SMTP (one.com med tour@vejleaa.dk).
// Kun adgangskoden er hemmelig (Secret Manager):
//   firebase functions:secrets:set SMTP_PASSWORD
// De øvrige SMTP-indstillinger er ikke følsomme og sættes som konstanter.
const SMTP_PASSWORD = defineSecret('SMTP_PASSWORD');
// Anthropic API-nøgle til AI-morgenopslag. Sættes med:
//   firebase functions:secrets:set ANTHROPIC_API_KEY
const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');
const SMTP_HOST = 'send.one.com';
const SMTP_PORT = 465; // implicit TLS
const SMTP_USER = 'tour@vejleaa.dk';
const EMAIL_FROM = 'Tour de France Tip <tour@vejleaa.dk>';
const APP_URL = 'https://tour.vejleaa.dk';
const TZ = 'Europe/Copenhagen';

const { scoreStageBet, normalizePodium, DEFAULT_GC_TOP_N, bonusNorm, activeQuestionsForStage, stageTipComplete } = require('./tourScoring');
const { buildStageUpdate, syncStageInfoCore } = require('./tourSync');
const { classificationStandings, stageResultRows, needsPrevForPoints } = require('./pcsMapping');
const { syncStartlistCore } = require('./startlistSync');
const { redeemInviteCodeCore } = require('./invites');
const Anthropic = require('@anthropic-ai/sdk');
const { RECAP_SYSTEM, RECAP_DEFAULT_TIME, buildRecapFacts, recapWindowOpen, leagueStagePoints, historicalMembers, windowDayPoints } = require('./leagueRecap');
const { salesPitchHtml } = require('./salesPitch');
const { fetchLiveTickerCore } = require('./liveTicker');
const { fetchLiveMapCore } = require('./liveMap');
const { runGenerateStageTips } = require('./stageTip');

// Initialiser Firebase Admin (singleton)
initializeApp();

// Region for alle funktioner
const REGION = 'europe-west1';

// ---------------------------------------------------------------------------
// recomputeBonus — beregner point for alle bonusBets når facit sættes
// ---------------------------------------------------------------------------
exports.recomputeBonus = onDocumentWritten(
  { document: 'bonusQuestions/{questionId}', region: REGION },
  async (event) => {
    const db = getFirestore();
    const { questionId } = event.params;

    const after = event.data?.after?.data();
    // Facit kan være streng eller array (teams). Tomt array = ikke sat endnu.
    const facitSet = Array.isArray(after?.facit) ? after.facit.length > 0 : !!after?.facit;
    if (!facitSet) return; // Facit ikke sat endnu

    // Stempl tidspunktet for afgørelsen første gang facit sættes — bruges af
    // Tour-Botten til at fortælle, at et bonusspørgsmål er blevet afgjort.
    // (Sættet udløser funktionen igen, men da facit/accepted er uændret,
    // returnerer den hurtigt nedenfor — ingen løkke.)
    if (!after.resolvedAt && event.data?.after?.ref) {
      await event.data.after.ref.set({ resolvedAt: FieldValue.serverTimestamp() }, { merge: true });
    }

    const before = event.data?.before?.data();
    // Genberegn hvis facit ELLER de admin-godkendte svar er ændret.
    // bonusNorm håndterer både skalarer og arrays (teams) for facit-sammenligning.
    const acceptedJSON = JSON.stringify(after.acceptedAnswers ?? []);
    const beforeAcceptedJSON = JSON.stringify(before?.acceptedAnswers ?? []);
    if (bonusNorm(before?.facit) === bonusNorm(after.facit) && beforeAcceptedJSON === acceptedJSON) return;

    const facit = after.facit;
    // Generisk, type-agnostisk pointgivning: ret svar = facit (trimmet,
    // ufølsomt for store/små bogstaver). Arrays (teams: vælg flere) matcher
    // rækkefølge-uafhængigt. Point pr. korrekt svar er spørgsmålets egne points
    // hvis sat (endeligt tal), ellers standard 3.
    const norm = bonusNorm;
    const facitNorm = norm(facit);
    // Admin kan manuelt godkende (fejlstavede) svar som korrekte via
    // acceptedAnswers. Byg mængden af normaliserede korrekte svar = facit +
    // alle godkendte alternativer, så et godkendt svar rent faktisk giver point.
    const correctNorms = new Set([facitNorm]);
    for (const a of Array.isArray(after.acceptedAnswers) ? after.acceptedAnswers : []) {
      const an = norm(a);
      if (an !== '') correctNorms.add(an);
    }
    const correctPoints = Number.isFinite(Number(after.points)) ? Number(after.points) : 3;

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
      const answerNorm = norm(bet.answer);
      const pts = answerNorm !== '' && correctNorms.has(answerNorm) ? correctPoints : 0;

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

    // Opdater totalPoints for berørte brugere (Tour: etape- + bonus-point)
    const { activeSeason } = await tourSettings(db);
    const affectedUids = [...new Set(betsSnap.docs.map(d => d.data().uid))];
    for (const uid of affectedUids) {
      await recalcTourTotal(db, uid, activeSeason, activeSeason);
    }
  }
);

// ===========================================================================
// TOUR DE FRANCE — etaperesultater, point og sync (fra letour.fr-proxyen)
// ===========================================================================

const DEFAULT_TOUR_PROXY = 'https://tdf-results-poi2efmbfa-ew.a.run.app';

// Alle kald til PCS-proxyen får en hård timeout, så en hængende proxy ikke
// blokerer funktionen indtil platformens maks-timeout (og brænder invocation-tid
// / rammer sync-loopet). Kastes som en AbortError, som kalderne allerede fanger.
const PROXY_TIMEOUT_MS = 20000;
function fetchWithTimeout(url, opts = {}) {
  return fetch(url, { ...opts, signal: AbortSignal.timeout(PROXY_TIMEOUT_MS) });
}

// Admin-redigerbar config: point-tabel, top-N til Q2, proxy-URL.
const DEFAULT_SEASON = 2026;

async function tourSettings(db) {
  const snap = await db.collection('config').doc('settings').get();
  const s = snap.exists ? snap.data() : {};
  return {
    // Admin skriver til config/settings.points (samme felt som frontenden læser);
    // normalizePodium giver den fulde [1.,2.,3.]-skala pr. spørgsmål.
    points: normalizePodium(s.points || s.tourPoints || {}),
    gcTopN: Number.isFinite(Number(s.gcTopN)) ? Number(s.gcTopN) : DEFAULT_GC_TOP_N,
    proxyUrl: String(s.tourProxyUrl || DEFAULT_TOUR_PROXY).replace(/\/$/, ''),
    activeSeason: Number.isFinite(Number(s.activeSeason)) ? Number(s.activeSeason) : DEFAULT_SEASON,
  };
}

// Genberegn en brugers totaler for EN sæson (etape- + bonus-point). Historik
// gemmes pr. sæson i users.seasons.{år}; de flade felter (totalPoints m.fl.)
// afspejler den aktive sæson, så den eksisterende stilling viser indeværende år.
async function recalcTourTotal(db, uid, season, activeSeason) {
  const [stageSnap, bonusSnap] = await Promise.all([
    db.collection('stageBets').where('uid', '==', uid).where('season', '==', season).get(),
    db.collection('bonusBets').where('uid', '==', uid).where('season', '==', season).get(),
  ]);
  const stagePoints = stageSnap.docs.reduce((a, d) => a + (Number(d.data().points) || 0), 0);
  const bonusPts = bonusSnap.docs.reduce((a, d) => a + (Number(d.data().points) || 0), 0);
  const totals = { stagePoints, bonusPoints: bonusPts, totalPoints: stagePoints + bonusPts };

  const update = { [`seasons.${season}`]: totals };
  if (season === activeSeason) Object.assign(update, totals); // flade felter = aktiv sæson
  await db.collection('users').doc(uid).set(update, { merge: true });
}

// recomputeStage — point for alle etape-tip når et etaperesultat sættes.
exports.recomputeStage = onDocumentWritten(
  { document: 'stages/{stageId}', region: REGION },
  async (event) => {
    const db = getFirestore();
    const { stageId } = event.params;
    const after = event.data?.after?.data();
    if (!after || !after.result) return;
    const before = event.data?.before?.data();
    if (JSON.stringify(before?.result) === JSON.stringify(after.result)) return;

    const { points, activeSeason } = await tourSettings(db);
    const season = after.season || activeSeason;
    const betsSnap = await db.collection('stageBets').where('stageId', '==', stageId).get();

    // Kun de spørgsmål der faktisk stilles på etapen scorer/straffer
    // (override i stage.questions, ellers type-standard).
    const active = activeQuestionsForStage(after);

    const BATCH_SIZE = 400;
    let batch = db.batch();
    let ops = 0;
    const batches = [batch];
    const bump = () => { if (++ops >= BATCH_SIZE) { batch = db.batch(); batches.push(batch); ops = 0; } };
    const changedUids = new Set();
    for (const d of betsSnap.docs) {
      const { points: pts } = scoreStageBet(d.data(), after.result, points, active);
      // Skriv (og genberegn) kun når pointtallet faktisk ændrer sig — jury-
      // vinduets gen-syncs rører ellers hvert eneste bet-doc hvert 5. minut.
      if (Number(d.data().points) === pts) continue;
      batch.update(d.ref, { points: pts });
      bump();
      changedUids.add(d.data().uid);
    }

    // HÅNDHÆV utippet-straffen ens for ALLE: en godkendt spiller helt UDEN
    // bet-dokument skal have samme straf som en, der gemte et tomt tip
    // (PointRules lover "-1 pr. utippet etape"). Vi opretter et tomt bet-doc
    // med straffens point (scoreStageBet({}) = -straf når facit findes, ellers
    // 0 — så oprettes intet). Doc-id uid_stageId matcher klientens skema, og
    // ved senere facit-ændringer genscorer løkken ovenfor dokumentet korrekt.
    // SCOPING: straffen gælder kun den AKTIVE sæson (et historisk facit må
    // aldrig strafe nuværende spillere), og kun spillere der var oprettet før
    // etapestart — man får ikke -1 for etaper kørt før man meldte sig til.
    const betUids = new Set(betsSnap.docs.map((d) => d.data().uid));
    const { points: penaltyPts } = scoreStageBet({}, after.result, points, active);
    if (penaltyPts !== 0 && season === activeSeason) {
      const kickoffMs = after.kickoff?.toDate ? after.kickoff.toDate().getTime() : null;
      const usersSnap = await db.collection('users').where('status', '==', 'approved').get();
      for (const u of usersSnap.docs) {
        if (betUids.has(u.id)) continue;
        const createdMs = u.data().createdAt?.toDate ? u.data().createdAt.toDate().getTime() : null;
        if (kickoffMs && createdMs && createdMs > kickoffMs) continue; // tilmeldt efter etapen
        batch.set(db.collection('stageBets').doc(`${u.id}_${stageId}`), {
          uid: u.id, stageId, season,
          points: penaltyPts,
          autoPenalty: true, // markør: oprettet af serveren, intet aktivt tip
          createdAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        bump();
        changedUids.add(u.id);
      }
    }
    for (const b of batches) await b.commit();

    // Kun spillere med ÆNDREDE point genberegnes — parallelt i små bidder.
    const uids = [...changedUids];
    const CHUNK = 10;
    for (let i = 0; i < uids.length; i += CHUNK) {
      await Promise.all(uids.slice(i, i + CHUNK).map((uid) => recalcTourTotal(db, uid, season, activeSeason)));
    }
  },
);

// Kernen i resultat-sync: hent fra proxyen, map, skriv etape-facit + hold.
async function syncTourCore(db, { dryRun = false } = {}) {
  const { gcTopN, proxyUrl, activeSeason } = await tourSettings(db);
  const season = activeSeason;
  const listRes = await fetchWithTimeout(`${proxyUrl}/api/stages`);
  if (!listRes.ok) throw new Error(`proxy /api/stages: HTTP ${listRes.status}`);
  const list = await listRes.json();
  const stages = list.stages || [];
  let checked = 0;
  let updated = 0;
  const allTeams = new Map();
  let latest = null; // seneste afgjorte etape (til de fulde klassement-stillinger)

  // Pointliste (rytter/hold/point) → visningsrækker til etapesiden, sorteret
  // efter point (flest først), top 10.
  const toPointRows = (list, topN = 10) => (list || [])
    .slice()
    .sort((a, b) => (Number(b.points) || 0) - (Number(a.points) || 0))
    .slice(0, topN)
    .map((e, i) => ({ rank: i + 1, rider: e.rider ?? null, team: e.team ?? null, points: Number(e.points) || 0 }));

  // En 'done'-etape gen-synces stadig i timerne efter etapestart: letour kan
  // vise provisoriske rækker mens etapen kører, og juryen ændrer jævnligt
  // spurt-/bjergpoint og placeringer 30-60 min efter målgang (deklasseringer).
  // Uden dette vindue ville det FØRSTE hentede facit fryse for evigt.
  // recomputeStage genberegner kun når result-JSON faktisk ændrer sig.
  const RESULT_REFRESH_MS = 8 * 3600 * 1000; // frys 8 timer efter etapestart

  for (const s of stages) {
    const n = s.number;
    const docId = `${season}-stage-${n}`;
    const existing = await db.collection('stages').doc(docId).get();
    const exData = existing.exists ? existing.data() : null;
    // SPÆRRE: en etape kan ikke have et ægte resultat før den er startet. Uden
    // dette ville synken (indtil 2026-løbet køres) skrive sidste års resultater
    // fra proxyen ind på fremtidige etaper og afgøre hele turneringen for tidligt.
    // En etape uden kendt starttid kan ikke bekræftes som startet → spring over
    // (ellers ville proxyens sidste-års-resultat kunne skrives ind på den).
    const kickoffMs = exData?.kickoff?.toDate ? exData.kickoff.toDate().getTime() : null;
    if (!kickoffMs || kickoffMs > Date.now()) continue; // ingen starttid el. endnu ikke startet
    // Allerede afgjort OG uden for jury-vinduet → frosset for altid.
    if (exData?.status === 'done' && (Date.now() - kickoffMs) > RESULT_REFRESH_MS) {
      // Selv-opheling: mangler etapens visningsresultater (målrækkefølge,
      // bjerg-/sprintpoint på etapen, holdkonkurrencen — felterne kom til
      // senere end de første etaper), hentes og gemmes KUN de — facit
      // (result) røres aldrig på en frosset etape.
      if (!dryRun && (!Array.isArray(exData.resultRows) || !Array.isArray(exData.holdRows))) {
        try {
          const rr = await fetchWithTimeout(`${proxyUrl}/api/stages/${n}`);
          if (rr.ok) {
            const p = await rr.json();
            let prev = null;
            if (needsPrevForPoints(p)) {
              const pr = await fetchWithTimeout(`${proxyUrl}/api/stages/${n - 1}`);
              if (pr.ok) prev = await pr.json();
            }
            const rows = stageResultRows(p, 30);
            const lists = buildStageUpdate(p, gcTopN, prev).pointsLists;
            if (rows.length) {
              await db.collection('stages').doc(docId).set({
                resultRows: rows,
                mountainRows: toPointRows(lists.mountain),
                sprintRows: toPointRows(lists.sprint),
                holdRows: classificationStandings(p, 10).hold,
              }, { merge: true });
            }
          }
        } catch { /* næste kørsel prøver igen */ }
      }
      continue;
    }
    checked++;
    const r = await fetchWithTimeout(`${proxyUrl}/api/stages/${n}`);
    if (r.status === 425 || !r.ok) continue; // resultat ikke klar
    const payload = await r.json();
    // 2026-stakken: mangler per-etape sprint-/bjergpoint (ipe/ime), regnes
    // Q3/Q4 som delta af de kumulative klassementer — hent forrige etape.
    // Kan n-1 ikke hentes, springes etapen over (delta mod ingenting ville
    // give hele den kumulative stilling som etape-facit); næste 5-min-kørsel
    // prøver igen.
    let prevPayload = null;
    if (needsPrevForPoints(payload)) {
      try {
        const pr = await fetchWithTimeout(`${proxyUrl}/api/stages/${n - 1}`);
        if (pr.ok) prevPayload = await pr.json();
      } catch { /* håndteres af null-tjekket herunder */ }
      if (!prevPayload) continue;
    }
    const upd = buildStageUpdate(payload, gcTopN, prevPayload);
    if (!upd.resultsPresent) continue;

    // KVALITETSGATE i jury-vinduet: et allerede afgjort facit må kun
    // overskrives af et MINDST lige så komplet et. Får letour et hikke
    // (halvtom tabel midt i en gen-scrape), ville sidste sync-cyklus ellers
    // kunne fryse et forkrøblet facit fast for altid. Jury-rettelser ændrer
    // point/placeringer — ikke antallet af rækker (±enkelte udgåede ryttere),
    // så 80 % af det hidtidige antal er en sikker undergrænse.
    const rowCount = (payload?.classifications?.etape?.rows || []).length;
    const prevCount = Number(exData?.resultRowCount) || 0;
    if (exData?.status === 'done' && prevCount > 0 && rowCount < prevCount * 0.8) {
      continue; // beskadiget/ufuldstændig tabel — behold det gamle facit
    }

    if (!latest || n > latest.number) latest = { number: n, payload, jerseys: upd.jerseys };
    upd.teams.forEach((t) => allTeams.set(t.key, t.name));
    if (!dryRun) {
      await db.collection('stages').doc(docId).set({
        season,
        number: n,
        status: 'done',
        result: upd.result,
        jerseys: upd.jerseys,
        startCity: upd.meta.startCity,
        finishCity: upd.meta.finishCity,
        km: upd.meta.km,
        resultRowCount: rowCount,
        // Etapens visningsresultater — vises på etapens egen side:
        // målrækkefølge (top 30), bjerg-/sprintpoint PÅ etapen og
        // holdkonkurrencens stilling efter etapen.
        resultRows: stageResultRows(payload, 30),
        mountainRows: toPointRows(upd.pointsLists.mountain),
        sprintRows: toPointRows(upd.pointsLists.sprint),
        holdRows: classificationStandings(payload, 10).hold,
        resultUpdatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    updated++;
  }

  if (!dryRun && allTeams.size) {
    const batch = db.batch();
    for (const [key, name] of allTeams) {
      batch.set(db.collection('teams').doc(`${season}-${key}`), { season, key, name }, { merge: true });
    }
    await batch.commit();
  }

  // Fulde stillinger pr. konkurrence efter seneste afgjorte etape → config/classifications
  // (læses af Tour-siden). Skrives kun når en (ny) etape er blevet afgjort.
  const writeClassifications = async (afterStage, payload, jerseys, previousYear) => {
    await db.collection('config').doc('classifications').set({
      season,
      afterStage,
      previousYear,
      standings: classificationStandings(payload),
      stageResult: stageResultRows(payload),
      jerseys,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: false });
  };

  let previousYear = false;
  if (!dryRun) {
    if (latest) {
      // Årets data (mindst én 2026-etape afgjort) → overskriver evt. sidste-års-preview.
      await writeClassifications(latest.number, latest.payload, latest.jerseys, false);
    } else {
      // Ingen NY etape afgjort i denne kørsel. Sidste-års-previewet (skrevet
      // før løbsstart) er UDTJENT nu hvor løbet er i gang: står der stadig et
      // preview (previousYear:true), ryddes det, så Tour-siden viser den rene
      // "Afventer..."-fallback indtil første 2026-resultat lander. Ægte
      // 2026-data (previousYear:false) røres aldrig. Preview-genskrivningen
      // er fjernet med vilje — den hørte tiden FØR løbsstart til.
      const cur = await db.collection('config').doc('classifications').get();
      if (cur.exists && cur.data()?.previousYear === true) {
        await cur.ref.delete();
      }
    }
  }
  return {
    season, checked, updated, teams: allTeams.size,
    classementsAfter: latest ? latest.number : null, previousYear,
  };
}

// Planlagt sync: hvert 5. minut mellem 17 og 22 (dansk tid) på etapedage.
exports.syncTourResults = onSchedule(
  { schedule: '*/5 17-22 * * *', timeZone: TZ, region: REGION },
  async () => {
    const db = getFirestore();
    const statusRef = db.collection('config').doc('tourSyncStatus');
    try {
      const res = await syncTourCore(db, {});
      await statusRef.set({
        lastRunAt: FieldValue.serverTimestamp(),
        lastSuccessAt: FieldValue.serverTimestamp(),
        ...res,
        lastError: null,
      }, { merge: true });
      if (res.updated) console.log(`syncTourResults: opdaterede ${res.updated} etape(r).`);
    } catch (err) {
      console.error('syncTourResults: fejl', err);
      await statusRef.set({
        lastRunAt: FieldValue.serverTimestamp(),
        lastError: String(err?.message || err),
      }, { merge: true });
      throw err;
    }
  },
);

// "Kør nu"-knap (admin): henter resultater med det samme.
exports.syncTourNow = onCall({ region: REGION }, async (request) => {
  const db = getFirestore();
  await requireAdmin(db, request);
  return syncTourCore(db, { dryRun: request.data?.dryRun === true });
});

// Nulstil resultater (admin): fjerner facit/trøjer fra etaperne, sætter dem
// tilbage til 'scheduled', nulstiller etape-tip-point og genberegner stillingen.
// Bruges fx hvis synken nåede at skrive sidste års resultater ind.
exports.resetTourResults = onCall({ region: REGION }, async (request) => {
  const db = getFirestore();
  await requireAdmin(db, request);
  const { activeSeason } = await tourSettings(db);
  const season = Number(request.data?.season) || activeSeason;

  // 1) Nulstil etaper (fjern resultat/trøjer, status → scheduled)
  const stagesSnap = await db.collection('stages').where('season', '==', season).get();
  let stagesReset = 0;
  {
    let batch = db.batch(); let ops = 0; const batches = [batch];
    for (const d of stagesSnap.docs) {
      const data = d.data();
      if (data.status !== 'done' && data.result == null && data.jerseys == null) continue;
      batch.set(d.ref, {
        status: 'scheduled',
        result: FieldValue.delete(),
        jerseys: FieldValue.delete(),
        resultUpdatedAt: FieldValue.delete(),
      }, { merge: true });
      stagesReset++;
      if (++ops >= 400) { batch = db.batch(); batches.push(batch); ops = 0; }
    }
    for (const b of batches) await b.commit();
  }

  // 2) Nulstil etape-tip-point
  const betsSnap = await db.collection('stageBets').where('season', '==', season).get();
  {
    let batch = db.batch(); let ops = 0; const batches = [batch];
    for (const d of betsSnap.docs) {
      if (d.data().points == null) continue;
      batch.update(d.ref, { points: FieldValue.delete() });
      if (++ops >= 400) { batch = db.batch(); batches.push(batch); ops = 0; }
    }
    for (const b of batches) await b.commit();
  }

  // 3) Genberegn stillingen for berørte spillere
  const uids = [...new Set(betsSnap.docs.map((d) => d.data().uid))];
  for (const uid of uids) await recalcTourTotal(db, uid, season, activeSeason);

  return { season, stagesReset, betsReset: betsSnap.size, users: uids.length };
});

// "Hent etape-info"-knap (admin): per-etape højdemeter (D+) + hvilke
// klassementer (sprint/bjerg) der uddeler point. Henter fra proxyens
// /api/stage-info og skriver ikke-destruktivt { elevation } +
// { pointsAwarded:{sprint,mountain} } på etape-dokumenterne (merge).
exports.syncStageInfo = onCall({ region: REGION }, async (request) => {
  const db = getFirestore();
  await requireAdmin(db, request);
  const { proxyUrl, activeSeason } = await tourSettings(db);
  return syncStageInfoCore({
    db,
    proxyUrl,
    season: activeSeason,
    fetchImpl: fetchWithTimeout,
    serverTimestamp: () => FieldValue.serverTimestamp(),
    dryRun: request.data?.dryRun === true,
  });
});

// ---------------------------------------------------------------------------
// Startliste-sync: skraber TV2's hold-og-ryttere-artikel (via proxyen) og
// skriver de udtagne ryttere til config/startlist. Planlagt hver 2. time, så
// holdene fyldes ud af sig selv efterhånden som de melder ud. Plus en manuel
// admin-knap (syncStartlistNow).
// ---------------------------------------------------------------------------
exports.syncStartlist = onSchedule(
  { schedule: '17 */2 * * *', timeZone: TZ, region: REGION },
  async () => {
    const db = getFirestore();
    const { proxyUrl, activeSeason } = await tourSettings(db);
    try {
      const res = await syncStartlistCore({
        db, proxyUrl, season: activeSeason, fetchImpl: fetchWithTimeout,
        serverTimestamp: () => FieldValue.serverTimestamp(),
      });
      console.log(`syncStartlist: ${res.announced}/${res.total} hold har udtaget.`);
    } catch (err) {
      console.error('syncStartlist: fejl', err);
      throw err;
    }
  },
);

exports.syncStartlistNow = onCall({ region: REGION }, async (request) => {
  const db = getFirestore();
  await requireAdmin(db, request);
  const { proxyUrl, activeSeason } = await tourSettings(db);
  return syncStartlistCore({
    db, proxyUrl, season: activeSeason, fetchImpl: fetchWithTimeout,
    serverTimestamp: () => FieldValue.serverTimestamp(),
  });
});

// seedTourRoute — opretter de 21 etape-dokumenter (med kickoff) så man kan
// tippe og låsning virker, før resultaterne kommer. Datoer rettes i admin.
exports.seedTourRoute = onCall({ region: REGION }, async (request) => {
  const db = getFirestore();
  await requireAdmin(db, request);
  const { activeSeason } = await tourSettings(db);
  const season = Number(request.data?.season) || activeSeason;
  const route = Array.isArray(request.data?.stages) ? request.data.stages : [];
  if (!route.length) throw new HttpsError('invalid-argument', 'Mangler stages[].');
  const batch = db.batch();
  for (const s of route) {
    const n = Number(s.number);
    if (!Number.isFinite(n)) continue;
    batch.set(db.collection('stages').doc(`${season}-stage-${n}`), {
      season,
      number: n,
      date: s.date || null,
      kickoff: s.kickoff ? Timestamp.fromDate(new Date(s.kickoff)) : null,
      type: s.type || 'unknown',
      typeCode: s.typeCode || null,
      km: s.km != null ? s.km : null,
      startCity: s.startCity || null,
      finishCity: s.finishCity || null,
      image: s.image || null,
      description: s.description || null,
      startTime: s.startTime || null,
      // Valgfrie felter (tilføjes senere af proxyen) – kun skriv når til stede,
      // så merge ikke nulstiller dem på allerede berigede dokumenter.
      ...(s.elevation != null ? { elevation: s.elevation } : {}),
      ...(s.expertTip != null ? { expertTip: s.expertTip } : {}),
      ...(s.profileImage ? { profileImage: s.profileImage } : {}),
      ...(Array.isArray(s.climbs) && s.climbs.length ? { climbs: s.climbs } : {}),
      ...(Array.isArray(s.sprints) && s.sprints.length ? { sprints: s.sprints } : {}),
      ...(s.pointsAwarded ? { pointsAwarded: s.pointsAwarded } : {}),
      questions: activeQuestionsForStage(s),
      status: 'scheduled',
    }, { merge: true });
  }
  await batch.commit();
  return { season, seeded: route.length };
});

// ---------------------------------------------------------------------------
// backfillTipParticipation — callable (owner/global admin)
// Engangs-/vedligeholdelsesfunktion: genopbygger tipParticipation ud fra ALLE
// eksisterende stageBets, så tip-tælleren også dækker tips afgivet før
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

    getUserStatus: async (u) => {
      const snap = await db.collection('users').doc(u).get();
      return snap.exists ? snap.data()?.status : null;
    },

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

  // Hent alle etaper, så vi kan afgøre KOMPLETHED pr. etape (aktive spørgsmål).
  const stagesSnap = await db.collection('stages').get();
  const stageById = new Map();
  for (const d of stagesSnap.docs) stageById.set(d.id, d.data());

  // Saml uids pr. stageId fra alle stageBets — kun KOMPLETTE tip tæller med,
  // så backfill matcher den løbende syncTipParticipation og forsiden.
  const betsSnap = await db.collection('stageBets').get();
  const byStage = new Map();
  for (const d of betsSnap.docs) {
    const bet = d.data();
    const { stageId, uid } = bet;
    if (!stageId || !uid) continue;
    if (!stageTipComplete(stageById.get(stageId), bet)) continue;
    if (!byStage.has(stageId)) byStage.set(stageId, new Set());
    byStage.get(stageId).add(uid);
  }

  // Skriv tipParticipation for ALLE etaper (doc-id = stageId) — også dem uden
  // komplette tip, så tidligere (delvise) deltagere ryddes væk og tælleren
  // matcher den nye komplet-definition.
  const BATCH_SIZE = 400;
  let batch = db.batch();
  let ops = 0;
  const batches = [batch];
  for (const stageId of stageById.keys()) {
    const uidSet = byStage.get(stageId) ?? new Set();
    const ref = db.collection('tipParticipation').doc(stageId);
    batch.set(ref, { stageId, uids: [...uidSet] }, { merge: true });
    ops++;
    if (ops >= BATCH_SIZE) { batch = db.batch(); batches.push(batch); ops = 0; }
  }
  for (const b of batches) await b.commit();

  return {
    success: true,
    stages: stageById.size,
    bets: betsSnap.size,
    message: `Backfill færdig: ${stageById.size} etaper opdateret ud fra ${betsSnap.size} tips.`,
  };
});

// ---------------------------------------------------------------------------
// remapTeamName — admin-værktøj: omdøb ét (forældet) holdnavn til det
// officielle 2026-navn på tværs af ALLE etape-tip — eller RYD det helt
// (clear: true), når holdet er nedlagt uden efterfølger (fx "ARKEA-B&B
// HOTELS"): felterne tømmes, så tippet fremstår uspillet og kan gen-tippes
// på åbne etaper. Tips gemt fra en gammel holdliste matcher hverken
// dropdown, logoer eller facit — og reglerne tillader ikke admin at rette
// andres bets fra klienten, så rewritet sker her (admin-SDK). Point
// genberegnes for afgjorte etaper, og spillernes totaler opdateres.
// ---------------------------------------------------------------------------
exports.remapTeamName = onCall({ region: REGION }, async (request) => {
  const db = getFirestore();
  if (!request.auth) throw new HttpsError('unauthenticated', 'Du skal være logget ind.');
  const userDoc = await db.collection('users').doc(request.auth.uid).get();
  const role = userDoc.data()?.role;
  if (role !== 'owner' && role !== 'globalAdmin') {
    throw new HttpsError('permission-denied', 'Kun owner/global admin kan omdøbe hold.');
  }
  const from = String(request.data?.from || '').trim();
  const clear = request.data?.clear === true;
  const to = clear ? '' : String(request.data?.to || '').trim();
  if (!from || (!clear && (!to || from === to))) {
    throw new HttpsError('invalid-argument', 'Angiv gammelt navn og enten nyt navn eller clear:true.');
  }

  const { points, activeSeason } = await tourSettings(db);
  const stagesSnap = await db.collection('stages').get();
  const stageById = new Map(stagesSnap.docs.map((d) => [d.id, d.data()]));

  const FIELDS = ['winnerTeam', 'gcTeam', 'mountainTeam', 'sprintTeam'];
  const betsSnap = await db.collection('stageBets').get();
  const BATCH_SIZE = 400;
  let batch = db.batch();
  let ops = 0;
  const batches = [batch];
  const bump = () => { if (++ops >= BATCH_SIZE) { batch = db.batch(); batches.push(batch); ops = 0; } };
  let changed = 0;
  const touchedUids = new Set();
  for (const d of betsSnap.docs) {
    const bet = d.data();
    const upd = {};
    for (const f of FIELDS) if (bet[f] === from) upd[f] = to;
    if (Object.keys(upd).length === 0) continue;
    // Afgjort etape → genberegn dokumentets point med det nye navn med det
    // samme (recomputeStage trigges kun af facit-ændringer, ikke af bets).
    const stage = stageById.get(bet.stageId);
    if (stage && stage.result) {
      const active = activeQuestionsForStage(stage);
      upd.points = scoreStageBet({ ...bet, ...upd }, stage.result, points, active).points;
    }
    batch.update(d.ref, upd);
    bump();
    changed++;
    if (bet.uid) touchedUids.add(bet.uid);
  }

  // Ryd teams-docs med det gamle navn (dubletter i dropdown-kollektionen).
  const teamsSnap = await db.collection('teams').where('name', '==', from).get();
  let removedTeams = 0;
  for (const d of teamsSnap.docs) {
    batch.delete(d.ref);
    bump();
    removedTeams++;
  }
  for (const b of batches) await b.commit();

  const uids = [...touchedUids];
  const CHUNK = 10;
  for (let i = 0; i < uids.length; i += CHUNK) {
    await Promise.all(uids.slice(i, i + CHUNK).map((uid) => recalcTourTotal(db, uid, activeSeason, activeSeason)));
  }
  return { changed, removedTeams, players: uids.length };
});

// ---------------------------------------------------------------------------
// syncTipParticipation — vedligeholder tipParticipation/{stageId} = { uids: [...] }
// Holder styr på HVEM der har tippet på en etape (men ikke hvad de tippede),
// så ligaer kan vise "X af N har tippet" og hvem der mangler — uden at afsløre
// nogen forudsigelser før kickoff.
// ---------------------------------------------------------------------------
exports.syncTipParticipation = onDocumentWritten(
  { document: 'stageBets/{betId}', region: REGION },
  async (event) => {
    const db = getFirestore();
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();

    const stageId = after?.stageId ?? before?.stageId;
    const uid = after?.uid ?? before?.uid;
    if (!stageId || !uid) return;

    const ref = db.collection('tipParticipation').doc(stageId);

    // "Har tippet" = etapens hold-tip er KOMPLET: alle de aktive spørgsmål for
    // etapen (admins opsætning / type-standard) er besvaret. Et delvist tip
    // tæller IKKE, så "X har tippet" og "hvem mangler" matcher forsiden og
    // etape-listen. Inaktive spørgsmål kræves ikke.
    let complete = false;
    if (after) {
      const stageSnap = await db.collection('stages').doc(stageId).get();
      const stage = stageSnap.exists ? stageSnap.data() : null;
      complete = stageTipComplete(stage, after);
    }

    await ref.set(
      {
        stageId,
        // Komplet → tilføj; ufuldstændigt eller slettet → fjern igen.
        uids: complete ? FieldValue.arrayUnion(uid) : FieldValue.arrayRemove(uid),
      },
      { merge: true },
    );
  }
);

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
    // DELT konkurrence-placering (samme princip som frontendens tabeller):
    // pointlighed = samme placering. Ellers ville en ren tie-omrokering give
    // falske ▲/▼-pile i stillingen — fx alle på 0 point før første etape.
    users.forEach((u, idx) => {
      const rank = idx > 0 && users[idx - 1].total === u.total
        ? users[idx - 1].rank
        : idx + 1;
      u.rank = rank;
      batch.update(db.collection('users').doc(u.id), { previousRank: rank });
      if (++ops >= 400) { batch = db.batch(); batches.push(batch); ops = 0; }
    });
    for (const b of batches) await b.commit();
    console.log(`snapshotRanks: opdaterede ${users.length} brugere.`);
  }
);

// ---------------------------------------------------------------------------
// tipReminders — scheduled: sender e-mail til spillere der mangler at tippe
// på etaper der køres i dag (CPH). Sender via vores egen SMTP.
// Sender intet hvis SMTP_PASSWORD ikke er sat (graceful no-op).
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

// Byg et opslag uid → e-mail fra den private userContacts-collection. E-mail
// bor der (ikke længere på den offentlige users-profil), så almindelige spillere
// ikke kan udtrække alle deltageres adresser. Admin-SDK'en omgår reglerne.
async function emailByUidMap(db) {
  const snap = await db.collection('userContacts').get();
  const map = new Map();
  for (const d of snap.docs) {
    const email = d.data()?.email;
    if (email) map.set(d.id, email);
  }
  return map;
}

// Kerne-logik: send påmindelser om dagens utippede etaper. Returnerer antal sendte.
async function runTipReminders(db, transporter) {
  if (!transporter) { console.log('tipReminders: ingen SMTP_PASSWORD — springer over.'); return { sent: 0, reason: 'no-smtp-password' }; }

  const now = new Date();
  // Rullende 24-timers vindue fra køretidspunktet: kører kl. 09:00, så det dækker
  // etaper fra kl. 09:00 i dag til kl. 08:59 i morgen — uafhængigt af kalenderdag.
  const windowEnd = new Date(now.getTime() + 24 * 3600 * 1000);

  // Etaper det næste døgn der stadig kan tippes (ikke kickoff/etapestart endnu)
  const stagesSnap = await db
    .collection('stages')
    .where('status', '==', 'scheduled')
    .get();

  const upcomingStages = stagesSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((s) => s.kickoff?.toDate
      && s.kickoff.toDate() > now
      && s.kickoff.toDate() < windowEnd);

  if (upcomingStages.length === 0) { console.log('tipReminders: ingen etaper det næste døgn.'); return { sent: 0, reason: 'no-stages' }; }

  // Hvem har tippet hver etape (fra tipParticipation)
  const tippedByStage = {};
  await Promise.all(upcomingStages.map(async (s) => {
    const p = await db.collection('tipParticipation').doc(s.id).get();
    tippedByStage[s.id] = new Set(p.exists ? (p.data().uids ?? []) : []);
  }));

  const usersSnap = await db
    .collection('users')
    .where('status', '==', 'approved')
    .get();

  // E-mail hentes fra userContacts (privat); fald tilbage til en evt. gammel
  // e-mail på users-dokumentet for endnu ikke migrerede profiler.
  const emails = await emailByUidMap(db);

  let sent = 0;
  for (const userDoc of usersSnap.docs) {
    const u = userDoc.data();
    const email = emails.get(userDoc.id) || u.email;
    if (u.emailOptOut || !email) continue;

    const missing = upcomingStages.filter((s) => !tippedByStage[s.id].has(userDoc.id));
    if (missing.length === 0) continue;

    const list = missing
      .map((s) => `<li>${s.number ? `Etape ${s.number}` : 'Etape'}${s.name ? ` – ${s.name}` : ''}</li>`)
      .join('');
    const html = `
      <p>Hej ${escapeHtml(u.displayName || 'spiller')} 👋</p>
      <p>Du mangler at tippe på <strong>${missing.length}</strong> etape${missing.length === 1 ? '' : 'r'} det næste døgn:</p>
      <ul>${list}</ul>
      <p><a href="${APP_URL}">Afgiv dine tips på tour.vejleaa.dk</a> inden etapestart.</p>
      <p style="color:#888;font-size:12px">Du kan slå disse påmindelser fra på din profilside.</p>`;

    try {
      await sendEmail(db, transporter, {
        to: email,
        subject: `Du mangler at tippe på ${missing.length} etape${missing.length === 1 ? '' : 'r'} det næste døgn`,
        html,
        type: 'reminder',
      });
      sent++;
    } catch (e) {
      console.error(`tipReminders: kunne ikke sende til ${email}:`, e.message);
    }
  }
  console.log(`tipReminders: sendte ${sent} påmindelser.`);
  return { sent, candidates: upcomingStages.length };
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

// Callable: send en testmail KUN til admin selv, med alle etaper for de
// første 3 etapedage (uanset om de er tippet).
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
    // Kalderens egen e-mail: fra Auth-tokenet (kilde til sandhed), ellers den
    // private userContacts-post, ellers en gammel e-mail på users-dokumentet.
    const contactSnap = await db.collection('userContacts').doc(request.auth.uid).get();
    const email = request.auth.token?.email || contactSnap.data()?.email || u.email;
    if (!email) throw new HttpsError('failed-precondition', 'Din profil har ingen e-mailadresse.');

    const transporter = buildTransport(SMTP_PASSWORD.value());
    if (!transporter) throw new HttpsError('failed-precondition', 'SMTP_PASSWORD er ikke sat endnu.');

    // Alle etaper med kendt kickoff, sorteret efter kickoff
    const snap = await db.collection('stages').get();
    const playable = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((s) => s.kickoff?.toDate)
      .sort((a, b) => a.kickoff.toDate() - b.kickoff.toDate());

    // Saml de første 3 etapedage (distinkte CPH-datoer)
    const days = [];
    const byDay = new Map();
    for (const s of playable) {
      const day = cphDateStr(s.kickoff.toDate());
      if (!byDay.has(day)) {
        if (days.length >= 3) break; // sorteret → alle tidligere dage er med
        days.push(day);
        byDay.set(day, []);
      }
      byDay.get(day).push(s);
    }

    if (days.length === 0) throw new HttpsError('failed-precondition', 'Ingen etaper med kendt etapestart fundet.');

    const dayLabel = (d) => new Intl.DateTimeFormat('da-DK', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' }).format(d);
    const timeLabel = (d) => new Intl.DateTimeFormat('da-DK', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(d);

    let total = 0;
    let html = `<p>Hej ${escapeHtml(u.displayName || 'spiller')} 👋</p><p>Testmail — etaperne for de første 3 etapedage:</p>`;
    for (const day of days) {
      const ss = byDay.get(day);
      total += ss.length;
      html += `<h3 style="margin:14px 0 4px">${dayLabel(ss[0].kickoff.toDate())}</h3><ul style="margin:0">`;
      for (const s of ss) {
        html += `<li>${timeLabel(s.kickoff.toDate())} — ${s.number ? `Etape ${s.number}` : 'Etape'}${s.name ? ` – ${s.name}` : ''}</li>`;
      }
      html += '</ul>';
    }
    html += `<p style="margin-top:14px"><a href="${APP_URL}">Gå til tour.vejleaa.dk</a></p>
      <p style="color:#888;font-size:12px">Dette er en testmail sendt kun til dig.</p>`;

    await sendEmail(db, transporter, {
      to: email,
      subject: '🧪 Testmail: etaper for de første 3 etapedage',
      html,
      type: 'test-reminder',
    });

    return { success: true, sentTo: email, days: days.length, stages: total };
  }
);

// ---------------------------------------------------------------------------
// Fælles admin-guard for callable-funktioner.
// ---------------------------------------------------------------------------

async function requireAdmin(db, request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Du skal være logget ind.');
  const snap = await db.collection('users').doc(request.auth.uid).get();
  const role = snap.data()?.role;
  if (role !== 'owner' && role !== 'globalAdmin') {
    throw new HttpsError('permission-denied', 'Kun owner/global admin har adgang.');
  }
}

// ---------------------------------------------------------------------------
// sendBroadcastEmail — callable (admin): send en fritekst-besked (emne + tekst)
// til en liste af modtagere, fx invitationer. Logges som type 'broadcast'.
// ---------------------------------------------------------------------------
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function broadcastHtml(body) {
  const safe = escapeHtml(body).replace(/\r\n|\r|\n/g, '<br>');
  // Gør rå URL'er klikbare (efter escaping, så kun ægte links rammes) —
  // vigtigt for liga-invitationslinket, som skal kunne klikkes direkte i mailen.
  const linked = safe.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>');
  return `<div style="font-family:sans-serif;font-size:15px;line-height:1.6;color:#222">${linked}`
    + `<hr style="border:none;border-top:1px solid #eee;margin:18px 0">`
    + `<p style="color:#888;font-size:12px">Sendt fra Tour de France Tip · <a href="${APP_URL}">${APP_URL}</a></p></div>`;
}

exports.sendBroadcastEmail = onCall(
  { region: REGION, secrets: [SMTP_PASSWORD] },
  async (request) => {
    const db = getFirestore();
    await requireAdmin(db, request);

    const subject = String(request.data?.subject || '').trim();
    const body = String(request.data?.body || '').trim();
    const rawRecipients = Array.isArray(request.data?.recipients) ? request.data.recipients : [];
    if (!subject) throw new HttpsError('invalid-argument', 'Emne mangler.');
    if (!body) throw new HttpsError('invalid-argument', 'Beskeden er tom.');

    // Valgfri flot skabelon: 'salespitch' = salgstalen med skærmbilleder + gul
    // tilmeldingsblok. joinLink SKAL i så fald pege på vores egen /tilmeld-side
    // (aldrig et vilkårligt eksternt link i en mail vi afsender).
    const template = request.data?.template === 'salespitch' ? 'salespitch' : null;
    const joinLink = String(request.data?.joinLink || '').trim();
    const leagueName = String(request.data?.leagueName || '').trim();
    if (joinLink && !joinLink.startsWith(`${APP_URL}/tilmeld?kode=`)) {
      throw new HttpsError('invalid-argument', 'Ugyldigt tilmeldingslink.');
    }
    if (template && !joinLink) {
      throw new HttpsError('invalid-argument', 'Salgstale-skabelonen kræver et liga-tilmeldingslink.');
    }

    // Valider + dedupliker modtagere (uafhængigt af store/små bogstaver).
    const seen = new Set();
    const valid = [];
    const invalid = [];
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (const r of rawRecipients) {
      const e = String(r || '').trim();
      if (!e) continue;
      const key = e.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      if (re.test(e)) valid.push(e); else invalid.push(e);
    }
    if (valid.length === 0) throw new HttpsError('invalid-argument', 'Ingen gyldige modtagere.');
    if (valid.length > 300) throw new HttpsError('invalid-argument', 'For mange modtagere (max 300).');

    const transporter = buildTransport(SMTP_PASSWORD.value());
    if (!transporter) throw new HttpsError('failed-precondition', 'SMTP_PASSWORD er ikke sat endnu.');

    const html = template === 'salespitch'
      ? salesPitchHtml({ intro: body, joinLink, leagueName, appUrl: APP_URL })
      : broadcastHtml(body);
    let sent = 0;
    const failed = [];
    for (const to of valid) {
      try {
        await sendEmail(db, transporter, { to, subject, html, type: 'broadcast' });
        sent += 1;
      } catch (e) {
        failed.push(to);
        console.error('broadcast: kunne ikke sende til', to, e.message);
      }
    }
    return { sent, failed, invalid, total: valid.length };
  }
);

// ---------------------------------------------------------------------------
// AI-morgenopslag (Tour-Botten) — genererer hver morgen kl. 07:00 et kort dansk
// vægopslag pr. liga om seneste døgns udvikling. Bruger Claude (Opus 4.8).
// ---------------------------------------------------------------------------

/** ms-tidsstempel fra et Firestore-Timestamp/Date/ms, ellers null. */
function tsToMs(ts) {
  if (!ts) return null;
  if (typeof ts.toDate === 'function') return ts.toDate().getTime();
  const t = new Date(ts).getTime();
  return Number.isNaN(t) ? null : t;
}

// Saml fakta ÉN gang (deles af alle ligaer): afgjorte etaper (med nummer +
// vinderhold + kickoff) i et bredt vindue, rå tip-point pr. etape/spiller, og
// kommende etaper. "Siden sidste opslag"-afgrænsningen + ligaens scoring
// påføres pr. liga.
async function gatherRecapData(db, now) {
  const startMs = now.getTime() - 72 * 3600 * 1000; // bredt nok til 'siden sidste opslag'
  const finSnap = await db.collection('stages')
    .where('kickoff', '>=', Timestamp.fromMillis(startMs))
    .where('kickoff', '<=', Timestamp.fromMillis(now.getTime()))
    .get();
  const finished = finSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((s) => s.result && (s.hasResults || s.result.winnerTeam))
    .map((s) => ({
      id: s.id,
      number: Number(s.number) || null,
      winnerTeam: s.result.winnerTeam || null,
      kickoffMs: tsToMs(s.kickoff) ?? 0,
    }));

  // Rå tip-point pr. etape pr. spiller (uden ligaens scoring-regler endnu).
  const pointsByStageUid = {};
  for (const s of finished) {
    const bets = await db.collection('stageBets').where('stageId', '==', s.id).get();
    const map = {};
    for (const b of bets.docs) {
      const x = b.data();
      map[x.uid] = Number(x.points || 0);
    }
    pointsByStageUid[s.id] = map;
  }

  const upSnap = await db.collection('stages')
    .where('kickoff', '>=', Timestamp.fromMillis(now.getTime()))
    .where('kickoff', '<=', Timestamp.fromMillis(now.getTime() + 24 * 3600 * 1000))
    .get();
  const upcoming = upSnap.docs
    .map((d) => d.data())
    .filter((s) => s.kickoff?.toDate)
    .map((s) => ({
      number: Number(s.number) || null, type: s.type || null,
      time: s.kickoff.toDate().toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit', timeZone: TZ }),
    }));

  // Officielle bonusspørgsmål (generisk: label + facit) afgjort i vinduet, så
  // Tour-Botten kan nævne dem og lade nattens point afspejle dem.
  const bqSnap = await db.collection('bonusQuestions').get();
  const resolvedBonus = [];
  for (const d of bqSnap.docs) {
    const q = d.data();
    const resolvedMs = tsToMs(q.resolvedAt);
    if (!q.facit || resolvedMs == null || resolvedMs < startMs) continue;
    resolvedBonus.push({ id: d.id, label: q.text || q.label || '', facit: q.facit, resolvedMs });
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

  return { finished, pointsByStageUid, upcoming, resolvedBonus, bonusPtsByQ };
}

/**
 * Afgræns til etaper siden ligaens sidste opslag og påfør ligaens scoring, så
 * "dayPoints" hviler på samme grundlag som totalen (leagueTotal).
 */
function recapWindowForLeague({ league, finished, pointsByStageUid, resolvedBonus = [], bonusPtsByQ = {}, now }) {
  const lastMs = tsToMs(league.lastRecapAt) ?? (now.getTime() - 26 * 3600 * 1000);
  const windowStages = finished.filter((s) => s.kickoffMs > lastMs);
  const memberUids = league.memberUids || [];
  const dayPointsByUid = {};
  for (const s of windowStages) {
    const map = pointsByStageUid[s.id] || {};
    for (const uid of memberUids) {
      const pts = leagueStagePoints(map[uid], league.scoring);
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

  const stages = windowStages.map((s) => ({ number: s.number, winnerTeam: s.winnerTeam }));
  const bonusResolved = windowBonus.map((q) => ({ label: q.label, facit: q.facit }));
  return { dayPointsByUid, stages, bonusResolved };
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
  const { finished, pointsByStageUid, upcoming, resolvedBonus, bonusPtsByQ } = await gatherRecapData(db, now);

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

    // Kun etaper/point siden ligaens sidste opslag, med ligaens scoring påført.
    const { dayPointsByUid, stages, bonusResolved } = recapWindowForLeague({
      league, finished, pointsByStageUid, resolvedBonus, bonusPtsByQ, now,
    });
    const facts = buildRecapFacts({ league, members, dayPointsByUid, stages, bonusResolved, upcoming, now });
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
        leagueId: league.id, uid: 'ai-bot', displayName: 'Tour-Botten', avatarEmoji: '🤖',
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

    // Vent hvis en etape fra i går endnu mangler sit resultat: uafsluttede
    // etaper ville give en ufuldstændig stilling i opslaget. Prøver igen ved
    // næste tick (inden for vinduet).
    const dayAgo = Timestamp.fromMillis(now.getTime() - 24 * 3600 * 1000);
    const recentSnap = await db.collection('stages')
      .where('kickoff', '>=', dayAgo)
      .where('kickoff', '<=', Timestamp.fromMillis(now.getTime()))
      .get();
    const pendingStage = recentSnap.docs.some((d) => d.data().status !== 'done');
    if (pendingStage) {
      console.log('generateLeagueRecaps: etaperesultat afventer — udskyder opslaget.');
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
// generateStageTip — callable (owner/global admin): AI-genererer et dansk
// ekspert-tip pr. etape og gemmer det som expertTip på etape-dokumentet.
// Input { stageId } (én etape) ELLER { all:true, season } (alle etaper i
// sæsonen uden tip endnu). Bruger SAMME SDK/model som AI-morgenopslaget.
// ---------------------------------------------------------------------------
exports.generateStageTip = onCall(
  { region: REGION, secrets: [ANTHROPIC_API_KEY] },
  async (request) => {
    const db = getFirestore();
    await requireAdmin(db, request);
    const apiKey = ANTHROPIC_API_KEY.value();
    if (!apiKey) throw new HttpsError('failed-precondition', 'ANTHROPIC_API_KEY er ikke sat.');

    const all = request.data?.all === true;
    const force = request.data?.force === true;
    const stageId = request.data?.stageId || null;
    if (!all && !stageId) {
      throw new HttpsError('invalid-argument', 'Angiv enten { stageId } eller { all:true }.');
    }
    let season = request.data?.season;
    if (all && season == null) {
      const s = await tourSettings(db);
      season = s.activeSeason;
    }

    const anthropic = new Anthropic({ apiKey });
    try {
      return await runGenerateStageTips(db, anthropic, {
        stageId,
        all,
        force,
        season: all ? season : undefined,
        serverTimestamp: FieldValue.serverTimestamp(),
      });
    } catch (err) {
      throw new HttpsError('internal', err?.message || 'Kunne ikke generere ekspert-tip.');
    }
  }
);

// ---------------------------------------------------------------------------
// Engangs: genskriv ALLE Tour-Bottens gamle opslag med den korrekte logik, ud
// fra stillingen som den var DA opslaget blev lavet. Kun teksten ændres —
// createdAt (tidspunktet) røres aldrig. Totaler rekonstrueres fra etape-
// resultater (bonus medregnes ikke; forsvindende undervejs i løbet).
async function gatherAllStagesAndPoints(db) {
  const snap = await db.collection('stages').get();
  const all = snap.docs.map((d) => {
    const s = d.data();
    return {
      id: d.id, number: Number(s.number) || null,
      type: s.type || null, status: s.status,
      result: s.result || null, hasResults: !!s.hasResults,
      kickoffMs: tsToMs(s.kickoff) ?? 0,
    };
  });
  const finished = all
    .filter((s) => s.result && (s.hasResults || s.result.winnerTeam))
    .map((s) => ({
      id: s.id, number: s.number,
      winnerTeam: s.result.winnerTeam || null, kickoffMs: s.kickoffMs,
    }));
  const pointsByStageUid = {};
  for (const s of finished) {
    const bets = await db.collection('stageBets').where('stageId', '==', s.id).get();
    const map = {};
    for (const b of bets.docs) { const x = b.data(); map[x.uid] = Number(x.points || 0); }
    pointsByStageUid[s.id] = map;
  }
  return { all, finished, pointsByStageUid };
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
  const { all, finished, pointsByStageUid } = await gatherAllStagesAndPoints(db);

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
      const windowStages = finished.filter((s) => s.kickoffMs > prevMs && s.kickoffMs <= T);
      const members = historicalMembers(memberDocs, finished, pointsByStageUid, T);
      const dayPointsByUid = windowDayPoints(memberIds, windowStages, pointsByStageUid, league.scoring);
      const stages = windowStages.map((s) => ({ number: s.number, winnerTeam: s.winnerTeam }));
      const upcoming = all
        .filter((s) => s.kickoffMs > T && s.kickoffMs <= T + 24 * 3600 * 1000)
        .sort((a, b) => a.kickoffMs - b.kickoffMs)
        .map((s) => ({
          number: s.number, type: s.type,
          time: new Date(s.kickoffMs).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit', timeZone: TZ }),
        }));
      const facts = buildRecapFacts({ league, members, dayPointsByUid, stages, upcoming, now: new Date(T) });

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

// ---------------------------------------------------------------------------
// adminSendPasswordReset — KUN ejeren: generér et nulstillingslink server-side
// og send det via vores egen SMTP (tour@vejleaa.dk). Bruges når Firebase' egen
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
      const name = escapeHtml(userRecord.displayName || 'spiller');
      const html = `
        <p>Hej ${name},</p>
        <p>Du (eller en administrator) har bedt om at nulstille din adgangskode til
        <strong>Tour de France Tip</strong>. Klik på linket nedenfor for at vælge en ny:</p>
        <p><a href="${link}">Nulstil min adgangskode</a></p>
        <p>Hvis knappen ikke virker, kopiér dette link ind i din browser:<br>
        <span style="word-break:break-all">${link}</span></p>
        <p>Bagefter kan du logge ind på <a href="${APP_URL}">${APP_URL}</a>.</p>
        <p>Mvh. Tour de France Tip</p>`;
      await sendEmail(db, transporter, { to: email, subject: 'Nulstil din adgangskode – Tour de France Tip', html, type: 'password-reset' });
      sent = true;
    }

    return { ok: true, email, sent, link };
  }
);

// ---------------------------------------------------------------------------
// migrateEmailPrivacy — KUN ejeren: engangs-migrering der flytter e-mail fra den
// OFFENTLIGE users-profil til den PRIVATE userContacts-collection og fjerner
// e-mail-feltet fra users-dokumentet. Idempotent: kør den igen uden skade.
// Kør den én gang efter deploy for at lukke hullet, hvor alle godkendte spillere
// kunne læse alle e-mailadresser.
// ---------------------------------------------------------------------------
exports.migrateEmailPrivacy = onCall(
  { region: REGION },
  async (request) => {
    const db = getFirestore();
    if (!request.auth) throw new HttpsError('unauthenticated', 'Du skal være logget ind.');
    const callerSnap = await db.collection('users').doc(request.auth.uid).get();
    if (callerSnap.data()?.role !== 'owner') {
      throw new HttpsError('permission-denied', 'Kun ejeren kan køre migreringen.');
    }

    const usersSnap = await db.collection('users').get();
    let moved = 0;
    let alreadyClean = 0;

    const BATCH_SIZE = 400;
    let batch = db.batch();
    let ops = 0;
    const batches = [batch];
    const commit = () => { if (ops >= BATCH_SIZE) { batch = db.batch(); batches.push(batch); ops = 0; } };

    for (const d of usersSnap.docs) {
      const email = d.data()?.email;
      if (!email) { alreadyClean++; continue; }
      // Skriv den private kontaktpost (uden at overskrive en eksisterende e-mail).
      batch.set(db.collection('userContacts').doc(d.id), { uid: d.id, email }, { merge: true });
      ops++; commit();
      // Fjern e-mailen fra den offentlige profil.
      batch.update(d.ref, { email: FieldValue.delete() });
      ops++; commit();
      moved++;
    }

    for (const b of batches) await b.commit();
    return { ok: true, moved, alreadyClean, totalUsers: usersSnap.size };
  }
);

// ---------------------------------------------------------------------------
// getLiveTicker — callable: dansk live-ticker fra letour racecenter under
// etapen. Browser kan ikke hente den selv (ingen CORS), så den går her
// igennem med et 45 sek. server-cache-vindue — uanset hvor mange spillere
// der følger med, rammer vi letour højst ~1 gang i minuttet pr. etape.
// ---------------------------------------------------------------------------
const liveTickerCache = new Map();
exports.getLiveTicker = onCall(
  { region: REGION },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Du skal være logget ind.');
    return fetchLiveTickerCore({
      stageNumber: request.data?.stage,
      fetchImpl: fetchWithTimeout,
      cache: liveTickerCache,
    });
  }
);

// getLiveMap — callable: live-kortets data (rute + grupper på vejen) fra
// letour racecenter. Samme CORS-/cache-rationale som getLiveTicker; ruten
// caches længe (statisk pr. etape), telemetrien 45 sek.
const liveMapCache = new Map();
const liveMapRouteCache = new Map();
exports.getLiveMap = onCall(
  { region: REGION },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Du skal være logget ind.');
    return fetchLiveMapCore({
      stageNumber: request.data?.stage,
      fetchImpl: fetchWithTimeout,
      cache: liveMapCache,
      routeCache: liveMapRouteCache,
    });
  }
);
