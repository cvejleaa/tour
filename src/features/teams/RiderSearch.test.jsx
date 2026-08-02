// Tests for RiderSearch – rytter-søgefeltet på /hold.
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RiderSearch from './RiderSearch';
import { buildRiderIndex } from './riderSearch';

const TEAMS = [
  { code: 'TVL', name: 'Team Visma | Lease a Bike' },
  { code: 'UEX', name: 'UAE Team Emirates XRG' },
];
const RIDERS = {
  TVL: [{ name: 'Jonas Vingegaard', country: 'Danmark', leader: true }],
  UEX: [{ name: 'Tadej Pogačar', country: 'Slovenien' }],
};
const index = buildRiderIndex(TEAMS, (c) => RIDERS[c] || [], (n) => n);

function renderSearch() {
  return render(<MemoryRouter><RiderSearch index={index} /></MemoryRouter>);
}

describe('RiderSearch', () => {
  it('viser ingen resultater før man søger', () => {
    renderSearch();
    expect(screen.getByTestId('rider-search-input')).toBeInTheDocument();
    expect(screen.queryByTestId('rider-search-results')).toBeNull();
  });

  it('finder en rytter og linker til holdsiden', () => {
    renderSearch();
    fireEvent.change(screen.getByTestId('rider-search-input'), { target: { value: 'pogacar' } });
    const results = screen.getAllByTestId('rider-result');
    expect(results).toHaveLength(1);
    expect(screen.getByText('Tadej Pogačar')).toBeInTheDocument();
    expect(results[0]).toHaveAttribute('href', '/hold/UEX');
  });

  it('markerer hovednavn og viser besked når intet findes', () => {
    renderSearch();
    const input = screen.getByTestId('rider-search-input');
    fireEvent.change(input, { target: { value: 'vingegaard' } });
    expect(screen.getByTitle('Hovednavn')).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'ukendtxyz' } });
    expect(screen.getByTestId('rider-search-results')).toHaveTextContent('Ingen ryttere fundet');
  });
});
