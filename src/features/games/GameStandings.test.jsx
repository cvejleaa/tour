// Tests for GameStandings — især liga-filteret.
//
// Fixturet er lagt, så ÉN liga giver flere end 3 spillere (podie + tabel) og
// én giver præcis 3 (kun podie). Ellers ville assertions ramme podiet, mens
// man tror, man læser tabellen.
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

// Avataren må IKKE skrive navnet: cellen renderer det selv, og så ville
// textContent blive "AnneAnne".
vi.mock('../../components/Avatar', () => ({
  default: () => <span data-testid="avatar" />,
}));

import GameStandings from './GameStandings';

// Hele kredsen, rangeret som useVisibleGameStandings ville levere den.
const ROWS = [
  { uid: 'u1', name: 'Anne', totalPoints: 60, rank: 1 },
  { uid: 'u2', name: 'Bo', totalPoints: 50, rank: 2 },
  { uid: 'u3', name: 'Carl', totalPoints: 40, rank: 3 },
  { uid: 'u4', name: 'Dorte', totalPoints: 30, rank: 4 },
  { uid: 'me', name: 'Mig', totalPoints: 20, rank: 5 },
  { uid: 'u5', name: 'Erik', totalPoints: 10, rank: 6 },
];
const LEAGUES = [
  // 5 medlemmer → podie (3) + tabel (2)
  { id: 'L1', name: 'Kontoret', memberUids: ['me', 'u1', 'u2', 'u3', 'u4'] },
  // 3 medlemmer → kun podie. Erik er nr. 6 i kredsen, men nr. 3 her.
  { id: 'L2', name: 'Familien', memberUids: ['me', 'u1', 'u5'] },
];

let container;
function setup({ standings = ROWS, leagues = LEAGUES } = {}) {
  mockStandings.mockReturnValue({
    standings, leagues, leagueCount: leagues.length, loading: false, error: null,
  });
  const r = render(<GameStandings gameId="sl" />);
  container = r.container;
  return r;
}

const filter = () => screen.getByLabelText('Vis stilling for');

/** [rangtal, navn] pr. række i SELVE TABELLEN — ikke podiet. */
function tableRows() {
  const table = container.querySelector('table');
  if (!table) return [];
  return [...table.querySelectorAll('tbody tr')].map((tr) => {
    const tds = tr.querySelectorAll('td');
    return [tds[0].textContent.replace(/[▲▼]\d+/, '').trim(), tds[1].textContent.trim()];
  });
}

/** Navnet på podiepladsen med et bestemt rangtal. */
function podiumName(rank) {
  const spot = container.querySelector(`.podium__spot--${rank}`);
  return spot ? spot.querySelector('.podium__name').textContent : null;
}

beforeEach(() => vi.clearAllMocks());

describe('GameStandings — liga-filter', () => {
  it('viser alle mine ligaer samlet som standard', () => {
    setup();
    expect(filter().value).toBe('__alle__');
    expect(podiumName(1)).toBe('Anne');
    expect(tableRows().map((r) => r[1])).toEqual(['Dorte', 'Mig (dig)', 'Erik']);
  });

  it('tilbyder én mulighed pr. liga plus samlet', () => {
    setup();
    const options = within(filter()).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['Alle mine ligaer', 'Kontoret', 'Familien']);
  });

  it('filtrerer ned til én ligas medlemmer', () => {
    setup();
    fireEvent.change(filter(), { target: { value: 'L1' } });
    const navne = [podiumName(1), podiumName(2), podiumName(3), ...tableRows().map((r) => r[1])];
    expect(navne).toEqual(['Anne', 'Bo', 'Carl', 'Dorte', 'Mig (dig)']);
    expect(navne).not.toContain('Erik'); // kun i Familien
  });

  // DETTE er pointen med filteret. Uden gen-rangering ville Erik beholde sin
  // 6. plads fra hele kredsen og stå med "#6" i podiet i stedet for bronze.
  it('gen-rangerer inden for den valgte liga — Erik er nr. 3, ikke nr. 6', () => {
    setup();
    fireEvent.change(filter(), { target: { value: 'L2' } });
    expect(podiumName(1)).toBe('Anne');
    expect(podiumName(2)).toBe('Mig');
    expect(podiumName(3)).toBe('Erik');
    expect(container.querySelector('.podium__spot--6')).toBeNull();
  });

  it('gen-rangerer også rækkerne i tabellen', () => {
    setup();
    fireEvent.change(filter(), { target: { value: 'L1' } });
    expect(tableRows()).toEqual([['4', 'Dorte'], ['5', 'Mig (dig)']]);
  });

  it('fortæller hvilken liga der vises', () => {
    setup();
    fireEvent.change(filter(), { target: { value: 'L1' } });
    expect(screen.getByText(/Viser 5 spillere i Kontoret/)).toBeInTheDocument();
  });

  // En liga kan have ét medlem — så må der ikke stå "1 spillere".
  it('bøjer teksten rigtigt ved én spiller i ligaen', () => {
    setup({ leagues: [...LEAGUES, { id: 'L5', name: 'Kun mig', memberUids: ['me'] }] });
    fireEvent.change(filter(), { target: { value: 'L5' } });
    expect(screen.getByText('Viser 1 spiller i Kun mig.')).toBeInTheDocument();
  });

  it('markerer én selv i tabellen', () => {
    setup();
    expect(tableRows().some(([, navn]) => navn.includes('(dig)'))).toBe(true);
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
    // Man forlader Familien, mens man kigger.
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

  // Podiet kræver mindst 3. Ved præcis 2 skal alle stå i tabellen i stedet.
  it('viser intet podie i en liga med under 3 spillere', () => {
    setup({ leagues: [...LEAGUES, { id: 'L4', name: 'Parret', memberUids: ['me', 'u1'] }] });
    fireEvent.change(filter(), { target: { value: 'L4' } });
    expect(container.querySelector('.podium')).toBeNull();
    expect(tableRows()).toEqual([['1', 'Anne'], ['2', 'Mig (dig)']]);
  });
});
