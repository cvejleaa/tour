/**
 * Profil-handlinger: opdater egen avatar, yndlingshold, e-mail-præferencer,
 * visningsnavn samt login-/kontakt-mail og tilkobling af Google-login.
 */
import { doc, updateDoc, setDoc } from 'firebase/firestore';
import {
  updateProfile as authUpdateProfile,
  verifyBeforeUpdateEmail,
  EmailAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  GoogleAuthProvider,
  linkWithPopup,
} from 'firebase/auth';
import { auth, db } from '../../firebase';
import { COL } from '../../lib/constants';
import { TOUR_TEAMS } from '../../data/tourTeams2026';
import { isJerseyToken, JERSEY_BY_TOKEN } from '../../data/jerseyAvatars';
import { PLATFORM_MODE } from '../../lib/platform';
import { getAuthErrorMessage } from '../auth/firebaseErrors';

const NAME_MAX = 40;

function isValidEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

/** Har den indloggede bruger et bestemt login (provider)? */
export function hasProvider(user, providerId) {
  return !!(user?.providerData || []).some((p) => p.providerId === providerId);
}

/**
 * Opdater eget visningsnavn. Skrives til den offentlige users-profil (tilladt
 * ikke-beskyttet felt) og holdes i sync med Firebase Auth-profilen.
 * @param {string} uid
 * @param {string} name
 */
export async function updateDisplayName(uid, name) {
  if (!uid) throw new Error('Du skal være logget ind.');
  const clean = String(name ?? '').trim();
  if (!clean) throw new Error('Navnet må ikke være tomt.');
  if (clean.length > NAME_MAX) throw new Error(`Navnet må højst være ${NAME_MAX} tegn.`);
  await updateDoc(doc(db, COL.USERS, uid), { displayName: clean });
  if (auth.currentUser && auth.currentUser.uid === uid) {
    // Ikke kritisk hvis Auth-profilen ikke kan opdateres — Firestore er kilden.
    try { await authUpdateProfile(auth.currentUser, { displayName: clean }); } catch { /* ignorér */ }
  }
  return clean;
}

/**
 * Opdater KONTAKT-mailen (hvor påmindelser/mails sendes hen). Skrives til den
 * private userContacts-collection; brugeren må kun skrive sit eget dokument.
 * Ændrer IKKE login-mailen (se changeLoginEmail).
 * @param {string} uid
 * @param {string} email
 */
export async function updateContactEmail(uid, email) {
  if (!uid) throw new Error('Du skal være logget ind.');
  const clean = String(email ?? '').trim().toLowerCase();
  if (!isValidEmail(clean)) throw new Error('Angiv en gyldig e-mailadresse.');
  await setDoc(doc(db, COL.USER_CONTACTS, uid), { uid, email: clean }, { merge: true });
  return clean;
}

/**
 * Skift LOGIN-mailen (Firebase-kontoen). Firebase sender en bekræftelses-mail
 * til den nye adresse; login-mailen skifter FØRST når brugeren klikker linket.
 * Kræver nylig login → vi re-autentificerer først (kodeord for e-mail-konti,
 * Google-popup for Google-konti). Opdaterer også kontakt-mailen, så påmindelser
 * med det samme sendes til den nye adresse.
 * @param {{ uid: string, newEmail: string, currentPassword?: string }} args
 */
export async function changeLoginEmail({ uid, newEmail, currentPassword } = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error('Du skal være logget ind.');
  const clean = String(newEmail ?? '').trim().toLowerCase();
  if (!isValidEmail(clean)) throw new Error('Angiv en gyldig e-mailadresse.');
  if (clean === String(user.email ?? '').toLowerCase()) {
    throw new Error('Den nye e-mail er den samme som den nuværende.');
  }

  try {
    // Re-autentificér (Firebase kræver nylig login for at ændre mail).
    if (hasProvider(user, 'password')) {
      if (!currentPassword) throw new Error('Angiv din nuværende adgangskode for at skifte login-mail.');
      const cred = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, cred);
    } else if (hasProvider(user, 'google.com')) {
      await reauthenticateWithPopup(user, new GoogleAuthProvider());
    }
    // Sender bekræftelses-mail til den nye adresse; login-mailen skifter først
    // når brugeren klikker linket.
    await verifyBeforeUpdateEmail(user, clean);
  } catch (err) {
    if (err instanceof Error && !err.code) throw err; // vores egne beskeder
    throw new Error(getAuthErrorMessage(err));
  }

  // Send fremover påmindelser til den nye adresse (kontakt-mailen).
  await updateContactEmail(uid, clean);
  return clean;
}

/**
 * Kobl Google-login på den nuværende konto, så brugeren fremover også (eller i
 * stedet) kan logge ind med Google. Efter tilkobling har kontoen begge metoder.
 * @returns {Promise<{ email: string|null }>}
 */
export async function linkGoogleLogin() {
  const user = auth.currentUser;
  if (!user) throw new Error('Du skal være logget ind.');
  if (hasProvider(user, 'google.com')) {
    throw new Error('Din konto er allerede koblet til Google-login.');
  }
  try {
    const res = await linkWithPopup(user, new GoogleAuthProvider());
    return { email: res.user?.email ?? null };
  } catch (err) {
    if (err?.code === 'auth/credential-already-in-use' || err?.code === 'auth/email-already-in-use') {
      throw new Error('Der findes allerede en separat konto med den Google-adresse. Log ind med Google i stedet, eller kontakt en admin for at flette kontiene.');
    }
    throw new Error(getAuthErrorMessage(err));
  }
}

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
    // Trøje-avatarer gemmes som tokens ("jersey:polka"), ikke som emoji — de er
    // længere end fire tegn og må ikke ryge i emoji-længdetjekket. Ellers kan
    // man ikke gemme sin profil efter at have valgt en klassementstrøje.
    if (e && !isJerseyToken(e) && [...e].length > 4) throw new Error('Vælg en enkelt emoji.');
    if (isJerseyToken(e) && !JERSEY_BY_TOKEN[e]) throw new Error('Ukendt trøje.');
    patch.avatarEmoji = e || null;
  }
  if ('favoriteTeam' in fields) {
    const t = fields.favoriteTeam;
    // Kun Tour-appen har en fast holdliste på den globale profil. På platformen
    // er holdet spil-specifikt (games/{id}/players/{uid}.favoriteTeam), og
    // migrerede profiler kan have et hold fra et HELT andet spil liggende —
    // det må ikke spærre for at gemme navn, avatar eller mail-præferencer.
    if (!PLATFORM_MODE && t && !TOUR_TEAMS.includes(t)) throw new Error('Ukendt hold.');
    patch.favoriteTeam = t || null;
  }
  if ('emailOptOut' in fields) {
    patch.emailOptOut = !!fields.emailOptOut;
  }

  if (Object.keys(patch).length === 0) return;
  await updateDoc(doc(db, COL.USERS, uid), patch);
}
