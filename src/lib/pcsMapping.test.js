// Tests for PCS-proxy → scoring-broen. Bruger et realistisk payload-uddrag
// i samme form som tdf_results.scrape_stage producerer.
import { describe, it, expect } from 'vitest';
import {
  finishOrderFromPcs,
  pointsListFromPcs,
  deltaPointsList,
  pcsToStageInput,
  jerseyHolders,
  stageMetaFromPcs,
  classificationStandings,
  stageResultRows,
  needsPrevForPoints,
} from './pcsMapping.js';
import { resolveStageResult, scoreStageBet } from './tourScoring.js';

// Minimalt, men realistisk payload (felt-navne matcher useStageResults.ts).
const payloadN = {
  number: 2,
  meta: {
    date: '2026-07-05', departure: 'Lille', arrival: 'Boulogne',
    distance_km: 209, stage_type: 'Hilly', profile_icon: 'p2',
  },
  results_present: true,
  classifications: {
    etape: { label: 'Etaperesultat', jersey: '—', rows: [
      { rank: 1, rider_name: 'Tadej Pogačar', rider_url: 'rider/pog', team_name: 'UAE Team Emirates' },
      { rank: 2, rider_name: 'Jonas Vingegaard', rider_url: 'rider/vin', team_name: 'Visma | Lease a Bike' },
      { rank: 3, rider_name: 'João Almeida', rider_url: 'rider/alm', team_name: 'UAE Team Emirates' },
      { rank: 4, rider_name: 'Remco Evenepoel', rider_url: 'rider/eve', team_name: 'Soudal Quick-Step' },
    ] },
    samlet: { label: 'Samlet (GC)', jersey: 'gul', rows: [
      { rank: 1, rider_name: 'Tadej Pogačar', team_name: 'UAE Team Emirates', time: '0:00' },
    ] },
    sprint: { label: 'Sprint (point)', jersey: 'grøn', rows: [
      { rank: 1, rider_name: 'Jonas Vingegaard', rider_url: 'rider/vin', team_name: 'Visma | Lease a Bike', points: 30 },
      { rank: 2, rider_name: 'Tadej Pogačar', rider_url: 'rider/pog', team_name: 'UAE Team Emirates', points: 25 },
    ] },
    bjerg: { label: 'Bjerg (KOM)', jersey: 'prikket', rows: [
      { rank: 1, rider_name: 'Lenny Martinez', rider_url: 'rider/mar', team_name: 'Bahrain Victorious', points: 12 },
      { rank: 2, rider_name: 'Tadej Pogačar', rider_url: 'rider/pog', team_name: 'UAE Team Emirates', points: 8 },
    ] },
    ungdom: { label: 'Ungdom', jersey: 'hvid', rows: [
      { rank: 1, rider_name: 'Remco Evenepoel', team_name: 'Soudal Quick-Step' },
    ] },
    hold: { label: 'Holdkonkurrence', jersey: '—', rows: [
      { rank: 1, rider_name: 'UAE Team Emirates', team_name: 'UAE Team Emirates' },
    ] },
  },
};

describe('finishOrderFromPcs', () => {
  it('bevarer placeringsrækkefølge og hold', () => {
    const fo = finishOrderFromPcs(payloadN);
    expect(fo[0]).toEqual({ rider: 'Tadej Pogačar', team: 'UAE Team Emirates', rank: 1 });
    expect(fo).toHaveLength(4);
  });
  it('falder tilbage til index+1 hvis rank mangler', () => {
    const fo = finishOrderFromPcs({ classifications: { etape: { rows: [{ rider_name: 'X', team_name: 'T' }] } } });
    expect(fo[0].rank).toBe(1);
  });
});

describe('pointsListFromPcs (kumulativ)', () => {
  it('udtrækker hold + point og dropper rækker uden hold', () => {
    const list = pointsListFromPcs(payloadN, 'sprint');
    expect(list).toEqual([
      { rider: 'Jonas Vingegaard', team: 'Visma | Lease a Bike', points: 30 },
      { rider: 'Tadej Pogačar', team: 'UAE Team Emirates', points: 25 },
    ]);
  });
});

describe('deltaPointsList (ægte point på etapen)', () => {
  it('trækker forrige etapes kumulative point fra', () => {
    const prev = { classifications: { bjerg: { rows: [
      { rider_name: 'Lenny Martinez', rider_url: 'rider/mar', team_name: 'Bahrain Victorious', points: 5 },
    ] } } };
    const delta = deltaPointsList(payloadN, prev, 'bjerg');
    // Martinez: 12-5=7, Pogačar: 8-0=8 (ny i klassementet)
    expect(delta).toContainEqual({ rider: 'Lenny Martinez', team: 'Bahrain Victorious', points: 7 });
    expect(delta).toContainEqual({ rider: 'Tadej Pogačar', team: 'UAE Team Emirates', points: 8 });
  });
  it('etape 1 (intet forrige) = fulde point', () => {
    const delta = deltaPointsList(payloadN, {}, 'sprint');
    expect(delta).toContainEqual({ rider: 'Jonas Vingegaard', team: 'Visma | Lease a Bike', points: 30 });
  });
});

