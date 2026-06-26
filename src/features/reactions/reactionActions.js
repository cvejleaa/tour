/**
 * Emoji-reaktioner gemt inline på et dokument i feltet `reactions`:
 *   reactions: { "👍": [uid, ...], "🔥": [uid, ...] }
 * Bruges på liga-kommentarer og på andres tips (efter kickoff).
 */
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from '../../firebase';

/** Hurtig-reaktioner der tilbydes i UI'et. */
export const QUICK_REACTIONS = ['👍', '😂', '🔥', '⚽', '😮', '❤️'];

/**
 * Slå en reaktion til/fra for den aktuelle bruger.
 * @param {string} collectionName
 * @param {string} docId
 * @param {string} emoji
 * @param {string} uid
 * @param {boolean} hasReacted – om brugeren allerede har reageret med denne emoji
 */
export async function toggleReaction(collectionName, docId, emoji, uid, hasReacted) {
  if (!uid) throw new Error('Du skal være logget ind.');
  if (!emoji) throw new Error('Vælg en emoji.');
  await updateDoc(doc(db, collectionName, docId), {
    [`reactions.${emoji}`]: hasReacted ? arrayRemove(uid) : arrayUnion(uid),
  });
}
