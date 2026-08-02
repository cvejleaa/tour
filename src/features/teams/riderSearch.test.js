import { describe, it, expect } from 'vitest';
import { normName, buildRiderIndex, searchRiders } from './riderSearch';

const TEAMS = [
  { code: 'TVL', name: 'Team Visma | Lease a Bike' },
  { code: 'UEX', name: 'UAE Team Emirates XRG' },
];
const RIDERS = {
  TVL: [
    { name: 'Jonas Vingegaard', country: 'Danmark', leader: true },
    { name: 'Sepp Kuss', country: 'USA' },
  ],
  UEX: [{ name: 'Tadej Pogačar', country: 'Slovenien', leader: true }],
};
const ridersOf = (code) => RIDERS[code] || [];
const pretty = (n) => n.replace(' | Lease a Bike', '');

describe('normName', () => {
  it('fjerner accenter og gør små', () => {
    expect(normName('Tadej Pogačar')).toBe('tadej pogacar');
    expect(normName('  Jonas   Vingegaard ')).toBe('jonas vingegaard');
    expect(normName(null)).toBe('');
  });
});

describe('buildRiderIndex', () => {
  it('flader alle holds ryttere ud med holdinfo', () => {
    const idx = buildRiderIndex(TEAMS, ridersOf, pretty);
    expect(idx).toHaveLength(3);
    const jonas = idx.find((r) => r.name === 'Jonas Vingegaard');
    expect(jonas).toMatchObject({ code: 'TVL', teamName: 'Team Visma', leader: true, country: 'Danmark' });
  });
  it('springer ryttere uden navn over og tåler tomt', () => {
    expect(buildRiderIndex([{ code: 'X', name: 'X' }], () => [{ name: '' }, null])).toHaveLength(0);
    expect(buildRiderIndex(null, ridersOf)).toHaveLength(0);
  });
});

describe('searchRiders', () => {
  const idx = buildRiderIndex(TEAMS, ridersOf, pretty);

  it('tom søgning giver ingen resultater', () => {
    expect(searchRiders(idx, '')).toEqual([]);
    expect(searchRiders(idx, '   ')).toEqual([]);
  });

  it('matcher accent- og rækkefølge-uafhængigt', () => {
    expect(searchRiders(idx, 'pogacar').map((r) => r.name)).toEqual(['Tadej Pogačar']);
    expect(searchRiders(idx, 'vingegaard jonas').map((r) => r.name)).toEqual(['Jonas Vingegaard']);
  });

  it('delvist fornavn matcher', () => {
    expect(searchRiders(idx, 'jon').map((r) => r.name)).toEqual(['Jonas Vingegaard']);
  });

  it('respekterer limit', () => {
    expect(searchRiders(idx, 's', 1)).toHaveLength(1);
  });

  it('ukendt navn giver tomt', () => {
    expect(searchRiders(idx, 'ukendt rytter')).toEqual([]);
  });
});
