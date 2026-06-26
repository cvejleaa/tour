import { describe, it, expect } from 'vitest';
import {
  computeMatchStats, topScorersOfDay, maxPointsForMatch,
  computeSeasonOverview, computePlayerAccuracy, mostSurprising, bestPredicted,
  computeDiscipline,
  computeGoalsByInterval, computeTournamentFacts, computeSecondHalfStats,
  computeFieryMatches, computeRefereeStats, pointsByUidForMatches,
} from './statsUtils';
import { POINTS } from '../../lib/scoring';

const groupMatch = { round: 'group', result: { home: 2, away: 1 } };

describe('computeMatchStats', () => {
  it('returnerer nuller uden tips', () => {
    const s = computeMatchStats(groupMatch, []);
    expect(s).toMatchObject({ total: 0, exact: 0, correctOutcome: 0, avgPoints: 0, popular: null });
    expect(s.exactUids).toEqual([]);
  });

  it('returnerer nuller hvis kampen ikke har resultat', () => {
    const s = computeMatchStats({ round: 'group', result: null }, [{ uid: 'a', home: 1, away: 0 }]);
    expect(s.total).toBe(1);
    expect(s.exact).toBe(0);
  });

  it('tæller eksakt, udfald, gennemsnit og populært tip', () => {
    const bets = [
      { uid: 'a', home: 2, away: 1 }, // eksakt (5)
      { uid: 'b', home: 3, away: 1 }, // udfald, ikke eksakt (2)  [3-1 forskel 2 != 1]
      { uid: 'c', home: 2, away: 1 }, // eksakt (5)
      { uid: 'd', home: 0, away: 2 }, // forkert (0)
    ];
    const s = computeMatchStats(groupMatch, bets);
    expect(s.total).toBe(4);
    expect(s.exact).toBe(2);
    expect(s.exactPct).toBe(50);
    expect(s.correctOutcome).toBe(3); // a,b,c gættede hjemmesejr
    expect(s.outcomePct).toBe(75);
    expect(s.exactUids).toEqual(['a', 'c']);
    // point: 5+2+5+0 = 12 / 4 = 3
    expect(s.avgPoints).toBe(3);
    // populært tip: 2-1 (2 gange)
    expect(s.popular).toEqual({ home: 2, away: 1, count: 2 });
  });

  it('håndterer knockout med advance-bonus', () => {
    const ko = { round: 'r16', result: { home: 1, away: 1, advance: 'BRA' } };
    const bets = [{ uid: 'a', home: 1, away: 1, advance: 'BRA' }]; // 5 + 2 = 7
    const s = computeMatchStats(ko, bets);
    expect(s.avgPoints).toBe(POINTS.EXACT + POINTS.KNOCKOUT_ADVANCE);
  });
});

describe('topScorersOfDay', () => {
  const users = { a: { displayName: 'Anna' }, b: { displayName: 'Bo' }, c: { displayName: 'Cleo' } };
  it('sorterer efter point faldende og filtrerer 0', () => {
    const top = topScorersOfDay({ a: 5, b: 8, c: 0 }, users);
    expect(top.map((t) => t.name)).toEqual(['Bo', 'Anna']);
  });
  it('respekterer limit', () => {
    const top = topScorersOfDay({ a: 5, b: 8, c: 3 }, users, 2);
    expect(top).toHaveLength(2);
  });
  it('håndterer tomt input', () => {
    expect(topScorersOfDay({}, users)).toEqual([]);
    expect(topScorersOfDay(undefined, undefined)).toEqual([]);
  });
});

describe('maxPointsForMatch', () => {
  it('gruppekamp = 5', () => {
    expect(maxPointsForMatch({ round: 'group' })).toBe(POINTS.EXACT);
  });
  it('knockout = 5 + advance-bonus', () => {
    expect(maxPointsForMatch({ round: 'final' })).toBe(POINTS.EXACT + POINTS.KNOCKOUT_ADVANCE);
  });
});

