import { describe, it, expect, vi, beforeEach } from 'vitest';

const updateDocMock = vi.fn(async () => {});
vi.mock('../../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, col, id) => ({ col, id })),
  updateDoc: (...a) => updateDocMock(...a),
}));
// Kun et par hold til validering
vi.mock('../../lib/teams', () => ({ TEAMS: { BRA: { name: 'Brasilien' }, DEN: { name: 'Danmark' } } }));

import { updateProfile } from './profileActions';

describe('updateProfile', () => {
  beforeEach(() => updateDocMock.mockClear());

  it('kræver login', async () => {
    await expect(updateProfile(null, { avatarEmoji: '😀' })).rejects.toThrow(/logget ind/);
  });

  it('afviser ukendt hold', async () => {
    await expect(updateProfile('u1', { favoriteTeam: 'XXX' })).rejects.toThrow(/Ukendt hold/);
  });

  it('afviser for lang emoji', async () => {
    await expect(updateProfile('u1', { avatarEmoji: 'aaaaa' })).rejects.toThrow(/enkelt emoji/);
  });

  it('gemmer gyldige felter', async () => {
    await updateProfile('u1', { avatarEmoji: '🦁', favoriteTeam: 'BRA', emailOptOut: true });
    const patch = updateDocMock.mock.calls[0][1];
    expect(patch).toEqual({ avatarEmoji: '🦁', favoriteTeam: 'BRA', emailOptOut: true });
  });

  it('konverterer tomt hold/emoji til null', async () => {
    await updateProfile('u1', { avatarEmoji: '', favoriteTeam: '' });
    const patch = updateDocMock.mock.calls[0][1];
    expect(patch).toEqual({ avatarEmoji: null, favoriteTeam: null });
  });

  it('skriver intet ved tomt felt-objekt', async () => {
    await updateProfile('u1', {});
    expect(updateDocMock).not.toHaveBeenCalled();
  });
});
