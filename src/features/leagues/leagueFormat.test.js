import { describe, it, expect } from 'vitest';
import {
  leagueScore, leagueBreakdown, scoringLabel, isFullScoring, normalizeScoring, DEFAULT_SCORING,
} from './leagueFormat';
import { LEAGUE_FORMAT } from '../../lib/constants';

const user = { totalPoints: 100, groupPoints: 60, knockoutPoints: 30, bonusPoints: 10 };

describe('leagueBreakdown', () => {
  it('opdeler i kampe + bonus så summen = total (alt til)', () => {
    expect(leagueBreakdown(user, DEFAULT_SCORING, 7)).toEqual({ match: 90, bonus: 17, total: 107 });
  });
  it('respekterer fravalgte dele', () => {
    const s = { group: false, knockout: true, bonus: true, leagueBonus: false, doubleKnockout: false };
    expect(leagueBreakdown(user, s, 7)).toEqual({ match: 30, bonus: 10, total: 40 });
  });
  it('dobbelt slutspil tæller med i kampe-delen', () => {
    const s = { group: true, knockout: true, bonus: false, leagueBonus: true, doubleKnockout: true };
    expect(leagueBreakdown(user, s, 5)).toEqual({ match: 120, bonus: 5, total: 125 });
  });
  it('match + bonus === leagueScore', () => {
    const s = { group: true, knockout: true, bonus: true, leagueBonus: true, doubleKnockout: false };
    const bd = leagueBreakdown(user, s, 4);
    expect(bd.total).toBe(leagueScore(user, s, 4));
  });
});

describe('leagueScore (kombinerbar)', () => {
  it('alt slået til = alle komponenter', () => {
    expect(leagueScore(user, DEFAULT_SCORING)).toBe(100); // 60+30+10
  });
  it('kun bonus + slutspil kombineret', () => {
    const s = { group: false, knockout: true, bonus: true, leagueBonus: false, doubleKnockout: false };
    expect(leagueScore(user, s)).toBe(40); // 30+10
  });
  it('dobbelt slutspil vægter knockout x2', () => {
    const s = { group: true, knockout: true, bonus: true, leagueBonus: false, doubleKnockout: true };
    expect(leagueScore(user, s)).toBe(130); // 60 + 30*2 + 10
  });
  it('lægger liga-bonus til når valgt', () => {
    const s = { group: false, knockout: false, bonus: false, leagueBonus: true, doubleKnockout: false };
    expect(leagueScore(user, s, 7)).toBe(7);
  });
  it('liga-bonus ignoreres når fravalgt', () => {
    const s = { group: true, knockout: false, bonus: false, leagueBonus: false, doubleKnockout: false };
    expect(leagueScore(user, s, 7)).toBe(60);
  });
});

describe('normalizeScoring', () => {
  it('bruger scoring-objekt hvis til stede', () => {
    const s = normalizeScoring({ scoring: { group: false } });
    expect(s.group).toBe(false);
    expect(s.knockout).toBe(true); // default udfyldt
  });
  it('mapper gammelt bonusOnly-format', () => {
    const s = normalizeScoring({ format: LEAGUE_FORMAT.BONUS_ONLY });
    expect(s).toMatchObject({ group: false, knockout: false, bonus: true });
  });
  it('mapper gammelt doubleKnockout-format', () => {
    const s = normalizeScoring({ format: LEAGUE_FORMAT.DOUBLE_KNOCKOUT });
    expect(s.doubleKnockout).toBe(true);
  });
  it('falder tilbage til default uden format/scoring', () => {
    expect(normalizeScoring({})).toEqual(DEFAULT_SCORING);
  });
});

describe('scoringLabel / isFullScoring', () => {
  it('fuld scoring kaldes Fuld', () => {
    expect(isFullScoring(DEFAULT_SCORING)).toBe(true);
    expect(scoringLabel(DEFAULT_SCORING)).toMatch(/Fuld/);
  });
  it('viser kombination', () => {
    const s = { group: false, knockout: true, bonus: true, leagueBonus: false, doubleKnockout: true };
    expect(isFullScoring(s)).toBe(false);
    expect(scoringLabel(s)).toBe('Slutspil (×2) + Bonus');
  });
  it('intet valgt', () => {
    const s = { group: false, knockout: false, bonus: false, leagueBonus: false, doubleKnockout: false };
    expect(scoringLabel(s)).toBe('Intet valgt');
  });
});
