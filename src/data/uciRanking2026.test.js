import { describe, it, expect } from 'vitest';
import {
  teamWorldRank, teamWorldRiders, riderWorldRank, flagEmoji,
  UCI_RIDER_TOP_N, UCI_RANKING_DATE,
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
