/**
 * Tests for gameActions.js – fuldstændig mock af Firebase.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { joinGame, leaveGame } from './gameActions';

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
