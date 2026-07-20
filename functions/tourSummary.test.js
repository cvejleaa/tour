import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  decidedStages, lastDecidedStage,
  computeJerseyWinners, computeGcPodium, computeStageWins, computeFacts,
} = require('./tourSummary');

// Hjælper: byg et afgjort etape-dokument som syncTourCore skriver det.
const mkStage = (number, { winnerRider, winnerTeam, km = 180, jerseys, resultRows } = {}) => ({
  id: `2026-stage-${number}`,
  season: 2026,
  number,
  status: 'done',
  km,
  result: {
    winnerTeam: winnerTeam ?? 'UAE Team Emirates',
    gcTeam: 'Visma', mountainTeam: 'EF', sprintTeam: 'Alpecin',
    podium: { winnerTeam: [winnerTeam ?? 'UAE Team Emirates', 'Visma', 'EF'], gcTeam: [], mountainTeam: [], sprintTeam: [] },
  },
  jerseys: jerseys ?? { yellow: 'Pogacar', green: 'Girmay', polka: 'Ciccone', white: 'Evenepoel', teamLead: 'Visma' },
  resultRows: resultRows ?? [
    { rank: 1, rider: winnerRider ?? 'Pogacar', team: winnerTeam ?? 'UAE Team Emirates', time: '4:20:00', points: null },
    { rank: 2, rider: 'Vingegaard', team: 'Visma', time: '4:20:10', points: null },
  ],
});

describe('decidedStages / lastDecidedStage', () => {
  it('filtrerer til afgjorte etaper og sorterer efter nummer', () => {
    const stages = [mkStage(3), { number: 4, status: 'scheduled' }, mkStage(1), { number: 5, status: 'done', result: null }];
    expect(decidedStages(stages).map((s) => s.number)).toEqual([1, 3]);
    expect(lastDecidedStage(stages).number).toBe(3);
  });
  it('null uden afgjorte etaper', () => {
    expect(lastDecidedStage([{ number: 1, status: 'scheduled' }])).toBeNull();
  });
});

describe('computeJerseyWinners', () => {
  it('tager indehaverne fra den SIDSTE afgjorte etape', () => {
    const stages = [
      mkStage(1, { jerseys: { yellow: 'Tidlig', green: 'A', polka: 'B', white: 'C', teamLead: 'X' } }),
      mkStage(21, { jerseys: { yellow: 'Pogacar', green: 'Girmay', polka: 'Ciccone', white: 'Evenepoel', teamLead: 'Visma' } }),
    ];
    expect(computeJerseyWinners(stages)).toEqual({
      afterStage: 21, yellow: 'Pogacar', green: 'Girmay', polka: 'Ciccone', white: 'Evenepoel', teamLead: 'Visma',
    });
  });
  it('null uden afgjorte etaper', () => {
    expect(computeJerseyWinners([])).toBeNull();
  });
});

describe('computeGcPodium', () => {
  const classifications = {
    afterStage: 21,
    previousYear: false,
    standings: {
      samlet: [
        { rank: 1, rider: 'Pogacar', team: 'UAE Team Emirates', time: '80:00:00' },
        { rank: 2, rider: 'Vingegaard', team: 'Visma', time: '+2:30' },
        { rank: 3, rider: 'Evenepoel', team: 'Soudal', time: '+5:01' },
        { rank: 4, rider: 'Roglic', team: 'Bora', time: '+8:00' },
      ],
    },
  };
  it('tager top 3 fra det samlede klassement', () => {
    const p = computeGcPodium(classifications, []);
    expect(p.afterStage).toBe(21);
    expect(p.rows.map((r) => [r.rank, r.rider])).toEqual([
      [1, 'Pogacar'], [2, 'Vingegaard'], [3, 'Evenepoel'],
    ]);
  });
  it('ignorerer et sidste-års-preview og falder tilbage til gul trøje', () => {
    const stages = [mkStage(21, { jerseys: { yellow: 'Pogacar', green: null, polka: null, white: null, teamLead: null } })];
    const p = computeGcPodium({ ...classifications, previousYear: true }, stages);
    expect(p.rows).toEqual([{ rank: 1, rider: 'Pogacar', team: null, time: null }]);
  });
  it('null uden klassement og uden gul trøje', () => {
    expect(computeGcPodium(null, [])).toBeNull();
  });
});

describe('computeStageWins', () => {
  it('tæller sejre pr. rytter fra resultRows[0]', () => {
    const stages = [
      mkStage(1, { winnerRider: 'Philipsen', winnerTeam: 'Alpecin' }),
      mkStage(2, { winnerRider: 'Pogacar', winnerTeam: 'UAE Team Emirates' }),
      mkStage(3, { winnerRider: 'Philipsen', winnerTeam: 'Alpecin' }),
      mkStage(4, { winnerRider: 'Vingegaard', winnerTeam: 'Visma' }),
    ];
    const tally = computeStageWins(stages);
    expect(tally[0]).toMatchObject({ rider: 'Philipsen', team: 'Alpecin', wins: 2, stages: [1, 3] });
    expect(tally.map((t) => t.rider)).toEqual(['Philipsen', 'Pogacar', 'Vingegaard']);
  });
  it('falder tilbage til Q1-facittets hold når målrækkefølgen mangler rytter (fx TTT)', () => {
    const stages = [mkStage(5, { winnerTeam: 'Visma', resultRows: [] })];
    const tally = computeStageWins(stages);
    expect(tally).toEqual([{ rider: null, team: 'Visma', wins: 1, stages: [5] }]);
  });
});

describe('computeFacts', () => {
  const stages = [
    mkStage(1, { winnerRider: 'Philipsen', winnerTeam: 'Alpecin', km: 200 }),
    mkStage(2, { winnerRider: 'Pogacar', winnerTeam: 'UAE Team Emirates', km: 150.4 }),
    mkStage(3, { winnerRider: 'Philipsen', winnerTeam: 'Alpecin', km: 180 }),
    { number: 4, status: 'scheduled' }, // uafgjort — tæller ikke
  ];
  const f = computeFacts(stages);
  it('tæller etaper, distance og forskellige vindere', () => {
    expect(f.etaper).toBe(3);
    expect(f.totalKm).toBe(530); // 200 + 150.4 + 180 afrundet
    expect(f.distinctWinners).toBe(2);
  });
  it('finder det mest vindende hold (Q1-facit)', () => {
    expect(f.topTeam).toEqual({ team: 'Alpecin', wins: 2 });
  });
  it('totalKm er null når en afgjort etape mangler distancen', () => {
    const f2 = computeFacts([mkStage(1, { km: 200 }), mkStage(2, { km: null })]);
    expect(f2.totalKm).toBeNull();
  });
});
