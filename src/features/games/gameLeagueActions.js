/**
 * Firebase-handlinger for private mini-ligaer i ét spil
 * (games/{gameId}/leagues/{leagueId}).
 *
 * En liga har en ejer, et navn, en invitationskode og en liste af medlemmer.
 * Man opretter en liga (bliver selv ejer+medlem), deler koden, og andre
 * deltager via koden. At deltage sker server-side (Cloud Function
 * redeemGameLeagueCode), så man ikke kan læse/tilføje sig selv til vilkårlige
 * ligaer — kun via en gyldig kode.
 */
import {
  collection, doc, setDoc, updateDoc, deleteDoc, addDoc, arrayRemove, serverTimestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../firebase';
import { COL } from '../../lib/constants';
import { generateJoinCode } from '../leagues/leagueUtils';
import { LQ_TYPES } from './leagueQuestionScoring';

/** Maks. længde på en liga-væg-besked. */
export const LEAGUE_MSG_MAX = 280;

function danishError(err, fallback) {
  const code = err?.code || '';
  // Netværksfejl først: 'unavailable' kommer fra SDK'et, ikke fra vores kode,
  // så teksten er engelsk og ubrugelig.
  if (code === 'unavailable' || code === 'functions/unavailable') {
    return 'Kunne ikke få forbindelse. Prøv igen.';
  }
  // Derefter KUN de rå Firestore-koder (uden 'functions/'-præfiks). En Cloud
  // Function har allerede formuleret sig på dansk (LEAGUE_ERR i
  // functions-platform/gameLeagues.js) og falder igennem til sin egen besked.
  // Fangede vi også 'functions/permission-denied' her, blev "Din adgang er
  // afvist. Kontakt en administrator." til det intetsigende "Du har ikke
  // adgang til denne handling." — serveren ved hvorfor, klienten gætter.
  if (code === 'permission-denied') {
    return 'Du har ikke adgang til denne handling.';
  }
  if (code === 'not-found') {
    return 'Ingen liga fundet med den kode.';
  }
  return err?.message || fallback;
}

/**
 * Opret en liga i et spil. Man bliver selv ejer og første medlem.
 * @param {{uid:string, gameId:string, name:string}} o
 * @returns {Promise<{ok:true, leagueId:string, code:string}|{ok:false, error:string}>}
 */
export async function createLeague({ uid, gameId, name }) {
  if (!uid) return { ok: false, error: 'Du skal være logget ind.' };
  if (!gameId) return { ok: false, error: 'Mangler spil-id.' };
  const cleanName = String(name || '').trim();
  if (cleanName.length < 2) return { ok: false, error: 'Ligaen skal have et navn (mindst 2 tegn).' };
  try {
    const ref = doc(collection(db, COL.GAMES, gameId, COL.GAME_LEAGUES));
    const code = generateJoinCode();
    await setDoc(ref, {
      name: cleanName,
      ownerUid: uid,
      memberUids: [uid],
      code,
      createdAt: serverTimestamp(),
    });
    return { ok: true, leagueId: ref.id, code };
  } catch (err) {
    return { ok: false, error: danishError(err, 'Kunne ikke oprette ligaen.') };
  }
}

/**
 * Deltag i en liga via invitationskode (server-side opslag + tilføjelse).
 * @param {{gameId:string, code:string}} o
 * @returns {Promise<{ok:true, leagueId:string, name:string}|{ok:false, error:string}>}
 */
export async function joinLeagueByCode({ gameId, code }) {
  const clean = String(code || '').trim().toUpperCase();
  if (!gameId) return { ok: false, error: 'Mangler spil-id.' };
  if (clean.length < 4) return { ok: false, error: 'Indtast en gyldig kode.' };
  try {
    const fn = httpsCallable(functions, 'redeemGameLeagueCode');
    const res = await fn({ gameId, code: clean });
    return { ok: true, ...(res.data || {}) };
  } catch (err) {
    return { ok: false, error: danishError(err, 'Kunne ikke deltage i ligaen.') };
  }
}

/**
 * Forlad en liga (fjern sig selv fra memberUids). Ejeren forlader ikke — de
 * sletter i stedet (se deleteLeague), så en liga aldrig bliver ejerløs.
 * @param {{uid:string, gameId:string, leagueId:string}} o
 */
export async function leaveLeague({ uid, gameId, leagueId }) {
  if (!uid || !gameId || !leagueId) return { ok: false, error: 'Mangler oplysninger.' };
  try {
    await updateDoc(doc(db, COL.GAMES, gameId, COL.GAME_LEAGUES, leagueId), {
      memberUids: arrayRemove(uid),
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: danishError(err, 'Kunne ikke forlade ligaen.') };
  }
}

/**
 * Omdøb en liga (kun ejeren — håndhæves af security rules).
 * @param {{gameId:string, leagueId:string, name:string}} o
 */
export async function renameLeague({ gameId, leagueId, name }) {
  const cleanName = String(name || '').trim();
  if (!gameId || !leagueId) return { ok: false, error: 'Mangler oplysninger.' };
  if (cleanName.length < 2) return { ok: false, error: 'Ligaen skal have et navn (mindst 2 tegn).' };
  try {
    await updateDoc(doc(db, COL.GAMES, gameId, COL.GAME_LEAGUES, leagueId), { name: cleanName });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: danishError(err, 'Kunne ikke omdøbe ligaen.') };
  }
}

/**
 * Sæt ligaens startrunde (kun ejeren — håndhæves af security rules, som også
 * afviser alt andet end et helt tal >= 1 eller null).
 *
 * Runder FØR startrunden tæller ikke i ligaens stilling. En RUNDE og ikke en
 * dato: en runde kan ligge spredt over en måned, og en dato midt i spændet
 * ville tage rundens sene kampe med og lade de tidlige ligge.
 *
 * @param {{gameId:string, leagueId:string, startRound:number|null}} o
 */
export async function setLeagueStartRound({ gameId, leagueId, startRound }) {
  if (!gameId || !leagueId) return { ok: false, error: 'Mangler oplysninger.' };
  const r = startRound === null || startRound === '' ? null : Number(startRound);
  if (r !== null && (!Number.isInteger(r) || r < 1)) {
    return { ok: false, error: 'Startrunden skal være et helt tal på 1 eller derover.' };
  }
  try {
    await updateDoc(doc(db, COL.GAMES, gameId, COL.GAME_LEAGUES, leagueId), { startRound: r });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: danishError(err, 'Kunne ikke gemme startrunden.') };
  }
}

