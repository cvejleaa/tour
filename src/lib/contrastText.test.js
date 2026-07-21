import { describe, it, expect } from 'vitest';
import { textOn } from './contrastText';

describe('textOn', () => {
  it('mørk farve → hvid tekst', () => {
    expect(textOn('#0A2240')).toBe('#ffffff'); // FCK navy
    expect(textOn('#1E7A46')).toBe('#ffffff'); // Viborg grøn
    expect(textOn('#000000')).toBe('#ffffff');
  });
  it('lys farve → mørk tekst', () => {
    expect(textOn('#F5C500')).toBe('#10151b'); // Brøndby gul
    expect(textOn('#FFD200')).toBe('#10151b'); // FCN gul
    expect(textOn('#ffffff')).toBe('#10151b');
  });
  it('håndterer manglende/ugyldig hex', () => {
    expect(textOn(null)).toBe('#ffffff');
    expect(textOn('#abc')).toBe('#ffffff');
  });
});
