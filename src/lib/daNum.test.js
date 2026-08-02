import { describe, it, expect } from 'vitest';
import { fmtPoints, fmtDec, fmtSignedPoints } from './daNum';

describe('fmtPoints', () => {
  it('heltal uden decimaler, decimaltal med dansk komma', () => {
    expect(fmtPoints(132)).toBe('132');
    expect(fmtPoints(132.7)).toBe('132,7');
    expect(fmtPoints(0)).toBe('0');
    expect(fmtPoints(5.4)).toBe('5,4');
  });
  it('robust mod ugyldigt input', () => {
    expect(fmtPoints(null)).toBe('0');
    expect(fmtPoints('abc')).toBe('0');
  });
});

describe('fmtDec', () => {
  it('fast antal decimaler med komma', () => {
    expect(fmtDec(3.1)).toBe('3,1');
    expect(fmtDec(2.25, 2)).toBe('2,25');
    expect(fmtDec(6)).toBe('6,0');
  });
});

describe('fmtSignedPoints', () => {
  it('fortegn foran, ægte minus-tegn', () => {
    expect(fmtSignedPoints(3.1)).toBe('+3,1');
    expect(fmtSignedPoints(-5)).toBe('−5');
    expect(fmtSignedPoints(0)).toBe('+0');
    expect(fmtSignedPoints(14.3)).toBe('+14,3');
  });
});
