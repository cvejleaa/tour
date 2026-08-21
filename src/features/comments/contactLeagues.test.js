import { describe, it, expect } from 'vitest';
import { buildContactLeagues } from './contactLeagues';

describe('buildContactLeagues', () => {
  // Platform-ligaer bærer et gameId; de gamle Tour-ligaer gør ikke.
  const leagues = [
    { id: 'A', gameId: 'g1', memberUids: ['me', 'x', 'y'] },
    { id: 'B', gameId: 'g2', memberUids: ['me', 'y', 'z'] },
    { id: 'C', gameId: 'g1', memberUids: ['x', 'z'] }, // me er ikke med → ignoreres
  ];

  it('mapper liga-fæller til { leagueId, gameId } for en delt liga', () => {
    const map = buildContactLeagues(leagues, 'me');
    // EKSAKT indhold — ikke bare tilstedeværelse: y står i BÅDE A (g1) og B
    // (g2), og første delte liga (A) skal vinde. En mutation, der taber gameId
    // eller vælger den forkerte liga, bliver rød her.
    expect(map).toEqual({
      x: { leagueId: 'A', gameId: 'g1' },
      y: { leagueId: 'A', gameId: 'g1' },
      z: { leagueId: 'B', gameId: 'g2' },
    });
  });

  it('sætter gameId=null for gamle top-niveau-ligaer uden gameId (Tour)', () => {
    const map = buildContactLeagues([{ id: 'T', memberUids: ['me', 'ven'] }], 'me');
    expect(map).toEqual({ ven: { leagueId: 'T', gameId: null } });
  });

  it('tager IKKE folk med fra ligaer man ikke selv er i', () => {
    const map = buildContactLeagues([{ id: 'C', gameId: 'g1', memberUids: ['x', 'z'] }], 'me');
    expect(map).toEqual({});
  });

  it('udelader én selv og håndterer tomt input', () => {
    expect(buildContactLeagues([{ id: 'A', gameId: 'g1', memberUids: ['me'] }], 'me')).toEqual({});
    expect(buildContactLeagues(null, 'me')).toEqual({});
    expect(buildContactLeagues(leagues, null)).toEqual({});
  });
});
