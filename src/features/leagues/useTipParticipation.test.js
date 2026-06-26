import { describe, it, expect } from 'vitest';
import { leagueTipStatus } from './useTipParticipation';

const members = [
  { uid: 'a', displayName: 'Anna' },
  { uid: 'b', displayName: 'Bo' },
  { uid: 'c', displayName: 'Cara' },
];

describe('leagueTipStatus', () => {
  it('tæller hvor mange der har tippet', () => {
    const { tipped, total } = leagueTipStatus(new Set(['a', 'c']), members);
    expect(tipped).toBe(2);
    expect(total).toBe(3);
  });

  it('lister hvem der mangler', () => {
    const { missing } = leagueTipStatus(new Set(['a']), members);
    expect(missing.map((m) => m.uid)).toEqual(['b', 'c']);
  });

  it('håndterer at ingen har tippet (undefined set)', () => {
    const { tipped, total, missing } = leagueTipStatus(undefined, members);
    expect(tipped).toBe(0);
    expect(total).toBe(3);
    expect(missing).toHaveLength(3);
  });

  it('håndterer at alle har tippet', () => {
    const { tipped, missing } = leagueTipStatus(new Set(['a', 'b', 'c']), members);
    expect(tipped).toBe(3);
    expect(missing).toHaveLength(0);
  });
});
