import { describe, it, expect } from 'vitest';
import { computeMyStats, recentResults, countUntippedOpenStages } from './dashboardStats';

// Afgjorte etaper (result udfyldt → stageStatus = 'done'). Kickoff i fortiden.
const stages = [
  {
    id: '2026-stage-1', number: 1, kickoff: '2026-07-01T12:00:00+02:00',
    result: { winnerTeam: 'A', gcTeam: 'A', mountainTeam: 'B', sprintTeam: 'C' },
  },
  {
    id: '2026-stage-2', number: 2, kickoff: '2026-07-02T12:00:00+02:00',
    result: { winnerTeam: 'B', gcTeam: 'B', mountainTeam: 'A', sprintTeam: 'A' },
  },
  {
    id: '2026-stage-3', number: 3, kickoff: '2026-07-03T12:00:00+02:00',
    result: { winnerTeam: 'C', gcTeam: 'C', mountainTeam: 'C', sprintTeam: 'B' },
  },
  // Fremtidig, åben etape (intet resultat)
  {
    id: '2026-stage-4', number: 4, kickoff: '2999-07-04T12:00:00+02:00', result: null,
  },
];

// u1: alle fire rigtige på etape 1; intet tip på etape 2; ét rigtigt (winner) på etape 3.
const betsByStage = {
  '2026-stage-1': { winnerTeam: 'A', gcTeam: 'A', mountainTeam: 'B', sprintTeam: 'C' },
  '2026-stage-3': { winnerTeam: 'C', gcTeam: 'A', mountainTeam: 'A', sprintTeam: 'A' },
};

describe('computeMyStats', () => {
  it('beregner tippede etaper, ramte hold og point', () => {
    const s = computeMyStats(stages, betsByStage);
    expect(s.tips).toBe(2); // etape 1 + 3 tippet og afgjort
    expect(s.hits).toBe(5); // 4 på etape 1 + 1 (winner) på etape 3
    expect(s.points).toBeGreaterThan(0);
    // 8 afgjorte felter på de to tippede etaper → 5/8 = 63%
    expect(s.hitPct).toBe(63);
  });

  it('returnerer nuller uden tips', () => {
    expect(computeMyStats(stages, {})).toMatchObject({ tips: 0, points: 0, hitPct: 0 });
    expect(computeMyStats([], {})).toMatchObject({ tips: 0 });
  });
});

describe('recentResults', () => {
  it('returnerer seneste afgjorte etaper (nyeste først) med point', () => {
    const rows = recentResults(stages, betsByStage, {}, 5);
    expect(rows.map((r) => r.stage.id)).toEqual(['2026-stage-3', '2026-stage-2', '2026-stage-1']);
    expect(rows[0].points).toBeGreaterThan(0); // u1 ramte winner på etape 3
    expect(rows[1].points).toBeNull(); // intet tip på etape 2
  });

  it('respekterer limit', () => {
    expect(recentResults(stages, betsByStage, {}, 1)).toHaveLength(1);
    expect(recentResults([], {})).toEqual([]);
  });
});

describe('countUntippedOpenStages', () => {
  it('tæller åbne etaper uden komplet tip', () => {
    // etape 4 er åben og utippet → 1
    expect(countUntippedOpenStages(stages, betsByStage)).toBe(1);
  });

  it('en åben etape med komplet tip tæller ikke', () => {
    const open = [{ id: '2026-stage-9', number: 9, kickoff: '2999-07-09T12:00:00+02:00', result: null }];
    const complete = { '2026-stage-9': { winnerTeam: 'A', gcTeam: 'B', mountainTeam: 'C', sprintTeam: 'D' } };
    expect(countUntippedOpenStages(open, complete)).toBe(0);
  });

  it('en åben etape med delvist tip tæller med', () => {
    const open = [{ id: '2026-stage-9', number: 9, kickoff: '2999-07-09T12:00:00+02:00', result: null }];
    const partial = { '2026-stage-9': { winnerTeam: 'A' } };
    expect(countUntippedOpenStages(open, partial)).toBe(1);
  });

  it('en holdtidskørsel (kun vinder-hold aktivt) tæller IKKE når vinder-hold er tippet', () => {
    // Regression: forsiden krævede tidligere ALLE fire felter, så en TTT med
    // kun vinder-hold blev fejlagtigt vist som "mangler tip".
    const open = [{ id: '2026-stage-1', number: 1, type: 'ttt', kickoff: '2999-07-01T12:00:00+02:00', result: null }];
    expect(countUntippedOpenStages(open, { '2026-stage-1': { winnerTeam: 'A' } })).toBe(0);
  });

  it('respekterer et questions-override for hvilke spørgsmål der kræves', () => {
    const open = [{
      id: '2026-stage-9', number: 9, kickoff: '2999-07-09T12:00:00+02:00', result: null,
      questions: { winnerTeam: true, gcTeam: true, mountainTeam: false, sprintTeam: false },
    }];
    expect(countUntippedOpenStages(open, { '2026-stage-9': { winnerTeam: 'A', gcTeam: 'B' } })).toBe(0);
    expect(countUntippedOpenStages(open, { '2026-stage-9': { winnerTeam: 'A' } })).toBe(1);
  });

  it('robust over for tomme input', () => {
    expect(countUntippedOpenStages([], {})).toBe(0);
    expect(countUntippedOpenStages(null)).toBe(0);
  });
});