// ─── Sæson-statistik ────────────────────────────────────────────────────────
const seasonMatches = [
  { id: 'm1', round: 'group', result: { home: 2, away: 1 } },
  { id: 'm2', round: 'group', result: { home: 0, away: 0 } },
  { id: 'm3', round: 'group', result: null }, // ikke afgjort → ignoreres
];
const seasonBets = new Map([
  ['m1', [
    { uid: 'a', home: 2, away: 1 }, // eksakt (5)
    { uid: 'b', home: 1, away: 0 }, // hjemmesejr, samme målforskel +1 (3)
    { uid: 'c', home: 0, away: 1 }, // forkert (0)
  ]],
  ['m2', [
    { uid: 'a', home: 0, away: 0 }, // eksakt (5)
    { uid: 'b', home: 1, away: 1 }, // uafgjort, samme målforskel 0 (3)
  ]],
]);
const usersById = { a: { displayName: 'Anna' }, b: { displayName: 'Bo' }, c: { displayName: 'Cleo' } };

describe('computeSeasonOverview', () => {
  it('summerer på tværs af afsluttede kampe (ignorerer uafgjorte)', () => {
    const o = computeSeasonOverview(seasonMatches, seasonBets);
    expect(o.matches).toBe(2);
    expect(o.tips).toBe(5);
    expect(o.exact).toBe(2);          // a på m1 + a på m2
    expect(o.correctOutcome).toBe(4); // a,b på m1 + a,b på m2
    expect(o.totalPoints).toBe(5 + 3 + 0 + 5 + 3); // 16
  });
  it('returnerer nuller uden kampe', () => {
    expect(computeSeasonOverview([], new Map())).toMatchObject({ matches: 0, tips: 0, totalPoints: 0 });
  });
});

describe('computePlayerAccuracy', () => {
  it('aggregerer pr. spiller og sorterer efter point', () => {
    const rows = computePlayerAccuracy(seasonMatches, seasonBets, usersById);
    expect(rows[0].name).toBe('Anna');
    expect(rows[0].points).toBe(10); // 5 + 5
    expect(rows[0].exact).toBe(2);
    expect(rows[0].tips).toBe(2);
    expect(rows[0].exactPct).toBe(100);
    const bo = rows.find((r) => r.uid === 'b');
    expect(bo.points).toBe(6); // 3 + 3
    expect(bo.correctOutcome).toBe(2);
  });
});

describe('mostSurprising / bestPredicted', () => {
  it('mest overraskende = lavest udfalds-procent (min tips)', () => {
    const s = mostSurprising(seasonMatches, seasonBets, 2);
    // m1: udfald 2/3=67%, m2: 2/2=100% → m1 mest overraskende
    expect(s.match.id).toBe('m1');
  });
  it('bedst forudsagt = højest eksakt-procent', () => {
    const b = bestPredicted(seasonMatches, seasonBets, 2);
    // m1 eksakt 1/3=33%, m2 eksakt 1/2=50% → m2
    expect(b.match.id).toBe('m2');
  });
  it('returnerer null hvis ingen kamp har nok tips', () => {
    expect(mostSurprising(seasonMatches, seasonBets, 99)).toBeNull();
    expect(bestPredicted(seasonMatches, seasonBets, 99)).toBeNull();
  });
});

