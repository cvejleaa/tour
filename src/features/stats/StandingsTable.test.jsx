import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StandingsTable from './StandingsTable';

const tables = [{
  stage: 'GROUP_STAGE', group: 'GROUP_A',
  table: [
    { position: 1, teamName: 'Brasilien', played: 3, points: 9, goalDifference: 6, form: 'W,W,W' },
    { position: 2, teamName: 'Schweiz', played: 3, points: 4, goalDifference: 0, form: 'L,D,W' },
  ],
}];

describe('StandingsTable', () => {
  it('viser intet uden tabeller', () => {
    const { container } = render(<StandingsTable tables={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('viser hold, point og målforskel med fortegn', () => {
    render(<StandingsTable tables={tables} />);
    expect(screen.getByText('Brasilien')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
    expect(screen.getByText('+6')).toBeInTheDocument();
  });

  it('viser form-stime som bogstaver', () => {
    render(<StandingsTable tables={tables} />);
    // Form 'W,W,W' → tre W-badges for Brasilien (+ Schweiz' W/D/L)
    expect(screen.getAllByText('W').length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByText('L').length).toBeGreaterThanOrEqual(1);
  });
});
