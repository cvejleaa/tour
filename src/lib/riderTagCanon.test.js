// Tests for riderTagCanon (frontend) — spejler functions/riderTagCanon.test.js.
import { describe, it, expect } from 'vitest';
import { canonTag, CANON_TAGS, SYNONYMS } from './riderTagCanon';

describe('canonTag (frontend)', () => {
  it('samler synonymer på ét dansk ord', () => {
    expect(canonTag('Sprinter')).toBe('spurter');
    expect(canonTag('baroudeur')).toBe('udbryder');
    expect(canonTag('bjergrytter')).toBe('klatrer');
    expect(canonTag('  Klatrer ')).toBe('klatrer');
    expect(canonTag('noget-nyt')).toBe('noget-nyt');
    expect(canonTag('')).toBe('');
  });

  it('kanoniske termer er idempotente', () => {
    for (const t of CANON_TAGS) {
      expect(canonTag(t)).toBe(t);
      expect(SYNONYMS[t]).toBeUndefined();
    }
  });
});
