// Tests for MatchCreateForm — opret kamp payload og validering.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ─── Mock adminActions ────────────────────────────────────────────────────────
const mockCreateMatch = vi.fn();
const mockDatetimeToTimestamp = vi.fn((s) => ({ _ts: s }));

vi.mock('./adminActions', () => ({
  createMatch: (...args) => mockCreateMatch(...args),
  datetimeToTimestamp: (...args) => mockDatetimeToTimestamp(...args),
}));

import MatchCreateForm from './MatchCreateForm';

// Hjælper: find runde-dropdown (select med gruppe-option)
function getRundeDd() {
  return document.querySelector('select');
}
// Hjælper: find datetime-local input
function getKickoffInput() {
  return document.querySelector('input[type="datetime-local"]');
}
describe('MatchCreateForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateMatch.mockResolvedValue(undefined);
  });

  // ─── Grundlæggende rendering ──────────────────────────────────────────────

  it('viser Opret ny kamp-overskrift', () => {
    render(<MatchCreateForm onClose={vi.fn()} />);
    expect(screen.getByText(/Opret ny kamp/i)).toBeInTheDocument();
  });

  it('viser Runde-label', () => {
    render(<MatchCreateForm onClose={vi.fn()} />);
    expect(screen.getByText(/Runde/i)).toBeInTheDocument();
  });

  it('viser runde-dropdown', () => {
    render(<MatchCreateForm onClose={vi.fn()} />);
    expect(getRundeDd()).not.toBeNull();
  });

  it('viser Gruppe-label for gruppe-runde som standard', () => {
    render(<MatchCreateForm onClose={vi.fn()} />);
    expect(screen.getByText(/Gruppe \(A/i)).toBeInTheDocument();
  });

  it('skjuler Gruppe-label for knockout-runde', () => {
    render(<MatchCreateForm onClose={vi.fn()} />);
    fireEvent.change(getRundeDd(), { target: { value: 'r16' } });
    expect(screen.queryByText(/Gruppe \(A/i)).not.toBeInTheDocument();
  });

  it('viser Hjemmehold-label', () => {
    render(<MatchCreateForm onClose={vi.fn()} />);
    expect(screen.getByText(/Hjemmehold \(landekode\)/i)).toBeInTheDocument();
  });

  it('viser Udehold-label', () => {
    render(<MatchCreateForm onClose={vi.fn()} />);
    expect(screen.getByText(/Udehold \(landekode\)/i)).toBeInTheDocument();
  });

  it('viser Afspark-label', () => {
    render(<MatchCreateForm onClose={vi.fn()} />);
    expect(screen.getByText(/Afspark \(dato/i)).toBeInTheDocument();
  });

  it('viser afspark datetime-local input', () => {
    render(<MatchCreateForm onClose={vi.fn()} />);
    expect(getKickoffInput()).not.toBeNull();
  });

  it('viser Stadion-label', () => {
    render(<MatchCreateForm onClose={vi.fn()} />);
    expect(screen.getByText(/Stadion/i)).toBeInTheDocument();
  });

  it('viser By-label', () => {
    render(<MatchCreateForm onClose={vi.fn()} />);
    expect(screen.getByText(/By/i)).toBeInTheDocument();
  });

  it('viser Opret kamp-knap', () => {
    render(<MatchCreateForm onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Opret kamp/i })).toBeInTheDocument();
  });

  // ─── Validering ───────────────────────────────────────────────────────────

  it('viser fejl ved manglende afsparktidspunkt', async () => {
    render(<MatchCreateForm onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Opret kamp/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/afsparktidspunkt/i);
    });
  });

  it('kalder IKKE createMatch ved valideringsfejl', async () => {
    render(<MatchCreateForm onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Opret kamp/i }));

    await waitFor(() => {
      expect(mockCreateMatch).not.toHaveBeenCalled();
    });
  });

  // ─── Opret kamp — korrekt payload ─────────────────────────────────────────

  it('kalder createMatch med korrekt payload for gruppekamp', async () => {
    render(<MatchCreateForm onClose={vi.fn()} />);

    // Gruppe-feltet er det første text-input i gruppe-tilstand (idx 0)
    // Hjemmehold er idx 1, Udehold er idx 2, Stadion idx 3, By idx 4
    const textInputs = document.querySelectorAll('input[type="text"]');
    fireEvent.change(textInputs[0], { target: { value: 'b' } }); // Gruppe
    fireEvent.change(textInputs[1], { target: { value: 'dnk' } }); // Hjemmehold
    fireEvent.change(textInputs[2], { target: { value: 'nor' } }); // Udehold
    fireEvent.change(textInputs[3], { target: { value: 'MetLife Stadium' } }); // Stadion
    fireEvent.change(textInputs[4], { target: { value: 'New York' } }); // By
    fireEvent.change(getKickoffInput(), { target: { value: '2026-06-11T18:00' } });

    fireEvent.click(screen.getByRole('button', { name: /Opret kamp/i }));

    await waitFor(() => {
      expect(mockCreateMatch).toHaveBeenCalledWith(
        expect.objectContaining({
          round: 'group',
          groupName: 'B',
          homeTeam: 'DNK',
          awayTeam: 'NOR',
          status: 'scheduled',
          stadium: 'MetLife Stadium',
          city: 'New York',
        })
      );
    });
  });

  it('konverterer holdkoder til uppercase', async () => {
    render(<MatchCreateForm onClose={vi.fn()} />);
    const textInputs = document.querySelectorAll('input[type="text"]');
    fireEvent.change(textInputs[1], { target: { value: 'dnk' } }); // Hjemmehold
    fireEvent.change(textInputs[2], { target: { value: 'nor' } }); // Udehold
    fireEvent.change(getKickoffInput(), { target: { value: '2026-06-11T18:00' } });

    fireEvent.click(screen.getByRole('button', { name: /Opret kamp/i }));

    await waitFor(() => {
      expect(mockCreateMatch).toHaveBeenCalledWith(
        expect.objectContaining({ homeTeam: 'DNK', awayTeam: 'NOR' })
      );
    });
  });

  it('sætter homeTeam til null når feltet er tomt', async () => {
    render(<MatchCreateForm onClose={vi.fn()} />);
    // Lader hjemmehold-feltet forblive tomt
    fireEvent.change(getKickoffInput(), { target: { value: '2026-06-11T18:00' } });
    fireEvent.click(screen.getByRole('button', { name: /Opret kamp/i }));

    await waitFor(() => {
      expect(mockCreateMatch).toHaveBeenCalledWith(
        expect.objectContaining({ homeTeam: null })
      );
    });
  });

  it('konverterer gruppenavn til uppercase', async () => {
    render(<MatchCreateForm onClose={vi.fn()} />);
    const textInputs = document.querySelectorAll('input[type="text"]');
    fireEvent.change(textInputs[0], { target: { value: 'c' } }); // Gruppe
    fireEvent.change(getKickoffInput(), { target: { value: '2026-06-11T18:00' } });
    fireEvent.click(screen.getByRole('button', { name: /Opret kamp/i }));

    await waitFor(() => {
      expect(mockCreateMatch).toHaveBeenCalledWith(
        expect.objectContaining({ groupName: 'C' })
      );
    });
  });

  it('kalder onClose efter vellykket oprettelse', async () => {
    const onClose = vi.fn();
    render(<MatchCreateForm onClose={onClose} />);
    fireEvent.change(getKickoffInput(), { target: { value: '2026-06-11T18:00' } });
    fireEvent.click(screen.getByRole('button', { name: /Opret kamp/i }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('viser fejlbesked ved createMatch-fejl', async () => {
    mockCreateMatch.mockRejectedValue(new Error('Firestore fejl'));
    render(<MatchCreateForm onClose={vi.fn()} />);
    fireEvent.change(getKickoffInput(), { target: { value: '2026-06-11T18:00' } });
    fireEvent.click(screen.getByRole('button', { name: /Opret kamp/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Kunne ikke oprette/i);
    });
  });

  it('viser Opretter…-tekst under kald', async () => {
    let resolve;
    mockCreateMatch.mockReturnValue(new Promise((r) => { resolve = r; }));
    render(<MatchCreateForm onClose={vi.fn()} />);
    fireEvent.change(getKickoffInput(), { target: { value: '2026-06-11T18:00' } });
    fireEvent.click(screen.getByRole('button', { name: /Opret kamp/i }));

    await waitFor(() => {
      expect(screen.getByText(/Opretter/i)).toBeInTheDocument();
    });

    const { act } = await import('@testing-library/react');
    await act(async () => { resolve(undefined); });
  });

  it('kalder onClose ved klik på Annuller', () => {
    const onClose = vi.fn();
    render(<MatchCreateForm onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /Annuller/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('sætter groupName til null for knockout-runde (sf)', async () => {
    render(<MatchCreateForm onClose={vi.fn()} />);
    fireEvent.change(getRundeDd(), { target: { value: 'sf' } });
    fireEvent.change(getKickoffInput(), { target: { value: '2026-07-01T18:00' } });
    fireEvent.click(screen.getByRole('button', { name: /Opret kamp/i }));

    await waitFor(() => {
      expect(mockCreateMatch).toHaveBeenCalledWith(
        expect.objectContaining({ groupName: null })
      );
    });
  });
});
