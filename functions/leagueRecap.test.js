import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  leagueTotal, leagueStagePoints, historicalMembers, windowDayPoints,
  buildRecapFacts, RECAP_SYSTEM, parseHM, recapWindowOpen,
} = require('./leagueRecap');

// Afgjorte etaper (id, kickoff-tidspunkt) + rå tip-point pr. etape pr. spiller.
const FIN = [
  { id: 's1', kickoffMs: 100 },
  { id: 's2', kickoffMs: 200 },
  { id: 's3', kickoffMs: 300 },
];
const PTS = { s1: { a: 5, b: 2 }, s2: { a: 3, b: 0 }, s3: { a: 0, b: 4 } };

describe('historicalMembers', () => {
  it('summerer kun etaper afgjort til og med untilMs som etape-point', () => {
    const out = historicalMembers([{ id: 'a', displayName: 'A' }, { id: 'b', displayName: 'B' }], FIN, PTS, 250);
    // s1 (100) + s2 (200) tæller, s3 (300) ikke.
    expect(out[0]).toEqual({ id: 'a', displayName: 'A', stagePoints: 8, bonusPoints: 0 });
    expect(out[1]).toEqual({ id: 'b', displayName: 'B', stagePoints: 2, bonusPoints: 0 });
  });
});

describe('windowDayPoints', () => {
  it('påfører ligaens scoring på vinduets etaper', () => {
    expect(windowDayPoints(['a', 'b'], [FIN[2]], PTS, { stage: true })).toEqual({ b: 4 });
    expect(windowDayPoints(['a', 'b'], [FIN[1]], PTS, { stage: true })).toEqual({ a: 3 });
    expect(windowDayPoints(['a', 'b'], [FIN[2]], PTS, { stage: false })).toEqual({});
  });
});

describe('leagueTotal', () => {
  const u = { stagePoints: 10, bonusPoints: 6 };
  it('summerer etape + bonus når alt tæller', () => {
    expect(leagueTotal(u, { stage: true, bonus: true })).toBe(16);
  });
  it('default (tomt scoring) tæller alt', () => {
    expect(leagueTotal(u, {})).toBe(16);
  });
  it('respekterer fravalg af bonus', () => {
    expect(leagueTotal(u, { stage: true, bonus: false })).toBe(10);
  });
  it('respekterer fravalg af etape-point', () => {
    expect(leagueTotal(u, { stage: false, bonus: true })).toBe(6);
  });
});

describe('leagueStagePoints', () => {
  it('tæller etapens point når etape-point er slået til (og default)', () => {
    expect(leagueStagePoints(5, { stage: true })).toBe(5);
    expect(leagueStagePoints(5, {})).toBe(5);
  });
  it('giver 0 når etape-point er fravalgt', () => {
    expect(leagueStagePoints(5, { stage: false })).toBe(0);
  });
});

