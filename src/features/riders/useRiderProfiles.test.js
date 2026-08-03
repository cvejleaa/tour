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
  it('merger + kanoniserer synonymer og deduplikerer (manuel vinder)', () => {
    const { result } = renderHook(() => useRiderProfiles());
    emit({
      riders: { 11: { type: 'climber', tags: ['klatrer', 'sprinter'] } }, // sprinter → spurter
      aiRaw: [
        { rider: 'Jonas Vingegaard', tag: 'spurter', stage: 5, evidence: 'e' }, // dublet af manuel (fra sprinter)
        { rider: 'Jonas Vingegaard', tag: 'baroudeur', stage: 5, evidence: 'x' }, // → udbryder (ny)
        { rider: 'Jonas Vingegaard', tag: 'angrebsrytter', stage: 6 }, // → udbryder (dublet)
        { rider: 'Jasper Philipsen', tag: 'Sprinter', stage: 3 }, // → spurter
      ],
    });
    const tags11 = result.current.tagsForBib(11);
    expect(tags11.map((t) => t.label)).toEqual(['klatrer', 'spurter', 'udbryder']);
    // spurter kommer fra manuel (fra 'sprinter'), fordi manuel vinder
    expect(tags11.find((t) => t.label === 'spurter').source).toBe('manual');
    expect(tags11.find((t) => t.label === 'udbryder').source).toBe('ai');
    // Philipsen (bib 42): 'Sprinter' → 'spurter'
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

  it('bygger allTags + bibsForTag (kanonisk) på tværs af manuelle og AI-tags', () => {
    const { result } = renderHook(() => useRiderProfiles());
    emit({
      riders: { 11: { tags: ['baroudeur'] } }, // → udbryder
      aiRaw: [
        { rider: 'Jasper Philipsen', tag: 'sprinter', stage: 3 }, // → spurter
        { rider: 'Jonas Vingegaard', tag: 'angrebsrytter', stage: 5 }, // → udbryder (bib 11)
      ],
    });
    const labels = result.current.allTags.map((t) => t.label).sort();
    expect(labels).toEqual(['spurter', 'udbryder']);
    // udbryder dækker bib 11 (manuel baroudeur + AI angrebsrytter → samme rytter)
    expect(result.current.bibsForTag('udbryder').sort()).toEqual([11]);
    expect(result.current.bibsForTag('spurter')).toEqual([42]);
    expect(result.current.bibsForTag('findes-ikke')).toEqual([]);
  });
});
