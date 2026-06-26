import { describe, it, expect } from 'vitest';
import {
  stageId,
  classifyStageType,
  deriveKickoff,
  normalizeStageList,
  stageStatus,
  isTipOpen,
  DEFAULT_LOCK_HOUR,
} from './tourStages.js';

describe('stageId & classifyStageType', () => {
  it('danner id', () => {
    expect(stageId(7)).toBe('2026-stage-7');
    expect(stageId(7, 2027)).toBe('2027-stage-7');
  });
  it('klassificerer typer', () => {
    expect(classifyStageType('Individual time trial')).toBe('itt');
    expect(classifyStageType('Mountain')).toBe('mountain');
    expect(classifyStageType('Flat')).toBe('flat');
    expect(classifyStageType('p1')).toBe('flat');
    expect(classifyStageType('p5')).toBe('mountain');
    expect(classifyStageType(null)).toBe('unknown');
  });
});

describe('deriveKickoff', () => {
  it('danner CEST-ISO med standardtime', () => {
    expect(deriveKickoff('2026-07-05')).toBe(`2026-07-05T${String(DEFAULT_LOCK_HOUR).padStart(2, '0')}:00:00+02:00`);
  });
  it('respekterer custom time', () => {
    expect(deriveKickoff('2026-07-05', 9)).toBe('2026-07-05T09:00:00+02:00');
  });
  it('null for ugyldig dato', () => {
    expect(deriveKickoff('ikke-en-dato')).toBeNull();
    expect(deriveKickoff(null)).toBeNull();
  });
});

describe('normalizeStageList', () => {
  const resp = {
    year: 2026,
    stages: [
      { number: 2, date: '2026-07-05', name: 'Lille - Boulogne', profile_icon: 'p2', has_results: false },
      { number: 1, date: '2026-07-04', name: 'Barcelona ITT', stage_type: 'Individual time trial', has_results: true },
      { number: null, date: null }, // ignoreres
    ],
  };
  it('sorterer, danner id/kickoff og dropper ugyldige', () => {
    const out = normalizeStageList(resp);
    expect(out).toHaveLength(2);
    expect(out[0].number).toBe(1);
    expect(out[0].id).toBe('2026-stage-1');
    expect(out[0].season).toBe(2026);
    expect(out[0].type).toBe('itt');
    expect(out[0].hasResults).toBe(true);
    expect(out[1].kickoff).toBe('2026-07-05T12:00:00+02:00');
  });
  it('respekterer lockHour', () => {
    expect(normalizeStageList(resp, { lockHour: 10 })[1].kickoff).toBe('2026-07-05T10:00:00+02:00');
  });
  it('tomt svar → tom liste', () => {
    expect(normalizeStageList({})).toEqual([]);
  });
});

describe('stageStatus & isTipOpen', () => {
  const stage = { kickoff: '2026-07-05T12:00:00+02:00', hasResults: false };
  it('åbent før lås', () => {
    expect(stageStatus(stage, '2026-07-05T09:00:00+02:00')).toBe('scheduled');
    expect(isTipOpen(stage, '2026-07-05T09:00:00+02:00')).toBe(true);
  });
  it('låst efter kickoff, intet resultat', () => {
    expect(stageStatus(stage, '2026-07-05T13:00:00+02:00')).toBe('locked');
    expect(isTipOpen(stage, '2026-07-05T13:00:00+02:00')).toBe(false);
  });
  it('done når resultat foreligger', () => {
    expect(stageStatus({ ...stage, result: { winnerTeam: 'UAE' } }, '2026-07-05T18:00:00+02:00')).toBe('done');
    expect(stageStatus({ ...stage, hasResults: true }, '2026-07-01T00:00:00+02:00')).toBe('done');
  });
  it('uden kickoff → scheduled', () => {
    expect(stageStatus({ kickoff: null }, '2026-07-05T18:00:00+02:00')).toBe('scheduled');
  });
});
