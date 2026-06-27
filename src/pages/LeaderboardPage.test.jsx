/**
 * Tests for LeaderboardPage.
 * Mocker alle Firebase-hooks og context.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LeaderboardPage from './LeaderboardPage';

// ── Mock AuthContext ──────────────────────────────────────────────────────────
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'me-uid' }, profile: { displayName: 'Mig' } }),
}));

// ── Mock hooks ────────────────────────────────────────────────────────────────
const mockStandings = [
  { uid: 'uid-1', displayName: 'Alice', totalPoints: 50, stagePoints: 40, bonusPoints: 10 },
  { uid: 'me-uid', displayName: 'Mig', totalPoints: 30, stagePoints: 25, bonusPoints: 5 },
  { uid: 'uid-3', displayName: 'Charlie', totalPoints: 10, stagePoints: 10, bonusPoints: 0 },
];

vi.mock('../features/leaderboard/useStandings', () => ({
  useStandings: () => ({ standings: mockStandings, loading: false, error: null }),
}));

vi.mock('../features/leaderboard/useDailyStandings', () => ({
  useDailyStandings: () => ({
    pointsByUid: { 'uid-1': 8, 'me-uid': 3 },
    todayStr: '2026-06-02',
    loading: false,
    error: null,
  }),
}));

// Liga-bonus rører Firebase — stub i page-testen
vi.mock('../features/leagues/useLeagueBonus', () => ({
  useLeagueBonus: () => ({ questions: [], myAnswers: {}, pointsByUid: {}, answersByQid: {}, loading: false }),
}));

vi.mock('../features/leagues/useLeagues', () => ({
  useLeagues: () => ({
    leagues: [
      {
        id: 'league-1',
        name: 'Testliga',
        ownerUid: 'me-uid',
        joinCode: 'ABC123',
        memberUids: ['uid-1', 'me-uid'],
      },
    ],
    loading: false,
    error: null,
  }),
}));

// ThemeToggle kræver window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    addListener: vi.fn(),
    removeListener: vi.fn(),
  })),
});

describe('LeaderboardPage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('viser "Samlet stilling"-fanen som standard', () => {
    render(<LeaderboardPage />);
    expect(screen.getByRole('tab', { name: /samlet stilling/i })).toHaveAttribute('aria-selected', 'true');
  });

  it('viser kun spillere fra egne ligaer i samlet stilling', () => {
    render(<LeaderboardPage />);
    // Alice og Mig deler liga med brugeren; Charlie gør ikke → skjules
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Mig')).toBeInTheDocument();
    expect(screen.queryByText('Charlie')).not.toBeInTheDocument();
  });

  it('fremhæver den indloggede bruger med "dig"-badge', () => {
    render(<LeaderboardPage />);
    expect(screen.getByText('dig')).toBeInTheDocument();
  });

  it('skifter til "Dagens etape"-fanen ved klik', () => {
    render(<LeaderboardPage />);
    const dailyTab = screen.getByRole('tab', { name: /dagens etape/i });
    fireEvent.click(dailyTab);
    expect(dailyTab).toHaveAttribute('aria-selected', 'true');
  });

  it('viser ligadropdown da brugeren har ligaer', () => {
    render(<LeaderboardPage />);
    expect(screen.getByLabelText(/filtrer efter liga/i)).toBeInTheDocument();
    expect(screen.getByText('Testliga')).toBeInTheDocument();
  });

  it('filtrerer stilling til ligamedlemmer ved valg', () => {
    render(<LeaderboardPage />);
    const select = screen.getByLabelText(/filtrer efter liga/i);
    fireEvent.change(select, { target: { value: 'league-1' } });
    // Alice og Mig er i liga, Charlie er ikke
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.queryByText('Charlie')).not.toBeInTheDocument();
  });

  it('viser daglige point i dagsfanen', () => {
    render(<LeaderboardPage />);
    fireEvent.click(screen.getByRole('tab', { name: /dagens etape/i }));
    // Alice har 8 point, Mig har 3 → 8 bør vises
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('viser dato-badge i dagsfanen', () => {
    render(<LeaderboardPage />);
    fireEvent.click(screen.getByRole('tab', { name: /dagens etape/i }));
    // todayStr = '2026-06-02' → formateret dato vises
    const datoBadge = screen.queryByText(/2026|juni|mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag/i);
    expect(datoBadge).toBeInTheDocument();
  });

  it('viser samlet stilling for valgt liga med ligaens navn', () => {
    render(<LeaderboardPage />);
    const select = screen.getByLabelText(/filtrer efter liga/i);
    fireEvent.change(select, { target: { value: 'league-1' } });
    expect(screen.getByText(/Testliga – stilling/i)).toBeInTheDocument();
  });

  it('skifter til Dagens etape og viser ligaens daglige stilling', () => {
    render(<LeaderboardPage />);
    const select = screen.getByLabelText(/filtrer efter liga/i);
    fireEvent.change(select, { target: { value: 'league-1' } });
    fireEvent.click(screen.getByRole('tab', { name: /dagens etape/i }));
    // Alice og Mig er i ligaen → Charlie er ikke
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.queryByText('Charlie')).not.toBeInTheDocument();
  });

  it('nulstiller filter til eget liga-netværk ved valg af tom option', () => {
    render(<LeaderboardPage />);
    const select = screen.getByLabelText(/filtrer efter liga/i);
    fireEvent.change(select, { target: { value: 'league-1' } });
    fireEvent.change(select, { target: { value: '' } });
    // Tilbage til netværket: Alice vises, men Charlie (ingen fælles liga) gør ikke
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.queryByText('Charlie')).not.toBeInTheDocument();
  });

  it('viser spillernes samlede point i stillingen', () => {
    render(<LeaderboardPage />);
    const aliceRow = screen.getByText('Alice').closest('tr');
    expect(aliceRow).toHaveTextContent('50');
  });

  it('viser kun de to faner (samlet + dagens etape)', () => {
    render(<LeaderboardPage />);
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    expect(screen.queryByRole('tab', { name: /præcision/i })).not.toBeInTheDocument();
  });

  it('viser ThemeToggle-knap', () => {
    render(<LeaderboardPage />);
    // ThemeToggle er til stede – kigger efter knap med tema-relateret label
    const toggleBtn = screen.getByRole('button', { name: /tema/i });
    expect(toggleBtn).toBeInTheDocument();
  });

  it('"Samlet stilling"-fanen er ikke selected i dagsfanen', () => {
    render(<LeaderboardPage />);
    fireEvent.click(screen.getByRole('tab', { name: /dagens etape/i }));
    expect(screen.getByRole('tab', { name: /samlet stilling/i })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });
});
