import { describe, it, expect } from 'vitest';
import pkg from './breakdown.js';
const { computeBreakdown } = pkg;

const roundById = {
  g1: 'group', g2: 'group',
  k1: 'r32', k2: 'final',
};

describe('computeBreakdown', () => {
  it('opdeler point i grundspil, slutspil og bonus', () => {
    const bets = [
      { matchId: 'g1', points: 5 },
      { matchId: 'g2', points: 2 },
      { matchId: 'k1', points: 7 },
      { matchId: 'k2', points: 3 },
    ];
    const bonus = [{ points: 10 }, { points: 0 }];
    const r = computeBreakdown(bets, bonus, roundById);
    expect(r.groupPoints).toBe(7);
    expect(r.knockoutPoints).toBe(10);
    expect(r.bonusPoints).toBe(10);
    expect(r.total).toBe(27);
  });

  it('ignorerer bets uden point', () => {
    const r = computeBreakdown([{ matchId: 'g1' }, { matchId: 'k1', points: 4 }], [], roundById);
    expect(r.groupPoints).toBe(0);
    expect(r.knockoutPoints).toBe(4);
    expect(r.total).toBe(4);
  });

  it('behandler ukendt matchId som grundspil', () => {
    const r = computeBreakdown([{ matchId: 'ukendt', points: 3 }], [], roundById);
    expect(r.groupPoints).toBe(3);
  });

  it('håndterer tomme lister', () => {
    expect(computeBreakdown([], [], roundById)).toEqual({
      total: 0, groupPoints: 0, knockoutPoints: 0, bonusPoints: 0,
    });
  });
});
