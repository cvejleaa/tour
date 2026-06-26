/**
 * Tests for TournamentPage.
 * Mocker useMatches fuldstændigt og Firebase.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render as rtlRender, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TournamentPage from './TournamentPage';

// TournamentPage indeholder <TeamLink> (et <Link>), så render kræver en Router.
const render = (ui, opts) =>
  rtlRender(ui, { wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>, ...opts });

// ── Mock firebase (TournamentPage bruger useMatches som bruger Firebase) ──────
vi.mock('../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  onSnapshot: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  doc: vi.fn(),
}));

// ── Mock useMatches ───────────────────────────────────────────────────────────
const mockUseMatches = vi.fn();
vi.mock('../features/matches/useMatches', () => ({
  useMatches: () => mockUseMatches(),
}));

// ── Mock auth + bonus (gruppevinder-gæt) ──────────────────────────────────────
let mockQuestions = [];
let mockBonusBets = new Map();
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { uid: 'u1' } }) }));
vi.mock('../features/bonus/useBonusData', () => ({
  useBonusQuestions: () => ({ questions: mockQuestions }),
  useMyBonusBets: () => ({ bonusBets: mockBonusBets }),
}));

beforeEach(() => {
  mockQuestions = [];
  mockBonusBets = new Map();
});

// ── Hjælpefunktioner til testdata ─────────────────────────────────────────────
function lavGruppeKamp(id, homeTeam, awayTeam, groupName, status = 'scheduled', result = null) {
  return {
    id,
    round: 'group',
    groupName,
    homeTeam,
    awayTeam,
    status,
    result,
    kickoff: '2026-06-15T18:00:00Z',
    city: 'Teststadion',
  };
}

function lavKnockoutKamp(id, round, homeTeam = 'ARG', awayTeam = 'BRA', status = 'scheduled', result = null) {
  return {
    id,
    round,
    groupName: null,
    homeTeam,
    awayTeam,
    status,
    result,
    kickoff: '2026-06-25T20:00:00Z',
    city: 'Testby',
    homePlaceholder: homeTeam ? null : 'Vinder gruppe A',
    awayPlaceholder: awayTeam ? null : 'Vinder gruppe B',
  };
}

// ─── Loading-tilstand ─────────────────────────────────────────────────────────

describe('TournamentPage – loading', () => {
  it('viser spinner under indlæsning', () => {
    mockUseMatches.mockReturnValue({ matches: [], loading: true, error: null });
    render(<TournamentPage />);
    expect(screen.getByLabelText(/indlæser/i)).toBeInTheDocument();
  });

  it('viser indlæsningstekst under loading', () => {
    mockUseMatches.mockReturnValue({ matches: [], loading: true, error: null });
    render(<TournamentPage />);
    expect(screen.getByText(/kampplan/i)).toBeInTheDocument();
  });
});

// ─── Fejl-tilstand ────────────────────────────────────────────────────────────

describe('TournamentPage – fejl', () => {
  it('viser fejlbesked når error er sat', () => {
    mockUseMatches.mockReturnValue({ matches: [], loading: false, error: 'Firestore-fejl' });
    render(<TournamentPage />);
    expect(screen.getByText(/kunne ikke hente kampdata/i)).toBeInTheDocument();
  });
});

// ─── Tom-tilstand ─────────────────────────────────────────────────────────────

describe('TournamentPage – ingen kampe', () => {
  it('viser tom-tilstand når matches er tom liste', () => {
    mockUseMatches.mockReturnValue({ matches: [], loading: false, error: null });
    render(<TournamentPage />);
    expect(screen.getByText(/ingen kampe fundet/i)).toBeInTheDocument();
  });
});

// ─── Fane-navigation ──────────────────────────────────────────────────────────

describe('TournamentPage – fane-navigation', () => {
  beforeEach(() => {
    mockUseMatches.mockReturnValue({
      matches: [
        lavGruppeKamp('gk-1', 'ARG', 'BRA', 'A'),
        lavKnockoutKamp('ko-1', 'r32'),
        lavKnockoutKamp('ko-2', 'r16'),
      ],
      loading: false,
      error: null,
    });
  });

  it('viser Grupper-fanen som standard', () => {
    render(<TournamentPage />);
    const grupperTab = screen.getByRole('tab', { name: /grupper/i });
    expect(grupperTab).toHaveAttribute('aria-selected', 'true');
  });

  it('viser alle tre faner', () => {
    render(<TournamentPage />);
    expect(screen.getByRole('tab', { name: /grupper/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /mellemrunde/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /slutspil/i })).toBeInTheDocument();
  });

  it('skifter til Mellemrunde-fanen ved klik', () => {
    render(<TournamentPage />);
    fireEvent.click(screen.getByRole('tab', { name: /mellemrunde/i }));
    expect(screen.getByRole('tab', { name: /mellemrunde/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /grupper/i })).toHaveAttribute('aria-selected', 'false');
  });

  it('skifter til Slutspil-fanen ved klik', () => {
    render(<TournamentPage />);
    fireEvent.click(screen.getByRole('tab', { name: /slutspil/i }));
    expect(screen.getByRole('tab', { name: /slutspil/i })).toHaveAttribute('aria-selected', 'true');
  });

  it('skifter tilbage til Grupper-fanen', () => {
    render(<TournamentPage />);
    fireEvent.click(screen.getByRole('tab', { name: /slutspil/i }));
    fireEvent.click(screen.getByRole('tab', { name: /grupper/i }));
    expect(screen.getByRole('tab', { name: /grupper/i })).toHaveAttribute('aria-selected', 'true');
  });
});

// ─── Grupper-fane ─────────────────────────────────────────────────────────────

describe('TournamentPage – Grupper-fane', () => {
  beforeEach(() => {
    mockUseMatches.mockReturnValue({
      matches: [
        lavGruppeKamp('gk-1', 'ARG', 'BRA', 'A', 'finished', { home: 2, away: 1 }),
        lavGruppeKamp('gk-2', 'ARG', 'GER', 'A', 'scheduled'),
        lavGruppeKamp('gk-3', 'MEX', 'USA', 'B', 'scheduled'),
      ],
      loading: false,
      error: null,
    });
  });

  it('viser gruppe-overskrifter', () => {
    render(<TournamentPage />);
    expect(screen.getByText('Gruppe A')).toBeInTheDocument();
    expect(screen.getByText('Gruppe B')).toBeInTheDocument();
  });

  it('viser holdnavne (dansk) i gruppe-tabel', () => {
    render(<TournamentPage />);
    // Argentina, Brasilien, Tyskland fra gruppe A
    expect(screen.getAllByText('Argentina').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Brasilien').length).toBeGreaterThan(0);
  });

  it('viser resultat for afsluttet kamp', () => {
    render(<TournamentPage />);
    // Resultatet vises som score-numre – der kan være flere forekomster (stilling + kampkort)
    const toerne = screen.getAllByText('2');
    expect(toerne.length).toBeGreaterThan(0);
    const enere = screen.getAllByText('1');
    expect(enere.length).toBeGreaterThan(0);
  });

  it('viser stillingens kolonner (K, V, U, T, M, MD, P)', () => {
    render(<TournamentPage />);
    expect(screen.getAllByText('K').length).toBeGreaterThan(0);
    expect(screen.getAllByText('V').length).toBeGreaterThan(0);
    expect(screen.getAllByText('P').length).toBeGreaterThan(0);
  });

  it('fremhæver top-2 med standings-row--advance klasse', () => {
    render(<TournamentPage />);
    const advanceRows = document.querySelectorAll('.standings-row--advance');
    // Gruppe A har 3 hold (ARG, BRA, GER) – top 2 fremhæves
    expect(advanceRows.length).toBeGreaterThanOrEqual(2);
  });

  it('viser tom-tilstand i Grupper-fane når ingen gruppekampe', () => {
    mockUseMatches.mockReturnValue({
      matches: [lavKnockoutKamp('ko-1', 'r16')],
      loading: false,
      error: null,
    });
    render(<TournamentPage />);
    expect(screen.getByText(/ingen gruppekampe/i)).toBeInTheDocument();
  });

  it('viser LIVE-badge for live-kampe', () => {
    mockUseMatches.mockReturnValue({
      matches: [lavGruppeKamp('gk-live', 'ARG', 'BRA', 'A', 'live')],
      loading: false,
      error: null,
    });
    render(<TournamentPage />);
    expect(screen.getByText('LIVE')).toBeInTheDocument();
  });
});

// ─── Mellemrunde-fane ─────────────────────────────────────────────────────────

describe('TournamentPage – Mellemrunde-fane', () => {
  it('viser tom-tilstand når ingen r32-kampe', () => {
    mockUseMatches.mockReturnValue({
      matches: [lavGruppeKamp('gk-1', 'ARG', 'BRA', 'A')],
      loading: false,
      error: null,
    });
    render(<TournamentPage />);
    fireEvent.click(screen.getByRole('tab', { name: /mellemrunde/i }));
    expect(screen.getByText(/mellemrunden er ikke fastlagt/i)).toBeInTheDocument();
  });

  it('viser r32-kampe i Mellemrunde-fanen', () => {
    mockUseMatches.mockReturnValue({
      matches: [
        lavKnockoutKamp('r32-1', 'r32', 'ARG', 'BRA'),
        lavKnockoutKamp('r32-2', 'r32', 'GER', 'FRA'),
      ],
      loading: false,
      error: null,
    });
    render(<TournamentPage />);
    fireEvent.click(screen.getByRole('tab', { name: /mellemrunde/i }));
    expect(screen.getByText('Argentina')).toBeInTheDocument();
    expect(screen.getByText('Brasilien')).toBeInTheDocument();
  });

  it('viser r32-kampe grupperet efter dato', () => {
    mockUseMatches.mockReturnValue({
      matches: [
        { ...lavKnockoutKamp('r32-1', 'r32', 'ARG', 'BRA'), kickoff: '2026-06-25T18:00:00Z' },
        { ...lavKnockoutKamp('r32-2', 'r32', 'GER', 'FRA'), kickoff: '2026-06-25T21:00:00Z' },
      ],
      loading: false,
      error: null,
    });
    render(<TournamentPage />);
    fireEvent.click(screen.getByRole('tab', { name: /mellemrunde/i }));
    // Begge kampe på samme dato → én dag-overskrift
    const dagLabels = document.querySelectorAll('.round-day-label');
    expect(dagLabels.length).toBe(1);
  });

  it('viser placeholder TBD for ukendte hold', () => {
    mockUseMatches.mockReturnValue({
      matches: [
        {
          id: 'r32-tbd',
          round: 'r32',
          homeTeam: null,
          awayTeam: null,
          status: 'pendingTeams',
          result: null,
          kickoff: '2026-06-25T18:00:00Z',
          homePlaceholder: 'Vinder gruppe A',
          awayPlaceholder: 'Vinder gruppe B',
        },
      ],
      loading: false,
      error: null,
    });
    render(<TournamentPage />);
    fireEvent.click(screen.getByRole('tab', { name: /mellemrunde/i }));
    expect(screen.getByText('Vinder gruppe A')).toBeInTheDocument();
    expect(screen.getByText('Vinder gruppe B')).toBeInTheDocument();
  });

  it('viser resultat for afsluttet r32-kamp', () => {
    mockUseMatches.mockReturnValue({
      matches: [
        lavKnockoutKamp('r32-done', 'r32', 'ARG', 'BRA', 'finished', { home: 2, away: 0 }),
      ],
      loading: false,
      error: null,
    });
    render(<TournamentPage />);
    fireEvent.click(screen.getByRole('tab', { name: /mellemrunde/i }));
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
  });
});

// ─── Slutspil-fane ────────────────────────────────────────────────────────────

describe('TournamentPage – Slutspil-fane', () => {
  it('viser tom-tilstand når ingen slutspilskampe', () => {
    mockUseMatches.mockReturnValue({
      matches: [lavGruppeKamp('gk-1', 'ARG', 'BRA', 'A')],
      loading: false,
      error: null,
    });
    render(<TournamentPage />);
    fireEvent.click(screen.getByRole('tab', { name: /slutspil/i }));
    expect(screen.getByText(/slutspillet er ikke fastlagt/i)).toBeInTheDocument();
  });

  it('viser r16-kamp i slutspilsfanen', () => {
    mockUseMatches.mockReturnValue({
      matches: [lavKnockoutKamp('r16-1', 'r16', 'ESP', 'NED')],
      loading: false,
      error: null,
    });
    render(<TournamentPage />);
    fireEvent.click(screen.getByRole('tab', { name: /slutspil/i }));
    expect(screen.getByText('Spanien')).toBeInTheDocument();
    expect(screen.getByText('Holland')).toBeInTheDocument();
  });

  it('viser finale med 🏆-markering', () => {
    mockUseMatches.mockReturnValue({
      matches: [lavKnockoutKamp('final-1', 'final', 'ARG', 'BRA')],
      loading: false,
      error: null,
    });
    render(<TournamentPage />);
    fireEvent.click(screen.getByRole('tab', { name: /slutspil/i }));
    // Finale-titlen vises
    const titler = document.querySelectorAll('.bracket-round__title');
    const finaleTitle = [...titler].find((el) => el.textContent.includes('🏆'));
    expect(finaleTitle).toBeTruthy();
  });

  it('viser bronzekamp med 🥉-markering', () => {
    mockUseMatches.mockReturnValue({
      matches: [lavKnockoutKamp('bronze-1', 'bronze', 'GER', 'FRA')],
      loading: false,
      error: null,
    });
    render(<TournamentPage />);
    fireEvent.click(screen.getByRole('tab', { name: /slutspil/i }));
    const titler = document.querySelectorAll('.bracket-round__title');
    const bronzeTitle = [...titler].find((el) => el.textContent.includes('🥉'));
    expect(bronzeTitle).toBeTruthy();
  });

  it('viser "videre"-badge ved advance-resultat', () => {
    mockUseMatches.mockReturnValue({
      matches: [
        lavKnockoutKamp('sf-1', 'sf', 'ARG', 'BRA', 'finished', {
          home: 1,
          away: 1,
          advance: 'ARG',
        }),
      ],
      loading: false,
      error: null,
    });
    render(<TournamentPage />);
    fireEvent.click(screen.getByRole('tab', { name: /slutspil/i }));
    expect(screen.getByText(/videre/i)).toBeInTheDocument();
  });

  it('viser kampe fra alle slutspilsrunder i korrekt rækkefølge', () => {
    mockUseMatches.mockReturnValue({
      matches: [
        lavKnockoutKamp('sf-1', 'sf', 'ARG', 'BRA'),
        lavKnockoutKamp('final-1', 'final', 'ARG', 'GER'),
        lavKnockoutKamp('r16-1', 'r16', 'ESP', 'NED'),
      ],
      loading: false,
      error: null,
    });
    render(<TournamentPage />);
    fireEvent.click(screen.getByRole('tab', { name: /slutspil/i }));
    const titler = document.querySelectorAll('.bracket-round__title');
    const tekster = [...titler].map((el) => el.textContent);
    // r16 bør komme før sf, som kommer før final
    const r16Idx = tekster.findIndex((t) => t.toLowerCase().includes('8'));
    const sfIdx = tekster.findIndex((t) => t.toLowerCase().includes('semi'));
    const finaleIdx = tekster.findIndex((t) => t.includes('🏆'));
    expect(r16Idx).toBeLessThan(sfIdx);
    expect(sfIdx).toBeLessThan(finaleIdx);
  });

  it('viser LIVE-badge for live-slutspilskamp', () => {
    mockUseMatches.mockReturnValue({
      matches: [lavKnockoutKamp('sf-live', 'sf', 'ARG', 'BRA', 'live')],
      loading: false,
      error: null,
    });
    render(<TournamentPage />);
    fireEvent.click(screen.getByRole('tab', { name: /slutspil/i }));
    expect(screen.getByText('LIVE')).toBeInTheDocument();
  });
});

// ─── Fakta-fane ───────────────────────────────────────────────────────────────

describe('TournamentPage – Fakta-fane', () => {
  it('viser tom-tilstand uden spillede kampe', () => {
    mockUseMatches.mockReturnValue({
      matches: [lavGruppeKamp('gk-1', 'ARG', 'BRA', 'A')],
      loading: false,
      error: null,
    });
    render(<TournamentPage />);
    fireEvent.click(screen.getByRole('tab', { name: /fakta/i }));
    expect(screen.getByText(/Ingen fakta endnu/i)).toBeInTheDocument();
  });

  it('viser nøgletal og minut-interval-diagram for spillede kampe', () => {
    const m = {
      ...lavGruppeKamp('gk-1', 'ARG', 'BRA', 'A', 'finished', { home: 2, away: 1 }),
      details: { goals: [
        { minute: 10, side: 'home', type: 'REGULAR' },
        { minute: 80, side: 'away', type: 'PENALTY' },
        { minute: 90, side: 'home', type: 'REGULAR', injuryTime: 2 },
      ], halfTime: { home: 1, away: 0 } },
    };
    mockUseMatches.mockReturnValue({ matches: [m], loading: false, error: null });
    render(<TournamentPage />);
    fireEvent.click(screen.getByRole('tab', { name: /fakta/i }));
    expect(screen.getByText(/Turneringen i tal/i)).toBeInTheDocument();
    expect(screen.getByText(/Mål pr. minut-interval/i)).toBeInTheDocument();
  });
});

// ─── Gruppevinder-gæt ─────────────────────────────────────────────────────────

describe('TournamentPage – gruppevinder-gæt', () => {
  it('markerer mit gæt på gruppevinder i gruppestillingen', () => {
    mockUseMatches.mockReturnValue({
      matches: [lavGruppeKamp('gk-1', 'ARG', 'BRA', 'A')],
      loading: false,
      error: null,
    });
    mockQuestions = [{ id: 'q-A', type: 'groupWinner', groupName: 'A' }];
    mockBonusBets = new Map([['q-A', { questionId: 'q-A', answer: 'ARG' }]]);
    render(<TournamentPage />);
    const marks = screen.getAllByTestId('my-group-winner');
    expect(marks).toHaveLength(1);
    expect(marks[0]).toHaveTextContent('Dit gæt');
  });

  it('viser ingen markering uden gæt', () => {
    mockUseMatches.mockReturnValue({
      matches: [lavGruppeKamp('gk-1', 'ARG', 'BRA', 'A')],
      loading: false,
      error: null,
    });
    render(<TournamentPage />);
    expect(screen.queryByTestId('my-group-winner')).not.toBeInTheDocument();
  });
});
