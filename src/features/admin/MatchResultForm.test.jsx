// Udtømmende tests for MatchResultForm — score-input, knockout-felt, gem, validering.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ─── Mock adminActions ────────────────────────────────────────────────────────
const mockSaveMatchResult = vi.fn();
vi.mock('./adminActions', () => ({
  saveMatchResult: (...args) => mockSaveMatchResult(...args),
}));

import MatchResultForm from './MatchResultForm';

// Hjælper: find Hjemmemål-input (type=number, min=0, første)
function getHomeInput() {
  const inputs = document.querySelectorAll('input[type="number"]');
  return inputs[0];
}
function getAwayInput() {
  const inputs = document.querySelectorAll('input[type="number"]');
  return inputs[1];
}
function getAdvanceInput() {
  return screen.queryByPlaceholderText('DNK');
}

const groupMatch = {
  id: 'match-1',
  homeTeam: 'DNK',
  awayTeam: 'NOR',
  round: 'group',
  result: null,
};

const knockoutMatch = {
  id: 'match-2',
  homeTeam: 'DNK',
  awayTeam: 'NOR',
  round: 'r16',
  result: null,
};

const knockoutMatchWithResult = {
  id: 'match-3',
  homeTeam: 'DNK',
  awayTeam: 'NOR',
  round: 'qf',
  result: { home: 2, away: 1, advance: 'DNK' },
};

