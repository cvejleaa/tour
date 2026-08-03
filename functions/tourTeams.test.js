// functions/tourTeams.test.js — verificerer hold-matchning (CommonJS-udgave).
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { normalizeTeam, sameTeam, canonicalTeamKey, teamsFromRows } = require('./tourTeams.js');

describe('normalizeTeam & sameTeam', () => {
  it('matcher trods format', () => {
    expect(normalizeTeam('Soudal Quick-Step')).toBe('soudalquickstep');
    expect(sameTeam('Soudal Quick-Step', 'soudal quick step')).toBe(true);
    expect(sameTeam('Cofidis', 'Movistar Team')).toBe(false);
  });
});

describe('teamsFromRows', () => {
  it('samler unikke hold med årstal-fri nøgle', () => {
    const teams = teamsFromRows([
      { team_name: 'UAE Team Emirates', team_url: 'team/uae-team-emirates-2025' },
      { team_name: 'UAE Team Emirates', team_url: 'team/uae-team-emirates-2025' },
      { team_name: 'Cofidis', team_url: 'team/cofidis-2025' },
    ]);
    expect(teams).toHaveLength(2);
    expect(teams).toContainEqual({ key: 'uae-team-emirates', name: 'UAE Team Emirates' });
  });
  it('alias-varianter smelter sammen til ÉT hold med kanonisk nøgle', () => {
    const teams = teamsFromRows([
      { team_name: 'INEOS GRENADIERS' },
      { team_name: 'NETCOMPANY INEOS CYCLING TEAM' },
    ]);
    expect(teams).toHaveLength(1);
    expect(teams[0].key).toBe('netcompanyineos');
  });
});


describe('canonicalTeamKey + aliaser (Ineos-sagen)', () => {
  it('resultattabellens "INEOS GRENADIERS" = holdlistens "Netcompany Ineos"', () => {
    expect(sameTeam('INEOS GRENADIERS', 'Netcompany Ineos')).toBe(true);
    expect(sameTeam('NETCOMPANY INEOS CYCLING TEAM', 'Netcompany Ineos')).toBe(true);
    expect(canonicalTeamKey('Ineos Grenadiers')).toBe('netcompanyineos');
    expect(sameTeam('Cofidis', 'Netcompany Ineos')).toBe(false);
  });
});
