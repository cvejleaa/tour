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
    expect(screen.getByPlaceholderText(/Facit/i)).toBeInTheDocument();
  });

  it('viser fritekst-input for fri tekst (ingen options)', () => {
    setupQuestions([textQuestion]);
    render(<BonusTab />);
    fireEvent.click(screen.getByRole('button', { name: /Sæt facit/i }));
    expect(screen.getByPlaceholderText(/Facit/i)).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('viser dropdown for holdvalg (med options)', () => {
    setupQuestions([teamChoiceQuestion]);
    render(<BonusTab />);
    fireEvent.click(screen.getByRole('button', { name: /Sæt facit/i }));
    expect(screen.getByRole('combobox')).toBeInTheDocument();
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
    fireEvent.change(screen.getByPlaceholderText(/Facit/i), { target: { value: 'Pogačar' } });
    fireEvent.click(screen.getByRole('button', { name: /^Gem$/ }));

    await waitFor(() => {
      expect(mockSaveBonusFacit).toHaveBeenCalledWith('q1', 'Pogačar');
    });
  });

  it('viser Gemt!-besked efter succesfuldt gem', async () => {
    setupQuestions([textQuestion]);
    render(<BonusTab />);
    fireEvent.click(screen.getByRole('button', { name: /Sæt facit/i }));
    fireEvent.change(screen.getByPlaceholderText(/Facit/i), { target: { value: 'Pogačar' } });
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
    fireEvent.change(screen.getByPlaceholderText(/Facit/i), { target: { value: 'Pogačar' } });
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
    expect(screen.queryByPlaceholderText(/Facit/i)).not.toBeInTheDocument();
  });

  it('viser opret-formular til nye bonusspørgsmål', () => {
    setupQuestions([textQuestion]);
    render(<BonusTab />);
    expect(screen.getByText(/Opret bonusspørgsmål/i)).toBeInTheDocument();
    expect(screen.getByTestId('bonus-new-save')).toBeInTheDocument();
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
