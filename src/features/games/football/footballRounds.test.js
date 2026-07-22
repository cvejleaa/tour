import { describe, it, expect } from 'vitest';
import {
  toMillis, groupByRound, activeRound, isLocked, afterStart,
} from './footballRounds';

const M = (round, kickoffMs, extra = {}) => ({ round, kickoff: kickoffMs, ...extra });

describe('afterStart', () => {
  const ms = [M(1, 100), M(1, 150), M(2, 500), M(3, 900)];

  it('uden starttidspunkt vises alle kampe', () => {
    expect(afterStart(ms, null)).toHaveLength(4);
  });

  it('skjuler kampe FØR starttidspunktet (fx runde 1)', () => {
    // start = 1 ms før runde 2's kickoff → runde 1 forsvinder, runde 2+ bliver.
    const out = afterStart(ms, 499);
    expect(out.map((m) => m.round)).toEqual([2, 3]);
  });

  it('inkluderer kampe præcis PÅ starttidspunktet', () => {
    expect(afterStart(ms, 500).map((m) => m.kickoff)).toEqual([500, 900]);
  });

  it('beholder kampe uden kickoff (kan ikke afgøres som før start)', () => {
    const withNull = [M(1, 100), { round: 2, kickoff: null }];
    expect(afterStart(withNull, 500)).toHaveLength(1);
    expect(afterStart(withNull, 500)[0].round).toBe(2);
  });

  it('groupByRound på filtreret liste giver kun runder fra start og frem', () => {
    const rounds = groupByRound(afterStart(ms, 499));
    expect(rounds.map((r) => r.round)).toEqual([2, 3]);
  });
});

describe('toMillis', () => {
  it('håndterer tal, ISO, Date, Firestore-Timestamp', () => {
    expect(toMillis(123)).toBe(123);
    expect(toMillis('2026-07-24T17:00:00Z')).toBe(Date.parse('2026-07-24T17:00:00Z'));
    expect(toMillis({ toMillis: () => 999 })).toBe(999);
    expect(toMillis({ seconds: 5 })).toBe(5000);
    expect(toMillis(null)).toBeNull();
  });
});

describe('groupByRound', () => {
  it('grupperer og sorterer runder + kampe efter kickoff', () => {
    const rounds = groupByRound([
      M(2, 200), M(1, 150), M(1, 100), M(2, 50),
    ]);
    expect(rounds.map((r) => r.round)).toEqual([1, 2]);
    expect(rounds[0].matches.map((m) => m.kickoff)).toEqual([100, 150]);
    expect(rounds[1].matches.map((m) => m.kickoff)).toEqual([50, 200]);
  });
  it('samler kampe uden runde i runde 0', () => {
    const rounds = groupByRound([{ kickoff: 10 }, M(1, 20)]);
    expect(rounds[0].round).toBe(0);
  });
});

describe('activeRound', () => {
  const rounds = groupByRound([M(1, 100), M(1, 200), M(2, 1000), M(3, 2000)]);
  it('vælger tidligste runde med en kamp der ikke er begyndt', () => {
    expect(activeRound(rounds, 50)).toBe(1);   // intet begyndt
    expect(activeRound(rounds, 150)).toBe(1);  // runde 1 har stadig en kamp kl. 200
    expect(activeRound(rounds, 250)).toBe(2);  // runde 1 helt låst → runde 2
  });
  it('vælger sidste runde når alt er begyndt', () => {
    expect(activeRound(rounds, 9999)).toBe(3);
  });
  it('returnerer null uden runder', () => {
    expect(activeRound([], 0)).toBeNull();
  });
});

describe('isLocked', () => {
  it('låser når kickoff er passeret', () => {
    expect(isLocked({ kickoff: 100 }, 150)).toBe(true);
    expect(isLocked({ kickoff: 100 }, 50)).toBe(false);
    expect(isLocked({ kickoff: null }, 50)).toBe(false);
  });
});
