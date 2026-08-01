// Tests for LeagueBets — hvad tippede mine liga-kammerater på en startet kamp.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../../../firebase', () => ({ db: {} }));

const mockHook = vi.fn();
vi.mock('./useMatchLeagueBets', () => ({
  useMatchLeagueBets: (...a) => mockHook(...a),
}));

import LeagueBets from './LeagueBets';

const MATCH = { id: 'm1', home: 'VIB', away: 'ODE', result: null };

beforeEach(() => {
  vi.clearAllMocks();
  mockHook.mockReturnValue({ bets: [], loading: false, error: '' });
});

function renderIt(props = {}) {
  return render(
    <LeagueBets gameId="sl" match={MATCH} myUid="me" leagueIds={['L1']} {...props} />,
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
    expect(screen.getByText(/Bliv med i en liga/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /se ligaens tips/i })).not.toBeInTheDocument();
  });

  it('viser en dansk fejl, hvis hentningen fejler', () => {
    mockHook.mockReturnValue({ bets: [], loading: false, error: 'Kunne ikke hente ligaens tips.' });
    renderIt();
    fireEvent.click(screen.getByRole('button', { name: /se ligaens tips/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/kunne ikke hente/i);
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
