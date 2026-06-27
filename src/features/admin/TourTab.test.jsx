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

// Mock kun de to ekspert-tip-handlinger; resten af adminActions er ægte.
const mockCallGenerateStageTip = vi.fn(() => Promise.resolve({ ok: true, data: { results: [], errors: [] } }));
const mockSaveStageTip = vi.fn(() => Promise.resolve());
vi.mock('./adminActions', async (importOriginal) => ({
  ...(await importOriginal()),
  callGenerateStageTip: (...a) => mockCallGenerateStageTip(...a),
  saveStageTip: (...a) => mockSaveStageTip(...a),
}));

vi.mock('../stages/useActiveSeason', () => ({ useActiveSeason: () => 2026 }));
// Stabil reference (samme objekt hver render) — det rigtige hook holder
// værdien i useState, så et nyt objekt pr. render ville give uendelig
// re-render-løkke i synk-useEffect'en.
vi.mock('../stages/useTourSettings', () => {
  const SETTINGS = {
    points: { winnerTeam: [5, 3, 1], gcTeam: [4, 2, 1], mountainTeam: [3, 2, 1], sprintTeam: [3, 2, 1], untippedPenalty: 1 },
    gcTopN: 10,
  };
  return { useTourSettings: () => SETTINGS };
});

const STAGES = [
  { id: '2026-stage-1', number: 1, type: 'ttt', startCity: 'A', finishCity: 'B' },
  { id: '2026-stage-2', number: 2, type: 'flat', startCity: 'C', finishCity: 'D', expertTip: 'Sprint-etape.' },
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

describe('TourTab — Ekspert-tips pr. etape', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renderer sektionen med en textarea forudfyldt fra stage.expertTip', () => {
    render(<TourTab />);
    expect(screen.getByTestId('expert-tips')).toBeTruthy();
    expect(screen.getByTestId('tip-text-1').value).toBe('');
    expect(screen.getByTestId('tip-text-2').value).toBe('Sprint-etape.');
  });

  it('"Generér" kalder callGenerateStageTip for den etape', async () => {
    render(<TourTab />);
    fireEvent.click(screen.getByTestId('tip-gen-1'));
    await waitFor(() => expect(mockCallGenerateStageTip).toHaveBeenCalledWith({ stageId: '2026-stage-1' }));
  });

  it('"Generér manglende" looper enkelt-kald for etaper uden tip (etape 1)', async () => {
    render(<TourTab />);
    fireEvent.click(screen.getByTestId('tip-gen-missing'));
    // Kun etape 1 mangler et tip (etape 2 har 'Sprint-etape.').
    await waitFor(() => expect(mockCallGenerateStageTip).toHaveBeenCalledWith({ stageId: '2026-stage-1' }));
    expect(mockCallGenerateStageTip).not.toHaveBeenCalledWith({ stageId: '2026-stage-2' });
  });

  it('"Gem" kalder saveStageTip med (stageId, tekst)', async () => {
    render(<TourTab />);
    fireEvent.change(screen.getByTestId('tip-text-1'), { target: { value: 'Min tekst' } });
    fireEvent.click(screen.getByTestId('tip-save-1'));
    await waitFor(() => expect(mockSaveStageTip).toHaveBeenCalledWith('2026-stage-1', 'Min tekst'));
  });

  it('"Regenerér alle" looper enkelt-kald for ALLE etaper efter bekræftelse', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<TourTab />);
    fireEvent.click(screen.getByTestId('tip-regen-all'));
    await waitFor(() => expect(mockCallGenerateStageTip).toHaveBeenCalledWith({ stageId: '2026-stage-1' }));
    await waitFor(() => expect(mockCallGenerateStageTip).toHaveBeenCalledWith({ stageId: '2026-stage-2' }));
    confirmSpy.mockRestore();
  });
});
