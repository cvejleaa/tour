import { describe, it, expect } from 'vitest';
import { buildTipsHistory } from './tipsHistory';
// Loftet følger kuponens størrelse — hent det frem for at skrive et tal af.
import { combiLoft } from '../../../lib/superligaScoring';

// To runder à to kampe. Runde 1 spillet, runde 2 kun tippet.
const rounds = [
  {
    round: 1,
    matches: [
      { id: 'r1a', round: 1, home: 'AGF', away: 'OB', result: '1', odds: { 1: 2.0, X: 4, 2: 4 } },
      { id: 'r1b', round: 1, home: 'FCK', away: 'BIF', result: 'X', odds: { 1: 2, X: 3.0, 2: 4 } },
    ],
  },
  {
    round: 2,
    matches: [
      { id: 'r2a', round: 2, home: 'FCM', away: 'AGF', result: null, odds: { 1: 1.8, X: 4, 2: 4 } },
    ],
  },
];

describe('buildTipsHistory', () => {
  it('sammenstiller tips med facit + point og combi-bonus', () => {
    const bets = {
      r1a: { matchId: 'r1a', pick: '1', points: 2, chanceStake: 0 },   // ramt
      r1b: { matchId: 'r1b', pick: 'X', points: 3, chanceStake: 0 },   // ramt → runde 1 fuldt ramt
      r2a: { matchId: 'r2a', pick: '1', points: 0, chanceStake: 0 },   // afventer
    };
    const h = buildTipsHistory(rounds, bets);

    expect(h.totals.tipped).toBe(3);
    expect(h.totals.settled).toBe(2);       // kun runde 1 er spillet
    expect(h.totals.hits).toBe(2);
    expect(h.totals.hitRate).toBe(100);
    // Runde 1: begge ramt (tippet alle) → combi-bonus = 2.0×3.0 = 6.
    // 2,0×3,0 = 6, men kuponen er på to kampe og loftes.
    expect(h.rounds[0].roundBonus).toBe(combiLoft(2));
    // Point = bet-point (2+3+0) + bonus (6) = 11.
    // 5 i tip-point plus den loftede combi for en to-kamps kupon.
    expect(h.totals.points).toBe(5 + combiLoft(2));
  });

  // DEN FEJL, DER ALLEREDE FANDTES. "Point i alt" blev regnet her UDEN
  // puljebonussen og i stillingen MED den. Fra det øjeblik puljen afregnes,
  // viste Mine tips et lavere tal end Stilling for samme spiller — to formler
  // for det samme, én fane imellem.
  it('tæller puljebonussen med i totalen, ligesom stillingen gør', () => {
    const bets = {
      r1a: { matchId: 'r1a', pick: '1', points: 2, chanceStake: 0 },
      r1b: { matchId: 'r1b', pick: 'X', points: 3, chanceStake: 0 },
    };
    const uden = buildTipsHistory(rounds, bets);
    const med = buildTipsHistory(rounds, bets, 24);
    expect(med.totals.points - uden.totals.points).toBe(24);
  });

  it('behandler en manglende puljebonus som nul', () => {
    const bets = { r1a: { matchId: 'r1a', pick: '1', points: 2, chanceStake: 0 } };
    expect(buildTipsHistory(rounds, bets, undefined).totals.points)
      .toBe(buildTipsHistory(rounds, bets, 0).totals.points);
  });

  it('markerer afventende og ikke-ramte korrekt', () => {
    const bets = {
      r1a: { matchId: 'r1a', pick: '2', points: 0, chanceStake: 0 }, // forkert
      r2a: { matchId: 'r2a', pick: '1', points: 0, chanceStake: 5 }, // afventer + Chancen
    };
    const h = buildTipsHistory(rounds, bets);
    const r1a = h.rounds[0].rows.find((r) => r.id === 'r1a');
    const r2a = h.rounds[1].rows.find((r) => r.id === 'r2a');
    expect(r1a.hit).toBe(false);
    expect(r2a.settled).toBe(false);
    expect(r2a.isChance).toBe(true);
    // Runde 1 ikke fuldt tippet (r1b mangler) → ingen combi-bonus.
    expect(h.rounds[0].roundBonus).toBe(0);
  });

  it('tomt input giver nul-totaler', () => {
    const h = buildTipsHistory(rounds, {});
    expect(h.totals).toMatchObject({ tipped: 0, settled: 0, hits: 0, points: 0 });
  });
});