describe('computeDiscipline', () => {
  const matches = [
    { homeTeam: 'BRA', awayTeam: 'ARG', details: { bookings: [
      { side: 'home', player: 'A', card: 'YELLOW' },
      { side: 'away', player: 'B', card: 'RED' },
      { side: 'home', player: 'A', card: 'YELLOW' },
    ] } },
    { homeTeam: 'BRA', awayTeam: 'FRA', details: { bookings: [
      { side: 'away', player: 'C', card: 'YELLOW_RED' },
    ] } },
    { homeTeam: 'DEN', awayTeam: 'ENG' }, // ingen details
  ];

  it('aggregerer kort pr. hold og spiller', () => {
    const { teams, players, totals } = computeDiscipline(matches);
    expect(totals).toEqual({ yellow: 2, red: 2 });
    // ARG har et rødt (vægter tungest) → øverst
    expect(teams[0]).toMatchObject({ code: 'ARG', red: 1 });
    // Spiller A har 2 gule
    const a = players.find((p) => p.name === 'A');
    expect(a).toMatchObject({ name: 'A', team: 'BRA', yellow: 2, red: 0 });
    // YELLOW_RED tæller som rødt
    const c = players.find((p) => p.name === 'C');
    expect(c).toMatchObject({ red: 1 });
  });

  it('håndterer tomt input', () => {
    expect(computeDiscipline([])).toEqual({ teams: [], players: [], totals: { yellow: 0, red: 0 }, allTeams: [] });
    expect(computeDiscipline(null).totals).toEqual({ yellow: 0, red: 0 });
  });

  it('allTeams indeholder ALLE deltagende nationer — også dem med 0 kort', () => {
    const { allTeams } = computeDiscipline(matches);
    const codes = allTeams.map((t) => t.code);
    // Kun gyldige landekoder (i TEAMS) fra kampene: BRA, ARG, FRA, ENG.
    expect(new Set(codes)).toEqual(new Set(['BRA', 'ARG', 'FRA', 'ENG']));
    // ENG spillede uden kort → 0/0, men er stadig med
    const eng = allTeams.find((t) => t.code === 'ENG');
    expect(eng).toMatchObject({ code: 'ENG', yellow: 0, red: 0 });
    // ARG (rødt kort) ligger før de kortløse nationer
    expect(codes.indexOf('ARG')).toBeLessThan(codes.indexOf('ENG'));
  });
});

// ─── Turnerings-fakta ───────────────────────────────────────────────────────

const g = (minute, side, type = 'REGULAR', injuryTime = 0) => ({ minute, side, type, injuryTime });

describe('computeGoalsByInterval', () => {
  it('fordeler mål på de rigtige intervaller', () => {
    const matches = [{ id: 'm', homeTeam: 'A', awayTeam: 'B', details: { goals: [
      g(3, 'home'), g(15, 'away'), g(45, 'home', 'REGULAR', 2), g(60, 'away'),
      g(90, 'home', 'REGULAR', 4), g(105, 'away'),
    ] } }];
    const { bins, total, peak } = computeGoalsByInterval(matches);
    const by = Object.fromEntries(bins.map((b) => [b.label, b.count]));
    expect(total).toBe(6);
    expect(by['0-15']).toBe(2);   // 3' og 15'
    expect(by['45+']).toBe(1);    // 45+2
    expect(by['46-60']).toBe(1);  // 60'
    expect(by['90+']).toBe(2);    // 90+4 og 105'
    expect(peak.count).toBe(2);
  });

  it('håndterer tomt input', () => {
    expect(computeGoalsByInterval([])).toMatchObject({ total: 0, peak: null });
  });
});

describe('computeTournamentFacts', () => {
  const matches = [
    { id: '1', homeTeam: 'BRA', awayTeam: 'ARG', result: { home: 2, away: 1 },
      details: { goals: [g(10, 'home'), g(20, 'away', 'PENALTY'), g(80, 'home', 'OWN')] } },
    { id: '2', homeTeam: 'GER', awayTeam: 'ESP', result: { home: 1, away: 2 },
      details: { goals: [g(5, 'away')] } },
  ];
  it('beregner mål/kamp, hjemme/ude og mål-typer', () => {
    const f = computeTournamentFacts(matches);
    expect(f.played).toBe(2);
    expect(f.totalGoals).toBe(6);
    expect(f.goalsPerMatch).toBe(3);
    expect(f.homeGoals).toBe(3);
    expect(f.awayGoals).toBe(3);
    expect(f.typeBreakdown).toEqual({ regular: 2, penalty: 1, own: 1 });
  });
  it('finder hyppigste resultat (rækkefølge-uafhængigt) samt tidligste/seneste mål', () => {
    const f = computeTournamentFacts(matches);
    // 2-1 og 2-1 (1-2 normaliseres) → "2-1" set 2 gange.
    expect(f.frequentResults[0]).toEqual({ score: '2-1', count: 2 });
    expect(f.earliest.minute).toBe(5);
    expect(f.latest.minute).toBe(80);
  });
});