/**
 * Slet en liga (kun ejeren). Bruges også til at rydde tomme ligaer op.
 * @param {{gameId:string, leagueId:string}} o
 */
export async function deleteLeague({ gameId, leagueId }) {
  if (!gameId || !leagueId) return { ok: false, error: 'Mangler oplysninger.' };
  try {
    await deleteDoc(doc(db, COL.GAMES, gameId, COL.GAME_LEAGUES, leagueId));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: danishError(err, 'Kunne ikke slette ligaen.') };
  }
}

/**
 * Skriv en besked på liga-væggen (kun medlemmer). text ≤ LEAGUE_MSG_MAX.
 * @param {{uid:string, gameId:string, leagueId:string, text:string}} o
 */
export async function postLeagueMessage({ uid, gameId, leagueId, text }) {
  const clean = String(text || '').trim();
  if (!uid || !gameId || !leagueId) return { ok: false, error: 'Mangler oplysninger.' };
  if (!clean) return { ok: false, error: 'Skriv en besked.' };
  if (clean.length > LEAGUE_MSG_MAX) return { ok: false, error: `Beskeden må højst være ${LEAGUE_MSG_MAX} tegn.` };
  try {
    await addDoc(
      collection(db, COL.GAMES, gameId, COL.GAME_LEAGUES, leagueId, COL.GAME_LEAGUE_MSGS),
      { uid, text: clean, createdAt: serverTimestamp() },
    );
    return { ok: true };
  } catch (err) {
    return { ok: false, error: danishError(err, 'Kunne ikke sende beskeden.') };
  }
}

// ─── Liga-spørgsmål (liga-ejerens egne spørgsmål med deadline + facit) ───────

/** Maks. længder for liga-spørgsmål. */
export const LEAGUE_Q_LABEL_MAX = 120;

/**
 * Opret et liga-spørgsmål (kun liga-ejeren iflg. reglerne).
 * @param {{uid:string, gameId:string, leagueId:string, label:string, type?:'text'|'yesno'|'number'|'team', points?:number, deadline?:string|null}} o
 */
