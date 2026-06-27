// Eksempel-drevne tests for den hold-baserede Tour de France-scoring.
// Talcaserne afspejler spillets regler (Q1–Q4) og kan justeres sammen med
// brugeren.
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_POINTS,
  DEFAULT_GC_TOP_N,
  normalizePoints,
  stageWinnerTeam,
  stageGcTeam,
  topPointsTeam,
  resolveStageResult,
  isUntipped,
  scoreStageBet,
} from './tourScoring.js';

// Lille hjælper: byg en målrækkefølge fra [team, team, ...].
const order = (...teams) => teams.map((team, i) => ({ rider: `r${i + 1}`, team, rank: i + 1 }));

describe('normalizePoints', () => {
  it('giver standardværdier uden config', () => {
    expect(normalizePoints()).toEqual(DEFAULT_POINTS);
  });

  it('overskriver kun gyldige numeriske felter', () => {
    const p = normalizePoints({ winnerTeam: 8, gcTeam: 'abc', sprintTeam: 2 });
    expect(p.winnerTeam).toBe(8);
    expect(p.gcTeam).toBe(DEFAULT_POINTS.gcTeam); // ugyldig → default
    expect(p.sprintTeam).toBe(2);
  });

  it('tvinger untippedPenalty til positiv (trækkes fra som straf)', () => {
    expect(normalizePoints({ untippedPenalty: -3 }).untippedPenalty).toBe(3);
  });
});

describe('Q1 – stageWinnerTeam', () => {
  it('returnerer holdet for rytter nr. 1 i mål', () => {
    expect(stageWinnerTeam(order('UAD', 'VLA', 'SOQ'))).toBe('UAD');
  });
  it('returnerer null for tom rækkefølge', () => {
    expect(stageWinnerTeam([])).toBeNull();
    expect(stageWinnerTeam(undefined)).toBeNull();
  });
});

describe('Q2 – stageGcTeam (samlet bedste på de XX første ryttere)', () => {
  it('belønner flere ryttere højt oppe frem for én enkelt vinder', () => {
    // top-4: VLA på nr.1, men SOQ har nr.2,3,4.
    // Placerings-point (N=4): nr1=4, nr2=3, nr3=2, nr4=1.
    // VLA=4, SOQ=3+2+1=6 → SOQ vinder.
    const fo = order('VLA', 'SOQ', 'SOQ', 'SOQ');
    expect(stageGcTeam(fo, 4)).toBe('SOQ');
  });

  it('én topplacering slår spredte lave placeringer', () => {
    // top-5: UAD nr.1 (5p). Resten ét hold hver lavt.
    const fo = order('UAD', 'A', 'B', 'C', 'D');
    expect(stageGcTeam(fo, 5)).toBe('UAD');
  });

  it('respekterer topN-grænsen (ryttere udenfor tæller ikke)', () => {
    // Kun top-2 tæller: nr1 UAD(2p), nr2 VLA(1p) → UAD. SOQ udenfor.
    const fo = order('UAD', 'VLA', 'SOQ', 'SOQ', 'SOQ');
    expect(stageGcTeam(fo, 2)).toBe('UAD');
  });

  it('bruger default top-N når intet er angivet', () => {
    const fo = order(...Array(DEFAULT_GC_TOP_N + 5).fill('UAD'));
    expect(stageGcTeam(fo)).toBe('UAD');
  });

  it('er deterministisk ved lige sum (alfabetisk tie-break)', () => {
    // top-2: nr1 'BBB'(2p), nr2 'AAA'(1p) → BBB højest. Byt om:
    expect(stageGcTeam(order('BBB', 'AAA'), 2)).toBe('BBB');
    // To hold med præcis samme samlede point og antal → alfabetisk først.
    // nr1 'ZZZ', nr2 'AAA', nr3 'AAA', nr4 'ZZZ' (N=4):
    // ZZZ=4+1=5, AAA=3+2=5, begge 2 ryttere → 'AAA' vinder (alfabetisk).
    expect(stageGcTeam(order('ZZZ', 'AAA', 'AAA', 'ZZZ'), 4)).toBe('AAA');
  });
});

