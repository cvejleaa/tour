// useLeagues (Tour-ligaerne) — dokument-id'et binder identiteten, navnet er en streng.
// Samme to Security-fund som for spil-ligaerne (useGameLeagues.test.jsx).
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('../../firebase', () => ({ db: {} }));
const mockDocs = { current: [] };
vi.mock('firebase/firestore', () => ({
  collection: () => ({}), query: () => ({}), where: () => ({}), orderBy: () => ({}),
  onSnapshot: (_q, cb) => {
    cb({ docs: mockDocs.current.map((d) => ({ id: d.id, data: () => d.data })) });
    return () => {};
  },
}));

import { useLeagues } from './useLeagues';
import { useAllLeagues } from './useAllLeagues';

describe('useLeagues og useAllLeagues', () => {
  it('dokument-id\'et vinder, og et ikke-streng navn bliver tomt', async () => {
    mockDocs.current = [
      { id: 'TA', data: { name: 'Min liga', memberUids: ['me'], id: 'TB' } },
      { id: 'TC', data: { name: { toString: null }, memberUids: ['me'] } },
    ];
    for (const hook of [() => useLeagues('me'), () => useAllLeagues(true)]) {
      const { result } = renderHook(hook);
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.leagues.map((l) => [l.id, l.name])).toEqual([['TA', 'Min liga'], ['TC', '']]);
    }
  });
});
