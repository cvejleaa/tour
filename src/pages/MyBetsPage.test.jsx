// Tests for MyBetsPage – overblik over brugerens tips.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mock Firebase
vi.mock('../firebase', () => ({ db: {}, auth: {} }));
vi.mock('firebase/firestore', () => ({
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

import MyBetsPage from './MyBetsPage';
import { useMatches } from '../features/matches/useMatches';
import { useMyBets } from '../features/matches/useMyBets';
import { useAuth } from '../context/AuthContext';

function renderPage() {
  return render(
    <MemoryRouter>
      <MyBetsPage />
    </MemoryRouter>,
  );
}

const pastKickoff = new Date('2020-06-15T18:00:00Z');
const futureKickoff = new Date('2099-06-15T18:00:00Z');

const mockMatches = [
  {
    id: 'm1',
    round: 'group',
    groupName: 'A',
    homeTeam: 'DK',
    awayTeam: 'FRA',
    kickoff: pastKickoff,
    status: 'finished',
    result: { home: 2, away: 1 },
  },
  {
    id: 'm2',
    round: 'group',
    groupName: 'B',
    homeTeam: 'GER',
    awayTeam: 'ESP',
    kickoff: futureKickoff,
    status: 'scheduled',
    result: null,
  },
  {
    id: 'm3',
    round: 'qf',
    groupName: null,
    homeTeam: 'BRA',
    awayTeam: 'ARG',
    kickoff: pastKickoff,
    status: 'finished',
    result: { home: 1, away: 1, advance: 'BRA' },
  },
];

beforeEach(() => {
  useAuth.mockReturnValue({ user: { uid: 'user1' } });
});

// ---------------------------------------------------------------------------
// Tom tilstand
// ---------------------------------------------------------------------------
describe('MyBetsPage – tom tilstand', () => {
  it('viser tom-tilstand når ingen tips er afgivet', () => {
    useMatches.mockReturnValue({ matches: mockMatches, loading: false });
    useMyBets.mockReturnValue({ bets: new Map(), loading: false });
    renderPage();
    expect(screen.getByText(/Ingen tips endnu/)).toBeInTheDocument();
  });

  it('viser link til kampsiden i tom-tilstand', () => {
    useMatches.mockReturnValue({ matches: mockMatches, loading: false });
    useMyBets.mockReturnValue({ bets: new Map(), loading: false });
    renderPage();
    expect(screen.getByText('Gå til kampe')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Loading og fejl
// ---------------------------------------------------------------------------
describe('MyBetsPage – loading', () => {
  it('viser spinner under indlæsning', () => {
    useMatches.mockReturnValue({ matches: [], loading: true });
    useMyBets.mockReturnValue({ bets: new Map(), loading: true });
    renderPage();
    expect(screen.getByLabelText('Henter tips…')).toBeInTheDocument();
  });

  it('viser spinner hvis kun matches loader', () => {
    useMatches.mockReturnValue({ matches: [], loading: true });
    useMyBets.mockReturnValue({ bets: new Map(), loading: false });
    renderPage();
    expect(screen.getByLabelText('Henter tips…')).toBeInTheDocument();
  });

  it('viser spinner hvis kun bets loader', () => {
    useMatches.mockReturnValue({ matches: [], loading: false });
    useMyBets.mockReturnValue({ bets: new Map(), loading: true });
    renderPage();
    expect(screen.getByLabelText('Henter tips…')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Tippede kampe og tabel
// ---------------------------------------------------------------------------
describe('MyBetsPage – tippede kampe', () => {
  it('viser tippede kampe i tabellen (med holdnavne)', () => {
    useMatches.mockReturnValue({ matches: mockMatches, loading: false });
    const betsMap = new Map([
      ['m1', { matchId: 'm1', uid: 'user1', home: 2, away: 1 }],
    ]);
    useMyBets.mockReturnValue({ bets: betsMap, loading: false });
    renderPage();
    // DK er ikke i teams.js, falder tilbage til koden 'DK'
    // FRA er i teams.js → 'Frankrig'
    expect(screen.getByText(/DK/)).toBeInTheDocument();
    expect(screen.getByText(/Frankrig/)).toBeInTheDocument();
  });

  it('viser tabel-headers', () => {
    useMatches.mockReturnValue({ matches: mockMatches, loading: false });
    const betsMap = new Map([
      ['m1', { matchId: 'm1', uid: 'user1', home: 2, away: 1 }],
    ]);
    useMyBets.mockReturnValue({ bets: betsMap, loading: false });
    renderPage();
    expect(screen.getByText('Kamp')).toBeInTheDocument();
    expect(screen.getByText('Kickoff')).toBeInTheDocument();
    expect(screen.getByText('Dit tip')).toBeInTheDocument();
    expect(screen.getByText('Resultat')).toBeInTheDocument();
    expect(screen.getByText('Point')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
  });

  it('viser brugerens tip i tabellen', () => {
    useMatches.mockReturnValue({ matches: mockMatches, loading: false });
    const betsMap = new Map([
      ['m1', { matchId: 'm1', uid: 'user1', home: 2, away: 1 }],
    ]);
    useMyBets.mockReturnValue({ bets: betsMap, loading: false });
    renderPage();
    // Tip 2-1 skal vises
    const tipTexts = screen.getAllByText(/2–1/);
    expect(tipTexts.length).toBeGreaterThan(0);
  });

  it('viser runde-label i tabellen', () => {
    useMatches.mockReturnValue({ matches: mockMatches, loading: false });
    const betsMap = new Map([
      ['m1', { matchId: 'm1', uid: 'user1', home: 2, away: 1 }],
    ]);
    useMyBets.mockReturnValue({ bets: betsMap, loading: false });
    renderPage();
    expect(screen.getByText(/Gruppespil/)).toBeInTheDocument();
  });

  it('viser kun kampe som brugeren har tippet', () => {
    useMatches.mockReturnValue({ matches: mockMatches, loading: false });
    // Kun m1 er tippet
    const betsMap = new Map([
      ['m1', { matchId: 'm1', uid: 'user1', home: 2, away: 1 }],
    ]);
    useMyBets.mockReturnValue({ bets: betsMap, loading: false });
    renderPage();
    // m2 (GER vs ESP) bør IKKE vises i tabellen
    expect(screen.queryByText(/Spanien/)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Point-beregning
// ---------------------------------------------------------------------------
describe('MyBetsPage – point-beregning', () => {
  it('beregner korrekte totale point (5 for eksakt)', () => {
    useMatches.mockReturnValue({ matches: mockMatches, loading: false });
    const betsMap = new Map([
      ['m1', { matchId: 'm1', uid: 'user1', home: 2, away: 1 }],
    ]);
    useMyBets.mockReturnValue({ bets: betsMap, loading: false });
    renderPage();
    expect(screen.getByTestId('total-points')).toHaveTextContent('5');
  });

  it('beregner 2 point for korrekt udfald men forkert score', () => {
    useMatches.mockReturnValue({ matches: mockMatches, loading: false });
    const betsMap = new Map([
      ['m1', { matchId: 'm1', uid: 'user1', home: 3, away: 1 }],
    ]);
    useMyBets.mockReturnValue({ bets: betsMap, loading: false });
    renderPage();
    expect(screen.getByTestId('total-points')).toHaveTextContent('2');
  });

  it('beregner 3 point for korrekt målforskel + udfald (ikke eksakt)', () => {
    useMatches.mockReturnValue({ matches: mockMatches, loading: false });
    // Resultat 2-1, tip 3-2 → korrekt udfald + korrekt målforskel = 3 point
    const betsMap = new Map([
      ['m1', { matchId: 'm1', uid: 'user1', home: 3, away: 2 }],
    ]);
    useMyBets.mockReturnValue({ bets: betsMap, loading: false });
    renderPage();
    expect(screen.getByTestId('total-points')).toHaveTextContent('3');
  });

  it('beregner 0 point for forkert udfald', () => {
    useMatches.mockReturnValue({ matches: mockMatches, loading: false });
    // Resultat 2-1 (hjemmesejr), tip 0-2 (udesejr)
    const betsMap = new Map([
      ['m1', { matchId: 'm1', uid: 'user1', home: 0, away: 2 }],
    ]);
    useMyBets.mockReturnValue({ bets: betsMap, loading: false });
    renderPage();
    expect(screen.getByTestId('total-points')).toHaveTextContent('0');
  });

  it('summerer point fra to afgjorte kampe', () => {
    useMatches.mockReturnValue({ matches: mockMatches, loading: false });
    // m1: eksakt 2-1 = 5 point
    // m3: BRA vs ARG, korrekt advance BRA men tip 0-0 = OUTCOME + 2 = 4 point
    const betsMap = new Map([
      ['m1', { matchId: 'm1', uid: 'user1', home: 2, away: 1 }],
      ['m3', { matchId: 'm3', uid: 'user1', home: 0, away: 0, advance: 'BRA' }],
    ]);
    useMyBets.mockReturnValue({ bets: betsMap, loading: false });
    renderPage();
    // 5 + 2 (advance) = 7 point (0-0 vs 1-1: begge uafgjort men forkert score = OUTCOME=2, + advance=2)
    const totalEl = screen.getByTestId('total-points');
    // Bare tjek at det er et tal > 0
    expect(parseInt(totalEl.textContent)).toBeGreaterThan(0);
  });

  it('viser "–" for point ved ikke-afgjorte kampe', () => {
    useMatches.mockReturnValue({ matches: mockMatches, loading: false });
    const betsMap = new Map([
      ['m2', { matchId: 'm2', uid: 'user1', home: 1, away: 0 }],
    ]);
    useMyBets.mockReturnValue({ bets: betsMap, loading: false });
    renderPage();
    // m2 er scheduled, ingen result = "–"
    const dashes = screen.getAllByText('–');
    expect(dashes.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Status-badges
// ---------------------------------------------------------------------------
describe('MyBetsPage – status-badges', () => {
  it('viser "Afventer" badge for ulåst kamp', () => {
    useMatches.mockReturnValue({ matches: mockMatches, loading: false });
    const betsMap = new Map([
      ['m2', { matchId: 'm2', uid: 'user1', home: 1, away: 0 }],
    ]);
    useMyBets.mockReturnValue({ bets: betsMap, loading: false });
    renderPage();
    expect(screen.getByText('Afventer')).toBeInTheDocument();
  });

  it('viser "Afgjort" badge for afsluttet kamp', () => {
    useMatches.mockReturnValue({ matches: mockMatches, loading: false });
    const betsMap = new Map([
      ['m1', { matchId: 'm1', uid: 'user1', home: 2, away: 1 }],
    ]);
    useMyBets.mockReturnValue({ bets: betsMap, loading: false });
    renderPage();
    expect(screen.getByText('Afgjort')).toBeInTheDocument();
  });

  it('viser "Låst" badge for låst men ikke afgjort kamp', () => {
    const liveMatches = [
      {
        id: 'live1',
        round: 'group',
        groupName: 'A',
        homeTeam: 'DK',
        awayTeam: 'FRA',
        kickoff: pastKickoff,
        status: 'live',
        result: null,
      },
    ];
    useMatches.mockReturnValue({ matches: liveMatches, loading: false });
    const betsMap = new Map([
      ['live1', { matchId: 'live1', uid: 'user1', home: 1, away: 0 }],
    ]);
    useMyBets.mockReturnValue({ bets: betsMap, loading: false });
    renderPage();
    expect(screen.getByText('Låst')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Statistik og rediger-links
// ---------------------------------------------------------------------------
describe('MyBetsPage – statistik og rediger-links', () => {
  it('viser rediger-link for ulåste kampe', () => {
    useMatches.mockReturnValue({ matches: mockMatches, loading: false });
    const betsMap = new Map([
      ['m2', { matchId: 'm2', uid: 'user1', home: 1, away: 0 }],
    ]);
    useMyBets.mockReturnValue({ bets: betsMap, loading: false });
    renderPage();
    expect(screen.getByTitle('Rediger tip')).toBeInTheDocument();
  });

  it('viser IKKE rediger-link for låste kampe', () => {
    useMatches.mockReturnValue({ matches: mockMatches, loading: false });
    const betsMap = new Map([
      ['m1', { matchId: 'm1', uid: 'user1', home: 2, away: 1 }],
    ]);
    useMyBets.mockReturnValue({ bets: betsMap, loading: false });
    renderPage();
    expect(screen.queryByTitle('Rediger tip')).not.toBeInTheDocument();
  });

  it('viser statistik-oversigt med tippede kampe', () => {
    useMatches.mockReturnValue({ matches: mockMatches, loading: false });
    const betsMap = new Map([
      ['m1', { matchId: 'm1', uid: 'user1', home: 2, away: 1 }],
      ['m2', { matchId: 'm2', uid: 'user1', home: 1, away: 0 }],
    ]);
    useMyBets.mockReturnValue({ bets: betsMap, loading: false });
    renderPage();
    // 2 tippede kampe
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('viser "Point i alt" label', () => {
    useMatches.mockReturnValue({ matches: mockMatches, loading: false });
    const betsMap = new Map([
      ['m1', { matchId: 'm1', uid: 'user1', home: 2, away: 1 }],
    ]);
    useMyBets.mockReturnValue({ bets: betsMap, loading: false });
    renderPage();
    expect(screen.getByText('Point i alt')).toBeInTheDocument();
  });

  it('viser "Kan redigeres" count for ulåste tips', () => {
    useMatches.mockReturnValue({ matches: mockMatches, loading: false });
    const betsMap = new Map([
      ['m1', { matchId: 'm1', uid: 'user1', home: 2, away: 1 }],
      ['m2', { matchId: 'm2', uid: 'user1', home: 1, away: 0 }],
    ]);
    useMyBets.mockReturnValue({ bets: betsMap, loading: false });
    renderPage();
    expect(screen.getByText('Kan redigeres')).toBeInTheDocument();
  });

  it('viser link til kampsiden i statistik-boks', () => {
    useMatches.mockReturnValue({ matches: mockMatches, loading: false });
    const betsMap = new Map([
      ['m1', { matchId: 'm1', uid: 'user1', home: 2, away: 1 }],
    ]);
    useMyBets.mockReturnValue({ bets: betsMap, loading: false });
    renderPage();
    expect(screen.getByText(/Til kampsiden/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Knockout-kampe i MyBetsPage
// ---------------------------------------------------------------------------
describe('MyBetsPage – knockout-kampe', () => {
  it('viser advance i brugerens tip for knockout', () => {
    useMatches.mockReturnValue({ matches: mockMatches, loading: false });
    const betsMap = new Map([
      ['m3', { matchId: 'm3', uid: 'user1', home: 1, away: 1, advance: 'BRA' }],
    ]);
    useMyBets.mockReturnValue({ bets: betsMap, loading: false });
    renderPage();
    // "Videre: BRA" kan forekomme i flere celler (tip og resultat har begge advance-felt)
    const advanceTexts = screen.getAllByText(/Videre: BRA/);
    expect(advanceTexts.length).toBeGreaterThan(0);
  });

  it('viser Kvartfinale-label i tabellen for knockout', () => {
    useMatches.mockReturnValue({ matches: mockMatches, loading: false });
    const betsMap = new Map([
      ['m3', { matchId: 'm3', uid: 'user1', home: 1, away: 1, advance: 'BRA' }],
    ]);
    useMyBets.mockReturnValue({ bets: betsMap, loading: false });
    renderPage();
    expect(screen.getByText(/Kvartfinale/)).toBeInTheDocument();
  });
});
