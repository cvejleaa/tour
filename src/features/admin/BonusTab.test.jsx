// Tests for BonusTab — sætter facit, spørgsmål sorteret, dropdown/fritekst, BonusSubmissions.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ─── Mock Firebase ────────────────────────────────────────────────────────────
vi.mock('../../firebase', () => ({
  db: {},
}));

const mockOnSnapshot = vi.fn();

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  onSnapshot: (...args) => mockOnSnapshot(...args),
  orderBy: vi.fn(),
  query: vi.fn(),
  doc: vi.fn(() => ({ id: 'doc-ref' })),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  arrayUnion: vi.fn((v) => ({ _arrayUnion: v })),
  arrayRemove: vi.fn((v) => ({ _arrayRemove: v })),
  where: vi.fn(),
}));

// ─── Mock adminActions ────────────────────────────────────────────────────────
const mockSaveBonusFacit = vi.fn();

vi.mock('./adminActions', () => ({
  saveBonusFacit: (...args) => mockSaveBonusFacit(...args),
  createBonusQuestion: vi.fn().mockResolvedValue(undefined),
  formatTimestamp: vi.fn(() => '11.06.2026 18:00'),
}));

import BonusTab from './BonusTab';

// Hjælper: setup to separate onSnapshot-kald:
// første: bonusSpørgsmål, andet: bonusBets (for BonusSubmissions)
function setupQuestions(questions) {
  let callCount = 0;
  mockOnSnapshot.mockImplementation((q, cb) => {
    callCount++;
    if (callCount === 1) {
      // Bonus-spørgsmål
      cb({
        docs: questions.map((q2) => ({ id: q2.id, data: () => ({ ...q2 }) })),
      });
    } else {
      // BonusBets — tomt for fri-tekst-spørgsmål
      cb({ docs: [], forEach: vi.fn() });
    }
    return vi.fn();
  });
}

const textQuestion = {
  id: 'q1',
  label: 'Hvem vinder den samlede Tour?',
  type: 'text',
  facit: null,
  deadline: { toDate: () => new Date('2026-06-11') },
  options: [],
  acceptedAnswers: [],
};

const teamChoiceQuestion = {
  id: 'q2',
  label: 'Hvilket hold vinder holdkonkurrencen?',
  type: 'teamChoice',
    facit: null,
  deadline: { toDate: () => new Date('2026-06-11') },
  options: ['TVL', 'UAD', 'SOQ'],
  acceptedAnswers: [],
};

