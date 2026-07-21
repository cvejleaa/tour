import { describe, it, expect } from 'vitest';
import {
  OUTCOME, DEFAULT_POINTS, round1, outcomeReward, roundComboBonus, ROUND_BONUS,
  isOutcome, outcomeFromScore, outcomePoints,
  eloExpectedHome, outcomeProbabilities, fairOdds, ODDS, outcomeOdds,
  chanceMaxStake, canUseChance, isValidStake, settleChance,
  updateElo, actualHomeFromOutcome,
} from './superligaScoring';

describe('1X2-udfald', () => {
  it('udleder udfald af mål', () => {
    expect(outcomeFromScore(2, 1)).toBe(OUTCOME.HOME);
    expect(outcomeFromScore(0, 0)).toBe(OUTCOME.DRAW);
    expect(outcomeFromScore(1, 3)).toBe(OUTCOME.AWAY);
  });
  it('returnerer null for ufuldstændigt resultat', () => {
    expect(outcomeFromScore(null, 1)).toBeNull();
    expect(outcomeFromScore(2, undefined)).toBeNull();
  });
  it('validerer udfald', () => {
    expect(isOutcome('1')).toBe(true);
    expect(isOutcome('X')).toBe(true);
    expect(isOutcome('2')).toBe(true);
    expect(isOutcome('3')).toBe(false);
    expect(isOutcome(null)).toBe(false);
  });
});

describe('outcomePoints (point = odds, 1 decimal)', () => {
  const odds = { '1': 3.12, X: 4.27, '2': 2.25 };
  it('ramt udfald giver kampens odds afrundet til 1 decimal', () => {
    expect(outcomePoints('1', '1', odds)).toBe(3.1);
    expect(outcomePoints('X', 'X', odds)).toBe(4.3);
    expect(outcomePoints('2', '2', odds)).toBe(2.3);
  });
  it('forkert tip = 0', () => {
    expect(outcomePoints('1', 'X', odds)).toBe(0);
    expect(outcomePoints('2', '1', odds)).toBe(0);
  });
  it('ugyldigt input = 0', () => {
    expect(outcomePoints('1', null, odds)).toBe(0);
    expect(outcomePoints(undefined, '1', odds)).toBe(0);
  });
  it('falder tilbage til DEFAULT_POINTS uden gyldige odds', () => {
    expect(outcomePoints('1', '1')).toBe(DEFAULT_POINTS['1']);
    expect(outcomePoints('X', 'X', {})).toBe(DEFAULT_POINTS.X);
    expect(outcomePoints('2', '2', { '2': 'x' })).toBe(DEFAULT_POINTS['2']);
  });
});

describe('outcomeReward + round1', () => {
  it('round1 afrunder til 1 decimal', () => {
    expect(round1(3.12)).toBe(3.1);
    expect(round1(4.27)).toBe(4.3);
    expect(round1(2.25)).toBe(2.3);
    expect(round1('x')).toBe(0);
  });
  it('outcomeReward = kampens odds (1 decimal), ellers fallback', () => {
    expect(outcomeReward('1', { '1': 5.99 })).toBe(6);
    expect(outcomeReward('X', null)).toBe(DEFAULT_POINTS.X);
    expect(outcomeReward('bad', { bad: 2 })).toBe(0);
  });
});

describe('roundComboBonus (combi-runde-bonus)', () => {
  it('alle 6 ramt → odds ganget, loftet ved PERFECT_CAP', () => {
    // 1.5^6 ≈ 11.4 < 25 → ikke loftet
    expect(roundComboBonus([1.5, 1.5, 1.5, 1.5, 1.5, 1.5], 6)).toBe(round1(1.5 ** 6));
    // store odds → loft rammer
    expect(roundComboBonus([2, 2, 2, 2, 2, 2], 6)).toBe(ROUND_BONUS.PERFECT_CAP);
  });
  it('alle på nær én (5 af 6) → 5 odds ganget, loftet ved NEAR_CAP', () => {
    expect(roundComboBonus([1.4, 1.4, 1.4, 1.4, 1.4], 6)).toBe(round1(1.4 ** 5)); // ≈5.4
    expect(roundComboBonus([2, 2, 2, 2, 2], 6)).toBe(ROUND_BONUS.NEAR_CAP);        // 32 → loft 12
  });
  it('to eller flere fejl → ingen bonus', () => {
    expect(roundComboBonus([2, 2, 2, 2], 6)).toBe(0);
    expect(roundComboBonus([], 6)).toBe(0);
  });
  it('robust mod ugyldigt input', () => {
    expect(roundComboBonus(null, 6)).toBe(0);
    expect(roundComboBonus([2, 2], 1)).toBe(0);
    expect(roundComboBonus([1.5, 1.5], 2)).toBe(round1(2.25)); // 2-kamps runde, alle ramt
  });
});

