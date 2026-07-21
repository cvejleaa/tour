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
  collection, doc, setDoc, updateDoc, arrayRemove, serverTimestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../firebase';
import { COL } from '../../lib/constants';
import { generateJoinCode } from '../leagues/leagueUtils';

function danishError(err, fallback) {
  const code = err?.code || '';
  if (code === 'permission-denied' || code === 'functions/permission-denied') {
    return 'Du har ikke adgang til denne handling.';
  }
  if (code === 'not-found' || code === 'functions/not-found') {
    return 'Ingen liga fundet med den kode.';
  }
  if (code === 'unavailable' || code === 'functions/unavailable') {
    return 'Kunne ikke få forbindelse. Prøv igen.';
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
 * Forlad en liga (fjern sig selv fra memberUids). Ejeren kan også forlade;
 * ligaen består (evt. tom) — oprydning er en senere finpudsning.
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
