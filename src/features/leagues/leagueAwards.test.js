// Tests for leagueAwards — manuelle liga-point på fælles bonusspørgsmål.
import { describe, it, expect } from 'vitest';
import { awardDocId, normalizeAwards, awardsByUidFromDocs } from './leagueAwards';

describe('awardDocId', () => {
  it('matcher reglernes id-krav (leagueId_questionId)', () => {
    expect(awardDocId('liga1', 'q9')).toBe('liga1_q9');
  });
});

describe('normalizeAwards', () => {
  it('beholder endelige tal ≠ 0 (også negative) og dropper resten', () => {
    expect(normalizeAwards({
      a: 5, b: '3', c: 0, d: '', e: 'abc', f: -2, ' ': 7, g: null,
    })).toEqual({ a: 5, b: 3, f: -2 });
  });

  it('tomt/ugyldigt input → tomt objekt', () => {
    expect(normalizeAwards(null)).toEqual({});
    expect(normalizeAwards({})).toEqual({});
  });
});

describe('awardsByUidFromDocs', () => {
  it('summerer på tværs af spørgsmål pr. medlem', () => {
    const docs = [
      { awards: { u1: 5, u2: 3 } },
      { awards: { u1: -1 } },
      { awards: {} },
      {},
    ];
    expect(awardsByUidFromDocs(docs)).toEqual({ u1: 4, u2: 3 });
  });

  it('tom liste → tomt objekt', () => {
    expect(awardsByUidFromDocs([])).toEqual({});
    expect(awardsByUidFromDocs(null)).toEqual({});
  });
});
