/**
 * Tests for ProfilePage.
 * - Yndlingshold-dropdown viser nu CYKELHOLD (ikke nationale fodboldlandshold).
 * - Tema-knappen (ThemeToggle) vises under "Udseende".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProfilePage from './ProfilePage';
import { TOUR_TEAMS, prettyTeam } from '../data/tourTeams2026';

// Stabile objekter: ProfilePage synkroniserer formularen fra `profile` i en
// useEffect med [profile] som dep. Returnerede mocken et nyt objekt ved hver
// render, ville effekten nulstille felterne igen, og enhver interaktion se ud
// som om den ikke virkede.
const mockUser = { uid: 'me', email: 'mig@eksempel.dk' };
const mockProfile = {
  displayName: 'Carsten', avatarEmoji: null, favoriteTeam: null, emailOptOut: false,
};
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, profile: mockProfile }),
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

// EmojiPicker rører ikke noget eksternt, men holdes simpel her
vi.mock('../features/comments/EmojiPicker', () => ({
  default: () => null,
}));

// ThemeToggle kræver window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    addListener: vi.fn(),
    removeListener: vi.fn(),
  })),
});

describe('ProfilePage', () => {
  beforeEach(() => {
    localStorage.clear();
    updateProfileMock.mockClear();
  });

  it('viser yndlingshold-dropdown med cykelhold (ikke landshold)', () => {
    render(<ProfilePage />);
    const select = screen.getByLabelText(/yndlingshold/i);
    const options = within(select).getAllByRole('option');
    const labels = options.map((o) => o.textContent);

    // Et kendt cykelhold er til stede, et nationalt fodboldlandshold er IKKE
    expect(labels).toContain(prettyTeam('Cofidis'));
    expect(labels).not.toContain('Brasilien');
    expect(labels).not.toContain('Danmark');

    // Antal options = tomt valg + alle TOUR_TEAMS
    expect(options).toHaveLength(TOUR_TEAMS.length + 1);
  });

  it('sender det valgte yndlingshold med, når profilen gemmes', async () => {
    // Modstykket til platform-testen: dér SKAL feltet udelades, her SKAL det
    // med. Uden denne test ville en rettelse, der helt droppede feltet, stadig
    // være grøn — og Tour-brugere kunne ikke længere gemme deres hold.
    render(<ProfilePage />);
    await userEvent.selectOptions(screen.getByLabelText(/yndlingshold/i), 'Cofidis');
    await userEvent.click(screen.getByRole('button', { name: /Gem profil/i }));

    expect(updateProfileMock).toHaveBeenCalledTimes(1);
    expect(updateProfileMock.mock.calls[0][1]).toMatchObject({ favoriteTeam: 'Cofidis' });
  });

  it('viser Tema-knappen (ThemeToggle) på profilsiden', () => {
    render(<ProfilePage />);
    expect(screen.getByText(/Tema/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /tema/i })).toBeInTheDocument();
    expect(screen.getByText(/lyst og mørkt for hele appen/i)).toBeInTheDocument();
  });
});
