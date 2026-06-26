/**
 * Firebase-handlinger for individuelle liga-bonusspørgsmål.
 */
import {
  collection, addDoc, doc, setDoc, updateDoc, deleteDoc, serverTimestamp,
  arrayUnion, arrayRemove,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { COL, LEAGUE_BONUS_TYPE } from '../../lib/constants';

const VALID = Object.values(LEAGUE_BONUS_TYPE);

/** Kast hvis en deadline (Timestamp eller Date) allerede er passeret. */
function assertFutureDeadline(deadline) {
  const ms = deadline?.toMillis ? deadline.toMillis()
    : (deadline instanceof Date ? deadline.getTime() : NaN);
  if (!Number.isFinite(ms)) throw new Error('Vælg en gyldig svarfrist.');
  if (ms <= Date.now()) throw new Error('Svarfristen skal ligge i fremtiden.');
}

/**
 * Opret et bonusspørgsmål i en liga (kun manager – håndhæves af reglerne).
 * @param {object} p
 */
export async function createLeagueBonus({ leagueId, createdBy, type, label, options = [], size = 5, deadline }) {
  if (!leagueId) throw new Error('Mangler liga.');
  if (!createdBy) throw new Error('Du skal være logget ind.');
  if (!VALID.includes(type)) throw new Error('Ukendt spørgsmålstype.');
  if (!label?.trim()) throw new Error('Skriv et spørgsmål.');
  if (!deadline) throw new Error('Vælg en svarfrist.');
  assertFutureDeadline(deadline);
  if (type === LEAGUE_BONUS_TYPE.CHOICE && options.filter((o) => o.trim()).length < 2) {
    throw new Error('Angiv mindst to svarmuligheder.');
  }

  const data = {
    leagueId,
    createdBy,
    type,
    label: label.trim(),
    deadline,
    facit: null,
    createdAt: serverTimestamp(),
  };
  if (type === LEAGUE_BONUS_TYPE.CHOICE) data.options = options.map((o) => o.trim()).filter(Boolean);
  if (type === LEAGUE_BONUS_TYPE.TOPLIST) data.size = Math.min(Math.max(Number(size) || 5, 1), 10);

  const ref = await addDoc(collection(db, COL.LEAGUE_BONUS), data);
  return ref.id;
}

/** Sæt facit på et spørgsmål (manager). */
export async function setLeagueBonusFacit(questionId, facit) {
  await updateDoc(doc(db, COL.LEAGUE_BONUS, questionId), { facit });
}

/**
 * Redigér et eksisterende spørgsmål (manager). Sender kun de felter der gives.
 * @param {string} questionId
 * @param {{label?:string, deadline?:any, options?:string[], size?:number, type?:string}} fields
 */
export async function updateLeagueBonus(questionId, fields = {}) {
  const patch = {};
  if (fields.label != null) {
    if (!fields.label.trim()) throw new Error('Skriv et spørgsmål.');
    patch.label = fields.label.trim();
  }
  if (fields.deadline != null) {
    assertFutureDeadline(fields.deadline);
    patch.deadline = fields.deadline;
  }
  if (fields.options != null) {
    const opts = fields.options.map((o) => o.trim()).filter(Boolean);
    if (fields.type === LEAGUE_BONUS_TYPE.CHOICE && opts.length < 2) {
      throw new Error('Angiv mindst to svarmuligheder.');
    }
    patch.options = opts;
  }
  if (fields.size != null) patch.size = Math.min(Math.max(Number(fields.size) || 5, 1), 10);
  if (Object.keys(patch).length === 0) return;
  await updateDoc(doc(db, COL.LEAGUE_BONUS, questionId), patch);
}

/** Manager: godkend en indsendt stavemåde som korrekt (fritekst). */
export async function approveLeagueBonusAnswer(questionId, answer) {
  await updateDoc(doc(db, COL.LEAGUE_BONUS, questionId), { acceptedAnswers: arrayUnion(answer) });
}

/** Manager: fjern en tidligere godkendt stavemåde. */
export async function removeLeagueBonusAnswer(questionId, answer) {
  await updateDoc(doc(db, COL.LEAGUE_BONUS, questionId), { acceptedAnswers: arrayRemove(answer) });
}

/** Slet et spørgsmål (manager). */
export async function deleteLeagueBonus(questionId) {
  await deleteDoc(doc(db, COL.LEAGUE_BONUS, questionId));
}

/**
 * Gem brugerens svar (id = qid_uid), før deadline.
 * @param {object} p
 */
export async function saveLeagueBonusAnswer({ questionId, leagueId, uid, answer }) {
  if (!questionId || !uid) throw new Error('Mangler data.');
  await setDoc(doc(db, COL.LEAGUE_BONUS_ANSWERS, `${questionId}_${uid}`), {
    questionId,
    leagueId,
    uid,
    answer,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}
