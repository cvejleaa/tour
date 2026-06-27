/**
 * Tests for leagueBonusActions — validering af deadline og redigering.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAddDoc = vi.fn();
const mockUpdateDoc = vi.fn();

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  addDoc: (...a) => mockAddDoc(...a),
  setDoc: vi.fn(),
  updateDoc: (...a) => mockUpdateDoc(...a),
  deleteDoc: vi.fn(),
  serverTimestamp: vi.fn(() => ({ _ts: true })),
  arrayUnion: (v) => ({ _union: v }),
  arrayRemove: (v) => ({ _remove: v }),
}));
vi.mock('../../firebase', () => ({ db: {} }));

const {
  createLeagueBonus, updateLeagueBonus, copyLeagueBonusToLeagues,
} = await import('./leagueBonusActions');
const { LEAGUE_BONUS_TYPE } = await import('../../lib/constants');

const future = { toMillis: () => Date.now() + 3600_000 };
const past = { toMillis: () => Date.now() - 3600_000 };

describe('createLeagueBonus', () => {
  beforeEach(() => { mockAddDoc.mockReset(); mockAddDoc.mockResolvedValue({ id: 'q1' }); });

  it('afviser en deadline i fortiden', async () => {
    await expect(createLeagueBonus({
      leagueId: 'L', createdBy: 'u', type: LEAGUE_BONUS_TYPE.TEXT, label: 'x', deadline: past,
    })).rejects.toThrow(/fremtiden/);
  });

  it('opretter med en gyldig fremtidig deadline', async () => {
    const id = await createLeagueBonus({
      leagueId: 'L', createdBy: 'u', type: LEAGUE_BONUS_TYPE.TEXT, label: 'x', deadline: future,
    });
    expect(id).toBe('q1');
  });

  it('kræver mindst to svarmuligheder ved valg', async () => {
    await expect(createLeagueBonus({
      leagueId: 'L', createdBy: 'u', type: LEAGUE_BONUS_TYPE.CHOICE, label: 'x', deadline: future, options: ['kun en'],
    })).rejects.toThrow(/to svarmuligheder/);
  });
});

describe('updateLeagueBonus', () => {
  beforeEach(() => { mockUpdateDoc.mockReset(); mockUpdateDoc.mockResolvedValue(undefined); });

  it('afviser ny deadline i fortiden', async () => {
    await expect(updateLeagueBonus('q1', { deadline: past })).rejects.toThrow(/fremtiden/);
  });

  it('opdaterer label', async () => {
    await updateLeagueBonus('q1', { label: '  Nyt spørgsmål ' });
    const [, patch] = mockUpdateDoc.mock.calls[0];
    expect(patch.label).toBe('Nyt spørgsmål');
  });

  it('gør intet uden felter', async () => {
    await updateLeagueBonus('q1', {});
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });
});

describe('copyLeagueBonusToLeagues', () => {
  beforeEach(() => {
    mockAddDoc.mockReset(); mockAddDoc.mockResolvedValue({ id: 'new' });
    mockUpdateDoc.mockReset(); mockUpdateDoc.mockResolvedValue(undefined);
  });

  const q = {
    leagueId: 'L0', type: LEAGUE_BONUS_TYPE.NUMBER,
    label: 'Hvor mange point?', deadline: future, facit: null,
  };

  it('opretter en kopi pr. mål-liga', async () => {
    const res = await copyLeagueBonusToLeagues(q, ['L1', 'L2'], 'admin');
    expect(res.created).toBe(2);
    expect(res.errors).toEqual([]);
    expect(mockAddDoc).toHaveBeenCalledTimes(2);
  });

  it('kopierer facit med, hvis det er sat', async () => {
    await copyLeagueBonusToLeagues({ ...q, facit: '311' }, ['L1'], 'admin');
    expect(mockUpdateDoc).toHaveBeenCalledTimes(1); // setLeagueBonusFacit
  });

  it('samler fejl pr. liga uden at afbryde', async () => {
    mockAddDoc.mockRejectedValueOnce(new Error('boom')).mockResolvedValue({ id: 'ok' });
    const res = await copyLeagueBonusToLeagues(q, ['L1', 'L2'], 'admin');
    expect(res.created).toBe(1);
    expect(res.errors).toHaveLength(1);
  });
});
