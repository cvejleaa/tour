/**
 * Tests for rene hjælpefunktioner i standingsUtils.js.
 */
import { describe, it, expect } from 'vitest';
import {
  getTodayInCPH,
  filterByMembers,
  collectVisibleUids,
  sortByPoints,
  computeDailyPoints,
  tippedFinishedCounts,
} from './standingsUtils';

// ── tippedFinishedCounts ─────────────────────────────────────────────────────
describe('tippedFinishedCounts', () => {
  const matches = [
    { id: 'm1', status: 'finished' },
    { id: 'm2', status: 'finished' },
    { id: 'm3', status: 'scheduled' }, // ikke afsluttet → tæller ikke
  ];
  const byMatch = new Map([
    ['m1', new Set(['a', 'b'])],
    ['m2', new Set(['a'])],
    ['m3', new Set(['a', 'b'])], // ignoreres (scheduled)
  ]);

  it('tæller kun tippede, afsluttede kampe pr. spiller', () => {
    expect(tippedFinishedCounts(matches, byMatch)).toEqual({ a: 2, b: 1 });
  });

  it('robust over for tomme/manglende input', () => {
    expect(tippedFinishedCounts([], new Map())).toEqual({});
    expect(tippedFinishedCounts(null, null)).toEqual({});
    expect(tippedFinishedCounts(matches, new Map())).toEqual({});
  });
});

