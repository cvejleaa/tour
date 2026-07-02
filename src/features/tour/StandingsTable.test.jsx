import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StandingsTable from './StandingsTable';

const many = Array.from({ length: 14 }, (_, i) => ({
  rank: i + 1, rider: `Rytter ${i + 1}`, team: 'UAE Team Emirates XRG', time: `+0:${i}`, points: 100 - i,
}));

describe('StandingsTable', () => {
  it('viser top 10 og folder ud til alle', () => {
    render(<StandingsTable rows={many} valueType="time" topN={10} />);
    expect(screen.getAllByTestId('standings-row')).toHaveLength(10);
    fireEvent.click(screen.getByTestId('standings-toggle'));
    expect(screen.getAllByTestId('standings-row')).toHaveLength(14);
  });

  it('viser point når valueType=points', () => {
    render(<StandingsTable rows={[{ rank: 1, rider: 'A', team: 'UAE Team Emirates XRG', points: 42 }]} valueType="points" />);
    expect(screen.getByText('42 p')).toBeInTheDocument();
  });

  it('teamsMode viser holdet som primær', () => {
    render(<StandingsTable rows={[{ rank: 1, team: 'Team Visma | Lease a Bike', time: '10:00' }]} teamsMode valueType="time" />);
    expect(screen.getByText('10:00')).toBeInTheDocument();
  });

  it('tom liste → besked', () => {
    render(<StandingsTable rows={[]} />);
    expect(screen.getByText(/Ingen data endnu/)).toBeInTheDocument();
  });
});
