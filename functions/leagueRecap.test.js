import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  leagueTotal, leagueMatchPoints, historicalMembers, windowDayPoints,
  buildRecapFacts, RECAP_SYSTEM, parseHM, recapWindowOpen,
} = require('./leagueRecap');

const FIN = [
  { id: 'm1', round: 'group', kickoffMs: 100 },
  { id: 'm2', round: 'r16', kickoffMs: 200 },
  { id: 'm3', round: 'group', kickoffMs: 300 },
];
const PTS = { m1: { a: 5, b: 2 }, m2: { a: 3, b: 0 }, m3: { a: 0, b: 4 } };

describe('historicalMembers', () => {
  it('summerer kun kampe spillet til og med untilMs, opdelt på gruppe/knockout', () => {
    const out = historicalMembers([{ id: 'a', displayName: 'A' }, { id: 'b', displayName: 'B' }], FIN, PTS, 250);
    // m1 (group) + m2 (r16) tæller, m3 (300) ikke.
    expect(out[0]).toEqual({ id: 'a', displayName: 'A', groupPoints: 5, knockoutPoints: 3, bonusPoints: 0 });
    expect(out[1]).toEqual({ id: 'b', displayName: 'B', groupPoints: 2, knockoutPoints: 0, bonusPoints: 0 });
  });
});

describe('windowDayPoints', () => {
  it('påfører ligaens scoring på vinduets kampe', () => {
    expect(windowDayPoints(['a', 'b'], [FIN[2]], PTS, { group: true })).toEqual({ b: 4 });
    expect(windowDayPoints(['a', 'b'], [FIN[1]], PTS, { knockout: true, doubleKnockout: true })).toEqual({ a: 6 });
    expect(windowDayPoints(['a', 'b'], [FIN[2]], PTS, { group: false })).toEqual({});
  });
});

describe('leagueTotal', () => {
  const u = { groupPoints: 10, knockoutPoints: 4, bonusPoints: 6 };
  it('summerer alle dele når alt tæller', () => {
    expect(leagueTotal(u, { group: true, knockout: true, bonus: true })).toBe(20);
  });
  it('default (tomt scoring) tæller alt', () => {
    expect(leagueTotal(u, {})).toBe(20);
  });
  it('respekterer fravalg', () => {
    expect(leagueTotal(u, { group: true, knockout: false, bonus: false })).toBe(10);
  });
  it('fordobler slutspil ved doubleKnockout', () => {
    expect(leagueTotal(u, { group: false, knockout: true, bonus: false, doubleKnockout: true })).toBe(8);
  });
});

describe('leagueMatchPoints', () => {
  it('tæller gruppekamp når gruppe er slået til (og default)', () => {
    expect(leagueMatchPoints(5, 'group', { group: true })).toBe(5);
    expect(leagueMatchPoints(5, 'group', {})).toBe(5);
  });
  it('fordobler knockout-kamp ved doubleKnockout', () => {
    expect(leagueMatchPoints(3, 'r16', { knockout: true, doubleKnockout: true })).toBe(6);
    expect(leagueMatchPoints(3, 'final', { knockout: true })).toBe(3);
  });
  it('giver 0 når stadiet er fravalgt', () => {
    expect(leagueMatchPoints(5, 'group', { group: false })).toBe(0);
    expect(leagueMatchPoints(4, 'r32', { knockout: false })).toBe(0);
  });
});

