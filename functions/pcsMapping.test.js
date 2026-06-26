// functions/pcsMapping.test.js — verificerer PCS-broen (CommonJS-udgave).
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  finishOrderFromPcs, deltaPointsList, pcsToStageInput, jerseyHolders, stageMetaFromPcs,
} = require('./pcsMapping.js');
const { resolveStageResult, scoreStageBet } = require('./tourScoring.js');

const payloadN = {
  number: 2,
  meta: { date: '2026-07-05', departure: 'Lille', arrival: 'Boulogne', distance_km: 209, stage_type: 'Hilly', profile_icon: 'p2' },
  results_present: true,
  classifications: {
    etape: { rows: [
      { rank: 1, rider_name: 'Pogačar', rider_url: 'r/pog', team_name: 'UAE' },
      { rank: 2, rider_name: 'Vingegaard', rider_url: 'r/vin', team_name: 'Visma' },
      { rank: 3, rider_name: 'Almeida', rider_url: 'r/alm', team_name: 'UAE' },
      { rank: 4, rider_name: 'Evenepoel', rider_url: 'r/eve', team_name: 'Soudal' },
    ] },
    samlet: { rows: [{ rank: 1, rider_name: 'Pogačar', team_name: 'UAE' }] },
    sprint: { rows: [
      { rank: 1, rider_name: 'Vingegaard', rider_url: 'r/vin', team_name: 'Visma', points: 30 },
      { rank: 2, rider_name: 'Pogačar', rider_url: 'r/pog', team_name: 'UAE', points: 25 },
    ] },
    bjerg: { rows: [
      { rank: 1, rider_name: 'Martinez', rider_url: 'r/mar', team_name: 'Bahrain', points: 12 },
    ] },
    ungdom: { rows: [{ rank: 1, rider_name: 'Evenepoel', team_name: 'Soudal' }] },
    hold: { rows: [{ rank: 1, rider_name: 'UAE', team_name: 'UAE' }] },
  },
};

describe('finishOrderFromPcs', () => {
  it('bevarer rækkefølge + hold', () => {
    expect(finishOrderFromPcs(payloadN)[0]).toEqual({ rider: 'Pogačar', team: 'UAE', rank: 1 });
  });
});

describe('deltaPointsList (ægte point på etapen)', () => {
  it('trækker forrige etapes point fra', () => {
    const prev = { classifications: { sprint: { rows: [
      { rider_name: 'Vingegaard', rider_url: 'r/vin', team_name: 'Visma', points: 12 },
    ] } } };
    const delta = deltaPointsList(payloadN, prev, 'sprint');
    expect(delta).toContainEqual({ rider: 'Vingegaard', team: 'Visma', points: 18 }); // 30-12
    expect(delta).toContainEqual({ rider: 'Pogačar', team: 'UAE', points: 25 }); // ny
  });
});

describe('hele kæden payload → resultat → score (med delta)', () => {
  it('afgør Q1–Q4 og scorer en spiller', () => {
    const input = pcsToStageInput(payloadN, { gcTopN: 4, prevPayload: {} });
    const res = resolveStageResult(input);
    expect(res.winnerTeam).toBe('UAE');
    expect(res.gcTeam).toBe('UAE'); // top-4: UAE 4+2=6
    expect(res.mountainTeam).toBe('Bahrain');
    expect(res.sprintTeam).toBe('Visma'); // delta=fuld (intet forrige): Visma 30 > UAE 25
    const bet = { winnerTeam: 'UAE', gcTeam: 'Soudal', mountainTeam: 'Bahrain', sprintTeam: 'Visma' };
    expect(scoreStageBet(bet, res).points).toBe(5 + 0 + 3 + 3);
  });
});

describe('jerseyHolders & stageMetaFromPcs', () => {
  it('trøjer', () => {
    expect(jerseyHolders(payloadN)).toEqual({
      yellow: 'Pogačar', green: 'Vingegaard', polka: 'Martinez', white: 'Evenepoel', teamLead: 'UAE',
    });
  });
  it('metadata', () => {
    expect(stageMetaFromPcs(payloadN)).toEqual({
      number: 2, date: '2026-07-05', startCity: 'Lille', finishCity: 'Boulogne', km: 209, type: 'Hilly', profileIcon: 'p2',
    });
  });
});
