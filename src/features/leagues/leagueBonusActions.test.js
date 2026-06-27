/**
 * Tests for leagueBonusActions — validering af deadline og redigering.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAddDoc = vi.fn();
const mockUpdateDoc = vi.fn();
const mockGetDocs = vi.fn(() => Promise.resolve({ empty: true, docs: [] }));

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
  getDocs: (...a) => mockGetDocs(...a),
  query: vi.fn((...a) => a),
  where: vi.fn((...a) => ({ _where: a })),
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
    mockGetDocs.mockReset(); mockGetDocs.mockResolvedValue({ empty: true, docs: [] });
  });

  const q = {
    id: 'src', leagueId: 'L0', type: LEAGUE_BONUS_TYPE.NUMBER,
    label: 'Hvor mange point?', deadline: future, facit: null,
  };

  it('opretter en kopi pr. mål-liga', async () => {
    const res = await copyLeagueBonusToLeagues(q, ['L1', 'L2'], 'admin');
    expect(res.created).toBe(2);
    expect(res.skipped).toBe(0);
    expect(res.errors).toEqual([]);
    expect(mockAddDoc).toHaveBeenCalledTimes(2);
  });

  it('mærker kopier med copyGroupId = kildens id', async () => {
    await copyLeagueBonusToLeagues(q, ['L1'], 'admin');
    const [, data] = mockAddDoc.mock.calls[0];
    expect(data.copyGroupId).toBe('src');
  });

  it('springer ligaer over der allerede har en kopi (idempotent — ingen dobbelt-point)', async () => {
    // L1 har allerede en kopi fra samme gruppe; L2 har ikke.
    mockGetDocs
      .mockResolvedValueOnce({ empty: false, docs: [{ id: 'dup' }] })
      .mockResolvedValueOnce({ empty: true, docs: [] });
    const res = await copyLeagueBonusToLeagues(q, ['L1', 'L2'], 'admin');
    expect(res.skipped).toBe(1);
    expect(res.created).toBe(1);
    expect(mockAddDoc).toHaveBeenCalledTimes(1);
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
