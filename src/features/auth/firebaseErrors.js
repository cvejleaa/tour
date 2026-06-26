// Oversætter Firebase auth-fejlkoder til danske brugervenlige beskeder.
// Eksporteres som ren funktion så den nemt kan testes.

/**
 * @param {string} code - Firebase fejlkode, fx "auth/invalid-credential"
 * @returns {string} Dansk fejlbesked
 */
export function translateFirebaseError(code) {
  const errors = {
    'auth/invalid-credential':       'Forkert e-mail eller adgangskode.',
    'auth/user-not-found':           'Der findes ingen bruger med den e-mail.',
    'auth/wrong-password':           'Forkert adgangskode.',
    'auth/email-already-in-use':     'E-mailen er allerede i brug. Prøv at logge ind i stedet.',
    'auth/weak-password':            'Adgangskoden er for svag – vælg mindst 6 tegn.',
    'auth/invalid-email':            'E-mailadressen er ikke gyldig.',
    'auth/user-disabled':            'Denne konto er deaktiveret. Kontakt administrator.',
    'auth/too-many-requests':        'For mange forsøg. Prøv igen om lidt.',
    'auth/network-request-failed':   'Netværksfejl – tjek din internetforbindelse.',
    'auth/popup-closed-by-user':     'Login-vinduet blev lukket. Prøv igen.',
    'auth/requires-recent-login':    'Log ind igen for at udføre denne handling.',
    'auth/operation-not-allowed':    'Denne login-metode er ikke aktiveret.',
    'auth/missing-password':         'Angiv venligst en adgangskode.',
    'auth/missing-email':            'Angiv venligst en e-mailadresse.',
  };

  return errors[code] ?? 'Der opstod en ukendt fejl. Prøv igen.';
}

/**
 * Udtrækker fejlkoden fra et Firebase-fejlobjekt og oversætter den.
 * @param {unknown} err - Fejl-objekt fra Firebase
 * @returns {string} Dansk fejlbesked
 */
export function getAuthErrorMessage(err) {
  const code = err?.code ?? '';
  return translateFirebaseError(code);
}
