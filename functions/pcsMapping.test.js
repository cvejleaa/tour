// functions/pcsMapping.test.js — verificerer PCS-broen (CommonJS-udgave).
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  finishOrderFromPcs, deltaPointsList, pcsToStageInput, jerseyHolders, stageMetaFromPcs,
  classificationStandings, stageResultRows, needsPrevForPoints,
} = require('./pcsMapping.js');
const { resolveStageResult, scoreStageBet } = require('./tourScoring.js');

const payloadN = {
  number: 2,
  meta: { date: '2026-07-05', departure: 'Lille', arrival: 'Boulogne', distance_km: 209, stage_type: 'Hilly', profile_icon: 'p2' },
  results_present: true,
  classifications: {
    etape: { rows: [
      { rank: 1, rider_name: 'Pogačar', rider_url: 'r/pog', team_name: 'UAE' },
      { rank: 2, rider_name: 'Vingegaard', rider_url: 'r/vin', team_name: 'Visma' },
      { rank: 3, rider_name: 'Almeida', rider_url: 'r/alm', team_name: 'UAE' },
      { rank: 4, rider_name: 'Evenepoel', rider_url: 'r/eve', team_name: 'Soudal' },
    ] },
    samlet: { rows: [{ rank: 1, rider_name: 'Pogačar', team_name: 'UAE' }] },
    sprint: { rows: [
      { rank: 1, rider_name: 'Vingegaard', rider_url: 'r/vin', team_name: 'Visma', points: 30 },
      { rank: 2, rider_name: 'Pogačar', rider_url: 'r/pog', team_name: 'UAE', points: 25 },
    ] },
    bjerg: { rows: [
      { rank: 1, rider_name: 'Martinez', rider_url: 'r/mar', team_name: 'Bahrain', points: 12 },
    ] },
    ungdom: { rows: [{ rank: 1, rider_name: 'Evenepoel', team_name: 'Soudal' }] },
    hold: { rows: [{ rank: 1, rider_name: 'UAE', team_name: 'UAE' }] },
  },
};

describe('finishOrderFromPcs', () => {
  it('bevarer rækkefølge + hold', () => {
    expect(finishOrderFromPcs(payloadN)[0]).toEqual({ rider: 'Pogačar', team: 'UAE', rank: 1 });
  });
});

describe('deltaPointsList (ægte point på etapen)', () => {
  it('trækker forrige etapes point fra', () => {
    const prev = { classifications: { sprint: { rows: [
      { rider_name: 'Vingegaard', rider_url: 'r/vin', team_name: 'Visma', points: 12 },
    ] } } };
    const delta = deltaPointsList(payloadN, prev, 'sprint');
    expect(delta).toContainEqual({ rider: 'Vingegaard', team: 'Visma', points: 18 }); // 30-12
    expect(delta).toContainEqual({ rider: 'Pogačar', team: 'UAE', points: 25 }); // ny
  });
});

describe('hele kæden payload → resultat → score (med delta)', () => {
  it('afgør Q1–Q4 og scorer en spiller', () => {
    const input = pcsToStageInput(payloadN, { gcTopN: 2, prevPayload: {} });
    const res = resolveStageResult(input);
    expect(res.winnerTeam).toBe('UAE');
    // N=2: UAE har nr.1+nr.3 = 4 og er eneste hold med 2 i mål → UAE.
    expect(res.gcTeam).toBe('UAE');
    expect(res.podium.gcTeam).toEqual(['UAE']);
    expect(res.mountainTeam).toBe('Bahrain');
    expect(res.sprintTeam).toBe('Visma'); // delta=fuld (intet forrige): Visma 30 > UAE 25
    const bet = { winnerTeam: 'UAE', gcTeam: 'UAE', mountainTeam: 'Bahrain', sprintTeam: 'Visma' };
    // vinder UAE 1.(5) + bedste hold UAE 1.(4) + bjerg Bahrain 1.(3) + sprint Visma 1.(3) = 15
    expect(scoreStageBet(bet, res).points).toBe(5 + 4 + 3 + 3);
  });
});

describe('jerseyHolders & stageMetaFromPcs', () => {
  it('trøjer', () => {
    expect(jerseyHolders(payloadN)).toEqual({
      yellow: 'Pogačar', green: 'Vingegaard', polka: 'Martinez', white: 'Evenepoel', teamLead: 'UAE',
    });
  });
  it('metadata', () => {
    expect(stageMetaFromPcs(payloadN)).toEqual({
      number: 2, date: '2026-07-05', startCity: 'Lille', finishCity: 'Boulogne', km: 209, type: 'Hilly', profileIcon: 'p2',
    });
  });
});

