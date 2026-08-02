// Hook der samler auth-handlinger (opret bruger, log ind, glemt adgangskode).
// Holder forretningslogik adskilt fra UI-komponenter.
import { useState } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../firebase';
import { COL } from '../../lib/constants';
import { getAuthErrorMessage } from './firebaseErrors';

/**
 * Returnerer handlinger og loading/error-tilstand for auth-flows.
 */
export function useAuthActions() {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  function clearError() {
    setError('');
  }

  /**
   * Opretter ny bruger og dennes users/{uid}-dokument med default
   * role:'player' og status:'pending'. Security Rules forhindrer, at en bruger
   * selv kan vælge en højere rolle/status. Owner sættes manuelt én gang.
   */
  async function signup(email, password, displayName) {
    setLoading(true);
    setError('');
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      // Sæt displayName på Auth-profilen
      await updateProfile(cred.user, { displayName: displayName.trim() });

      // Opret den OFFENTLIGE profil. role/status sættes til de eneste værdier
      // reglerne tillader ved selv-oprettelse (player / pending). Ingen e-mail
      // her (den er privat, se nedenfor) og INGEN point-felter — dem seeder
      // serveren; reglerne afviser en profil, der selv sætter dem.
      const userRef = doc(db, COL.USERS, cred.user.uid);
      await setDoc(userRef, {
        displayName: displayName.trim(),
        role: 'player',
        status: 'pending',
        createdAt: serverTimestamp(),
      });

      // Gem e-mailen PRIVAT i userContacts/{uid}. Kun brugeren selv og en admin
      // kan læse den (jf. reglerne), så andre spillere ikke kan udtrække alle
      // deltageres e-mailadresser.
      await setDoc(doc(db, COL.USER_CONTACTS, cred.user.uid), {
        uid: cred.user.uid,
        email: email.toLowerCase(),
      });

      return cred.user;
    } catch (err) {
      setError(getAuthErrorMessage(err));
      return null;
    } finally {
      setLoading(false);
    }
  }

  /**
   * Logger en eksisterende bruger ind.
   * @returns {import('firebase/auth').UserCredential | null}
   */
  async function login(email, password) {
    setLoading(true);
    setError('');
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      return cred;
    } catch (err) {
      setError(getAuthErrorMessage(err));
      return null;
    } finally {
      setLoading(false);
    }
  }

  /**
   * Sender e-mail til nulstilling af adgangskode.
   */
  async function resetPassword(email) {
    setLoading(true);
    setError('');
    try {
      await sendPasswordResetEmail(auth, email);
      return true;
    } catch (err) {
      setError(getAuthErrorMessage(err));
      return false;
    } finally {
      setLoading(false);
    }
  }

  /**
   * Logger ind med Google via popup. Første gang en bruger logger ind,
   * oprettes den OFFENTLIGE profil (users/{uid}) og den PRIVATE kontaktinfo
   * (userContacts/{uid}) præcis som ved signup — role:'player', status:'pending',
   * INGEN e-mail/point i den offentlige profil. En returnerende bruger får IKKE
   * sin profil overskrevet.
   * @returns {import('firebase/auth').User | null}
   */
  async function signInWithGoogle() {
    setLoading(true);
    setError('');
    try {
      const cred = await signInWithPopup(auth, new GoogleAuthProvider());

      // Kun ved allerførste login oprettes profilen. Findes den allerede,
      // rører vi den ikke (returnerende bruger).
      const userRef = doc(db, COL.USERS, cred.user.uid);
      const snap = await getDoc(userRef);
      if (!snap.exists()) {
        await setDoc(userRef, {
          displayName: cred.user.displayName || 'Spiller',
          role: 'player',
          status: 'pending',
          createdAt: serverTimestamp(),
        });

        await setDoc(doc(db, COL.USER_CONTACTS, cred.user.uid), {
          uid: cred.user.uid,
          email: (cred.user.email || '').toLowerCase(),
        });
      }

      return cred.user;
    } catch (err) {
      // Brugeren lukkede/afbrød selv popup'en — ikke en rigtig fejl.
      if (
        err?.code === 'auth/popup-closed-by-user' ||
        err?.code === 'auth/cancelled-popup-request'
      ) {
        setError('');
        return null;
      }
      setError(getAuthErrorMessage(err));
      return null;
    } finally {
      setLoading(false);
    }
  }

  return { loading, error, clearError, signup, login, resetPassword, signInWithGoogle };
}