// ── getTodayInCPH ────────────────────────────────────────────────────────────
describe('getTodayInCPH', () => {
  it('returnerer en streng i YYYY-MM-DD format', () => {
    const result = getTodayInCPH();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('accepterer en eksplicit now-dato', () => {
    const date = new Date('2026-06-15T12:00:00Z');
    const result = getTodayInCPH(date);
    // Europa/Kkøbenhavn er UTC+2 om sommeren → stadig 2026-06-15
    expect(result).toBe('2026-06-15');
  });

  it('håndterer midnat UTC som forrige dag i CPH (UTC+2)', () => {
    // 2026-06-15T00:30:00Z → i CPH (UTC+2) er det 2026-06-15T02:30:00 → stadig 15
    const date = new Date('2026-06-15T00:30:00Z');
    const result = getTodayInCPH(date);
    expect(result).toBe('2026-06-15');
  });

  it('returnerer korrekt dato ved nytår', () => {
    const date = new Date('2026-01-01T10:00:00Z');
    const result = getTodayInCPH(date);
    expect(result).toBe('2026-01-01');
  });

  it('bruger ny Date() som default (ingen fejl)', () => {
    expect(() => getTodayInCPH()).not.toThrow();
  });
});

// ── filterByMembers ──────────────────────────────────────────────────────────
describe('filterByMembers', () => {
  const users = [
    { uid: 'a' }, { uid: 'b' }, { uid: 'c' },
  ];

  it('returnerer alle brugere når memberUids er null', () => {
    expect(filterByMembers(users, null)).toHaveLength(3);
  });

  it('returnerer alle brugere når memberUids er tom liste', () => {
    expect(filterByMembers(users, [])).toHaveLength(3);
  });

  it('filtrerer til kun de angivne uid-er', () => {
    const result = filterByMembers(users, ['a', 'c']);
    expect(result).toHaveLength(2);
    expect(result.map((u) => u.uid)).toEqual(expect.arrayContaining(['a', 'c']));
  });

  it('returnerer tom liste hvis ingen matcher', () => {
    expect(filterByMembers(users, ['z'])).toHaveLength(0);
  });

  it('returnerer alle brugere ved undefined memberUids', () => {
    expect(filterByMembers(users, undefined)).toHaveLength(3);
  });

  it('returnerer kun matchende brugere ved én uid', () => {
    const result = filterByMembers(users, ['b']);
    expect(result).toHaveLength(1);
    expect(result[0].uid).toBe('b');
  });

  it('muterer ikke input-arrayet', () => {
    const copy = [...users];
    filterByMembers(users, ['a']);
    expect(users).toEqual(copy);
  });

  it('ignorerer ukendte uid-er i listen', () => {
    const result = filterByMembers(users, ['a', 'z', 'w']);
    expect(result).toHaveLength(1);
    expect(result[0].uid).toBe('a');
  });
});

// ── collectVisibleUids ────────────────────────────────────────────────────────
describe('collectVisibleUids', () => {
  it('samler unionen af medlemmer på tværs af ligaer + sig selv', () => {
    const leagues = [
      { memberUids: ['a', 'me'] },
      { memberUids: ['b', 'c', 'me'] },
    ];
    const result = collectVisibleUids(leagues, 'me');
    expect(new Set(result)).toEqual(new Set(['me', 'a', 'b', 'c']));
  });

  it('dublerer ikke UIDs der går igen i flere ligaer', () => {
    const leagues = [{ memberUids: ['a', 'b'] }, { memberUids: ['b', 'a'] }];
    expect(collectVisibleUids(leagues, 'me')).toHaveLength(3); // me, a, b
  });

  it('returnerer kun sig selv uden ligaer', () => {
    expect(collectVisibleUids([], 'me')).toEqual(['me']);
  });

  it('inkluderer altid sig selv, også uden at stå i memberUids', () => {
    expect(collectVisibleUids([{ memberUids: ['a'] }], 'me')).toContain('me');
  });

  it('håndterer tomme/manglende felter', () => {
    expect(collectVisibleUids(null, 'me')).toEqual(['me']);
    expect(collectVisibleUids([{}, { memberUids: null }], 'me')).toEqual(['me']);
    expect(collectVisibleUids([], null)).toEqual([]);
  });
});

// ── sortByPoints ─────────────────────────────────────────────────────────────
describe('sortByPoints', () => {
  it('sorterer faldende efter totalPoints', () => {
    const users = [
      { uid: 'a', totalPoints: 10 },
      { uid: 'b', totalPoints: 30 },
      { uid: 'c', totalPoints: 20 },
    ];
    const sorted = sortByPoints(users);
    expect(sorted[0].uid).toBe('b');
    expect(sorted[1].uid).toBe('c');
    expect(sorted[2].uid).toBe('a');
  });

  it('behandler manglende totalPoints som 0', () => {
    const users = [{ uid: 'a', totalPoints: 5 }, { uid: 'b' }];
    const sorted = sortByPoints(users);
    expect(sorted[0].uid).toBe('a');
  });

  it('muterer ikke input-arrayet', () => {
    const users = [{ uid: 'a', totalPoints: 5 }, { uid: 'b', totalPoints: 10 }];
    const copy = [...users];
    sortByPoints(users);
    expect(users).toEqual(copy);
  });

  it('returnerer tom liste ved tom input', () => {
    expect(sortByPoints([])).toEqual([]);
  });

  it('håndterer alle med ens point (stabilt rækkefølge-neutral)', () => {
    const users = [
      { uid: 'a', totalPoints: 10 },
      { uid: 'b', totalPoints: 10 },
      { uid: 'c', totalPoints: 10 },
    ];
    const sorted = sortByPoints(users);
    expect(sorted).toHaveLength(3);
  });

  it('håndterer negative point', () => {
    const users = [
      { uid: 'a', totalPoints: -5 },
      { uid: 'b', totalPoints: 10 },
      { uid: 'c', totalPoints: 0 },
    ];
    const sorted = sortByPoints(users);
    expect(sorted[0].uid).toBe('b');
    expect(sorted[2].uid).toBe('a');
  });

  it('behandler undefined totalPoints som 0 (lavere end positive)', () => {
    const users = [
      { uid: 'a' },
      { uid: 'b', totalPoints: 0 },
      { uid: 'c', totalPoints: 5 },
    ];
    const sorted = sortByPoints(users);
    expect(sorted[0].uid).toBe('c');
  });
});

// ── computeDailyPoints ───────────────────────────────────────────────────────
describe('computeDailyPoints', () => {
  const todayStr = '2026-06-15';

  // Hjælpefunktion til at lave Timestamp-lignende objekt
  const ts = (dateStr) => ({
    toDate: () => new Date(`${dateStr}T12:00:00Z`),
  });

  const matches = [
    {
      id: 'match-1',
      status: 'finished',
      kickoff: ts('2026-06-15'),
      round: 'group',
      result: { home: 2, away: 1 },
    },
    {
      id: 'match-2',
      status: 'finished',
      kickoff: ts('2026-06-14'), // i går → ikke talt med
      round: 'group',
      result: { home: 0, away: 0 },
    },
    {
      id: 'match-3',
      status: 'scheduled', // ikke finished
      kickoff: ts('2026-06-15'),
      round: 'group',
      result: null,
    },
  ];

  const bets = [
    // Korrekt score for match-1 → 5 point (EXACT)
    { uid: 'player-1', matchId: 'match-1', home: 2, away: 1 },
    // Korrekt udfald, forkert score → 2 point (OUTCOME)
    { uid: 'player-2', matchId: 'match-1', home: 3, away: 1 },
    // Bet på gårsdagens kamp (tæller ikke)
    { uid: 'player-1', matchId: 'match-2', home: 0, away: 0 },
    // Bet på ikke-finished kamp (tæller ikke)
    { uid: 'player-1', matchId: 'match-3', home: 1, away: 0 },
  ];

  it('returnerer korrekte point for dagens kampe', () => {
    const result = computeDailyPoints(matches, bets, todayStr);
    expect(result['player-1']).toBe(5); // EXACT på match-1
    expect(result['player-2']).toBe(2); // OUTCOME på match-1
  });

  it('medtager ikke bets fra andre datoer', () => {
    const result = computeDailyPoints(matches, bets, todayStr);
    // player-1's bet på match-2 bør ikke tælle
    expect(result['player-1']).toBe(5); // kun match-1
  });

  it('returnerer tomt objekt hvis ingen matches matcher datoen', () => {
    const result = computeDailyPoints(matches, bets, '2099-01-01');
    expect(result).toEqual({});
  });

  it('returnerer tomt objekt ved tomme input', () => {
    expect(computeDailyPoints([], [], todayStr)).toEqual({});
    expect(computeDailyPoints(matches, [], todayStr)).toEqual({});
  });

  it('summerer point fra flere kampe samme dag', () => {
    const multiMatches = [
      ...matches,
      {
        id: 'match-4',
        status: 'finished',
        kickoff: ts('2026-06-15'),
        round: 'group',
        result: { home: 1, away: 1 },
      },
    ];
    const multiBets = [
      ...bets,
      // player-1 tipper korrekt udfald (uafgjort) → 5 point (EXACT)
      { uid: 'player-1', matchId: 'match-4', home: 1, away: 1 },
    ];
    const result = computeDailyPoints(multiMatches, multiBets, todayStr);
    expect(result['player-1']).toBe(10); // 5 + 5
  });

  it('ignorerer bets uden tilhørende kamp', () => {
    const result = computeDailyPoints(matches, [
      { uid: 'spiller-x', matchId: 'ukendt-match', home: 1, away: 0 },
    ], todayStr);
    // ingen kamp fundet → ingen point
    expect(result['spiller-x']).toBeUndefined();
  });

  it('ignorerer kampe uden result (null)', () => {
    const matchesIngenResult = [
      {
        id: 'match-nr',
        status: 'finished',
        kickoff: ts(todayStr),
        round: 'group',
        result: null,
      },
    ];
    const result = computeDailyPoints(matchesIngenResult, [
      { uid: 'spiller-y', matchId: 'match-nr', home: 0, away: 0 },
    ], todayStr);
    expect(result['spiller-y']).toBeUndefined();
  });

  it('beregner knockout-point korrekt (round !== group)', () => {
    const koMatches = [
      {
        id: 'ko-1',
        status: 'finished',
        kickoff: ts(todayStr),
        round: 'r16',
        result: { home: 2, away: 1 },
      },
    ];
    const koBets = [
      // Korrekt resultat i knockout
      { uid: 'ko-player', matchId: 'ko-1', home: 2, away: 1 },
    ];
    const result = computeDailyPoints(koMatches, koBets, todayStr);
    // Knockout scorer anderledes – blot tjek at vi får et tal
    expect(typeof result['ko-player']).toBe('number');
    expect(result['ko-player']).toBeGreaterThan(0);
  });

  it('returnerer tomt objekt ved tomt matches-array', () => {
    expect(computeDailyPoints([], bets, todayStr)).toEqual({});
  });

  it('returnerer tomt objekt ved tomt bets-array', () => {
    expect(computeDailyPoints(matches, [], todayStr)).toEqual({});
  });

  it('håndterer kickoff som ISO-streng (ikke Timestamp)', () => {
    const matchesIso = [
      {
        id: 'match-iso',
        status: 'finished',
        kickoff: `${todayStr}T14:00:00Z`,
        round: 'group',
        result: { home: 1, away: 0 },
      },
    ];
    const result = computeDailyPoints(matchesIso, [
      { uid: 'iso-player', matchId: 'match-iso', home: 1, away: 0 },
    ], todayStr);
    expect(result['iso-player']).toBeGreaterThan(0);
  });
});
