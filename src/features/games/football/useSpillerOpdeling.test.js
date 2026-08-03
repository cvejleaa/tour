/**
 * Tests for useSpillerOpdeling — selve hentningen af en spillers rækker.
 *
 * Både SpillerDetalje- og GameStandings-testene mocker hooken væk, så uden
 * disse var hele filen udækket: man kunne erstatte den med
 * `return { kampe: {}, loading: false, error: null }`, og hele suiten blev
 * stående grøn — mens panelet altid stod tomt i produktionen.
 *
 * Det, der SKAL vogtes:
 *  - ÉT getDoc på en KENDT sti. Bliver det en forespørgsel, slår reglens
 *    opslag pr. dokument loftet på 10, og HELE forespørgslen afvises.
 *  - "Dokumentet findes ikke" er en tom tilstand, ikke en fejl.
 *  - En afvist læsning skal sige hvorfor, ikke vise en tom liste.
 *  - Åbner man to spillere hurtigt efter hinanden, må det FØRSTE svar ikke
 *    overskrive det andet.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const mockGetDoc = vi.fn();
const mockDoc = vi.fn((db, ...path) => ({ _path: path }));

vi.mock('firebase/firestore', () => ({
  doc: (...a) => mockDoc(...a),
  getDoc: (...a) => mockGetDoc(...a),
}));

vi.mock('../../../firebase', () => ({ db: {} }));

import { useSpillerOpdeling } from './useSpillerOpdeling';

const KAMPE = { m1: { pick: '1', points: 2.5, chanceStake: 0 } };
const snap = (data) => ({ exists: () => data != null, data: () => data });

beforeEach(() => {
  vi.clearAllMocks();
  mockGetDoc.mockResolvedValue(snap({ uid: 'u1', kampe: KAMPE }));
});

describe('useSpillerOpdeling', () => {
  it('henter ÉT dokument på den kendte sti', async () => {
    const { result } = renderHook(() => useSpillerOpdeling('sl', 'u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockGetDoc).toHaveBeenCalledTimes(1);
    expect(mockDoc.mock.calls[0].slice(1))
      .toEqual(['games', 'sl', 'players', 'u1', 'detalje', 'opdeling']);
    expect(result.current.kampe).toEqual(KAMPE);
  });

  it('henter ikke uden spil eller spiller', () => {
    const { result } = renderHook(() => useSpillerOpdeling('sl', null));
    expect(mockGetDoc).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
  });

  // En nytilmeldt spiller har intet dokument endnu. Det er en tom tilstand —
  // ikke en fejl, og ikke `null`, som fladen ville læse som "kunne ikke
  // hentes".
  it('giver en tom liste, når dokumentet ikke findes', async () => {
    mockGetDoc.mockResolvedValue(snap(null));
    const { result } = renderHook(() => useSpillerOpdeling('sl', 'u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.kampe).toEqual({});
    expect(result.current.error).toBeNull();
  });

  // Dokumentet kan findes uden kampe-feltet (serveren har været forbi, men
  // spilleren har ingen afgjorte kampe). Må ikke give undefined videre.
  it('giver en tom liste, når dokumentet mangler kampe-feltet', async () => {
    mockGetDoc.mockResolvedValue(snap({ uid: 'u1' }));
    const { result } = renderHook(() => useSpillerOpdeling('sl', 'u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.kampe).toEqual({});
  });

  // Den forventede fejl: man deler ikke længere liga med spilleren. Vises der
  // bare en tom liste, ligner det, at han intet har tippet.
  it('siger hvorfor, når læsningen afvises', async () => {
    mockGetDoc.mockRejectedValue({ code: 'permission-denied' });
    const { result } = renderHook(() => useSpillerOpdeling('sl', 'u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toMatch(/deler ikke længere liga/);
    expect(result.current.kampe).toBeNull();
  });

  it('siger noget andet ved en almindelig fejl', async () => {
    mockGetDoc.mockRejectedValue({ code: 'unavailable' });
    const { result } = renderHook(() => useSpillerOpdeling('sl', 'u1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toMatch(/Kunne ikke hente/);
    expect(result.current.error).not.toMatch(/deler ikke længere liga/);
  });

  // Klikker man hurtigt fra én spiller til en anden, kommer svarene ikke
  // nødvendigvis i rækkefølge. Uden afbrudt-vagten kunne den FØRSTE spillers
  // rækker lande i panelet for den ANDEN — altså andres tal under et navn.
  it('lader et forsinket svar fra den forrige spiller ligge', async () => {
    let løsFørste;
    mockGetDoc.mockReturnValueOnce(new Promise((res) => { løsFørste = res; }));
    const ANDEN = { m9: { pick: 'X', points: 4, chanceStake: 0 } };
    mockGetDoc.mockResolvedValue(snap({ uid: 'u2', kampe: ANDEN }));

    const { result, rerender } = renderHook(({ uid }) => useSpillerOpdeling('sl', uid), {
      initialProps: { uid: 'u1' },
    });
    rerender({ uid: 'u2' });
    await waitFor(() => expect(result.current.kampe).toEqual(ANDEN));

    løsFørste(snap({ uid: 'u1', kampe: KAMPE }));
    await Promise.resolve();
    expect(result.current.kampe).toEqual(ANDEN);
  });
});
