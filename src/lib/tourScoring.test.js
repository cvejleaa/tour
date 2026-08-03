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
  gcTeamStanding,
  topPointsTeam,
  resolveStageResult,
  isUntipped,
  scoreStageBet,
  QUESTION_DEFAULTS_BY_TYPE,
  activeQuestionsForStage,
  stageTipComplete,
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

describe('Q2 – stageGcTeam (holdets N bedste rytteres placeringssum, lavest vinder)', () => {
  it('summerer holdets N bedste placeringer; lavest sum vinder', () => {
    // N=3. AAA på 1,4,5 (sum 10); BBB på 2,3,6 (sum 11) → AAA vinder.
    expect(stageGcTeam(order('AAA', 'BBB', 'BBB', 'AAA', 'AAA', 'BBB'), 3)).toBe('AAA');
  });

  it('kun de N bedste placeringer tæller (dårlige ignoreres)', () => {
    // N=2. AAA på 1,2,(5); BBB på 3,4 → AAA sum 3 < BBB sum 7.
    expect(stageGcTeam(order('AAA', 'AAA', 'BBB', 'BBB', 'AAA'), 2)).toBe('AAA');
  });

  it('hold med færre end N ryttere i mål kvalificerer ikke', () => {
    // N=3. AAA har 3 (1,2,3); BBB har kun 2 (4,5) → kun AAA kvalificerer.
    expect(stageGcTeam(order('AAA', 'AAA', 'AAA', 'BBB', 'BBB'), 3)).toBe('AAA');
  });

  it('null når intet hold har N ryttere i mål', () => {
    expect(stageGcTeam(order('AAA', 'BBB'), 3)).toBeNull();
  });

  it('bruger default top-N når intet er angivet', () => {
    const fo = order(...Array(DEFAULT_GC_TOP_N).fill('UAD'), ...Array(DEFAULT_GC_TOP_N).fill('VLA'));
    expect(stageGcTeam(fo)).toBe('UAD'); // UAD har de N første pladser (lavest sum)
  });

  it('er deterministisk ved lige sum (alfabetisk tie-break)', () => {
    // N=2. ZZZ på 1,4 (sum 5); AAA på 2,3 (sum 5) → lige → 'AAA' først.
    expect(stageGcTeam(order('ZZZ', 'AAA', 'AAA', 'ZZZ'), 2)).toBe('AAA');
  });
});

