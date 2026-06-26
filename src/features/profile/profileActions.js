/**
 * Profil-handlinger: opdater egen avatar, yndlingshold og e-mail-præferencer.
 */
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';
import { TEAMS } from '../../lib/teams';

/**
 * Opdater den indloggede brugers profil-felter (ikke beskyttede felter).
 * @param {string} uid
 * @param {{ avatarEmoji?: string|null, favoriteTeam?: string|null, emailOptOut?: boolean }} fields
 */
export async function updateProfile(uid, fields) {
  if (!uid) throw new Error('Du skal være logget ind.');

  const patch = {};
  if ('avatarEmoji' in fields) {
    const e = fields.avatarEmoji;
    if (e && [...e].length > 4) throw new Error('Vælg en enkelt emoji.');
    patch.avatarEmoji = e || null;
  }
  if ('favoriteTeam' in fields) {
    const t = fields.favoriteTeam;
    if (t && !TEAMS[t]) throw new Error('Ukendt hold.');
    patch.favoriteTeam = t || null;
  }
  if ('emailOptOut' in fields) {
    patch.emailOptOut = !!fields.emailOptOut;
  }

  if (Object.keys(patch).length === 0) return;
  await updateDoc(doc(db, COL.USERS, uid), patch);
}
