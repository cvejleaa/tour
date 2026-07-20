/**
 * Tests for GamesPage.
 * Mocker useAuth, useGames-hooken og gameActions.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import GamesPage from './GamesPage';

// Undgå den rigtige Firebase-init (useGames-modulet importeres via importActual).
vi.mock('../firebase', () => ({ db: {}, auth: {} }));

// ── Mock AuthContext ──────────────────────────────────────────────────────────
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'me-uid' } }),
}));

// ── Mock useGames-hooken (behold den rigtige splitGames) ─────────────────────
let gamesData = [];
let myGameIds = new Set();
vi.mock('../features/games/useGames', async () => {
  const actual = await vi.importActual('../features/games/useGames');
  return {
    splitGames: actual.splitGames,
    useGames: () => ({ games: gamesData, myGameIds, loading: false }),
  };
});

// ── Mock gameActions ──────────────────────────────────────────────────────────
vi.mock('../features/games/gameActions', () => ({
  joinGame: vi.fn().mockResolvedValue({ ok: true }),
  leaveGame: vi.fn().mockResolvedValue({ ok: true }),
}));

global.confirm = vi.fn(() => true);

const allGames = [
  { id: 'wm', name: 'VM 2026', emoji: '⚽', order: 1, season: '2026', status: 'open', joinable: true },
  { id: 'tour', name: 'Tour de France', emoji: '🚴', order: 2, season: '2026', status: 'live', joinable: true },
  { id: 'super', name: 'Superligaen', emoji: '🏆', order: 3, season: '2026/27', status: 'open', joinable: true },
];

function renderPage() {
  return render(<MemoryRouter><GamesPage /></MemoryRouter>);
}

describe('GamesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gamesData = allGames;
    myGameIds = new Set(['wm']); // jeg deltager i VM
  });

  it('viser mine spil under "Mine spil"', () => {
    renderPage();
    expect(screen.getByText('VM 2026')).toBeInTheDocument();
    // Linker til spillet
    const link = screen.getByRole('link', { name: /åbn spil: VM 2026/i });
    expect(link).toHaveAttribute('href', '/spil/wm');
  });

  it('viser åbne spil jeg ikke er med i', () => {
    renderPage();
    expect(screen.getByText('Tour de France')).toBeInTheDocument();
    expect(screen.getByText('Superligaen')).toBeInTheDocument();
    // Deltag-knapper for de åbne spil
    expect(screen.getByRole('button', { name: /deltag i Tour de France/i })).toBeInTheDocument();
  });

  it('kalder joinGame ved klik på Deltag', async () => {
    const { joinGame } = await import('../features/games/gameActions');
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /deltag i Tour de France/i }));
    await waitFor(() => {
      expect(joinGame).toHaveBeenCalledWith('me-uid', 'tour');
    });
  });

  it('kalder leaveGame ved bekræftet Forlad', async () => {
    const { leaveGame } = await import('../features/games/gameActions');
    renderPage();
    // VM er "open" → Forlad-affordance vises
    fireEvent.click(screen.getByRole('button', { name: /forlad VM 2026/i }));
    await waitFor(() => {
      expect(leaveGame).toHaveBeenCalledWith('me-uid', 'wm');
    });
  });

  it('viser tom-tilstand når jeg ikke deltager i nogen spil', () => {
    myGameIds = new Set();
    renderPage();
    expect(screen.getByText('Du deltager ikke i nogen spil endnu.')).toBeInTheDocument();
  });
});
