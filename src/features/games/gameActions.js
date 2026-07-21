/**
 * Firebase-handlinger for spil (games): deltag og forlad.
 *
 * Et "spil" er én tippekonkurrence (fx VM 2026, Tour de France 2026). En
 * spiller deltager ved at oprette sit eget dokument under
 * games/{gameId}/players/{uid}. Kun de ikke-point-felter (uid, joinedAt) må
 * sættes af spilleren selv — pointfelter ejes af serveren (se Security Rules
 * + PROTECTED_PLAYER_FIELDS).
 *
 * Alle funktioner returnerer samme resultat-form:
 *   { ok: true }  ved succes
 *   { ok: false, error: 'dansk fejlbesked' }  ved fejl
 */
import {
  doc, setDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';

/**
 * Oversæt en fejl til en brugervenlig dansk besked.
 * @param {unknown} err
 * @param {string} fallback
 * @returns {string}
 */
function danishError(err, fallback) {
  const code = err?.code || '';
  if (code === 'permission-denied') {
    return 'Du har ikke adgang til denne handling.';
  }
  if (code === 'unavailable') {
    return 'Kunne ikke få forbindelse. Prøv igen.';
  }
  return err?.message || fallback;
}

/**
 * Deltag i et spil (opret games/{gameId}/players/{uid}).
 * @param {string} uid     – den indloggede brugers uid
 * @param {string} gameId  – spillets id
 * @returns {Promise<{ok: true}|{ok: false, error: string}>}
 */
export async function joinGame(uid, gameId) {
  if (!uid) return { ok: false, error: 'Du skal være logget ind for at deltage.' };
  if (!gameId) return { ok: false, error: 'Mangler spil-id.' };
  try {
    const ref = doc(db, COL.GAMES, gameId, COL.GAME_PLAYERS, uid);
    // Kun ikke-point-felter — serveren ejer pointsummer og placering.
    await setDoc(ref, { uid, joinedAt: serverTimestamp() });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: danishError(err, 'Kunne ikke deltage i spillet.') };
  }
}

/**
 * Gem hold-visnings-overrides (fx badge-farve) på spillet. Kun admin/owner
 * (håndhæves af security rules: games/{gameId} write = isGlobalAdmin).
 * @param {string} gameId
 * @param {Record<string, {color?:string}>} teamStyles – holdnavn → { color }
 * @returns {Promise<{ok:true}|{ok:false,error:string}>}
 */
export async function setTeamStyles(gameId, teamStyles) {
  if (!gameId) return { ok: false, error: 'Mangler spil-id.' };
  try {
    await setDoc(
      doc(db, COL.GAMES, gameId),
      { teamStyles, updatedAt: serverTimestamp() },
      { merge: true },
    );
    return { ok: true };
  } catch (err) {
    return { ok: false, error: danishError(err, 'Kunne ikke gemme hold-farver.') };
  }
}

/**
 * Forlad et spil (slet games/{gameId}/players/{uid}).
 * Reglerne tillader kun sletning, hvis dokumentet ikke har point.
 * @param {string} uid     – den indloggede brugers uid
 * @param {string} gameId  – spillets id
 * @returns {Promise<{ok: true}|{ok: false, error: string}>}
 */
export async function leaveGame(uid, gameId) {
  if (!uid) return { ok: false, error: 'Du skal være logget ind.' };
  if (!gameId) return { ok: false, error: 'Mangler spil-id.' };
  try {
    const ref = doc(db, COL.GAMES, gameId, COL.GAME_PLAYERS, uid);
    await deleteDoc(ref);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: danishError(err, 'Kunne ikke forlade spillet.') };
  }
}
