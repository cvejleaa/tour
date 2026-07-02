// Tests for TourPage – samlet Tour-stilling.
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../firebase', () => ({ db: {} }));

let mockData = null;
vi.mock('../features/tour/useClassifications', () => ({
  useClassifications: () => ({ data: mockData, loading: false }),
}));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { uid: 'me' } }) }));
vi.mock('../features/stages/useMyStageBets', () => ({ useMyStageBets: () => ({ betsByStage: {}, loading: false }) }));
vi.mock('../features/stages/useActiveSeason', () => ({ useActiveSeason: () => 2026 }));
vi.mock('../features/leagues/useLeagues', () => ({ useLeagues: () => ({ leagues: [] }) }));
vi.mock('../features/tour/useLeagueTippedTeams', () => ({ useLeagueTippedTeams: () => new Set() }));

import TourPage from './TourPage';

const DATA = {
  afterStage: 7,
  jerseys: { yellow: 'Tadej Pogačar', green: 'Jasper Philipsen', polka: 'Lenny Martinez', white: 'Remco Evenepoel', teamLead: 'UAE Team Emirates XRG' },
  standings: {
    samlet: [{ rank: 1, rider: 'Tadej Pogačar', team: 'UAE Team Emirates XRG', time: '0:00' }],
    sprint: [{ rank: 1, rider: 'Jasper Philipsen', team: 'Alpecin-Premier Tech', points: 120 }],
    bjerg: [{ rank: 1, rider: 'Lenny Martinez', team: 'Bahrain Victorious', points: 44 }],
    ungdom: [{ rank: 1, rider: 'Remco Evenepoel', team: 'Soudal Quick-Step', time: '+1:20' }],
    hold: [{ rank: 1, team: 'UAE Team Emirates XRG', time: '10:00:00' }],
  },
  stageResult: [{ rank: 1, rider: 'Tadej Pogačar', team: 'UAE Team Emirates XRG' }],
};

describe('TourPage', () => {
  it('viser tom-tilstand når der ingen data er', () => {
    mockData = null;
    render(<TourPage />);
    expect(screen.getByTestId('tour-empty')).toBeInTheDocument();
  });

  it('viser trøjeførere, stillinger og seneste resultat når der er data', () => {
    mockData = DATA;
    render(<TourPage />);
    expect(screen.getByTestId('jersey-leaders')).toBeInTheDocument();
    // 5 trøje-/holdkort
    expect(screen.getAllByTestId('jersey-card')).toHaveLength(5);
    expect(screen.getByTestId('standings-samlet')).toBeInTheDocument();
    expect(screen.getByTestId('standings-hold')).toBeInTheDocument();
    expect(screen.getByTestId('latest-stage-result')).toBeInTheDocument();
    expect(screen.getAllByText('Tadej Pogačar').length).toBeGreaterThan(0);
  });

  it('har en Mine/Ligaen-skifter til fremhævning', () => {
    mockData = DATA;
    render(<TourPage />);
    expect(screen.getByTestId('highlight-mine')).toBeInTheDocument();
    expect(screen.getByTestId('highlight-liga')).toBeInTheDocument();
  });
});
