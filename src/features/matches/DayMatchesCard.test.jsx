import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DayMatchesCard from './DayMatchesCard';

const DAY = 86400000;
const renderCard = (matches) =>
  render(<MemoryRouter><DayMatchesCard matches={matches} /></MemoryRouter>);

describe('DayMatchesCard', () => {
  it('viser dagens kampe og kan bladre til en anden dag', () => {
    const today = new Date();
    const tomorrow = new Date(Date.now() + DAY);
    const matches = [
      { id: 'a', homeTeam: 'BRA', awayTeam: 'ARG', kickoff: today, status: 'finished', result: { home: 2, away: 1 } },
      { id: 'b', homeTeam: 'GER', awayTeam: 'ESP', kickoff: tomorrow, status: 'scheduled', result: null },
    ];
    renderCard(matches);
    // I dag: Brasilien–Argentina med resultat.
    expect(screen.getByText('Brasilien')).toBeInTheDocument();
    expect(screen.getByText('2–1')).toBeInTheDocument();
    expect(screen.queryByText('Tyskland')).not.toBeInTheDocument();
    // Bladr en dag frem.
    fireEvent.click(screen.getByTestId('day-next'));
    expect(screen.getByText('Tyskland')).toBeInTheDocument();
    expect(screen.queryByText('Brasilien')).not.toBeInTheDocument();
  });

  it('rendrer intet uden kampe', () => {
    const { container } = renderCard([]);
    expect(container).toBeEmptyDOMElement();
  });
});
