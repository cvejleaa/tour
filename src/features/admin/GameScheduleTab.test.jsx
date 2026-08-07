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

const mockReprice = vi.fn();
vi.mock('./adminActions', () => ({
  callRecomputeGameScores: vi.fn().mockResolvedValue({ ok: true, data: {} }),
  callBackfillPlayerLeagues: vi.fn().mockResolvedValue({ ok: true, data: {} }),
  callRepriceGameOdds: (...a) => mockReprice(...a),
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
    fireEvent.change(screen.getByLabelText(/Spil-start/), { target: { value: '2026-07-04T12:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gem' }));
    await waitFor(() => expect(mockSetGameSchedule).toHaveBeenCalled());
    expect(mockSetGameStatus).not.toHaveBeenCalled();
  });

  // Omvendt: kommer man kun for at afslutte spillet, må gemningen ikke skrive
  // startAt igen. datetime-local har kun minut-præcision, så en blind skrivning
  // ville nulstille sekunderne på en dato, ingen havde rørt.
  it('rører ikke tidsplanen når kun status ændres', async () => {
    render(<GameScheduleTab />);
    fireEvent.change(statusSelect(), { target: { value: 'finished' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gem' }));
    await waitFor(() => expect(mockSetGameStatus).toHaveBeenCalledWith('tour2026', 'finished'));
    expect(mockSetGameSchedule).not.toHaveBeenCalled();
  });

  it('sender kun det ændrede dato-felt med', async () => {
    render(<GameScheduleTab />);
    fireEvent.change(screen.getByLabelText(/Spil-start/), { target: { value: '2026-07-04T12:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gem' }));
    await waitFor(() => expect(mockSetGameSchedule).toHaveBeenCalled());
    const [, patch] = mockSetGameSchedule.mock.calls[0];
    expect(Object.keys(patch)).toEqual(['startAt']);
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
    // Begge dele ændres, så tidsplanen faktisk skrives — og fejler.
    fireEvent.change(screen.getByLabelText(/Spil-start/), { target: { value: '2026-07-04T12:00' } });
    fireEvent.change(statusSelect(), { target: { value: 'finished' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gem' }));
    await waitFor(() => expect(mockSetGameSchedule).toHaveBeenCalled());
    expect(await screen.findByText(/tidsplan/i)).toBeInTheDocument();
    expect(mockSetGameStatus).not.toHaveBeenCalled();
  });

  // Spil-dokumentet skrives også af serveren (fx standings hvert kvarter).
  // Et ugemt valg må ikke blive nulstillet af sådan en snapshot — ellers
  // hopper vælgeren tilbage, uden at admin får besked.
  it('beholder et ugemt statusvalg når spillet opdateres udefra', () => {
    // Firestore-Timestamps er nye objekter ved hver snapshot — samme tidspunkt,
    // anden reference.
    const stamp = () => ({ toMillis: () => 1_700_000_000_000 });
    mockGames.mockReturnValue({ games: [{ ...TOUR, startAt: stamp() }], loading: false });
    const { rerender } = render(<GameScheduleTab />);
    fireEvent.change(statusSelect(), { target: { value: 'finished' } });

    // Serveren skriver noget andet på dokumentet; datoen er uændret.
    mockGames.mockReturnValue({
      games: [{ ...TOUR, startAt: stamp(), standings: ['ny'] }],
      loading: false,
    });
    rerender(<GameScheduleTab />);
    expect(statusSelect().value).toBe('finished');
  });

  it('tilbyder et tomt valg, når spillet slet ingen status har', () => {
    mockGames.mockReturnValue({ games: [{ ...TOUR, status: undefined }], loading: false });
    render(<GameScheduleTab />);
    expect(statusSelect().value).toBe('');
    expect(screen.getByRole('option', { name: '— ikke sat —' })).toBeInTheDocument();
  });
});

// --- Ompris kampene -------------------------------------------------------
//
// Knappen skriver i produktionsdata på hver eneste ikke-låste kamps
// pointværdi, og der er ingen oddsHistory at rulle tilbage til. CLAUDE.md
// kræver tør-kørsel først, og den regel skal håndhæves af FLADEN — ikke kun
// af en default i callablen, som en fremtidig ændring kan vende.
describe('ompris kampene', () => {
  const SL = { id: 'sl2627', name: 'Superligaen', emoji: '⚽', type: 'football', status: 'live' };
  const PLAN = {
    ok: true,
    data: {
      updated: 2,
      dryRun: true,
      aendringer: [
        { id: 'a', round: 4, home: 'Lyngby', away: 'FCM', foer: { 1: 4.48, X: 6, 2: 1.55 }, efter: { 1: 4.61, X: 6.38, 2: 1.6 } },
        { id: 'b', round: 4, home: 'Randers', away: 'FCK', foer: { 1: 3.6, X: 6, 2: 1.75 }, efter: { 1: 3.72, X: 5.6, 2: 1.81 } },
      ],
    },
  };

  beforeEach(() => {
    mockGames.mockReturnValue({ games: [SL], loading: false });
    mockReprice.mockResolvedValue(PLAN);
  });

  const toerKnap = () => screen.getByRole('button', { name: /Ompris kampene/i });

  // Odds og Elo findes kun i fodboldspillene. Blev knappen vist på Touren,
  // ville den kalde en callable, der intet har at ompris — og en admin ville
  // tro, den bare ikke virkede.
  it('vises kun for fodboldspil', () => {
    const { unmount } = render(<GameScheduleTab />);
    expect(toerKnap()).toBeInTheDocument();
    unmount();
    mockGames.mockReturnValue({ games: [TOUR], loading: false });
    render(<GameScheduleTab />);
    expect(screen.queryByRole('button', { name: /Ompris kampene/i })).not.toBeInTheDocument();
  });

  it('tørkører FØRST — og skrive-knappen findes ikke før man har set planen', async () => {
    render(<GameScheduleTab />);
    // Før tør-kørslen er der intet at skrive.
    expect(screen.queryByRole('button', { name: /Skriv de/i })).not.toBeInTheDocument();
    fireEvent.click(toerKnap());
    await waitFor(() => expect(mockReprice).toHaveBeenCalled());
    // Det FØRSTE kald SKAL være en tør-kørsel.
    expect(mockReprice).toHaveBeenCalledWith({ gameId: 'sl2627', dryRun: true });
    // Nu — og først nu — findes skrive-knappen.
    await waitFor(() => expect(screen.getByRole('button', { name: /Skriv de 2 ændringer/i })).toBeInTheDocument());
  });

  it('viser før og efter for hver kamp, så ændringen kan ses inden den skrives', async () => {
    render(<GameScheduleTab />);
    fireEvent.click(toerKnap());
    await waitFor(() => expect(screen.getByText(/Lyngby/)).toBeInTheDocument());
    // Netop de to tal, der beviser at begge halvdele af modellen er ude:
    // en X der stiger OVER 6 (loftet væk) og en der falder UNDER (draw-modellen).
    expect(screen.getByText(/4\.61 \/ 6\.38 \/ 1\.6/)).toBeInTheDocument();
    expect(screen.getByText(/3\.72 \/ 5\.6 \/ 1\.81/)).toBeInTheDocument();
  });

  it('skriver ikke uden bekræftelse', async () => {
    const bekraeft = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<GameScheduleTab />);
    fireEvent.click(toerKnap());
    await waitFor(() => screen.getByRole('button', { name: /Skriv de 2/i }));
    mockReprice.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /Skriv de 2/i }));
    await waitFor(() => expect(bekraeft).toHaveBeenCalled());
    expect(mockReprice).not.toHaveBeenCalled();
    bekraeft.mockRestore();
  });

  it('sender dryRun: false, når man bekræfter', async () => {
    const bekraeft = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<GameScheduleTab />);
    fireEvent.click(toerKnap());
    await waitFor(() => screen.getByRole('button', { name: /Skriv de 2/i }));
    mockReprice.mockResolvedValue({ ok: true, data: { updated: 2, dryRun: false, aendringer: [] } });
    fireEvent.click(screen.getByRole('button', { name: /Skriv de 2/i }));
    await waitFor(() => expect(mockReprice).toHaveBeenLastCalledWith({ gameId: 'sl2627', dryRun: false }));
    // Planen ryddes bagefter, så man ikke kan trykke skriv to gange i træk på
    // et nu forældet grundlag.
    await waitFor(() => expect(screen.queryByRole('button', { name: /Skriv de/i })).not.toBeInTheDocument());
    bekraeft.mockRestore();
  });

  it('siger det tydeligt, når intet ville ændre sig', async () => {
    mockReprice.mockResolvedValue({ ok: true, data: { updated: 0, dryRun: true, aendringer: [] } });
    render(<GameScheduleTab />);
    fireEvent.click(toerKnap());
    await waitFor(() => expect(screen.getByText(/allerede i takt med modellen/i)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Skriv de/i })).not.toBeInTheDocument();
  });
});
