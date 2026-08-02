import { describe, it, expect } from 'vitest';
import { opdelPoint, combiBonus } from './pointOpdeling.js';
import { playerRoundBonus } from './gameScoring.js';

// Ét regnestykke for "hvor kommer pointene fra". Det fandtes før to steder ad
// hver sin vej — og de var allerede uenige om puljebonussen.

const NU = Date.parse('2026-08-02T18:00:00Z');
const foer = NU - 60 * 60_000;

/** Runde-kontekst som buildRoundContext bygger den, men med kickoff. */
function ctx(matches) {
  const byMatch = {};
  const rounds = {};
  for (const m of matches) {
    byMatch[m.id] = { round: m.round, result: m.result, odds: m.odds || null, kickoff: m.kickoff ?? foer };
    if (!rounds[m.round]) rounds[m.round] = { count: 0, settledCount: 0 };
    rounds[m.round].count += 1;
    if (m.result) rounds[m.round].settledCount += 1;
  }
  return { byMatch, rounds };
}

describe('opdelPoint', () => {
  it('deler point op i 1X2 og Chancen', () => {
    const roundCtx = ctx([{ id: 'm1', round: 1, result: '1', odds: { 1: 2.5, X: 4, 2: 4 } }]);
    // 2,5 for 1X2 + 3,0 fra Chancen = 5,5 gemt på tippet.
    const res = opdelPoint({ bets: [{ matchId: 'm1', pick: '1', points: 5.5 }], roundCtx, nowMs: NU });
    expect(res.p1x2).toBe(2.5);
    expect(res.chance).toBe(3);
    expect(res.total).toBe(5.5);
  });

  // Chancen UDLEDES. Serveren afregner med clampStake uden bank-loft, så en
  // genberegning ville give et andet tal — og delene ville ikke summe til
  // totalen, som stillingen viser.
  it('udleder Chancen af de gemte point, i stedet for at regne den ud igen', () => {
    const roundCtx = ctx([{ id: 'm1', round: 1, result: '1', odds: { 1: 2.0, X: 4, 2: 4 } }]);
    // Et vildt indsats-tal på tippet må ikke påvirke resultatet — kun points gør.
    const res = opdelPoint({
      bets: [{ matchId: 'm1', pick: '1', points: 9.9, chanceStake: 999 }], roundCtx, nowMs: NU,
    });
    expect(res.p1x2).toBe(2);
    expect(res.chance).toBe(7.9);
    expect(res.total).toBe(9.9);
  });

  it('giver et negativt Chancen-tal, når indsatsen blev tabt', () => {
    const roundCtx = ctx([{ id: 'm1', round: 1, result: 'X', odds: { 1: 2.0, X: 4, 2: 4 } }]);
    const res = opdelPoint({ bets: [{ matchId: 'm1', pick: '1', points: -3 }], roundCtx, nowMs: NU });
    expect(res.p1x2).toBe(0);   // ramte ikke
    expect(res.chance).toBe(-3);
    expect(res.total).toBe(0);  // gulvet — saldoen går aldrig i minus
  });

  it('tæller ikke kampe uden facit', () => {
    const roundCtx = ctx([{ id: 'm1', round: 1, result: null, odds: { 1: 2.5, X: 4, 2: 4 } }]);
    const res = opdelPoint({ bets: [{ matchId: 'm1', pick: '1', points: 0 }], roundCtx, nowMs: NU });
    expect(res.kampe).toHaveLength(0);
    expect(res.total).toBe(0);
  });

  // SIKKERHED, ikke pynt. Opdelingen havner i et dokument, liga-kammerater må
  // læse, og det kommer aldrig forbi kickoff-tjekket i firestore.rules. Sætter
  // en admin et facit på en kamp, der ikke er begyndt, ville tippet ellers
  // blive udstillet før kampstart.
  it('tæller IKKE en kamp, hvis kickoff ligger i fremtiden', () => {
    const roundCtx = ctx([{
      id: 'm1', round: 1, result: '1', odds: { 1: 2.5, X: 4, 2: 4 }, kickoff: NU + 60 * 60_000,
    }]);
    const res = opdelPoint({ bets: [{ matchId: 'm1', pick: '1', points: 2.5 }], roundCtx, nowMs: NU });
    expect(res.kampe).toHaveLength(0);
    expect(res.p1x2).toBe(0);
    expect(res.total).toBe(0);
  });

  it('ser bort fra tips på kampe, konteksten ikke kender', () => {
    const roundCtx = ctx([{ id: 'm1', round: 1, result: '1', odds: { 1: 2.5, X: 4, 2: 4 } }]);
    const res = opdelPoint({ bets: [{ matchId: 'ukendt', pick: '1', points: 5 }], roundCtx, nowMs: NU });
    expect(res.total).toBe(0);
  });

  it('lægger puljebonussen med i totalen', () => {
    const roundCtx = ctx([{ id: 'm1', round: 1, result: '1', odds: { 1: 2.5, X: 4, 2: 4 } }]);
    const res = opdelPoint({
      bets: [{ matchId: 'm1', pick: '1', points: 2.5 }], roundCtx, puljeBonus: 24, nowMs: NU,
    });
    expect(res.pulje).toBe(24);
    expect(res.total).toBe(26.5);
  });

  // Den fejl, modulet findes for: tipsHistory regnede totalen UDEN pulje,
  // mens stillingen regnede den MED. Samme spiller, to tal, én fane imellem.
  it('regner totalen som stillingen gør — ikke som tipsHistory gjorde', () => {
    const roundCtx = ctx([{ id: 'm1', round: 1, result: '1', odds: { 1: 2.5, X: 4, 2: 4 } }]);
    const bets = [{ matchId: 'm1', pick: '1', points: 2.5 }];
    const medPulje = opdelPoint({ bets, roundCtx, puljeBonus: 10, nowMs: NU });
    const udenPulje = opdelPoint({ bets, roundCtx, puljeBonus: 0, nowMs: NU });
    expect(medPulje.total - udenPulje.total).toBe(10);
  });

  it('gulver totalen ved 0 og runder én gang', () => {
    const roundCtx = ctx([
      { id: 'm1', round: 1, result: '1', odds: { 1: 1.1, X: 4, 2: 4 } },
      { id: 'm2', round: 1, result: '1', odds: { 1: 1.1, X: 4, 2: 4 } },
    ]);
    const res = opdelPoint({
      bets: [
        { matchId: 'm1', pick: '2', points: -8.05 },
        { matchId: 'm2', pick: '2', points: -4.05 },
      ],
      roundCtx,
      nowMs: NU,
    });
    expect(res.total).toBe(0);
    expect(Number.isFinite(res.chance)).toBe(true);
  });

  // Rubrikkerne afrundes hver for sig, fordi de vises. Totalen afrundes én
  // gang. De to kan derfor afvige nogle tiendedele — det er KENDT og bundet,
  // ikke noget vi opdager i produktion.
  it('holder afvigelsen mellem summen af rubrikker og totalen under 0,2', () => {
    const roundCtx = ctx([
      { id: 'm1', round: 1, result: '1', odds: { 1: 1.17, X: 4, 2: 4 } },
      { id: 'm2', round: 1, result: 'X', odds: { 1: 4, X: 3.33, 2: 4 } },
    ]);
    const res = opdelPoint({
      bets: [
        { matchId: 'm1', pick: '1', points: 1.24 },
        { matchId: 'm2', pick: 'X', points: 3.38 },
      ],
      roundCtx,
      puljeBonus: 0.05,
      nowMs: NU,
    });
    const sum = res.p1x2 + res.chance + res.combi + res.pulje;
    expect(Math.abs(sum - res.total)).toBeLessThanOrEqual(0.2);
  });
});

