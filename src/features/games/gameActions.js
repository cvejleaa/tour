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
  doc, setDoc, updateDoc, deleteDoc, deleteField, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { COL, GAME_STATUS_VALUES } from '../../lib/constants';

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
  // `updateDoc` mod et dokument, der ikke findes, giver `not-found` — og
  // Firestores egen besked er rå engelsk fejlsøgningstekst med hele stien i:
  // `5 NOT_FOUND: no entity to update: app: "dev~projekt" path < Element …`.
  // Den stod før direkte i admin-fladen, fordi fallbacken returnerer
  // `err.message` for ukendte koder.
  if (code === 'not-found') {
    return 'Findes ikke længere — prøv at genindlæse siden.';
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
    // `updateDoc`, IKKE `setDoc(..., { merge: true })`. Merge DYBDE-fletter
    // nested maps, så et hold, der udelades af `teamStyles`, beholdt sin gamle
    // værdi i Firestore. Admin-fladen sender kun det, der AFVIGER fra
    // standarden — og så kunne en nulstilling ikke gemmes: ↺ ryddede feltet i
    // formularen, payloaden udelod det, og merge lod det gamle stå. Knappen
    // lovede altså noget, den ikke kunne holde.
    //
    // Formularen er den fulde sandhed om spillets overrides, så feltet skal
    // ERSTATTES. Det gælder også farverne, som har haft samme fejl, siden de
    // blev indført — de kunne heller ikke nulstilles.
    await updateDoc(
      doc(db, COL.GAMES, gameId),
      { teamStyles, updatedAt: serverTimestamp() },
    );
    return { ok: true };
  } catch (err) {
    return { ok: false, error: danishError(err, 'Kunne ikke gemme hold-farver.') };
  }
}

/**
 * Sæt spillets tidsplan (kun admin/owner — håndhæves af security rules:
 * games/{gameId} write = isGlobalAdmin). Felterne styres uafhængigt:
 *   - startRound  : DEN, DER GATER. Runder før den giver ingen point og vises
 *                   ikke. En runde og ikke en dato, fordi en runde kan ligge
 *                   spredt over en måned — se src/lib/startGate.js.
 *   - startAt     : hvornår spillet går i gang. Er nu kun et fald-tilbage for
 *                   spil uden startRound, plus en oplysning på skærmen.
 *   - puljeLockAt : deadline for bonus-/pulje-tippet.
 * Udelad et felt (undefined) for at lade det være urørt; giv null/'' for at
 * rydde det. Så kan admin fx åbne for bonus-tip længere end til runde 1.
 * @param {string} gameId
 * @param {{startRound?: number|null, startAt?: Date|number|string|null, puljeLockAt?: Date|number|string|null}} schedule
 * @returns {Promise<{ok:true}|{ok:false,error:string}>}
 */
export async function setGameSchedule(gameId, { startRound, startAt, puljeLockAt } = {}) {
  if (!gameId) return { ok: false, error: 'Mangler spil-id.' };
  const patch = { updatedAt: serverTimestamp() };
  if (startRound !== undefined) {
    // Kun et helt, positivt tal — eller null for "ingen runde-gate". En streng
    // fra et input-felt eller et decimaltal ville stå i basen og blive
    // sammenlignet med `m.round` uden nogensinde at matche.
    const r = startRound === null || startRound === '' ? null : Number(startRound);
    if (r !== null && (!Number.isInteger(r) || r < 0)) {
      // 0 ER gyldigt og betyder "ingen runder gates" — derfor ikke "positivt".
      return { ok: false, error: 'Startrunden skal være et helt tal på 0 eller derover.' };
    }
    patch.startRound = r;
  }
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
 * Sæt spillets status — open → live → finished (kun admin/owner; håndhæves af
 * security rules: games/{gameId} write = isGlobalAdmin).
 *
 * "finished" er ikke kun en etiket: spillet forsvinder fra "Åbne spil — deltag",
 * Forlad-knappen falder væk, og de daglige påmindelser holder op med at blive
 * sendt for spillet.
 *
 * Værdien tjekkes her, så en tastefejl i UI'et ikke lander som en status, ingen
 * visning kender (kortet ville vise rå-teksten, og påmindelserne ville stoppe
 * tavst). Det er en hjælp, ikke en spærring: reglerne lader en global admin
 * skrive hvad som helst på games/{gameId}, så beskyttelsen mod fremmede ligger
 * i isGlobalAdmin() — ikke i denne linje.
 * @param {string} gameId
 * @param {string} status – en værdi fra GAME_STATUS
 * @returns {Promise<{ok:true}|{ok:false,error:string}>}
 */
export async function setGameStatus(gameId, status) {
  if (!gameId) return { ok: false, error: 'Mangler spil-id.' };
  if (!GAME_STATUS_VALUES.includes(status)) return { ok: false, error: 'Ukendt status.' };
  try {
    await setDoc(
      doc(db, COL.GAMES, gameId),
      { status, updatedAt: serverTimestamp() },
      { merge: true },
    );
    return { ok: true };
  } catch (err) {
    return { ok: false, error: danishError(err, 'Kunne ikke gemme spillets status.') };
  }
}

/**
 * Vis eller skjul spillet på spiloversigten (games/{gameId}.joinable — kun
 * admin/owner; håndhæves af security rules: games/{gameId} write =
 * isGlobalAdmin).
 *
 * SKJULT BETYDER ÉN TING: spillet står ikke under "Åbne spil — deltag", så
 * ingen bliver budt ind, mens det bliver gennemgået. Det er IKKE en
 * adgangsspærring, og det er værd at være præcis om hvor lidt det er:
 *   - useGames abonnerer på HELE games-kollektionen, så det skjulte spils
 *     navn, emoji og id ligger allerede i enhver godkendt brugers browser.
 *     Skjulningen er en .filter() i splitGames — der skal ikke noget link til.
 *   - firestore.rules lader enhver godkendt bruger læse både spil-dokumentet
 *     (:604) og kampene (:721).
 *   - joinable findes ikke ét sted i firestore.rules og ikke i nogen af
 *     functions-mapperne — den, der åbner /spil/{id}, får en Deltag-knap, der
 *     virker. Bekræftet mod emulatoren.
 * Skjult = ikke annonceret. Hverken mere eller mindre.
 *
 * Og det gælder kun dem, der IKKE er med endnu: splitGames filtrerer kun
 * "åbne" på joinable, så en spiller, der allerede er tilmeldt, beholder
 * spillet under "Mine spil".
 *
 * Værdien skal være en ægte boolean. Uden det tjek ville en streng som
 * 'false' — sandt i JavaScript — gøre spillet synligt af netop det klik, der
 * skulle skjule det.
 * @param {string} gameId
 * @param {boolean} joinable – true = vises under "Åbne spil", false = skjult
 * @returns {Promise<{ok:true}|{ok:false,error:string}>}
 */
export async function setGameJoinable(gameId, joinable) {
  if (!gameId) return { ok: false, error: 'Mangler spil-id.' };
  if (typeof joinable !== 'boolean') return { ok: false, error: 'Synlighed skal være til eller fra.' };
  try {
    await setDoc(
      doc(db, COL.GAMES, gameId),
      { joinable, updatedAt: serverTimestamp() },
      { merge: true },
    );
    return { ok: true };
  } catch (err) {
    return { ok: false, error: danishError(err, 'Kunne ikke ændre spillets synlighed.') };
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
