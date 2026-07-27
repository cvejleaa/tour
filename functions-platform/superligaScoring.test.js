import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  DEFAULT_POINTS, ROUND_BONUS, round1, outcomeReward, roundComboBonus,
  isOutcome, outcomeFromScore, outcomePoints, settleChance, scoreBet, clampStake, CHANCE,
  PULJE, ELO,
  outcomeOdds, updateElo, actualHomeFromOutcome, outcomeProbabilities,
  leagueTable, championshipTeams, puljeScore,
} = require('./superligaScoring');

describe('superligaScoring (server-spejl)', () => {
  it('1X2-point følger kampens odds (1 decimal)', () => {
    const odds = { '1': 3.12, X: 4.27, '2': 2.25 };
    expect(outcomePoints('1', '1', odds)).toBe(3.1);
    expect(outcomePoints('X', 'X', odds)).toBe(4.3);
    expect(outcomePoints('2', '2', odds)).toBe(2.3);
    expect(outcomePoints('1', 'X', odds)).toBe(0);
    expect(round1(4.27)).toBe(4.3);
    expect(outcomeReward('X', null)).toBe(DEFAULT_POINTS.X);
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

  it('roundComboBonus: odds ganget, loftet; 0/1 fejl giver bonus, ≥2 giver 0', () => {
    expect(roundComboBonus([2, 2, 2, 2, 2, 2], 6)).toBe(ROUND_BONUS.PERFECT_CAP); // 64 → loft 25
    expect(roundComboBonus([1.5, 1.5, 1.5, 1.5, 1.5, 1.5], 6)).toBe(round1(1.5 ** 6));
    expect(roundComboBonus([2, 2, 2, 2, 2], 6)).toBe(ROUND_BONUS.NEAR_CAP);        // 1 fejl, 32 → loft 12
    expect(roundComboBonus([2, 2, 2, 2], 6)).toBe(0);                              // 2 fejl
  });

  it('pulje-tip: slutstilling + score (spejl)', () => {
    const matches = [
      { home: 'A', away: 'B', homeGoals: 2, awayGoals: 0 },
      { home: 'A', away: 'C', homeGoals: 1, awayGoals: 0 },
      { home: 'B', away: 'C', homeGoals: 3, awayGoals: 1 },
    ];
    expect(leagueTable(matches).map((r) => r.name)).toEqual(['A', 'B', 'C']);
    expect(championshipTeams(matches, 2)).toEqual(['A', 'B']);
    const top6 = ['A', 'B', 'C', 'D', 'E', 'F'];
    expect(puljeScore(['A', 'B', 'C', 'D', 'E', 'X'], top6)).toEqual({ correct: 5, points: 20 });
  });

  it('settleChance: gevinst = indsats×(odds−1), tab = −indsats, ingen bøde', () => {
    expect(settleChance({ correct: true, stake: 5, fairOdds: 3 })).toEqual({ delta: 10, profit: 10 });
    expect(settleChance({ correct: false, stake: 5, fairOdds: 3 })).toEqual({ delta: -5, profit: 0 });
    expect(settleChance({ correct: true, stake: 0, fairOdds: 3 })).toEqual({ delta: 0, profit: 0 });
  });

  it('settleChance: en forfalsket indsats klippes til det absolutte loft', () => {
    // Klienten begrænser indsatsen, men klienten kan omgås — serveren er
    // eneste autoritet. Uden loft ville dette give 1.999.998 point.
    const huge = settleChance({ correct: true, stake: 1000000, fairOdds: 3 });
    expect(huge.delta).toBe(CHANCE.MAX_ABS * 2); // 8 × (3−1)
    // Tabet er tilsvarende begrænset.
    expect(settleChance({ correct: false, stake: 1000000, fairOdds: 3 }).delta).toBe(-CHANCE.MAX_ABS);
  });

  it('clampStake: heltal, aldrig negativ, og saldo-andelen når saldoen kendes', () => {
    expect(clampStake(3)).toBe(3);
    expect(clampStake(99)).toBe(CHANCE.MAX_ABS);
    expect(clampStake(-5)).toBe(0);
    expect(clampStake(2.9)).toBe(2);
    expect(clampStake('nej')).toBe(0);
    // 15 % af 20 point = 3 → en indsats på 8 klippes til 3.
    expect(clampStake(8, 20)).toBe(3);
    // Uden point kan man ikke bruge Chancen.
    expect(clampStake(5, 0)).toBe(0);
  });

  it('scoreBet: en forfalsket indsats kan ikke give absurd mange point', () => {
    const pts = scoreBet({ pick: '1', chanceStake: 1000000 }, '1', { '1': 3 });
    expect(pts).toBe(3 + CHANCE.MAX_ABS * 2); // 1X2-point + loftet gevinst
  });

  describe('scoreBet (1X2 + Chancen samlet)', () => {
    it('uden chance = kun 1X2-point (= odds, 1 decimal)', () => {
      expect(scoreBet({ pick: 'X', chanceStake: 0 }, 'X', { X: 4.27 })).toBe(4.3);
      expect(scoreBet({ pick: '1', chanceStake: 0 }, '2', { '1': 2.5 })).toBe(0);
    });
    it('uden odds falder base tilbage til standard', () => {
      expect(scoreBet({ pick: 'X', chanceStake: 0 }, 'X')).toBe(DEFAULT_POINTS.X);
    });
    it('med chance og ramt: base(odds) + gevinst', () => {
      // pick X rammer med odds 3: base 3 + 8×(3−1)=16 → 19
      expect(scoreBet({ pick: 'X', chanceStake: 8 }, 'X', { X: 3 })).toBe(19);
    });
    it('med chance og forbi: 0 base − indsats', () => {
      expect(scoreBet({ pick: '1', chanceStake: 5 }, '2', { 1: 2 })).toBe(-5);
    });
    it('uden gyldige odds afregnes chancen ikke (kun fallback-base)', () => {
      expect(scoreBet({ pick: '1', chanceStake: 5 }, '1', null)).toBe(DEFAULT_POINTS['1']);
      expect(scoreBet({ pick: '1', chanceStake: 5 }, '1', {})).toBe(DEFAULT_POINTS['1']);
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
    const odds = { '1': 3.12, X: 4.27, '2': 2.25 };
    for (const [pick, result] of [['1', '1'], ['X', 'X'], ['2', '2'], ['1', 'X']]) {
      expect(outcomePoints(pick, result, odds)).toBe(src.outcomePoints(pick, result, odds));
    }
    expect(settleChance({ correct: true, stake: 6, fairOdds: 2.5 }).delta)
      .toBe(src.settleChance({ correct: true, stake: 6, fairOdds: 2.5 }).delta);
    // Combi-runde-bonus identisk med frontend-biblioteket.
    expect(roundComboBonus([2.2, 3.1, 1.8, 4.3, 2.0, 1.5], 6))
      .toBe(src.roundComboBonus([2.2, 3.1, 1.8, 4.3, 2.0, 1.5], 6));
    // Pulje-score identisk.
    const top6 = ['A', 'B', 'C', 'D', 'E', 'F'];
    expect(puljeScore(['A', 'B', 'C', 'X', 'Y', 'Z'], top6))
      .toEqual(src.puljeScore(['A', 'B', 'C', 'X', 'Y', 'Z'], top6));
    // Odds + Elo identisk med frontend-biblioteket.
    const args = { eloHome: 1623, eloAway: 1458 };
    expect(outcomeOdds(args)).toEqual(src.outcomeOdds(args));
    expect(updateElo(1574, 1521, 1)).toEqual(src.updateElo(1574, 1521, 1));

    // Slutstillingens tie-break afgør puljen (6./7.-pladsen) og er et oplagt
    // sted for drift mellem ESM og CommonJS — dansk localeCompare til sidst.
    const tied = [
      { home: 'Æble', away: 'Bo', homeGoals: 1, awayGoals: 1 },
      { home: 'Anders', away: 'Åge', homeGoals: 1, awayGoals: 1 },
      { home: 'Bo', away: 'Anders', homeGoals: 0, awayGoals: 0 },
      { home: 'Åge', away: 'Æble', homeGoals: 2, awayGoals: 2 },
    ];
    expect(leagueTable(tied).map((r) => r.name)).toEqual(src.leagueTable(tied).map((r) => r.name));
    expect(championshipTeams(tied, 2)).toEqual(src.championshipTeams(tied, 2));

    // Konstanterne skal også være ens — et loft der kun ændres ét sted er
    // præcis den slags drift, ingen opdager før pointene er forkerte.
    expect(ROUND_BONUS).toEqual(src.ROUND_BONUS);
    expect(CHANCE).toEqual(src.CHANCE);
    expect(PULJE).toEqual(src.PULJE);
    expect(ELO).toEqual(src.ELO);
  });
});
