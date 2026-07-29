// Tests for GameScheduleTab — især status-vælgeren, der afgør om et spil står
// som "Afsluttet". Statussen har konsekvenser (spillet ryger ud af "Åbne spil",
// påmindelser stopper), så den må hverken skrives utilsigtet eller kunne sættes
// til en værdi, visningen ikke kender.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../firebase', () => ({ db: {} }));

// useGames er en live-lytter — vi fodrer den direkte.
const mockGames = vi.fn();
vi.mock('../games/useGames', () => ({
  useGames: () => mockGames(),
}));

const mockSetGameSchedule = vi.fn();
const mockSetGameStatus = vi.fn();
vi.mock('../games/gameActions', () => ({
  setGameSchedule: (...a) => mockSetGameSchedule(...a),
  setGameStatus: (...a) => mockSetGameStatus(...a),
}));

vi.mock('./adminActions', () => ({
  callRecomputeGameScores: vi.fn().mockResolvedValue({ ok: true, data: {} }),
  callBackfillPlayerLeagues: vi.fn().mockResolvedValue({ ok: true, data: {} }),
}));

import GameScheduleTab from './GameScheduleTab';

const TOUR = {
  id: 'tour2026', name: 'Tour de France 2026', emoji: '🚴',
  type: 'cycling', status: 'live', season: '2026',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockSetGameSchedule.mockResolvedValue({ ok: true });
  mockSetGameStatus.mockResolvedValue({ ok: true });
  mockGames.mockReturnValue({ games: [TOUR], loading: false });
});

/** Status-vælgeren for et spil. */
function statusSelect(name = TOUR.name) {
  return screen.getByLabelText(`Status for ${name}`);
}

describe('GameScheduleTab — status', () => {
  it('viser spillets nuværende status på dansk', () => {
    render(<GameScheduleTab />);
    expect(statusSelect().value).toBe('live');
    expect(screen.getByRole('option', { name: 'Afsluttet' })).toBeInTheDocument();
  });

  it('skriver den nye status når admin vælger Afsluttet og gemmer', async () => {
    render(<GameScheduleTab />);
    fireEvent.change(statusSelect(), { target: { value: 'finished' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gem' }));
    await waitFor(() => expect(mockSetGameStatus).toHaveBeenCalledWith('tour2026', 'finished'));
    expect(await screen.findByText('Gemt ✓')).toBeInTheDocument();
  });

  // Gem-knappen dækker både tidsplan og status. Et gem af en dato må ikke
  // skrive status igen — ellers ville hver gemning røre ved livscyklussen.
  it('rører ikke status når kun tidsplanen ændres', async () => {
    render(<GameScheduleTab />);
    fireEvent.click(screen.getByRole('button', { name: 'Gem' }));
    await waitFor(() => expect(mockSetGameSchedule).toHaveBeenCalled());
    expect(mockSetGameStatus).not.toHaveBeenCalled();
  });

  it('forklarer hvad Afsluttet betyder, før der gemmes', () => {
    render(<GameScheduleTab />);
    fireEvent.change(statusSelect(), { target: { value: 'finished' } });
    expect(screen.getByText(/ikke flere påmindelser/i)).toBeInTheDocument();
  });

  it('viser fejlen fra serveren, hvis status ikke kunne gemmes', async () => {
    mockSetGameStatus.mockResolvedValue({ ok: false, error: 'Du har ikke adgang til denne handling.' });
    render(<GameScheduleTab />);
    fireEvent.change(statusSelect(), { target: { value: 'finished' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gem' }));
    expect(await screen.findByText(/ikke adgang/i)).toBeInTheDocument();
  });

  // Fejler tidsplanen, er det meningsløst at skrive status bagefter — så ville
  // halvdelen af gemningen være gået igennem uden at admin fik det at vide.
  it('springer status over, hvis tidsplanen fejlede', async () => {
    mockSetGameSchedule.mockResolvedValue({ ok: false, error: 'Kunne ikke gemme spillets tidsplan.' });
    render(<GameScheduleTab />);
    fireEvent.change(statusSelect(), { target: { value: 'finished' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gem' }));
    expect(await screen.findByText(/tidsplan/i)).toBeInTheDocument();
    expect(mockSetGameStatus).not.toHaveBeenCalled();
  });

  it('tilbyder et tomt valg, når spillet slet ingen status har', () => {
    mockGames.mockReturnValue({ games: [{ ...TOUR, status: undefined }], loading: false });
    render(<GameScheduleTab />);
    expect(statusSelect().value).toBe('');
    expect(screen.getByRole('option', { name: '— ikke sat —' })).toBeInTheDocument();
  });
});
