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
    type: 'topScorer',
    label: 'Hvem bliver turneringens topscorer?',
    deadline: new Date('2099-01-01T00:00:00Z'), // langt i fremtiden = åben
    facit: null,
    options: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Åbne spørgsmål – fritekst (topScorer)
// ---------------------------------------------------------------------------
describe('BonusQuestion – åben fritekst (topScorer)', () => {
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
    fireEvent.change(screen.getByTestId('bonus-input'), { target: { value: 'Haaland' } });
    expect(screen.getByTestId('bonus-save')).not.toBeDisabled();
  });

  it('kalder setDoc ved klik på gem', async () => {
    render(<BonusQuestion question={makeQuestion()} uid="user1" existingBet={null} />);
    fireEvent.change(screen.getByTestId('bonus-input'), { target: { value: 'Messi' } });
    fireEvent.click(screen.getByTestId('bonus-save'));
    await waitFor(() => {
      expect(setDoc).toHaveBeenCalled();
    });
  });

  it('viser hjælpetekst med "Mbappé, Haaland eller Messi" for topScorer', () => {
    render(<BonusQuestion question={makeQuestion()} uid="user1" existingBet={null} />);
    expect(screen.getByText(/Mbappé/)).toBeInTheDocument();
    expect(screen.getByText(/Haaland/)).toBeInTheDocument();
  });

  it('viser "Åben" badge for ulåst spørgsmål', () => {
    render(<BonusQuestion question={makeQuestion()} uid="user1" existingBet={null} />);
    expect(screen.getByText('Åben')).toBeInTheDocument();
  });

  it('viser spørgsmålets label', () => {
    render(<BonusQuestion question={makeQuestion()} uid="user1" existingBet={null} />);
    expect(screen.getByText('Hvem bliver turneringens topscorer?')).toBeInTheDocument();
  });

  it('viser "⚽ Topscorer" badge for topScorer-type', () => {
    render(<BonusQuestion question={makeQuestion()} uid="user1" existingBet={null} />);
    expect(screen.getByText('⚽ Topscorer')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Åbne spørgsmål – select (groupWinner)
// ---------------------------------------------------------------------------
describe('BonusQuestion – åben select (groupWinner)', () => {
  it('viser select i stedet for input når options er sat', () => {
    const q = makeQuestion({
      type: 'groupWinner',
      options: ['DK', 'GER', 'FRA'],
    });
    render(<BonusQuestion question={q} uid="user1" existingBet={null} />);
    expect(screen.getByTestId('bonus-select')).toBeInTheDocument();
    expect(screen.queryByTestId('bonus-input')).not.toBeInTheDocument();
  });

  it('viser fulde holdnavne i options (GER = Tyskland, FRA = Frankrig)', () => {
    const q = makeQuestion({
      type: 'groupWinner',
      options: ['GER', 'FRA'],
    });
    render(<BonusQuestion question={q} uid="user1" existingBet={null} />);
    expect(screen.getByText('Tyskland')).toBeInTheDocument();
    expect(screen.getByText('Frankrig')).toBeInTheDocument();
  });

  it('viser "🏆 Gruppevinder" badge for groupWinner-type', () => {
    const q = makeQuestion({ type: 'groupWinner', options: ['DK'] });
    render(<BonusQuestion question={q} uid="user1" existingBet={null} />);
    expect(screen.getByText('🏆 Gruppevinder')).toBeInTheDocument();
  });

  it('viser placeholder "– Vælg hold –" som default option', () => {
    const q = makeQuestion({ type: 'groupWinner', options: ['DK', 'GER'] });
    render(<BonusQuestion question={q} uid="user1" existingBet={null} />);
    expect(screen.getByText('– Vælg hold –')).toBeInTheDocument();
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
      type: 'groupWinner',
      options: ['GER', 'FRA'],
    });
    render(<BonusQuestion question={q} uid="user1" existingBet={null} />);
    expect(screen.getByTestId('bonus-select')).toBeDisabled();
    expect(screen.queryByTestId('bonus-save')).not.toBeInTheDocument();
  });

  it('viser IKKE hjælpetekst for topScorer efter deadline', () => {
    const past = new Date('2000-01-01T00:00:00Z');
    const q = makeQuestion({ deadline: past, type: 'topScorer' });
    render(<BonusQuestion question={q} uid="user1" existingBet={null} />);
    expect(screen.queryByText(/Mbappé/)).not.toBeInTheDocument();
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
  it('viser facit og point når spørgsmålet er afgjort (topScorer)', () => {
    const q = makeQuestion({
      deadline: new Date('2000-01-01T00:00:00Z'),
      facit: 'Kylian Mbappé',
    });
    const bet = { answer: 'Kylian Mbappé', points: 10, questionId: 'q1' };
    render(<BonusQuestion question={q} uid="user1" existingBet={bet} />);
    expect(screen.getAllByText(/Kylian Mbappé/).length).toBeGreaterThan(0);
    expect(screen.getByText(/\+10 point/)).toBeInTheDocument();
  });

  it('viser "Facit:" label ved afgjort spørgsmål', () => {
    const q = makeQuestion({
      deadline: new Date('2000-01-01T00:00:00Z'),
      facit: 'Haaland',
    });
    render(<BonusQuestion question={q} uid="user1" existingBet={null} />);
    expect(screen.getByText(/Facit:/)).toBeInTheDocument();
  });

  it('viser 0 point for forkert svar', () => {
    const q = makeQuestion({
      deadline: new Date('2000-01-01T00:00:00Z'),
      facit: 'Haaland',
    });
    const bet = { answer: 'Ronaldo', points: 0, questionId: 'q1' };
    render(<BonusQuestion question={q} uid="user1" existingBet={bet} />);
    expect(screen.getByText('0 point')).toBeInTheDocument();
  });

  it('viser holdnavn (teamName) ved groupWinner-facit (GER = Tyskland)', () => {
    const q = makeQuestion({
      type: 'groupWinner',
      deadline: new Date('2000-01-01T00:00:00Z'),
      facit: 'GER',
      options: ['GER', 'FRA'],
    });
    render(<BonusQuestion question={q} uid="user1" existingBet={null} />);
    // Facit "GER" skal vises som "Tyskland"
    const tysklandTexts = screen.getAllByText('Tyskland');
    expect(tysklandTexts.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Brugerens eksisterende svar
// ---------------------------------------------------------------------------
describe('BonusQuestion – eksisterende svar', () => {
  it('viser brugerens eksisterende svar for åben topScorer', () => {
    const q = makeQuestion();
    const bet = { answer: 'Erling Haaland', questionId: 'q1' };
    render(<BonusQuestion question={q} uid="user1" existingBet={bet} />);
    expect(screen.getByText(/Erling Haaland/)).toBeInTheDocument();
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

  it('viser holdnavn for eksisterende groupWinner-svar (GER = Tyskland)', () => {
    const q = makeQuestion({
      type: 'groupWinner',
      options: ['GER', 'FRA'],
    });
    const bet = { answer: 'GER', questionId: 'q1' };
    render(<BonusQuestion question={q} uid="user1" existingBet={bet} />);
    // "Dit svar: Tyskland" bør vises
    expect(screen.getByText(/Dit svar:/)).toBeInTheDocument();
    const tysklandTexts = screen.getAllByText('Tyskland');
    expect(tysklandTexts.length).toBeGreaterThan(0);
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