describe('combiBonus', () => {
  const runde = ctx([
    { id: 'm1', round: 1, result: '1', odds: { 1: 2.0, X: 4, 2: 4 } },
    { id: 'm2', round: 1, result: 'X', odds: { 1: 4, X: 3.0, 2: 4 } },
  ]);

  it('giver bonus, når hele runden er tippet og ramt', () => {
    const bets = [{ matchId: 'm1', pick: '1' }, { matchId: 'm2', pick: 'X' }];
    expect(combiBonus(bets, runde)).toBeGreaterThan(0);
  });

  it('giver ingen bonus, når spilleren ikke tippede hele runden', () => {
    expect(combiBonus([{ matchId: 'm1', pick: '1' }], runde)).toBe(0);
  });

  it('giver ingen bonus, før hele runden er afgjort', () => {
    const halv = ctx([
      { id: 'm1', round: 1, result: '1', odds: { 1: 2.0, X: 4, 2: 4 } },
      { id: 'm2', round: 1, result: null, odds: { 1: 4, X: 3.0, 2: 4 } },
    ]);
    expect(combiBonus([{ matchId: 'm1', pick: '1' }, { matchId: 'm2', pick: 'X' }], halv)).toBe(0);
  });

  // Samme regnestykke som serveren allerede brugte. Driver de to fra hinanden,
  // ændrer stillingen sig uden at nogen har rørt combi-reglerne.
  it('giver samme tal som playerRoundBonus i gameScoring', () => {
    const bets = [{ matchId: 'm1', pick: '1' }, { matchId: 'm2', pick: 'X' }];
    expect(combiBonus(bets, runde)).toBe(playerRoundBonus(bets, runde));
  });
});

describe('spejling mod src/lib', () => {
  it('server-spejlet matcher src-udgaven', async () => {
    const src = await import('../src/lib/pointOpdeling.js');
    const roundCtx = ctx([
      { id: 'm1', round: 1, result: '1', odds: { 1: 2.17, X: 4, 2: 4 } },
      { id: 'm2', round: 1, result: 'X', odds: { 1: 4, X: 3.33, 2: 4 } },
    ]);
    const bets = [
      { matchId: 'm1', pick: '1', points: 5.42 },
      { matchId: 'm2', pick: 'X', points: 3.33 },
    ];
    const arg = { bets, roundCtx, puljeBonus: 7.5, nowMs: NU };
    expect(opdelPoint(arg)).toEqual(src.opdelPoint(arg));
    expect(combiBonus(bets, roundCtx)).toBe(src.combiBonus(bets, roundCtx));
  });
});
