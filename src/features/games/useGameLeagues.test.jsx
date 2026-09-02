// useGameLeagues — dokument-id'et binder identiteten, og navnet er en streng.
//
// Begge er Security-fund fra puljens afsløring (PR #202): et `id`-felt i
// liga-dokumentet skyggede for dokument-id'et og kunne få en fremmeds
// stilling til at forsvinde, og et map som navn kastede i alle forbrugere.
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('../../firebase', () => ({ db: {} }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { uid: 'me' } }) }));

const mockDocs = { current: [] };
vi.mock('firebase/firestore', () => ({
  collection: () => ({}),
  query: () => ({}),
  where: () => ({}),
  onSnapshot: (_q, cb) => {
    cb({ docs: mockDocs.current.map((d) => ({ id: d.id, data: () => d.data })) });
    return () => {};
  },
}));

import { useGameLeagues } from './useGameLeagues';

describe('useGameLeagues', () => {
  it('dokument-id\'et vinder over et id-FELT i dokumentet', async () => {
    mockDocs.current = [
      { id: 'A', data: { name: 'Kontoret', memberUids: ['me'], id: 'fremmedLiga' } },
    ];
    const { result } = renderHook(() => useGameLeagues('sl'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.leagues.map((l) => l.id)).toEqual(['A']);
    expect(result.current.leagues[0].name).toBe('Kontoret');
  });

  it('et navn, der ikke er en streng, bliver tomt — det må ikke nå React som objekt', async () => {
    mockDocs.current = [
      { id: 'B', data: { name: { a: 1 }, memberUids: ['me'] } },
      { id: 'C', data: { name: 'Familien', memberUids: ['me'] } },
      { id: 'D', data: { name: 7, memberUids: ['me'] } },
    ];
    const { result } = renderHook(() => useGameLeagues('sl'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const navne = Object.fromEntries(result.current.leagues.map((l) => [l.id, l.name]));
    expect(navne).toEqual({ B: '', C: 'Familien', D: '' });
    // Sorteringen holder også uden String()-krykken: tomme først, så Familien.
    expect(result.current.leagues.map((l) => l.id)).toEqual(['B', 'D', 'C']);
  });
});
