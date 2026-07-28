/**
 * ProfilePage i PLATFORM-tilstand.
 *
 * Yndlingshold hører til ét spil ad gangen på platformen, så feltet vises ikke
 * her. Regressionsværn: profilen må heller ikke SENDE feltet med — migrerede
 * brugere har et hold fra et andet spil i den globale profil, og den værdi
 * fik tidligere hele profil-gemningen til at fejle med "Ukendt hold".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../lib/platform', () => ({ PLATFORM_MODE: true }));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { uid: 'me', email: 'mig@eksempel.dk' },
    profile: {
      displayName: 'Carsten',
      avatarEmoji: null,
      // Efterladt af VM-migreringen: et fodboldlandshold i den globale profil.
      favoriteTeam: 'Danmark',
      emailOptOut: false,
    },
  }),
}));

const updateProfileMock = vi.fn(async () => {});
vi.mock('../features/profile/profileActions', () => ({
  updateProfile: (...a) => updateProfileMock(...a),
  updateDisplayName: vi.fn(async () => {}),
  updateContactEmail: vi.fn(async () => {}),
  changeLoginEmail: vi.fn(async () => {}),
  linkGoogleLogin: vi.fn(async () => {}),
  hasProvider: () => false,
}));

vi.mock('../features/comments/EmojiPicker', () => ({ default: () => null }));

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false, media: query, addListener: vi.fn(), removeListener: vi.fn(),
  })),
});

const { default: ProfilePage } = await import('./ProfilePage');

describe('ProfilePage (platform)', () => {
  beforeEach(() => {
    localStorage.clear();
    updateProfileMock.mockClear();
  });

  it('viser ikke yndlingshold — det vælges inde i spillet', () => {
    render(<ProfilePage />);
    expect(screen.queryByLabelText('Yndlingshold')).toBeNull();
  });

  it('sender ikke favoriteTeam med, når profilen gemmes', async () => {
    render(<ProfilePage />);
    await userEvent.click(screen.getByRole('button', { name: /Gem profil/i }));
    expect(updateProfileMock).toHaveBeenCalledTimes(1);
    const payload = updateProfileMock.mock.calls[0][1];
    expect(payload).not.toHaveProperty('favoriteTeam');
    expect(payload).toEqual({ avatarEmoji: null, emailOptOut: false });
  });
});
