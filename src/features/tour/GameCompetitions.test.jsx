import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import GameCompetitions from './GameCompetitions';

const data = {
  stageResult: [
    { rank: 1, rider: 'Pogačar', team: 'UAE Team Emirates XRG' },
    { rank: 2, rider: 'Vingegaard', team: 'Team Visma | Lease a Bike' },
  ],
  standings: {
    bjerg: [{ rank: 1, rider: 'Martinez', team: 'Bahrain Victorious', points: 50 }],
    sprint: [{ rank: 1, rider: 'Philipsen', team: 'Alpecin-Premier Tech', points: 200 }],
  },
};

describe('GameCompetitions', () => {
  it('viser de fire konkurrence-kort med hold + rytter-specifikation', () => {
    render(<GameCompetitions data={data} gcTopN={4} />);
    expect(screen.getByTestId('gamecomp-winnerTeam')).toBeInTheDocument();
    expect(screen.getByTestId('gamecomp-gcTeam')).toBeInTheDocument();
    expect(screen.getByTestId('gamecomp-mountainTeam')).toBeInTheDocument();
    expect(screen.getByTestId('gamecomp-sprintTeam')).toBeInTheDocument();
    expect(screen.getByText(/Bedste hold \(de første 4 ryttere\)/)).toBeInTheDocument();
    // Rytter-specifikation vises (kan optræde i flere kort).
    expect(screen.getAllByText(/Pogačar \(1\.\)/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Martinez 50p/)).toBeInTheDocument();
  });

  it('fremhæver tippede hold', () => {
    render(<GameCompetitions data={data} gcTopN={4} highlightTeams={new Set(['UAE Team Emirates XRG'])} />);
    const tipped = screen.getAllByTestId('gamecomp-team').filter((el) => el.getAttribute('data-tipped') === 'true');
    expect(tipped.length).toBeGreaterThan(0);
  });
});
