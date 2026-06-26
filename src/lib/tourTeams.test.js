import { describe, it, expect } from 'vitest';
import {
  normalizeTeam,
  teamKeyFromRow,
  sameTeam,
  findKnownTeam,
  teamsFromRows,
} from './tourTeams.js';

describe('normalizeTeam', () => {
  it('ignorerer tegnsætning, mellemrum og store/små bogstaver', () => {
    expect(normalizeTeam('Visma | Lease a Bike')).toBe('vismaleaseabike');
    expect(normalizeTeam('Visma | Lease a bike')).toBe('vismaleaseabike');
  });
  it('stripper accenter', () => {
    expect(normalizeTeam('Decathlon AG2R La Mondiale')).toBe(normalizeTeam('Décathlon AG2R La Mondiale'));
  });
  it('tom/ugyldig → tom streng', () => {
    expect(normalizeTeam(null)).toBe('');
  });
});

describe('teamKeyFromRow', () => {
  it('bruger team_url og fjerner årstal-suffiks', () => {
    expect(teamKeyFromRow({ team_url: 'team/uae-team-emirates-xrg-2025', team_name: 'UAE' }))
      .toBe('uae-team-emirates-xrg');
  });
  it('falder tilbage til normaliseret team_name uden url', () => {
    expect(teamKeyFromRow({ team_name: 'Soudal Quick-Step' })).toBe('soudalquickstep');
  });
  it('null uden hold', () => {
    expect(teamKeyFromRow({})).toBeNull();
  });
});

describe('sameTeam', () => {
  it('matcher trods formatforskelle', () => {
    expect(sameTeam('Soudal Quick-Step', 'soudal quick step')).toBe(true);
  });
  it('forskellige hold matcher ikke', () => {
    expect(sameTeam('Cofidis', 'Movistar Team')).toBe(false);
  });
  it('null håndteres', () => {
    expect(sameTeam(null, 'Cofidis')).toBe(false);
  });
});

describe('findKnownTeam', () => {
  const known = [{ key: 'cofidis', name: 'Cofidis' }, { key: 'movistarteam', name: 'Movistar Team' }];
  it('finder eksisterende hold via navn', () => {
    expect(findKnownTeam('cofidis', known)).toEqual({ key: 'cofidis', name: 'Cofidis' });
  });
  it('null for ukendt hold', () => {
    expect(findKnownTeam('Lidl-Trek', known)).toBeNull();
  });
});

describe('teamsFromRows (selv-udfyldning)', () => {
  it('samler unikke hold og bevarer display-navn', () => {
    const rows = [
      { rider_name: 'A', team_name: 'UAE Team Emirates', team_url: 'team/uae-team-emirates-2025' },
      { rider_name: 'B', team_name: 'UAE Team Emirates', team_url: 'team/uae-team-emirates-2025' },
      { rider_name: 'C', team_name: 'Cofidis', team_url: 'team/cofidis-2025' },
      { rider_name: 'D', team_name: '' }, // ignoreres
    ];
    const teams = teamsFromRows(rows);
    expect(teams).toHaveLength(2);
    expect(teams).toContainEqual({ key: 'uae-team-emirates', name: 'UAE Team Emirates' });
    expect(teams).toContainEqual({ key: 'cofidis', name: 'Cofidis' });
  });
});
