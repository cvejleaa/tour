// Tests for similarStagesFor — find allerede-tippede etaper af samme type.
import { describe, it, expect } from 'vitest';
import { similarStagesFor } from './similarPicks';

const stages = [
  { id: 's1', number: 1, type: 'ttt', startCity: 'A', finishCity: 'B' },
  { id: 's2', number: 2, type: 'mountain', startCity: 'C', finishCity: 'D' },
  { id: 's3', number: 3, type: 'flat', startCity: 'E', finishCity: 'F' },
  { id: 's4', number: 4, type: 'mountain', startCity: 'G', finishCity: 'H' },
  { id: 's5', number: 5, type: 'mountain', startCity: 'I', finishCity: 'J' },
];

describe('similarStagesFor', () => {
  it('returnerer tippede etaper af SAMME type (ekskl. etapen selv), sorteret efter nummer', () => {
    const bets = {
      s2: { winnerTeam: 'X1', gcTeam: 'X2', mountainTeam: 'X3', sprintTeam: 'X4' },
      s3: { winnerTeam: 'Y1' }, // anden type — skal ikke med
      s4: { mountainTeam: 'Z3' },
    };
    // For etape 5 (bjerg) → lignende = etape 2 og 4 (begge bjerg, tippede)
    const out = similarStagesFor(stages[4], stages, bets);
    expect(out.map((s) => s.number)).toEqual([2, 4]);
    expect(out[0]).toMatchObject({
      id: 's2', number: 2, startCity: 'C', finishCity: 'D',
      picks: { winnerTeam: 'X1', gcTeam: 'X2', mountainTeam: 'X3', sprintTeam: 'X4' },
    });
    // Manglende felter bliver tom streng.
    expect(out[1].picks).toEqual({ winnerTeam: '', gcTeam: '', mountainTeam: 'Z3', sprintTeam: '' });
  });

  it('udelader etaper uden noget udfyldt felt', () => {
    const bets = {
      s2: { winnerTeam: '', gcTeam: '', mountainTeam: '', sprintTeam: '' }, // tom
      s4: { winnerTeam: 'Z1' },
    };
    expect(similarStagesFor(stages[4], stages, bets).map((s) => s.number)).toEqual([4]);
  });

  it('returnerer tom liste når der ingen lignende tippet etape findes', () => {
    expect(similarStagesFor(stages[4], stages, {})).toEqual([]);
    // Etape uden type → ingen sammenligning mulig.
    expect(similarStagesFor({ id: 'x', number: 9 }, stages, { s2: { winnerTeam: 'X1' } })).toEqual([]);
  });
});
