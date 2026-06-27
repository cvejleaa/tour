// Tests for TourTab's "Spørgsmål pr. etape"-overblik: tabellen renderes med
// forudfyldte checkboxes (type-standard) og en ændring gemmes som
// { questions: {...} } via setDoc(merge) på etape-dokumentet.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../firebase', () => ({ db: {}, functions: {} }));

const mockSetDoc = vi.fn(() => Promise.resolve());
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, _col, id) => ({ _id: id })),
  setDoc: (...a) => mockSetDoc(...a),
}));

vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn(() => vi.fn()) }));

vi.mock('../stages/useActiveSeason', () => ({ useActiveSeason: () => 2026 }));
// Stabil reference (samme objekt hver render) — det rigtige hook holder
// værdien i useState, så et nyt objekt pr. render ville give uendelig
// re-render-løkke i synk-useEffect'en.
vi.mock('../stages/useTourSettings', () => {
  const SETTINGS = {
    points: { winnerTeam: 5, gcTeam: 4, mountainTeam: 3, sprintTeam: 3, untippedPenalty: 1 },
    gcTopN: 10,
  };
  return { useTourSettings: () => SETTINGS };
});

const STAGES = [
  { id: '2026-stage-1', number: 1, type: 'ttt', startCity: 'A', finishCity: 'B' },
  { id: '2026-stage-2', number: 2, type: 'flat', startCity: 'C', finishCity: 'D' },
];
vi.mock('../stages/useStages', () => ({
  useStages: () => ({ stages: STAGES, loading: false, error: null }),
}));

import TourTab from './TourTab';

describe('TourTab — Spørgsmål pr. etape', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renderer overblik med forudfyldte type-standarder', () => {
    render(<TourTab />);
    expect(screen.getByTestId('questions-overview')).toBeTruthy();
    // ttt (etape 1): kun vinder-hold afkrydset.
    expect(screen.getByTestId('q-1-winnerTeam').checked).toBe(true);
    expect(screen.getByTestId('q-1-gcTeam').checked).toBe(false);
    expect(screen.getByTestId('q-1-mountainTeam').checked).toBe(false);
    expect(screen.getByTestId('q-1-sprintTeam').checked).toBe(false);
    // flat (etape 2): vinder, bedste hold, sprint — men ikke bjerg.
    expect(screen.getByTestId('q-2-winnerTeam').checked).toBe(true);
    expect(screen.getByTestId('q-2-gcTeam').checked).toBe(true);
    expect(screen.getByTestId('q-2-mountainTeam').checked).toBe(false);
    expect(screen.getByTestId('q-2-sprintTeam').checked).toBe(true);
  });

  it('gemmer ændrede spørgsmål på etape-dokumentet (setDoc merge)', async () => {
    render(<TourTab />);
    // Slå bjergpoint til på etape 2.
    fireEvent.click(screen.getByTestId('q-2-mountainTeam'));
    fireEvent.click(screen.getByTestId('q-save-2'));

    await waitFor(() => expect(mockSetDoc).toHaveBeenCalled());
    const [ref, payload, opts] = mockSetDoc.mock.calls[0];
    expect(ref).toEqual({ _id: '2026-stage-2' });
    expect(payload).toEqual({
      questions: { winnerTeam: true, gcTeam: true, mountainTeam: true, sprintTeam: true },
    });
    expect(opts).toEqual({ merge: true });
  });
});
