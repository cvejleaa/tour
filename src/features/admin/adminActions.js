// Firestore-handlinger for admin-panelet.
// Alle skrivninger sker her — UI-komponenter kalder disse funktioner.
import {
  doc,
  updateDoc,
  deleteDoc,
  setDoc,
  addDoc,
  collection,
  serverTimestamp,
  Timestamp,
  arrayUnion,
  arrayRemove,
  writeBatch,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../firebase';
import { COL, ROLES, BONUS_ANSWER_TYPE_VALUES, DEFAULT_BONUS_ANSWER_TYPE } from '../../lib/constants';

// ─── Brugerstyring (global admin: godkend/afvis · ejer: roller) ──────────────

/**
 * Godkend eller afvis en bruger.
 * @param {string} uid
 * @param {'approved'|'rejected'} newStatus
 */
export async function setUserStatus(uid, newStatus) {
  const ref = doc(db, COL.USERS, uid);
  await updateDoc(ref, { status: newStatus });
}

/**
 * Masse-godkend flere brugere på én gang (fx alle importerede VM-brugere).
 * Sætter status='approved' på hver. Der sendes INGEN besked ved godkendelse.
 * @param {string[]} uids
 * @returns {Promise<{ok:true,count:number}|{ok:false,error:string}>}
 */
export async function approveUsers(uids) {
  const list = [...new Set((uids || []).filter(Boolean))];
  if (list.length === 0) return { ok: true, count: 0 };
  try {
    for (let i = 0; i < list.length; i += 400) {
      const batch = writeBatch(db);
      for (const uid of list.slice(i, i + 400)) {
        batch.set(doc(db, COL.USERS, uid), { status: 'approved' }, { merge: true });
      }
      await batch.commit();
    }
    return { ok: true, count: list.length };
  } catch (err) {
    return { ok: false, error: err?.message || 'Kunne ikke godkende brugerne.' };
  }
}

/** Hent login-metode (providers) m.m. for alle Auth-brugere (owner/globalAdmin). */
export async function callAuthUserInfo() {
  try {
    const fn = httpsCallable(functions, 'adminAuthUserInfo');
    const res = await fn();
    return { ok: true, users: res.data?.users || [] };
  } catch (err) {
    return { ok: false, error: err?.message || 'Kunne ikke hente login-info.' };
  }
}

/**
 * Genberegn alle spilleres totaler i et spil med den aktuelle start-gate
 * (game.startAt). Bruges når starttidspunktet lige er sat/ændret, så tidligere
 * runders point fjernes fra stillingen med det samme.
 * @param {string} gameId
 */
export async function callRecomputeGameScores(gameId) {
  try {
    const fn = httpsCallable(functions, 'recomputeGameScores', { timeout: 120000 });
    const res = await fn({ gameId });
    return { ok: true, data: res.data };
  } catch (err) {
    return { ok: false, error: err?.message || 'Kunne ikke genberegne point.' };
  }
}

/**
 * Ret Runde-Bottens ALLEREDE POSTEDE opslag, så hvert af dem kun handler om
 * den liga, det står i. dryRun (default sand) skriver intet.
 * @param {{gameId: string, round?: number|null, dryRun?: boolean}} arg
 */
export async function callRetGamleRundeOpslag({ gameId, round = null, dryRun = true }) {
  try {
    const fn = httpsCallable(functions, 'retGamleRundeOpslag', { timeout: 540000 });
    const res = await fn({ gameId, round, dryRun });
    return { ok: true, data: res.data };
  } catch (err) {
    return { ok: false, error: err?.message || 'Kunne ikke rette opslagene.' };
  }
}

/**
 * Genopbyg players/{uid}.leagueIds ud fra ligaernes medlemmer. Feltet er dét,
 * security rules bruger til at afgøre, hvem der må se hvis point — så en
 * genopbygning retter op, hvis noget er drevet fra hinanden.
 * @param {string} gameId
 */
export async function callBackfillPlayerLeagues(gameId) {
  try {
    const fn = httpsCallable(functions, 'backfillPlayerLeagues', { timeout: 120000 });
    const res = await fn({ gameId });
    return { ok: true, data: res.data };
  } catch (err) {
    return { ok: false, error: err?.message || 'Kunne ikke genopbygge liga-medlemskab.' };
  }
}

/**
 * Skift en brugers e-mail direkte (kun ejer) — Auth-konto + profil + kontakt-mail.
 * Ingen bekræftelses-mail; skiftet gælder med det samme.
 * @param {string} uid
 * @param {string} email
 */
export async function callSetUserEmail(uid, email) {
  try {
    const fn = httpsCallable(functions, 'adminSetUserEmail');
    const res = await fn({ uid, email });
    return { ok: true, data: res.data };
  } catch (err) {
    return { ok: false, error: err?.message || 'Kunne ikke ændre e-mailen.' };
  }
}

/** Slet en bruger helt (kun ejer). force=true sletter selv med point. */
export async function callDeleteUser(uid, force = false) {
  try {
    const fn = httpsCallable(functions, 'adminDeleteUser');
    const res = await fn({ uid, force });
    return { ok: true, data: res.data };
  } catch (err) {
    return { ok: false, code: err?.code, error: err?.message || 'Kunne ikke slette brugeren.' };
  }
}

/**
 * Skift en brugers rolle mellem 'player' og 'globalAdmin'.
 * Kun ejeren kan udpege/fjerne globale admins (håndhæves også af reglerne).
 * Kan ikke ændre owner-rollen.
 * @param {string} uid
 * @param {string} currentRole
 */
export async function setGlobalAdminRole(uid, currentRole) {
  if (currentRole === ROLES.OWNER) {
    throw new Error('Kan ikke ændre owner-rollen.');
  }
  const newRole =
    currentRole === ROLES.GLOBAL_ADMIN ? ROLES.PLAYER : ROLES.GLOBAL_ADMIN;
  const ref = doc(db, COL.USERS, uid);
  await updateDoc(ref, { role: newRole });
}

/**
 * Send nulstillingslink til en bruger via vores egen SMTP (kun ejer).
 * Omgår Firebase' egen reset-mail, der nogle gange ikke når frem.
 * @param {string} uid
 * @returns {Promise<{ email: string, sent: boolean, link: string }>}
 */
export async function sendAdminPasswordReset(uid) {
  const fn = httpsCallable(functions, 'adminSendPasswordReset');
  const res = await fn({ uid });
  return res.data;
}

// ─── Indstillinger (kun ejer — config/settings) ──────────────────────────────

/**
 * Sæt tidspunktet for AI-morgenopslaget (Tour-Botten). Format 'HH:MM',
 * Europe/Copenhagen. Skrives til config/settings (kun ejer kan skrive iflg. reglerne).
 * @param {string} time  fx '08:15'
 */
export async function setRecapTime(time) {
  const ref = doc(db, COL.CONFIG, 'settings');
  await setDoc(ref, { recapTime: time }, { merge: true });
}

/**
 * Sæt straffen for en utippet etape. Gemmes som et positivt tal (antal point der
 * trækkes fra pr. manglende etape) i config/settings under `points.untippedPenalty`
 * — SAMME felt som serverens scoring (normalizePodium(points)) og Tour-fanens
 * pointeditor læser. (Tidligere blev et top-niveau-felt skrevet her, som scoringen
 * aldrig så — så indstillingen var reelt uden effekt.)
 * Kun owner kan skrive iflg. reglerne.
 * @param {number} penalty  positivt tal, fx 2 (= −2 pr. utippet etape). Decimaler ok.
 */
export async function setUntippedPenalty(penalty) {
  const ref = doc(db, COL.CONFIG, 'settings');
  // Dyb merge: rører kun points.untippedPenalty, ikke de øvrige points-felter.
  await setDoc(ref, { points: { untippedPenalty: Math.abs(Number(penalty)) || 0 } }, { merge: true });
}

/**
 * Kald Cloud Function 'migrateEmailPrivacy' (kun ejer) — flytter e-mail fra den
 * offentlige users-profil til den private userContacts-collection og fjerner
 * e-mail fra users-dokumentet. Idempotent.
 * @returns {Promise<{ok:boolean, data?:object, error?:string}>}
 */
export async function callMigrateEmailPrivacy() {
  try {
    const fn = httpsCallable(functions, 'migrateEmailPrivacy', { timeout: 120000 });
    const res = await fn();
    return { ok: true, data: res.data };
  } catch (err) {
    const msg =
      err?.code === 'functions/not-found'
        ? 'Cloud Function "migrateEmailPrivacy" er ikke deployet endnu.'
        : err?.message ?? 'Ukendt fejl ved kald af migrateEmailPrivacy.';
    return { ok: false, error: msg };
  }
}

/**
 * Kald Cloud Function 'backfillTipParticipation' for at genopbygge tip-deltagelse
 * ud fra alle eksisterende tips.
 */
export async function callBackfillTipParticipation() {
  try {
    const fn = httpsCallable(functions, 'backfillTipParticipation');
    const result = await fn();
    return { ok: true, data: result.data };
  } catch (err) {
    const msg =
      err?.code === 'functions/not-found'
        ? 'Cloud Function "backfillTipParticipation" er ikke deployet endnu.'
        : err?.message ?? 'Ukendt fejl ved kald af backfillTipParticipation.';
    return { ok: false, error: msg };
  }
}

/**
 * Kald Cloud Function 'sendTipRemindersNow' for at sende e-mail-påmindelser
 * med det samme (til test).
 */
export async function callSendTipRemindersNow() {
  try {
    const fn = httpsCallable(functions, 'sendTipRemindersNow');
    const result = await fn();
    return { ok: true, data: result.data };
  } catch (err) {
    const msg =
      err?.code === 'functions/not-found'
        ? 'Cloud Function "sendTipRemindersNow" er ikke deployet endnu.'
        : err?.message ?? 'Ukendt fejl ved kald af sendTipRemindersNow.';
    return { ok: false, error: msg };
  }
}

/**
 * Kald Cloud Function 'sendTestReminderToMe' — sender en testmail KUN til
 * admin selv med alle etaper for de første 3 etapedage.
 */
export async function callSendTestReminderToMe() {
  try {
    const fn = httpsCallable(functions, 'sendTestReminderToMe');
    const result = await fn();
    return { ok: true, data: result.data };
  } catch (err) {
    const msg =
      err?.code === 'functions/not-found'
        ? 'Cloud Function "sendTestReminderToMe" er ikke deployet endnu.'
        : err?.message ?? 'Ukendt fejl ved kald af sendTestReminderToMe.';
    return { ok: false, error: msg };
  }
}

/**
 * Per-spil påmindelser (platform): send de rigtige påmindelser NU for ét spil.
 * @param {string} gameId
 */
export async function callSendGameTipRemindersNow(gameId) {
  try {
    const fn = httpsCallable(functions, 'sendGameTipRemindersNow');
    const result = await fn({ gameId });
    return { ok: true, data: result.data };
  } catch (err) {
    return { ok: false, error: err?.message ?? 'Kunne ikke sende påmindelser.' };
  }
}

/**
 * Pulje-status (platform): hvem har/mangler pulje-tippet i et spil.
 * remind=true sender samtidig en påmindelses-mail til dem der mangler.
 * @param {string} gameId
 * @param {{remind?: boolean}} [opts]
 */
export async function callGamePuljeStatus(gameId, { remind = false } = {}) {
  try {
    const fn = httpsCallable(functions, 'gamePuljeStatus', { timeout: 120000 });
    const res = await fn({ gameId, remind });
    return { ok: true, data: res.data };
  } catch (err) {
    return { ok: false, error: err?.message || 'Kunne ikke hente pulje-status.' };
  }
}

/**
 * Runde-Botten (platform): generér runde-opslaget for et spil. dryRun=true
 * returnerer kun teksten (forhåndsvisning); dryRun=false poster på alle
 * spillets liga-vægge. Uden runde vælges den seneste helt afgjorte.
 * @param {{gameId:string, round?:number|null, dryRun?:boolean}} args
 */
export async function callGenerateGameRecapNow({ gameId, round = null, dryRun = true } = {}) {
  try {
    const fn = httpsCallable(functions, 'generateGameRecapNow', { timeout: 300000 });
    const res = await fn({ gameId, round, dryRun });
    return { ok: true, data: res.data };
  } catch (err) {
    return { ok: false, error: err?.message || 'Kunne ikke generere opslaget.' };
  }
}

/**
 * Per-spil påmindelser (platform): send en testmail KUN til admin selv.
 * @param {string} gameId
 */
export async function callSendGameTestReminderToMe(gameId) {
  try {
    const fn = httpsCallable(functions, 'sendGameTestReminderToMe');
    const result = await fn({ gameId });
    return { ok: true, data: result.data };
  } catch (err) {
    return { ok: false, error: err?.message ?? 'Kunne ikke sende testmail.' };
  }
}

/**
 * Kald Cloud Function 'setAutomationPaused' — sæt/ophæv den globale pause for
 * ALLE skemalagte jobs (resultat-sync, AI-morgenopslag, påmindelses-mails).
 * Kun owner/global admin. Bruges når løbet er slut.
 * @param {boolean} paused
 */
export async function callSetAutomationPaused(paused) {
  try {
    const fn = httpsCallable(functions, 'setAutomationPaused');
    const result = await fn({ paused });
    return { ok: true, data: result.data };
  } catch (err) {
    const msg =
      err?.code === 'functions/not-found'
        ? 'Cloud Function "setAutomationPaused" er ikke deployet endnu.'
        : err?.message ?? 'Ukendt fejl ved kald af setAutomationPaused.';
    return { ok: false, error: msg };
  }
}

/**
 * Kald Cloud Function 'sendThankYouEmails' — afsluttende takke-mail med
 * løbs-tilbageblik + liga-slutstillinger. dryRun:true sender kun til
 * admin selv (til gennemsyn); dryRun:false sender til alle. Kun owner/global admin.
 * @param {{dryRun?: boolean}} [opts]
 */
export async function callSendThankYouEmails({ dryRun = true } = {}) {
  try {
    const fn = httpsCallable(functions, 'sendThankYouEmails');
    const result = await fn({ dryRun });
    return { ok: true, data: result.data };
  } catch (err) {
    const msg =
      err?.code === 'functions/not-found'
        ? 'Cloud Function "sendThankYouEmails" er ikke deployet endnu.'
        : err?.message ?? 'Ukendt fejl ved kald af sendThankYouEmails.';
    return { ok: false, error: msg };
  }
}

/**
 * Kald Cloud Function 'sendBroadcastEmail' — send en fritekst-besked til en
 * liste af modtagere (fx invitationer).
 * @param {{subject:string, body:string, recipients:string[]}} payload
 */
export async function callSendBroadcastEmail(payload) {
  try {
    const fn = httpsCallable(functions, 'sendBroadcastEmail');
    const result = await fn(payload);
    return { ok: true, data: result.data };
  } catch (err) {
    const msg =
      err?.code === 'functions/not-found'
        ? 'Cloud Function "sendBroadcastEmail" er ikke deployet endnu.'
        : err?.message ?? 'Ukendt fejl ved kald af sendBroadcastEmail.';
    return { ok: false, error: msg };
  }
}

/**
 * Kald Cloud Function 'generateLeagueRecapNow' — generér AI-morgenopslag.
 * dryRun=true poster ikke, men returnerer teksten til forhåndsvisning.
 * @param {{ leagueId?: string, dryRun?: boolean }} [opts]
 */
export async function callGenerateLeagueRecapNow({ leagueId, dryRun = false } = {}) {
  try {
    const fn = httpsCallable(functions, 'generateLeagueRecapNow');
    const res = await fn({ leagueId, dryRun });
    return { ok: true, data: res.data };
  } catch (err) {
    const msg =
      err?.code === 'functions/not-found'
        ? 'Cloud Function "generateLeagueRecapNow" er ikke deployet endnu.'
        : err?.message ?? 'Ukendt fejl ved kald af generateLeagueRecapNow.';
    return { ok: false, error: msg };
  }
}

/**
 * Genskriv Tour-Bottens gamle opslag (owner). apply=false = tør-kør (eksempler);
 * apply=true gemmer i bidder (kald gentagne gange til remaining=0); reset=true
 * rydder genskrivnings-markeringen. Tidspunkterne (createdAt) røres aldrig.
 */
export async function callRegenerateRecaps({ apply = false, reset = false } = {}) {
  try {
    const fn = httpsCallable(functions, 'regenerateRecaps', { timeout: 540000 });
    const res = await fn({ apply, reset });
    return { ok: true, data: res.data };
  } catch (err) {
    const msg =
      err?.code === 'functions/not-found'
        ? 'Cloud Function "regenerateRecaps" er ikke deployet endnu.'
        : err?.message ?? 'Ukendt fejl ved kald af regenerateRecaps.';
    return { ok: false, error: msg };
  }
}

/**
 * Kald Cloud Function 'syncStageInfo' — hent per-etape højdemeter (D+) og
 * hvilke klassementer (sprint/bjerg) der uddeler point, fra letour-proxyen.
 * dryRun=true skriver intet, men returnerer et preview.
 * @param {{ dryRun?: boolean }} [opts]
 */
export async function callSyncStageInfo({ dryRun = false } = {}) {
  try {
    const fn = httpsCallable(functions, 'syncStageInfo', { timeout: 120000 });
    const res = await fn({ dryRun });
    return { ok: true, data: res.data };
  } catch (err) {
    const msg =
      err?.code === 'functions/not-found'
        ? 'Cloud Function "syncStageInfo" er ikke deployet endnu.'
        : err?.message ?? 'Ukendt fejl ved kald af syncStageInfo.';
    return { ok: false, error: msg };
  }
}

/**
 * Kald Cloud Function 'syncStartlistNow' — hent startlisten (udtagne ryttere
 * pr. hold) fra TV2 via proxyen og skriv den til config/startlist. Den samme
 * sync kører automatisk hver 2. time.
 */
export async function callSyncStartlistNow() {
  try {
    const fn = httpsCallable(functions, 'syncStartlistNow', { timeout: 120000 });
    const res = await fn({});
    return { ok: true, data: res.data };
  } catch (err) {
    const msg =
      err?.code === 'functions/not-found'
        ? 'Cloud Function "syncStartlistNow" er ikke deployet endnu.'
        : err?.message ?? 'Ukendt fejl ved kald af syncStartlistNow.';
    return { ok: false, error: msg };
  }
}

// ─── Ekspert-tips pr. etape (global admin + owner) ───────────────────────────

/**
 * Kald Cloud Function 'generateStageTip' — AI-generér ekspert-tip til en etape
 * eller (med all:true) alle etaper i sæsonen. Med force:true regenereres ALLE
 * (også dem der allerede har et tip), ellers kun de manglende.
 * @param {{ stageId?: string, all?: boolean, force?: boolean, season?: number }} [opts]
 */
export async function callGenerateStageTip({ stageId, all = false, force = false, season } = {}) {
  try {
    const fn = httpsCallable(functions, 'generateStageTip', { timeout: 540000 });
    const res = await fn({ stageId, all, force, season });
    return { ok: true, data: res.data };
  } catch (err) {
    const msg =
      err?.code === 'functions/not-found'
        ? 'Cloud Function "generateStageTip" er ikke deployet endnu.'
        : err?.message ?? 'Ukendt fejl ved kald af generateStageTip.';
    return { ok: false, error: msg };
  }
}

/**
 * Gem et manuelt redigeret ekspert-tip på etape-dokumentet (override af AI-tekst).
 * @param {string} stageId
 * @param {string} text
 */
export async function saveStageTip(stageId, text) {
  const ref = doc(db, COL.STAGES, stageId);
  await updateDoc(ref, { expertTip: String(text ?? '').trim() });
}

// ─── Bonus (global admin + owner) ────────────────────────────────────────────

/**
 * Opret et generisk bonusspørgsmål. Backend scorer svar generisk mod facit;
 * klienten skriver ALDRIG point. `type` styrer både admin-facit-input og
 * spillerens svar-input (se BONUS_ANSWER_TYPES). options er valgfri.
 * @param {{ text: string, points: number, type?: string, deadline?: string|null, facit?: *, options?: string[] }} q
 */
export async function createBonusQuestion({ text, points, type, deadline = null, facit = null, options } = {}) {
  const ref = collection(db, COL.BONUS_QUESTIONS);
  const resolvedType = BONUS_ANSWER_TYPE_VALUES.includes(type) ? type : DEFAULT_BONUS_ANSWER_TYPE;
  const data = {
    text: String(text ?? '').trim(),
    points: Number(points) || 0,
    type: resolvedType,
    facit: facit ?? null,
    createdAt: serverTimestamp(),
  };
  if (deadline) data.deadline = Timestamp.fromDate(new Date(deadline));
  if (Array.isArray(options) && options.length) {
    data.options = options.map((o) => String(o).trim()).filter(Boolean);
  }
  await addDoc(ref, data);
}

/**
 * Opdater et eksisterende bonusspørgsmål (tekst, type, point, deadline, facit).
 * Validerer som createBonusQuestion. Skriver ALDRIG point på bonusBets — dette
 * er selve SPØRGSMÅLS-dokumentet. facit beholder sin form pr. type (array for 'teams').
 * @param {string} questionId
 * @param {{ text: string, type?: string, points: number, deadline?: string|null, facit?: * }} q
 */
export async function updateBonusQuestion(questionId, { text, type, points, deadline = null, facit = null } = {}) {
  const t = String(text ?? '').trim();
  if (!t) throw new Error('Spørgsmålstekst må ikke være tom.');
  const p = Number(points);
  if (!Number.isFinite(p) || p <= 0) throw new Error('Point skal være et positivt tal.');
  const resolvedType = BONUS_ANSWER_TYPE_VALUES.includes(type) ? type : DEFAULT_BONUS_ANSWER_TYPE;

  // Normaliser facit til naturlig form (array for 'teams', ellers streng); tomt → null.
  let facitValue = null;
  if (Array.isArray(facit)) {
    facitValue = facit.length ? facit : null;
  } else {
    const trimmed = String(facit ?? '').trim();
    facitValue = trimmed === '' ? null : trimmed;
  }

  const ref = doc(db, COL.BONUS_QUESTIONS, questionId);
  const data = {
    text: t,
    points: p,
    type: resolvedType,
    facit: facitValue,
    deadline: deadline ? Timestamp.fromDate(new Date(deadline)) : null,
  };
  await updateDoc(ref, data);
}

/**
 * Slet et bonusspørgsmål (kun globalAdmin/owner iflg. reglerne).
 * Evt. orphaned bonusBets er harmløse; recompute-triggeren no-op'er uden spørgsmål/facit.
 * @param {string} questionId
 */
export async function deleteBonusQuestion(questionId) {
  await deleteDoc(doc(db, COL.BONUS_QUESTIONS, questionId));
}

/**
 * Sæt facit på et bonusspørgsmål.
 * @param {string} questionId
 * @param {string} facit
 */
export async function saveBonusFacit(questionId, facit) {
  const ref = doc(db, COL.BONUS_QUESTIONS, questionId);
  await updateDoc(ref, { facit });
}

/**
 * Godkend et (fejlstavet) svar manuelt som korrekt for et bonusspørgsmål.
 * Lægges i acceptedAnswers; Cloud Function genberegner point automatisk.
 */
export async function approveBonusAnswer(questionId, answer) {
  const ref = doc(db, COL.BONUS_QUESTIONS, questionId);
  await updateDoc(ref, { acceptedAnswers: arrayUnion(answer) });
}

/** Fjern et tidligere godkendt svar igen. */
export async function removeBonusAnswer(questionId, answer) {
  const ref = doc(db, COL.BONUS_QUESTIONS, questionId);
  await updateDoc(ref, { acceptedAnswers: arrayRemove(answer) });
}

// ─── Hjælpefunktioner ─────────────────────────────────────────────────────────

/**
 * Formater Firestore-timestamp til dansk datostreng.
 * @param {import('firebase/firestore').Timestamp|null} ts
 * @returns {string}
 */
export function formatTimestamp(ts) {
  if (!ts) return '–';
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  return date.toLocaleString('da-DK', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Konverter dansk datetime-string til Firestore Timestamp.
 * @param {string} str - ISO-format, fx "2026-06-11T18:00"
 * @returns {Timestamp}
 */
export function datetimeToTimestamp(str) {
  return Timestamp.fromDate(new Date(str));
}
