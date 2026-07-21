import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  OUTCOME_POINTS, isOutcome, outcomeFromScore, outcomePoints, settleChance, scoreBet,
  outcomeOdds, updateElo, actualHomeFromOutcome, outcomeProbabilities,
} = require('./superligaScoring');

describe('superligaScoring (server-spejl)', () => {
  it('1X2-point er vægtet 2/4/3', () => {
    expect(outcomePoints('1', '1')).toBe(2);
    expect(outcomePoints('X', 'X')).toBe(4);
    expect(outcomePoints('2', '2')).toBe(3);
    expect(outcomePoints('1', 'X')).toBe(0);
    expect(OUTCOME_POINTS.X).toBe(4);
  });

  it('udleder udfald af mål', () => {
    expect(outcomeFromScore(2, 0)).toBe('1');
    expect(outcomeFromScore(1, 1)).toBe('X');
    expect(outcomeFromScore(0, 2)).toBe('2');
    expect(outcomeFromScore(null, 1)).toBeNull();
  });

  it('validerer udfald', () => {
    expect(isOutcome('X')).toBe(true);
    expect(isOutcome('3')).toBe(false);
  });

  it('settleChance: gevinst = indsats×(odds−1), tab = −indsats, ingen bøde', () => {
    expect(settleChance({ correct: true, stake: 5, fairOdds: 3 })).toEqual({ delta: 10, profit: 10 });
    expect(settleChance({ correct: false, stake: 5, fairOdds: 3 })).toEqual({ delta: -5, profit: 0 });
    expect(settleChance({ correct: true, stake: 0, fairOdds: 3 })).toEqual({ delta: 0, profit: 0 });
  });

  describe('scoreBet (1X2 + Chancen samlet)', () => {
    it('uden chance = kun 1X2-point', () => {
      expect(scoreBet({ pick: 'X', chanceStake: 0 }, 'X')).toBe(4);
      expect(scoreBet({ pick: '1', chanceStake: 0 }, '2')).toBe(0);
    });
    it('med chance og ramt: base + gevinst', () => {
      // pick X rammer: 4 base + 8×(3−1)=16 → 20
      expect(scoreBet({ pick: 'X', chanceStake: 8 }, 'X', { X: 3 })).toBe(20);
    });
    it('med chance og forbi: 0 base − indsats', () => {
      expect(scoreBet({ pick: '1', chanceStake: 5 }, '2', { 1: 2 })).toBe(-5);
    });
    it('uden gyldige odds afregnes chancen ikke (kun base)', () => {
      expect(scoreBet({ pick: '1', chanceStake: 5 }, '1', null)).toBe(2);
      expect(scoreBet({ pick: '1', chanceStake: 5 }, '1', {})).toBe(2);
    });
  });

  describe('Elo/odds', () => {
    it('opdaterer Elo nulsum (vinder op, taber ned)', () => {
      const { home, away } = updateElo(1500, 1500, 1);
      expect(home).toBeGreaterThan(1500);
      expect(away).toBeLessThan(1500);
      expect((home - 1500) + (away - 1500)).toBeCloseTo(0, 6);
    });
    it('actualHome oversætter udfald', () => {
      expect(actualHomeFromOutcome('1')).toBe(1);
      expect(actualHomeFromOutcome('X')).toBe(0.5);
      expect(actualHomeFromOutcome('2')).toBe(0);
    });
    it('favorit hjemme → lav hjemme-odds', () => {
      const o = outcomeOdds({ eloHome: 1900, eloAway: 1300 });
      expect(o['1']).toBeLessThan(o['2']);
    });
    it('sandsynligheder summer til 1', () => {
      const p = outcomeProbabilities({ eloHome: 1600, eloAway: 1450 });
      expect(p['1'] + p.X + p['2']).toBeCloseTo(1, 6);
    });
  });

  it('server-spejl matcher src-udgaven (point, chance, odds, elo)', async () => {
    const src = await import('../src/lib/superligaScoring.js');
    for (const [pick, result] of [['1', '1'], ['X', 'X'], ['2', '2'], ['1', 'X']]) {
      expect(outcomePoints(pick, result)).toBe(src.outcomePoints(pick, result));
    }
    expect(settleChance({ correct: true, stake: 6, fairOdds: 2.5 }).delta)
      .toBe(src.settleChance({ correct: true, stake: 6, fairOdds: 2.5 }).delta);
    // Odds + Elo identisk med frontend-biblioteket.
    const args = { eloHome: 1623, eloAway: 1458 };
    expect(outcomeOdds(args)).toEqual(src.outcomeOdds(args));
    expect(updateElo(1574, 1521, 1)).toEqual(src.updateElo(1574, 1521, 1));
  });
});
