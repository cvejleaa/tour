// Paritetstest: functions-platform/leagueQuestionScoring.js er et SPEJL af
// src/features/games/leagueQuestionScoring.js. Testen kører BEGGE udgaver på
// de samme fixtures og kræver identiske udfald — så en rettelse i den ene
// uden den anden bliver rød her, ikke i produktion (spejlede filer følges ad).
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import * as klient from '../src/features/games/leagueQuestionScoring.js';

const require = createRequire(import.meta.url);
const server = require('./leagueQuestionScoring.js');

const CASES = [
  ['text: normaliseret match + acceptedAnswers',
    { type: 'text', facit: 'Haaland', acceptedAnswers: ['Erling Haaland'], points: 10 },
    [{ uid: 'a', answer: '  haaland ' }, { uid: 'b', answer: 'erling  haaland' }, { uid: 'c', answer: 'Isak' }]],
  ['yesno', { type: 'yesno', facit: 'ja', points: 5 },
    [{ uid: 'a', answer: 'Ja' }, { uid: 'b', answer: 'nej' }]],
  ['team: eksakt kanonisk navn', { type: 'team', facit: 'Arsenal', points: 7 },
    [{ uid: 'a', answer: 'Arsenal' }, { uid: 'b', answer: 'Chelsea' }]],
  ['number: nærmest vinder — ALLE med mindste afstand', { type: 'number', facit: '10', points: 5 },
    [{ uid: 'a', answer: '8' }, { uid: 'b', answer: '12' }, { uid: 'c', answer: '30' }, { uid: 'd', answer: 'ikke et tal' }]],
  ['number: komma-decimal', { type: 'number', facit: '2,5', points: 5 },
    [{ uid: 'a', answer: '2.4' }, { uid: 'b', answer: '3' }]],
  ['uden facit: ingen point', { type: 'text', facit: null, points: 5 }, [{ uid: 'a', answer: 'x' }]],
  ['tom-streng facit: ikke afgjort', { type: 'text', facit: '  ', points: 5 }, [{ uid: 'a', answer: 'x' }]],
  ['ugyldige points → default', { type: 'yesno', facit: 'nej', points: -3 }, [{ uid: 'a', answer: 'nej' }]],
];

describe('leagueQuestionScoring — server spejler klienten', () => {
  for (const [navn, q, answers] of CASES) {
    it(navn, () => {
      expect(server.scoreLeagueQuestion(q, answers)).toEqual(klient.scoreLeagueQuestion(q, answers));
    });
  }

  it('konstanter og hjælpere er identiske', () => {
    expect(server.LQ_TYPES).toEqual(klient.LQ_TYPES);
    expect(server.DEFAULT_LQ_POINTS).toBe(klient.DEFAULT_LQ_POINTS);
    for (const s of ['  Foo  Bar ', 'ÆØÅ', null]) expect(server.lqNorm(s)).toBe(klient.lqNorm(s));
    for (const q of [{ points: 8 }, { points: 0 }, {}]) expect(server.lqPoints(q)).toBe(klient.lqPoints(q));
    for (const q of [{ facit: 'x' }, { facit: null }, { facit: ' ' }, {}]) {
      expect(server.lqSettled(q)).toBe(klient.lqSettled(q));
    }
  });

  // QC-fund på planen: 'number' er SÆT-AFHÆNGIG. Fjernes et svar fra sættet
  // (fx et eks-medlems), kan vinderen skifte — serveren SKAL score over hele
  // sættet, og denne test er båndet, der viser hvorfor.
  it('number: at udelade et svar kan ændre vinderen — hele sættet skal med', () => {
    const q = { type: 'number', facit: '10', points: 5 };
    const alle = [{ uid: 'medlem', answer: '14' }, { uid: 'eks-medlem', answer: '11' }];
    expect(server.scoreLeagueQuestion(q, alle)).toEqual({ 'eks-medlem': 5 });
    // uden eks-medlemmets svar ville 'medlem' fejlagtigt vinde:
    expect(server.scoreLeagueQuestion(q, alle.slice(0, 1))).toEqual({ medlem: 5 });
  });
});
