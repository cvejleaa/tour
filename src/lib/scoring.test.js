import { describe, it, expect } from 'vitest';
import {
  scoreMatch, scoreKnockout, scoreBonus, outcome, POINTS,
  fuzzyNameMatch, bonusPoints,
} from './scoring';

describe('scoreMatch', () => {
  it('giver fuldt point for eksakt score', () => {
    expect(scoreMatch({ home: 2, away: 1 }, { home: 2, away: 1 })).toBe(POINTS.EXACT);
  });
  it('giver målforskel-point for korrekt udfald + målforskel', () => {
    expect(scoreMatch({ home: 2, away: 1 }, { home: 3, away: 2 })).toBe(POINTS.GOAL_DIFF);
  });
  it('giver udfald-point for korrekt vinder men forkert målforskel', () => {
    expect(scoreMatch({ home: 2, away: 1 }, { home: 4, away: 0 })).toBe(POINTS.OUTCOME);
  });
  it('giver 0 for forkert udfald', () => {
    expect(scoreMatch({ home: 2, away: 1 }, { home: 0, away: 1 })).toBe(POINTS.WRONG);
  });
  it('håndterer uafgjort eksakt vs. uafgjort målforskel', () => {
    expect(scoreMatch({ home: 1, away: 1 }, { home: 1, away: 1 })).toBe(POINTS.EXACT);
    expect(scoreMatch({ home: 1, away: 1 }, { home: 2, away: 2 })).toBe(POINTS.GOAL_DIFF);
  });
  it('returnerer 0 ved manglende data', () => {
    expect(scoreMatch(null, { home: 1, away: 1 })).toBe(0);
    expect(scoreMatch({ home: 1 }, { home: 1, away: 1 })).toBe(0);
  });
});

describe('outcome', () => {
  it('klassificerer korrekt', () => {
    expect(outcome(2, 1)).toBe('home');
    expect(outcome(1, 2)).toBe('away');
    expect(outcome(1, 1)).toBe('draw');
  });
});

describe('scoreKnockout', () => {
  it('lægger advance-bonus til score-point', () => {
    const pts = scoreKnockout(
      { home: 1, away: 1, advance: 'BRA' },
      { home: 1, away: 1, advance: 'BRA' }
    );
    expect(pts).toBe(POINTS.EXACT + POINTS.KNOCKOUT_ADVANCE);
  });
  it('giver ikke advance-bonus ved forkert videregående hold', () => {
    const pts = scoreKnockout(
      { home: 0, away: 0, advance: 'BRA' },
      { home: 0, away: 0, advance: 'ARG' }
    );
    expect(pts).toBe(POINTS.EXACT);
  });
});

describe('scoreBonus', () => {
  it('giver bonuspoint for korrekt svar', () => {
    expect(scoreBonus('Haaland', 'Haaland')).toBe(POINTS.BONUS);
  });
  it('giver 0 for forkert svar', () => {
    expect(scoreBonus('Haaland', 'Mbappé')).toBe(0);
  });
  it('er ufølsom for store/små bogstaver og mellemrum', () => {
    expect(scoreBonus('  haaland ', 'Haaland')).toBe(POINTS.BONUS);
    expect(scoreBonus('MBAPPÉ', 'mbappé')).toBe(POINTS.BONUS);
  });
  it('giver 0 for tomt svar', () => {
    expect(scoreBonus('   ', 'Haaland')).toBe(0);
  });
});

describe('fuzzyNameMatch', () => {
  it('matcher på tværs af accenter og tegn', () => {
    expect(fuzzyNameMatch('Mbappe', 'Mbappé')).toBe(true);
    expect(fuzzyNameMatch("M'Bappé", 'mbappe')).toBe(true);
  });
  it('tilgiver små stavefejl i længere navne', () => {
    expect(fuzzyNameMatch('Mbappee', 'Mbappé')).toBe(true);   // ekstra bogstav
    expect(fuzzyNameMatch('Halland', 'Haaland')).toBe(true);  // ombyttet
    expect(fuzzyNameMatch('Ronalde', 'Ronaldo')).toBe(true);  // 1 fejl
  });
  it('matcher kun efternavn mod fuldt navn', () => {
    expect(fuzzyNameMatch('Haaland', 'Erling Haaland')).toBe(true);
  });
  it('afviser klart forskellige navne', () => {
    expect(fuzzyNameMatch('Messi', 'Ronaldo')).toBe(false);
    expect(fuzzyNameMatch('Kane', 'Sane')).toBe(false); // korte navne kræver eksakt
  });
});

describe('bonusPoints', () => {
  it('topscorer: fuzzy mod facit giver point', () => {
    expect(bonusPoints({ answer: 'mbappe', facit: 'Mbappé', type: 'topScorer' })).toBe(POINTS.BONUS);
  });
  it('topscorer: admin-godkendt svar giver point selv ved større afvigelse', () => {
    expect(bonusPoints({ answer: 'Embappe', facit: 'Mbappé', type: 'topScorer', acceptedAnswers: ['Embappe'] })).toBe(POINTS.BONUS);
  });
  it('topscorer: forkert spiller giver 0', () => {
    expect(bonusPoints({ answer: 'Haaland', facit: 'Mbappé', type: 'topScorer' })).toBe(0);
  });
  it('gruppevinder: kræver eksakt match (ingen fuzzy på koder)', () => {
    expect(bonusPoints({ answer: 'BRA', facit: 'BRA', type: 'groupWinner' })).toBe(POINTS.BONUS);
    expect(bonusPoints({ answer: 'BRC', facit: 'BRA', type: 'groupWinner' })).toBe(0);
  });
});
