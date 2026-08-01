// Tests for GameStandings — især liga-filteret. Selve rangeringen er dækket i
// gameStandings.test.js; her handler det om, hvad man kan vælge og se.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

vi.mock('../../firebase', () => ({ db: {} }));

const mockStandings = vi.fn();
vi.mock('./useVisibleGameStandings', () => ({
  useVisibleGameStandings: () => mockStandings(),
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'me' } }),
}));

vi.mock('../../components/Avatar', () => ({
  default: ({ name }) => <span data-testid="avatar">{name}</span>,
}));

import GameStandings from './GameStandings';

// Fire spillere fordelt på to ligaer. Anne er med i begge.
const ROWS = [
  { uid: 'u1', name: 'Anne', totalPoints: 40, rank: 1 },
  { uid: 'me', name: 'Mig', totalPoints: 30, rank: 2 },
  { uid: 'u2', name: 'Bo', totalPoints: 20, rank: 3 },
  { uid: 'u3', name: 'Carl', totalPoints: 10, rank: 4 },
];
const LEAGUES = [
  { id: 'L1', name: 'Kontoret', memberUids: ['me', 'u1', 'u2'] },
  { id: 'L2', name: 'Familien', memberUids: ['me', 'u1', 'u3'] },
];

function setup({ standings = ROWS, leagues = LEAGUES } = {}) {
  mockStandings.mockReturnValue({
    standings, leagues, leagueCount: leagues.length, loading: false, error: null,
  });
  return render(<GameStandings gameId="sl" />);
}

const filter = () => screen.getByLabelText('Vis stilling for');
/** Navnene i selve tabellen (podiet har sine egne). */
const shown = () => screen.getAllByTestId('avatar').map((e) => e.textContent);

beforeEach(() => vi.clearAllMocks());

describe('GameStandings — liga-filter', () => {
  it('viser alle mine ligaer samlet som standard', () => {
    setup();
    expect(filter().value).toBe('__alle__');
    expect(shown()).toEqual(expect.arrayContaining(['Anne', 'Mig', 'Bo', 'Carl']));
  });

  it('tilbyder én mulighed pr. liga plus samlet', () => {
    setup();
    const options = within(filter()).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['Alle mine ligaer', 'Kontoret', 'Familien']);
  });

  it('filtrerer ned til én ligas medlemmer', () => {
    setup();
    fireEvent.change(filter(), { target: { value: 'L1' } });
    const navne = shown();
    expect(navne).toEqual(expect.arrayContaining(['Anne', 'Mig', 'Bo']));
    expect(navne).not.toContain('Carl'); // kun i Familien
  });

  // Pointen med filteret: placeringerne skal give mening INDEN for ligaen.
  it('gen-rangerer inden for den valgte liga', () => {
    setup();
    fireEvent.change(filter(), { target: { value: 'L2' } });
    // Familien = Anne (40), Mig (30), Carl (10) → Carl er nr. 3, ikke nr. 4.
    expect(screen.getByText(/Viser de 3 spillere i Familien/)).toBeInTheDocument();
  });

  it('fortæller hvilken liga der vises', () => {
    setup();
    fireEvent.change(filter(), { target: { value: 'L1' } });
    expect(screen.getByText(/Viser de 3 spillere i Kontoret/)).toBeInTheDocument();
  });

  // Med én liga er "alle mine ligaer" og den ene liga det samme valg.
  it('skjuler filteret, når man kun er med i én liga', () => {
    setup({ leagues: [LEAGUES[0]] });
    expect(screen.queryByLabelText('Vis stilling for')).not.toBeInTheDocument();
  });

  it('falder tilbage til alle, hvis den valgte liga forsvinder', () => {
    const { rerender } = setup();
    fireEvent.change(filter(), { target: { value: 'L2' } });
    expect(screen.getByText(/i Familien/)).toBeInTheDocument();
    // Man forlader Familien mens man kigger.
    mockStandings.mockReturnValue({
      standings: ROWS, leagues: [LEAGUES[0]], leagueCount: 1, loading: false, error: null,
    });
    rerender(<GameStandings gameId="sl" />);
    expect(screen.getByText(/du deler liga med/)).toBeInTheDocument();
  });

  // Tom-tilstanden måles på hele kredsen. Ellers ville en tom liga skjule
  // filteret, og man kunne ikke vælge sig tilbage.
  it('beholder filteret, selv om den valgte liga ingen rækker har', () => {
    setup({ leagues: [...LEAGUES, { id: 'L3', name: 'Tom liga', memberUids: ['fremmed'] }] });
    fireEvent.change(filter(), { target: { value: 'L3' } });
    expect(screen.getByLabelText('Vis stilling for')).toBeInTheDocument();
    expect(screen.getByText(/Ingen af ligaens medlemmer/)).toBeInTheDocument();
  });

  it('viser stadig "ingen deltagere", når hele kredsen er tom', () => {
    setup({ standings: [] });
    expect(screen.getByText('Ingen deltagere endnu.')).toBeInTheDocument();
  });
});
