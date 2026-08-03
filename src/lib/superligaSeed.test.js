import { describe, it, expect } from 'vitest';
import { teamElo, matchId, buildMatch, buildMatches } from './superligaSeed';
import { ELO } from './superligaScoring';

const TEAMS = [
  { name: 'FC København', elo: 1680 },
  { name: 'Vejle BK', elo: 1420 },
];

describe('teamElo', () => {
  it('slår op i liste og i map', () => {
    expect(teamElo(TEAMS, 'FC København')).toBe(1680);
    expect(teamElo({ 'Vejle BK': 1420 }, 'Vejle BK')).toBe(1420);
  });
  it('ukendt hold → ELO.START', () => {
    expect(teamElo(TEAMS, 'Ukendt')).toBe(ELO.START);
    expect(teamElo(null, 'X')).toBe(ELO.START);
  });
});

describe('matchId', () => {
  it('er stabilt og strippet for tegn', () => {
    expect(matchId({ round: 1, home: 'FC København', away: 'Vejle BK' }))
      .toBe('r1-fckobenhavn-vejlebk');
  });
});

describe('buildMatch', () => {
  it('vedhæfter Elo-snapshot + frosne odds', () => {
    const m = buildMatch({ round: 1, home: 'FC København', away: 'Vejle BK', kickoff: 123 }, TEAMS);
    expect(m.eloHome).toBe(1680);
    expect(m.eloAway).toBe(1420);
    expect(m.round).toBe(1);
    expect(m.kickoff).toBe(123);
    // Storfavorit hjemme → lav hjemme-odds, høj ude-odds.
    expect(m.odds['1']).toBeLessThan(m.odds['2']);
    expect(m.odds['1']).toBeGreaterThanOrEqual(1.1);
    expect(m.id).toBe('r1-fckobenhavn-vejlebk');
  });
  it('ukendte hold får neutrale odds (begge ELO.START)', () => {
    const m = buildMatch({ round: 1, home: 'A', away: 'B' }, TEAMS);
    expect(m.eloHome).toBe(ELO.START);
    expect(m.eloAway).toBe(ELO.START);
    expect(m.kickoff).toBeNull();
  });
});

describe('buildMatches', () => {
  it('bygger flere', () => {
    const ms = buildMatches([
      { round: 1, home: 'FC København', away: 'Vejle BK' },
      { round: 1, home: 'Vejle BK', away: 'FC København' },
    ], TEAMS);
    expect(ms).toHaveLength(2);
    expect(ms[0].id).not.toBe(ms[1].id);
  });
});
