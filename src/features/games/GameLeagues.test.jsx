// Tests for GameLeagues — især ?liga=, som "Åbn ligaen →" i stillingen sætter.
// Uden forvalget lander man på en liste, hvor alt er foldet sammen, og linket
// lover mere, end klikket giver.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../../firebase', () => ({ db: {} }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { uid: 'me' } }) }));

const mockLeagues = vi.fn();
vi.mock('./useGameLeagues', () => ({ useGameLeagues: () => mockLeagues() }));
vi.mock('./useGameStandings', () => ({
  useGameStandings: () => ({ standings: [], leagues: [], loading: false, error: null }),
}));
vi.mock('./useLeagueMessages', () => ({
  useLeagueMessages: () => ({ messages: [], loading: false }),
}));
vi.mock('./useLeagueQuestions', () => ({
  useLeagueQuestions: () => ({ questions: [], answers: [], loading: false }),
}));
vi.mock('./LeagueQuestions', () => ({ default: () => <div /> }));
vi.mock('../../components/Avatar', () => ({ default: () => <span /> }));

import GameLeagues from './GameLeagues';

const LEAGUES = [
  { id: 'L1', name: 'Kontoret', ownerUid: 'anden', memberUids: ['me'], code: 'AAA111' },
  { id: 'L2', name: 'Familien', ownerUid: 'anden', memberUids: ['me'], code: 'BBB222' },
];

const setup = (url = '/spil/sl?fane=ligaer') => render(
  <MemoryRouter initialEntries={[url]}>
    <Routes>
      <Route path="/spil/:gameId" element={<GameLeagues gameId="sl" />} />
    </Routes>
  </MemoryRouter>,
);

/** Er ligaens kort foldet ud? Væggens skrivefelt findes kun i åben tilstand. */
const antalÅbne = () => screen.queryAllByPlaceholderText(/Skriv/i).length;

beforeEach(() => {
  vi.clearAllMocks();
  mockLeagues.mockReturnValue({ leagues: LEAGUES, loading: false, error: null });
});

describe('GameLeagues — forvalgt liga', () => {
  it('folder alt sammen uden ?liga=', () => {
    setup();
    expect(screen.getByText('Kontoret')).toBeInTheDocument();
    expect(antalÅbne()).toBe(0);
  });

  it('folder præcis den liga ud, ?liga= peger på', () => {
    setup('/spil/sl?fane=ligaer&liga=L2');
    // Ét kort åbent — ikke nul, og ikke dem alle.
    expect(antalÅbne()).toBe(1);
  });

  it('folder intet ud, når ?liga= peger på en liga, man ikke er med i', () => {
    setup('/spil/sl?fane=ligaer&liga=findes-ikke');
    expect(antalÅbne()).toBe(0);
  });
});
