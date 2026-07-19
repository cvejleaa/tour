// Tests for leagueBonus — server-spejl af liga-bonus-scoringen (til AI-opslag).
import { describe, it, expect } from 'vitest';
import { closestWinners, scoreLeagueBonusAll, leagueBonusTotalsByUid } from './leagueBonus.js';

describe('closestWinners', () => {
  it('nærmeste vinder; alle nærmeste ved uafgjort', () => {
    const subs = [
      { uid: 'a', answer: '390' },
      { uid: 'b', answer: 400 },
      { uid: 'c', answer: 380 },
      { uid: 'd', answer: 'ikke-tal' },
    ];
    expect([...closestWinners(395, subs)].sort()).toEqual(['a', 'b']); // begge 5 fra
    expect([...closestWinners('', subs)]).toEqual([]);
  });
});

describe('scoreLeagueBonusAll', () => {
  it('NUMBER: vinderen får spørgsmålets point, resten 0', () => {
    const q = { type: 'number', facit: '410', points: 5 };
    const out = scoreLeagueBonusAll(q, [{ uid: 'a', answer: 390 }, { uid: 'b', answer: 420 }]);
    expect(out).toEqual({ a: 0, b: 5 });
  });

  it('TEAM: normaliseret eksakt match (store/små bogstaver ligegyldige)', () => {
    const q = { type: 'team', facit: 'Lidl-Trek', points: 3 };
    const out = scoreLeagueBonusAll(q, [{ uid: 'a', answer: 'LIDL-TREK' }, { uid: 'b', answer: 'Cofidis' }]);
    expect(out).toEqual({ a: 3, b: 0 });
  });

  it('TEXT: acceptedAnswers giver også point; intet facit → tomt', () => {
    const q = { type: 'text', facit: 'Pogacar', acceptedAnswers: ['Pogačar'], points: 2 };
    const out = scoreLeagueBonusAll(q, [{ uid: 'a', answer: 'pogačar' }, { uid: 'b', answer: 'Vingegaard' }]);
    expect(out).toEqual({ a: 2, b: 0 });
    expect(scoreLeagueBonusAll({ type: 'text', facit: '' }, [{ uid: 'a', answer: 'x' }])).toEqual({});
  });
});

describe('leagueBonusTotalsByUid', () => {
  it('summerer egne spørgsmål + manuelle tildelinger pr. uid', () => {
    const questions = [
      { id: 'q1', type: 'number', facit: '400', points: 5 },
      { id: 'q2', type: 'boolean', facit: 'ja', points: 2 },
    ];
    const answersByQid = {
      q1: [{ uid: 'san', answer: 398 }, { uid: 'bib', answer: 350 }],
      q2: [{ uid: 'bib', answer: 'ja' }],
    };
    const awards = [{ awards: { bib: 3, tom: -1 } }];
    expect(leagueBonusTotalsByUid(questions, answersByQid, awards)).toEqual({
      san: 5,   // nærmest på q1
      bib: 5,   // q2 rigtig (2) + tildeling (3)
      tom: -1,  // manuel tildeling
    });
  });

  it('tomt input → tomt objekt', () => {
    expect(leagueBonusTotalsByUid([], {}, [])).toEqual({});
  });
});
