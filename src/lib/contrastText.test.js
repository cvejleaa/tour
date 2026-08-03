import { describe, it, expect } from 'vitest';
import { textOn, colorDistance, colorsClash } from './contrastText';

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

describe('colorsClash', () => {
  it('samme/næsten-samme farve = clash', () => {
    expect(colorsClash('#FFFFFF', '#FFFFFF')).toBe(true);
    expect(colorsClash('#0A2240', '#111111')).toBe(true);   // navy vs sort
    expect(colorsClash('#E4002B', '#D2001F')).toBe(true);   // to røde
  });
  it('tydeligt forskellige farver = ingen clash', () => {
    expect(colorsClash('#E4002B', '#FFFFFF')).toBe(false);  // rød vs hvid
    expect(colorsClash('#0A2240', '#F5C500')).toBe(false);  // navy vs gul
    expect(colorsClash('#1E7A46', '#FFFFFF')).toBe(false);  // grøn vs hvid
  });
  it('ugyldig hex → uendelig afstand (ingen clash)', () => {
    expect(colorDistance('#abc', '#fff')).toBe(Infinity);
    expect(colorsClash('#abc', '#fff')).toBe(false);
  });
});
