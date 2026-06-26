import { describe, it, expect, vi, beforeEach } from 'vitest';

const updateDocMock = vi.fn(async () => {});
vi.mock('../../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, col, id) => ({ col, id })),
  updateDoc: (...a) => updateDocMock(...a),
  arrayUnion: vi.fn((v) => ({ _union: v })),
  arrayRemove: vi.fn((v) => ({ _remove: v })),
}));

import { toggleReaction, QUICK_REACTIONS } from './reactionActions';

describe('toggleReaction', () => {
  beforeEach(() => updateDocMock.mockClear());

  it('tilføjer reaktion når brugeren ikke har reageret', async () => {
    await toggleReaction('leagueComments', 'c1', '👍', 'u1', false);
    const patch = updateDocMock.mock.calls[0][1];
    expect(patch['reactions.👍']).toEqual({ _union: 'u1' });
  });

  it('fjerner reaktion når brugeren allerede har reageret', async () => {
    await toggleReaction('bets', 'b1', '🔥', 'u1', true);
    const patch = updateDocMock.mock.calls[0][1];
    expect(patch['reactions.🔥']).toEqual({ _remove: 'u1' });
  });

  it('kræver login og emoji', async () => {
    await expect(toggleReaction('bets', 'b1', '🔥', null, false)).rejects.toThrow(/logget ind/);
    await expect(toggleReaction('bets', 'b1', '', 'u1', false)).rejects.toThrow(/emoji/);
  });

  it('har et sæt hurtig-reaktioner', () => {
    expect(QUICK_REACTIONS.length).toBeGreaterThan(0);
  });
});
