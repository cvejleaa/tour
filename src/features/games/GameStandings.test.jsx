// Tests for GameStandings — især liga-filteret.
//
// Fixturet er lagt, så ÉN liga giver flere end 3 spillere (podie + tabel) og
// én giver præcis 3 (kun podie). Ellers ville assertions ramme podiet, mens
// man tror, man læser tabellen.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

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
  // Skal stå på den rigtige rute: ellers falder GameTabLink tilbage til ren
  // tekst, og linkene ville være utestede.
  const r = render(
    <MemoryRouter initialEntries={['/spil/sl']}>
      <Routes>
        <Route path="/spil/:gameId" element={<GameStandings gameId="sl" />} />
      </Routes>
    </MemoryRouter>,
  );
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
    expect(screen.getByText('Viser de 5 spillere i Kontoret.')).toBeInTheDocument();
  });

  // Den mest sandsynlige forekomst: en ny spiller, der lige har oprettet sin
  // egen liga, står alene i STANDARDVISNINGEN. "Viser 1 spiller, du deler liga
  // med" ville være usandt — den ene spiller er én selv.
  it('siger det ligeud, når man er alene i standardvisningen', () => {
    setup({ standings: [ROWS[4]] });
    expect(screen.getByText(/Viser kun dig selv/)).toBeInTheDocument();
    expect(screen.queryByText(/du deler liga med/)).not.toBeInTheDocument();
  });

  // Bestemt form i flertal: listen trunkeres aldrig, så "de N" siger korrekt,
  // at det er dem alle. Uden denne kunne "de" fjernes ubemærket.
  it('beholder bestemt form i flertal', () => {
    setup();
    expect(screen.getByText('Viser de 6 spillere, du deler liga med.')).toBeInTheDocument();
  });

  // En liga kan have ét medlem — så må der ikke stå "1 spillere".
  it('bøjer teksten rigtigt ved én spiller i ligaen', () => {
    setup({ leagues: [...LEAGUES, { id: 'L5', name: 'Kun mig', memberUids: ['me'] }] });
    fireEvent.change(filter(), { target: { value: 'L5' } });
    expect(screen.getByText('Viser 1 spiller i Kun mig.')).toBeInTheDocument();
  });

  // Har man valgt en liga, vil man typisk videre TIL den.
  it('linker til ligaen, når en er valgt', () => {
    setup();
    fireEvent.change(filter(), { target: { value: 'L1' } });
    // Liga-id'et skal med, ellers lander man på en liste, hvor alt er foldet
    // sammen — og mærkatet lovede mere, end klikket gav.
    expect(screen.getByRole('link', { name: /Åbn ligaen/ }))
      .toHaveAttribute('href', '/spil/sl?fane=ligaer&liga=L1');
  });

  it('linker ikke til en liga i den samlede visning', () => {
    setup();
    expect(screen.queryByRole('link', { name: /Åbn ligaen/ })).not.toBeInTheDocument();
  });

  // Kredsen har rækker, men man er ikke i nogen liga: "Du er ikke med i en
  // liga endnu" — dér skal der være en vej videre.
  it('sender én uden liga videre til Ligaer-fanen', () => {
    setup({ leagues: [] });
    expect(screen.getByRole('link', { name: /Gå til Ligaer/ }))
      .toHaveAttribute('href', '/spil/sl?fane=ligaer');
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
    rerender(
      <MemoryRouter initialEntries={['/spil/sl']}>
        <Routes>
          <Route path="/spil/:gameId" element={<GameStandings gameId="sl" />} />
        </Routes>
      </MemoryRouter>,
    );
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

// ---------------------------------------------------------------------------
// Opdelingen: hvor pointene kommer fra. En EGEN visning, ikke en udvidelse af
// stillingen — seks tal pr. række ville drukne en liste med tre kolonner på
// mobil, og podiet har plads til nøjagtig ét tal.
// ---------------------------------------------------------------------------
describe('GameStandings — pointopdeling', () => {
  // Tal, der ikke kolliderer med nogen totals i ROWS — ellers kan testen ikke
  // skelne en rubrik fra en total. 31 + 12,5 + 9,5 + 7 = 60, Annes total.
  const MED = ROWS.map((r, i) => (i === 0
    ? { ...r, opdeling: { p1x2: 31, chance: 12.5, combi: 9.5, pulje: 7 } }
    : r));

  it('er slået FRA som udgangspunkt', () => {
    setup();
    expect(screen.queryByText('Chancen')).toBeNull();
    expect(screen.getByRole('button', { name: /Udspecificér/ })).toBeInTheDocument();
  });

  it('viser rubrikkerne, når man folder den ud', () => {
    setup({ standings: MED });
    fireEvent.click(screen.getByRole('button', { name: /Udspecificér/ }));
    expect(screen.getByText(/Chancen/)).toBeInTheDocument();
    expect(screen.getByText(/Combi/)).toBeInTheDocument();
    expect(screen.getByText('31')).toBeInTheDocument();
    expect(screen.getByText('12,5')).toBeInTheDocument();
    expect(screen.getByText('9,5')).toBeInTheDocument();
  });

  // Podiet har plads til ét tal, og stillingen skal svare på "hvem fører".
  it('rører ikke podiet, når opdelingen er slået til', () => {
    setup({ standings: MED });
    const foer = container.querySelectorAll('.podium__spot').length;
    fireEvent.click(screen.getByRole('button', { name: /Udspecificér/ }));
    expect(container.querySelectorAll('.podium__spot')).toHaveLength(foer);
  });

  // En streg og ikke et nul. Findes opdelingen ikke endnu, HAR vi ikke tallet
  // — vi ved ikke, at det er nul. Fire nuller ville påstå, at spilleren ingen
  // point har fået, mens totalen ved siden af siger noget andet.
  it('viser en streg, ikke nuller, for spillere uden opdeling endnu', () => {
    setup({ standings: ROWS });
    fireEvent.click(screen.getByRole('button', { name: /Udspecificér/ }));
    expect(screen.getByText(/Opdelingen bygges, næste gang en kamp afgøres/)).toBeInTheDocument();
    expect(screen.getAllByText('–').length).toBeGreaterThan(0);
  });

  it('kan foldes sammen igen', () => {
    setup({ standings: MED });
    fireEvent.click(screen.getByRole('button', { name: /Udspecificér/ }));
    fireEvent.click(screen.getByRole('button', { name: /Vis stillingen/ }));
    expect(screen.queryByText(/Chancen/)).toBeNull();
  });
});
