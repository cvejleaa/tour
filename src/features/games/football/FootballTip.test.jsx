// Tests for FootballTip — indkoblingen af Elo på kampkortene.
//
// Baggrund: hele <MatchElo/>-linjen kunne fjernes fra tip-fladen, uden at én
// af 1362 tests sagde fra. Denne fil dækker, at Elo faktisk NÅR ud på hvert
// kampkort — selve visningen er dækket i MatchElo.test.jsx.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../../../firebase', () => ({ db: {} }));

vi.mock('../useGameBets', () => ({ useGameBets: () => ({ betsByMatch: {}, loading: false }) }));
vi.mock('../useVisibleGameStandings', () => ({
  useVisibleGameStandings: () => ({ standings: [], leagues: [], leagueCount: 0, loading: false, error: null }),
}));
vi.mock('../betActions', () => ({ setBet: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock('./LeagueBets', () => ({ default: () => <div data-testid="liga-tips" /> }));
vi.mock('../../../components/ClubBadge', () => ({ default: () => <span /> }));

import FootballTip from './FootballTip';

const KICKOFF = new Date('2026-09-01T18:00:00Z');
const KICKOFF2 = new Date('2026-09-08T18:00:00Z');
// To runder, så rundenavigationen (og ?runde=) har noget at navigere MELLEM.
// Begge ligger i fremtiden, så runde 1 er den aktive.
const MATCHES = [
  { id: 'm1', round: 1, home: 'AGF', away: 'F.C. København', kickoff: KICKOFF, odds: null, result: null },
  { id: 'm2', round: 1, home: 'Brøndby IF', away: 'FC Midtjylland', kickoff: KICKOFF, odds: null, result: null },
  { id: 'm3', round: 2, home: 'F.C. København', away: 'Brøndby IF', kickoff: KICKOFF2, odds: null, result: null },
  { id: 'm4', round: 2, home: 'FC Midtjylland', away: 'AGF', kickoff: KICKOFF2, odds: null, result: null },
];

// To spillede runder, så der er udviklingspunkter at vise.
const HISTORY = [
  { round: 1, elo: { AGF: 1510, 'F.C. København': 1590, 'Brøndby IF': 1550, 'FC Midtjylland': 1450 } },
  { round: 2, elo: { AGF: 1525, 'F.C. København': 1620, 'Brøndby IF': 1540, 'FC Midtjylland': 1460 } },
];
// Navnene skal være dem fra seedet: eloHistory og kampenes home/away nøgles
// på name, ikke på forkortelsen. Bruger testen forkortelser, ville den bestå,
// selv om navne-matchningen var brudt i produktion.
const TEAMS = [
  { name: 'AGF', short: 'AGF', elo: 1500 },
  { name: 'F.C. København', short: 'FCK', elo: 1600 },
  { name: 'Brøndby IF', short: 'BIF', elo: 1560 },
  { name: 'FC Midtjylland', short: 'FCM', elo: 1440 },
];

// Runden ligger i URL'en, så komponenten skal stå i en router. Ruten matcher
// den rigtige (/spil/:gameId), så GameTabLink kan bygge sine stier.
const setup = (game = {}, url = '/spil/sl') => render(
  <MemoryRouter initialEntries={[url]}>
    <Routes>
      <Route
        path="/spil/:gameId"
        element={(
          <FootballTip
            game={{ id: 'sl', type: 'football', teams: TEAMS, eloHistory: HISTORY, ...game }}
            me={{ uid: 'me', totalPoints: 100 }}
            matches={MATCHES}
          />
        )}
      />
    </Routes>
  </MemoryRouter>,
);

beforeEach(() => vi.clearAllMocks());

describe('FootballTip — Elo på kampkortene', () => {
  it('viser Elo for begge hold på hver kamp i runden', () => {
    setup();
    expect(screen.getByTitle('AGF: rating 1525')).toBeInTheDocument();
    expect(screen.getByTitle('F.C. København: rating 1620')).toBeInTheDocument();
    expect(screen.getByTitle('Brøndby IF: rating 1540')).toBeInTheDocument();
    expect(screen.getByTitle('FC Midtjylland: rating 1460')).toBeInTheDocument();
  });

  it('viser udviklingspunkterne pr. hold', () => {
    setup();
    // To spillede runder → to punkter.
    expect(screen.getByLabelText(/AGF: udvikling over de seneste 2 runder/).children).toHaveLength(2);
  });

  // Sæsonens virkelighed lige nu: præcis én spillet runde.
  it('viser ét punkt, når kun én runde er spillet', () => {
    setup({ eloHistory: [HISTORY[0]] });
    expect(screen.getByLabelText(/AGF: udvikling seneste runde/).children).toHaveLength(1);
    expect(screen.getByTitle('AGF: rating 1510')).toBeInTheDocument();
  });

  // Har spillet ingen egne hold, falder opslaget tilbage til Superliga-seedet.
  // Uden det ville kampkortene stå uden Elo for et spil, der ellers har historik.
  it('falder tilbage til Superliga-seedet, når spillet ikke har egne hold', () => {
    setup({ teams: undefined });
    expect(screen.getByTitle('AGF: rating 1525')).toBeInTheDocument();
  });

  it('viser start-rating, når ingen runder er spillet', () => {
    setup({ eloHistory: [] });
    expect(screen.getByTitle('AGF: rating 1500')).toBeInTheDocument();
    expect(screen.getAllByText(/Start-rating/).length).toBeGreaterThan(0);
  });

  // ── Runden i URL'en ────────────────────────────────────────────────────────
  // setup() tog imod en url, men ingen test brugte den: intet beviste, at
  // ?runde= bliver LÆST eller SKREVET.

  it('åbner den runde, URL\'en peger på', () => {
    setup({}, '/spil/sl?runde=2');
    expect(screen.getByText(/Runde 2 af/)).toBeInTheDocument();
  });

  it('viser den aktive runde, når URL\'en ikke siger noget', () => {
    setup();
    expect(screen.getByText(/Runde 1 af/)).toBeInTheDocument();
  });

  // En delt eller redigeret URL må ikke give en tom side.
  it('falder tilbage til den aktive runde ved en runde, der ikke findes', () => {
    setup({}, '/spil/sl?runde=99');
    expect(screen.getByText(/Runde 1 af/)).toBeInTheDocument();
  });

  it('ignorerer en ugyldig runde-parameter', () => {
    setup({}, '/spil/sl?runde=abc');
    expect(screen.getByText(/Runde 1 af/)).toBeInTheDocument();
  });

  // Elo må ikke vælte tip-fladen for et spil, der slet ikke har ratings.
  it('viser stadig kampene, når spillet slet ingen Elo har', () => {
    setup({ teams: [], eloHistory: undefined });
    expect(screen.getByText('AGF')).toBeInTheDocument();
    expect(screen.getByText('FC Midtjylland')).toBeInTheDocument();
  });
});
