// Tests for BonusQuestion – sikrer at bonus-svar låses efter deadline.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock Firebase
vi.mock('../../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  setDoc: vi.fn(() => Promise.resolve()),
  serverTimestamp: vi.fn(() => 'SERVER_TS'),
}));

// Mock bonusHelpers for at kontrollere locked-tilstand
vi.mock('./bonusHelpers', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real };
});

import BonusQuestion from './BonusQuestion';
import { setDoc } from 'firebase/firestore';

// Hjælper: lav et mock-spørgsmål
function makeQuestion(overrides = {}) {
  return {
    id: 'q1',
    text: 'Hvilket hold vinder samlet?',
    points: 10,
    deadline: new Date('2099-01-01T00:00:00Z'), // langt i fremtiden = åben
    facit: null,
    options: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Åbne spørgsmål – fritekst (sæson-spørgsmål)
// ---------------------------------------------------------------------------
describe('BonusQuestion – åben fritekst', () => {
  it('viser input-felt og gem-knap når åben', () => {
    render(<BonusQuestion question={makeQuestion()} uid="user1" existingBet={null} />);
    expect(screen.getByTestId('bonus-input')).toBeInTheDocument();
    expect(screen.getByTestId('bonus-save')).toBeInTheDocument();
  });

  it('gem-knap er deaktiveret ved tomt input', () => {
    render(<BonusQuestion question={makeQuestion()} uid="user1" existingBet={null} />);
    expect(screen.getByTestId('bonus-save')).toBeDisabled();
  });

  it('gem-knap aktiveres efter brugeren skriver et svar', () => {
    render(<BonusQuestion question={makeQuestion()} uid="user1" existingBet={null} />);
    fireEvent.change(screen.getByTestId('bonus-input'), { target: { value: 'Visma' } });
    expect(screen.getByTestId('bonus-save')).not.toBeDisabled();
  });

  it('kalder setDoc ved klik på gem', async () => {
    render(<BonusQuestion question={makeQuestion()} uid="user1" existingBet={null} />);
    fireEvent.change(screen.getByTestId('bonus-input'), { target: { value: 'Visma' } });
    fireEvent.click(screen.getByTestId('bonus-save'));
    await waitFor(() => {
      expect(setDoc).toHaveBeenCalled();
    });
  });

  it('viser "Åben" badge for ulåst spørgsmål', () => {
    render(<BonusQuestion question={makeQuestion()} uid="user1" existingBet={null} />);
    expect(screen.getByText('Åben')).toBeInTheDocument();
  });

  it('viser spørgsmålets tekst', () => {
    render(<BonusQuestion question={makeQuestion()} uid="user1" existingBet={null} />);
    expect(screen.getByText('Hvilket hold vinder samlet?')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Åbne spørgsmål – select (hold-valg)
// ---------------------------------------------------------------------------
describe('BonusQuestion – åben select (hold)', () => {
  it('viser select i stedet for input når options er sat', () => {
    const q = makeQuestion({
      options: ['Visma', 'UAE', 'INEOS'],
    });
    render(<BonusQuestion question={q} uid="user1" existingBet={null} />);
    expect(screen.getByTestId('bonus-select')).toBeInTheDocument();
    expect(screen.queryByTestId('bonus-input')).not.toBeInTheDocument();
  });

  it('viser holdnavne i options', () => {
    const q = makeQuestion({
      options: ['Visma', 'UAE'],
    });
    render(<BonusQuestion question={q} uid="user1" existingBet={null} />);
    expect(screen.getByText('Visma')).toBeInTheDocument();
    expect(screen.getByText('UAE')).toBeInTheDocument();
  });

  it('viser placeholder "– Vælg hold –" som default option', () => {
    const q = makeQuestion({ options: ['Visma', 'UAE'] });
    render(<BonusQuestion question={q} uid="user1" existingBet={null} />);
    expect(screen.getByText('– Vælg hold –')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Svartyper – korrekt input pr. question.type
// ---------------------------------------------------------------------------
describe('BonusQuestion – svartyper', () => {
  it('text → tekst-input', () => {
    render(<BonusQuestion question={makeQuestion({ type: 'text' })} uid="u" existingBet={null} />);
    expect(screen.getByTestId('bonus-input').type).toBe('text');
  });

  it('number → tal-input', () => {
    render(<BonusQuestion question={makeQuestion({ type: 'number' })} uid="u" existingBet={null} />);
    expect(screen.getByTestId('bonus-input').type).toBe('number');
  });

  it('time → tekst-input med formathint', () => {
    render(<BonusQuestion question={makeQuestion({ type: 'time' })} uid="u" existingBet={null} />);
    const inp = screen.getByTestId('bonus-input');
    expect(inp.type).toBe('text');
    expect(inp.placeholder).toMatch(/1:23/);
  });

  it('boolean → Ja/Nej-dropdown', () => {
    render(<BonusQuestion question={makeQuestion({ type: 'boolean' })} uid="u" existingBet={null} />);
    expect(screen.getByTestId('bonus-select')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Ja' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Nej' })).toBeInTheDocument();
  });

  it('team → enkelt hold-dropdown', () => {
    render(<BonusQuestion question={makeQuestion({ type: 'team' })} uid="u" existingBet={null} />);
    expect(screen.getByTestId('bonus-select')).toBeInTheDocument();
  });

  it('teams → checkbox-liste (flere hold)', () => {
    render(<BonusQuestion question={makeQuestion({ type: 'teams' })} uid="u" existingBet={null} />);
    expect(screen.getByTestId('bonus-teams')).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(1);
  });

  it('teams → gem-knap deaktiveret indtil mindst ét hold valgt', () => {
    render(<BonusQuestion question={makeQuestion({ type: 'teams' })} uid="u" existingBet={null} />);
    expect(screen.getByTestId('bonus-save')).toBeDisabled();
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    expect(screen.getByTestId('bonus-save')).not.toBeDisabled();
  });

  it('teams → gemmer svaret som array', async () => {
    render(<BonusQuestion question={makeQuestion({ type: 'teams' })} uid="u" existingBet={null} />);
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    fireEvent.click(screen.getByTestId('bonus-save'));
    await waitFor(() => expect(setDoc).toHaveBeenCalled());
    const written = setDoc.mock.calls.at(-1)[1];
    expect(Array.isArray(written.answer)).toBe(true);
    expect(written.answer.length).toBe(1);
  });

  it('teams → viser eksisterende array-svar sammenkædet', () => {
    const q = makeQuestion({ type: 'teams', deadline: new Date('2000-01-01') });
    const bet = { answer: ['Visma', 'UAE'], questionId: 'q1' };
    render(<BonusQuestion question={q} uid="u" existingBet={bet} />);
    expect(screen.getByText(/Dit svar:/)).toBeInTheDocument();
    expect(screen.getByText(/Visma, UAE/)).toBeInTheDocument();
  });

  it('boolean → facit vises som "Ja"', () => {
    const q = makeQuestion({ type: 'boolean', deadline: new Date('2000-01-01'), facit: 'ja' });
    render(<BonusQuestion question={q} uid="u" existingBet={null} />);
    // Facit-boksen indeholder teksten "Facit: Ja".
    const facitLabel = screen.getByText(/Facit:/);
    expect(facitLabel.parentElement).toHaveTextContent(/Facit:\s*Ja/);
  });
});

// ---------------------------------------------------------------------------
// Låste spørgsmål (deadline i fortiden)
// ---------------------------------------------------------------------------
describe('BonusQuestion – låst', () => {
  it('deaktiverer svar-felt og skjuler gem-knap efter deadline (locked)', () => {
    const past = new Date('2000-01-01T00:00:00Z');
    const q = makeQuestion({ deadline: past });
    render(<BonusQuestion question={q} uid="user1" existingBet={null} />);
    expect(screen.getByTestId('bonus-input')).toBeDisabled();
    expect(screen.queryByTestId('bonus-save')).not.toBeInTheDocument();
  });

  it('viser "Låst"-badge efter deadline', () => {
    const past = new Date('2000-01-01T00:00:00Z');
    const q = makeQuestion({ deadline: past });
    render(<BonusQuestion question={q} uid="user1" existingBet={null} />);
    expect(screen.getByText('Låst')).toBeInTheDocument();
  });

  it('deaktiverer select-felt efter deadline', () => {
    const past = new Date('2000-01-01T00:00:00Z');
    const q = makeQuestion({
      deadline: past,
      type: 'teamChoice',
      options: ['GER', 'FRA'],
    });
    render(<BonusQuestion question={q} uid="user1" existingBet={null} />);
    expect(screen.getByTestId('bonus-select')).toBeDisabled();
    expect(screen.queryByTestId('bonus-save')).not.toBeInTheDocument();
  });

  it('viser IKKE hjælpetekst for fri tekst efter deadline', () => {
    const past = new Date('2000-01-01T00:00:00Z');
    const q = makeQuestion({ deadline: past, type: 'text' });
    render(<BonusQuestion question={q} uid="user1" existingBet={null} />);
    expect(screen.queryByText(/Vingegaard/)).not.toBeInTheDocument();
  });

  it('viser IKKE "Åben" badge for låst spørgsmål', () => {
    const past = new Date('2000-01-01T00:00:00Z');
    const q = makeQuestion({ deadline: past });
    render(<BonusQuestion question={q} uid="user1" existingBet={null} />);
    expect(screen.queryByText('Åben')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Facit og point (afgjort spørgsmål)
// ---------------------------------------------------------------------------
describe('BonusQuestion – facit og point', () => {
  it('viser facit og point når spørgsmålet er afgjort (fri tekst)', () => {
    const q = makeQuestion({
      deadline: new Date('2000-01-01T00:00:00Z'),
      facit: 'Jonas Vingegaard',
    });
    const bet = { answer: 'Jonas Vingegaard', points: 10, questionId: 'q1' };
    render(<BonusQuestion question={q} uid="user1" existingBet={bet} />);
    expect(screen.getAllByText(/Jonas Vingegaard/).length).toBeGreaterThan(0);
    expect(screen.getByText(/\+10 point/)).toBeInTheDocument();
  });

  it('viser "Facit:" label ved afgjort spørgsmål', () => {
    const q = makeQuestion({
      deadline: new Date('2000-01-01T00:00:00Z'),
      facit: 'Pogačar',
    });
    render(<BonusQuestion question={q} uid="user1" existingBet={null} />);
    expect(screen.getByText(/Facit:/)).toBeInTheDocument();
  });

  it('viser 0 point for forkert svar', () => {
    const q = makeQuestion({
      deadline: new Date('2000-01-01T00:00:00Z'),
      facit: 'Pogačar',
    });
    const bet = { answer: 'Ronaldo', points: 0, questionId: 'q1' };
    render(<BonusQuestion question={q} uid="user1" existingBet={bet} />);
    expect(screen.getByText('0 point')).toBeInTheDocument();
  });

  it('viser holdnavn ved hold-facit (select)', () => {
    const q = makeQuestion({
      deadline: new Date('2000-01-01T00:00:00Z'),
      facit: 'Visma',
      options: ['Visma', 'UAE'],
    });
    render(<BonusQuestion question={q} uid="user1" existingBet={null} />);
    expect(screen.getAllByText('Visma').length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Brugerens eksisterende svar
// ---------------------------------------------------------------------------
describe('BonusQuestion – eksisterende svar', () => {
  it('viser brugerens eksisterende svar for åbent fri-tekst-spørgsmål', () => {
    const q = makeQuestion();
    const bet = { answer: 'Tadej Pogačar', questionId: 'q1' };
    render(<BonusQuestion question={q} uid="user1" existingBet={bet} />);
    expect(screen.getByText(/Tadej Pogačar/)).toBeInTheDocument();
  });

  it('viser "Dit svar:" label for bruger med svar', () => {
    const q = makeQuestion();
    const bet = { answer: 'Messi', questionId: 'q1' };
    render(<BonusQuestion question={q} uid="user1" existingBet={bet} />);
    expect(screen.getByText(/Dit svar:/)).toBeInTheDocument();
  });

  it('forhindrer IKKE gem hvis låst (input deaktiveret men klik på save er skjult)', () => {
    const past = new Date('2000-01-01T00:00:00Z');
    const q = makeQuestion({ deadline: past });
    render(<BonusQuestion question={q} uid="user1" existingBet={null} />);
    expect(screen.queryByTestId('bonus-save')).not.toBeInTheDocument();
  });

  it('udfylder input med eksisterende svar', () => {
    const q = makeQuestion();
    const bet = { answer: 'Ronaldo', questionId: 'q1' };
    render(<BonusQuestion question={q} uid="user1" existingBet={bet} />);
    expect(screen.getByTestId('bonus-input').value).toBe('Ronaldo');
  });

  it('viser holdnavn for eksisterende hold-svar (select)', () => {
    const q = makeQuestion({
      options: ['Visma', 'UAE'],
    });
    const bet = { answer: 'Visma', questionId: 'q1' };
    render(<BonusQuestion question={q} uid="user1" existingBet={bet} />);
    expect(screen.getByText(/Dit svar:/)).toBeInTheDocument();
    expect(screen.getAllByText('Visma').length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Feedback og fejlhåndtering
// ---------------------------------------------------------------------------
describe('BonusQuestion – feedback', () => {
  it('viser "Gemmer…" tekst mens gem pågår (simuleret)', async () => {
    let resolveSetDoc;
    const { setDoc: mockSetDoc } = await import('firebase/firestore');
    mockSetDoc.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSetDoc = resolve;
        }),
    );

    render(<BonusQuestion question={makeQuestion()} uid="user1" existingBet={null} />);
    fireEvent.change(screen.getByTestId('bonus-input'), { target: { value: 'Test' } });
    fireEvent.click(screen.getByTestId('bonus-save'));

    // Mens promise er pending
    await waitFor(() => {
      expect(screen.queryByText('Gemmer…')).toBeInTheDocument();
    });

    resolveSetDoc();
  });

  it('viser point-info tekst for åbent uafgjort spørgsmål', () => {
    render(<BonusQuestion question={makeQuestion()} uid="user1" existingBet={null} />);
    expect(screen.getByText(/10 point/)).toBeInTheDocument();
  });
});