describe('gcTeamStanding – fuld Q2-holdstilling med rytter-detaljer', () => {
  it('sorterer hold efter laveste sum og angiver de tællende ryttere', () => {
    const rows = gcTeamStanding(order('AAA', 'BBB', 'BBB', 'AAA', 'AAA', 'BBB'), 3);
    expect(rows.map((r) => r.team)).toEqual(['AAA', 'BBB']);
    expect(rows[0]).toMatchObject({ team: 'AAA', sum: 10 });
    expect(rows[0].riders.map((r) => r.rank)).toEqual([1, 4, 5]);
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
      finishOrder: order('UAD', 'UAD', 'VLA', 'SOQ', 'VLA'),
      mountainPoints: [{ team: 'COF', points: 12 }, { team: 'UAD', points: 5 }],
      sprintPoints: [{ team: 'SOQ', points: 20 }, { team: 'UAD', points: 8 }],
      gcTopN: 2,
    };
    const res = resolveStageResult(raw);
    expect(res.winnerTeam).toBe('UAD'); // nr.1
    // N=2: UAD nr1+nr2 = 3 (lavest); VLA nr3+nr5 = 8; SOQ kun 1 rytter → udgår → UAD
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

  it('matcher holdnavne TOLERANT (case/tegnsætning/whitespace må afvige)', () => {
    // Tip gemt med seed-navnet; facit kommer fra letour-resultattabellen med
    // anden kapitalisering og tegnsætning. Skal stadig give fuld gevinst.
    const bet = { winnerTeam: 'Alpecin-Premier Tech', gcTeam: 'Team Visma | Lease a Bike' };
    const res = { winnerTeam: 'ALPECIN PREMIER TECH', gcTeam: 'TEAM VISMA-LEASE A BIKE' };
    const { points, breakdown } = scoreStageBet(bet, res);
    expect(breakdown.winnerTeam).toBe(DEFAULT_POINTS.winnerTeam);
    expect(breakdown.gcTeam).toBe(DEFAULT_POINTS.gcTeam);
    expect(points).toBe(DEFAULT_POINTS.winnerTeam + DEFAULT_POINTS.gcTeam);
  });

  it('tolerant match gælder også podie-pladserne (2./3.)', () => {
    const res = { podium: { winnerTeam: ['UAE TEAM EMIRATES XRG', 'SOUDAL QUICK-STEP', 'COFIDIS'] } };
    const { breakdown } = scoreStageBet({ winnerTeam: 'Soudal Quick-Step' }, res);
    expect(breakdown.winnerTeam).toBe(3); // 2.-pladsen i standard-skalaen [5,3,1]
  });

  it('ALIAS-match: tip på "Netcompany Ineos" scorer mod facit "INEOS GRENADIERS"', () => {
    // Timing-leverandøren bruger holdets gamle navn i resultattabellerne —
    // et sponsorskifte må ALDRIG koste spillerne point.
    const res = { winnerTeam: 'INEOS GRENADIERS' };
    const { breakdown } = scoreStageBet({ winnerTeam: 'Netcompany Ineos' }, res);
    expect(breakdown.winnerTeam).toBe(DEFAULT_POINTS.winnerTeam);
  });
});

describe('activeQuestionsForStage', () => {
  it('giver type-standarden når der ikke er noget override', () => {
    expect(activeQuestionsForStage({ type: 'ttt' })).toEqual(QUESTION_DEFAULTS_BY_TYPE.ttt);
    expect(activeQuestionsForStage({ type: 'itt' })).toEqual(QUESTION_DEFAULTS_BY_TYPE.itt);
    expect(activeQuestionsForStage({ type: 'flat' })).toEqual(QUESTION_DEFAULTS_BY_TYPE.flat);
    expect(activeQuestionsForStage({ type: 'hilly' })).toEqual(QUESTION_DEFAULTS_BY_TYPE.hilly);
    expect(activeQuestionsForStage({ type: 'mountain' })).toEqual(QUESTION_DEFAULTS_BY_TYPE.mountain);
  });

  it('ttt har kun vinder-hold aktivt', () => {
    expect(activeQuestionsForStage({ type: 'ttt' })).toEqual({
      winnerTeam: true, gcTeam: false, mountainTeam: false, sprintTeam: false,
    });
  });

  it('ukendt/umappet type → alle fire aktive', () => {
    expect(activeQuestionsForStage({ type: 'unknown' })).toEqual({
      winnerTeam: true, gcTeam: true, mountainTeam: true, sprintTeam: true,
    });
    expect(activeQuestionsForStage({ type: 'sjov' })).toEqual({
      winnerTeam: true, gcTeam: true, mountainTeam: true, sprintTeam: true,
    });
    expect(activeQuestionsForStage({})).toEqual({
      winnerTeam: true, gcTeam: true, mountainTeam: true, sprintTeam: true,
    });
    expect(activeQuestionsForStage(undefined)).toEqual({
      winnerTeam: true, gcTeam: true, mountainTeam: true, sprintTeam: true,
    });
  });

  it('et eksplicit override (alle fire boolean) vinder over type-standarden', () => {
    const stage = {
      type: 'flat',
      questions: { winnerTeam: true, gcTeam: false, mountainTeam: true, sprintTeam: false },
    };
    expect(activeQuestionsForStage(stage)).toEqual(stage.questions);
  });

  it('ignorerer et ufuldstændigt questions-felt og falder tilbage til typen', () => {
    expect(activeQuestionsForStage({ type: 'ttt', questions: { winnerTeam: true } }))
      .toEqual(QUESTION_DEFAULTS_BY_TYPE.ttt);
  });
});

describe('stageTipComplete (komplet = alle aktive spørgsmål besvaret)', () => {
  it('holdtidskørsel: kun vinder-hold kræves', () => {
    expect(stageTipComplete({ type: 'ttt' }, { winnerTeam: 'UAD' })).toBe(true);
    expect(stageTipComplete({ type: 'ttt' }, {})).toBe(false);
  });
  it('flad etape: vinder + bedste hold + sprint kræves (ikke bjerg)', () => {
    const flat = { type: 'flat' };
    expect(stageTipComplete(flat, { winnerTeam: 'A', gcTeam: 'B', sprintTeam: 'C' })).toBe(true);
    expect(stageTipComplete(flat, { winnerTeam: 'A', gcTeam: 'B' })).toBe(false);
  });
  it('questions-override styrer hvad der kræves', () => {
    const stage = { type: 'mountain', questions: { winnerTeam: true, gcTeam: false, mountainTeam: false, sprintTeam: false } };
    expect(stageTipComplete(stage, { winnerTeam: 'A' })).toBe(true);
    expect(stageTipComplete(stage, {})).toBe(false);
  });
  it('intet tip → ikke komplet', () => {
    expect(stageTipComplete({ type: 'flat' }, null)).toBe(false);
  });
});

describe('scoreStageBet — kun aktive spørgsmål tæller', () => {
  const facit = { winnerTeam: 'UAD', gcTeam: 'SOQ', mountainTeam: 'COF', sprintTeam: 'SOQ' };

  it('scorer ikke et inaktivt spørgsmål, selv ved facit + rigtigt tip', () => {
    // ttt: kun winnerTeam aktiv. Spilleren ramte alle fire, men kun winnerTeam tæller.
    const { points, breakdown } = scoreStageBet(facit, facit, undefined, { type: 'ttt' });
    expect(points).toBe(DEFAULT_POINTS.winnerTeam);
    expect(breakdown).toEqual({ winnerTeam: 5 });
  });

  it('straffer kun for utippet blandt de aktive spørgsmål', () => {
    // Spilleren har kun tippet sprintTeam, men sprintTeam er IKKE aktiv (ttt) →
    // betragtes som helt utippet → straf.
    const bet = { sprintTeam: 'SOQ' };
    const { points, untipped } = scoreStageBet(bet, facit, { untippedPenalty: 2 }, { type: 'ttt' });
    expect(untipped).toBe(true);
    expect(points).toBe(-2);
  });

  it('ingen straf når et aktivt felt er tippet', () => {
    const bet = { winnerTeam: 'UAD' };
    const { points, untipped } = scoreStageBet(bet, facit, { untippedPenalty: 2 }, { type: 'ttt' });
    expect(untipped).toBe(false);
    expect(points).toBe(DEFAULT_POINTS.winnerTeam);
  });

  it('uændret opførsel når alle fire er aktive (intet stage-arg)', () => {
    expect(scoreStageBet(facit, facit).points).toBe(15);
  });

  it('accepterer både et active-objekt og en hel etape', () => {
    const active = { winnerTeam: true, gcTeam: false, mountainTeam: false, sprintTeam: false };
    expect(scoreStageBet(facit, facit, undefined, active).points).toBe(DEFAULT_POINTS.winnerTeam);
  });
});

describe('podie-point (src-spejl)', () => {
  const result = {
    winnerTeam: 'UAD',
    podium: { winnerTeam: ['UAD', 'VLA', 'SOQ'], gcTeam: [], mountainTeam: [], sprintTeam: [] },
  };
  const active = { winnerTeam: true, gcTeam: false, mountainTeam: false, sprintTeam: false };

  it('giver faldende point efter placering (5/3/1) og 0 udenfor top-3', () => {
    expect(scoreStageBet({ winnerTeam: 'UAD' }, result, undefined, active).points).toBe(5);
    expect(scoreStageBet({ winnerTeam: 'VLA' }, result, undefined, active).points).toBe(3);
    expect(scoreStageBet({ winnerTeam: 'SOQ' }, result, undefined, active).points).toBe(1);
    expect(scoreStageBet({ winnerTeam: 'COF' }, result, undefined, active).points).toBe(0);
  });

  it('respekterer admin-konfigureret skala', () => {
    const cfg = { winnerTeam: [10, 6, 2] };
    expect(scoreStageBet({ winnerTeam: 'VLA' }, result, cfg, active).points).toBe(6);
  });

  it('resolveStageResult udfylder podium med top-3 distinkte hold', () => {
    const order = (...teams) => teams.map((team, i) => ({ rider: `r${i}`, team, rank: i + 1 }));
    const res = resolveStageResult({ finishOrder: order('UAD', 'VLA', 'UAD', 'SOQ', 'COF') });
    expect(res.podium.winnerTeam).toEqual(['UAD', 'VLA', 'SOQ']);
  });
});
