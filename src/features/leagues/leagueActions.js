/**
 * Firebase-handlinger for ligaer: opret, tilmeld, forlad, slet, fjern medlem.
 */
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  arrayUnion,
  arrayRemove,
  query,
  where,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { COL, LEAGUE_STATUS } from '../../lib/constants';
import { generateJoinCode } from './leagueUtils';
import { DEFAULT_SCORING } from './leagueFormat';

// Sanitér et scoring-objekt til de kendte boolean-nøgler
function cleanScoring(scoring) {
  const s = scoring || {};
  return {
    group: !!(s.group ?? true),
    knockout: !!(s.knockout ?? true),
    bonus: !!(s.bonus ?? true),
    leagueBonus: !!(s.leagueBonus ?? true),
    doubleKnockout: !!(s.doubleKnockout ?? false),
  };
}

/**
 * Opret en ny liga.
 * @param {string} name      – ligaens navn
 * @param {string} ownerUid  – opretterens uid
 * @returns {Promise<string>} – det nye dokument-id
 */
export async function createLeague(name, ownerUid, scoring = DEFAULT_SCORING) {
  if (!name?.trim()) throw new Error('Ligaen skal have et navn.');
  if (!ownerUid) throw new Error('Mangler brugerId.');

  const joinCode = generateJoinCode();

  const ref = await addDoc(collection(db, COL.LEAGUES), {
    name: name.trim(),
    ownerUid,
    joinCode,
    memberUids: [ownerUid],
    adminUids: [], // liga-admins udpeges af den globale ejer
    scoring: cleanScoring(scoring), // kombinerbare dele der tæller i ligaen
    status: LEAGUE_STATUS.PENDING, // skal godkendes af admin
    createdAt: serverTimestamp(),
  });

  return ref.id;
}

/**
 * Slå AI-morgenopslag (VM-Botten) til/fra for en liga (liga-ejer).
 * @param {string} leagueId
 * @param {boolean} enabled
 */
export async function setLeagueAiRecaps(leagueId, enabled) {
  if (!leagueId) throw new Error('Mangler liga-id.');
  await updateDoc(doc(db, COL.LEAGUES, leagueId), { aiRecaps: enabled });
}

/**
 * Generér en ny join-/invitationskode for en liga (liga-ejer).
 * Brugbart hvis den gamle kode er lækket. Den gamle kode holder op med at virke.
 * @param {string} leagueId
 * @returns {Promise<string>} den nye kode
 */
export async function regenerateJoinCode(leagueId) {
  if (!leagueId) throw new Error('Mangler liga-id.');
  const code = generateJoinCode();
  await updateDoc(doc(db, COL.LEAGUES, leagueId), { joinCode: code });
  return code;
}

/**
 * Sæt en ligas scoring-valg (liga-ejer/-admin). Styres af sikkerhedsreglerne.
 * @param {string} leagueId
 * @param {object} scoring – kombinerbart scoring-objekt
 */
export async function setLeagueScoring(leagueId, scoring) {
  const clean = cleanScoring(scoring);
  if (!clean.group && !clean.knockout && !clean.bonus && !clean.leagueBonus) {
    throw new Error('Vælg mindst én del der skal tælle.');
  }
  await updateDoc(doc(db, COL.LEAGUES, leagueId), { scoring: clean });
}

/**
 * Global ejer: udpeg eller fjern en liga-admin.
 * @param {string} leagueId
 * @param {string} uid       – medlemmet der gøres til/fjernes som liga-admin
 * @param {boolean} makeAdmin
 */
export async function setLeagueAdmin(leagueId, uid, makeAdmin) {
  if (!uid) throw new Error('Vælg en bruger.');
  await updateDoc(doc(db, COL.LEAGUES, leagueId), {
    adminUids: makeAdmin ? arrayUnion(uid) : arrayRemove(uid),
  });
}

