import { describe, it, expect } from 'vitest';
import {
  scoreBonus, POINTS, fuzzyNameMatch, bonusPoints,
} from './scoring';

describe('scoreBonus', () => {
  it('giver bonuspoint for korrekt svar', () => {
    expect(scoreBonus('Vingegaard', 'Vingegaard')).toBe(POINTS.BONUS);
  });
  it('giver 0 for forkert svar', () => {
    expect(scoreBonus('Vingegaard', 'Pogačar')).toBe(0);
  });
  it('er ufølsom for store/små bogstaver og mellemrum', () => {
    expect(scoreBonus('  vingegaard ', 'Vingegaard')).toBe(POINTS.BONUS);
    expect(scoreBonus('POGAČAR', 'pogačar')).toBe(POINTS.BONUS);
  });
  it('giver 0 for tomt svar', () => {
    expect(scoreBonus('   ', 'Vingegaard')).toBe(0);
  });
});

describe('fuzzyNameMatch', () => {
  it('matcher på tværs af accenter og tegn', () => {
    expect(fuzzyNameMatch('Pogacar', 'Pogačar')).toBe(true);
    expect(fuzzyNameMatch("Van der Poel", 'vanderpoel')).toBe(true);
  });
  it('tilgiver små stavefejl i længere navne', () => {
    expect(fuzzyNameMatch('Vingegard', 'Vingegaard')).toBe(true);   // manglende bogstav
    expect(fuzzyNameMatch('Pogacar', 'Pogačar')).toBe(true);
    expect(fuzzyNameMatch('Roglice', 'Roglič')).toBe(true);         // 1 fejl
  });
  it('matcher kun efternavn mod fuldt navn', () => {
    expect(fuzzyNameMatch('Vingegaard', 'Jonas Vingegaard')).toBe(true);
  });
  it('afviser klart forskellige navne', () => {
    expect(fuzzyNameMatch('Pogačar', 'Vingegaard')).toBe(false);
    expect(fuzzyNameMatch('Kuss', 'Wout')).toBe(false); // korte navne kræver eksakt
  });
});

describe('bonusPoints', () => {
  it('fri tekst: fuzzy mod facit giver point', () => {
    expect(bonusPoints({ answer: 'pogacar', facit: 'Pogačar' })).toBe(POINTS.BONUS);
  });
  it('fri tekst: admin-godkendt svar giver point selv ved større afvigelse', () => {
    expect(bonusPoints({ answer: 'Poggy', facit: 'Pogačar', acceptedAnswers: ['Poggy'] })).toBe(POINTS.BONUS);
  });
  it('fri tekst: forkert svar giver 0', () => {
    expect(bonusPoints({ answer: 'Vingegaard', facit: 'Pogačar' })).toBe(0);
  });
  it('exact: kræver eksakt match (ingen fuzzy på koder)', () => {
    expect(bonusPoints({ answer: 'TVL', facit: 'TVL', type: 'exact' })).toBe(POINTS.BONUS);
    expect(bonusPoints({ answer: 'TVX', facit: 'TVL', type: 'exact' })).toBe(0);
  });
});
