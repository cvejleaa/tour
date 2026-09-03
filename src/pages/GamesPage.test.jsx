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
let myPoints = {};
let myForladt = new Set();
vi.mock('../features/games/useGames', async () => {
  const actual = await vi.importActual('../features/games/useGames');
  return {
    splitGames: actual.splitGames,
    useGames: () => ({ games: gamesData, myGameIds, myPoints, myForladt, loading: false }),
  };
});

// ── Mock gameActions ──────────────────────────────────────────────────────────
vi.mock('../features/games/gameActions', () => ({
  joinGame: vi.fn().mockResolvedValue({ ok: true }),
  leaveGame: vi.fn().mockResolvedValue({ ok: true }),
}));

global.confirm = vi.fn(() => true);
global.prompt = vi.fn(() => null);

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
    myPoints = { wm: 0 };
    myForladt = new Set();
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

  // Forlad arkiverer (serveren): man forsvinder fra stilling og ligaer, tips
  // på kommende kampe slettes. Knappen findes kun, mens spillet er åbent — også
  // hvis admin sætter et spil tilbage fra "Afsluttet" til en anden status.
  it('spørger KUN én gang, når spilleren ingen point har — og dialogen siger hvad der sker', async () => {
    const { leaveGame } = await import('../features/games/gameActions');
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /forlad VM 2026/i }));
    await waitFor(() => expect(leaveGame).toHaveBeenCalledWith('me-uid', 'wm'));
    expect(global.confirm).toHaveBeenCalledTimes(1);
    const [tekst] = global.confirm.mock.calls[0];
    expect(tekst).toContain('Forlad "VM 2026"?');
    expect(tekst).toContain('tips på kommende kampe slettes');
    expect(global.prompt).not.toHaveBeenCalled();
  });

  it('spørger TO gange med tallet, når spilleren har point — og forlader først ved andet ja', async () => {
    const { leaveGame } = await import('../features/games/gameActions');
    myPoints = { wm: 12.5 };
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /forlad VM 2026/i }));
    await waitFor(() => expect(leaveGame).toHaveBeenCalledWith('me-uid', 'wm'));
    expect(global.confirm).toHaveBeenCalledTimes(2);
    const [anden] = global.confirm.mock.calls[1];
    expect(anden).toContain('Du står med 12,5 point i VM 2026.');
    expect(anden).toContain('får du din stilling igen');
  });

  it('forlader IKKE, når spilleren siger nej til anden dialog', async () => {
    const { leaveGame } = await import('../features/games/gameActions');
    myPoints = { wm: 4 };
    global.confirm.mockImplementationOnce(() => true).mockImplementationOnce(() => false);
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /forlad VM 2026/i }));
    await new Promise((r) => setTimeout(r, 0));
    expect(global.confirm).toHaveBeenCalledTimes(2);
    expect(leaveGame).not.toHaveBeenCalled();
  });

  it('et forladt spil står under Åbne spil med "Vend tilbage", ikke "Deltag"', () => {
    myGameIds = new Set();            // forladt = ikke medlem …
    myForladt = new Set(['wm']);      // … men arkivet ligger der
    renderPage();
    expect(screen.getByRole('button', { name: 'Vend tilbage til VM 2026' })).toHaveTextContent('Vend tilbage');
    expect(screen.queryByRole('button', { name: /deltag i VM 2026/i })).not.toBeInTheDocument();
    // De andre åbne spil siger stadig Deltag.
    expect(screen.getByRole('button', { name: /deltag i Superligaen/i })).toBeInTheDocument();
  });

  it('viser ikke Forlad for et spil i gang', () => {
    myGameIds = new Set(['tour']);
    renderPage();
    expect(screen.queryByRole('button', { name: /forlad Tour de France/i })).not.toBeInTheDocument();
  });

  it('viser ikke Forlad for et afsluttet spil', () => {
    gamesData = allGames.map((g) => (g.id === 'wm' ? { ...g, status: 'finished' } : g));
    renderPage();
    expect(screen.getByText('Afsluttet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /forlad VM 2026/i })).not.toBeInTheDocument();
  });

  // Det brugeren bad om: et afsluttet eksternt spil skal STÅ på oversigten med
  // grå etiket — ikke forsvinde. Kortet skal stadig linke til sin egen app.
  it('viser et afsluttet eksternt spil under "Andre spil" med link i behold', () => {
    gamesData = [
      { id: 'tour2026', name: 'Tour de France 2026', emoji: '🚴', order: 1, season: '2026',
        status: 'finished', joinable: false, externalUrl: 'https://tour.vejleaa.dk' },
    ];
    myGameIds = new Set();
    renderPage();
    expect(screen.getByText('Andre spil')).toBeInTheDocument();
    expect(screen.getByText('Afsluttet')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /åbn Tour de France 2026 i sin egen app/i });
    expect(link).toHaveAttribute('href', 'https://tour.vejleaa.dk');
    // …og det reklameres ikke som noget, man kan deltage i.
    expect(screen.getByText('Ingen åbne spil at deltage i lige nu.')).toBeInTheDocument();
  });

  it('viser tom-tilstand når jeg ikke deltager i nogen spil', () => {
    myGameIds = new Set();
    renderPage();
    expect(screen.getByText('Du deltager ikke i nogen spil endnu.')).toBeInTheDocument();
  });
});
