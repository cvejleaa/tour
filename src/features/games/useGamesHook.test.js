/**
 * useGames-HOOKEN (ikke kun splitGames): medlemskab og myPoints læses fra
 * players/{uid}-snapshots — og et forladt dokument er IKKE et medlemskab.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

// Snapshot-lyttere pr. sti; testen udløser dem selv.
const lyttere = new Map();
vi.mock('firebase/firestore', () => ({
  collection: (db, ...path) => ({ _path: path.join('/') }),
  doc: (db, ...path) => ({ _path: path.join('/') }),
  query: (col) => col,
  orderBy: () => null,
  onSnapshot: (ref, cb) => { lyttere.set(ref._path, cb); return () => lyttere.delete(ref._path); },
}));
vi.mock('../../firebase', () => ({ db: {} }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { uid: 'me' } }) }));

import { useGames } from './useGames';

const spilSnap = (ids) => ({ docs: ids.map((id) => ({ id, data: () => ({ name: id, order: 1 }) })) });
const spillerSnap = (data) => ({ exists: () => data != null, data: () => data });

beforeEach(() => lyttere.clear());

describe('useGames — medlemskab og point fra players/{uid}', () => {
  it('et forladt dokument tæller ikke som medlemskab, men pointene kan stadig læses', async () => {
    const { result } = renderHook(() => useGames());
    lyttere.get('games')(spilSnap(['sl', 'pl']));
    await waitFor(() => expect(lyttere.has('games/sl/players/me')).toBe(true));
    lyttere.get('games/sl/players/me')(spillerSnap({ uid: 'me', totalPoints: 12.5 }));
    lyttere.get('games/pl/players/me')(spillerSnap({ uid: 'me', totalPoints: 3, forladt: true }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect([...result.current.myGameIds]).toEqual(['sl']);
    expect(result.current.myPoints).toEqual({ sl: 12.5, pl: 3 });
  });

  it('uden dokument: ikke medlem, 0 point — og uden totalPoints-felt: 0', async () => {
    const { result } = renderHook(() => useGames());
    lyttere.get('games')(spilSnap(['sl', 'pl']));
    await waitFor(() => expect(lyttere.has('games/pl/players/me')).toBe(true));
    lyttere.get('games/sl/players/me')(spillerSnap(null));
    lyttere.get('games/pl/players/me')(spillerSnap({ uid: 'me' }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect([...result.current.myGameIds]).toEqual(['pl']);
    expect(result.current.myPoints).toEqual({ sl: 0, pl: 0 });
  });
});
