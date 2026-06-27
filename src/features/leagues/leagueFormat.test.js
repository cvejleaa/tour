import { describe, it, expect } from 'vitest';
import {
  leagueScore, leagueBreakdown, scoringLabel, isFullScoring, normalizeScoring, DEFAULT_SCORING,
} from './leagueFormat';
import { LEAGUE_FORMAT } from '../../lib/constants';

const user = { totalPoints: 100, stagePoints: 90, bonusPoints: 10 };

describe('leagueBreakdown', () => {
  it('opdeler i etaper + bonus så summen = total (alt til)', () => {
    expect(leagueBreakdown(user, DEFAULT_SCORING, 7)).toEqual({ stage: 90, bonus: 17, total: 107 });
  });
  it('respekterer fravalgte dele', () => {
    const s = { stage: false, bonus: true, leagueBonus: false };
    expect(leagueBreakdown(user, s, 7)).toEqual({ stage: 0, bonus: 10, total: 10 });
  });
  it('kun etape-point', () => {
    const s = { stage: true, bonus: false, leagueBonus: false };
    expect(leagueBreakdown(user, s, 5)).toEqual({ stage: 90, bonus: 0, total: 90 });
  });
  it('stage + bonus === leagueScore', () => {
    const s = { stage: true, bonus: true, leagueBonus: true };
    const bd = leagueBreakdown(user, s, 4);
    expect(bd.total).toBe(leagueScore(user, s, 4));
  });
});

describe('leagueScore (kombinerbar)', () => {
  it('alt slået til = alle komponenter', () => {
    expect(leagueScore(user, DEFAULT_SCORING)).toBe(100); // 90+10
  });
  it('kun bonus', () => {
    const s = { stage: false, bonus: true, leagueBonus: false };
    expect(leagueScore(user, s)).toBe(10);
  });
  it('kun etape-point', () => {
    const s = { stage: true, bonus: false, leagueBonus: false };
    expect(leagueScore(user, s)).toBe(90);
  });
  it('lægger liga-bonus til når valgt', () => {
    const s = { stage: false, bonus: false, leagueBonus: true };
    expect(leagueScore(user, s, 7)).toBe(7);
  });
  it('liga-bonus ignoreres når fravalgt', () => {
    const s = { stage: true, bonus: false, leagueBonus: false };
    expect(leagueScore(user, s, 7)).toBe(90);
  });
});

describe('normalizeScoring', () => {
  it('bruger scoring-objekt hvis til stede', () => {
    const s = normalizeScoring({ scoring: { stage: false } });
    expect(s.stage).toBe(false);
    expect(s.bonus).toBe(true); // default udfyldt
  });
  it('mapper gammelt bonusOnly-format', () => {
    const s = normalizeScoring({ format: LEAGUE_FORMAT.BONUS_ONLY });
    expect(s).toMatchObject({ stage: false, bonus: true });
  });
  it('mapper gammelt stageOnly-format', () => {
    const s = normalizeScoring({ format: LEAGUE_FORMAT.STAGE_ONLY });
    expect(s).toMatchObject({ stage: true, bonus: false });
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
    const s = { stage: false, bonus: true, leagueBonus: false };
    expect(isFullScoring(s)).toBe(false);
    expect(scoringLabel(s)).toBe('Bonus');
  });
  it('intet valgt', () => {
    const s = { stage: false, bonus: false, leagueBonus: false };
    expect(scoringLabel(s)).toBe('Intet valgt');
  });
});
