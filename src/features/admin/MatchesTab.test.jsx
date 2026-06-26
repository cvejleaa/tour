// Tests for MatchesTab — viser kampe, rediger, buildKnockout.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ─── Mock Firebase ────────────────────────────────────────────────────────────
vi.mock('../../firebase', () => ({
  db: {},
  functions: {},
}));

const mockOnSnapshot = vi.fn();

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  onSnapshot: (...args) => mockOnSnapshot(...args),
  orderBy: vi.fn(),
  query: vi.fn(),
  doc: vi.fn(() => ({ id: 'doc-ref' })),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  addDoc: vi.fn().mockResolvedValue({ id: 'new-match-id' }),
  serverTimestamp: vi.fn(() => ({})),
  Timestamp: { fromDate: vi.fn((d) => ({ toDate: () => d })) },
}));

const mockHttpsCallable = vi.fn();
vi.mock('firebase/functions', () => ({
  httpsCallable: (...args) => mockHttpsCallable(...args),
}));

// ─── Mock adminActions ────────────────────────────────────────────────────────
const mockCallBuildKnockout = vi.fn();
const mockCallBackfill = vi.fn();
const mockFormatTimestamp = vi.fn(() => '11.06.2026 18:00');

vi.mock('./adminActions', () => ({
  callBuildKnockout: () => mockCallBuildKnockout(),
  callBackfillTipParticipation: () => mockCallBackfill(),
  callSendTipRemindersNow: vi.fn().mockResolvedValue({ ok: true, data: { sent: 0 } }),
  callSendTestReminderToMe: vi.fn().mockResolvedValue({ ok: true, data: {} }),
  callPruneOrphanMatches: vi.fn().mockResolvedValue({ ok: true, data: { deleted: 0, remaining: 104 } }),
  callRegenerateRecaps: vi.fn().mockResolvedValue({ ok: true, data: { previews: [], posts: 0, leagues: 0 } }),
  formatTimestamp: (...args) => mockFormatTimestamp(...args),
  saveMatchResult: vi.fn().mockResolvedValue(undefined),
  createMatch: vi.fn().mockResolvedValue(undefined),
  datetimeToTimestamp: vi.fn((s) => ({ _ts: s })),
}));

// useAuth bruges til at vise ejer-knapper
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ isOwner: true }),
}));

// SyncHealthBanner har sin egen snapshot-lytter — isolér MatchesTab fra den.
vi.mock('./useSyncStatus', () => ({
  useSyncStatus: () => ({ status: null, loading: false, error: '' }),
}));

import MatchesTab from './MatchesTab';

function setupMatches(matches) {
  mockOnSnapshot.mockImplementation((q, cb) => {
    cb({
      docs: matches.map((m) => ({
        id: m.id,
        data: () => ({ ...m }),
      })),
    });
    return vi.fn();
  });
}