describe('Q3/Q4 – topPointsTeam (bjerg-/sprintpoint)', () => {
  it('summerer point pr. hold og vælger højest', () => {
    const list = [
      { rider: 'a', team: 'COF', points: 10 },
      { rider: 'b', team: 'UAD', points: 6 },
      { rider: 'c', team: 'COF', points: 2 }, // COF = 12
    ];
    expect(topPointsTeam(list)).toBe('COF');
  });
  it('ignorerer poster uden hold eller uden positive point', () => {
    const list = [
      { rider: 'a', team: '', points: 50 },
      { rider: 'b', team: 'UAD', points: 4 },
    ];
    expect(topPointsTeam(list)).toBe('UAD');
  });
  it('returnerer null for tom liste', () => {
    expect(topPointsTeam([])).toBeNull();
  });
});

describe('resolveStageResult – fuldt facit fra rå etapedata', () => {
  it('afgør alle fire spørgsmål når data findes', () => {
    const raw = {
      finishOrder: order('UAD', 'VLA', 'UAD', 'SOQ'),
      mountainPoints: [{ team: 'COF', points: 12 }, { team: 'UAD', points: 5 }],
      sprintPoints: [{ team: 'SOQ', points: 20 }, { team: 'UAD', points: 8 }],
      gcTopN: 4,
    };
    const res = resolveStageResult(raw);
    expect(res.winnerTeam).toBe('UAD'); // nr.1
    // top-4: UAD nr1+nr3 = 4+2 = 6, VLA nr2 = 3, SOQ nr4 = 1 → UAD
    expect(res.gcTeam).toBe('UAD');
    expect(res.mountainTeam).toBe('COF');
    expect(res.sprintTeam).toBe('SOQ');
  });

  it('udelader spørgsmål uden data (fx flad etape uden bjergpoint)', () => {
    const res = resolveStageResult({ finishOrder: order('UAD', 'VLA') });
    expect(res.winnerTeam).toBe('UAD');
    expect(res.mountainTeam).toBeNull();
    expect(res.sprintTeam).toBeNull();
  });
});

describe('isUntipped', () => {
  it('true når intet felt er udfyldt', () => {
    expect(isUntipped(null)).toBe(true);
    expect(isUntipped({})).toBe(true);
    expect(isUntipped({ winnerTeam: '', gcTeam: null })).toBe(true);
  });
  it('false når mindst ét felt er udfyldt', () => {
    expect(isUntipped({ winnerTeam: 'UAD' })).toBe(false);
  });
});

describe('scoreStageBet', () => {
  const facit = { winnerTeam: 'UAD', gcTeam: 'SOQ', mountainTeam: 'COF', sprintTeam: 'SOQ' };

  it('giver fuld pott for fire rigtige (standardpoint = 5+4+3+3 = 15)', () => {
    const { points, untipped } = scoreStageBet(facit, facit);
    expect(points).toBe(15);
    expect(untipped).toBe(false);
  });

  it('scorer delvist og giver breakdown pr. felt', () => {
    const bet = { winnerTeam: 'UAD', gcTeam: 'UAD', mountainTeam: 'COF', sprintTeam: 'VLA' };
    const { points, breakdown } = scoreStageBet(bet, facit);
    expect(points).toBe(DEFAULT_POINTS.winnerTeam + DEFAULT_POINTS.mountainTeam); // 5 + 3
    expect(breakdown).toEqual({ winnerTeam: 5, gcTeam: 0, mountainTeam: 3, sprintTeam: 0 });
  });

  it('respekterer admin-konfigurerede point', () => {
    const bet = { winnerTeam: 'UAD' };
    const { points } = scoreStageBet(bet, facit, { winnerTeam: 10 });
    expect(points).toBe(10);
  });

  it('giver straf for et helt utippet etape når facit findes', () => {
    const { points, untipped } = scoreStageBet({}, facit, { untippedPenalty: 2 });
    expect(points).toBe(-2);
    expect(untipped).toBe(true);
  });

  it('giver IKKE straf når etapen endnu ikke er afgjort', () => {
    const { points } = scoreStageBet({}, {}, { untippedPenalty: 2 });
    expect(points).toBe(0);
  });

  it('et ikke-afgjort felt giver hverken point eller straf', () => {
    // Kun winnerTeam afgjort; spilleren ramte den.
    const bet = { winnerTeam: 'UAD', sprintTeam: 'SOQ' };
    const { points, breakdown } = scoreStageBet(bet, { winnerTeam: 'UAD' });
    expect(points).toBe(DEFAULT_POINTS.winnerTeam);
    expect(breakdown).toEqual({ winnerTeam: 5 });
  });
});
