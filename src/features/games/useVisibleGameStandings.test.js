/**
 * Tests for useVisibleGameStandings.
 *
 * Komponenttesten mocker hooket væk, så uden disse kunne `leagues` fjernes fra
 * retur-objektet, uden at én eneste test opdagede det — og Stilling-fanen ville
 * hvidne, fordi visningen kalder leagues.find(...).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('../../firebase', () => ({ db: {} }));

const mockGameStandings = vi.fn();
vi.mock('./useGameStandings', () => ({
  useGameStandings: (...a) => mockGameStandings(...a),
}));

const mockAuth = vi.fn();
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => mockAuth(),
}));

import { useVisibleGameStandings } from './useVisibleGameStandings';

const ROWS = [
  { uid: 'me', name: 'Mig', totalPoints: 30 },
  { uid: 'u1', name: 'Anne', totalPoints: 20 },
  { uid: 'fremmed', name: 'Fremmed', totalPoints: 10 },
];
const LEAGUES = [{ id: 'L1', name: 'Kontoret', memberUids: ['me', 'u1'] }];

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockReturnValue({ user: { uid: 'me' } });
  mockGameStandings.mockReturnValue({
    standings: ROWS, leagues: LEAGUES, loading: false, error: null,
  });
});

describe('useVisibleGameStandings', () => {
  it('viser kun dem man deler liga med', () => {
    const { result } = renderHook(() => useVisibleGameStandings('sl'));
    expect(result.current.standings.map((r) => r.uid)).toEqual(['me', 'u1']);
  });

  // Visningen bruger dem til liga-filteret. Uden dem kaster GameStandings.
  it('giver mine ligaer med retur, så visningen kan filtrere', () => {
    const { result } = renderHook(() => useVisibleGameStandings('sl'));
    expect(result.current.leagues).toEqual(LEAGUES);
    expect(result.current.leagueCount).toBe(1);
  });

  it('giver en tom liste og nul ligaer, når man ikke er i nogen', () => {
    mockGameStandings.mockReturnValue({
      standings: ROWS, leagues: [], loading: false, error: null,
    });
    const { result } = renderHook(() => useVisibleGameStandings('sl'));
    expect(result.current.leagues).toEqual([]);
    expect(result.current.leagueCount).toBe(0);
    // Man kan altid se sig selv.
    expect(result.current.standings.map((r) => r.uid)).toEqual(['me']);
  });

  it('giver ingenting, når man ikke er logget ind', () => {
    mockAuth.mockReturnValue({ user: null });
    const { result } = renderHook(() => useVisibleGameStandings('sl'));
    expect(result.current.standings).toEqual([]);
  });

  it('sender loading og error videre uændret', () => {
    mockGameStandings.mockReturnValue({
      standings: [], leagues: [], loading: true, error: 'Kunne ikke hente stillingen.',
    });
    const { result } = renderHook(() => useVisibleGameStandings('sl'));
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBe('Kunne ikke hente stillingen.');
  });
});
