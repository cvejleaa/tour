import { describe, it, expect } from 'vitest';
import {
  OUTCOME, DEFAULT_POINTS, round1, outcomeReward, roundComboBonus, COMBI, hitPoints, TRAEF_BONUS,
  isOutcome, outcomeFromScore, outcomePoints,
  eloExpectedHome, outcomeProbabilities, fairOdds, ODDS, outcomeOdds,
  chanceMaxStake, canUseChance, isValidStake, settleChance,
  updateElo, actualHomeFromOutcome,
  leagueTable, championshipTeams, puljeScore, PULJE,
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

describe('outcomePoints (point = odds + træf-bonus)', () => {
  const odds = { '1': 3.12, X: 4.27, '2': 2.25 };
  // Oddsene afrundet til 1 decimal, PLUS træf-bonussen på 1. Bonussen findes,
  // fordi rene fair odds gør alle strategier lige gode — se hitPoints.
  it('ramt udfald giver kampens odds (1 decimal) plus træf-bonussen', () => {
    expect(outcomePoints('1', '1', odds)).toBe(4.1);
    expect(outcomePoints('X', 'X', odds)).toBe(5.3);
    expect(outcomePoints('2', '2', odds)).toBe(3.3);
  });
  // Combi'en må IKKE se bonussen — den ganger de rene odds. Ryger de to
  // sammen, ville det ene point blive ganget med i stedet for lagt til.
  it('holder træf-bonussen ude af outcomeReward, som combien bruger', () => {
    expect(outcomeReward('1', odds)).toBe(3.1);
    expect(hitPoints('1', odds)).toBe(4.1);
    // toBeCloseTo: 4,1 − 3,1 giver 0,9999999999999996 i binær flydende komma.
    expect(hitPoints('1', odds) - outcomeReward('1', odds)).toBeCloseTo(TRAEF_BONUS, 10);
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
    expect(outcomePoints('1', '1')).toBe(DEFAULT_POINTS['1'] + TRAEF_BONUS);
    expect(outcomePoints('X', 'X', {})).toBe(DEFAULT_POINTS.X + TRAEF_BONUS);
    expect(outcomePoints('2', '2', { '2': 'x' })).toBe(DEFAULT_POINTS['2'] + TRAEF_BONUS);
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

describe('roundComboBonus (combi-bonus)', () => {
  // Formlen: 2 × kvadratroden af de ramte odds ganget sammen, loft 25.
  const forvent = (odds) => round1(Math.min(2 * Math.sqrt(odds.reduce((a, b) => a * b, 1)), 25));

  it('ganger de ramte odds og tager kvadratroden', () => {
    // 1,5^6 = 11,4 → 2·√11,4 = 6,8. Under loftet, så formlen er synlig.
    expect(roundComboBonus([1.5, 1.5, 1.5, 1.5, 1.5, 1.5], 6)).toBe(6.8);
    expect(roundComboBonus([1.5, 1.5, 1.5, 1.5, 1.5, 1.5], 6)).toBe(forvent([1.5, 1.5, 1.5, 1.5, 1.5, 1.5]));
  });

  // HVER ramt kamp tæller. Den gamle regel gav nul ved to fejl, og det var
  // netop dét, der straffede modige tip: sandsynligheden for at feje en runde
  // falder hurtigere med mod, end oddsene stiger.
  it('betaler også ved to og tre fejl', () => {
    expect(roundComboBonus([2, 2, 2, 2], 6)).toBe(8);   // 2 fejl → 2·√16
    expect(roundComboBonus([2, 2, 2], 6)).toBe(5.7);    // 3 fejl → 2·√8
  });

  // Loftet binder først et godt stykke over en ren favorit-runde (2·√86 ≈ 18,5),
  // så en modig fejlfri runde er stadig mere værd end en forsigtig.
  it('lofter ved 25, men først over favorit-niveau', () => {
    expect(roundComboBonus([2.1, 2.1, 2.1, 2.1, 2.1, 2.1], 6)).toBe(18.5); // favoritter
    expect(roundComboBonus([4, 4, 4, 4, 4, 4], 6)).toBe(25);               // outsidere → loft
    expect(COMBI.LOFT).toBe(25);
  });

  it('kræver mindst to ramte — én kamp er ingen kupon', () => {
    expect(roundComboBonus([2.1], 6)).toBe(0);
    expect(roundComboBonus([], 6)).toBe(0);
  });

  // Et LIGE antal negative odds giver et positivt produkt og dermed bonus.
  // Kræver at en admin skriver negative odds — men reglen skal ikke hvile på,
  // at ingen gør det.
  it('giver 0 ved negative odds, ikke bonus for et positivt produkt', () => {
    expect(roundComboBonus([-2, -3], 2)).toBe(0);
    expect(roundComboBonus([-2, 3], 2)).toBe(0);
    expect(roundComboBonus([0, 3], 2)).toBe(0);
  });

  it('robust mod ugyldigt input', () => {
    expect(roundComboBonus(null, 6)).toBe(0);
    expect(roundComboBonus([2, 2], 1)).toBe(0);   // kupon på under to kampe
    expect(roundComboBonus([1.5, 1.5], 2)).toBe(3); // 2·√2,25
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
  it('uafgjort ved lige hold er kalibreret mod Superligaens ~26 %', () => {
    const p = outcomeProbabilities({ eloHome: 1500, eloAway: 1500 });
    expect(p.X).toBeGreaterThan(0.24);
    expect(p.X).toBeLessThan(0.28);
  });
  it('uafgjort topper ved REELT lige hold (måles uden hjemmebane)', () => {
    const even = outcomeProbabilities({ eloHome: 1500, eloAway: 1500 }).X;
    // Et udehold der lige akkurat udligner hjemmebanen må ikke give MERE uafgjort
    // end to lige stærke hold (fejlen vi rettede: draw-toppen lå forskudt).
    const awayEdge = outcomeProbabilities({ eloHome: 1500, eloAway: 1560 }).X;
    expect(even).toBeGreaterThanOrEqual(awayEdge);
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
  it('max = min(absolut loft 8, 15% af saldo)', () => {
    expect(chanceMaxStake(10)).toBe(1);      // 15% binder: floor(0.15*10) = 1
    expect(chanceMaxStake(40)).toBe(6);      // 15% binder: floor(0.15*40) = 6
    expect(chanceMaxStake(100)).toBe(8);     // absolut loft (8) binder før 15%
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
    expect(isValidStake(8, 100)).toBe(true);    // = absolut loft
    expect(isValidStake(9, 100)).toBe(false);   // over max (8)
    expect(isValidStake(0, 100)).toBe(false);   // under MIN
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

describe('pulje-tip: slutstilling + score', () => {
  // 3 hold, hver spiller hinanden én gang. A slår B og C; B slår C.
  const matches = [
    { home: 'A', away: 'B', homeGoals: 2, awayGoals: 0 }, // A 3
    { home: 'A', away: 'C', homeGoals: 1, awayGoals: 0 }, // A 3
    { home: 'B', away: 'C', homeGoals: 3, awayGoals: 1 }, // B 3
  ];
  it('leagueTable rangerer efter point, målforskel, mål', () => {
    const t = leagueTable(matches);
    expect(t.map((r) => r.name)).toEqual(['A', 'B', 'C']);
    expect(t[0]).toMatchObject({ name: 'A', points: 6, gd: 3 });
    expect(t[1]).toMatchObject({ name: 'B', points: 3, gd: 0 });
    expect(t[2]).toMatchObject({ name: 'C', points: 0, gd: -3 });
  });
  it('championshipTeams tager de øverste N', () => {
    expect(championshipTeams(matches, 2)).toEqual(['A', 'B']);
  });
  it('ignorerer kampe uden gyldige mål', () => {
    const t = leagueTable([...matches, { home: 'A', away: 'B', homeGoals: null, awayGoals: 2 }]);
    expect(t[0].played).toBe(2); // den ugyldige kamp tælles ikke
  });
  it('puljeScore: point pr. korrekt hold + perfekt-bonus', () => {
    const top6 = ['A', 'B', 'C', 'D', 'E', 'F'];
    expect(puljeScore(['A', 'B', 'C', 'D', 'E', 'F'], top6))
      .toEqual({ correct: 6, points: 6 * PULJE.PER_TEAM + PULJE.PERFECT_BONUS });
    expect(puljeScore(['A', 'B', 'C', 'D', 'E', 'X'], top6))
      .toEqual({ correct: 5, points: 5 * PULJE.PER_TEAM });
    expect(puljeScore(['X', 'Y', 'Z', 'Q', 'R', 'S'], top6))
      .toEqual({ correct: 0, points: 0 });
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
