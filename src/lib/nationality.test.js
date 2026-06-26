import { describe, it, expect } from 'vitest';
import { nationalityIso, nationalityFlagUrl } from './nationality';

describe('nationalityIso', () => {
  it('mapper kendte nationaliteter til ISO', () => {
    expect(nationalityIso('Norway')).toBe('no');
    expect(nationalityIso('Germany')).toBe('de');
    expect(nationalityIso('Brazil')).toBe('br');
  });
  it('bruger flagcdn-regioner for hjemnationer', () => {
    expect(nationalityIso('England')).toBe('gb-eng');
    expect(nationalityIso('Scotland')).toBe('gb-sct');
  });
  it('trimmer og håndterer ukendt/tomt', () => {
    expect(nationalityIso(' France ')).toBe('fr');
    expect(nationalityIso('Atlantis')).toBeNull();
    expect(nationalityIso(null)).toBeNull();
    expect(nationalityIso(42)).toBeNull();
  });
});

describe('nationalityFlagUrl', () => {
  it('bygger flagcdn-URL i ønsket bredde', () => {
    expect(nationalityFlagUrl('Spain', 40)).toBe('https://flagcdn.com/w40/es.png');
  });
  it('returnerer null for ukendt', () => {
    expect(nationalityFlagUrl('Nowhere')).toBeNull();
  });
});