describe('MatchResultForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.confirm = vi.fn(() => true);
    mockSaveMatchResult.mockResolvedValue(undefined);
  });

  // ─── Grundlæggende rendering ──────────────────────────────────────────────

  it('viser kampoverskrift med hold', () => {
    render(<MatchResultForm match={groupMatch} onClose={vi.fn()} />);
    expect(screen.getByText(/DNK vs NOR/i)).toBeInTheDocument();
  });

  it('viser Hjemmemål-label', () => {
    render(<MatchResultForm match={groupMatch} onClose={vi.fn()} />);
    expect(screen.getByText(/Hjemmemål/i)).toBeInTheDocument();
  });

  it('viser Udemål-label', () => {
    render(<MatchResultForm match={groupMatch} onClose={vi.fn()} />);
    expect(screen.getByText(/Udemål/i)).toBeInTheDocument();
  });

  it('viser to number-inputs', () => {
    render(<MatchResultForm match={groupMatch} onClose={vi.fn()} />);
    const inputs = document.querySelectorAll('input[type="number"]');
    expect(inputs.length).toBe(2);
  });

  it('viser IKKE videregående hold-input for gruppekamp', () => {
    render(<MatchResultForm match={groupMatch} onClose={vi.fn()} />);
    expect(getAdvanceInput()).toBeNull();
  });

  it('viser videregående hold-input for r16', () => {
    render(<MatchResultForm match={knockoutMatch} onClose={vi.fn()} />);
    expect(getAdvanceInput()).not.toBeNull();
  });

  it('viser videregående hold-input for kvartfinale (qf)', () => {
    render(<MatchResultForm match={{ ...knockoutMatch, round: 'qf' }} onClose={vi.fn()} />);
    expect(getAdvanceInput()).not.toBeNull();
  });

  it('viser videregående hold-input for semifinale (sf)', () => {
    render(<MatchResultForm match={{ ...knockoutMatch, round: 'sf' }} onClose={vi.fn()} />);
    expect(getAdvanceInput()).not.toBeNull();
  });

  it('viser videregående hold-input for finale', () => {
    render(<MatchResultForm match={{ ...knockoutMatch, round: 'final' }} onClose={vi.fn()} />);
    expect(getAdvanceInput()).not.toBeNull();
  });

  it('viser videregående hold-input for r32', () => {
    render(<MatchResultForm match={{ ...knockoutMatch, round: 'r32' }} onClose={vi.fn()} />);
    expect(getAdvanceInput()).not.toBeNull();
  });

  it('viser videregående hold-input for bronzekamp', () => {
    render(<MatchResultForm match={{ ...knockoutMatch, round: 'bronze' }} onClose={vi.fn()} />);
    expect(getAdvanceInput()).not.toBeNull();
  });

  it('viser tekst om videregående hold (landekode)', () => {
    render(<MatchResultForm match={knockoutMatch} onClose={vi.fn()} />);
    expect(screen.getByText(/Videregående hold/i)).toBeInTheDocument();
  });

  it('forudfylder score-felter fra eksisterende resultat', () => {
    render(<MatchResultForm match={knockoutMatchWithResult} onClose={vi.fn()} />);
    const [homeInput, awayInput] = document.querySelectorAll('input[type="number"]');
    expect(homeInput.value).toBe('2');
    expect(awayInput.value).toBe('1');
  });

  it('forudfylder advance-felt fra eksisterende knockout-resultat', () => {
    render(<MatchResultForm match={knockoutMatchWithResult} onClose={vi.fn()} />);
    expect(getAdvanceInput().value).toBe('DNK');
  });

  // ─── Validering ───────────────────────────────────────────────────────────

  it('viser fejl ved manglende hjemmemål', async () => {
    render(<MatchResultForm match={groupMatch} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Gem resultat/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/begge scores/i);
    });
  });

  it('viser fejl ved manglende udemål', async () => {
    render(<MatchResultForm match={groupMatch} onClose={vi.fn()} />);
    fireEvent.change(getHomeInput(), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /Gem resultat/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/begge scores/i);
    });
  });

  it('viser fejl ved manglende videregående hold i knockout', async () => {
    render(<MatchResultForm match={knockoutMatch} onClose={vi.fn()} />);
    fireEvent.change(getHomeInput(), { target: { value: '2' } });
    fireEvent.change(getAwayInput(), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: /Gem resultat/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/videregående hold/i);
    });
  });

  it('kalder IKKE saveMatchResult når bekræftelse afvises', async () => {
    window.confirm = vi.fn(() => false);
    render(<MatchResultForm match={groupMatch} onClose={vi.fn()} />);
    fireEvent.change(getHomeInput(), { target: { value: '1' } });
    fireEvent.change(getAwayInput(), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /Gem resultat/i }));

    await waitFor(() => {
      expect(mockSaveMatchResult).not.toHaveBeenCalled();
    });
  });

  // ─── Gem resultat ─────────────────────────────────────────────────────────

  it('kalder saveMatchResult med korrekt payload for gruppekamp', async () => {
    render(<MatchResultForm match={groupMatch} onClose={vi.fn()} />);
    fireEvent.change(getHomeInput(), { target: { value: '3' } });
    fireEvent.change(getAwayInput(), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: /Gem resultat/i }));

    await waitFor(() => {
      expect(mockSaveMatchResult).toHaveBeenCalledWith('match-1', { home: 3, away: 1 });
    });
  });

  it('kalder saveMatchResult med advance-felt for knockout-kamp', async () => {
    render(<MatchResultForm match={knockoutMatch} onClose={vi.fn()} />);
    fireEvent.change(getHomeInput(), { target: { value: '2' } });
    fireEvent.change(getAwayInput(), { target: { value: '1' } });
    fireEvent.change(getAdvanceInput(), { target: { value: 'NOR' } });
    fireEvent.click(screen.getByRole('button', { name: /Gem resultat/i }));

    await waitFor(() => {
      expect(mockSaveMatchResult).toHaveBeenCalledWith('match-2', {
        home: 2,
        away: 1,
        advance: 'NOR',
      });
    });
  });

  it('kalder onClose efter vellykket gem', async () => {
    const onClose = vi.fn();
    render(<MatchResultForm match={groupMatch} onClose={onClose} />);
    fireEvent.change(getHomeInput(), { target: { value: '1' } });
    fireEvent.change(getAwayInput(), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: /Gem resultat/i }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('viser fejlbesked ved saveMatchResult-fejl', async () => {
    mockSaveMatchResult.mockRejectedValue(new Error('Firestore fejl'));
    render(<MatchResultForm match={groupMatch} onClose={vi.fn()} />);
    fireEvent.change(getHomeInput(), { target: { value: '2' } });
    fireEvent.change(getAwayInput(), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /Gem resultat/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Kunne ikke gemme/i);
    });
  });

  it('viser Gemmer…-tekst under gem', async () => {
    let resolve;
    mockSaveMatchResult.mockReturnValue(new Promise((r) => { resolve = r; }));
    render(<MatchResultForm match={groupMatch} onClose={vi.fn()} />);
    fireEvent.change(getHomeInput(), { target: { value: '1' } });
    fireEvent.change(getAwayInput(), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /Gem resultat/i }));

    await waitFor(() => {
      expect(screen.getByText(/Gemmer/i)).toBeInTheDocument();
    });

    const { act } = await import('@testing-library/react');
    await act(async () => { resolve(undefined); });
  });

  // ─── Annuller ─────────────────────────────────────────────────────────────

  it('kalder onClose ved klik på Annuller', () => {
    const onClose = vi.fn();
    render(<MatchResultForm match={groupMatch} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /Annuller/i }));
    expect(onClose).toHaveBeenCalled();
  });

  // ─── Placeholder-hold ─────────────────────────────────────────────────────

  it('viser placeholder-holdnavne i titlen når teams er null', () => {
    const matchMedPlaceholder = {
      id: 'match-4',
      homeTeam: null,
      awayTeam: null,
      homePlaceholder: 'Vinder gruppe A',
      awayPlaceholder: 'Vinder gruppe B',
      round: 'qf',
      result: null,
    };
    render(<MatchResultForm match={matchMedPlaceholder} onClose={vi.fn()} />);
    expect(screen.getByText(/Vinder gruppe A vs Vinder gruppe B/i)).toBeInTheDocument();
  });
});
