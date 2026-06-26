// Tests for BonusPage – bonus-spørgsmål med låse-logik.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mock Firebase
vi.mock('../firebase', () => ({ db: {}, auth: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  setDoc: vi.fn(() => Promise.resolve()),
  serverTimestamp: vi.fn(() => 'SERVER_TS'),
  collection: vi.fn(),
  onSnapshot: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  where: vi.fn(),
}));

// Mock hooks
vi.mock('../features/bonus/useBonusData', () => ({
  useBonusQuestions: vi.fn(),
  useMyBonusBets: vi.fn(),
  useBonusBets: vi.fn(() => ({ bets: [], loading: false })),
}));
vi.mock('../features/leaderboard/useStandings', () => ({
  useStandings: () => ({ standings: [], loading: false, error: null }),
}));
vi.mock('../features/leagues/useLeagues', () => ({
  useLeagues: () => ({ leagues: [], loading: false, error: null }),
}));
vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

import BonusPage from './BonusPage';
import { useBonusQuestions, useMyBonusBets } from '../features/bonus/useBonusData';
import { useAuth } from '../context/AuthContext';

function renderPage() {
  return render(
    <MemoryRouter>
      <BonusPage />
    </MemoryRouter>,
  );
}

const futureDeadline = new Date('2099-01-01T00:00:00Z');
const pastDeadline = new Date('2000-01-01T00:00:00Z');

const openTopScorer = {
  id: 'q_top',
  type: 'topScorer',
  label: 'Hvem bliver turneringens topscorer?',
  deadline: futureDeadline,
  facit: null,
  options: null,
};

const openGroupWinnerA = {
  id: 'q_gw_A',
  type: 'groupWinner',
  label: 'Hvem vinder gruppe A?',
  deadline: futureDeadline,
  groupName: 'A',
  facit: null,
  options: ['DK', 'GER', 'BRA'],
};

const lockedQuestion = {
  id: 'q2',
  type: 'groupWinner',
  label: 'Hvem vinder gruppe B?',
  deadline: pastDeadline,
  groupName: 'B',
  facit: 'DK',
  options: ['DK', 'FRA', 'BRA'],
};

const lockedTopScorer = {
  id: 'q_top_locked',
  type: 'topScorer',
  label: 'Hvem scorer flest mål?',
  deadline: pastDeadline,
  facit: 'Haaland',
  options: null,
};

beforeEach(() => {
  useAuth.mockReturnValue({ user: { uid: 'user1' } });
});

