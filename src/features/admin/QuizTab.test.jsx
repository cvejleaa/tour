import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';

vi.mock('../../firebase', () => ({ db: {} }));
const mockGetDocs = vi.fn();
vi.mock('firebase/firestore', () => ({
  collection: (...a) => ({ _c: a }),
  query: (...a) => ({ _q: a }),
  where: (...a) => ({ _w: a }),
  getDocs: (...a) => mockGetDocs(...a),
}));
vi.mock('../games/useGames', () => ({
  useGames: () => ({ games: [{ id: 'superliga2627', status: 'open' }, { id: 'pl2627-efteraar', status: 'open' }, { id: 'vm2026', status: 'finished' }] }),
}));
const KAMPE = [{ id: 'm1', home: 'FCK', away: 'Brøndby', result: '1', odds: { 1: 2, X: 3, 2: 4 }, round: 1 }];
vi.mock('../games/useGame', () => ({
  useGame: () => ({ game: { id: 'g', type: 'football' }, matches: KAMPE, loading: false }),
}));
const LIGA = { id: 'L1', name: 'Dreamteam', memberUids: ['a', 'b', 'c'] };
vi.mock('../games/useVisibleGameStandings', () => ({
  useVisibleGameStandings: () => ({
    standings: [
      { uid: 'a', name: 'Joe', rank: 1, totalPoints: 40 },
      { uid: 'b', name: 'Sonja', rank: 2, totalPoints: 30 },
      { uid: 'c', name: 'Ole', rank: 3, totalPoints: 20 },
    ],
    leagues: [LIGA],
    loading: false,
  }),
}));
const mockLegacy = vi.fn();
vi.mock('./legacyResults', () => ({ fetchLegacyResults: (...a) => mockLegacy(...a) }));

import QuizTab from './QuizTab';

const top = (navne) => navne.map((name, i) => ({ rank: i + 1, name, points: 100 - i * 10 }));

beforeEach(() => {
  vi.clearAllMocks();
  mockGetDocs.mockResolvedValue({
    forEach: (fn) => [
      { id: 'a_m1', data: () => ({ uid: 'a', matchId: 'm1', pick: '1', points: 2 }) },
      { id: 'b_m1', data: () => ({ uid: 'b', matchId: 'm1', pick: 'X', points: 0 }) },
    ].forEach(fn),
  });
  mockLegacy.mockResolvedValue({
    ok: true,
    results: [
      { source: 'vm', name: 'Dreamteam', memberCount: 12, top: top(['Joe', 'Sonja', 'Ole', 'Better', 'No1.']) },
      { source: 'tour', name: 'dreamteam ', memberCount: 9, top: top(['Marianne', 'Oldefar', 'Joe', 'Forza Bif', 'Sonja']) },
      { source: 'vm', name: 'Andre', memberCount: 4, top: top(['X', 'Y']) },
    ],
  });
});

async function lav() {
  render(<QuizTab />);
  fireEvent.click(screen.getByRole('button', { name: 'Lav quizzen' }));
  await waitFor(() => expect(screen.getAllByTestId('quiz-runde')).toHaveLength(2));
}

describe('QuizTab', () => {
  it('laver to runder for ligaen «Dreamteam» — navnet matches uden forskel på store/små bogstaver og mellemrum', async () => {
    await lav();
    const [r1, r2] = screen.getAllByTestId('quiz-runde');
    expect(within(r1).getByText(/Runde 1/)).toBeInTheDocument();
    expect(within(r1).getByText('Hvem vandt ligaen til VM 2026?')).toBeInTheDocument();
    expect(within(r1).getByText('Hvem vandt ligaen i Tour de France?')).toBeInTheDocument();
    expect(within(r2).getByText('Hvem fører ligaen i Superligaen lige nu?')).toBeInTheDocument();
    expect(screen.getByTestId('quiz-kilder').textContent).toMatch(/VM 2026: top 5 af 12/);
    expect(screen.getByTestId('quiz-kilder').textContent).toMatch(/Superligaen: 3 spillere/);
    // Ligamedlemmernes tips hentes pr. spil.
    expect(mockGetDocs).toHaveBeenCalledTimes(2);
  });

  it('svarene er skjult, indtil man beder om dem — ét ad gangen eller alle', async () => {
    await lav();
    expect(screen.queryAllByTestId('quiz-svar')).toHaveLength(0);
    fireEvent.click(screen.getAllByRole('button', { name: 'Vis svar' })[0]);
    expect(screen.getAllByTestId('quiz-svar')).toHaveLength(1);
    expect(screen.getAllByTestId('quiz-svar')[0].textContent).toBe('Svar: Joe');
    fireEvent.click(screen.getByRole('button', { name: 'Vis alle svar' }));
    expect(screen.getAllByTestId('quiz-svar').length).toBe(screen.getAllByTestId('quiz-spoergsmaal').length);
    fireEvent.click(screen.getByRole('button', { name: 'Skjul alle svar' }));
    expect(screen.getAllByTestId('quiz-svar')).toHaveLength(1);
  });

  it('et nyt tryk på samme liga henter forfra og ender med en quiz igen', async () => {
    await lav();
    fireEvent.click(screen.getByRole('button', { name: 'Lav quizzen' }));
    await waitFor(() => expect(screen.getAllByTestId('quiz-runde')).toHaveLength(2));
    expect(mockGetDocs).toHaveBeenCalledTimes(4);
  });

  it('kan udskrives', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    await lav();
    fireEvent.click(screen.getByRole('button', { name: '🖨️ Udskriv' }));
    expect(print).toHaveBeenCalled();
  });

  it('en ukendt liga giver ingen spørgsmål om de levende spil og siger hvorfor', async () => {
    render(<QuizTab />);
    fireEvent.change(screen.getByLabelText('Liga'), { target: { value: 'Ukendt' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lav quizzen' }));
    await waitFor(() => expect(screen.getByTestId('quiz-kilder').textContent).toMatch(/Superligaen: du er ikke med i ligaen her/));
    expect(screen.queryByText('Hvem fører ligaen i Superligaen lige nu?')).toBeNull();
  });
});
