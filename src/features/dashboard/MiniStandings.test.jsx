import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MiniStandings from './MiniStandings';

const standings = [
  { uid: 'a', displayName: 'Anna', totalPoints: 30 },
  { uid: 'b', displayName: 'Bo', totalPoints: 20 },
  { uid: 'c', displayName: 'Cecilie', totalPoints: 10 },
  { uid: 'd', displayName: 'David', totalPoints: 8 },
  { uid: 'e', displayName: 'Emil', totalPoints: 5 },
];

const renderEl = (uid) =>
  render(<MemoryRouter><MiniStandings standings={standings} uid={uid} /></MemoryRouter>);

describe('MiniStandings', () => {
  it('viser top 3 plus brugerens egen række når man er udenfor top 3', () => {
    renderEl('e');
    expect(screen.getByText('Anna')).toBeInTheDocument();
    expect(screen.getByText('Cecilie')).toBeInTheDocument();
    expect(screen.queryByText('David')).not.toBeInTheDocument(); // nr. 4, ikke mig
    expect(screen.getByText('Emil')).toBeInTheDocument();        // mig (nr. 5)
  });

  it('rendrer intet uden stilling', () => {
    const { container } = render(<MemoryRouter><MiniStandings standings={[]} uid="a" /></MemoryRouter>);
    expect(container).toBeEmptyDOMElement();
  });
});