export async function createLeagueQuestion({ uid, gameId, leagueId, label, type = 'text', points = 5, deadline = null }) {
  const clean = String(label || '').trim();
  if (!uid || !gameId || !leagueId) return { ok: false, error: 'Mangler oplysninger.' };
  if (clean.length < 3) return { ok: false, error: 'Skriv et spørgsmål (mindst 3 tegn).' };
  if (clean.length > LEAGUE_Q_LABEL_MAX) return { ok: false, error: `Højst ${LEAGUE_Q_LABEL_MAX} tegn.` };
  const p = Number(points);
  if (!Number.isFinite(p) || p <= 0 || p > 100) return { ok: false, error: 'Point skal være 1-100.' };
  try {
    await addDoc(collection(db, COL.GAMES, gameId, COL.GAME_LEAGUES, leagueId, COL.GAME_LEAGUE_QUESTIONS), {
      label: clean,
      // LQ_TYPES og ikke en lokal literal: to lister ville drive fra hinanden,
      // og en ikke-whitelisted type bliver TAVST til 'text' — så en ny type,
      // der kun tilføjes i scoring-filen, ville se ud til at virke i formularen
      // og alligevel oprette tekst-spørgsmål.
      type: LQ_TYPES.includes(type) ? type : 'text',
      points: p,
      deadline: deadline ? new Date(deadline).getTime() : null,
      facit: null,
      createdBy: uid,
      createdAt: serverTimestamp(),
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: danishError(err, 'Kunne ikke oprette spørgsmålet.') };
  }
}

/**
 * Sæt facit på et liga-spørgsmål (kun liga-ejeren). acceptedAnswers er
 * alternative korrekte stavemåder (kun 'text').
 */
export async function setLeagueQuestionFacit({ gameId, leagueId, questionId, facit, acceptedAnswers = [] }) {
  const clean = String(facit ?? '').trim();
  if (!clean) return { ok: false, error: 'Skriv et facit.' };
  try {
    await updateDoc(doc(db, COL.GAMES, gameId, COL.GAME_LEAGUES, leagueId, COL.GAME_LEAGUE_QUESTIONS, questionId), {
      facit: clean,
      acceptedAnswers: (acceptedAnswers || []).map((s) => String(s).trim()).filter(Boolean),
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: danishError(err, 'Kunne ikke gemme facit.') };
  }
}

/** Slet et liga-spørgsmål (kun liga-ejeren). Evt. svar bliver harmløst forældreløse. */
export async function deleteLeagueQuestion({ gameId, leagueId, questionId }) {
  try {
    await deleteDoc(doc(db, COL.GAMES, gameId, COL.GAME_LEAGUES, leagueId, COL.GAME_LEAGUE_QUESTIONS, questionId));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: danishError(err, 'Kunne ikke slette spørgsmålet.') };
  }
}

/**
 * Gem eget svar på et liga-spørgsmål (doc-id = qId_uid → ét svar pr. spiller).
 * Reglerne afviser efter deadline.
 */
export async function saveLeagueQuestionAnswer({ uid, gameId, leagueId, questionId, answer }) {
  const clean = String(answer ?? '').trim();
  if (!uid || !questionId) return { ok: false, error: 'Mangler oplysninger.' };
  if (!clean) return { ok: false, error: 'Skriv et svar.' };
  try {
    await setDoc(
      doc(db, COL.GAMES, gameId, COL.GAME_LEAGUES, leagueId, COL.GAME_LEAGUE_QUESTION_ANSWERS, `${questionId}_${uid}`),
      { questionId, uid, answer: clean, updatedAt: serverTimestamp() },
    );
    return { ok: true };
  } catch (err) {
    if (err?.code === 'permission-denied') return { ok: false, error: 'Deadline er passeret — svaret kan ikke ændres.' };
    return { ok: false, error: danishError(err, 'Kunne ikke gemme svaret.') };
  }
}

/**
 * Hvem mangler at svare på ligaens ÅBNE spørgsmål? (serverkald — rules
 * nægter bevidst at læse andres svar før lukning, og serveren afslører kun
 * HVEM der har svaret, aldrig hvad). Adgang: ligaens medlemmer + admin.
 */
/**
 * Ret et EKSISTERENDE liga-spørgsmål (#40): tekst, point og deadline — inden
 * for regel-grænserne, som fladen skal FØLGE, ikke opdage ved fejl:
 * - label/points må rettes, MEN fladen tilbyder kun points før lukning
 *   (QC-blokerende: efter deadline kan ejeren se svarene, og en point-rettelse
 *   dér er samme manøvre som at åbne kortene — bare med indsatsen).
 * - deadline: sættes første gang eller UDSKYDES; aldrig fremad/fjernes.
 *   Fortids-spærringen håndhæves HER (QC-blokerende): en første-gangs-deadline
 *   i fortiden ville øjeblikkeligt og UIGENKALDELIGT åbne alles svar —
 *   browserens min-attribut gælder ikke programmatisk satte værdier.
 * - `type` må ALDRIG kunne rettes her: text → number efter deadline ville
 *   aktivere "nærmest vinder" med alle svar i hånden (rules begrænser det
 *   ikke i dag — fladen er vagten, så udvid den ikke "for en ordens skyld").
 * points sendes ALTID med (reglen kræver `points is number` i det
 * RESULTERENDE dokument — et dokument uden feltet ville ellers aldrig kunne
 * gemmes herfra).
 */
export async function updateLeagueQuestion({
  gameId, leagueId, questionId, q, label, points, deadline,
}) {
  const clean = String(label ?? '').trim();
  if (clean.length < 3 || clean.length > LEAGUE_Q_LABEL_MAX) {
    return { ok: false, error: `Teksten skal være 3-${LEAGUE_Q_LABEL_MAX} tegn.` };
  }
  const patch = { label: clean, points: lqPointsAf(points, q) };
  const nuvaerende = q?.deadline != null ? Number(q.deadline) : null;
  let saetterDeadline = false;
  if (deadline != null && deadline !== '') {
    const ms = new Date(deadline).getTime();
    if (!Number.isFinite(ms)) return { ok: false, error: 'Ugyldig deadline.' };
    if (ms <= Date.now()) {
      return { ok: false, error: 'Deadline skal ligge i fremtiden — en passeret deadline viser alles svar med det samme og kan aldrig ændres igen.' };
    }
    if (nuvaerende != null && ms < nuvaerende) {
      return { ok: false, error: 'Deadline kan kun udskydes — aldrig rykkes frem.' };
    }
    if (ms !== nuvaerende) { patch.deadline = ms; saetterDeadline = true; }
  }
  try {
    await updateDoc(
      doc(db, COL.GAMES, gameId, COL.GAME_LEAGUES, leagueId, COL.GAME_LEAGUE_QUESTIONS, questionId),
      patch,
    );
    return { ok: true, deadlineSat: saetterDeadline };
  } catch (err) {
    if (err?.code === 'permission-denied') {
      // Kapløbet: rækken kan stå åben, efter serverens ur har passeret
      // deadline — den generiske adgangs-besked ville være ubrugelig her.
      return {
        ok: false,
        error: saetterDeadline
          ? 'Deadline nåede at passere — den kan ikke ændres længere. Svarene er nu vist for alle.'
          : 'Rettelsen blev afvist af reglerne — er spørgsmålet lige blevet lukket?',
      };
    }
    return { ok: false, error: danishError(err, 'Kunne ikke gemme rettelsen.') };
  }
}

/** Spørgsmålets nye pointværdi: brugerens tal hvis gyldigt, ellers det gamle. */
function lqPointsAf(points, q) {
  const p = Number(points);
  if (Number.isFinite(p) && p >= 1 && p <= 100) return p;
  const gammel = Number(q?.points);
  return Number.isFinite(gammel) && gammel >= 1 && gammel <= 100 ? gammel : 5;
}

/**
 * Runde-Bottens afsløring af ET liga-spørgsmål — den BEVIDSTE start (botten
 * poster normalt selv via trigger, når facit sættes; knappen er recovery).
 * dryRun=true (default) returnerer teksten uden at poste — kræver medlemskab,
 * for forhåndsvisningen indeholder svar og navne. tvingNy poster igen, selv
 * om markøren er sat (det gamle opslag skal slettes manuelt på væggen).
 */
export async function callLeagueQuestionRecapNow(gameId, leagueId, questionId, { dryRun = true, tvingNy = false } = {}) {
  try {
    const { httpsCallable } = await import('firebase/functions');
    const { functions } = await import('../../firebase');
    const fn = httpsCallable(functions, 'leagueQuestionRecapNow', { timeout: 300000 });
    const res = await fn({ gameId, leagueId, questionId, dryRun, tvingNy });
    return { ok: true, data: res.data };
  } catch (err) {
    const msg = err?.code === 'functions/not-found'
      ? 'Funktionen er ikke rullet ud endnu — prøv igen om lidt.'
      : err?.message || 'Kunne ikke generere afsløringen.';
    return { ok: false, error: msg };
  }
}

export async function callLeagueQuestionStatus(gameId, leagueId) {
  try {
    const { httpsCallable } = await import('firebase/functions');
    const { functions } = await import('../../firebase');
    const fn = httpsCallable(functions, 'leagueQuestionStatus', { timeout: 60000 });
    const res = await fn({ gameId, leagueId });
    return { ok: true, data: res.data };
  } catch (err) {
    const msg = err?.code === 'functions/not-found'
      ? 'Funktionen er ikke rullet ud endnu — prøv igen om lidt.'
      : err?.message || 'Kunne ikke hente svar-status.';
    return { ok: false, error: msg };
  }
}
