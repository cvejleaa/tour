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
 * @param {{uid:string, gameId:string, leagueId:string, label:string, type?:'text'|'yesno'|'number', points?:number, deadline?:string|null}} o
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
      type: ['text', 'yesno', 'number'].includes(type) ? type : 'text',
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
