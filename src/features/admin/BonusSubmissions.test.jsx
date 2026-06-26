// Tests for BonusSubmissions — indsendte svar, Godkend/Fjern, Tæller-badge.
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
  query: vi.fn(),
  where: vi.fn(),
  doc: vi.fn(() => ({ id: 'doc-ref' })),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  arrayUnion: vi.fn((v) => ({ _arrayUnion: v })),
  arrayRemove: vi.fn((v) => ({ _arrayRemove: v })),
}));

// ─── Mock adminActions ────────────────────────────────────────────────────────
const mockApproveBonusAnswer = vi.fn();
const mockRemoveBonusAnswer = vi.fn();

vi.mock('./adminActions', () => ({
  approveBonusAnswer: (...args) => mockApproveBonusAnswer(...args),
  removeBonusAnswer: (...args) => mockRemoveBonusAnswer(...args),
}));

import BonusSubmissions from './BonusSubmissions';

// Hjælper: konfigurer snapshot med bonus-bets
function setupSubmissions(answers) {
  // answers: [{ answer: string, count: number }] — vi simulerer
  // enkeltdokumenter der summeres i hook'en
  const docs = answers.flatMap(({ answer, count }) =>
    Array.from({ length: count }, (_, i) => ({
      id: `${answer}-${i}`,
      data: () => ({ questionId: 'q1', answer }),
      forEach: undefined,
    }))
  );
  mockOnSnapshot.mockImplementation((q, cb) => {
    const snap = {
      forEach: (fn) => docs.forEach(fn),
    };
    cb(snap);
    return vi.fn();
  });
}

const baseQuestion = {
  id: 'q1',
  label: 'Hvem bliver topscorer?',
  type: 'topScorer',
  facit: 'Haaland',
  acceptedAnswers: [],
};

