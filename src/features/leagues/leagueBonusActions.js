/**
 * Firebase-handlinger for individuelle liga-bonusspørgsmål.
 */
import {
  collection, addDoc, doc, setDoc, updateDoc, deleteDoc, serverTimestamp,
  arrayUnion, arrayRemove, getDocs, query, where,
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
export async function createLeagueBonus({ leagueId, createdBy, type, label, points = 5, deadline, copyGroupId = null }) {
  if (!leagueId) throw new Error('Mangler liga.');
  if (!createdBy) throw new Error('Du skal være logget ind.');
  if (!VALID.includes(type)) throw new Error('Ukendt spørgsmålstype.');
  if (!label?.trim()) throw new Error('Skriv et spørgsmål.');
  const p = Number(points);
  if (!Number.isFinite(p) || p <= 0) throw new Error('Point skal være et positivt tal.');
  if (!deadline) throw new Error('Vælg en svarfrist.');
  assertFutureDeadline(deadline);

  const data = {
    leagueId,
    createdBy,
    type,
    label: label.trim(),
    points: p,
    deadline,
    facit: null,
    createdAt: serverTimestamp(),
  };
  // copyGroupId binder alle kopier af samme kildespørgsmål sammen (idempotens).
  if (copyGroupId) data.copyGroupId = copyGroupId;

  const ref = await addDoc(collection(db, COL.LEAGUE_BONUS), data);
  return ref.id;
}

/** Sæt facit på et spørgsmål (manager). */
export async function setLeagueBonusFacit(questionId, facit) {
  await updateDoc(doc(db, COL.LEAGUE_BONUS, questionId), { facit });
}

/**
 * Kopiér et bonusspørgsmål til flere ligaer (global admin). Hver kopi afgøres
 * for sig i sin egen liga — for NUMBER betyder det at den nærmeste i HVER liga
 * vinder. Er facit allerede sat, kopieres det med, så resultatet propagerer.
 *
 * Idempotent: alle kopier deler en copyGroupId, og en liga der allerede har en
 * kopi fra samme gruppe springes over. Det sikrer at en spiller aldrig kan få
 * point flere gange for det samme (kopierede) spørgsmål i samme liga — fx hvis
 * "Kopiér til alle ligaer" trykkes to gange.
 * @param {object} question  – kildespørgsmålet (label, type, deadline, …)
 * @param {string[]} targetLeagueIds  – ligaer der skal have en kopi
 * @param {string} createdBy  – admins uid
 * @returns {Promise<{created:number, skipped:number, errors:Array<{leagueId:string, message:string}>}>}
 */
export async function copyLeagueBonusToLeagues(question, targetLeagueIds, createdBy) {
  const result = { created: 0, skipped: 0, errors: [] };
  // Kildespørgsmålet er selv en del af gruppen (egen id, eller en arvet gruppe).
  const copyGroupId = question.copyGroupId || question.id;
  for (const leagueId of targetLeagueIds) {
    try {
      // Findes der allerede en kopi fra samme gruppe i ligaen? Så spring over.
      const existing = await getDocs(query(
        collection(db, COL.LEAGUE_BONUS),
        where('leagueId', '==', leagueId),
        where('copyGroupId', '==', copyGroupId),
      ));
      if (!existing.empty) { result.skipped += 1; continue; }

      const newId = await createLeagueBonus({
        leagueId,
        createdBy,
        type: question.type,
        label: question.label,
        points: question.points,
        deadline: question.deadline,
        copyGroupId,
      });
      if (question.facit != null && question.facit !== '') {
        await setLeagueBonusFacit(newId, question.facit);
      }
      result.created += 1;
    } catch (e) {
      result.errors.push({ leagueId, message: e.message });
    }
  }
  return result;
}

/**
 * Redigér et eksisterende spørgsmål (manager). Sender kun de felter der gives.
 * @param {string} questionId
 * @param {{label?:string, deadline?:any, points?:number, type?:string}} fields
 */
export async function updateLeagueBonus(questionId, fields = {}) {
  const patch = {};
  if (fields.label != null) {
    if (!fields.label.trim()) throw new Error('Skriv et spørgsmål.');
    patch.label = fields.label.trim();
  }
  if (fields.type != null) {
    if (!VALID.includes(fields.type)) throw new Error('Ukendt spørgsmålstype.');
    patch.type = fields.type;
  }
  if (fields.points != null) {
    const p = Number(fields.points);
    if (!Number.isFinite(p) || p <= 0) throw new Error('Point skal være et positivt tal.');
    patch.points = p;
  }
  if (fields.deadline != null) {
    assertFutureDeadline(fields.deadline);
    patch.deadline = fields.deadline;
  }
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
