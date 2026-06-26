import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DashboardPage from './DashboardPage';

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'me' }, profile: { displayName: 'Carsten', totalPoints: 12 } }),
}));
vi.mock('../features/leaderboard/useStandings', () => ({
  useStandings: () => ({ standings: [
    { uid: 'x', displayName: 'Xenia', totalPoints: 30 },
    { uid: 'me', displayName: 'Carsten', totalPoints: 12 },
    { uid: 'z', displayName: 'Zlatan', totalPoints: 99 },
  ] }),
}));
// Jeg er kun i liga med 'x' — 'z' er udenfor og må ikke vises på forsiden.
vi.mock('../features/leagues/useLeagues', () => ({
  useLeagues: () => ({ leagues: [{ id: 'L', memberUids: ['me', 'x'] }], loading: false, error: null }),
}));
vi.mock('../features/matches/useMatches', () => ({
  useMatches: () => ({ matches: [], loading: false, error: null }),
}));
vi.mock('../features/matches/useMyBets', () => ({
  useMyBets: () => ({ bets: new Map() }),
}));
vi.mock('../context/TasksContext', () => ({
  useTasks: () => ({ matchCount: 1, bonusCount: 0, leagueBonus: { total: 0, byLeague: [] }, total: 1 }),
}));

function renderPage() {
  return render(<MemoryRouter><DashboardPage /></MemoryRouter>);
}

describe('DashboardPage', () => {
  beforeEach(() => localStorage.clear());

  it('hilser brugeren personligt', () => {
    renderPage();
    expect(screen.getByText(/Hej, Carsten/)).toBeInTheDocument();
  });

  it('viser mærket placering og point som chips (kun blandt liga-medspillere)', () => {
    renderPage();
    // Placering regnes blandt liga-medspillere (me + x), ikke alle (z udenfor).
    expect(screen.getByText('Placering: #2 af 2')).toBeInTheDocument();
    expect(screen.getByText('Point: 12')).toBeInTheDocument();
  });

  it('viser kun liga-medspillere i forsidens stilling – ikke alle brugere', () => {
    renderPage();
    expect(screen.getByText('Xenia')).toBeInTheDocument();        // i min liga
    expect(screen.queryByText('Zlatan')).not.toBeInTheDocument();  // udenfor min liga
  });

  it('viser "Mine opgaver"-kortet', () => {
    renderPage();
    expect(screen.getByText('📋 Mine opgaver')).toBeInTheDocument();
    expect(screen.getByText(/kamp mangler tip/)).toBeInTheDocument();
  });

  it('viser genvej til kampene', () => {
    renderPage();
    expect(screen.getByText(/Til kampene/)).toBeInTheDocument();
  });
});