describe('buildRecapFacts', () => {
  const members = [
    { id: 'a', displayName: 'Anders', groupPoints: 20, knockoutPoints: 0, bonusPoints: 0 },
    { id: 'b', displayName: 'Bente', groupPoints: 12, knockoutPoints: 0, bonusPoints: 0 },
    { id: 'c', displayName: 'Carl', groupPoints: 8, knockoutPoints: 0, bonusPoints: 0 },
  ];
  const now = new Date('2026-06-13T05:00:00Z');

  it('sorterer stilling, finder dagens point og standout (med total + placering)', () => {
    const f = buildRecapFacts({
      league: { name: 'Vennerne', scoring: { group: true } },
      members,
      dayPointsByUid: { a: 2, b: 7, c: 0 },
      matches: [{ home: 'BRA', away: 'ARG', score: '2-1' }],
      upcoming: [{ home: 'DEN', away: 'GER', time: '20:00' }],
      now,
    });
    expect(f.leagueName).toBe('Vennerne');
    // standings: points = total NU, dayPoints = vundet siden sidst.
    expect(f.standings[0]).toMatchObject({ rank: 1, name: 'Anders', points: 20, dayPoints: 2 });
    expect(f.standings[1]).toMatchObject({ rank: 2, name: 'Bente', points: 12, dayPoints: 7 });
    expect(f.dayPoints).toEqual([{ name: 'Bente', dayPoints: 7 }, { name: 'Anders', dayPoints: 2 }]);
    // standout: nattens topscorer med BÅDE nattens point og nuværende total + placering.
    expect(f.standout).toEqual({ name: 'Bente', dayPoints: 7, points: 12, rank: 2 });
    // Én klar dagsvinder → ikke uafgjort (drillende tone tilladt).
    expect(f.standoutTie).toBe(false);
    expect(f.dayWinners).toEqual(['Bente']);
    expect(f.matches).toHaveLength(1);
    expect(f.memberCount).toBe(3);
  });

  it('markerer uafgjort dagsvinder (standoutTie) når to deler nattens topscore', () => {
    const f = buildRecapFacts({
      league: { scoring: { group: true } }, members,
      dayPointsByUid: { a: 7, b: 7, c: 0 }, matches: [], upcoming: [], now,
    });
    expect(f.standoutTie).toBe(true);
    expect(f.dayWinners).toEqual(['Anders', 'Bente']);
  });

  it('totalen = forrige total + dayPoints (tal stemmer hele vejen)', () => {
    const f = buildRecapFacts({ league: { name: 'V', scoring: { group: true } }, members, dayPointsByUid: { a: 2, b: 7, c: 0 }, matches: [], upcoming: [], now });
    for (const row of f.standings) {
      const prev = row.points - row.dayPoints; // forrige total
      expect(prev).toBeGreaterThanOrEqual(0);
      expect(row.points).toBe(prev + row.dayPoints);
    }
  });

  it('inkluderer bonusResolved i fakta (default tom)', () => {
    const f = buildRecapFacts({ league: { scoring: { group: true } }, members, dayPointsByUid: {}, matches: [], now });
    expect(f.bonusResolved).toEqual([]);

    const bonus = [{ type: 'topScorer', label: 'Hvem topscorer?', facit: 'Mbappé' }];
    const f2 = buildRecapFacts({
      league: { scoring: { group: true } }, members,
      dayPointsByUid: { a: 5 }, matches: [], bonusResolved: bonus, now,
    });
    expect(f2.bonusResolved).toEqual(bonus);
  });

  it('markerer ikke førerskifte når lederen er den samme (leadChanged=false)', () => {
    const f = buildRecapFacts({ league: { scoring: { group: true } }, members, dayPointsByUid: { a: 2, b: 7, c: 0 }, matches: [], upcoming: [], now });
    expect(f.leader).toMatchObject({ name: 'Anders', points: 20 });
    expect(f.previousLeader).toBe('Anders');
    expect(f.leadChanged).toBe(false);
  });

  it('markerer førerskifte når nattens point ændrer førstepladsen (leadChanged=true)', () => {
    // Før i nat: Anders 19, Bente 17 → Anders førte. Efter: Bente 22 > Anders 20.
    const m = [
      { id: 'a', displayName: 'Anders', groupPoints: 20, knockoutPoints: 0, bonusPoints: 0 },
      { id: 'b', displayName: 'Bente', groupPoints: 22, knockoutPoints: 0, bonusPoints: 0 },
    ];
    const f = buildRecapFacts({ league: { scoring: { group: true } }, members: m, dayPointsByUid: { a: 1, b: 5 }, matches: [], upcoming: [], now });
    expect(f.leader).toMatchObject({ name: 'Bente', points: 22 });
    expect(f.previousLeader).toBe('Anders');
    expect(f.leadChanged).toBe(true);
  });

  it('stille dag: ingen kampe → tom matches/dayPoints, standout null, intet førerskifte', () => {
    const f = buildRecapFacts({ league: { name: 'X' }, members, dayPointsByUid: {}, matches: [], upcoming: [], now });
    expect(f.matches).toEqual([]);
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
