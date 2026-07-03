// Udtømmende tests for useAuthActions-hook.
// Firebase-funktioner mockes fuldstændigt — ingen netværkskald.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ─── Mock Firebase ────────────────────────────────────────────────────────────
vi.mock('../../firebase', () => ({
  auth: { currentUser: null },
  db: {},
}));

const mockCreateUser = vi.fn();
const mockSignIn = vi.fn();
const mockUpdateProfile = vi.fn();
const mockSendReset = vi.fn();

vi.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: (...args) => mockCreateUser(...args),
  signInWithEmailAndPassword: (...args) => mockSignIn(...args),
  updateProfile: (...args) => mockUpdateProfile(...args),
  sendPasswordResetEmail: (...args) => mockSendReset(...args),
}));

const mockDoc = vi.fn();
const mockSetDoc = vi.fn();
const mockServerTimestamp = vi.fn(() => ({ _serverTimestamp: true }));

vi.mock('firebase/firestore', () => ({
  doc: (...args) => mockDoc(...args),
  setDoc: (...args) => mockSetDoc(...args),
  serverTimestamp: () => mockServerTimestamp(),
}));

import { useAuthActions } from './useAuthActions';

describe('useAuthActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Kod collection+uid ind i ref'en, så vi kan skelne users- fra
    // userContacts-skrivningen i signup.
    mockDoc.mockImplementation((_db, col, uid) => ({ col, uid }));
    mockSetDoc.mockResolvedValue(undefined);
    mockUpdateProfile.mockResolvedValue(undefined);
  });

  /** Find det setDoc-kald der skrev til en given collection. */
  function setDocCallFor(col) {
    return mockSetDoc.mock.calls.find(([ref]) => ref?.col === col);
  }

  // ─── signup ──────────────────────────────────────────────────────────────

  describe('signup', () => {
    it('kalder createUserWithEmailAndPassword med korrekte argumenter', async () => {
      const fakeUser = { uid: 'new-uid' };
      mockCreateUser.mockResolvedValue({ user: fakeUser });

      const { result } = renderHook(() => useAuthActions());

      await act(async () => {
        await result.current.signup('test@test.dk', 'password123', 'Test Bruger');
      });

      const { auth } = await import('../../firebase');
      expect(mockCreateUser).toHaveBeenCalledWith(auth, 'test@test.dk', 'password123');
    });

    it('kalder updateProfile med trimmet displayName', async () => {
      const fakeUser = { uid: 'new-uid' };
      mockCreateUser.mockResolvedValue({ user: fakeUser });

      const { result } = renderHook(() => useAuthActions());

      await act(async () => {
        await result.current.signup('test@test.dk', 'password123', '  Test Bruger  ');
      });

      expect(mockUpdateProfile).toHaveBeenCalledWith(fakeUser, { displayName: 'Test Bruger' });
    });

    it('opretter den offentlige profil med role:player og status:pending UDEN e-mail/point', async () => {
      const fakeUser = { uid: 'new-uid' };
      mockCreateUser.mockResolvedValue({ user: fakeUser });

      const { result } = renderHook(() => useAuthActions());

      await act(async () => {
        await result.current.signup('test@test.dk', 'password123', 'Test Bruger');
      });

      const usersCall = setDocCallFor('users');
      expect(usersCall).toBeTruthy();
      expect(usersCall[1]).toMatchObject({
        displayName: 'Test Bruger',
        role: 'player',
        status: 'pending',
      });
      // Reglerne afviser en profil der selv sætter point-felter; e-mail er privat.
      expect(usersCall[1]).not.toHaveProperty('email');
      expect(usersCall[1]).not.toHaveProperty('totalPoints');
    });

    it('gemmer e-mailen PRIVAT i userContacts (lowercase)', async () => {
      const fakeUser = { uid: 'new-uid' };
      mockCreateUser.mockResolvedValue({ user: fakeUser });

      const { result } = renderHook(() => useAuthActions());

      await act(async () => {
        await result.current.signup('TEST@TEST.DK', 'password123', 'Test');
      });

      const contactCall = setDocCallFor('userContacts');
      expect(contactCall).toBeTruthy();
      expect(contactCall[1]).toEqual({ uid: 'new-uid', email: 'test@test.dk' });
    });

    it('returnerer user-objektet ved succes', async () => {
      const fakeUser = { uid: 'new-uid' };
      mockCreateUser.mockResolvedValue({ user: fakeUser });

      const { result } = renderHook(() => useAuthActions());

      let returnedUser;
      await act(async () => {
        returnedUser = await result.current.signup('test@test.dk', 'password123', 'Test');
      });

      expect(returnedUser).toBe(fakeUser);
    });

    it('returnerer null og sætter error ved Firebase-fejl', async () => {
      mockCreateUser.mockRejectedValue({ code: 'auth/email-already-in-use' });

      const { result } = renderHook(() => useAuthActions());

      let returnedUser;
      await act(async () => {
        returnedUser = await result.current.signup('used@test.dk', 'password123', 'Test');
      });

      expect(returnedUser).toBeNull();
      expect(result.current.error).toContain('brug');
    });

    it('sætter loading til true under signup og false efter', async () => {
      let resolveCreate;
      mockCreateUser.mockReturnValue(new Promise((res) => { resolveCreate = res; }));

      const { result } = renderHook(() => useAuthActions());

      act(() => {
        result.current.signup('test@test.dk', 'pass123', 'Test');
      });

      expect(result.current.loading).toBe(true);

      await act(async () => {
        resolveCreate({ user: { uid: 'x' } });
      });

      expect(result.current.loading).toBe(false);
    });

    it('inkluderer serverTimestamp i setDoc-kald', async () => {
      const fakeUser = { uid: 'new-uid' };
      mockCreateUser.mockResolvedValue({ user: fakeUser });

      const { result } = renderHook(() => useAuthActions());

      await act(async () => {
        await result.current.signup('test@test.dk', 'password123', 'Test');
      });

      expect(mockServerTimestamp).toHaveBeenCalled();
      expect(mockSetDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ createdAt: { _serverTimestamp: true } })
      );
    });
  });

  // ─── login ───────────────────────────────────────────────────────────────

  describe('login', () => {
    it('kalder signInWithEmailAndPassword med korrekte argumenter', async () => {
      const fakeCred = { user: { uid: 'abc' } };
      mockSignIn.mockResolvedValue(fakeCred);

      const { result } = renderHook(() => useAuthActions());

      await act(async () => {
        await result.current.login('user@test.dk', 'pass123');
      });

      const { auth } = await import('../../firebase');
      expect(mockSignIn).toHaveBeenCalledWith(auth, 'user@test.dk', 'pass123');
    });

    it('returnerer credential ved succes', async () => {
      const fakeCred = { user: { uid: 'abc' } };
      mockSignIn.mockResolvedValue(fakeCred);

      const { result } = renderHook(() => useAuthActions());

      let cred;
      await act(async () => {
        cred = await result.current.login('user@test.dk', 'pass123');
      });

      expect(cred).toBe(fakeCred);
    });

    it('returnerer null og sætter fejlbesked ved forkert adgangskode', async () => {
      mockSignIn.mockRejectedValue({ code: 'auth/invalid-credential' });

      const { result } = renderHook(() => useAuthActions());

      let cred;
      await act(async () => {
        cred = await result.current.login('user@test.dk', 'forkert');
      });

      expect(cred).toBeNull();
      expect(result.current.error).toContain('adgangskode');
    });

    it('returnerer null og sætter fejlbesked ved ikke-eksisterende bruger', async () => {
      mockSignIn.mockRejectedValue({ code: 'auth/user-not-found' });

      const { result } = renderHook(() => useAuthActions());

      let cred;
      await act(async () => {
        cred = await result.current.login('ingen@test.dk', 'pass');
      });

      expect(cred).toBeNull();
      expect(result.current.error).toContain('bruger');
    });

    it('sætter loading korrekt under og efter login', async () => {
      let resolveSignIn;
      mockSignIn.mockReturnValue(new Promise((res) => { resolveSignIn = res; }));

      const { result } = renderHook(() => useAuthActions());

      act(() => {
        result.current.login('user@test.dk', 'pass');
      });

      expect(result.current.loading).toBe(true);

      await act(async () => {
        resolveSignIn({ user: { uid: 'x' } });
      });

      expect(result.current.loading).toBe(false);
    });

    it('rydder forrige fejl inden nyt login-forsøg', async () => {
      mockSignIn.mockRejectedValueOnce({ code: 'auth/invalid-credential' });

      const { result } = renderHook(() => useAuthActions());

      await act(async () => {
        await result.current.login('a@b.dk', 'forkert');
      });
      expect(result.current.error).not.toBe('');

      mockSignIn.mockResolvedValue({ user: { uid: 'x' } });
      await act(async () => {
        await result.current.login('a@b.dk', 'rigtig');
      });

      expect(result.current.error).toBe('');
    });
  });

  // ─── resetPassword ────────────────────────────────────────────────────────

  describe('resetPassword', () => {
    it('kalder sendPasswordResetEmail med korrekt e-mail', async () => {
      mockSendReset.mockResolvedValue(undefined);

      const { result } = renderHook(() => useAuthActions());

      await act(async () => {
        await result.current.resetPassword('user@test.dk');
      });

      const { auth } = await import('../../firebase');
      expect(mockSendReset).toHaveBeenCalledWith(auth, 'user@test.dk');
    });

    it('returnerer true ved succes', async () => {
      mockSendReset.mockResolvedValue(undefined);

      const { result } = renderHook(() => useAuthActions());

      let ok;
      await act(async () => {
        ok = await result.current.resetPassword('user@test.dk');
      });

      expect(ok).toBe(true);
    });

    it('returnerer false og sætter fejlbesked ved fejl', async () => {
      mockSendReset.mockRejectedValue({ code: 'auth/user-not-found' });

      const { result } = renderHook(() => useAuthActions());

      let ok;
      await act(async () => {
        ok = await result.current.resetPassword('ingen@test.dk');
      });

      expect(ok).toBe(false);
      expect(result.current.error).toContain('bruger');
    });

    it('sætter loading korrekt under og efter reset', async () => {
      let resolveReset;
      mockSendReset.mockReturnValue(new Promise((res) => { resolveReset = res; }));

      const { result } = renderHook(() => useAuthActions());

      act(() => {
        result.current.resetPassword('user@test.dk');
      });

      expect(result.current.loading).toBe(true);

      await act(async () => {
        resolveReset(undefined);
      });

      expect(result.current.loading).toBe(false);
    });
  });

  // ─── clearError ──────────────────────────────────────────────────────────

  describe('clearError', () => {
    it('rydder en eksisterende fejlbesked', async () => {
      mockSignIn.mockRejectedValue({ code: 'auth/invalid-credential' });

      const { result } = renderHook(() => useAuthActions());

      await act(async () => {
        await result.current.login('a@b.dk', 'forkert');
      });

      expect(result.current.error).not.toBe('');

      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBe('');
    });
  });
});
