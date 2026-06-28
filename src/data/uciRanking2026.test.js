import { describe, it, expect } from 'vitest';
import {
  teamWorldRank, teamWorldRiders, riderWorldRank, flagEmoji,
  riderRankSum, UNRANKED_PLACE, UCI_RIDER_TOP_N, UCI_RANKING_DATE,
} from './uciRanking2026';

describe('uciRanking2026', () => {
  it('teamWorldRank: vores koder matcher UCI-rangen', () => {
    expect(teamWorldRank('UEX')).toMatchObject({ rank: 1 });
    expect(teamWorldRank('TVL').rank).toBeGreaterThan(0);
    expect(teamWorldRank('FINDES-IKKE')).toBeNull();
  });

  it('teamWorldRiders: holdets ryttere er sorteret efter rang', () => {
    const r = teamWorldRiders('UEX');
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].rank).toBeLessThanOrEqual(r[r.length - 1].rank);
    expect(r.every((x) => x.team === 'UEX')).toBe(true);
  });

  it('riderWorldRank: matcher navn uafhængigt af rækkefølge/accenter', () => {
    expect(riderWorldRank('Tadej Pogačar')).toMatchObject({ rank: 1 });
    expect(riderWorldRank('pogacar tadej')).toMatchObject({ rank: 1 }); // omvendt + uden accent
    expect(riderWorldRank('Ukendt Rytter')).toBeNull();
  });

  it('riderWorldRank: matcher selv om UCI har et mellemnavn (Lenny Martinez)', () => {
    // UCI: "Lenny Sydney Martinez" — startlisten har kun "Lenny Martinez"
    expect(riderWorldRank('Lenny Martinez')).toMatchObject({ rank: 24 });
    expect(riderWorldRank('Lenny Martinez', 'TBV')).toMatchObject({ rank: 24 });
  });

  it('riderWorldRank: team-parameteren begrænser til holdet', () => {
    // Pogačar er på UEX, ikke TVL → ingen match når team=TVL
    expect(riderWorldRank('Tadej Pogačar', 'TVL')).toBeNull();
  });

  it('riderRankSum: summerer rang, 2000 for ukendte, null uden ryttere', () => {
    // Pogačar #1 + en ukendt rytter (2000)
    const sum = riderRankSum([{ name: 'Tadej Pogačar' }, { name: 'Ukendt Rytter' }], 'UEX');
    expect(sum).toBe(1 + UNRANKED_PLACE);
    expect(riderRankSum([], 'UEX')).toBeNull();
    expect(riderRankSum(null)).toBeNull();
  });

  it('flagEmoji: ISO-2 → flag', () => {
    expect(flagEmoji('dk')).toBe('🇩🇰');
    expect(flagEmoji('SI')).toBe('🇸🇮');
    expect(flagEmoji('')).toBe('');
  });

  it('snapshot har data', () => {
    expect(UCI_RIDER_TOP_N).toBeGreaterThan(100);
    expect(UCI_RANKING_DATE instanceof Date).toBe(true);
  });
});
