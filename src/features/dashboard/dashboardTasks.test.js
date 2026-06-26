import { describe, it, expect } from 'vitest';
import {
  hasAnswerValue,
  countOpenUnansweredBonus,
  countOpenLeagueBonus,
} from './dashboardTasks';

const future = new Date(Date.now() + 3600_000);
const past = new Date(Date.now() - 3600_000);

describe('hasAnswerValue', () => {
  it('genkender ikke-tomme strenge', () => {
    expect(hasAnswerValue('Messi')).toBe(true);
    expect(hasAnswerValue('  ')).toBe(false);
    expect(hasAnswerValue('')).toBe(false);
    expect(hasAnswerValue(null)).toBe(false);
  });
  it('genkender top-liste-arrays med mindst ét felt', () => {
    expect(hasAnswerValue(['', 'Haaland'])).toBe(true);
    expect(hasAnswerValue(['', ''])).toBe(false);
    expect(hasAnswerValue([])).toBe(false);
  });
});

describe('countOpenUnansweredBonus', () => {
  const questions = [
    { id: 'a', deadline: future },
    { id: 'b', deadline: future },
    { id: 'c', deadline: past }, // låst → tæller ikke uanset
  ];
  it('tæller åbne spørgsmål uden svar', () => {
    expect(countOpenUnansweredBonus(questions, () => false)).toBe(2);
  });
  it('udelader besvarede', () => {
    expect(countOpenUnansweredBonus(questions, (id) => id === 'a')).toBe(1);
  });
  it('udelader låste også selvom ubesvaret', () => {
    expect(countOpenUnansweredBonus([{ id: 'c', deadline: past }], () => false)).toBe(0);
  });
  it('håndterer tom/manglende input', () => {
    expect(countOpenUnansweredBonus(null, () => false)).toBe(0);
    expect(countOpenUnansweredBonus(questions, null)).toBe(2);
  });
});

describe('countOpenLeagueBonus', () => {
  const questions = [
    { id: 'q1', deadline: future },
    { id: 'q2', deadline: future },
    { id: 'q3', deadline: past },
  ];
  it('tæller åbne, ubesvarede', () => {
    expect(countOpenLeagueBonus(questions, { q1: 'svar' })).toBe(1); // q2 mangler
  });
  it('0 når alt åbent er besvaret', () => {
    expect(countOpenLeagueBonus(questions, { q1: 'a', q2: 'b' })).toBe(0);
  });
  it('tom besvarelse tæller som mangler', () => {
    expect(countOpenLeagueBonus(questions, { q1: '', q2: '  ' })).toBe(2);
  });
});
