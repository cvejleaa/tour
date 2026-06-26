/**
 * Aktivitets-feed pr. liga. Skrives bedst-muligt fra klient-handlinger
 * (tilmelding, kommentarer, omdøbning m.m.). Fejl her må aldrig vælte
 * selve handlingen, så kald wrappes i try/catch af kalderen.
 */
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';

export const ACTIVITY = {
  JOIN: 'join',
  LEAVE: 'leave',
  COMMENT: 'comment',
  RENAME: 'rename',
  CREATED: 'created',
};

/**
 * Log en hændelse i en ligas feed.
 * @param {{leagueId:string, type:string, text:string, actorUid:string, actorName?:string}} p
 */
export async function logActivity({ leagueId, type, text, actorUid, actorName }) {
  if (!leagueId || !actorUid) return;
  await addDoc(collection(db, COL.LEAGUE_ACTIVITY), {
    leagueId,
    type: type || 'info',
    text: text || '',
    actorUid,
    actorName: actorName || 'Spiller',
    createdAt: serverTimestamp(),
  });
}

/** Som logActivity, men sluger fejl (best-effort logging). */
export async function tryLogActivity(p) {
  try { await logActivity(p); }
  catch (e) { console.warn('Kunne ikke logge aktivitet:', e?.message); }
}