// ---------------------------------------------------------------------------
// Loading og tom tilstand
// ---------------------------------------------------------------------------
describe('BonusPage – loading og tom tilstand', () => {
  it('viser spinner under indlæsning (questions + bets)', () => {
    useBonusQuestions.mockReturnValue({ questions: [], loading: true, error: null });
    useMyBonusBets.mockReturnValue({ bonusBets: new Map(), loading: true });
    renderPage();
    expect(screen.getByLabelText('Henter bonusspørgsmål…')).toBeInTheDocument();
  });

  it('viser spinner hvis kun questions loader', () => {
    useBonusQuestions.mockReturnValue({ questions: [], loading: true, error: null });
    useMyBonusBets.mockReturnValue({ bonusBets: new Map(), loading: false });
    renderPage();
    expect(screen.getByLabelText('Henter bonusspørgsmål…')).toBeInTheDocument();
  });

  it('viser spinner hvis kun bets loader', () => {
    useBonusQuestions.mockReturnValue({ questions: [], loading: false, error: null });
    useMyBonusBets.mockReturnValue({ bonusBets: new Map(), loading: true });
    renderPage();
    expect(screen.getByLabelText('Henter bonusspørgsmål…')).toBeInTheDocument();
  });

  it('viser tom-tilstand uden spørgsmål', () => {
    useBonusQuestions.mockReturnValue({ questions: [], loading: false, error: null });
    useMyBonusBets.mockReturnValue({ bonusBets: new Map(), loading: false });
    renderPage();
    expect(screen.getByText(/Ingen bonusspørgsmål endnu/)).toBeInTheDocument();
  });

  it('viser fejlbesked ved netværksfejl', () => {
    useBonusQuestions.mockReturnValue({
      questions: [],
      loading: false,
      error: 'Netværksfejl',
    });
    useMyBonusBets.mockReturnValue({ bonusBets: new Map(), loading: false });
    renderPage();
    expect(screen.getByText(/Kunne ikke hente bonusspørgsmål/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Overskrift og statistik-banner
// ---------------------------------------------------------------------------
describe('BonusPage – overskrift og statistik', () => {
  it('viser side-overskrift "🎁 Bonus"', () => {
    useBonusQuestions.mockReturnValue({ questions: [openTopScorer], loading: false, error: null });
    useMyBonusBets.mockReturnValue({ bonusBets: new Map(), loading: false });
    renderPage();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Bonus');
  });

  it('viser bonus-point i statistik-banner', () => {
    useBonusQuestions.mockReturnValue({
      questions: [lockedQuestion],
      loading: false,
      error: null,
    });
    const betsMap = new Map([
      ['q2', { questionId: 'q2', uid: 'user1', answer: 'DK', points: 10 }],
    ]);
    useMyBonusBets.mockReturnValue({ bonusBets: betsMap, loading: false });
    renderPage();
    expect(screen.getByTestId('total-bonus-points')).toHaveTextContent('10');
  });

  it('viser 0 point i statistik-banner uden svar', () => {
    useBonusQuestions.mockReturnValue({
      questions: [openTopScorer],
      loading: false,
      error: null,
    });
    useMyBonusBets.mockReturnValue({ bonusBets: new Map(), loading: false });
    renderPage();
    expect(screen.getByTestId('total-bonus-points')).toHaveTextContent('0');
  });

  it('viser besvaret/åbne statistik', () => {
    useBonusQuestions.mockReturnValue({
      questions: [openTopScorer, openGroupWinnerA],
      loading: false,
      error: null,
    });
    // Ét besvaret
    const betsMap = new Map([
      ['q_top', { questionId: 'q_top', uid: 'user1', answer: 'Haaland' }],
    ]);
    useMyBonusBets.mockReturnValue({ bonusBets: betsMap, loading: false });
    renderPage();
    // 1/2 besvaret
    expect(screen.getByText('1/2')).toBeInTheDocument();
  });

  it('viser 0/0 for besvaret/åbne når alle er låste', () => {
    useBonusQuestions.mockReturnValue({
      questions: [lockedQuestion],
      loading: false,
      error: null,
    });
    useMyBonusBets.mockReturnValue({ bonusBets: new Map(), loading: false });
    renderPage();
    expect(screen.getByText('0/0')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Åbne og låste sektioner
// ---------------------------------------------------------------------------
describe('BonusPage – sektioner', () => {
  it('viser åbent spørgsmål med input og gem-knap', () => {
    useBonusQuestions.mockReturnValue({
      questions: [openTopScorer],
      loading: false,
      error: null,
    });
    useMyBonusBets.mockReturnValue({ bonusBets: new Map(), loading: false });
    renderPage();
    expect(screen.getByTestId('bonus-input')).toBeInTheDocument();
    expect(screen.getByTestId('bonus-save')).toBeInTheDocument();
  });

  it('viser låst spørgsmål uden gem-knap', () => {
    useBonusQuestions.mockReturnValue({
      questions: [lockedQuestion],
      loading: false,
      error: null,
    });
    useMyBonusBets.mockReturnValue({ bonusBets: new Map(), loading: false });
    renderPage();
    expect(screen.getByTestId('bonus-select')).toBeDisabled();
    expect(screen.queryByTestId('bonus-save')).not.toBeInTheDocument();
  });

  it('viser "Åbne spørgsmål" sektion-overskrift', () => {
    useBonusQuestions.mockReturnValue({
      questions: [openTopScorer],
      loading: false,
      error: null,
    });
    useMyBonusBets.mockReturnValue({ bonusBets: new Map(), loading: false });
    renderPage();
    expect(screen.getByText('Åbne spørgsmål')).toBeInTheDocument();
  });

  it('viser "Låste spørgsmål" sektion-overskrift', () => {
    useBonusQuestions.mockReturnValue({
      questions: [lockedQuestion],
      loading: false,
      error: null,
    });
    useMyBonusBets.mockReturnValue({ bonusBets: new Map(), loading: false });
    renderPage();
    expect(screen.getByText('Låste spørgsmål')).toBeInTheDocument();
  });

  it('viser begge sektioner (åbne og låste) når begge typer eksisterer', () => {
    useBonusQuestions.mockReturnValue({
      questions: [openTopScorer, lockedQuestion],
      loading: false,
      error: null,
    });
    useMyBonusBets.mockReturnValue({ bonusBets: new Map(), loading: false });
    renderPage();
    expect(screen.getByText('Åbne spørgsmål')).toBeInTheDocument();
    expect(screen.getByText('Låste spørgsmål')).toBeInTheDocument();
  });

  it('viser IKKE "Åbne spørgsmål" header hvis ingen åbne', () => {
    useBonusQuestions.mockReturnValue({
      questions: [lockedQuestion],
      loading: false,
      error: null,
    });
    useMyBonusBets.mockReturnValue({ bonusBets: new Map(), loading: false });
    renderPage();
    expect(screen.queryByText('Åbne spørgsmål')).not.toBeInTheDocument();
  });

  it('viser IKKE "Låste spørgsmål" header hvis ingen låste', () => {
    useBonusQuestions.mockReturnValue({
      questions: [openTopScorer],
      loading: false,
      error: null,
    });
    useMyBonusBets.mockReturnValue({ bonusBets: new Map(), loading: false });
    renderPage();
    expect(screen.queryByText('Låste spørgsmål')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Sortering af spørgsmål
// ---------------------------------------------------------------------------
describe('BonusPage – sortering', () => {
  it('sorterer topscorer øverst foran gruppevindere', () => {
    // useBonusQuestions returnerer dem i "forkert" rækkefølge
    const questions = [
      { ...openGroupWinnerA },
      { ...openTopScorer },
    ];
    useBonusQuestions.mockReturnValue({ questions, loading: false, error: null });
    useMyBonusBets.mockReturnValue({ bonusBets: new Map(), loading: false });
    renderPage();
    const bonusCards = screen.getAllByTestId('bonus-question');
    // Første kort bør have "⚽ Topscorer" tekst (topscorer er sorteret øverst)
    expect(bonusCards[0]).toHaveTextContent('Topscorer');
  });

  it('sorterer gruppevindere A→L inden for åbne spørgsmål', () => {
    const qA = { ...openGroupWinnerA, id: 'gw_A', groupName: 'A' };
    const qC = {
      id: 'gw_C',
      type: 'groupWinner',
      label: 'Hvem vinder gruppe C?',
      deadline: futureDeadline,
      groupName: 'C',
      facit: null,
      options: ['DK'],
    };
    const qB = {
      id: 'gw_B',
      type: 'groupWinner',
      label: 'Hvem vinder gruppe B?',
      deadline: futureDeadline,
      groupName: 'B',
      facit: null,
      options: ['GER'],
    };
    // Bevidst forkert rækkefølge: C, A, B
    useBonusQuestions.mockReturnValue({
      questions: [qC, qA, qB],
      loading: false,
      error: null,
    });
    useMyBonusBets.mockReturnValue({ bonusBets: new Map(), loading: false });
    renderPage();
    const bonusCards = screen.getAllByTestId('bonus-question');
    // Kort 0 = gruppe A, kort 1 = gruppe B, kort 2 = gruppe C
    expect(bonusCards[0]).toHaveTextContent('gruppe A');
    expect(bonusCards[1]).toHaveTextContent('gruppe B');
    expect(bonusCards[2]).toHaveTextContent('gruppe C');
  });
});

// ---------------------------------------------------------------------------
// Facit og points
// ---------------------------------------------------------------------------
describe('BonusPage – facit og point', () => {
  it('viser facit for afgjort spørgsmål', () => {
    // Brug GER som facit (GER er i teams.js → vises som "Tyskland")
    const lockedWithGER = { ...lockedQuestion, facit: 'GER', options: ['GER', 'FRA', 'BRA'] };
    useBonusQuestions.mockReturnValue({
      questions: [lockedWithGER],
      loading: false,
      error: null,
    });
    useMyBonusBets.mockReturnValue({ bonusBets: new Map(), loading: false });
    renderPage();
    // Facit "GER" vises som "Tyskland"
    const tysklandTexts = screen.getAllByText('Tyskland');
    expect(tysklandTexts.length).toBeGreaterThan(0);
  });

  it('viser optjente bonus-point for korrekt svar', () => {
    useBonusQuestions.mockReturnValue({
      questions: [lockedQuestion],
      loading: false,
      error: null,
    });
    const betsMap = new Map([
      ['q2', { questionId: 'q2', uid: 'user1', answer: 'DK', points: 10 }],
    ]);
    useMyBonusBets.mockReturnValue({ bonusBets: betsMap, loading: false });
    renderPage();
    expect(screen.getByText('+10 point')).toBeInTheDocument();
  });

  it('viser facit for afgjort topScorer', () => {
    useBonusQuestions.mockReturnValue({
      questions: [lockedTopScorer],
      loading: false,
      error: null,
    });
    useMyBonusBets.mockReturnValue({ bonusBets: new Map(), loading: false });
    renderPage();
    expect(screen.getByText('Haaland')).toBeInTheDocument();
  });

  it('kan IKKE svare på låst spørgsmål (input deaktiveret)', () => {
    useBonusQuestions.mockReturnValue({
      questions: [lockedQuestion],
      loading: false,
      error: null,
    });
    useMyBonusBets.mockReturnValue({ bonusBets: new Map(), loading: false });
    renderPage();
    const select = screen.getByTestId('bonus-select');
    expect(select).toBeDisabled();
  });

  it('summerer bonus-point fra flere spørgsmål', () => {
    useBonusQuestions.mockReturnValue({
      questions: [lockedQuestion, lockedTopScorer],
      loading: false,
      error: null,
    });
    const betsMap = new Map([
      ['q2', { questionId: 'q2', uid: 'user1', answer: 'DK', points: 10 }],
      ['q_top_locked', { questionId: 'q_top_locked', uid: 'user1', answer: 'Haaland', points: 10 }],
    ]);
    useMyBonusBets.mockReturnValue({ bonusBets: betsMap, loading: false });
    renderPage();
    expect(screen.getByTestId('total-bonus-points')).toHaveTextContent('20');
  });
});