// 2026-stakken: ipe/ime mangler — kun de KUMULATIVE ipg/img findes.
const payloadCum = (n, sprintRows, bjergRows) => ({
  number: n,
  results_present: true,
  classifications: {
    etape: { rows: [{ rank: 1, rider_name: 'Pogačar', team_name: 'UAE' }] },
    samlet: { rows: [{ rank: 1, rider_name: 'Pogačar', team_name: 'UAE' }] },
    sprint: { rows: [] },
    bjerg: { rows: [] },
    ungdom: { rows: [] },
    hold: { rows: [] },
    sprintKlass: { rows: sprintRows },
    bjergKlass: { rows: bjergRows },
  },
});

describe('kumulative klassementer (2026: ipe/ime mangler)', () => {
  const prev = payloadCum(1,
    [{ rank: 1, rider_name: 'Girmay', rider_url: 'r/gir', team_name: 'Intermarché', points: 20 }],
    [{ rank: 1, rider_name: 'Martinez', rider_url: 'r/mar', team_name: 'Bahrain', points: 5 }]);
  const cur = payloadCum(2,
    [
      { rank: 1, rider_name: 'Girmay', rider_url: 'r/gir', team_name: 'Intermarché', points: 25 },
      { rank: 2, rider_name: 'Philipsen', rider_url: 'r/phi', team_name: 'Alpecin', points: 22 },
    ],
    [{ rank: 1, rider_name: 'Martinez', rider_url: 'r/mar', team_name: 'Bahrain', points: 5 }]);

  it('needsPrevForPoints: true for etape 2+ uden per-etape-lister, false ellers', () => {
    expect(needsPrevForPoints(cur)).toBe(true);
    expect(needsPrevForPoints(prev)).toBe(false); // etape 1 behøver ingen forrige
    expect(needsPrevForPoints(payloadN)).toBe(false); // per-etape-lister findes
  });

  it('Q3/Q4 = delta af kumulativ (etape 2 minus etape 1)', () => {
    const input = pcsToStageInput(cur, { gcTopN: 2, prevCumulative: prev });
    // Girmay 25-20=5, Philipsen 22-0=22 → Alpecin vandt sprinterpointene på etapen.
    expect(input.sprintPoints).toContainEqual({ rider: 'Philipsen', team: 'Alpecin', points: 22 });
    expect(input.sprintPoints).toContainEqual({ rider: 'Girmay', team: 'Intermarché', points: 5 });
    // Bjerg uændret kumulativt → ingen bjergpoint på etapen (facit null, ikke forkert hold).
    expect(input.mountainPoints).toEqual([]);
  });

  it('etape 1: delta mod ingenting = den kumulative liste', () => {
    const input = pcsToStageInput(prev, { gcTopN: 2 });
    expect(input.sprintPoints).toEqual([{ rider: 'Girmay', team: 'Intermarché', points: 20 }]);
  });

  it('jerseyHolders foretrækker kumulativ klassement-fører', () => {
    const j = jerseyHolders(cur);
    expect(j.green).toBe('Girmay'); // kumulativ fører, IKKE etapens bedste
    expect(j.polka).toBe('Martinez');
  });

  it('classificationStandings viser kumulativ stilling for sprint/bjerg', () => {
    const s = classificationStandings(cur);
    expect(s.sprint[0]).toMatchObject({ rider: 'Girmay', points: 25 });
    expect(s.bjerg[0]).toMatchObject({ rider: 'Martinez', points: 5 });
  });
});

describe('classificationStandings & stageResultRows', () => {
  it('normaliserer alle fem konkurrencer', () => {
    const s = classificationStandings(payloadN);
    expect(Object.keys(s)).toEqual(['samlet', 'sprint', 'bjerg', 'ungdom', 'hold']);
    expect(s.samlet[0]).toEqual({ rank: 1, rider: 'Pogačar', team: 'UAE', time: null, points: null });
    expect(s.sprint[0]).toMatchObject({ rank: 1, rider: 'Vingegaard', points: 30 });
    expect(s.hold[0]).toMatchObject({ rank: 1, team: 'UAE' });
  });
  it('stageResultRows + topN + tomt', () => {
    expect(stageResultRows(payloadN)).toHaveLength(4);
    expect(classificationStandings(payloadN, 1).sprint).toHaveLength(1);
    expect(classificationStandings({}).samlet).toEqual([]);
  });
});