describe('computeSecondHalfStats', () => {
  const matches = [
    // Comeback: ude førte 0-1 ved pausen, hjemme vandt 2-1.
    { id: '1', homeTeam: 'BRA', awayTeam: 'ARG', result: { home: 2, away: 1 },
      details: { halfTime: { home: 0, away: 1 } } },
    // Uændret: hjemme førte hele vejen.
    { id: '2', homeTeam: 'GER', awayTeam: 'ESP', result: { home: 3, away: 0 },
      details: { halfTime: { home: 1, away: 0 } } },
  ];
  it('tæller ændringer efter pausen, comebacks og clean sheets', () => {
    const s = computeSecondHalfStats(matches);
    expect(s.withHalfTime).toBe(2);
    expect(s.changedAfterHalf).toBe(1);
    expect(s.comebacks).toHaveLength(1);
    expect(s.comebacks[0].team).toBe('BRA');
    // Clean sheets: GER holdt nullet (ESP scorede 0).
    expect(s.cleanSheets[0]).toEqual({ team: 'GER', count: 1 });
  });
});

describe('computeFieryMatches & computeRefereeStats', () => {
  const matches = [
    { id: '1', homeTeam: 'BRA', awayTeam: 'ARG', details: { referee: 'Dommer A', bookings: [
      { side: 'home', card: 'YELLOW' }, { side: 'away', card: 'RED' },
    ] } },
    { id: '2', homeTeam: 'GER', awayTeam: 'ESP', details: { referee: 'Dommer A', bookings: [
      { side: 'home', card: 'YELLOW' },
    ] } },
  ];
  it('rangerer hidsigste kampe (rødt vægter dobbelt)', () => {
    const fiery = computeFieryMatches(matches);
    expect(fiery[0].match.id).toBe('1');
    expect(fiery[0]).toMatchObject({ yellow: 1, red: 1, weight: 3 });
  });
  it('samler dommerstatistik', () => {
    const refs = computeRefereeStats(matches);
    expect(refs[0]).toMatchObject({ name: 'Dommer A', matches: 2, yellow: 2, red: 1 });
  });
});

describe('pointsByUidForMatches', () => {
  it('summerer point pr. spiller for afsluttede kampe', () => {
    const matches = [
      { id: '1', round: 'group', result: { home: 2, away: 1 } },
      { id: '2', round: 'group', result: { home: 0, away: 0 } },
      { id: '3', round: 'group', result: null }, // ikke afsluttet → ignoreres
    ];
    const bets = new Map([
      ['1', [{ uid: 'u1', home: 2, away: 1 }, { uid: 'u2', home: 1, away: 0 }]],
      ['2', [{ uid: 'u1', home: 0, away: 0 }]],
      ['3', [{ uid: 'u1', home: 3, away: 3 }]],
    ]);
    const pts = pointsByUidForMatches(matches, bets);
    // u1 rammer eksakt i kamp 1 og 2; u2 rammer udfald i kamp 1.
    expect(pts.u1).toBeGreaterThan(pts.u2);
    expect(pts.u2).toBeGreaterThan(0);
  });

  it('håndterer tomt input', () => {
    expect(pointsByUidForMatches([], new Map())).toEqual({});
  });
});
