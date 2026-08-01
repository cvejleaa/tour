import { describe, it, expect } from 'vitest';
import { eloRows, eloFormByTeam } from './eloHistory';

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

// ── eloFormByTeam: de seneste udviklingspunkter til tip-fladen ──────────────
describe('eloFormByTeam', () => {
  const teams = [
    { name: 'AGF', short: 'AGF', elo: 1500 },
    { name: 'FCK', short: 'FCK', elo: 1600 },
  ];
  // Seks runder, så vi kan se, at der klippes til fem.
  const history = [
    { round: 1, elo: { AGF: 1510, FCK: 1590 } },
    { round: 2, elo: { AGF: 1505, FCK: 1600 } },
    { round: 3, elo: { AGF: 1520, FCK: 1595 } },
    { round: 4, elo: { AGF: 1515, FCK: 1605 } },
    { round: 5, elo: { AGF: 1530, FCK: 1610 } },
    { round: 6, elo: { AGF: 1525, FCK: 1620 } },
  ];

  it('giver højst fem punkter, nyeste sidst', () => {
    const m = eloFormByTeam(teams, history);
    expect(m.AGF.form.map((c) => c.round)).toEqual([2, 3, 4, 5, 6]);
    expect(m.AGF.current).toBe(1525);
  });

  it('regner udviklingen som forskellen til forrige runde', () => {
    const m = eloFormByTeam(teams, history);
    // 1505→1520→1515→1530→1525
    expect(m.AGF.form.map((c) => c.delta)).toEqual([-5, 15, -5, 15, -5]);
  });

  it('trend er summen af de VISTE punkter, ikke hele sæsonen', () => {
    const m = eloFormByTeam(teams, history);
    // Runde 2-6: -5+15-5+15-5 = 15. Hele sæsonen ville være 1525-1500 = 25.
    expect(m.AGF.trend).toBe(15);
    expect(m.AGF.current - m.AGF.start).toBe(25);
  });

  // "når vi har så mange" — med færre runder vises dem, der er.
  it('viser dem der er, når der er spillet under fem runder', () => {
    const m = eloFormByTeam(teams, history.slice(0, 2));
    expect(m.AGF.form.map((c) => c.round)).toEqual([1, 2]);
    expect(m.AGF.current).toBe(1505);
  });

  it('giver tom form og start-rating, når ingen runder er spillet', () => {
    const m = eloFormByTeam(teams, []);
    expect(m.AGF.form).toEqual([]);
    expect(m.AGF.current).toBe(1500);
    expect(m.AGF.trend).toBe(0);
  });

  it('tolererer manglende historik', () => {
    const m = eloFormByTeam(teams, undefined);
    expect(m.FCK.current).toBe(1600);
    expect(m.FCK.form).toEqual([]);
  });

  it('kan bede om et andet antal punkter', () => {
    const m = eloFormByTeam(teams, history, 2);
    expect(m.AGF.form.map((c) => c.round)).toEqual([5, 6]);
  });

  it('nul punkter giver tom form men stadig en rating', () => {
    const m = eloFormByTeam(teams, history, 0);
    expect(m.AGF.form).toEqual([]);
    expect(m.AGF.current).toBe(1525);
  });
});

// Et hold, der slet ikke optræder i historikken (ukendt navn, omdøbt, tilføjet
// efter sæsonstart), må ikke se ud som et hold, der har spillet flade runder.
describe('eloFormByTeam — hold uden historik', () => {
  const teams = [
    { name: 'AGF', short: 'AGF', elo: 1500 },
    { name: 'Nyt Hold', short: 'NYT', elo: 1490 },
  ];
  const history = [
    { round: 1, elo: { AGF: 1510 } },
    { round: 2, elo: { AGF: 1520 } },
  ];

  it('giver tom form frem for et ±0 pr. runde', () => {
    const m = eloFormByTeam(teams, history);
    expect(m['Nyt Hold'].form).toEqual([]);
    expect(m['Nyt Hold'].current).toBe(1490);
    // Kontrol: holdet MED historik får sine punkter.
    expect(m.AGF.form).toHaveLength(2);
  });
});
