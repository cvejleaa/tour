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
  doc, setDoc, deleteDoc, deleteField, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';

/**
 * Oversæt en admin-indtastet dato til en Firestore-værdi:
 *   null/'' → deleteField() (ryd feltet)   ·   Date/ms/ISO → Timestamp.
 */
function toScheduleValue(v) {
  if (v == null || v === '') return deleteField();
  const ms = typeof v === 'number' ? v : (v instanceof Date ? v.getTime() : Date.parse(v));
  if (!Number.isFinite(ms)) return deleteField();
  return Timestamp.fromMillis(ms);
}

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
 * Sæt spillets tidsplan (kun admin/owner — håndhæves af security rules:
 * games/{gameId} write = isGlobalAdmin). Felterne styres uafhængigt:
 *   - startAt     : hvornår selve spillet går i gang (informativt/gate).
 *   - puljeLockAt : deadline for bonus-/pulje-tippet.
 * Udelad et felt (undefined) for at lade det være urørt; giv null/'' for at
 * rydde det. Så kan admin fx åbne for bonus-tip længere end til runde 1.
 * @param {string} gameId
 * @param {{startAt?: Date|number|string|null, puljeLockAt?: Date|number|string|null}} schedule
 * @returns {Promise<{ok:true}|{ok:false,error:string}>}
 */
export async function setGameSchedule(gameId, { startAt, puljeLockAt } = {}) {
  if (!gameId) return { ok: false, error: 'Mangler spil-id.' };
  const patch = { updatedAt: serverTimestamp() };
  if (startAt !== undefined) patch.startAt = toScheduleValue(startAt);
  if (puljeLockAt !== undefined) patch.puljeLockAt = toScheduleValue(puljeLockAt);
  try {
    await setDoc(doc(db, COL.GAMES, gameId), patch, { merge: true });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: danishError(err, 'Kunne ikke gemme spillets tidsplan.') };
  }
}

/**
 * Gem et pulje-tip: spillerens 6 valgte mesterskabs-hold (games/{gameId}/
 * puljeBets/{uid}). De øvrige 6 hold = nedrykningsspillet. Point sættes af
 * serveren ved grundspillets slut. Deadline håndhæves af security rules.
 * @param {string} uid
 * @param {string} gameId
 * @param {string[]} championship – præcis 6 distinkte holdnavne
 * @returns {Promise<{ok:true}|{ok:false,error:string}>}
 */
export async function setPuljeBet(uid, gameId, championship) {
  if (!uid) return { ok: false, error: 'Du skal være logget ind.' };
  if (!gameId) return { ok: false, error: 'Mangler spil-id.' };
  const picks = Array.isArray(championship) ? [...new Set(championship.filter(Boolean))] : [];
  if (picks.length !== 6) return { ok: false, error: 'Vælg præcis 6 hold til mesterskabsspillet.' };
  try {
    const ref = doc(db, COL.GAMES, gameId, COL.GAME_PULJE, uid);
    await setDoc(ref, { uid, championship: picks, updatedAt: serverTimestamp() }, { merge: true });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: danishError(err, 'Kunne ikke gemme pulje-tippet (deadline måske passeret).') };
  }
}

/**
 * Sæt spillerens yndlingshold I DETTE spil (games/{gameId}/players/{uid}.
 * favoriteTeam). Holdene er forskellige fra spil til spil, så holdet hører til
 * spillet — ikke den globale profil. Tom værdi rydder valget. favoriteTeam er
 * ikke et beskyttet point-felt, så spilleren må selv skrive det (security rules).
 * @param {string} uid
 * @param {string} gameId
 * @param {string} team – holdnavn (tom = ryd)
 * @returns {Promise<{ok:true}|{ok:false,error:string}>}
 */
export async function setPlayerFavoriteTeam(uid, gameId, team) {
  if (!uid) return { ok: false, error: 'Du skal være logget ind.' };
  if (!gameId) return { ok: false, error: 'Mangler spil-id.' };
  try {
    const ref = doc(db, COL.GAMES, gameId, COL.GAME_PLAYERS, uid);
    await setDoc(ref, { favoriteTeam: team || null, updatedAt: serverTimestamp() }, { merge: true });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: danishError(err, 'Kunne ikke gemme dit hold.') };
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
