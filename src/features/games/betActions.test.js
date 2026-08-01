/**
 * Tests for betActions.js — især leagueIds på tippet, som afgør hvem der kan
 * se det efter kickoff. Firebase er fuldt mocket.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setBet, betId } from './betActions';

const mockSetDoc = vi.fn();
const mockDoc = vi.fn((db, ...path) => ({ _path: path }));

vi.mock('firebase/firestore', () => ({
  doc: (...a) => mockDoc(...a),
  setDoc: (...a) => mockSetDoc(...a),
  serverTimestamp: () => ({ _serverTimestamp: true }),
}));

vi.mock('../../firebase', () => ({ db: {} }));

beforeEach(() => {
  vi.clearAllMocks();
  mockSetDoc.mockResolvedValue(undefined);
});

/** Payload'en fra det seneste setDoc-kald. */
const payload = () => mockSetDoc.mock.calls[0][1];

describe('betId', () => {
  it('binder tippet til uid_matchId — ét tip pr. kamp', () => {
    expect(betId('u1', 'm1')).toBe('u1_m1');
  });
});

describe('setBet', () => {
  const base = { uid: 'u1', gameId: 'sl', matchId: 'm1', pick: '1' };

  it('kræver login, spil-id og et gyldigt udfald', async () => {
    expect((await setBet({ ...base, uid: '' })).ok).toBe(false);
    expect((await setBet({ ...base, gameId: '' })).ok).toBe(false);
    expect((await setBet({ ...base, pick: 'J' })).ok).toBe(false);
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it('skriver tippet på games/{gameId}/bets/{uid_matchId}', async () => {
    const res = await setBet(base);
    expect(res).toEqual({ ok: true });
    expect(mockDoc).toHaveBeenCalledWith({}, 'games', 'sl', 'bets', 'u1_m1');
    expect(mockSetDoc.mock.calls[0][2]).toEqual({ merge: true });
  });

  it('sætter ALDRIG points — det felt ejes af serveren', async () => {
    await setBet(base);
    expect('points' in payload()).toBe(false);
  });

  // leagueIds er dét, reglen bruger til at afgøre, hvem der må se tippet efter
  // kickoff. Uden feltet er tippet kun synligt for én selv.
  it('skriver mine ligaer med på tippet', async () => {
    await setBet({ ...base, leagueIds: ['L1', 'L2'] });
    expect(payload().leagueIds).toEqual(['L1', 'L2']);
  });

  it('bruger tom liste, når man ikke er i nogen liga', async () => {
    await setBet(base);
    expect(payload().leagueIds).toEqual([]);
  });

  it('renser dubletter og tomme værdier ud af ligaerne', async () => {
    await setBet({ ...base, leagueIds: ['L1', 'L1', '', null, 'L2'] });
    expect(payload().leagueIds).toEqual(['L1', 'L2']);
  });

  it('tolererer at leagueIds slet ikke er en liste', async () => {
    await setBet({ ...base, leagueIds: 'L1' });
    expect(payload().leagueIds).toEqual([]);
  });

  it('afviser en Chancen-indsats, saldoen ikke bærer', async () => {
    const res = await setBet({ ...base, chanceStake: 500, bank: 10 });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/indsats/i);
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it('giver en dansk fejl, når skrivningen afvises', async () => {
    mockSetDoc.mockRejectedValueOnce(Object.assign(new Error('nej'), { code: 'permission-denied' }));
    const res = await setBet(base);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/deadline|adgang/i);
  });
});
