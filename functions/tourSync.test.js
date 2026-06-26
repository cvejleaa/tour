// functions/tourSync.test.js — buildStageUpdate mod et letour-lignende payload.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { buildStageUpdate } = require('./tourSync.js');

const payload = {
  number: 2,
  results_present: true,
  meta: { departure: 'Lille', arrival: 'Boulogne', distance_km: 209 },
  classifications: {
    etape: { rows: [
      { rank: 1, rider_name: 'Groves', team_name: 'ALPECIN-DECEUNINCK', team_url: 'team/alpecin-deceuninck-2025' },
      { rank: 2, rider_name: 'Milan', team_name: 'LIDL-TREK', team_url: 'team/lidl-trek-2025' },
      { rank: 3, rider_name: 'X', team_name: 'ALPECIN-DECEUNINCK', team_url: 'team/alpecin-deceuninck-2025' },
    ] },
    samlet: { rows: [{ rank: 1, rider_name: 'Pogacar', team_name: 'UAE' }] },
    sprint: { rows: [{ rider_name: 'Velasco', team_name: 'XDS ASTANA TEAM', points: 20 }] },
    bjerg: { rows: [{ rider_name: 'Barre', team_name: 'INTERMARCHÉ - WANTY', points: 5 }] },
    ungdom: { rows: [{ rank: 1, rider_name: 'Lipowitz', team_name: 'RED BULL' }] },
    hold: { rows: [{ rank: 1, rider_name: 'TEAM VISMA | LEASE A BIKE', team_name: 'TEAM VISMA | LEASE A BIKE' }] },
  },
};

describe('buildStageUpdate', () => {
  it('udleder facit, trøjer, meta og hold', () => {
    const upd = buildStageUpdate(payload, 3);
    expect(upd.resultsPresent).toBe(true);
    expect(upd.result.winnerTeam).toBe('ALPECIN-DECEUNINCK'); // Q1
    expect(upd.result.gcTeam).toBe('ALPECIN-DECEUNINCK'); // Q2 top-3: 3+1 vs Lidl 2
    expect(upd.result.sprintTeam).toBe('XDS ASTANA TEAM'); // Q4
    expect(upd.result.mountainTeam).toBe('INTERMARCHÉ - WANTY'); // Q3
    expect(upd.jerseys.yellow).toBe('Pogacar');
    expect(upd.jerseys.teamLead).toBe('TEAM VISMA | LEASE A BIKE');
    expect(upd.meta.startCity).toBe('Lille');
    // hold selv-udfyldning (årstal-fri nøgle)
    expect(upd.teams).toContainEqual({ key: 'alpecin-deceuninck', name: 'ALPECIN-DECEUNINCK' });
    expect(upd.teams).toContainEqual({ key: 'lidl-trek', name: 'LIDL-TREK' });
  });
});
