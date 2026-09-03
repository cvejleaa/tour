/**
 * GamePage RENDERET: "Vend tilbage"-kortet er bundet til me.forladt.
 * GamePage.test.jsx tester kun de rene fane-funktioner — Test Manager fandt,
 * at isMember-vagten i useGame kunne fjernes med hele suiten grøn.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('../firebase', () => ({ db: {}, auth: {}, functions: {} }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { uid: 'me' } }) }));
vi.mock('../features/games/gameActions', () => ({ joinGame: vi.fn().mockResolvedValue({ ok: true }) }));
// Tunge faner og layout ud af billedet — testen handler om kortet før fanerne.
vi.mock('../features/games/GameLayout', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('../features/games/GameStandings', () => ({ default: () => null }));
vi.mock('../features/games/GameLeagues', () => ({ default: () => null }));
vi.mock('../features/games/GameProfile', () => ({ default: () => null }));
vi.mock('../features/games/football/FootballTip', () => ({ default: () => null }));
vi.mock('../features/games/football/MyTips', () => ({ default: () => null }));
vi.mock('../features/games/football/PuljeTip', () => ({ default: () => null }));
vi.mock('../features/games/football/EloTable', () => ({ default: () => null }));
vi.mock('../features/games/football/HoldXgListe', () => ({ default: () => null }));
vi.mock('../features/games/football/HoldSide', () => ({ default: () => null }));
vi.mock('../features/games/football/FootballTable', () => ({ default: () => null }));
vi.mock('../features/games/football/FootballHelp', () => ({ default: () => null }));
vi.mock('../components/ScrollRaekke', () => ({ default: ({ children }) => <div>{children}</div> }));

let me = null;
vi.mock('../features/games/useGame', async () => {
  const actual = await vi.importActual('../features/games/useGame');
  return {
    ...actual,
    useGame: () => ({
      game: { id: 'sl', name: 'Superligaen', type: 'football', status: 'open' },
      me,
      // Samme regel som hooken: forladt er ikke medlem. Testen nedenfor
      // efterprøver KUN kortet — hookens egen regel har sin egen test.
      isMember: me != null && me.forladt !== true,
      matches: [],
      loading: false,
    }),
  };
});

import GamePage from './GamePage';

function renderSide() {
  return render(
    <MemoryRouter initialEntries={['/spil/sl']}>
      <Routes><Route path="/spil/:gameId" element={<GamePage />} /></Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => { me = null; });

describe('GamePage — kortet før fanerne', () => {
  it('uden deltagelse: "Deltag i …" og et løfte, der er sandt for arkiv-modellen', () => {
    renderSide();
    expect(screen.getByRole('heading', { name: 'Deltag i Superligaen' })).toBeInTheDocument();
    expect(screen.getByText(/kommer du tilbage i sæsonen, får du din stilling igen/)).toBeInTheDocument();
    expect(screen.queryByText(/så længe du ikke har point/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deltag' })).toBeInTheDocument();
  });

  it('forladt: "Vend tilbage til …", stillingen står klar, ligaerne skal meldes ind igen — ingen faner', () => {
    me = { uid: 'me', forladt: true, totalPoints: 12.5 };
    renderSide();
    expect(screen.getByRole('heading', { name: 'Vend tilbage til Superligaen' })).toBeInTheDocument();
    expect(screen.getByText(/Din stilling står klar i arkivet/)).toBeInTheDocument();
    expect(screen.getByText(/dine ligaer skal du melde dig ind i igen/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vend tilbage' })).toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });

  it('aktiv deltager: fanerne, intet kort', () => {
    me = { uid: 'me', totalPoints: 3 };
    renderSide();
    expect(screen.queryByRole('heading', { name: /Deltag i|Vend tilbage/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole('tab').length).toBeGreaterThan(0);
  });
});