describe('pcsToStageInput → resolveStageResult (hele kæden)', () => {
  it('afgør Q1–Q4 korrekt fra et payload (kumulativ)', () => {
    const input = pcsToStageInput(payloadN, { gcTopN: 2 });
    const res = resolveStageResult(input);
    expect(res.winnerTeam).toBe('UAE Team Emirates'); // Q1: rytter nr.1
    // Q2 (N=2): UAE har nr.1+nr.3 = 4 og er eneste hold med 2 i mål → UAE
    expect(res.gcTeam).toBe('UAE Team Emirates');
    // Q3 bjerg kumulativ: Bahrain 12 > UAE 8 → Bahrain
    expect(res.mountainTeam).toBe('Bahrain Victorious');
    // Q4 sprint kumulativ: Visma 30 > UAE 25 → Visma
    expect(res.sprintTeam).toBe('Visma | Lease a Bike');
  });

  it('en spiller kan scores ende-til-ende mod payload-facit', () => {
    const facit = resolveStageResult(pcsToStageInput(payloadN, { gcTopN: 2 }));
    const bet = { winnerTeam: 'UAE Team Emirates', gcTeam: 'UAE Team Emirates', mountainTeam: 'Soudal Quick-Step', sprintTeam: 'Visma | Lease a Bike' };
    const { points } = scoreStageBet(bet, facit); // 5 + 4 + 0 + 3 = 12
    expect(points).toBe(12);
  });
});

describe('jerseyHolders & stageMetaFromPcs', () => {
  it('udtrækker de fire trøjer + holdfører', () => {
    expect(jerseyHolders(payloadN)).toEqual({
      yellow: 'Tadej Pogačar',
      green: 'Jonas Vingegaard',
      polka: 'Lenny Martinez',
      white: 'Remco Evenepoel',
      teamLead: 'UAE Team Emirates',
    });
  });
  it('udtrækker etape-metadata til seed', () => {
    expect(stageMetaFromPcs(payloadN)).toEqual({
      number: 2, date: '2026-07-05', startCity: 'Lille', finishCity: 'Boulogne',
      km: 209, type: 'Hilly', profileIcon: 'p2',
    });
  });
});

describe('classificationStandings & stageResultRows', () => {
  it('normaliserer alle fem konkurrencer med rank/rytter/hold/tid/point', () => {
    const s = classificationStandings(payloadN);
    expect(Object.keys(s)).toEqual(['samlet', 'sprint', 'bjerg', 'ungdom', 'hold']);
    expect(s.samlet[0]).toEqual({ rank: 1, rider: 'Tadej Pogačar', team: 'UAE Team Emirates', time: '0:00', points: null });
    expect(s.sprint).toHaveLength(2);
    expect(s.sprint[0]).toMatchObject({ rank: 1, rider: 'Jonas Vingegaard', points: 30, time: null });
    expect(s.hold[0]).toMatchObject({ rank: 1, team: 'UAE Team Emirates' });
  });

  it('respekterer topN', () => {
    expect(classificationStandings(payloadN, 1).sprint).toHaveLength(1);
  });

  it('stageResultRows giver målrækkefølgen', () => {
    const rows = stageResultRows(payloadN);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({ rank: 1, rider: 'Tadej Pogačar', team: 'UAE Team Emirates' });
  });

  it('tåler manglende klassementer', () => {
    const empty = classificationStandings({});
    expect(empty.samlet).toEqual([]);
    expect(stageResultRows({})).toEqual([]);
  });
});

// 2026-stakken: ipe/ime mangler — kun de KUMULATIVE ipg/img findes
// (sprintKlass/bjergKlass). Spejl af functions/pcsMapping.test.js-blokken.
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

  it('needsPrevForPoints kun for etape 2+ uden per-etape-lister', () => {
    expect(needsPrevForPoints(cur)).toBe(true);
    expect(needsPrevForPoints(prev)).toBe(false);
    expect(needsPrevForPoints(payloadN)).toBe(false);
  });

  it('Q3/Q4 = delta af kumulativ (etape 2 minus etape 1)', () => {
    const input = pcsToStageInput(cur, { gcTopN: 2, prevCumulative: prev });
    expect(input.sprintPoints).toContainEqual({ rider: 'Philipsen', team: 'Alpecin', points: 22 });
    expect(input.sprintPoints).toContainEqual({ rider: 'Girmay', team: 'Intermarché', points: 5 });
    expect(input.mountainPoints).toEqual([]); // uændret kumulativt → intet bjergfacit
  });

  it('jerseyHolders + classificationStandings foretrækker kumulativ', () => {
    expect(jerseyHolders(cur).green).toBe('Girmay');
    const s = classificationStandings(cur);
    expect(s.sprint[0]).toMatchObject({ rider: 'Girmay', points: 25 });
    expect(s.bjerg[0]).toMatchObject({ rider: 'Martinez', points: 5 });
  });
});
