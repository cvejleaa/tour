import { describe, it, expect } from 'vitest';
import { collectTippedTeams } from './tippedTeams';

describe('collectTippedTeams', () => {
  it('samler distinkte holdnavne fra de fire holdvalg', () => {
    const bets = [
      { winnerTeam: 'A', gcTeam: 'B', mountainTeam: '', sprintTeam: 'A' },
      { winnerTeam: 'C', gcTeam: 'B' },
    ];
    const s = collectTippedTeams(bets);
    expect([...s].sort()).toEqual(['A', 'B', 'C']);
  });

  it('tåler tomt/ugyldigt input', () => {
    expect(collectTippedTeams(null).size).toBe(0);
    expect(collectTippedTeams([null, {}]).size).toBe(0);
  });
});
