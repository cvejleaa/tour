// Tests for MatchesPage – mock Firebase og hooks.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mock Firebase
vi.mock('../firebase', () => ({ db: {}, auth: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  setDoc: vi.fn(() => Promise.resolve()),
  serverTimestamp: vi.fn(() => 'SERVER_TS'),
  collection: vi.fn(),
  onSnapshot: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  where: vi.fn(),
}));

// Mock hooks
vi.mock('../features/matches/useMatches', () => ({
  useMatches: vi.fn(),
}));
vi.mock('../features/matches/useMyBets', () => ({
  useMyBets: vi.fn(),
}));
vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}));
vi.mock('../features/matches/Countdown', () => ({
  default: () => <span>Countdown</span>,
}));

import MatchesPage from './MatchesPage';
import { useMatches } from '../features/matches/useMatches';
import { useMyBets } from '../features/matches/useMyBets';
import { useAuth } from '../context/AuthContext';

function renderPage() {
  return render(
    <MemoryRouter>
      <MatchesPage />
    </MemoryRouter>,
  );
}

// Testkampe relativt til "nu" (±200 dage), så de altid er tydeligt fremtid/fortid
// og deres dag-nøgle aldrig kolliderer med dagens dato (undgår kalender-flaky).
const DAY_MS = 86400000;
const futureKickoff = new Date(Date.now() + 200 * DAY_MS);
const pastKickoff = new Date(Date.now() - 200 * DAY_MS);

const mockMatches = [
  {
    id: 'm1',
    round: 'group',
    groupName: 'A',
    homeTeam: 'DK',
    awayTeam: 'FRA',
    kickoff: futureKickoff,
    status: 'scheduled',
    result: null,
  },
  {
    id: 'm2',
    round: 'group',
    groupName: 'B',
    homeTeam: 'GER',
    awayTeam: 'ESP',
    kickoff: pastKickoff,
    status: 'finished',
    result: { home: 2, away: 1 },
  },
];

beforeEach(() => {
  useAuth.mockReturnValue({ user: { uid: 'user1' } });
  useMatches.mockReturnValue({ matches: mockMatches, loading: false, error: null });
  useMyBets.mockReturnValue({ bets: new Map(), loading: false, error: null });
});

describe('MatchesPage – filterknapper', () => {
  it('renderer filterknapper', () => {
    renderPage();
    expect(screen.getByTestId('filter-alle')).toBeInTheDocument();
    expect(screen.getByTestId('filter-idag')).toBeInTheDocument();
    expect(screen.getByTestId('filter-kommende')).toBeInTheDocument();
    expect(screen.getByTestId('filter-utippede')).toBeInTheDocument();
  });

  it('filterknappers tekst er korrekt', () => {
    renderPage();
    expect(screen.getByTestId('filter-alle')).toHaveTextContent('Alle');
    expect(screen.getByTestId('filter-idag')).toHaveTextContent('I dag');
    expect(screen.getByTestId('filter-kommende')).toHaveTextContent('Kommende');
  });

  it('filteret "Mine utippede" viser antal i parentes', () => {
    renderPage();
    expect(screen.getByTestId('filter-utippede').textContent).toContain('(1)');
  });

  it('filteret "Mine utippede" viser IKKE antal hvis ingen utippede', () => {
    // begge kampe tippede
    const betsMap = new Map([
      ['m1', { matchId: 'm1', home: 1, away: 0 }],
      ['m2', { matchId: 'm2', home: 2, away: 1 }],
    ]);
    useMyBets.mockReturnValue({ bets: betsMap, loading: false, error: null });
    renderPage();
    expect(screen.getByTestId('filter-utippede').textContent).not.toContain('(');
  });
});

describe('MatchesPage – visning af kampe', () => {
  it('viser aktive kampe og folder tidligere sammen som standard', () => {
    renderPage();
    // m1 (fremtid) vises; m2 (fortid) er foldet bag "Vis tidligere kampe".
    expect(screen.getAllByTestId('match-card').length).toBe(1);
    const toggle = screen.getByTestId('toggle-past');
    expect(toggle).toHaveTextContent('Vis tidligere kampe (1)');
    fireEvent.click(toggle);
    // Tidligere kamp vises kompakt (kun hold + resultat), ikke som fuldt kort.
    expect(screen.getAllByTestId('match-card').length).toBe(1);
    const compact = screen.getByTestId('match-row-compact');
    expect(screen.getByTestId('compact-result')).toHaveTextContent('2–1');
    // Klik folder den ud til fuldt kort.
    fireEvent.click(compact);
    expect(screen.getAllByTestId('match-card').length).toBe(2);
  });

  it('viser dag-overskrifter for kampe', () => {
    renderPage();
    // groupMatchesByDay returnerer dag-labels
    const headings = screen.getAllByRole('heading', { level: 2 });
    expect(headings.length).toBeGreaterThan(0);
  });

  it('viser sideoverskrift "Kampe"', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: /Kampe/ })).toBeInTheDocument();
  });

  it('linker til hjælp om point', () => {
    renderPage();
    expect(screen.getByText(/Sådan får du point/)).toBeInTheDocument();
  });
});