describe('MatchesTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.confirm = vi.fn(() => true);
    mockOnSnapshot.mockImplementation((q, cb) => {
      cb({ docs: [] });
      return vi.fn();
    });
    mockCallBuildKnockout.mockResolvedValue({ ok: true });
  });

  // ─── Loading ──────────────────────────────────────────────────────────────

  it('viser indlæsningsbesked mens kampe hentes', () => {
    mockOnSnapshot.mockImplementation(() => vi.fn()); // aldrig kalder callback
    render(<MatchesTab />);
    expect(screen.getByText(/Henter kampe/i)).toBeInTheDocument();
  });

  // ─── Ingen kampe ──────────────────────────────────────────────────────────

  it('viser Ingen kampe-besked ved tom liste', () => {
    render(<MatchesTab />);
    expect(screen.getByText(/Ingen kampe oprettet/i)).toBeInTheDocument();
  });

  // ─── Kampliste ────────────────────────────────────────────────────────────

  it('viser kampnavn (hold vs hold)', () => {
    setupMatches([
      { id: 'm1', homeTeam: 'DNK', awayTeam: 'NOR', round: 'group', status: 'scheduled', result: null },
    ]);
    render(<MatchesTab />);
    expect(screen.getByText('DNK vs NOR')).toBeInTheDocument();
  });

  it('viser status for kamp', () => {
    setupMatches([
      { id: 'm1', homeTeam: 'DNK', awayTeam: 'NOR', round: 'group', status: 'scheduled', result: null },
    ]);
    render(<MatchesTab />);
    expect(screen.getByText(/Planlagt/i)).toBeInTheDocument();
  });

  it('viser resultat for afsluttet kamp', () => {
    setupMatches([
      {
        id: 'm1', homeTeam: 'DNK', awayTeam: 'NOR', round: 'group',
        status: 'finished', result: { home: 2, away: 1 },
      },
    ]);
    render(<MatchesTab />);
    expect(screen.getByText('2–1')).toBeInTheDocument();
  });

  it('viser advance i resultatet for knockout-kamp (advance i parentes)', () => {
    setupMatches([
      {
        id: 'm1', homeTeam: 'DNK', awayTeam: 'NOR', round: 'r16',
        status: 'finished', result: { home: 1, away: 0, advance: 'DNK' },
      },
    ]);
    render(<MatchesTab />);
    // Result vises som "1–0 (DNK)" — match på parentesteksten
    expect(screen.getByText(/1–0 \(DNK\)/i)).toBeInTheDocument();
  });

  it('viser placeholder-holdnavne for ukendte hold', () => {
    setupMatches([
      {
        id: 'm1', homeTeam: null, awayTeam: null,
        homePlaceholder: 'Vinder A', awayPlaceholder: 'Vinder B',
        round: 'qf', status: 'pendingTeams', result: null,
      },
    ]);
    render(<MatchesTab />);
    expect(screen.getByText('Vinder A vs Vinder B')).toBeInTheDocument();
  });

  it('viser Sæt resultat-knap for hver kamp', () => {
    setupMatches([
      { id: 'm1', homeTeam: 'DNK', awayTeam: 'NOR', round: 'group', status: 'scheduled', result: null },
    ]);
    render(<MatchesTab />);
    expect(screen.getByRole('button', { name: /Sæt resultat/i })).toBeInTheDocument();
  });

  it('åbner resultat-formular ved klik på Sæt resultat', () => {
    setupMatches([
      { id: 'm1', homeTeam: 'DNK', awayTeam: 'NOR', round: 'group', status: 'scheduled', result: null },
    ]);
    render(<MatchesTab />);
    fireEvent.click(screen.getByRole('button', { name: /Sæt resultat/i }));
    expect(screen.getByRole('button', { name: /Gem resultat/i })).toBeInTheDocument();
  });

  it('lukker resultat-formular ved klik på Luk', () => {
    setupMatches([
      { id: 'm1', homeTeam: 'DNK', awayTeam: 'NOR', round: 'group', status: 'scheduled', result: null },
    ]);
    render(<MatchesTab />);
    fireEvent.click(screen.getByRole('button', { name: /Sæt resultat/i }));
    fireEvent.click(screen.getByRole('button', { name: /Luk/i }));
    expect(screen.queryByRole('button', { name: /Gem resultat/i })).not.toBeInTheDocument();
  });

  // ─── Opret kamp ───────────────────────────────────────────────────────────

  it('viser Opret kamp-knap', () => {
    render(<MatchesTab />);
    expect(screen.getByRole('button', { name: /\+ Opret kamp/i })).toBeInTheDocument();
  });

  it('åbner opret-formular ved klik på + Opret kamp', () => {
    render(<MatchesTab />);
    fireEvent.click(screen.getByRole('button', { name: /\+ Opret kamp/i }));
    expect(screen.getByText(/Opret ny kamp/i)).toBeInTheDocument();
  });

  it('lukker opret-formular ved klik på Annuller oprettelse', () => {
    render(<MatchesTab />);
    fireEvent.click(screen.getByRole('button', { name: /\+ Opret kamp/i }));
    fireEvent.click(screen.getByRole('button', { name: /Annuller oprettelse/i }));
    expect(screen.queryByText(/Opret ny kamp/i)).not.toBeInTheDocument();
  });

  // ─── buildKnockout ────────────────────────────────────────────────────────

  it('viser Generer knockout-kampe-knap', () => {
    render(<MatchesTab />);
    expect(screen.getByRole('button', { name: /Generer knockout-kampe/i })).toBeInTheDocument();
  });

  it('kalder callBuildKnockout ved klik og bekræftelse', async () => {
    render(<MatchesTab />);
    fireEvent.click(screen.getByRole('button', { name: /Generer knockout-kampe/i }));

    await waitFor(() => {
      expect(mockCallBuildKnockout).toHaveBeenCalled();
    });
  });

  // ─── backfill tip-deltagelse ────────────────────────────────────────────────

  it('kalder backfill ved klik og viser besked', async () => {
    mockCallBackfill.mockResolvedValue({ ok: true, data: { message: 'Backfill færdig: 3 kampe.' } });
    render(<MatchesTab />);
    fireEvent.click(screen.getByRole('button', { name: /Genopbyg tip-deltagelse/i }));

    await waitFor(() => {
      expect(mockCallBackfill).toHaveBeenCalled();
      expect(screen.getByRole('alert')).toHaveTextContent(/Backfill færdig: 3 kampe/i);
    });
  });

  it('viser successbesked efter vellykket buildKnockout', async () => {
    mockCallBuildKnockout.mockResolvedValue({ ok: true });
    render(<MatchesTab />);
    fireEvent.click(screen.getByRole('button', { name: /Generer knockout-kampe/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Knockout-kampe er oprettet/i);
    });
  });

  it('viser fejlbesked ved mislykket buildKnockout', async () => {
    mockCallBuildKnockout.mockResolvedValue({ ok: false, error: 'Ikke deployet' });
    render(<MatchesTab />);
    fireEvent.click(screen.getByRole('button', { name: /Generer knockout-kampe/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Fejl: Ikke deployet/i);
    });
  });

  it('kalder IKKE callBuildKnockout når bekræftelse afvises', async () => {
    window.confirm = vi.fn(() => false);
    render(<MatchesTab />);
    fireEvent.click(screen.getByRole('button', { name: /Generer knockout-kampe/i }));

    await waitFor(() => {
      expect(mockCallBuildKnockout).not.toHaveBeenCalled();
    });
  });

  it('viser Genererer…-tekst under buildKnockout', async () => {
    let resolve;
    mockCallBuildKnockout.mockReturnValue(new Promise((r) => { resolve = r; }));
    render(<MatchesTab />);
    fireEvent.click(screen.getByRole('button', { name: /Generer knockout-kampe/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Genererer/i })).toBeInTheDocument();
    });

    const { act } = await import('@testing-library/react');
    await act(async () => { resolve({ ok: true }); });
  });

  // ─── Fejlhåndtering ───────────────────────────────────────────────────────

  it('viser fejlbesked ved snapshot-fejl', () => {
    mockOnSnapshot.mockImplementation((q, onNext, onError) => {
      onError(new Error('Permission denied'));
      return vi.fn();
    });
    render(<MatchesTab />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
