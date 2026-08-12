// ---------------------------------------------------------------------------
// LeagueQuestions — svartypen 'team' ("Hold"): svar og facit vælges blandt
// SPILLETS hold i stedet for fritekst.
//
// De tre fælder, testene her holder lukket:
//   1. Gaten skal tjekke RÅ game.teams — teamsOf falder tilbage på
//      Superligaens holdliste, så et spil uden hold ville få 12 danske
//      klubber i dropdown'en.
//   2. Visningsnavnet skal læses ALLE steder, svaret vises (dropdown-label,
//      "Dit svar", svar-badges, facit) — jf. visningsnavnFlader.test.jsx, og
//      med et navn der FAKTISK ændrer sig, ellers består testen også når
//      `vis` er tabt.
//   3. Værdien, der gemmes, er det KANONISKE navn — det er join-nøglen.
// ---------------------------------------------------------------------------
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mockSaveAnswer = vi.fn().mockResolvedValue({ ok: true });
vi.mock('./gameLeagueActions', () => ({
  createLeagueQuestion: vi.fn().mockResolvedValue({ ok: true }),
  setLeagueQuestionFacit: vi.fn().mockResolvedValue({ ok: true }),
  deleteLeagueQuestion: vi.fn().mockResolvedValue({ ok: true }),
  saveLeagueQuestionAnswer: (...a) => mockSaveAnswer(...a),
  LEAGUE_Q_LABEL_MAX: 120,
}));

import LeagueQuestions from './LeagueQuestions';

// teamStyles-visningsnavnet ("Wolverhampton…" → "Wolves") rammer den gren,
// hvor vis ≠ name — en assertion på et hold med vis === name beviser intet.
const PL_GAME = {
  id: 'pl',
  teams: [
    { name: 'Arsenal', short: 'ARS' },
    { name: 'Wolverhampton Wanderers', short: 'WOL' },
  ],
  teamStyles: { 'Wolverhampton Wanderers': { visningsnavn: 'Wolves' } },
};
const CYKELSPIL = { id: 'tour' }; // ingen teams — og må ALDRIG arve Superligaens

const BASE = {
  gameId: 'pl', leagueId: 'L1', meUid: 'me', byUid: { me: { name: 'Mig' }, andet: { name: 'Anden' } },
};

function renderQ({ game = PL_GAME, isOwner = false, questions = [], answersByQid = {} }) {
  return render(
    <LeagueQuestions {...BASE} game={game} isOwner={isOwner} questions={questions} answersByQid={answersByQid} />,
  );
}

const teamQ = (over = {}) => ({ id: 'q1', label: 'Hvem vinder ligaen?', type: 'team', points: 10, deadline: null, ...over });

describe('LeagueQuestions — typen "Hold" i opret-formularen', () => {
  it('tilbydes i et spil MED hold', () => {
    renderQ({ isOwner: true });
    fireEvent.click(screen.getByText('+ Nyt spørgsmål'));
    expect(screen.getByRole('option', { name: 'Hold (vælg fra listen)' })).toBeInTheDocument();
  });

  it('tilbydes IKKE i et spil uden hold — og arver aldrig Superligaens liste', () => {
    renderQ({ game: CYKELSPIL, isOwner: true });
    fireEvent.click(screen.getByText('+ Nyt spørgsmål'));
    expect(screen.queryByRole('option', { name: 'Hold (vælg fra listen)' })).toBeNull();
    // Fallback-fælden: ingen dansk klub må sive ind fra teamsOf's default.
    expect(screen.queryByRole('option', { name: /Brøndby|København/ })).toBeNull();
  });
});

describe('LeagueQuestions — svar på et hold-spørgsmål', () => {
  it('svaret vælges i en dropdown: visningsnavn som label, kanonisk navn som værdi', () => {
    renderQ({ questions: [teamQ()] });
    const select = screen.getByLabelText('Dit svar');
    const labels = [...select.querySelectorAll('option')].map((o) => o.textContent);
    expect(labels).toContain('Wolves'); // teamStyles-visningsnavnet, IKKE det lange
    expect(labels).not.toContain('Wolverhampton Wanderers');
    fireEvent.change(select, { target: { value: 'Wolverhampton Wanderers' } });
    fireEvent.click(screen.getByRole('button', { name: 'Svar' }));
    // Gemt værdi er den KANONISKE — join-nøglen i hele appen.
    expect(mockSaveAnswer).toHaveBeenCalledWith(expect.objectContaining({ answer: 'Wolverhampton Wanderers' }));
  });

  it('gemte svar og facit VISES med visningsnavn — aldrig det rå kanoniske', () => {
    renderQ({
      questions: [teamQ({ deadline: 1, facit: 'Wolverhampton Wanderers' })], // deadline for længst passeret
      answersByQid: { q1: [{ uid: 'andet', answer: 'Wolverhampton Wanderers' }] },
    });
    // Badge + facit-linjen: "Wolves", og det lange navn optræder INGEN steder.
    expect(screen.getByText(/Anden: Wolves/)).toBeInTheDocument();
    expect(screen.getByText('Wolves', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.queryByText(/Wolverhampton Wanderers/)).toBeNull();
  });

  it('falder tilbage til tekst-input, hvis holdlisten er væk — aldrig en tom dropdown', () => {
    renderQ({ game: CYKELSPIL, questions: [teamQ()] });
    expect(screen.getByPlaceholderText('Dit svar')).toBeInTheDocument();
    expect(screen.queryByLabelText('Dit svar')).toBeNull(); // ingen select
  });
});

describe('LeagueQuestions — ejerens facit på et hold-spørgsmål', () => {
  it('facit vælges i samme dropdown, og "Også godkendt" vises ikke', () => {
    renderQ({ isOwner: true, questions: [teamQ()] });
    const facit = screen.getByLabelText('Facit');
    expect(facit.tagName).toBe('SELECT');
    expect([...facit.querySelectorAll('option')].map((o) => o.textContent)).toContain('Wolves');
    // acceptedAnswers er fritekstens sikkerhedsnet — overflødigt og
    // forvirrende, når svaret ikke kan staves forkert.
    expect(screen.queryByPlaceholderText('Også godkendt (komma-adskilt)')).toBeNull();
  });
});