/**
 * Tilmeld den aktuelle bruger til en liga via join-kode.
 * @param {string} joinCode
 * @param {string} uid
 * @returns {Promise<{id: string, name: string}>} – liga-info
 */
export async function joinLeague(joinCode, uid) {
  if (!joinCode?.trim()) throw new Error('Angiv en gyldig kode.');
  if (!uid) throw new Error('Mangler brugerId.');

  // Find liga med den angivne kode
  const q = query(
    collection(db, COL.LEAGUES),
    where('joinCode', '==', joinCode.trim().toUpperCase()),
  );
  const snap = await getDocs(q);

  if (snap.empty) throw new Error('Ingen liga fundet med den kode.');

  const leagueDoc = snap.docs[0];
  const leagueData = leagueDoc.data();

  // Ligaen skal være godkendt af admin før man kan tilmelde sig
  if (leagueData.status !== LEAGUE_STATUS.APPROVED) {
    throw new Error('Ligaen er endnu ikke godkendt af admin.');
  }

  // Tjek om brugeren allerede er medlem
  if (leagueData.memberUids?.includes(uid)) {
    throw new Error('Du er allerede medlem af denne liga.');
  }

  await updateDoc(leagueDoc.ref, {
    memberUids: arrayUnion(uid),
  });

  return { id: leagueDoc.id, name: leagueData.name };
}

/**
 * Admin: sæt en ligas status (godkend/afvis).
 * @param {string} leagueId
 * @param {'approved'|'rejected'|'pending'} status
 */
export async function setLeagueStatus(leagueId, status) {
  await updateDoc(doc(db, COL.LEAGUES, leagueId), { status });
}

/**
 * Admin: omdøb en liga.
 * @param {string} leagueId
 * @param {string} name – det nye navn
 */
export async function renameLeague(leagueId, name) {
  const trimmed = (name ?? '').trim();
  if (!trimmed) throw new Error('Ligaen skal have et navn.');
  if (trimmed.length > 40) throw new Error('Navnet er for langt (maks. 40 tegn).');
  await updateDoc(doc(db, COL.LEAGUES, leagueId), { name: trimmed });
}

/**
 * Admin: tilmeld et medlem til en liga.
 * @param {string} leagueId
 * @param {string} memberUid
 */
export async function adminAddMember(leagueId, memberUid) {
  if (!memberUid) throw new Error('Vælg et medlem.');
  await updateDoc(doc(db, COL.LEAGUES, leagueId), {
    memberUids: arrayUnion(memberUid),
  });
}

/**
 * Forlad en liga (fjerner eget uid fra memberUids).
 * Ejeren kan ikke forlade sin egen liga; han/hun skal slette den.
 * @param {string} leagueId
 * @param {string} uid
 * @param {string} ownerUid
 */
export async function leaveLeague(leagueId, uid, ownerUid) {
  if (uid === ownerUid) throw new Error('Ejeren kan ikke forlade sin liga. Slet den i stedet.');
  await updateDoc(doc(db, COL.LEAGUES, leagueId), {
    memberUids: arrayRemove(uid),
  });
}

/**
 * Slet en liga (kun ejeren).
 * @param {string} leagueId
 * @param {string} uid
 * @param {string} ownerUid
 */
export async function deleteLeague(leagueId, uid, ownerUid) {
  if (uid !== ownerUid) throw new Error('Kun ejeren kan slette ligaen.');
  await deleteDoc(doc(db, COL.LEAGUES, leagueId));
}

/**
 * Fjern et bestemt medlem fra en liga (kun ejeren).
 * @param {string} leagueId
 * @param {string} memberUid  – uid'et der skal fjernes
 * @param {string} ownerUid   – der laver handlingen
 */
export async function removeMember(leagueId, memberUid, ownerUid) {
  if (memberUid === ownerUid) throw new Error('Du kan ikke fjerne dig selv som ejer.');
  await updateDoc(doc(db, COL.LEAGUES, leagueId), {
    memberUids: arrayRemove(memberUid),
  });
}
