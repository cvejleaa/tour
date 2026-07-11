// Tests for useRiderProfiles-mergelogikken via en fake snapshot.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

let snapshotCb = null;
vi.mock('../../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  onSnapshot: vi.fn((ref, cb) => { snapshotCb = cb; return () => {}; }),
}));

// riderInfo: kortlæg kendte navne → bib for testen.
vi.mock('../../data/ridersTdf2026', () => ({
  riderInfo: (name) => {
    const map = { 'Jonas Vingegaard': { bib: 11 }, 'Jasper Philipsen': { bib: 42 } };
    return map[name] || null;
  },
}));

import { useRiderProfiles } from './useRiderProfiles';

function emit(data) {
  act(() => { snapshotCb({ exists: () => data != null, data: () => data }); });
}

beforeEach(() => { snapshotCb = null; });

describe('useRiderProfiles', () => {
  it('merger manuelle + AI-tags og deduplikerer (manuel vinder)', () => {
    const { result } = renderHook(() => useRiderProfiles());
    emit({
      riders: { 11: { type: 'climber', tags: ['kaptajn', 'baroudeur'] } },
      aiRaw: [
        { rider: 'Jonas Vingegaard', tag: 'baroudeur', stage: 5, evidence: 'e' }, // dublet af manuel
        { rider: 'Jonas Vingegaard', tag: 'angrebsrytter', stage: 5, evidence: 'x' },
        { rider: 'Jasper Philipsen', tag: 'spurter', stage: 3 },
      ],
    });
    const tags11 = result.current.tagsForBib(11);
    expect(tags11.map((t) => t.label)).toEqual(['kaptajn', 'baroudeur', 'angrebsrytter']);
    // baroudeur kommer fra manuel (ikke ai), fordi manuel vinder
    expect(tags11.find((t) => t.label === 'baroudeur').source).toBe('manual');
    expect(tags11.find((t) => t.label === 'angrebsrytter').source).toBe('ai');
    // Philipsen (bib 42) får sit AI-spurter-tag
    expect(result.current.tagsForBib(42).map((t) => t.label)).toEqual(['spurter']);
  });

  it('type-override vinder over fallback', () => {
    const { result } = renderHook(() => useRiderProfiles());
    emit({ riders: { 11: { type: 'sprinter' } } });
    expect(result.current.typeForBib(11, 'climber')).toBe('sprinter');
    expect(result.current.typeForBib(99, 'climber')).toBe('climber');
  });

  it('ignorerer AI-tags for ukendte navne', () => {
    const { result } = renderHook(() => useRiderProfiles());
    emit({ aiRaw: [{ rider: 'Ukendt Rytter', tag: 'spurter', stage: 1 }] });
    expect(result.current.aiByBib.size).toBe(0);
  });
});
