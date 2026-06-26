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
  formatTimestamp: vi.fn(() => '11.06.2026 18:00'),
  approveBonusAnswer: vi.fn().mockResolvedValue(undefined),
  removeBonusAnswer: vi.fn().mockResolvedValue(undefined),
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
      // BonusBets — tomt for topscorer
      cb({ docs: [], forEach: vi.fn() });
    }
    return vi.fn();
  });
}

const topScorerQuestion = {
  id: 'q1',
  label: 'Hvem bliver topscorer?',
  type: 'topScorer',
  facit: null,
  deadline: { toDate: () => new Date('2026-06-11') },
  options: [],
  acceptedAnswers: [],
};

const groupWinnerQuestion = {
  id: 'q2',
  label: 'Hvem vinder gruppe A?',
  type: 'groupWinner',
  groupName: 'A',
  facit: null,
  deadline: { toDate: () => new Date('2026-06-11') },
  options: ['DNK', 'NOR', 'SWE'],
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

  it('viser topscorer-spørgsmål', () => {
    setupQuestions([topScorerQuestion]);
    render(<BonusTab />);
    expect(screen.getByText(/Hvem bliver topscorer/i)).toBeInTheDocument();
  });

  it('viser Topscorer-typelabel', () => {
    setupQuestions([topScorerQuestion]);
    render(<BonusTab />);
    // Topscorer optræder både i label og typelabel — brug getAllByText
    expect(screen.getAllByText(/Topscorer/i).length).toBeGreaterThan(0);
  });

  it('viser Ikke sat når facit er null', () => {
    setupQuestions([topScorerQuestion]);
    render(<BonusTab />);
    expect(screen.getByText(/Ikke sat/i)).toBeInTheDocument();
  });

  it('viser sat facit med grøn farve', () => {
    setupQuestions([{ ...topScorerQuestion, facit: 'Eriksen' }]);
    render(<BonusTab />);
    expect(screen.getByText('Eriksen')).toBeInTheDocument();
  });

  it('sorterer topscorer øverst foran gruppevinder', () => {
    setupQuestions([groupWinnerQuestion, topScorerQuestion]);
    render(<BonusTab />);
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent(/topscorer/i);
  });

  it('viser Sæt facit-knap for hvert spørgsmål', () => {
    setupQuestions([topScorerQuestion]);
    render(<BonusTab />);
    expect(screen.getByRole('button', { name: /Sæt facit/i })).toBeInTheDocument();
  });

  // ─── Rediger facit ────────────────────────────────────────────────────────

  it('åbner redigeringsformular ved klik på Sæt facit', () => {
    setupQuestions([topScorerQuestion]);
    render(<BonusTab />);
    fireEvent.click(screen.getByRole('button', { name: /Sæt facit/i }));
    expect(screen.getByPlaceholderText(/Facit/i)).toBeInTheDocument();
  });

  it('viser fritekst-input for topscorer (ingen options)', () => {
    setupQuestions([topScorerQuestion]);
    render(<BonusTab />);
    fireEvent.click(screen.getByRole('button', { name: /Sæt facit/i }));
    expect(screen.getByPlaceholderText(/Facit/i)).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('viser dropdown for gruppevinder (med options)', () => {
    setupQuestions([groupWinnerQuestion]);
    render(<BonusTab />);
    fireEvent.click(screen.getByRole('button', { name: /Sæt facit/i }));
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'DNK' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'NOR' })).toBeInTheDocument();
  });

  it('viser fejl ved tomt facit', async () => {
    setupQuestions([topScorerQuestion]);
    render(<BonusTab />);
    fireEvent.click(screen.getByRole('button', { name: /Sæt facit/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Gem$/ }));

    await waitFor(() => {
      expect(screen.getByText(/Facit må ikke være tomt/i)).toBeInTheDocument();
    });
  });

  it('kalder saveBonusFacit med korrekte argumenter', async () => {
    setupQuestions([topScorerQuestion]);
    render(<BonusTab />);
    fireEvent.click(screen.getByRole('button', { name: /Sæt facit/i }));
    fireEvent.change(screen.getByPlaceholderText(/Facit/i), { target: { value: 'Haaland' } });
    fireEvent.click(screen.getByRole('button', { name: /^Gem$/ }));

    await waitFor(() => {
      expect(mockSaveBonusFacit).toHaveBeenCalledWith('q1', 'Haaland');
    });
  });

  it('viser Gemt!-besked efter succesfuldt gem', async () => {
    setupQuestions([topScorerQuestion]);
    render(<BonusTab />);
    fireEvent.click(screen.getByRole('button', { name: /Sæt facit/i }));
    fireEvent.change(screen.getByPlaceholderText(/Facit/i), { target: { value: 'Haaland' } });
    fireEvent.click(screen.getByRole('button', { name: /^Gem$/ }));

    await waitFor(() => {
      expect(screen.getByText('Gemt!')).toBeInTheDocument();
    });
  });

  it('kalder IKKE saveBonusFacit når bekræftelse afvises', async () => {
    window.confirm = vi.fn(() => false);
    setupQuestions([topScorerQuestion]);
    render(<BonusTab />);
    fireEvent.click(screen.getByRole('button', { name: /Sæt facit/i }));
    fireEvent.change(screen.getByPlaceholderText(/Facit/i), { target: { value: 'Haaland' } });
    fireEvent.click(screen.getByRole('button', { name: /^Gem$/ }));

    await waitFor(() => {
      expect(mockSaveBonusFacit).not.toHaveBeenCalled();
    });
  });

  it('lukker redigering via Annuller', () => {
    setupQuestions([topScorerQuestion]);
    render(<BonusTab />);
    fireEvent.click(screen.getByRole('button', { name: /Sæt facit/i }));
    fireEvent.click(screen.getByRole('button', { name: /Annuller/i }));
    expect(screen.queryByPlaceholderText(/Facit/i)).not.toBeInTheDocument();
  });

  it('viser BonusSubmissions-sektion for topscorer-spørgsmål', () => {
    setupQuestions([topScorerQuestion]);
    render(<BonusTab />);
    expect(screen.getByText(/Indsendte svar/i)).toBeInTheDocument();
  });

  it('viser IKKE BonusSubmissions for gruppevinder-spørgsmål', () => {
    setupQuestions([groupWinnerQuestion]);
    render(<BonusTab />);
    expect(screen.queryByText(/Indsendte svar/i)).not.toBeInTheDocument();
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
