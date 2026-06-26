import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('../../firebase', () => ({ db: {} }));

// onSnapshot kalder callback med en størrelse fra en kø (i kald-rækkefølge)
let sizeQueue = [];
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn((...a) => a),
  where: vi.fn((field, op, val) => ({ field, val })),
  onSnapshot: vi.fn((q, cb) => { cb({ size: sizeQueue.shift() ?? 0 }); return () => {}; }),
}));

import { usePendingApprovals } from './usePendingApprovals';

describe('usePendingApprovals', () => {
  beforeEach(() => { sizeQueue = []; });

  it('returnerer 0 når deaktiveret (ikke-admin)', () => {
    const { result } = renderHook(() => usePendingApprovals({ enabled: false }));
    expect(result.current.total).toBe(0);
  });

  it('tæller kun ligaer når includeUsers er false', () => {
    sizeQueue = [3]; // kun ligaer-abonnementet
    const { result } = renderHook(() => usePendingApprovals({ enabled: true, includeUsers: false }));
    expect(result.current.users).toBe(0);
    expect(result.current.leagues).toBe(3);
    expect(result.current.total).toBe(3);
  });

  it('tæller både brugere og ligaer for ejer', () => {
    sizeQueue = [2, 4]; // [brugere, ligaer]
    const { result } = renderHook(() => usePendingApprovals({ enabled: true, includeUsers: true }));
    expect(result.current.users).toBe(2);
    expect(result.current.leagues).toBe(4);
    expect(result.current.total).toBe(6);
  });
});
