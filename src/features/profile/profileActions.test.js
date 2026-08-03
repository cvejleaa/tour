import { describe, it, expect, vi, beforeEach } from 'vitest';

const updateDocMock = vi.fn(async () => {});
const setDocMock = vi.fn(async () => {});
const verifyBeforeUpdateEmailMock = vi.fn(async () => {});
const reauthCredMock = vi.fn(async () => {});
const reauthPopupMock = vi.fn(async () => {});
const linkWithPopupMock = vi.fn(async () => ({ user: { email: 'ny@gmail.com' } }));
const authUpdateProfileMock = vi.fn(async () => {});

// Mutabel auth-stub: testene sætter authState.currentUser.
const authState = { currentUser: null };

vi.mock('../../firebase', () => ({ db: {}, get auth() { return authState; } }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, col, id) => ({ col, id })),
  updateDoc: (...a) => updateDocMock(...a),
  setDoc: (...a) => setDocMock(...a),
}));
vi.mock('firebase/auth', () => ({
  updateProfile: (...a) => authUpdateProfileMock(...a),
  verifyBeforeUpdateEmail: (...a) => verifyBeforeUpdateEmailMock(...a),
  EmailAuthProvider: { credential: (email, pw) => ({ email, pw }) },
  reauthenticateWithCredential: (...a) => reauthCredMock(...a),
  reauthenticateWithPopup: (...a) => reauthPopupMock(...a),
  GoogleAuthProvider: class {},
  linkWithPopup: (...a) => linkWithPopupMock(...a),
}));
vi.mock('../auth/firebaseErrors', () => ({ getAuthErrorMessage: (e) => e?.message || 'auth-fejl' }));
vi.mock('../../data/tourTeams2026', () => ({ TOUR_TEAMS: ['Cofidis', 'Movistar Team'] }));
vi.mock('../../lib/platform', () => ({ get PLATFORM_MODE() { return platformState.on; } }));
const platformState = { on: false };

import {
  updateProfile, updateDisplayName, updateContactEmail, changeLoginEmail,
  linkGoogleLogin, hasProvider,
} from './profileActions';

beforeEach(() => {
  updateDocMock.mockClear(); setDocMock.mockClear();
  verifyBeforeUpdateEmailMock.mockClear(); reauthCredMock.mockClear();
  reauthPopupMock.mockClear(); linkWithPopupMock.mockClear(); authUpdateProfileMock.mockClear();
  authState.currentUser = null;
});

describe('updateProfile', () => {
  it('kræver login', async () => {
    await expect(updateProfile(null, { avatarEmoji: '😀' })).rejects.toThrow(/logget ind/);
  });
  it('afviser ukendt hold i Tour-appen', async () => {
    await expect(updateProfile('u1', { favoriteTeam: 'XXX' })).rejects.toThrow(/Ukendt hold/);
  });
  it('spærrer IKKE på platformen, hvor holdet hører til det enkelte spil', async () => {
    // Migrerede profiler kan have et hold fra et andet spil (fx VM-landshold)
    // liggende i den globale profil. Det må ikke blokere for at gemme navn,
    // avatar eller mail-præferencer.
    platformState.on = true;
    try {
      await updateProfile('u1', { avatarEmoji: '🦁', favoriteTeam: 'Danmark' });
      expect(updateDocMock.mock.calls[0][1]).toEqual({ avatarEmoji: '🦁', favoriteTeam: 'Danmark' });
    } finally {
      platformState.on = false;
    }
  });
  it('afviser for lang emoji', async () => {
    await expect(updateProfile('u1', { avatarEmoji: 'aaaaa' })).rejects.toThrow(/enkelt emoji/);
  });
  it('accepterer en trøje-avatar (token, ikke emoji)', async () => {
    // "jersey:polka" er 12 tegn og røg tidligere i emoji-længdetjekket, så man
    // ikke kunne gemme profilen efter at have valgt en klassementstrøje.
    await updateProfile('u1', { avatarEmoji: 'jersey:polka' });
    expect(updateDocMock.mock.calls[0][1]).toEqual({ avatarEmoji: 'jersey:polka' });
  });
  it('afviser en ukendt trøje-token', async () => {
    await expect(updateProfile('u1', { avatarEmoji: 'jersey:findes-ikke' })).rejects.toThrow(/Ukendt trøje/);
  });
  it('gemmer gyldige felter', async () => {
    await updateProfile('u1', { avatarEmoji: '🦁', favoriteTeam: 'Cofidis', emailOptOut: true });
    expect(updateDocMock.mock.calls[0][1]).toEqual({ avatarEmoji: '🦁', favoriteTeam: 'Cofidis', emailOptOut: true });
  });
  it('konverterer tomt hold/emoji til null', async () => {
    await updateProfile('u1', { avatarEmoji: '', favoriteTeam: '' });
    expect(updateDocMock.mock.calls[0][1]).toEqual({ avatarEmoji: null, favoriteTeam: null });
  });
  it('skriver intet ved tomt felt-objekt', async () => {
    await updateProfile('u1', {});
    expect(updateDocMock).not.toHaveBeenCalled();
  });
});

