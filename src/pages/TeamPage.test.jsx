import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../firebase', () => ({ db: {}, auth: {} }));
vi.mock('../features/matches/useMatches', () => ({ useMatches: vi.fn() }));

import TeamPage from './TeamPage';
import { useMatches } from '../features/matches/useMatches';

const DAY = 86400000;

function renderAt(code) {
  return render(
    <MemoryRouter initialEntries={[`/hold/${code}`]}>
      <Routes>
        <Route path="/hold/:code" element={<TeamPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const matches = [
  { id: 'a', round: 'group', groupName: 'A', homeTeam: 'BRA', awayTeam: 'ARG',
    kickoff: new Date(Date.now() - 2 * DAY), status: 'finished', result: { home: 2, away: 1 } },
  { id: 'b', round: 'group', groupName: 'A', homeTeam: 'DEN', awayTeam: 'BRA',
    kickoff: new Date(Date.now() - DAY), status: 'finished', result: { home: 3, away: 0 } },
  { id: 'c', round: 'group', groupName: 'A', homeTeam: 'BRA', awayTeam: 'FRA',
    kickoff: new Date(Date.now() + DAY), status: 'scheduled', result: null },
  { id: 'd', round: 'group', groupName: 'B', homeTeam: 'GER', awayTeam: 'ESP',
    kickoff: new Date(Date.now() + DAY), status: 'scheduled', result: null },
];

beforeEach(() => {
  useMatches.mockReturnValue({ matches, loading: false, error: null });
});

describe('TeamPage', () => {
  it('viser holdets navn og kun holdets kampe', () => {
    renderAt('BRA');
    expect(screen.getByRole('heading', { level: 1, name: 'Brasilien' })).toBeInTheDocument();
    // Spillede: a (vundet) + b (tabt). Kommende: c. Ikke d (andet hold).
    expect(screen.getByText('Spillede kampe')).toBeInTheDocument();
    expect(screen.getByText('Kommende kampe')).toBeInTheDocument();
    expect(screen.getByText('Argentina')).toBeInTheDocument();
    expect(screen.getByText('Frankrig')).toBeInTheDocument();
    expect(screen.queryByText('Spanien')).not.toBeInTheDocument();
  });

  it('viser udfald set fra holdet (vundet/tabt)', () => {
    renderAt('BRA');
    expect(screen.getByText('Vundet')).toBeInTheDocument();
    expect(screen.getByText('Tabt')).toBeInTheDocument();
    // V/U/T-optælling i headeren: 1 vundet, 0 uafgjort, 1 tabt.
    expect(screen.getByText('1 V · 0 U · 1 T')).toBeInTheDocument();
  });

  it('viser tom-tilstand / ukendt hold for ukendt kode', () => {
    renderAt('XXX');
    expect(screen.getByRole('heading', { level: 1, name: 'Ukendt hold' })).toBeInTheDocument();
    expect(screen.getByText(/Ingen kampe fundet/)).toBeInTheDocument();
  });
});
