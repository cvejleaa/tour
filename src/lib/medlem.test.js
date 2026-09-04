import { describe, it, expect } from 'vitest';
import { erAktivtMedlem } from './medlem.js';

describe('erAktivtMedlem — spejlet af reglernes erAktivDeltager()', () => {
  it('kræver et dokument, og at forladt ikke er sat', () => {
    expect(erAktivtMedlem(null)).toBe(false);
    expect(erAktivtMedlem(undefined)).toBe(false);
    expect(erAktivtMedlem({ uid: 'a' })).toBe(true);
    expect(erAktivtMedlem({ uid: 'a', forladt: false })).toBe(true);
    expect(erAktivtMedlem({ uid: 'a', forladt: true })).toBe(false);
  });
});
