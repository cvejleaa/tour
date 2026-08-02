import { describe, it, expect } from 'vitest';
import { collectTippedTeams } from './tippedTeams';
import { canonicalTeamKey } from '../../lib/tourTeams';

describe('collectTippedTeams', () => {
  it('samler distinkte KANONISKE hold-nøgler fra de fire holdvalg', () => {
    const bets = [
      { winnerTeam: 'A', gcTeam: 'B', mountainTeam: '', sprintTeam: 'A' },
      { winnerTeam: 'C', gcTeam: 'B' },
    ];
    const s = collectTippedTeams(bets);
    expect([...s].sort()).toEqual(['a', 'b', 'c']);
  });

  it('aliaser: tip på "Netcompany Ineos" matcher resultattabellens "INEOS GRENADIERS"', () => {
    const s = collectTippedTeams([{ winnerTeam: 'Netcompany Ineos' }]);
    expect(s.has(canonicalTeamKey('INEOS GRENADIERS'))).toBe(true);
  });

  it('tåler tomt/ugyldigt input', () => {
    expect(collectTippedTeams(null).size).toBe(0);
    expect(collectTippedTeams([null, {}]).size).toBe(0);
  });
});
