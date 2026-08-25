// Tests for LeagueBets — hvad tippede mine liga-kammerater på en startet kamp.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../../../firebase', () => ({ db: {} }));

const mockHook = vi.fn();
vi.mock('./useMatchLeagueBets', () => ({
  useMatchLeagueBets: (...a) => mockHook(...a),
}));

import LeagueBets, { ensomRetLinje, ENSOM_MINIMUM } from './LeagueBets';

const MATCH = { id: 'm1', home: 'VIB', away: 'ODE', result: null };

beforeEach(() => {
  vi.clearAllMocks();
  mockHook.mockReturnValue({ bets: [], loading: false, error: '' });
});

function renderIt(props = {}) {
  // På den rigtige rute, så "Bliv med i en liga" bliver et ægte link.
  return render(
    <MemoryRouter initialEntries={['/spil/sl']}>
      <Routes>
        <Route
          path="/spil/:gameId"
          element={<LeagueBets gameId="sl" match={MATCH} myUid="me" leagueIds={['L1']} {...props} />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('LeagueBets', () => {
  it('henter først når man folder ud — udfoldningen koster en forespørgsel', () => {
    renderIt();
    expect(mockHook).toHaveBeenLastCalledWith('sl', 'm1', ['L1'], false);
    fireEvent.click(screen.getByRole('button', { name: /se ligaens tips/i }));
    expect(mockHook).toHaveBeenLastCalledWith('sl', 'm1', ['L1'], true);
  });

  it('grupperer de andres tips på udfald med navne', () => {
    mockHook.mockReturnValue({
      loading: false,
      error: '',
      bets: [
        { id: 'b1', uid: 'u1', name: 'Anne', pick: '1' },
        { id: 'b2', uid: 'u2', name: 'Bo', pick: '1' },
        { id: 'b3', uid: 'u3', name: 'Carl', pick: 'X' },
      ],
    });
    renderIt();
    fireEvent.click(screen.getByRole('button', { name: /se ligaens tips/i }));
    expect(screen.getByText(/Anne/)).toBeInTheDocument();
    expect(screen.getByText(/Carl/)).toBeInTheDocument();
  });

  // Man kender sit eget tip — det står allerede markeret på kampen ovenfor.
  it('viser ikke mit eget tip blandt de andres', () => {
    mockHook.mockReturnValue({
      loading: false,
      error: '',
      bets: [
        { id: 'b0', uid: 'me', name: 'Mig', pick: '1' },
        { id: 'b1', uid: 'u1', name: 'Anne', pick: '2' },
      ],
    });
    renderIt();
    fireEvent.click(screen.getByRole('button', { name: /se ligaens tips/i }));
    expect(screen.queryByText(/Mig/)).not.toBeInTheDocument();
    expect(screen.getByText(/Anne/)).toBeInTheDocument();
  });

  // Formuleringen må ikke påstå, at ingen tippede: en tom liste kan også
  // være tips, der endnu ikke er bagfyldt med liga-feltet.
  it('siger forsigtigt til, når der ikke er noget at vise', () => {
    mockHook.mockReturnValue({ bets: [{ id: 'b0', uid: 'me', name: 'Mig', pick: '1' }], loading: false, error: '' });
    renderIt();
    fireEvent.click(screen.getByRole('button', { name: /se ligaens tips/i }));
    expect(screen.getByText(/Ingen tips at vise/i)).toBeInTheDocument();
  });

  // Uden liga ville forespørgslen blive afvist af reglen. Forklar hvorfor i
  // stedet for at vise en tom liste.
  it('forklarer, at man skal være i en liga — og henter ikke', () => {
    renderIt({ leagueIds: [] });
    expect(screen.getByRole('link', { name: /Bliv med i en liga/i }))
      .toHaveAttribute('href', '/spil/sl?fane=ligaer');
    expect(screen.queryByRole('button', { name: /se ligaens tips/i })).not.toBeInTheDocument();
  });

  it('viser en dansk fejl, hvis hentningen fejler', () => {
    mockHook.mockReturnValue({ bets: [], loading: false, error: 'Kunne ikke hente ligaens tips.' });
    renderIt();
    fireEvent.click(screen.getByRole('button', { name: /se ligaens tips/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/kunne ikke hente/i);
  });

  // --- Den ensomme ret ------------------------------------------------------
  //
  // Sætningen er panelets eneste indhold, der ikke kan slås op andre steder.
  // Der asserteres på HVAD der står — ikke kun på at noget blev vist.

  const FIRE = (result) => ({
    loading: false,
    error: '',
    bets: [
      { id: 'b0', uid: 'me', name: 'Mig', pick: '2' },
      { id: 'b1', uid: 'u1', name: 'Anne', pick: '1' },
      { id: 'b2', uid: 'u2', name: 'Bo', pick: '1' },
      { id: 'b3', uid: 'u3', name: 'Carl', pick: 'X' },
    ],
    result,
  });

  function folkUd(result) {
    const { bets, loading, error } = FIRE(result);
    mockHook.mockReturnValue({ bets, loading, error });
    render(
      <MemoryRouter initialEntries={['/spil/sl']}>
        <Routes>
          <Route
            path="/spil/:gameId"
            element={<LeagueBets gameId="sl" match={{ ...MATCH, result }} myUid="me" leagueIds={['L1']} />}
          />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /se ligaens tips/i }));
  }

  it('siger "Kun du", når man SELV stod alene med det rigtige', () => {
    // Mig tippede '2' og ingen andre gjorde. Filtreres ens eget tip fra
    // (som tabellen nedenunder gør), ville linjen sige det modsatte:
    // "ingen så den her" — til den, der så den.
    folkUd('2');
    expect(screen.getByText('Kun du så det komme — 1 af 4 ramte.')).toBeInTheDocument();
    expect(screen.queryByText(/Ingen i ligaen/)).not.toBeInTheDocument();
  });

  it('siger navnet, når det var en ANDEN, der stod alene', () => {
    folkUd('X');
    expect(screen.getByText('Kun Carl så det komme — 1 af 4 ramte.')).toBeInTheDocument();
  });

  it('siger til, når INGEN i ligaen ramte', () => {
    // Ingen tippede hjemmesejr uden at være Anne/Bo — facit '1' ramte to,
    // så vi bruger et facit, ingen valgte. Her: alle fire tippede 1/X/2,
    // så vi tester med et facit, ingen har.
    mockHook.mockReturnValue({
      loading: false,
      error: '',
      bets: [
        { id: 'b1', uid: 'u1', name: 'Anne', pick: '1' },
        { id: 'b2', uid: 'u2', name: 'Bo', pick: '1' },
        { id: 'b3', uid: 'u3', name: 'Carl', pick: '1' },
      ],
    });
    render(<LeagueBets gameId="sl" match={{ ...MATCH, result: '2' }} myUid="me" leagueIds={['L1']} />);
    fireEvent.click(screen.getByRole('button', { name: /se ligaens tips/i }));
    expect(screen.getByText('Ingen i ligaen så den her — 0 af 3 ramte.')).toBeInTheDocument();
  });

  it('tier, når FLERE ramte — så er der ingen historie', () => {
    folkUd('1'); // Anne og Bo ramte begge
    expect(screen.queryByText(/Kun /)).not.toBeInTheDocument();
    expect(screen.queryByText(/Ingen i ligaen/)).not.toBeInTheDocument();
  });

  it('tier før facit er sat', () => {
    folkUd(null);
    expect(screen.queryByText(/så det komme/)).not.toBeInTheDocument();
  });

  it('markerer det rigtige udfald, når facit er sat', () => {
    mockHook.mockReturnValue({
      loading: false,
      error: '',
      bets: [{ id: 'b1', uid: 'u1', name: 'Anne', pick: '1' }],
    });
    render(<LeagueBets gameId="sl" match={{ ...MATCH, result: '1' }} myUid="me" leagueIds={['L1']} />);
    fireEvent.click(screen.getByRole('button', { name: /se ligaens tips/i }));
    expect(screen.getByText('1')).toHaveClass('badge--green');
  });
});

describe('ensomRetLinje — gulvet', () => {
  const tre = (picks) => picks.map((p, i) => ({ id: `b${i}`, uid: `u${i}`, name: `N${i}`, pick: p }));

  it('tier under gulvet, hvor "kun én" er en mønt og ikke en historie', () => {
    // To tips: én ramte. Sandt, men uden vægt — derfor ingen linje.
    expect(ensomRetLinje(tre(['1', '2']), '1', 'x')).toBeNull();
    // Præcis ved gulvet siger den til. Hæves ENSOM_MINIMUM, bliver dette rødt.
    expect(ensomRetLinje(tre(['1', '2', '2']), '1', 'x'))
      .toBe('Kun N0 så det komme — 1 af 3 ramte.');
  });

  it('har et gulv på 3 — ikke 2', () => {
    expect(ENSOM_MINIMUM).toBe(3);
  });

  it('tæller kun GYLDIGE tips med i grundlaget', () => {
    const rodet = [
      { id: 'a', uid: 'u1', name: 'Anne', pick: '1' },
      { id: 'b', uid: 'u2', name: 'Bo', pick: '2' },
      { id: 'c', uid: 'u3', name: 'Carl', pick: '2' },
      { id: 'd', uid: 'u4', name: 'Dot', pick: null },
    ];
    // Fire rækker, men kun tre valg — grundlaget skal være 3, ikke 4.
    expect(ensomRetLinje(rodet, '1', 'x')).toBe('Kun Anne så det komme — 1 af 3 ramte.');
  });
});
