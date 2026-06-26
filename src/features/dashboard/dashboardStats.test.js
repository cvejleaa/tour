import { describe, it, expect } from 'vitest';
import { computeMyStats, recentResults } from './dashboardStats';

const matches = [
  { id: '1', round: 'group', kickoff: new Date('2026-06-11T18:00:00Z'), result: { home: 2, away: 1 } },
  { id: '2', round: 'group', kickoff: new Date('2026-06-12T18:00:00Z'), result: { home: 0, away: 0 } },
  { id: '3', round: 'group', kickoff: new Date('2026-06-13T18:00:00Z'), result: { home: 1, away: 3 } },
  { id: '4', round: 'group', kickoff: new Date('2026-06-14T18:00:00Z'), result: null }, // ikke spillet
];

// u1: eksakt i kamp 1, rigtigt udfald (men ej eksakt) i kamp 3, intet tip i kamp 2.
const bets = new Map([
  ['1', { id: 'b1', matchId: '1', uid: 'u1', home: 2, away: 1 }],
  ['3', { id: 'b3', matchId: '3', uid: 'u1', home: 0, away: 2 }],
]);

describe('computeMyStats', () => {
  it('beregner tips, eksakt, udfald og point', () => {
    const s = computeMyStats(matches, bets);
    expect(s.tips).toBe(2);
    expect(s.exact).toBe(1);
    expect(s.correctOutcome).toBe(2);
    expect(s.exactPct).toBe(50);
    expect(s.outcomePct).toBe(100);
    expect(s.points).toBeGreaterThan(0);
  });

  it('returnerer nuller uden tips', () => {
    expect(computeMyStats(matches, new Map())).toMatchObject({ tips: 0, points: 0, exactPct: 0 });
    expect(computeMyStats([], new Map())).toMatchObject({ tips: 0 });
  });
});

describe('recentResults', () => {
  it('returnerer seneste afsluttede kampe (nyeste først) med point', () => {
    const rows = recentResults(matches, bets, 5);
    expect(rows.map((r) => r.match.id)).toEqual(['3', '2', '1']); // nyeste først, kamp 4 mangler resultat
    expect(rows[0].points).toBeGreaterThan(0); // u1 ramte udfald i kamp 3
    expect(rows[1].points).toBeNull(); // intet tip i kamp 2
  });

  it('respekterer limit', () => {
    expect(recentResults(matches, bets, 1)).toHaveLength(1);
    expect(recentResults([], new Map())).toEqual([]);
  });
});