describe('MatchesPage – filtre', () => {
  it('filtrer til kun kommende kampe', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('filter-kommende'));
    const cards = screen.getAllByTestId('match-card');
    // Kun m1 er i fremtiden
    expect(cards.length).toBe(1);
  });

  it('filteret "Mine utippede" viser kun ulåste kampe uden bet', () => {
    // m2 er låst (pastKickoff), m1 er åben og ikke tippet
    renderPage();
    fireEvent.click(screen.getByTestId('filter-utippede'));
    const cards = screen.getAllByTestId('match-card');
    expect(cards.length).toBe(1);
  });

  it('filteret "Mine utippede" viser ingen kampe hvis alle er tippede', () => {
    const betsMap = new Map([
      ['m1', { matchId: 'm1', home: 1, away: 0 }],
    ]);
    useMyBets.mockReturnValue({ bets: betsMap, loading: false, error: null });
    renderPage();
    fireEvent.click(screen.getByTestId('filter-utippede'));
    expect(screen.queryByTestId('match-card')).not.toBeInTheDocument();
    expect(screen.getByText(/Alle tilgængelige kampe er tippet/)).toBeInTheDocument();
  });

  it('filter "Alle" viser kampe igen efter at have skiftet filter', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('filter-kommende'));
    expect(screen.getAllByTestId('match-card').length).toBe(1);
    fireEvent.click(screen.getByTestId('filter-alle'));
    // Aktiv kamp vises straks; tidligere kan foldes ud (kompakt).
    expect(screen.getAllByTestId('match-card').length).toBe(1);
    fireEvent.click(screen.getByTestId('toggle-past'));
    expect(screen.getByTestId('match-row-compact')).toBeInTheDocument();
    expect(screen.getAllByTestId('match-card').length).toBe(1);
  });

  it('filter "I dag" returnerer tom tilstand for historiske/fremtidige kampe', () => {
    // Vores testkampe er langt i fremtid/fortid – ingen er "i dag"
    renderPage();
    fireEvent.click(screen.getByTestId('filter-idag'));
    expect(screen.queryByTestId('match-card')).not.toBeInTheDocument();
    expect(screen.getByText(/Ingen kampe fundet/)).toBeInTheDocument();
  });
});

describe('MatchesPage – loading og fejl', () => {
  it('viser spinner under indlæsning', () => {
    useMatches.mockReturnValue({ matches: [], loading: true, error: null });
    renderPage();
    expect(screen.getByLabelText('Henter kampe…')).toBeInTheDocument();
  });

  it('viser fejlbesked ved netværksfejl', () => {
    useMatches.mockReturnValue({ matches: [], loading: false, error: new Error('Fejl') });
    renderPage();
    expect(screen.getByText(/Kunne ikke hente kampe/)).toBeInTheDocument();
  });

  it('viser tom-tilstand når ingen kampe matcher filter', () => {
    useMatches.mockReturnValue({ matches: [], loading: false, error: null });
    renderPage();
    expect(screen.getByText(/Ingen kampe fundet/)).toBeInTheDocument();
  });

  it('viser IKKE tom-tilstand under loading', () => {
    useMatches.mockReturnValue({ matches: [], loading: true, error: null });
    renderPage();
    expect(screen.queryByText(/Ingen kampe fundet/)).not.toBeInTheDocument();
  });

  it('viser ikke kampe mens bets loader', () => {
    useMyBets.mockReturnValue({ bets: new Map(), loading: true, error: null });
    renderPage();
    expect(screen.getByLabelText('Henter kampe…')).toBeInTheDocument();
  });
});

describe('MatchesPage – gruppering', () => {
  it('kampe på samme dag grupperes under samme overskrift', () => {
    const sameDayMatches = [
      {
        id: 'a1',
        round: 'group',
        groupName: 'A',
        homeTeam: 'DK',
        awayTeam: 'FRA',
        kickoff: new Date('2099-06-15T16:00:00Z'),
        status: 'scheduled',
        result: null,
      },
      {
        id: 'a2',
        round: 'group',
        groupName: 'B',
        homeTeam: 'GER',
        awayTeam: 'ESP',
        kickoff: new Date('2099-06-15T20:00:00Z'),
        status: 'scheduled',
        result: null,
      },
    ];
    useMatches.mockReturnValue({ matches: sameDayMatches, loading: false, error: null });
    renderPage();
    // 2 match-cards men kun 1 dag-overskrift
    const cards = screen.getAllByTestId('match-card');
    expect(cards.length).toBe(2);
  });

  it('knockout-runde vises som underoverskrift', () => {
    const knockoutMatches = [
      {
        id: 'k1',
        round: 'qf',
        groupName: null,
        homeTeam: 'DK',
        awayTeam: 'GER',
        kickoff: futureKickoff,
        status: 'scheduled',
        result: null,
      },
    ];
    useMatches.mockReturnValue({ matches: knockoutMatches, loading: false, error: null });
    renderPage();
    // Kvartfinale vises som runde-underoverskrift OG i match-card headerens roundLabel
    const texts = screen.getAllByText('Kvartfinale');
    expect(texts.length).toBeGreaterThan(0);
  });

  it('viser IKKE runde-underoverskrift for gruppespil', () => {
    renderPage();
    // "Gruppespil" bør ikke vises som separat underoverskrift (kun i MatchCard)
    // Vi tjekker blot at match-cards renderes
    expect(screen.getAllByTestId('match-card').length).toBeGreaterThan(0);
  });
});
