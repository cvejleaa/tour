// Udtømmende tests for fejloversættelsesfunktioner — kræver ingen Firebase-forbindelse.
import { describe, it, expect } from 'vitest';
import { translateFirebaseError, getAuthErrorMessage } from './firebaseErrors';

describe('translateFirebaseError — alle kendte koder', () => {
  it('oversætter auth/invalid-credential til dansk besked om adgangskode', () => {
    expect(translateFirebaseError('auth/invalid-credential')).toContain('adgangskode');
  });

  it('oversætter auth/user-not-found til dansk besked om bruger', () => {
    expect(translateFirebaseError('auth/user-not-found')).toContain('bruger');
  });

  it('oversætter auth/wrong-password til dansk besked om adgangskode', () => {
    expect(translateFirebaseError('auth/wrong-password')).toContain('adgangskode');
  });

  it('oversætter auth/email-already-in-use til dansk besked om e-mail i brug', () => {
    const msg = translateFirebaseError('auth/email-already-in-use');
    expect(msg).toContain('brug');
  });

  it('oversætter auth/weak-password til dansk besked om svag adgangskode', () => {
    const msg = translateFirebaseError('auth/weak-password');
    expect(msg).toContain('svag');
  });

  it('oversætter auth/invalid-email til dansk besked om ugyldig e-mail', () => {
    const msg = translateFirebaseError('auth/invalid-email');
    expect(msg).toContain('gyldig');
  });

  it('oversætter auth/user-disabled til dansk besked om deaktiveret konto', () => {
    const msg = translateFirebaseError('auth/user-disabled');
    expect(msg).toContain('deaktiveret');
  });

  it('oversætter auth/too-many-requests til dansk besked om for mange forsøg', () => {
    const msg = translateFirebaseError('auth/too-many-requests');
    expect(msg).toContain('forsøg');
  });

  it('oversætter auth/network-request-failed til dansk netværksfejlbesked', () => {
    const msg = translateFirebaseError('auth/network-request-failed');
    expect(msg).toContain('etværk');
  });

  it('oversætter auth/popup-closed-by-user til dansk besked om lukket vindue', () => {
    const msg = translateFirebaseError('auth/popup-closed-by-user');
    expect(msg).toContain('lukket');
  });

  it('oversætter auth/requires-recent-login til dansk besked', () => {
    const msg = translateFirebaseError('auth/requires-recent-login');
    expect(msg).toContain('Log ind');
  });

  it('oversætter auth/operation-not-allowed til dansk besked', () => {
    const msg = translateFirebaseError('auth/operation-not-allowed');
    expect(msg).toContain('aktiveret');
  });

  it('oversætter auth/missing-password til dansk besked om manglende adgangskode', () => {
    const msg = translateFirebaseError('auth/missing-password');
    expect(msg).toContain('adgangskode');
  });

  it('oversætter auth/missing-email til dansk besked om manglende e-mail', () => {
    const msg = translateFirebaseError('auth/missing-email');
    expect(msg).toContain('e-mail');
  });

  it('returnerer fallback-besked for ukendt fejlkode', () => {
    const msg = translateFirebaseError('auth/some-totally-unknown-error');
    expect(msg).toContain('ukendt');
  });

  it('returnerer fallback for tom streng', () => {
    const msg = translateFirebaseError('');
    expect(msg).toBeTruthy();
    expect(msg.length).toBeGreaterThan(5);
  });

  it('returnerer fallback for undefined', () => {
    const msg = translateFirebaseError(undefined);
    expect(msg).toBeTruthy();
  });

  it('returnerer string for alle oversatte koder', () => {
    const koder = [
      'auth/invalid-credential',
      'auth/user-not-found',
      'auth/wrong-password',
      'auth/email-already-in-use',
      'auth/weak-password',
      'auth/invalid-email',
      'auth/user-disabled',
      'auth/too-many-requests',
      'auth/network-request-failed',
      'auth/popup-closed-by-user',
      'auth/requires-recent-login',
      'auth/operation-not-allowed',
      'auth/missing-password',
      'auth/missing-email',
    ];
    koder.forEach((kode) => {
      const msg = translateFirebaseError(kode);
      expect(typeof msg).toBe('string');
      expect(msg.length).toBeGreaterThan(0);
    });
  });
});

describe('getAuthErrorMessage — udtrækker og oversætter fejlkode', () => {
  it('oversætter korrekt fra error-objekt med code', () => {
    const err = { code: 'auth/invalid-credential' };
    expect(getAuthErrorMessage(err)).toContain('adgangskode');
  });

  it('oversætter auth/email-already-in-use fra error-objekt', () => {
    const err = { code: 'auth/email-already-in-use' };
    expect(getAuthErrorMessage(err)).toContain('brug');
  });

  it('oversætter auth/weak-password fra error-objekt', () => {
    const err = { code: 'auth/weak-password' };
    expect(getAuthErrorMessage(err)).toContain('svag');
  });

  it('returnerer fallback for error-objekt uden code', () => {
    const msg = getAuthErrorMessage({});
    expect(msg).toBeTruthy();
  });

  it('returnerer fallback for null', () => {
    const msg = getAuthErrorMessage(null);
    expect(msg).toBeTruthy();
  });

  it('returnerer fallback for undefined', () => {
    const msg = getAuthErrorMessage(undefined);
    expect(msg).toBeTruthy();
  });

  it('returnerer fallback for string (ikke objekt)', () => {
    const msg = getAuthErrorMessage('noget gik galt');
    expect(msg).toBeTruthy();
  });

  it('returnerer fallback for error-objekt med ukendt kode', () => {
    const msg = getAuthErrorMessage({ code: 'auth/xyz-unknown' });
    expect(msg).toContain('ukendt');
  });
});
