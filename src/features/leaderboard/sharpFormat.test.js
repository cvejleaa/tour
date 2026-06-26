import { describe, it, expect } from 'vitest';
import { fmt1, fmtSigned, fmtPenalty } from './sharpFormat';

describe('sharpFormat', () => {
  it('fmt1 afrunder til 1 decimal', () => {
    expect(fmt1(3)).toBe(3);
    expect(fmt1(2.25)).toBe(2.3);
    expect(fmt1(-1.5)).toBe(-1.5);
  });
  it('fmtSigned viser fortegn', () => {
    expect(fmtSigned(4)).toBe('+4');
    expect(fmtSigned(0)).toBe('0');
    expect(fmtSigned(-3)).toBe('-3');
    expect(fmtSigned(2.5)).toBe('+2.5');
  });
  it('fmtPenalty viser straffen som negativ tekst fra et positivt tal', () => {
    expect(fmtPenalty(2)).toBe('−2');
    expect(fmtPenalty(1.5)).toBe('−1.5');
    expect(fmtPenalty(0)).toBe('0');
    expect(fmtPenalty(-2)).toBe('−2'); // robust over for fortegn
  });
});
