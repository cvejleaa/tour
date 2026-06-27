/**
 * Tests for LeagueBonus — besvarelse/visning af liga-bonusspørgsmål.
 * Firebase-handlinger mockes.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LeagueBonus from './LeagueBonus';
import { LEAGUE_BONUS_TYPE } from '../../lib/constants';

const mockCopyToAll = vi.fn(() => Promise.resolve({ created: 2, errors: [] }));
vi.mock('./leagueBonusActions', () => ({
  createLeagueBonus: vi.fn(),
  setLeagueBonusFacit: vi.fn(),
  deleteLeagueBonus: vi.fn(),
  saveLeagueBonusAnswer: vi.fn(),
  updateLeagueBonus: vi.fn(),
  approveLeagueBonusAnswer: vi.fn(),
  removeLeagueBonusAnswer: vi.fn(),
  copyLeagueBonusToLeagues: (...a) => mockCopyToAll(...a),
}));

const past = new Date(Date.now() - 3600_000);
const future = new Date(Date.now() + 3600_000);

const questions = [
  { id: 'q1', leagueId: 'L', type: LEAGUE_BONUS_TYPE.TEXT, label: 'Hvem vinder den samlede Tour?', deadline: future, facit: null },
  { id: 'q2', leagueId: 'L', type: LEAGUE_BONUS_TYPE.TEXT, label: 'Hvem vinder?', deadline: past, facit: 'Messi' },
];

function renderBonus(props = {}) {
  return render(
    <LeagueBonus
      leagueId="L" meUid="me" isManager={false}
      questions={questions} myAnswers={{ q2: 'Messi' }} answersByQid={{}}
      {...props}
    />,
  );
}

describe('LeagueBonus', () => {
  it('viser spørgsmål med Åben/Låst status', () => {
    renderBonus();
    expect(screen.getByText('Hvem vinder den samlede Tour?')).toBeInTheDocument();
    expect(screen.getByText('Åben')).toBeInTheDocument();
    expect(screen.getByText('Låst')).toBeInTheDocument();
  });

  it('viser "mangler at svare"-indikator for ubesvarede åbne spørgsmål', () => {
    renderBonus();
    expect(screen.getByText(/mangler at svare på 1/i)).toBeInTheDocument();
  });

  it('viser "Gem svar"-knap på åbne spørgsmål', () => {
    renderBonus();
    expect(screen.getByText('Gem svar')).toBeInTheDocument();
  });

  it('viser facit, dit svar og point på låst, afgjort spørgsmål', () => {
    renderBonus();
    expect(screen.getByText(/Facit:/)).toBeInTheDocument();
    expect(screen.getByText(/Dit svar:/)).toBeInTheDocument();
    expect(screen.getByText(/\+3 point/)).toBeInTheDocument(); // korrekt fritekst = 3
  });

  it('viser tom-tilstand uden spørgsmål', () => {
    renderBonus({ questions: [], myAnswers: {} });
    expect(screen.getByText(/Ingen bonusspørgsmål endnu/i)).toBeInTheDocument();
  });

  it('viser opret-knap for managere', () => {
    renderBonus({ isManager: true });
    expect(screen.getByText(/Nyt bonusspørgsmål/i)).toBeInTheDocument();
  });

  it('afslører alles svar på låst spørgsmål med navne', () => {
    renderBonus({
      answersByQid: { q2: [{ uid: 'me', answer: 'Messi' }, { uid: 'u2', answer: 'Ronaldo' }] },
      usersByUid: { me: { displayName: 'Mig' }, u2: { displayName: 'Uffe' } },
    });
    // Kun det låste spørgsmål (q2) har afslørings-knap
    const btns = screen.getAllByTestId('reveal-league-bonus-answers-btn');
    expect(btns).toHaveLength(1);
    fireEvent.click(btns[0]);
    expect(screen.getAllByTestId('league-bonus-answer-row')).toHaveLength(2);
    expect(screen.getByText('Uffe')).toBeInTheDocument();
  });

  it('manager kan afsløre svar også på åbne spørgsmål', () => {
    renderBonus({
      isManager: true,
      answersByQid: { q1: [{ uid: 'u2', answer: 'Pogačar' }] },
      usersByUid: { u2: { displayName: 'Uffe' } },
    });
    // Både åbent (q1) og låst (q2) har afslørings-knap for manager
    expect(screen.getAllByTestId('reveal-league-bonus-answers-btn')).toHaveLength(2);
  });

  it('NUMBER: den nærmeste i ligaen får point (relativ scoring)', () => {
    const numQ = [{
      id: 'qn', leagueId: 'L', type: LEAGUE_BONUS_TYPE.NUMBER,
      label: 'Hvor mange point vinder grøn trøje med?', deadline: past, facit: '311',
    }];
    renderBonus({
      questions: numQ,
      myAnswers: { qn: '320' }, // jeg tippede 320
      answersByQid: { qn: [{ uid: 'me', answer: '320' }, { uid: 'u2', answer: '300' }] },
      usersByUid: { me: { displayName: 'Mig' }, u2: { displayName: 'Uffe' } },
    });
    // 311 → 320 er 9 væk, 300 er 11 væk → jeg (me) er nærmest = 3 point.
    expect(screen.getByText(/\+3 point/)).toBeInTheDocument();
  });

  it('global admin ser "Kopiér til alle ligaer"-knap', async () => {
    renderBonus({
      isManager: true, isAdmin: true,
      allLeagues: [
        { id: 'L', status: 'approved' },
        { id: 'L2', status: 'approved' },
        { id: 'L3', status: 'approved' },
      ],
    });
    const btns = screen.getAllByTestId('copy-league-bonus-all');
    expect(btns.length).toBeGreaterThan(0);
    // 2 andre godkendte ligaer (L udeladt)
    expect(btns[0].textContent).toMatch(/\(2\)/);
  });
});
