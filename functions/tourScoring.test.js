// functions/tourScoring.test.js — verificerer den autoritative CommonJS-scoring.
// Skal matche src/lib/tourScoring.js (samme talcaser som dér).
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  DEFAULT_POINTS, normalizePoints, stageWinnerTeam, stageGcTeam,
  topPointsTeam, resolveStageResult, isUntipped, scoreStageBet, bonusNorm,
  QUESTION_DEFAULTS_BY_TYPE, activeQuestionsForStage,
} = require('./tourScoring.js');

const order = (...teams) => teams.map((team, i) => ({ rider: `r${i + 1}`, team, rank: i + 1 }));

describe('normalizePoints', () => {
  it('standard uden config', () => {
    expect(normalizePoints()).toEqual(DEFAULT_POINTS);
  });
  it('untippedPenalty tvinges positiv', () => {
    expect(normalizePoints({ untippedPenalty: -3 }).untippedPenalty).toBe(3);
  });
});

describe('Q1/Q2', () => {
  it('stageWinnerTeam = nr.1', () => {
    expect(stageWinnerTeam(order('UAD', 'VLA'))).toBe('UAD');
  });
  it('stageGcTeam belønner flere ryttere oppe', () => {
    expect(stageGcTeam(order('VLA', 'SOQ', 'SOQ', 'SOQ'), 4)).toBe('SOQ');
  });
  it('stageGcTeam respekterer topN', () => {
    expect(stageGcTeam(order('UAD', 'VLA', 'SOQ', 'SOQ', 'SOQ'), 2)).toBe('UAD');
  });
});

describe('Q3/Q4', () => {
  it('topPointsTeam summerer pr. hold', () => {
    expect(topPointsTeam([
      { team: 'COF', points: 10 }, { team: 'UAD', points: 6 }, { team: 'COF', points: 2 },
    ])).toBe('COF');
  });
});

describe('resolveStageResult + scoreStageBet', () => {
  const facit = { winnerTeam: 'UAD', gcTeam: 'SOQ', mountainTeam: 'COF', sprintTeam: 'SOQ' };
  it('fuld pott = 15', () => {
    expect(scoreStageBet(facit, facit).points).toBe(15);
  });
  it('delvist + breakdown', () => {
    const bet = { winnerTeam: 'UAD', gcTeam: 'UAD', mountainTeam: 'COF', sprintTeam: 'VLA' };
    const r = scoreStageBet(bet, facit);
    expect(r.points).toBe(8);
    expect(r.breakdown).toEqual({ winnerTeam: 5, gcTeam: 0, mountainTeam: 3, sprintTeam: 0 });
  });
  it('admin-point respekteres', () => {
    expect(scoreStageBet({ winnerTeam: 'UAD' }, facit, { winnerTeam: 10 }).points).toBe(10);
  });
  it('utippet etape med facit = straf', () => {
    expect(scoreStageBet({}, facit, { untippedPenalty: 2 }).points).toBe(-2);
    expect(isUntipped({})).toBe(true);
  });
  it('utippet uden facit = 0', () => {
    expect(scoreStageBet({}, {}, { untippedPenalty: 2 }).points).toBe(0);
  });
  it('resolveStageResult fra rå data', () => {
    const res = resolveStageResult({
      finishOrder: order('UAD', 'VLA', 'UAD', 'SOQ'),
      mountainPoints: [{ team: 'COF', points: 12 }, { team: 'UAD', points: 5 }],
      sprintPoints: [{ team: 'SOQ', points: 20 }],
      gcTopN: 4,
    });
    expect(res).toEqual({ winnerTeam: 'UAD', gcTeam: 'UAD', mountainTeam: 'COF', sprintTeam: 'SOQ' });
  });
});

describe('activeQuestionsForStage + scoreStageBet (aktive spørgsmål)', () => {
  const facit = { winnerTeam: 'UAD', gcTeam: 'SOQ', mountainTeam: 'COF', sprintTeam: 'SOQ' };

  it('type-standarder', () => {
    expect(activeQuestionsForStage({ type: 'ttt' })).toEqual(QUESTION_DEFAULTS_BY_TYPE.ttt);
    expect(activeQuestionsForStage({ type: 'flat' })).toEqual(QUESTION_DEFAULTS_BY_TYPE.flat);
    expect(activeQuestionsForStage({ type: 'sjov' })).toEqual(QUESTION_DEFAULTS_BY_TYPE.unknown);
  });

  it('override vinder over typen', () => {
    const q = { winnerTeam: true, gcTeam: false, mountainTeam: true, sprintTeam: false };
    expect(activeQuestionsForStage({ type: 'flat', questions: q })).toEqual(q);
  });

  it('kun aktive spørgsmål scorer', () => {
    expect(scoreStageBet(facit, facit, undefined, { type: 'ttt' }).points).toBe(DEFAULT_POINTS.winnerTeam);
  });

  it('straf kun for utippet blandt aktive', () => {
    const r = scoreStageBet({ sprintTeam: 'SOQ' }, facit, { untippedPenalty: 2 }, { type: 'ttt' });
    expect(r.untipped).toBe(true);
    expect(r.points).toBe(-2);
  });

  it('uændret når alle fire aktive', () => {
    expect(scoreStageBet(facit, facit).points).toBe(15);
  });
});

describe('bonusNorm (bonus-svar normalisering)', () => {
  it('trimmer og laver små bogstaver for skalarer', () => {
    expect(bonusNorm('  Vingegaard ')).toBe('vingegaard');
    expect(bonusNorm('JA')).toBe('ja');
  });

  it('håndterer null/undefined som tom streng', () => {
    expect(bonusNorm(null)).toBe('');
    expect(bonusNorm(undefined)).toBe('');
  });

  it('konverterer tal til streng', () => {
    expect(bonusNorm(42)).toBe('42');
  });

  it('sorterer arrays så rækkefølge er ligegyldig (teams)', () => {
    expect(bonusNorm(['UAD', 'TVL'])).toBe(bonusNorm(['TVL', 'UAD']));
    expect(bonusNorm([' uad ', 'TVL'])).toBe('tvl|uad');
  });

  it('multi-team svar matcher facit uafhængigt af rækkefølge', () => {
    const facit = ['Visma', 'UAE'];
    const answerSame = ['UAE', 'Visma'];
    const answerWrong = ['UAE', 'EF'];
    expect(bonusNorm(answerSame)).toBe(bonusNorm(facit));
    expect(bonusNorm(answerWrong)).not.toBe(bonusNorm(facit));
  });

  it('skalar og array giver forskellige normaliseringer', () => {
    expect(bonusNorm('a')).not.toBe(bonusNorm(['a', 'b']));
  });
});
