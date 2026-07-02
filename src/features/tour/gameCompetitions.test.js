import { describe, it, expect } from 'vitest';
import { gameCompetitions } from './gameCompetitions';

const data = {
  stageResult: [
    { rank: 1, rider: 'Pogačar', team: 'UAE' },
    { rank: 2, rider: 'Vingegaard', team: 'Visma' },
    { rank: 3, rider: 'Almeida', team: 'UAE' },
    { rank: 4, rider: 'Roglič', team: 'Visma' },
  ],
  standings: {
    bjerg: [
      { rank: 1, rider: 'Martinez', team: 'Bahrain', points: 50 },
      { rank: 2, rider: 'Pogačar', team: 'UAE', points: 40 },
      { rank: 3, rider: 'Buitrago', team: 'Bahrain', points: 20 },
    ],
    sprint: [
      { rank: 1, rider: 'Philipsen', team: 'Alpecin', points: 200 },
      { rank: 2, rider: 'Girmay', team: 'Decathlon', points: 150 },
    ],
  },
};

describe('gameCompetitions', () => {
  const c = gameCompetitions(data, 4);

  it('etapevinder-hold: holdets placering = bedste rytter, top-5', () => {
    expect(c.winnerTeam[0].team).toBe('UAE'); // Pogačar nr. 1
    expect(c.winnerTeam[0].best).toBe(1);
    expect(c.winnerTeam[0].riders.map((r) => r.rider)).toEqual(['Pogačar', 'Almeida']);
  });

  it('bedste hold: (N−pos+1)-point summeret pr. hold (N=4)', () => {
    // UAE: nr.1(4)+nr.3(2)=6, Visma: nr.2(3)+nr.4(1)=4 → UAE først
    expect(c.gcTeam[0]).toMatchObject({ team: 'UAE', total: 6 });
    expect(c.gcTeam[1]).toMatchObject({ team: 'Visma', total: 4 });
  });

  it('bjergpoint: sum pr. hold med rytter-specifikation', () => {
    // Bahrain 50+20=70 > UAE 40
    expect(c.mountainTeam[0]).toMatchObject({ team: 'Bahrain', total: 70 });
    expect(c.mountainTeam[0].riders.map((r) => r.rider)).toEqual(['Martinez', 'Buitrago']);
  });

  it('sprintpoint: sum pr. hold', () => {
    expect(c.sprintTeam[0]).toMatchObject({ team: 'Alpecin', total: 200 });
  });

  it('tåler manglende data', () => {
    const empty = gameCompetitions({}, 4);
    expect(empty.winnerTeam).toEqual([]);
    expect(empty.mountainTeam).toEqual([]);
  });
});
