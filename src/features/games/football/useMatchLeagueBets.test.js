/**
 * Tests for useMatchLeagueBets — selve hentningen af liga-kammeraternes tips.
 *
 * Komponenttesten mocker hooken væk, så uden disse ville forespørgslen være
 * helt udækket. Det farligste er array-contains-any-leddet: fjerner man det,
 * rammer forespørgslen dokumenter, reglen afviser, og så fejler HELE
 * forespørgslen — ikke bare de dokumenter, man ikke må se.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const mockGetDocs = vi.fn();
const mockWhere = vi.fn((field, op, value) => ({ _where: [field, op, value] }));
const mockQuery = vi.fn((col, ...clauses) => ({ _col: col, _clauses: clauses }));

vi.mock('firebase/firestore', () => ({
  collection: (db, ...path) => ({ _path: path }),
  documentId: () => '__name__',
  getDocs: (...a) => mockGetDocs(...a),
  query: (...a) => mockQuery(...a),
  where: (...a) => mockWhere(...a),
}));

vi.mock('../../../firebase', () => ({ db: {} }));

import { useMatchLeagueBets, chunk } from './useMatchLeagueBets';

/** Byg et snapshot, som forEach kan gå igennem. */
const snap = (docs) => ({ forEach: (fn) => docs.forEach(fn) });
const betDoc = (id, data) => ({ id, data: () => data });

beforeEach(() => {
  vi.clearAllMocks();
  mockGetDocs.mockResolvedValue(snap([]));
});

/** Alle where-led fra alle query()-kald, fladt. */
const allClauses = () => mockQuery.mock.calls.flatMap((c) => c.slice(1)).map((c) => c._where);

describe('chunk', () => {
  it('deler i klumper på højst 30 — Firestores grænse', () => {
    const ids = Array.from({ length: 31 }, (_, i) => `L${i}`);
    expect(chunk(ids).map((c) => c.length)).toEqual([30, 1]);
  });

  it('giver ingen klumper for en tom liste', () => {
    expect(chunk([])).toEqual([]);
  });
});

describe('useMatchLeagueBets', () => {
  it('henter ikke, før visningen er foldet ud', () => {
    renderHook(() => useMatchLeagueBets('sl', 'm1', ['L1'], false));
    expect(mockGetDocs).not.toHaveBeenCalled();
  });

  it('henter ikke uden ligaer — reglen ville afvise forespørgslen', () => {
    renderHook(() => useMatchLeagueBets('sl', 'm1', [], true));
    expect(mockGetDocs).not.toHaveBeenCalled();
  });

  // Uden dette led fejler HELE forespørgslen, ikke bare de dokumenter man ikke
  // må se. Det er repoets "regler er ikke filtre"-fælde.
  it('spørger på matchId OG array-contains-any med mine ligaer', async () => {
    renderHook(() => useMatchLeagueBets('sl', 'm1', ['L1', 'L2'], true));
    await waitFor(() => expect(mockGetDocs).toHaveBeenCalled());
    expect(allClauses()).toContainEqual(['matchId', '==', 'm1']);
    expect(allClauses()).toContainEqual(['leagueIds', 'array-contains-any', ['L1', 'L2']]);
  });

  it('deler mere end 30 ligaer op i flere forespørgsler', async () => {
    const many = Array.from({ length: 31 }, (_, i) => `L${String(i).padStart(2, '0')}`);
    renderHook(() => useMatchLeagueBets('sl', 'm1', many, true));
    // 2 tip-forespørgsler (30 + 1). Navneopslag sker kun hvis der er tips.
    await waitFor(() => expect(mockGetDocs).toHaveBeenCalledTimes(2));
  });

  it('viser samme tip én gang, selv når to ligaer er fælles', async () => {
    const many = Array.from({ length: 31 }, (_, i) => `L${String(i).padStart(2, '0')}`);
    // Samme dokument kommer igen i anden klump.
    mockGetDocs
      .mockResolvedValueOnce(snap([betDoc('u1_m1', { uid: 'u1', matchId: 'm1', pick: '1' })]))
      .mockResolvedValueOnce(snap([betDoc('u1_m1', { uid: 'u1', matchId: 'm1', pick: '1' })]))
      .mockResolvedValue(snap([{ id: 'u1', data: () => ({ displayName: 'Anne' }) }]));
    const { result } = renderHook(() => useMatchLeagueBets('sl', 'm1', many, true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.bets).toHaveLength(1);
    expect(result.current.bets[0].name).toBe('Anne');
  });

  it('sorterer på navn (dansk)', async () => {
    mockGetDocs
      .mockResolvedValueOnce(snap([
        betDoc('u1_m1', { uid: 'u1', matchId: 'm1', pick: '1' }),
        betDoc('u2_m1', { uid: 'u2', matchId: 'm1', pick: 'X' }),
      ]))
      .mockResolvedValue(snap([
        { id: 'u1', data: () => ({ displayName: 'Østergaard' }) },
        { id: 'u2', data: () => ({ displayName: 'Andersen' }) },
      ]));
    const { result } = renderHook(() => useMatchLeagueBets('sl', 'm1', ['L1'], true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.bets.map((b) => b.name)).toEqual(['Andersen', 'Østergaard']);
  });

  it('falder tilbage til et navn, når profilen mangler', async () => {
    mockGetDocs
      .mockResolvedValueOnce(snap([betDoc('u9_m1', { uid: 'u9', matchId: 'm1', pick: '2' })]))
      .mockResolvedValue(snap([]));
    const { result } = renderHook(() => useMatchLeagueBets('sl', 'm1', ['L1'], true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.bets[0].name).toBe('Ukendt spiller');
  });

  it('giver en dansk fejl, når forespørgslen afvises', async () => {
    mockGetDocs.mockRejectedValue(Object.assign(new Error('nej'), { code: 'permission-denied' }));
    const { result } = renderHook(() => useMatchLeagueBets('sl', 'm1', ['L1'], true));
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.error).toMatch(/kunne ikke hente/i);
    expect(result.current.bets).toEqual([]);
  });
});
