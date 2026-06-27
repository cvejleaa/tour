// Tests for previousPicksFor — find seneste tidligere tippede etapes holdvalg.
import { describe, it, expect } from 'vitest';
import { previousPicksFor } from './previousPicks';

const stages = [
  { id: 's1', number: 1 },
  { id: 's2', number: 2 },
  { id: 's3', number: 3 },
];

describe('previousPicksFor', () => {
  it('returnerer holdvalg fra den seneste tidligere tippede etape', () => {
    const bets = {
      s1: { winnerTeam: 'A1', gcTeam: 'A2', mountainTeam: 'A3', sprintTeam: 'A4' },
      s2: { winnerTeam: 'B1', gcTeam: 'B2', mountainTeam: 'B3', sprintTeam: 'B4' },
    };
    // For etape 3 → forrige tippede er etape 2 (højeste number < 3)
    expect(previousPicksFor(stages[2], stages, bets)).toEqual({
      winnerTeam: 'B1', gcTeam: 'B2', mountainTeam: 'B3', sprintTeam: 'B4',
    });
  });

  it('springer etaper uden noget udfyldt felt over', () => {
    const bets = {
      s1: { winnerTeam: 'A1', gcTeam: '', mountainTeam: '', sprintTeam: '' },
      s2: { winnerTeam: '', gcTeam: '', mountainTeam: '', sprintTeam: '' }, // tom → springes over
    };
    expect(previousPicksFor(stages[2], stages, bets)).toEqual({
      winnerTeam: 'A1', gcTeam: '', mountainTeam: '', sprintTeam: '',
    });
  });

  it('returnerer null når der ingen tidligere tippet etape findes', () => {
    expect(previousPicksFor(stages[0], stages, {})).toBeNull();
    const bets = { s3: { winnerTeam: 'C1' } }; // kun en SENERE etape tippet
    expect(previousPicksFor(stages[0], stages, bets)).toBeNull();
  });
});