describe('buildRecapFacts', () => {
  const members = [
    { id: 'a', displayName: 'Anders', stagePoints: 20, bonusPoints: 0 },
    { id: 'b', displayName: 'Bente', stagePoints: 12, bonusPoints: 0 },
    { id: 'c', displayName: 'Carl', stagePoints: 8, bonusPoints: 0 },
  ];
  const now = new Date('2026-07-13T05:00:00Z');

  it('sorterer stilling, finder dagens point og standout (med total + placering)', () => {
    const f = buildRecapFacts({
      league: { name: 'Vennerne', scoring: { stage: true } },
      members,
      dayPointsByUid: { a: 2, b: 7, c: 0 },
      stages: [{ number: 7, winnerTeam: 'UAE' }],
      upcoming: [{ number: 8, type: 'bjerg', time: '13:00' }],
      now,
    });
    expect(f.leagueName).toBe('Vennerne');
    // standings: points = total NU, dayPoints = vundet siden sidst.
    expect(f.standings[0]).toMatchObject({ rank: 1, name: 'Anders', points: 20, dayPoints: 2 });
    expect(f.standings[1]).toMatchObject({ rank: 2, name: 'Bente', points: 12, dayPoints: 7 });
    expect(f.dayPoints).toEqual([{ name: 'Bente', dayPoints: 7 }, { name: 'Anders', dayPoints: 2 }]);
    // standout: nattens bedste med BÅDE nattens point og nuværende total + placering.
    expect(f.standout).toEqual({ name: 'Bente', dayPoints: 7, points: 12, rank: 2 });
    // Én klar dagsvinder → ikke uafgjort (drillende tone tilladt).
    expect(f.standoutTie).toBe(false);
    expect(f.dayWinners).toEqual(['Bente']);
    expect(f.stages).toHaveLength(1);
    expect(f.stages[0]).toMatchObject({ number: 7, winnerTeam: 'UAE' });
    expect(f.memberCount).toBe(3);
  });

  it('markerer uafgjort dagsvinder (standoutTie) når to deler nattens topscore', () => {
    const f = buildRecapFacts({
      league: { scoring: { stage: true } }, members,
      dayPointsByUid: { a: 7, b: 7, c: 0 }, stages: [], upcoming: [], now,
    });
    expect(f.standoutTie).toBe(true);
    expect(f.dayWinners).toEqual(['Anders', 'Bente']);
  });

  it('totalen = forrige total + dayPoints (tal stemmer hele vejen)', () => {
    const f = buildRecapFacts({ league: { name: 'V', scoring: { stage: true } }, members, dayPointsByUid: { a: 2, b: 7, c: 0 }, stages: [], upcoming: [], now });
    for (const row of f.standings) {
      const prev = row.points - row.dayPoints; // forrige total
      expect(prev).toBeGreaterThanOrEqual(0);
      expect(row.points).toBe(prev + row.dayPoints);
    }
  });

  it('inkluderer bonusResolved i fakta (default tom, generisk label + facit)', () => {
    const f = buildRecapFacts({ league: { scoring: { stage: true } }, members, dayPointsByUid: {}, stages: [], now });
    expect(f.bonusResolved).toEqual([]);

    const bonus = [{ label: 'Hvem vinder den samlede klassement?', facit: 'UAE' }];
    const f2 = buildRecapFacts({
      league: { scoring: { stage: true } }, members,
      dayPointsByUid: { a: 5 }, stages: [], bonusResolved: bonus, now,
    });
    expect(f2.bonusResolved).toEqual(bonus);
  });

  it('markerer ikke førerskifte når lederen er den samme (leadChanged=false)', () => {
    const f = buildRecapFacts({ league: { scoring: { stage: true } }, members, dayPointsByUid: { a: 2, b: 7, c: 0 }, stages: [], upcoming: [], now });
    expect(f.leader).toMatchObject({ name: 'Anders', points: 20 });
    expect(f.previousLeader).toBe('Anders');
    expect(f.leadChanged).toBe(false);
  });

  it('markerer førerskifte når nattens point ændrer førstepladsen (leadChanged=true)', () => {
    // Før i nat: Anders 19, Bente 17 → Anders førte. Efter: Bente 22 > Anders 20.
    const m = [
      { id: 'a', displayName: 'Anders', stagePoints: 20, bonusPoints: 0 },
      { id: 'b', displayName: 'Bente', stagePoints: 22, bonusPoints: 0 },
    ];
    const f = buildRecapFacts({ league: { scoring: { stage: true } }, members: m, dayPointsByUid: { a: 1, b: 5 }, stages: [], upcoming: [], now });
    expect(f.leader).toMatchObject({ name: 'Bente', points: 22 });
    expect(f.previousLeader).toBe('Anders');
    expect(f.leadChanged).toBe(true);
  });

  it('stille dag: ingen etaper → tom stages/dayPoints, standout null, intet førerskifte', () => {
    const f = buildRecapFacts({ league: { name: 'X' }, members, dayPointsByUid: {}, stages: [], upcoming: [], now });
    expect(f.stages).toEqual([]);
    expect(f.dayPoints).toEqual([]);
    expect(f.standout).toBeNull();
    expect(f.leadChanged).toBe(false);
  });

  it('system-prompten instruerer om dansk prosa og kun-fakta', () => {
    expect(RECAP_SYSTEM).toMatch(/dansk/i);
    expect(RECAP_SYSTEM).toMatch(/ALDRIG/);
  });
});

describe('parseHM', () => {
  it('parser gyldige tidspunkter til minutter', () => {
    expect(parseHM('00:00')).toBe(0);
    expect(parseHM('08:15')).toBe(495);
    expect(parseHM('23:59')).toBe(1439);
    expect(parseHM(' 9:05 ')).toBe(545);
  });
  it('returnerer null for ugyldigt', () => {
    expect(parseHM('24:00')).toBeNull();
    expect(parseHM('08:60')).toBeNull();
    expect(parseHM('otte')).toBeNull();
    expect(parseHM('')).toBeNull();
    expect(parseHM(null)).toBeNull();
  });
});

describe('recapWindowOpen', () => {
  it('er åbent fra target og en time frem', () => {
    expect(recapWindowOpen('08:15', '08:15', 60)).toBe(true);
    expect(recapWindowOpen('08:40', '08:15', 60)).toBe(true);
    expect(recapWindowOpen('09:14', '08:15', 60)).toBe(true);
  });
  it('er lukket før target og efter vinduet', () => {
    expect(recapWindowOpen('08:10', '08:15', 60)).toBe(false);
    expect(recapWindowOpen('09:15', '08:15', 60)).toBe(false);
    expect(recapWindowOpen('07:00', '08:15', 60)).toBe(false);
  });
  it('respekterer et kortere vindue', () => {
    expect(recapWindowOpen('08:20', '08:15', 5)).toBe(false);
    expect(recapWindowOpen('08:19', '08:15', 5)).toBe(true);
  });
  it('er lukket ved ugyldige tider', () => {
    expect(recapWindowOpen('xx:yy', '08:15', 60)).toBe(false);
    expect(recapWindowOpen('08:15', 'nope', 60)).toBe(false);
  });
});
