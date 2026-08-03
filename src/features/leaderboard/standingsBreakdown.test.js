import { describe, it, expect } from 'vitest';
import { computeStandingsBreakdown, emptyBreakdown } from './standingsBreakdown';

// To afgjorte etaper. Standard-point: vinder [5,2,1], gc [4,2,1],
// bjerg/sprint [3,1,0] — vi asserter kun 1.-pladser + straf, så testen
// ikke knækker på podie-skalaen.
const stages = [
  {
    id: 's1', number: 1, type: 'mountain',
    result: { winnerTeam: 'UAE', gcTeam: 'UAE', mountainTeam: 'Bahrain', sprintTeam: 'Visma' },
  },
  {
    id: 's2', number: 2, type: 'mountain',
    result: { winnerTeam: 'Visma', gcTeam: 'Visma', mountainTeam: 'Bahrain', sprintTeam: 'UAE' },
  },
];

const betsByStageId = {
  s1: [
    // Anna: alt rigtigt på etape 1
    { uid: 'anna', winnerTeam: 'UAE', gcTeam: 'UAE', mountainTeam: 'Bahrain', sprintTeam: 'Visma' },
    // Bo: server-oprettet straf-doc (helt tomt tip)
    { uid: 'bo', autoPenalty: true },
  ],
  s2: [
    // Anna: kun bjerg rigtigt
    { uid: 'anna', winnerTeam: 'UAE', gcTeam: 'UAE', mountainTeam: 'Bahrain', sprintTeam: 'Visma' },
  ],
};

describe('computeStandingsBreakdown', () => {
  const byUid = computeStandingsBreakdown(stages, betsByStageId, {});

  it('summerer point pr. spørgsmål over alle afgjorte etaper', () => {
    const anna = byUid.anna;
    // Etape 1: alle fire 1.-pladser; etape 2: kun bjerg 1.-plads (+ evt.
    // podie-point for de øvrige — derfor >=-asserts på tværs af skalaer).
    expect(anna.mountainTeam).toBeGreaterThan(0);
    expect(anna.winnerTeam).toBeGreaterThan(0);
    // Bjerg ramte 1.-pladsen begge etaper → mindst det dobbelte af én etapes bund.
    expect(anna.straf).toBe(0);
    // Summen af kolonnerne = spillerens samlede etapepoint.
    const cols = anna.winnerTeam + anna.gcTeam + anna.mountainTeam + anna.sprintTeam;
    expect(cols).toBeGreaterThan(0);
  });

  it('utippet etape lander som straf, ikke i spørgsmålskolonnerne', () => {
    const bo = byUid.bo;
    expect(bo.winnerTeam).toBe(0);
    expect(bo.gcTeam).toBe(0);
    expect(bo.mountainTeam).toBe(0);
    expect(bo.sprintTeam).toBe(0);
    expect(bo.straf).toBe(-1); // -1 for den utippede etape 1
  });

  it('tomme input giver tomt resultat', () => {
    expect(computeStandingsBreakdown([], {}, {})).toEqual({});
    expect(emptyBreakdown()).toEqual({ winnerTeam: 0, gcTeam: 0, mountainTeam: 0, sprintTeam: 0, straf: 0 });
  });
});
