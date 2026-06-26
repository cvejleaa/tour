/**
 * Firebase-handlinger for kommentarer:
 *  - Liga-væg (leagueComments): beskeder synlige for alle medlemmer af en liga
 *  - Private beskeder (messages): 1:1-samtaler mellem to brugere
 */
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';

const MAX_LEN = 1000;

function cleanText(text) {
  const t = (text ?? '').trim();
  if (!t) throw new Error('Skriv en besked først.');
  if (t.length > MAX_LEN) throw new Error(`Beskeden er for lang (maks. ${MAX_LEN} tegn).`);
  return t;
}

/**
 * Skriv en kommentar på en ligas væg.
 * @param {object} p
 * @param {string} p.leagueId
 * @param {string} p.uid          – forfatterens uid
 * @param {string} p.displayName  – forfatterens visningsnavn (cachet på beskeden)
 * @param {string} p.text
 * @returns {Promise<string>} det nye dokument-id
 */
export async function postLeagueComment({ leagueId, uid, displayName, text, avatarEmoji = null, favoriteTeam = null }) {
  if (!leagueId) throw new Error('Mangler liga.');
  if (!uid) throw new Error('Du skal være logget ind.');
  const ref = await addDoc(collection(db, COL.LEAGUE_COMMENTS), {
    leagueId,
    uid,
    displayName: displayName || 'Spiller',
    avatarEmoji: avatarEmoji || null,
    favoriteTeam: favoriteTeam || null,
    text: cleanText(text),
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/** Slet en liga-kommentar (forfatter, ligaens ejer eller admin – håndhæves af reglerne). */
export async function deleteLeagueComment(commentId) {
  if (!commentId) throw new Error('Mangler kommentar-id.');
  await deleteDoc(doc(db, COL.LEAGUE_COMMENTS, commentId));
}

/**
 * Stabilt samtale-id for to brugere (uafhængigt af rækkefølge).
 * @param {string} a
 * @param {string} b
 * @returns {string}
 */
export function conversationId(a, b) {
  return [a, b].sort().join('__');
}

/**
 * Send en privat besked til en anden bruger.
 * @param {object} p
 * @param {string} p.from – afsenderens uid
 * @param {string} p.to   – modtagerens uid
 * @param {string} p.text
 * @returns {Promise<string>} det nye dokument-id
 */
export async function sendMessage({ from, to, text, leagueId }) {
  if (!from) throw new Error('Du skal være logget ind.');
  if (!to) throw new Error('Vælg en modtager.');
  if (from === to) throw new Error('Du kan ikke sende en besked til dig selv.');
  if (!leagueId) throw new Error('Du kan kun skrive med spillere, du deler en liga med.');
  const participants = [from, to].sort();
  const ref = await addDoc(collection(db, COL.MESSAGES), {
    participants,
    conversationId: conversationId(from, to),
    from,
    to,
    leagueId,
    text: cleanText(text),
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/** Slet en privat besked (kun afsenderen – håndhæves af reglerne). */
export async function deleteMessage(messageId) {
  if (!messageId) throw new Error('Mangler besked-id.');
  await deleteDoc(doc(db, COL.MESSAGES, messageId));
}
