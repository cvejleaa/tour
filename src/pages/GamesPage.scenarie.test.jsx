// Spiloversigten på det fælles scenarie: medlem med point, forladt spiller
// med point, og ikke-medlem — hver tilstand med det, der IKKE må stå.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { scenarie, FORLADT } from '../test/scenarie/superliga.js';
import { SPILLER, FREMMED, SPIL_ID, SPIL_NAVN, POINT } from '../../e2e/fixtures/konstanter.mjs';
import GamesPage from './GamesPage';

vi.mock('../firebase', () => ({ db: {}, auth: {} }));
let bruger = { uid: SPILLER.uid };
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: bruger }) }));
let hook = { games: [], myGameIds: new Set(), myPoints: {}, myForladt: new Set(), loading: false };
vi.mock('../features/games/useGames', async () => {
  const actual = await vi.importActual('../features/games/useGames');
  return { splitGames: actual.splitGames, useGames: () => hook };
});
vi.mock('../features/games/gameActions', () => ({
  joinGame: vi.fn().mockResolvedValue({ ok: true }),
  leaveGame: vi.fn().mockResolvedValue({ ok: true }),
}));

/** Det, useGames ville udlede af scenariets players-samling for brugeren `uid`. */
function hookFor(S, uid) {
  const p = S.spillere.find((x) => x.uid === uid);
  const medlem = p && !p.forladt;
  return {
    games: [S.spil],
    myGameIds: new Set(medlem ? [S.spil.id] : []),
    myPoints: p ? { [S.spil.id]: p.totalPoints } : {},
    myForladt: new Set(p?.forladt ? [S.spil.id] : []),
    loading: false,
  };
}

const vis = () => render(<MemoryRouter><GamesPage /></MemoryRouter>);

describe('GamesPage på det fælles scenarie', () => {
  beforeEach(() => vi.clearAllMocks());

  it('medlem: spillet står under Mine spil med mine point og Forlad — ikke Deltag', () => {
    const S = scenarie();
    bruger = { uid: SPILLER.uid };
    hook = hookFor(S, SPILLER.uid);
    vis();
    expect(screen.getByRole('button', { name: `Forlad ${SPIL_NAVN}` })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: new RegExp(`deltag i ${SPIL_NAVN}`, 'i') })).toBeNull();
  });

  it('medlem med point: Forlad spørger to gange, og anden dialog nævner mine 4,5 point i spillet', async () => {
    const S = scenarie();
    bruger = { uid: SPILLER.uid };
    hook = hookFor(S, SPILLER.uid);
    global.confirm = vi.fn(() => true);
    const { leaveGame } = await import('../features/games/gameActions');
    vis();
    fireEvent.click(screen.getByRole('button', { name: `Forlad ${SPIL_NAVN}` }));
    await waitFor(() => expect(leaveGame).toHaveBeenCalledWith(SPILLER.uid, SPIL_ID));
    expect(global.confirm).toHaveBeenCalledTimes(2);
    const [anden] = global.confirm.mock.calls[1];
    expect(anden).toContain(`Du står med 4,5 point i ${SPIL_NAVN}.`);
    expect(anden).not.toContain('4.5');
    expect(POINT[SPILLER.uid]).toBe(4.5);
  });

  it('forladt: spillet står under Åbne spil med «Vend tilbage» — hverken Forlad eller Deltag', () => {
    const S = scenarie();
    bruger = { uid: FORLADT.uid };
    hook = hookFor(S, FORLADT.uid);
    vis();
    expect(screen.getByRole('button', { name: `Vend tilbage til ${SPIL_NAVN}` })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: `Forlad ${SPIL_NAVN}` })).toBeNull();
    expect(screen.queryByRole('button', { name: new RegExp(`deltag i ${SPIL_NAVN}`, 'i') })).toBeNull();
  });

  it('ikke-medlem (ingen players-doc): Deltag — ikke Vend tilbage', () => {
    const S = scenarie();
    bruger = { uid: 'helt-ny' };
    hook = hookFor(S, 'helt-ny');
    vis();
    expect(screen.getByRole('button', { name: new RegExp(`deltag i ${SPIL_NAVN}`, 'i') })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: `Vend tilbage til ${SPIL_NAVN}` })).toBeNull();
  });

  it('en fremmed i en anden liga er stadig medlem af spillet — Forlad, med sine 9 point', () => {
    const S = scenarie();
    bruger = { uid: FREMMED.uid };
    hook = hookFor(S, FREMMED.uid);
    vis();
    expect(screen.getByRole('button', { name: `Forlad ${SPIL_NAVN}` })).toBeInTheDocument();
    expect(SPIL_ID).toBe(S.spil.id);
  });
});
