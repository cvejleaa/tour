import { describe, it, expect } from 'vitest';
import { eloRows } from './eloHistory';

const teams = [
  { name: 'A', short: 'A', elo: 1500 },
  { name: 'B', short: 'B', elo: 1500 },
];

describe('eloRows (ren visnings-formatter)', () => {
  it('uden historik: kun start = current, ingen kolonner', () => {
    const { rows, rounds } = eloRows(teams, []);
    expect(rounds).toEqual([]);
    expect(rows[0]).toMatchObject({ start: 1500, current: 1500, cells: [] });
  });

  it('beregner delta vs. forrige kolonne (og start for første)', () => {
    const history = [
      { round: 1, elo: { A: 1512, B: 1488 } },
      { round: 2, elo: { A: 1505, B: 1495 } },
    ];
    const { rows, rounds } = eloRows(teams, history);
    expect(rounds).toEqual([1, 2]);
    const a = rows.find((r) => r.name === 'A');
    expect(a.current).toBe(1505);
    expect(a.cells).toEqual([
      { round: 1, elo: 1512, delta: 12 },  // 1512 − 1500 (start)
      { round: 2, elo: 1505, delta: -7 },  // 1505 − 1512
    ]);
  });

  it('sorterer rækker efter aktuel rating (højest først)', () => {
    const { rows } = eloRows(teams, [{ round: 1, elo: { A: 1470, B: 1530 } }]);
    expect(rows.map((r) => r.name)).toEqual(['B', 'A']);
  });
});
