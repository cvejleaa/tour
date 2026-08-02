// Tests for FootballTip — indkoblingen af Elo på kampkortene.
//
// Baggrund: hele <MatchElo/>-linjen kunne fjernes fra tip-fladen, uden at én
// af 1362 tests sagde fra. Denne fil dækker, at Elo faktisk NÅR ud på hvert
// kampkort — selve visningen er dækket i MatchElo.test.jsx.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

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
function UrlProbe() {
  const { search } = useLocation();
  return <output data-testid="url">{search}</output>;
}

const setup = (game = {}, url = '/spil/sl', matches = MATCHES) => render(
  <MemoryRouter initialEntries={[url]}>
    <Routes>
      <Route
        path="/spil/:gameId"
        element={(
          <FootballTip
            game={{ id: 'sl', type: 'football', teams: TEAMS, eloHistory: HISTORY, ...game }}
            me={{ uid: 'me', totalPoints: 100 }}
            matches={matches}
          />
        )}
      />
    </Routes>
    <UrlProbe />
  </MemoryRouter>,
);

// activeRound bygger på Date.now(), og kampene ligger i sep. 2026. Uden en
// frossen tid ville testen skifte betydning, når den dato passerer.
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-02T08:00:00Z'));
});
afterEach(() => vi.useRealTimers());

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

  it('skriver runden i URL\'en, når man bladrer', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /Næste runde/ }));
    expect(screen.getByTestId('url').textContent).toContain('runde=2');
    expect(screen.getByText(/Runde 2 af/)).toBeInTheDocument();
  });

  // Fanen må ikke gå tabt, når runden skifter.
  it('bevarer fanen ved rundeskift', () => {
    setup({}, '/spil/sl?fane=tip&runde=1');
    fireEvent.click(screen.getByRole('button', { name: /Næste runde/ }));
    const url = screen.getByTestId('url').textContent;
    expect(url).toContain('fane=tip');
    expect(url).toContain('runde=2');
  });

  // Elo må ikke vælte tip-fladen for et spil, der slet ikke har ratings.
  it('viser stadig kampene, når spillet slet ingen Elo har', () => {
    setup({ teams: [], eloHistory: undefined });
    expect(screen.getByText('AGF')).toBeInTheDocument();
    expect(screen.getByText('FC Midtjylland')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Slutresultatet på kampkortet.
//
// Målene har ligget på kampdokumentet siden sæsonstart, men blev ikke vist
// nogen steder: pladsen mellem holdnavnene var en hardkodet streg. Kortet
// kunne altså på én gang sige "Ramt +6,0" og lade som om resultatet var ukendt.
// ---------------------------------------------------------------------------
describe('FootballTip — slutresultat på kampkortet', () => {
  const SPILLET = new Date('2026-08-01T16:00:00Z'); // før den frosne tid

  const spillede = (extra = {}) => ([
    {
      id: 'p1', round: 1, home: 'AGF', away: 'F.C. København', kickoff: SPILLET,
      odds: { 1: 3.4, X: 6, 2: 1.8 }, result: '1', homeGoals: 3, awayGoals: 2, ...extra,
    },
  ]);

  it('viser scoren, når kampen er spillet', () => {
    setup({}, '/spil/sl', spillede());
    expect(screen.getByLabelText(/Slutresultat/)).toHaveTextContent('3 – 2');
  });

  it('nævner begge hold ved navn for skærmlæsere', () => {
    setup({}, '/spil/sl', spillede());
    // "3 – 2" alene oplæses uforudsigeligt; tallene skal knyttes til holdene.
    expect(screen.getByLabelText('Slutresultat: AGF 3, F.C. København 2')).toBeInTheDocument();
  });

  it('viser 0-0 i stedet for at skjule kampen', () => {
    setup({}, '/spil/sl', spillede({ result: 'X', homeGoals: 0, awayGoals: 0 }));
    expect(screen.getByLabelText(/Slutresultat/)).toHaveTextContent('0 – 0');
  });

  it('beholder stregen på en kamp, der ikke er spillet', () => {
    const { container } = setup();   // MATCHES ligger alle i fremtiden
    expect(screen.queryByLabelText(/Slutresultat/)).toBeNull();
    expect(container.querySelectorAll('.match-card__dash').length).toBeGreaterThan(0);
  });

  it('beholder stregen, når facit er sat men målene mangler', () => {
    // Kan ikke opstå fremadrettet (synken skriver dem sammen), men et gammelt
    // dokument må vise en streg frem for "NaN – NaN".
    setup({}, '/spil/sl', [{
      id: 'p2', round: 1, home: 'AGF', away: 'F.C. København', kickoff: SPILLET,
      odds: null, result: '1',
    }]);
    expect(screen.queryByLabelText(/Slutresultat/)).toBeNull();
  });

  it('markerer det udfald, der faktisk blev til noget', () => {
    const { container } = setup({}, '/spil/sl', spillede());
    const vundet = container.querySelectorAll('.pick--won');
    expect(vundet).toHaveLength(1);              // præcis ét udfald pr. kamp
    expect(vundet[0]).toHaveTextContent('1');    // hjemmesejr 3-2
  });

  // Klassen bærer CSS'en i theme.css. Uden en assertion kan stilarten dø
  // ubemærket, og scoren ville se ud som den streg, den erstattede.
  it('scoren bærer sin egen klasse (så CSS\'en ikke kan dø ubemærket)', () => {
    const { container } = setup({}, '/spil/sl', spillede());
    expect(container.querySelectorAll('.match-card__score')).toHaveLength(1);
    expect(container.querySelectorAll('.match-card__dash')).toHaveLength(0);
  });

  it('en afgjort kamp lover ikke længere point for at gætte rigtigt', () => {
    setup({}, '/spil/sl', spillede());
    const vinder = screen.getByTitle('1 blev udfaldet');
    expect(vinder).toBeInTheDocument();
    // De to tabende udfald beholder deres odds-tekst; kun vinderen skifter.
    expect(screen.getAllByTitle(/point hvis rigtigt/)).toHaveLength(2);
    expect(vinder.title).not.toMatch(/hvis rigtigt/);
  });

  it('markerer intet udfald, før kampen er afgjort', () => {
    const { container } = setup();
    expect(container.querySelectorAll('.pick--won')).toHaveLength(0);
  });
});
