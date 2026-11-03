/**
 * GamePage RENDERET med 📊 Grupper: fanen VISES for håndbold-VM med grupper,
 * et klik lander på fladen, og et dybt link ?fane=grupper uden evnen falder
 * igennem til Tip (Q14 — et valg, som ?fane=pulje uden pulje).
 * GamePage.test.jsx tester kun faneVises; render-grenen har sin egen gate.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

vi.mock('../firebase', () => ({ db: {}, auth: {}, functions: {} }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { uid: 'me' } }) }));
vi.mock('../features/games/gameActions', () => ({ joinGame: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  doc: () => ({}),
  onSnapshot: (_r, cb) => { cb({ exists: () => false, data: () => null }); return () => {}; },
}));
vi.mock('../features/games/GameLayout', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('../features/games/GameStandings', () => ({ default: () => null }));
vi.mock('../features/games/GameLeagues', () => ({ default: () => null }));
vi.mock('../features/games/GameProfile', () => ({ default: () => null }));
vi.mock('../features/games/football/FootballTip', () => ({ default: () => <div data-testid="tip-fladen" /> }));
vi.mock('../features/games/football/MyTips', () => ({ default: () => null }));
vi.mock('../features/games/football/PuljeTip', () => ({ default: () => null }));
vi.mock('../features/games/football/EloTable', () => ({ default: () => null }));
vi.mock('../features/games/football/HoldXgListe', () => ({ default: () => null }));
vi.mock('../features/games/football/HoldSide', () => ({ default: () => null }));
vi.mock('../features/games/football/FootballTable', () => ({ default: () => null }));
vi.mock('../features/games/football/FootballHelp', () => ({ default: () => null }));
vi.mock('../components/ScrollRaekke', () => ({ default: ({ children }) => <div>{children}</div> }));

let spil = null;
vi.mock('../features/games/useGame', async () => {
  const actual = await vi.importActual('../features/games/useGame');
  return {
    ...actual,
    useGame: () => ({ game: spil, me: { uid: 'me', totalPoints: 0 }, isMember: true, matches: mockKampe, loading: false }),
  };
});

import GamePage from './GamePage';
import { HVM27G, INDLEDENDE } from '../test/hvm2027Grupper';
import { GAMES } from '../../scripts/games.mjs';

const mockKampe = INDLEDENDE;

function UrlProbe() {
  const { search } = useLocation();
  return <output data-testid="url">{search}</output>;
}
const renderSide = (url) => render(
  <MemoryRouter initialEntries={[url]}>
    <Routes><Route path="/spil/:gameId" element={<GamePage />} /></Routes>
    <UrlProbe />
  </MemoryRouter>,
);

beforeEach(() => { spil = HVM27G; });

describe('GamePage — 📊 Grupper', () => {
  it('håndbold-VM med grupper: fanen står, og et klik viser grupperne', () => {
    renderSide('/spil/hvm2027');
    const fane = screen.getByRole('tab', { name: '📊 Grupper' });
    fireEvent.click(fane);
    expect(screen.getByTestId('url').textContent).toBe('?fane=grupper');
    expect(screen.getByRole('tab', { name: '📊 Grupper' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { name: '📊 Grupperne' })).toBeInTheDocument();
    expect(screen.getByTestId('gruppe-A')).toBeInTheDocument();
    expect(screen.queryByTestId('tip-fladen')).toBeNull();
  });

  it('Superligaen: ingen fane, og ?fane=grupper falder igennem til Tip', () => {
    spil = { ...GAMES.find((g) => g.id === 'superliga2627'), id: 'superliga2627' };
    renderSide('/spil/superliga2627?fane=grupper');
    expect(screen.queryByRole('tab', { name: '📊 Grupper' })).toBeNull();
    expect(screen.getByTestId('tip-fladen')).toBeInTheDocument();
    expect(screen.queryByTestId('gruppe-A')).toBeNull();
  });

  it('håndbold-VM med UGYLDIGE grupper: ingen fane, og det dybe link viser Tip', () => {
    spil = { ...HVM27G, grupper: { ...HVM27G.grupper, point: { sejr: 2, uafgjort: 2 } } };
    renderSide('/spil/hvm2027?fane=grupper');
    expect(screen.queryByRole('tab', { name: '📊 Grupper' })).toBeNull();
    expect(screen.getByTestId('tip-fladen')).toBeInTheDocument();
  });
});
