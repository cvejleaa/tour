import { describe, it, expect } from 'vitest';
import {
  lqNorm, lqPoints, lqSettled, scoreLeagueQuestion, leagueQuestionPointsByUid,
  leagueRankingWithQuestions, LQ_TYPES,
} from './leagueQuestionScoring';

// Whitelisten i createLeagueQuestion IMPORTERER LQ_TYPES — én liste, ikke to.
// En type, der mangler her, bliver TAVST til 'text' ved oprettelse, så
// formularen ser ud til at virke, mens spørgsmålet opretter sig som fritekst.
describe('LQ_TYPES', () => {
  it('rummer alle fire typer — også hold', () => {
    expect(LQ_TYPES).toEqual(['text', 'yesno', 'number', 'team']);
  });
});

describe('lqNorm/lqPoints/lqSettled', () => {
  it('normaliserer, defaulter point og genkender afgjorte spørgsmål', () => {
    expect(lqNorm('  FC  København ')).toBe('fc københavn');
    expect(lqPoints({ points: 8 })).toBe(8);
    expect(lqPoints({ points: 0 })).toBe(5);
    expect(lqPoints({})).toBe(5);
    expect(lqSettled({ facit: 'x' })).toBe(true);
    expect(lqSettled({ facit: '' })).toBe(false);
    expect(lqSettled({})).toBe(false);
  });
});

describe('scoreLeagueQuestion', () => {
  it('tekst: normaliseret match mod facit + acceptedAnswers', () => {
    const q = { type: 'text', points: 5, facit: 'FCK', acceptedAnswers: ['FC København'] };
    const per = scoreLeagueQuestion(q, [
      { uid: 'a', answer: 'fck' },
      { uid: 'b', answer: ' fc  københavn ' },
      { uid: 'c', answer: 'Brøndby' },
    ]);
    expect(per).toEqual({ a: 5, b: 5 });
  });

  it('yesno scorer som tekst', () => {
    const q = { type: 'yesno', points: 2, facit: 'ja' };
    expect(scoreLeagueQuestion(q, [{ uid: 'a', answer: 'Ja' }, { uid: 'b', answer: 'nej' }])).toEqual({ a: 2 });
  });

  it('hold: eksakt kanonisk match — et andet hold scorer ikke', () => {
    // Svar og facit kommer begge fra spillets holdliste (dropdown), så der er
    // intet acceptedAnswers-sikkerhedsnet — matchet SKAL være eksakt.
    const q = { type: 'team', points: 10, facit: 'Arsenal' };
    const per = scoreLeagueQuestion(q, [
      { uid: 'a', answer: 'Arsenal' },
      { uid: 'b', answer: 'Aston Villa' },
    ]);
    expect(per).toEqual({ a: 10 });
  });

  it('number: nærmeste vinder — ALLE med mindste afstand får fulde point', () => {
    const q = { type: 'number', points: 10, facit: '42' };
    const per = scoreLeagueQuestion(q, [
      { uid: 'a', answer: '40' },  // afstand 2
      { uid: 'b', answer: '44' },  // afstand 2
      { uid: 'c', answer: '50' },  // afstand 8
      { uid: 'd', answer: 'øh' },  // ugyldigt
    ]);
    expect(per).toEqual({ a: 10, b: 10 });
  });

  it('number accepterer dansk komma', () => {
    const q = { type: 'number', points: 3, facit: '2,5' };
    expect(scoreLeagueQuestion(q, [{ uid: 'a', answer: '2,5' }])).toEqual({ a: 3 });
  });

  it('uden facit: ingen point', () => {
    expect(scoreLeagueQuestion({ type: 'text', facit: null }, [{ uid: 'a', answer: 'x' }])).toEqual({});
  });
});

describe('leagueQuestionPointsByUid', () => {
  it('summerer på tværs af spørgsmål', () => {
    const questions = [
      { id: 'q1', type: 'text', points: 5, facit: 'x' },
      { id: 'q2', type: 'number', points: 3, facit: '10' },
    ];
    const answers = {
      q1: [{ uid: 'a', answer: 'x' }, { uid: 'b', answer: 'y' }],
      q2: [{ uid: 'a', answer: '9' }, { uid: 'b', answer: '12' }],
    };
    expect(leagueQuestionPointsByUid(questions, answers)).toEqual({ a: 8 });
  });
});

describe('leagueRankingWithQuestions', () => {
  const standings = [
    { uid: 'a', name: 'Anna', totalPoints: 10 },
    { uid: 'b', name: 'Bo', totalPoints: 8 },
    { uid: 'c', name: 'Carla', totalPoints: 6 },
    { uid: 'x', name: 'Udenfor', totalPoints: 99 }, // ikke medlem
  ];

  it('lægger spørgsmåls-point til, omsorterer og giver delt rang', () => {
    const rows = leagueRankingWithQuestions(standings, ['a', 'b', 'c'], { b: 2 });
    // Anna 10, Bo 8+2=10 (deler førstepladsen), Carla 6.
    expect(rows.map((r) => [r.rank, r.name, r.totalPoints, r.lqPoints])).toEqual([
      [1, 'Anna', 10, 0],
      [1, 'Bo', 10, 2],
      [3, 'Carla', 6, 0],
    ]);
  });

  it('uden spørgsmåls-point svarer den til almindelig subset-rangering', () => {
    const rows = leagueRankingWithQuestions(standings, ['a', 'c']);
    expect(rows.map((r) => [r.rank, r.uid])).toEqual([[1, 'a'], [2, 'c']]);
  });
});
