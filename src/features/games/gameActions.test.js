/**
 * Tests for gameActions.js – fuldstændig mock af Firebase.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  joinGame, leaveGame, setGameSchedule, setGameStatus, setGameJoinable,
  setPlayerFavoriteTeam,
  setTeamStyles,
} from './gameActions';

// ── Mock firebase/firestore ───────────────────────────────────────────────────
const mockSetDoc = vi.fn();
const mockUpdateDoc = vi.fn();
const mockDeleteDoc = vi.fn();
const mockDoc = vi.fn((db, ...path) => ({ _path: path }));
const mockServerTimestamp = vi.fn(() => ({ _serverTimestamp: true }));

beforeEach(() => {
  vi.clearAllMocks();
  mockSetDoc.mockResolvedValue(undefined);
  mockUpdateDoc.mockResolvedValue(undefined);
  mockDeleteDoc.mockResolvedValue(undefined);
  mockServerTimestamp.mockReturnValue({ _serverTimestamp: true });
});

vi.mock('firebase/firestore', () => ({
  doc: (...args) => mockDoc(...args),
  setDoc: (...args) => mockSetDoc(...args),
  updateDoc: (...args) => mockUpdateDoc(...args),
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

// ---------------------------------------------------------------------------
// STARTRUNDEN — DET FELT, DER GATER.
//
// Test Manager slettede HELE `if (startRound !== undefined)`-blokken i
// setGameSchedule med 2260 tests grønne: feltet ville aldrig nå Firestore.
// `GameScheduleTab.test.jsx` mocker netop denne funktion væk, så fanens tests
// beviser intet om, hvad der skrives. Det gør de her.
// ---------------------------------------------------------------------------
describe('setGameSchedule — startRound', () => {
  const patch = () => mockSetDoc.mock.calls[0][1];

  it('skriver runden som et TAL', async () => {
    const res = await setGameSchedule('sl', { startRound: 3 });
    expect(res.ok).toBe(true);
    expect(patch().startRound).toBe(3);
    expect(typeof patch().startRound).toBe('number');
  });

  it('tager imod en streng fra et input-felt og gemmer den som tal', async () => {
    await setGameSchedule('sl', { startRound: '3' });
    // BÆRENDE: '3' i basen ville blive sammenlignet med `m.round` (et tal) og
    // aldrig matche — gaten ville stille holde op med at virke.
    expect(patch().startRound).toBe(3);
  });

  it('rydder runden med null', async () => {
    await setGameSchedule('sl', { startRound: null });
    expect(patch().startRound).toBeNull();
    expect('startRound' in patch()).toBe(true);
  });

  it('behandler 0 som en gyldig runde — ikke som tomt', async () => {
    await setGameSchedule('sl', { startRound: 0 });
    expect(patch().startRound).toBe(0);
  });

  it('AFVISER et decimaltal og et negativt tal — uden at skrive', async () => {
    for (const ugyldig of [3.5, -1, 'tre']) {
      mockSetDoc.mockClear();
      const res = await setGameSchedule('sl', { startRound: ugyldig });
      expect(res.ok, String(ugyldig)).toBe(false);
      expect(res.error).toMatch(/helt tal/);
      expect(mockSetDoc, String(ugyldig)).not.toHaveBeenCalled();
    }
  });

  it('rører ikke feltet, når det ikke er sendt med', async () => {
    await setGameSchedule('sl', { startAt: 1000 });
    expect('startRound' in patch()).toBe(false);
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

describe('setGameJoinable', () => {
  it('returnerer fejl uden gameId', async () => {
    const res = await setGameJoinable('', false);
    expect(res.ok).toBe(false);
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it('skjuler spillet ved at skrive joinable: false (merge), og rører intet andet', async () => {
    const res = await setGameJoinable('pl2627-efteraar', false);
    expect(res).toEqual({ ok: true });
    expect(mockDoc).toHaveBeenCalledWith({}, 'games', 'pl2627-efteraar');
    const [, patch, opts] = mockSetDoc.mock.calls[0];
    expect(patch.joinable).toBe(false);
    // Status må IKKE følge med: et skjult spil er stadig "Åbent" — det er
    // netop forskellen på at skjule og at markere spillet afsluttet.
    expect(Object.keys(patch).sort()).toEqual(['joinable', 'updatedAt']);
    expect(opts).toEqual({ merge: true });
  });

  // Samme felt-assertion som i false-grenen, og den hører især til HER: det er
  // true-grenen, der kunne genåbne et afsluttet spil, hvis den også skrev
  // status. Med assertionen kun i false-testen overlevede netop den mutation.
  it('viser spillet ved at skrive joinable: true — og intet andet', async () => {
    expect((await setGameJoinable('pl2627-efteraar', true)).ok).toBe(true);
    const [, patch] = mockSetDoc.mock.calls[0];
    expect(patch.joinable).toBe(true);
    expect(Object.keys(patch).sort()).toEqual(['joinable', 'updatedAt']);
  });

  // 'false' er en SAND streng i JavaScript. Uden boolean-tjekket ville netop
  // det klik, der skulle skjule spillet, gøre det synligt.
  it('afviser ikke-booleans uden at skrive', async () => {
    for (const v of ['false', 'true', 0, 1, null, undefined]) {
      const res = await setGameJoinable('g', v);
      expect(res.ok, String(v)).toBe(false);
      expect(res.error).toMatch(/til eller fra/i);
    }
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it('returnerer dansk fejl når skrivningen afvises', async () => {
    mockSetDoc.mockRejectedValueOnce(Object.assign(new Error('denied'), { code: 'permission-denied' }));
    const res = await setGameJoinable('pl2627-efteraar', true);
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

// ---------------------------------------------------------------------------
// setTeamStyles — hold-farver og visningsnavne.
//
// Funktionen var HELT UTESTET. Den blev skrevet om fra `setDoc(..., { merge:
// true })` til `updateDoc` uden at ét eneste tegn blev rødt — mocken
// eksporterede ikke engang `updateDoc`, så et kald ville have kastet.
// ---------------------------------------------------------------------------
describe('setTeamStyles', () => {
  it('afviser uden spil-id', async () => {
    const res = await setTeamStyles('', {});
    expect(res.ok).toBe(false);
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });

  // BÆRENDE: feltet skal ERSTATTES, ikke flettes. `setDoc(..., { merge: true })`
  // dybde-fletter nested maps, så et hold, der udelades, beholdt sin gamle
  // værdi — og så kunne admin-fladens nulstil-knap ikke gemme en nulstilling.
  it('ERSTATTER teamStyles i stedet for at flette', async () => {
    const styles = { AGF: { color: '#123456' } };
    const res = await setTeamStyles('sl', styles);
    expect(res.ok).toBe(true);
    expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
    // Ingen merge-option — updateDoc tager kun to argumenter.
    expect(mockUpdateDoc.mock.calls[0]).toHaveLength(2);
    expect(mockUpdateDoc.mock.calls[0][1]).toMatchObject({ teamStyles: styles });
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  // Et TOMT map skal kunne gemmes — det er dét, "nulstil alt" betyder.
  // Med merge ville det have været en no-op.
  it('kan gemme et tomt map, så alle overrides fjernes', async () => {
    await setTeamStyles('sl', {});
    expect(mockUpdateDoc.mock.calls[0][1].teamStyles).toEqual({});
  });

  it('giver en dansk fejlbesked, når skrivningen afvises', async () => {
    mockUpdateDoc.mockRejectedValueOnce(new Error('permission-denied'));
    const res = await setTeamStyles('sl', {});
    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
  });
});
