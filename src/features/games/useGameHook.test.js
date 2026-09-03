/**
 * useGame-HOOKEN: isMember er false for et forladt players-dokument.
 * (useGame.js:102 — mutationen "fjern me.forladt !== true" var grøn i hele
 * suiten, fordi ingen test renderede hooken.)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

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

import { useGame } from './useGame';

const docSnap = (data) => ({ exists: () => data != null, data: () => data, id: 'x' });
const kampe = () => ({ docs: [] });

beforeEach(() => lyttere.clear());

async function medDeltagelse(me) {
  const { result } = renderHook(() => useGame('sl'));
  await waitFor(() => expect(lyttere.has('games/sl/players/me')).toBe(true));
  lyttere.get('games/sl')(docSnap({ name: 'SL', status: 'open' }));
  lyttere.get('games/sl/players/me')(docSnap(me));
  lyttere.get('games/sl/matches')(kampe());
  await waitFor(() => expect(result.current.loading).toBe(false));
  return result.current;
}

describe('useGame — isMember', () => {
  it('et forladt dokument er ikke et medlemskab, men me bærer stadig arkivet', async () => {
    const r = await medDeltagelse({ uid: 'me', forladt: true, totalPoints: 12.5 });
    expect(r.isMember).toBe(false);
    expect(r.me).toMatchObject({ forladt: true, totalPoints: 12.5 });
  });
  it('et almindeligt dokument er et medlemskab; intet dokument er det ikke', async () => {
    expect((await medDeltagelse({ uid: 'me' })).isMember).toBe(true);
    lyttere.clear();
    expect((await medDeltagelse(null)).isMember).toBe(false);
  });
});
