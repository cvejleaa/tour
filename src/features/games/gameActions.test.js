/**
 * Tests for gameActions.js – fuldstændig mock af Firebase.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  joinGame, leaveGame, setGameSchedule, setGameStatus, setPlayerFavoriteTeam,
} from './gameActions';

// ── Mock firebase/firestore ───────────────────────────────────────────────────
const mockSetDoc = vi.fn();
const mockDeleteDoc = vi.fn();
const mockDoc = vi.fn((db, ...path) => ({ _path: path }));
const mockServerTimestamp = vi.fn(() => ({ _serverTimestamp: true }));

beforeEach(() => {
  vi.clearAllMocks();
  mockSetDoc.mockResolvedValue(undefined);
  mockDeleteDoc.mockResolvedValue(undefined);
  mockServerTimestamp.mockReturnValue({ _serverTimestamp: true });
});

vi.mock('firebase/firestore', () => ({
  doc: (...args) => mockDoc(...args),
  setDoc: (...args) => mockSetDoc(...args),
  deleteDoc: (...args) => mockDeleteDoc(...args),
  serverTimestamp: () => mockServerTimestamp(),
  deleteField: () => ({ _deleteField: true }),
  Timestamp: { fromMillis: (ms) => ({ _ts: ms }) },
}));

vi.mock('../../firebase', () => ({ db: {} }));

// ─────────────────────────────────────────────────────────────────────────────

describe('joinGame', () => {
  it('returnerer fejl uden uid', async () => {
    const res = await joinGame('', 'spil-1');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/logget ind/i);
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it('returnerer fejl uden gameId', async () => {
    const res = await joinGame('uid-1', '');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/spil-id/i);
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it('kalder setDoc på games/{gameId}/players/{uid}', async () => {
    await joinGame('uid-1', 'spil-1');
    expect(mockDoc).toHaveBeenCalledWith({}, 'games', 'spil-1', 'players', 'uid-1');
    expect(mockSetDoc).toHaveBeenCalled();
  });

  it('skriver kun uid og joinedAt (ingen point-felter)', async () => {
    await joinGame('uid-1', 'spil-1');
    const [, payload] = mockSetDoc.mock.calls[0];
    expect(payload).toEqual({ uid: 'uid-1', joinedAt: { _serverTimestamp: true } });
  });

  it('returnerer {ok:true} ved succes', async () => {
    const res = await joinGame('uid-1', 'spil-1');
    expect(res).toEqual({ ok: true });
  });

  it('returnerer dansk fejl ved permission-denied', async () => {
    mockSetDoc.mockRejectedValueOnce(Object.assign(new Error('denied'), { code: 'permission-denied' }));
    const res = await joinGame('uid-1', 'spil-1');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/adgang/i);
  });

  it('returnerer fallback-fejl ved ukendt fejl uden besked', async () => {
    mockSetDoc.mockRejectedValueOnce({});
    const res = await joinGame('uid-1', 'spil-1');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/kunne ikke deltage/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('leaveGame', () => {
  it('returnerer fejl uden uid', async () => {
    const res = await leaveGame('', 'spil-1');
    expect(res.ok).toBe(false);
    expect(mockDeleteDoc).not.toHaveBeenCalled();
  });

  it('returnerer fejl uden gameId', async () => {
    const res = await leaveGame('uid-1', '');
    expect(res.ok).toBe(false);
    expect(mockDeleteDoc).not.toHaveBeenCalled();
  });

  it('kalder deleteDoc på games/{gameId}/players/{uid}', async () => {
    await leaveGame('uid-1', 'spil-1');
    expect(mockDoc).toHaveBeenCalledWith({}, 'games', 'spil-1', 'players', 'uid-1');
    expect(mockDeleteDoc).toHaveBeenCalled();
  });

  it('returnerer {ok:true} ved succes', async () => {
    const res = await leaveGame('uid-1', 'spil-1');
    expect(res).toEqual({ ok: true });
  });

  it('returnerer dansk fejl når sletning afvises (har point)', async () => {
    mockDeleteDoc.mockRejectedValueOnce(Object.assign(new Error('denied'), { code: 'permission-denied' }));
    const res = await leaveGame('uid-1', 'spil-1');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/adgang/i);
  });
});

describe('setGameSchedule', () => {
  it('returnerer fejl uden gameId', async () => {
    const res = await setGameSchedule('', { startAt: Date.now() });
    expect(res.ok).toBe(false);
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it('skriver Timestamp for satte felter (merge) på games/{gameId}', async () => {
    const res = await setGameSchedule('superliga2627', { startAt: 1000, puljeLockAt: 2000 });
    expect(res).toEqual({ ok: true });
    expect(mockDoc).toHaveBeenCalledWith({}, 'games', 'superliga2627');
    const [, patch, opts] = mockSetDoc.mock.calls[0];
    expect(patch.startAt).toEqual({ _ts: 1000 });
    expect(patch.puljeLockAt).toEqual({ _ts: 2000 });
    expect(opts).toEqual({ merge: true });
  });

  it('rydder feltet med deleteField() når værdien er null/tom', async () => {
    await setGameSchedule('superliga2627', { puljeLockAt: null });
    const [, patch] = mockSetDoc.mock.calls[0];
    expect(patch.puljeLockAt).toEqual({ _deleteField: true });
    // startAt ikke nævnt → urørt.
    expect('startAt' in patch).toBe(false);
  });

  it('lader udeladte felter være urørt (undefined)', async () => {
    await setGameSchedule('superliga2627', { startAt: 500 });
    const [, patch] = mockSetDoc.mock.calls[0];
    expect(patch.startAt).toEqual({ _ts: 500 });
    expect('puljeLockAt' in patch).toBe(false);
  });
});

describe('setGameStatus', () => {
  it('returnerer fejl uden gameId', async () => {
    const res = await setGameStatus('', 'finished');
    expect(res.ok).toBe(false);
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it('afviser en ukendt status uden at skrive', async () => {
    const res = await setGameStatus('tour2026', 'afsluttet'); // dansk ≠ feltværdi
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/ukendt status/i);
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it('afviser tom status', async () => {
    expect((await setGameStatus('tour2026', '')).ok).toBe(false);
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it('skriver status på games/{gameId} (merge) og rører intet andet', async () => {
    const res = await setGameStatus('tour2026', 'finished');
    expect(res).toEqual({ ok: true });
    expect(mockDoc).toHaveBeenCalledWith({}, 'games', 'tour2026');
    const [, patch, opts] = mockSetDoc.mock.calls[0];
    expect(patch.status).toBe('finished');
    expect(Object.keys(patch).sort()).toEqual(['status', 'updatedAt']);
    expect(opts).toEqual({ merge: true });
  });

  it('accepterer alle tre livscyklus-værdier', async () => {
    for (const s of ['open', 'live', 'finished']) {
      expect((await setGameStatus('g', s)).ok).toBe(true);
    }
  });

  it('returnerer dansk fejl når skrivningen afvises', async () => {
    mockSetDoc.mockRejectedValueOnce(Object.assign(new Error('denied'), { code: 'permission-denied' }));
    const res = await setGameStatus('tour2026', 'finished');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/adgang/i);
  });
});

describe('setPlayerFavoriteTeam', () => {
  it('kræver uid og gameId', async () => {
    expect((await setPlayerFavoriteTeam('', 'g')).ok).toBe(false);
    expect((await setPlayerFavoriteTeam('u', '')).ok).toBe(false);
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it('skriver favoriteTeam på games/{gameId}/players/{uid} (merge)', async () => {
    const res = await setPlayerFavoriteTeam('uid-1', 'superliga2627', 'FC København');
    expect(res).toEqual({ ok: true });
    expect(mockDoc).toHaveBeenCalledWith({}, 'games', 'superliga2627', 'players', 'uid-1');
    const [, data, opts] = mockSetDoc.mock.calls[0];
    expect(data.favoriteTeam).toBe('FC København');
    expect(opts).toEqual({ merge: true });
  });

  it('rydder holdet når værdien er tom', async () => {
    await setPlayerFavoriteTeam('uid-1', 'superliga2627', '');
    const [, data] = mockSetDoc.mock.calls[0];
    expect(data.favoriteTeam).toBeNull();
  });
});
