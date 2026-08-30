// ---------------------------------------------------------------------------
// HOLD-LISTEN SKAL FAKTISK STÅ PÅ ELO-FANEN — ikke bare kunne renderes.
//
// Samme slags fil som `klubRingFlader.test.jsx`, og af samme grund: al øvrig
// dækning af `HoldXgListe` renderer komponenten DIREKTE i sin egen router og
// beviser dermed kun, at komponenten virker — ikke at nogen viser den.
// Test Manager slukkede hele wiringen (`{false && harXg(game) && …}` i
// GamePage.jsx) og fik 2940 grønne tests. Det er præcis formen på
// "Synk kamptider nu"-knappen, der manglede for Superligaen i månedsvis:
// evnen var bygget, fladen var det ikke, og ingen test kiggede på klik-stien.
//
// Her renderes GamePage selv, på den fane en bruger faktisk klikker på.
// ---------------------------------------------------------------------------
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: () => ({}),
  onSnapshot: (_r, cb) => { cb({ exists: () => false, data: () => null }); return () => {}; },
}));
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'me' }, profile: { displayName: 'Bo Bibamus' } }),
}));
vi.mock('./useGameStandings', () => ({ useGameStandings: () => ({ standings: [] }) }));
vi.mock('./useGameLeagues', () => ({ useGameLeagues: () => ({ leagues: [], loading: false, error: null }) }));
vi.mock('./useGameBets', () => ({ useGameBets: () => ({ betsByMatch: {} }) }));
vi.mock('./useGame', () => ({ useGame: () => mockGame() }));
vi.mock('./useVisibleGameStandings', () => ({
  useVisibleGameStandings: () => ({
    standings: [], leagues: [], leagueCount: 0, loading: false, error: null,
  }),
}));
const mockGame = vi.fn();

const { default: GamePage } = await import('../../pages/GamePage');

const HOLD = ['AGF', 'OB', 'FCK', 'BIF'].map((name) => ({ name, short: name, elo: 1500 }));
// Fire hold à tre kampe med målchancer — nøjagtig på gulvet. Med ét mindre
// forsvinder listen lovligt, og så ville testen bestå uden at måle noget.
const KAMPE = HOLD.flatMap((t, ti) => Array.from({ length: 3 }, (_, i) => ({
  id: `${t.name}-${i}`, round: i + 1, home: t.name, away: 'Z', kickoff: 1000 + i,
  result: '1', homeGoals: 2 + ti, awayGoals: 0, xgHome: 1, xgAway: 1,
})));

const spil = (extra) => ({ id: 'sl', type: 'football', name: 'Superligaen', teams: HOLD, ...extra });

function visElo(game, matches = KAMPE) {
  mockGame.mockReturnValue({
    game, me: { uid: 'me' }, isMember: true, matches, loading: false,
  });
  return render(
    <MemoryRouter initialEntries={['/spil/sl?fane=elo']}>
      <Routes><Route path="/spil/:gameId" element={<GamePage />} /></Routes>
    </MemoryRouter>,
  );
}

describe('GamePage viser hold-listen på Elo-fanen', () => {
  it('står på fanen for et spil, hvis kilde har målchancer', () => {
    visElo(spil({ sync: { provider: 'superliga' } }));
    expect(screen.getByText(/Mål og målchancer — hold for hold/)).toBeInTheDocument();
    // Og med indhold, ikke bare en overskrift: uden rækker beviser kortet intet.
    expect(screen.getAllByText('AGF').length).toBeGreaterThan(0);
  });

  it('står SAMMEN med Elo-tabellen, ikke i stedet for den', () => {
    // Søskende, ikke afløser. Byttede man dem om, ville testen ovenfor stadig
    // være grøn, mens Elo-tabellen var væk fra fanen.
    visElo(spil({ sync: { provider: 'superliga' } }));
    expect(screen.getByText(/Elo-rating gennem sæsonen/)).toBeInTheDocument();
    expect(screen.getByText(/Mål og målchancer — hold for hold/)).toBeInTheDocument();
  });

  it('er VÆK for et spil, hvis kilde ikke kan levere målchancer', () => {
    // Gaten er `harXg`, ikke en nabo-egenskab. Et spil uden xG-kilde må ikke
    // få et tomt kort — og Elo-tabellen skal stadig være der.
    visElo(spil({ sync: { provider: 'ukendt' } }));
    expect(screen.queryByText(/Mål og målchancer — hold for hold/)).toBeNull();
    expect(screen.getByText(/Elo-rating gennem sæsonen/)).toBeInTheDocument();
  });

  it('er VÆK for et spil helt uden kilde', () => {
    visElo(spil({}));
    expect(screen.queryByText(/Mål og målchancer — hold for hold/)).toBeNull();
  });

  it('er VÆK, når ét holds side er åbnet med ?hold= — den er en oversigt', () => {
    mockGame.mockReturnValue({
      game: spil({ sync: { provider: 'superliga' } }),
      me: { uid: 'me' }, isMember: true, matches: KAMPE, loading: false,
    });
    render(
      <MemoryRouter initialEntries={['/spil/sl?fane=elo&hold=AGF']}>
        <Routes><Route path="/spil/:gameId" element={<GamePage />} /></Routes>
      </MemoryRouter>,
    );
    expect(screen.queryByText(/Mål og målchancer — hold for hold/)).toBeNull();
    // Holdsidens eget kort er der derimod — samme tal, ét hold.
    expect(screen.getByText(/Mål og målchancer \(xG\)/)).toBeInTheDocument();
  });
});