describe('BonusSubmissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApproveBonusAnswer.mockResolvedValue(undefined);
    mockRemoveBonusAnswer.mockResolvedValue(undefined);
    // Standard: tomt snapshot
    mockOnSnapshot.mockImplementation((q, cb) => {
      const snap = { forEach: vi.fn() };
      cb(snap);
      return vi.fn();
    });
  });

  // ─── Loading ──────────────────────────────────────────────────────────────

  it('viser Henter…-tekst under loading', () => {
    mockOnSnapshot.mockImplementation(() => vi.fn()); // aldrig callback
    render(<BonusSubmissions question={baseQuestion} />);
    expect(screen.getByText(/Henter/i)).toBeInTheDocument();
  });

  // ─── Ingen svar ───────────────────────────────────────────────────────────

  it('viser Ingen svar indsendt endnu ved tom liste', () => {
    render(<BonusSubmissions question={baseQuestion} />);
    expect(screen.getByText(/Ingen svar indsendt/i)).toBeInTheDocument();
  });

  // ─── Svar med antal ───────────────────────────────────────────────────────

  it('viser indsendt svar med antal', () => {
    setupSubmissions([{ answer: 'Haaland', count: 3 }]);
    render(<BonusSubmissions question={baseQuestion} />);
    expect(screen.getByText('Haaland')).toBeInTheDocument();
    expect(screen.getByText('3×')).toBeInTheDocument();
  });

  it('viser to forskellige svar', () => {
    setupSubmissions([
      { answer: 'Haaland', count: 5 },
      { answer: 'Mbappe', count: 2 },
    ]);
    render(<BonusSubmissions question={baseQuestion} />);
    expect(screen.getByText('Haaland')).toBeInTheDocument();
    expect(screen.getByText('Mbappe')).toBeInTheDocument();
  });

  // ─── Tæller-badge ─────────────────────────────────────────────────────────

  it('viser Tæller-badge for svar der matcher facit', () => {
    setupSubmissions([{ answer: 'Haaland', count: 3 }]);
    render(<BonusSubmissions question={baseQuestion} />);
    expect(screen.getByText(/✓ Tæller/i)).toBeInTheDocument();
  });

  it('viser Tæller ikke-badge for svar der ikke matcher facit', () => {
    setupSubmissions([{ answer: 'Mbappe', count: 2 }]);
    render(<BonusSubmissions question={baseQuestion} />);
    expect(screen.getByText(/Tæller ikke/i)).toBeInTheDocument();
  });

  it('viser Tæller-badge for fuzzy-matchende svar (Håland ≈ Haaland)', () => {
    setupSubmissions([{ answer: 'Håland', count: 1 }]);
    // bonusPoints bruger fuzzy-matching
    render(<BonusSubmissions question={baseQuestion} />);
    expect(screen.getByText(/✓ Tæller/i)).toBeInTheDocument();
  });

  it('viser Tæller-badge for manuelt godkendt svar', () => {
    setupSubmissions([{ answer: 'Erling Haaland', count: 1 }]);
    render(<BonusSubmissions
      question={{ ...baseQuestion, facit: 'Haaland', acceptedAnswers: ['Erling Haaland'] }}
    />);
    expect(screen.getByText(/✓ Tæller/i)).toBeInTheDocument();
  });

  // ─── Godkend som korrekt-knap ─────────────────────────────────────────────

  it('viser Godkend som korrekt-knap for svar der ikke tæller', () => {
    setupSubmissions([{ answer: 'Mbappe', count: 2 }]);
    render(<BonusSubmissions question={baseQuestion} />);
    expect(screen.getByRole('button', { name: /Godkend som korrekt/i })).toBeInTheDocument();
  });

  it('viser IKKE Godkend-knap for svar der allerede tæller', () => {
    setupSubmissions([{ answer: 'Haaland', count: 3 }]);
    render(<BonusSubmissions question={baseQuestion} />);
    expect(screen.queryByRole('button', { name: /Godkend som korrekt/i })).not.toBeInTheDocument();
  });

  it('kalder approveBonusAnswer ved klik på Godkend som korrekt', async () => {
    setupSubmissions([{ answer: 'Mbappe', count: 2 }]);
    render(<BonusSubmissions question={baseQuestion} />);
    fireEvent.click(screen.getByRole('button', { name: /Godkend som korrekt/i }));

    await waitFor(() => {
      expect(mockApproveBonusAnswer).toHaveBeenCalledWith('q1', 'Mbappe');
    });
  });

  // ─── Fjern godkendelse-knap ───────────────────────────────────────────────

  it('viser Fjern godkendelse-knap for manuelt godkendt svar', () => {
    setupSubmissions([{ answer: 'Erling Haaland', count: 1 }]);
    render(<BonusSubmissions
      question={{ ...baseQuestion, acceptedAnswers: ['Erling Haaland'] }}
    />);
    expect(screen.getByRole('button', { name: /Fjern godkendelse/i })).toBeInTheDocument();
  });

  it('kalder removeBonusAnswer ved klik på Fjern godkendelse', async () => {
    setupSubmissions([{ answer: 'Erling Haaland', count: 1 }]);
    render(<BonusSubmissions
      question={{ ...baseQuestion, acceptedAnswers: ['Erling Haaland'] }}
    />);
    fireEvent.click(screen.getByRole('button', { name: /Fjern godkendelse/i }));

    await waitFor(() => {
      expect(mockRemoveBonusAnswer).toHaveBeenCalledWith('q1', 'Erling Haaland');
    });
  });

  // ─── Ingen facit ──────────────────────────────────────────────────────────

  it('viser advarsel om at sætte facit når ingen er sat', () => {
    setupSubmissions([{ answer: 'Haaland', count: 1 }]);
    render(<BonusSubmissions question={{ ...baseQuestion, facit: null }} />);
    expect(screen.getByText(/Sæt facit først/i)).toBeInTheDocument();
  });

  it('viser IKKE Godkend-knap når ingen facit er sat', () => {
    setupSubmissions([{ answer: 'Haaland', count: 1 }]);
    render(<BonusSubmissions question={{ ...baseQuestion, facit: null }} />);
    expect(screen.queryByRole('button', { name: /Godkend som korrekt/i })).not.toBeInTheDocument();
  });

  // ─── Manuelt godkendte svar ───────────────────────────────────────────────

  it('viser liste over manuelt godkendte svar', () => {
    setupSubmissions([]);
    render(<BonusSubmissions
      question={{ ...baseQuestion, acceptedAnswers: ['Erling Haaland', 'E. Haaland'] }}
    />);
    expect(screen.getByText(/Manuelt godkendte svar/i)).toBeInTheDocument();
    expect(screen.getByText(/Erling Haaland/)).toBeInTheDocument();
  });

  it('viser IKKE manuelt godkendte svar når listen er tom', () => {
    setupSubmissions([]);
    render(<BonusSubmissions question={{ ...baseQuestion, acceptedAnswers: [] }} />);
    expect(screen.queryByText(/Manuelt godkendte svar/i)).not.toBeInTheDocument();
  });
});
