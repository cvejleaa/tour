import { describe, it, expect } from 'vitest';
import {
  buildRiderStats, ridersOfProfile, riderRowsForProfile, riderRowComparator,
  teamAggregate, groupRowsByTeam,
} from './riderTypeStats';

// Realistiske klassement-rækker (letour-navneform, som synken gemmer dem).
const standings = {
  samlet: [
    { rank: 1, rider: 'POGACAR Tadej', team: 'UAE', time: '20:00:00' },
    { rank: 2, rider: 'VINGEGAARD HANSEN Jonas', team: 'TVL', time: '+0:12' },
  ],
  sprint: [
    { rank: 1, rider: 'PHILIPSEN Jasper', team: 'APT', points: 50 },
    { rank: 2, rider: 'POGACAR Tadej', team: 'UAE', points: 30 },
  ],
  bjerg: [
    { rank: 1, rider: 'VINGEGAARD HANSEN Jonas', team: 'TVL', points: 12 },
  ],
  ungdom: [],
  hold: [],
};

describe('buildRiderStats', () => {
  const byBib = buildRiderStats(standings);

  it('nøgler rytter-stats på startnummer via tolerant navnematch', () => {
    // Pogačar (bib 1) står i både samlet og sprint.
    const pog = byBib.get(1);
    expect(pog.samlet).toMatchObject({ rank: 1, time: '20:00:00' });
    expect(pog.sprint).toMatchObject({ rank: 2, points: 30 });
    expect(pog.bjerg).toBeUndefined();
  });

  it('matcher letours efternavns-form til rytterfilen', () => {
    // Vingegaard (bib 11) — "VINGEGAARD HANSEN Jonas" skal ramme.
    const vin = byBib.get(11);
    expect(vin.samlet).toMatchObject({ rank: 2 });
    expect(vin.bjerg).toMatchObject({ points: 12 });
  });
});

describe('ridersOfProfile', () => {
  it('filtrerer på profiltype', () => {
    const climbers = ridersOfProfile('climber');
    expect(climbers.length).toBeGreaterThan(0);
    expect(climbers.every((r) => r.bib != null)).toBe(true);
    expect(ridersOfProfile('leader').length).toBeGreaterThan(0);
  });
});

describe('riderRowComparator', () => {
  const rows = [
    { bib: 1, first: 'A', last: 'Alpha', stats: { samlet: { rank: 3 }, sprint: { points: 10 } } },
    { bib: 2, first: 'B', last: 'Beta', stats: { samlet: { rank: 1 }, sprint: { points: 50 } } },
    { bib: 3, first: 'C', last: 'Charlie', stats: {} }, // ingen data
  ];

  it('tids-kolonne: bedste placering først, uden data sidst', () => {
    const sorted = [...rows].sort(riderRowComparator('samlet'));
    expect(sorted.map((r) => r.bib)).toEqual([2, 1, 3]);
  });

  it('point-kolonne: flest point først, uden data sidst', () => {
    const sorted = [...rows].sort(riderRowComparator('sprint'));
    expect(sorted.map((r) => r.bib)).toEqual([2, 1, 3]);
  });

  it('navn: alfabetisk, og desc vender', () => {
    expect([...rows].sort(riderRowComparator('name')).map((r) => r.last)).toEqual(['Alpha', 'Beta', 'Charlie']);
    expect([...rows].sort(riderRowComparator('name', true)).map((r) => r.last)).toEqual(['Charlie', 'Beta', 'Alpha']);
  });

  it('hold: sorterer på holdnavn (teamName), tiebreak på rytternavn', () => {
    const teamRows = [
      { last: 'Y', first: 'y', teamName: 'Lidl-Trek', stats: {} },
      { last: 'A', first: 'a', teamName: 'Alpecin', stats: {} },
      { last: 'B', first: 'b', teamName: 'Lidl-Trek', stats: {} },
    ];
    expect([...teamRows].sort(riderRowComparator('team')).map((r) => r.last)).toEqual(['A', 'B', 'Y']);
  });
});

describe('teamAggregate & groupRowsByTeam', () => {
  const rows = [
    { bib: 1, last: 'A', teamName: 'Visma', stats: { bjerg: { points: 10, rank: 2 }, samlet: { rank: 5 } } },
    { bib: 2, last: 'B', teamName: 'Lidl', stats: { bjerg: { points: 4, rank: 6 }, samlet: { rank: 1 } } },
    { bib: 3, last: 'C', teamName: 'Visma', stats: { bjerg: { points: 8, rank: 3 }, samlet: { rank: 9 } } },
  ];

  it('teamAggregate: sum af point / bedste placering', () => {
    expect(teamAggregate([rows[0], rows[2]], 'bjerg')).toBe(18); // 10+8
    expect(teamAggregate([rows[0], rows[2]], 'samlet')).toBe(5); // bedste (laveste) placering
    expect(teamAggregate([rows[0]], 'name')).toBeNull(); // ikke en konkurrence
  });

  it('grupperer og sorterer HOLDENE efter samlet bjergpoint (flest først)', () => {
    const g = groupRowsByTeam(rows, 'bjerg');
    expect(g.map((x) => x.teamName)).toEqual(['Visma', 'Lidl']); // Visma 18 > Lidl 4
    expect(g[0].agg).toBe(18);
  });

  it('tids-kolonne: holdene sorteres efter bedste placering', () => {
    const g = groupRowsByTeam(rows, 'samlet');
    expect(g.map((x) => x.teamName)).toEqual(['Lidl', 'Visma']); // Lidl #1 < Visma #5
  });

  it('desc vender holdenes rækkefølge', () => {
    const g = groupRowsByTeam(rows, 'bjerg', true);
    expect(g.map((x) => x.teamName)).toEqual(['Lidl', 'Visma']);
  });
});

describe('riderRowsForProfile', () => {
  it('kobler ryttere af en type med deres stats', () => {
    const byBib = buildRiderStats(standings);
    const rows = riderRowsForProfile('leader', byBib);
    // Pogačar er 'leader' (bib 1) og skal have samlet-stats med.
    const pog = rows.find((r) => r.bib === 1);
    expect(pog.stats.samlet).toMatchObject({ rank: 1 });
  });
});
