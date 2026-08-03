import { describe, it, expect } from 'vitest';
import { auditTeamNames } from './teamNameAudit';

const OFFICIAL = ['Alpecin-Premier Tech', 'Netcompany Ineos', 'Lidl-Trek'];

describe('auditTeamNames', () => {
  const bets = [
    { winnerTeam: 'Lidl-Trek', gcTeam: 'Israel - Premier Tech', mountainTeam: '', sprintTeam: 'Lidl-Trek' },
    { winnerTeam: 'INEOS GRENADIERS', gcTeam: 'Israel - Premier Tech' }, // alias + gammelt navn
  ];
  const teamDocs = [{ name: 'Lidl-Trek' }, { name: 'Israel - Premier Tech' }];

  it('klassificerer official/variant/unknown og tæller forekomster', () => {
    const rows = auditTeamNames(bets, teamDocs, OFFICIAL);
    const by = Object.fromEntries(rows.map((r) => [r.name, r]));

    expect(by['Lidl-Trek']).toMatchObject({ status: 'official', count: 2, inTeamsCol: true });
    // "INEOS GRENADIERS" er en kendt alias-variant → mappes automatisk.
    expect(by['INEOS GRENADIERS']).toMatchObject({ status: 'variant', official: 'Netcompany Ineos' });
    // 2025-navnet findes ikke i 2026-listen → ukendt (skal omdøbes).
    expect(by['Israel - Premier Tech']).toMatchObject({ status: 'unknown', count: 2, inTeamsCol: true, official: null });
  });

  it('sorterer ukendte navne øverst', () => {
    const rows = auditTeamNames(bets, teamDocs, OFFICIAL);
    expect(rows[0].status).toBe('unknown');
    expect(rows[rows.length - 1].status).toBe('official');
  });

  it('tåler tomme input', () => {
    expect(auditTeamNames([], [], OFFICIAL)).toEqual([]);
    expect(auditTeamNames(null, null, OFFICIAL)).toEqual([]);
  });
});
