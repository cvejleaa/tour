// Tests for riderTagCanon (backend) — synonym-kanonisering.
import { describe, it, expect } from 'vitest';
import { canonTag, CANON_TAGS, SYNONYMS } from './riderTagCanon.js';

describe('canonTag', () => {
  it('samler synonymer på ét dansk ord', () => {
    expect(canonTag('Sprinter')).toBe('spurter');
    expect(canonTag('massespurter')).toBe('spurter');
    expect(canonTag('baroudeur')).toBe('udbryder');
    expect(canonTag('angrebsrytter')).toBe('udbryder');
    expect(canonTag('bjergrytter')).toBe('klatrer');
    expect(canonTag('domestique')).toBe('hjælperytter');
  });

  it('lader kanoniske/ukendte termer stå (trimmet, små bogstaver)', () => {
    expect(canonTag('  Klatrer ')).toBe('klatrer');
    expect(canonTag('spurter')).toBe('spurter');
    expect(canonTag('noget-nyt')).toBe('noget-nyt');
    expect(canonTag('')).toBe('');
  });

  it('ingen kanonisk term er selv et synonym (idempotent)', () => {
    for (const t of CANON_TAGS) {
      expect(canonTag(t)).toBe(t);
      expect(SYNONYMS[t]).toBeUndefined();
    }
  });
});