describe('elo-lite sandsynligheder', () => {
  it('lige hold: hjemme favorit pga. hjemmebane, symmetrisk uafgjort', () => {
    const p = outcomeProbabilities({ eloHome: 1500, eloAway: 1500 });
    expect(p['1']).toBeGreaterThan(p['2']); // hjemmebane
    expect(p.X).toBeGreaterThan(0.2);
    const sum = p['1'] + p.X + p['2'];
    expect(sum).toBeCloseTo(1, 6);
  });
  it('summen af sandsynligheder er altid 1', () => {
    for (const [h, a] of [[1500, 1500], [1700, 1300], [1200, 1800], [1550, 1490]]) {
      const p = outcomeProbabilities({ eloHome: h, eloAway: a });
      expect(p['1'] + p.X + p['2']).toBeCloseTo(1, 6);
    }
  });
  it('stærkt hjemmehold har højest hjemme-sandsynlighed og lav uafgjort', () => {
    const even = outcomeProbabilities({ eloHome: 1500, eloAway: 1500 });
    const strong = outcomeProbabilities({ eloHome: 1900, eloAway: 1300 });
    expect(strong['1']).toBeGreaterThan(even['1']);
    expect(strong.X).toBeLessThan(even.X); // uafgjort falder med styrkeforskel
  });
  it('eloExpectedHome > 0.5 ved lige hold (hjemmebane)', () => {
    expect(eloExpectedHome(1500, 1500)).toBeGreaterThan(0.5);
    expect(eloExpectedHome(1500, 1500, 0)).toBeCloseTo(0.5, 6);
  });
});

describe('fair odds', () => {
  it('inverterer sandsynlighed', () => {
    expect(fairOdds(0.5)).toBe(2);
    expect(fairOdds(0.25)).toBe(4);
  });
  it('klippes til [MIN, MAX]', () => {
    expect(fairOdds(0.99)).toBe(ODDS.MIN);   // 1.01 → 1.1
    expect(fairOdds(0.01)).toBe(ODDS.MAX);   // 100 → 6.0
    expect(fairOdds(0)).toBe(ODDS.MAX);
  });
  it('favorit giver lav odds, outsider høj', () => {
    const o = outcomeOdds({ eloHome: 1900, eloAway: 1300 });
    expect(o['1']).toBeLessThan(o['2']); // favorit-hjemme billig, outsider-ude dyr
  });
});

describe('Chancen — indsatsgrænser', () => {
  it('max = min(absolut loft, 15% af saldo)', () => {
    expect(chanceMaxStake(10)).toBe(1);      // floor(0.15*10) = 1
    expect(chanceMaxStake(100)).toBe(15);    // 15% af 100
    expect(chanceMaxStake(200)).toBe(20);    // absolut loft (20) rammer først
    expect(chanceMaxStake(0)).toBe(0);
    expect(chanceMaxStake(6)).toBe(0);       // floor(0.9) = 0
  });
  it('cap er strengt under 50% ⇒ kan aldrig gå i minus', () => {
    for (const bank of [7, 25, 50, 200]) {
      expect(chanceMaxStake(bank)).toBeLessThan(bank * 0.5);
    }
  });
  it('canUseChance kræver råd til mindste indsats (mindst 7 point)', () => {
    expect(canUseChance(0)).toBe(false);
    expect(canUseChance(6)).toBe(false);     // max 0
    expect(canUseChance(7)).toBe(true);      // 15% = 1
  });
  it('validerer indsats mod saldo', () => {
    expect(isValidStake(1, 7)).toBe(true);
    expect(isValidStake(15, 100)).toBe(true);
    expect(isValidStake(16, 100)).toBe(false); // over max (15)
    expect(isValidStake(0, 100)).toBe(false);  // under MIN
    expect(isValidStake(2.5, 100)).toBe(false); // ikke heltal
  });
});

describe('Chancen — afregning', () => {
  it('gevinst = indsats × (odds − 1)', () => {
    expect(settleChance({ correct: true, stake: 5, fairOdds: 3 })).toEqual({ delta: 10, profit: 10 });
    expect(settleChance({ correct: true, stake: 4, fairOdds: 2 })).toEqual({ delta: 4, profit: 4 });
  });
  it('tab koster kun indsatsen (ingen bøde)', () => {
    expect(settleChance({ correct: false, stake: 5, fairOdds: 3 })).toEqual({ delta: -5, profit: 0 });
  });
  it('ingen indsats = ingen effekt', () => {
    expect(settleChance({ correct: true, stake: 0, fairOdds: 3 })).toEqual({ delta: 0, profit: 0 });
  });
  it('taber aldrig mere end indsatsen ⇒ saldo kan ikke gå i minus', () => {
    const bank = 10;
    const stake = chanceMaxStake(bank); // 4
    const { delta } = settleChance({ correct: false, stake, fairOdds: 6 });
    expect(bank + delta).toBeGreaterThanOrEqual(0);
  });
});

describe('Elo-vedligeholdelse', () => {
  it('vinder stiger, taber falder, nulsum', () => {
    const { home, away } = updateElo(1500, 1500, 1); // hjemmesejr
    expect(home).toBeGreaterThan(1500);
    expect(away).toBeLessThan(1500);
    expect((home - 1500) + (away - 1500)).toBeCloseTo(0, 6);
  });
  it('uafgjort flytter mod forventningen', () => {
    const { home, away } = updateElo(1700, 1300, 0.5); // favorit spiller uafgjort
    expect(home).toBeLessThan(1700); // favorit taber rating på uafgjort
    expect(away).toBeGreaterThan(1300);
  });
  it('actualHome oversætter udfald', () => {
    expect(actualHomeFromOutcome('1')).toBe(1);
    expect(actualHomeFromOutcome('X')).toBe(0.5);
    expect(actualHomeFromOutcome('2')).toBe(0);
  });
});