describe('BonusTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.confirm = vi.fn(() => true);
    mockSaveBonusFacit.mockResolvedValue(undefined);
    // Standard: tomt snapshot
    mockOnSnapshot.mockImplementation((q, cb) => {
      cb({ docs: [], forEach: vi.fn() });
      return vi.fn();
    });
  });

  // ─── Loading ──────────────────────────────────────────────────────────────

  it('viser indlæsningsbesked under hentning', () => {
    mockOnSnapshot.mockImplementation(() => vi.fn());
    render(<BonusTab />);
    expect(screen.getByText(/Henter bonusspørgsmål/i)).toBeInTheDocument();
  });

  // ─── Tom liste ────────────────────────────────────────────────────────────

  it('viser besked om ingen bonusspørgsmål', () => {
    render(<BonusTab />);
    expect(screen.getByText(/Ingen bonusspørgsmål/i)).toBeInTheDocument();
  });

  // ─── Spørgsmål-liste ──────────────────────────────────────────────────────

  it('viser spørgsmålets tekst', () => {
    setupQuestions([textQuestion]);
    render(<BonusTab />);
    expect(screen.getByText(/Hvem vinder den samlede Tour/i)).toBeInTheDocument();
  });

  it('viser spørgsmålets point', () => {
    setupQuestions([{ ...textQuestion, points: 7 }]);
    render(<BonusTab />);
    expect(screen.getByText(/7 point/i)).toBeInTheDocument();
  });

  it('viser Ikke sat når facit er null', () => {
    setupQuestions([textQuestion]);
    render(<BonusTab />);
    expect(screen.getByText(/Ikke sat/i)).toBeInTheDocument();
  });

  it('viser sat facit med grøn farve', () => {
    setupQuestions([{ ...textQuestion, facit: 'Vingegaard' }]);
    render(<BonusTab />);
    expect(screen.getByText('Vingegaard')).toBeInTheDocument();
  });

  it('sorterer spørgsmål efter deadline (tidligst først)', () => {
    const tidlig = { ...textQuestion, id: 'tidlig', label: 'Tidligt', deadline: { toDate: () => new Date('2026-07-01') } };
    const sen = { ...teamChoiceQuestion, id: 'sen', label: 'Sent', deadline: { toDate: () => new Date('2026-07-20') } };
    setupQuestions([sen, tidlig]);
    render(<BonusTab />);
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Tidligt');
  });

  it('viser Sæt facit-knap for hvert spørgsmål', () => {
    setupQuestions([textQuestion]);
    render(<BonusTab />);
    expect(screen.getByRole('button', { name: /Sæt facit/i })).toBeInTheDocument();
  });

  // ─── Rediger facit ────────────────────────────────────────────────────────

  it('åbner redigeringsformular ved klik på Sæt facit', () => {
    setupQuestions([textQuestion]);
    render(<BonusTab />);
    fireEvent.click(screen.getByRole('button', { name: /Sæt facit/i }));
    // Editorens fritekst-facit-input (type 'text').
    expect(screen.getByTestId('facit-text')).toBeInTheDocument();
  });

  it('viser fritekst-input for fri tekst (ingen options)', () => {
    setupQuestions([textQuestion]);
    render(<BonusTab />);
    fireEvent.click(screen.getByRole('button', { name: /Sæt facit/i }));
    expect(screen.getByTestId('facit-text')).toBeInTheDocument();
    // Ingen options → ingen options-dropdown i editoren.
    expect(screen.queryByRole('option', { name: 'TVL' })).not.toBeInTheDocument();
  });

  it('viser dropdown for holdvalg (med options)', () => {
    setupQuestions([teamChoiceQuestion]);
    render(<BonusTab />);
    fireEvent.click(screen.getByRole('button', { name: /Sæt facit/i }));
    // Legacy options-spørgsmål → dropdown med de eksplicitte options.
    expect(screen.getByRole('option', { name: 'TVL' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'UAD' })).toBeInTheDocument();
  });

  it('viser fejl ved tomt facit', async () => {
    setupQuestions([textQuestion]);
    render(<BonusTab />);
    fireEvent.click(screen.getByRole('button', { name: /Sæt facit/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Gem$/ }));

    await waitFor(() => {
      expect(screen.getByText(/Facit må ikke være tomt/i)).toBeInTheDocument();
    });
  });

  it('kalder saveBonusFacit med korrekte argumenter', async () => {
    setupQuestions([textQuestion]);
    render(<BonusTab />);
    fireEvent.click(screen.getByRole('button', { name: /Sæt facit/i }));
    fireEvent.change(screen.getByTestId('facit-text'), { target: { value: 'Pogačar' } });
    fireEvent.click(screen.getByRole('button', { name: /^Gem$/ }));

    await waitFor(() => {
      expect(mockSaveBonusFacit).toHaveBeenCalledWith('q1', 'Pogačar');
    });
  });

  it('viser Gemt!-besked efter succesfuldt gem', async () => {
    setupQuestions([textQuestion]);
    render(<BonusTab />);
    fireEvent.click(screen.getByRole('button', { name: /Sæt facit/i }));
    fireEvent.change(screen.getByTestId('facit-text'), { target: { value: 'Pogačar' } });
    fireEvent.click(screen.getByRole('button', { name: /^Gem$/ }));

    await waitFor(() => {
      expect(screen.getByText('Gemt!')).toBeInTheDocument();
    });
  });

  it('kalder IKKE saveBonusFacit når bekræftelse afvises', async () => {
    window.confirm = vi.fn(() => false);
    setupQuestions([textQuestion]);
    render(<BonusTab />);
    fireEvent.click(screen.getByRole('button', { name: /Sæt facit/i }));
    fireEvent.change(screen.getByTestId('facit-text'), { target: { value: 'Pogačar' } });
    fireEvent.click(screen.getByRole('button', { name: /^Gem$/ }));

    await waitFor(() => {
      expect(mockSaveBonusFacit).not.toHaveBeenCalled();
    });
  });

  it('lukker redigering via Annuller', () => {
    setupQuestions([textQuestion]);
    render(<BonusTab />);
    fireEvent.click(screen.getByRole('button', { name: /Sæt facit/i }));
    fireEvent.click(screen.getByRole('button', { name: /Annuller/i }));
    // Editorens facit-input forsvinder (opret-formularens input findes stadig).
    expect(screen.queryByTestId('facit-text')).not.toBeInTheDocument();
  });

  it('viser opret-formular til nye bonusspørgsmål', () => {
    setupQuestions([textQuestion]);
    render(<BonusTab />);
    expect(screen.getByText(/Opret bonusspørgsmål/i)).toBeInTheDocument();
    expect(screen.getByTestId('bonus-new-save')).toBeInTheDocument();
  });

  // ─── Type-vælger + type-passende facit i opret-formular ─────────────────────

  it('viser type-vælger med alle 6 typer', () => {
    render(<BonusTab />);
    expect(screen.getByTestId('bonus-new-type')).toBeInTheDocument();
    for (const label of ['Fritekst', 'Hold (vælg ét)', 'Hold (vælg flere)', 'Tal', 'Tidsangivelse', 'Ja/nej']) {
      expect(screen.getByRole('option', { name: label })).toBeInTheDocument();
    }
  });

  it('skifter facit-input til tal ved type number', () => {
    render(<BonusTab />);
    fireEvent.change(screen.getByTestId('bonus-new-type'), { target: { value: 'number' } });
    expect(screen.getByTestId('bonus-new-facit-number')).toBeInTheDocument();
  });

  it('skifter facit-input til Ja/Nej ved type boolean', () => {
    render(<BonusTab />);
    fireEvent.change(screen.getByTestId('bonus-new-type'), { target: { value: 'boolean' } });
    expect(screen.getByTestId('bonus-new-facit-boolean')).toBeInTheDocument();
  });

  it('skifter facit-input til hold-dropdown ved type team', () => {
    render(<BonusTab />);
    fireEvent.change(screen.getByTestId('bonus-new-type'), { target: { value: 'team' } });
    expect(screen.getByTestId('bonus-new-facit-team')).toBeInTheDocument();
  });

  it('skifter facit-input til hold-checkboxliste ved type teams', () => {
    render(<BonusTab />);
    fireEvent.change(screen.getByTestId('bonus-new-type'), { target: { value: 'teams' } });
    expect(screen.getByTestId('bonus-new-facit-teams')).toBeInTheDocument();
  });

  it('time-facit-input bruger tekst med formathint', () => {
    render(<BonusTab />);
    fireEvent.change(screen.getByTestId('bonus-new-type'), { target: { value: 'time' } });
    expect(screen.getByTestId('bonus-new-facit-text').placeholder).toMatch(/1:23/);
  });

  it('opretter spørgsmål med type og facit', async () => {
    const { createBonusQuestion } = await import('./adminActions');
    render(<BonusTab />);
    fireEvent.change(screen.getByTestId('bonus-new-text'), { target: { value: 'Vinder Pogačar?' } });
    fireEvent.change(screen.getByTestId('bonus-new-type'), { target: { value: 'boolean' } });
    fireEvent.change(screen.getByTestId('bonus-new-facit-boolean'), { target: { value: 'ja' } });
    fireEvent.click(screen.getByTestId('bonus-new-save'));
    await waitFor(() => {
      expect(createBonusQuestion).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'Vinder Pogačar?', type: 'boolean', facit: 'ja' }),
      );
    });
  });

  // ─── Fejlhåndtering ───────────────────────────────────────────────────────

  it('viser fejlbesked ved snapshot-fejl', () => {
    mockOnSnapshot.mockImplementation((q, onNext, onError) => {
      onError(new Error('Permission denied'));
      return vi.fn();
    });
    render(<BonusTab />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