describe('updateDisplayName', () => {
  it('kræver login', async () => {
    await expect(updateDisplayName(null, 'Bo')).rejects.toThrow(/logget ind/);
  });
  it('afviser tomt navn', async () => {
    await expect(updateDisplayName('u1', '   ')).rejects.toThrow(/tomt/);
  });
  it('afviser for langt navn', async () => {
    await expect(updateDisplayName('u1', 'x'.repeat(41))).rejects.toThrow(/40 tegn/);
  });
  it('trimmer og gemmer navnet', async () => {
    const out = await updateDisplayName('u1', '  Bo Bendtsen  ');
    expect(out).toBe('Bo Bendtsen');
    expect(updateDocMock.mock.calls[0][1]).toEqual({ displayName: 'Bo Bendtsen' });
  });
  it('synkroniserer Auth-profilen når det er egen konto', async () => {
    authState.currentUser = { uid: 'u1' };
    await updateDisplayName('u1', 'Bo');
    expect(authUpdateProfileMock).toHaveBeenCalledWith({ uid: 'u1' }, { displayName: 'Bo' });
  });
});

describe('updateContactEmail', () => {
  it('kræver login', async () => {
    await expect(updateContactEmail(null, 'a@b.dk')).rejects.toThrow(/logget ind/);
  });
  it('afviser ugyldig e-mail', async () => {
    await expect(updateContactEmail('u1', 'ikke-en-mail')).rejects.toThrow(/gyldig/);
  });
  it('gemmer normaliseret (lowercase) e-mail i userContacts', async () => {
    const out = await updateContactEmail('u1', ' Ny@Mail.DK ');
    expect(out).toBe('ny@mail.dk');
    const [ref, data, opts] = setDocMock.mock.calls[0];
    expect(ref).toEqual({ col: 'userContacts', id: 'u1' });
    expect(data).toEqual({ uid: 'u1', email: 'ny@mail.dk' });
    expect(opts).toEqual({ merge: true });
  });
});

describe('changeLoginEmail', () => {
  it('kræver login', async () => {
    await expect(changeLoginEmail({ uid: 'u1', newEmail: 'a@b.dk' })).rejects.toThrow(/logget ind/);
  });
  it('afviser ugyldig e-mail', async () => {
    authState.currentUser = { email: 'g@mail.dk', providerData: [{ providerId: 'password' }] };
    await expect(changeLoginEmail({ uid: 'u1', newEmail: 'xxx', currentPassword: 'p' })).rejects.toThrow(/gyldig/);
  });
  it('afviser samme e-mail som nuværende', async () => {
    authState.currentUser = { email: 'same@mail.dk', providerData: [{ providerId: 'password' }] };
    await expect(changeLoginEmail({ uid: 'u1', newEmail: 'SAME@mail.dk', currentPassword: 'p' })).rejects.toThrow(/samme/);
  });
  it('kræver adgangskode for e-mail-konti', async () => {
    authState.currentUser = { email: 'g@mail.dk', providerData: [{ providerId: 'password' }] };
    await expect(changeLoginEmail({ uid: 'u1', newEmail: 'ny@mail.dk' })).rejects.toThrow(/adgangskode/);
  });
  it('re-autentificerer, sender bekræftelse og opdaterer kontakt-mail (password)', async () => {
    authState.currentUser = { email: 'g@mail.dk', providerData: [{ providerId: 'password' }] };
    const out = await changeLoginEmail({ uid: 'u1', newEmail: 'Ny@Mail.dk', currentPassword: 'hemmelig' });
    expect(out).toBe('ny@mail.dk');
    expect(reauthCredMock).toHaveBeenCalled();
    expect(verifyBeforeUpdateEmailMock).toHaveBeenCalledWith(authState.currentUser, 'ny@mail.dk');
    expect(setDocMock.mock.calls[0][1]).toEqual({ uid: 'u1', email: 'ny@mail.dk' });
  });
  it('bruger popup-reauth for Google-konti', async () => {
    authState.currentUser = { email: 'g@mail.dk', providerData: [{ providerId: 'google.com' }] };
    await changeLoginEmail({ uid: 'u1', newEmail: 'ny@mail.dk' });
    expect(reauthPopupMock).toHaveBeenCalled();
    expect(verifyBeforeUpdateEmailMock).toHaveBeenCalled();
  });
});

describe('linkGoogleLogin', () => {
  it('kræver login', async () => {
    await expect(linkGoogleLogin()).rejects.toThrow(/logget ind/);
  });
  it('afviser hvis allerede koblet til Google', async () => {
    authState.currentUser = { providerData: [{ providerId: 'google.com' }] };
    await expect(linkGoogleLogin()).rejects.toThrow(/allerede/);
  });
  it('kobler Google på og returnerer e-mailen', async () => {
    authState.currentUser = { providerData: [{ providerId: 'password' }] };
    const out = await linkGoogleLogin();
    expect(linkWithPopupMock).toHaveBeenCalled();
    expect(out).toEqual({ email: 'ny@gmail.com' });
  });
  it('giver en pæn besked hvis Google-kontoen allerede er i brug', async () => {
    authState.currentUser = { providerData: [{ providerId: 'password' }] };
    linkWithPopupMock.mockRejectedValueOnce({ code: 'auth/credential-already-in-use' });
    await expect(linkGoogleLogin()).rejects.toThrow(/allerede en separat konto/);
  });
});

describe('hasProvider', () => {
  it('finder en tilstedeværende provider', () => {
    expect(hasProvider({ providerData: [{ providerId: 'google.com' }] }, 'google.com')).toBe(true);
  });
  it('returnerer false uden providerData', () => {
    expect(hasProvider(null, 'password')).toBe(false);
    expect(hasProvider({}, 'password')).toBe(false);
  });
});
