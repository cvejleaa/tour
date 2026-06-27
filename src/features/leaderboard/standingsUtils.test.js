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
  // Afgjorte etaper har et result; den åbne har ingen (kickoff i fremtiden).
  const done = (id) => ({ id, result: { winnerTeam: 'A' } });
  const stages = [
    done('s1'),
    done('s2'),
    { id: 's3', kickoff: '2999-07-03T12:00:00+02:00', result: null }, // ikke afgjort → tæller ikke
  ];
  const byStage = new Map([
    ['s1', new Set(['a', 'b'])],
    ['s2', new Set(['a'])],
    ['s3', new Set(['a', 'b'])], // ignoreres (ikke afgjort)
  ]);

  it('tæller kun tippede, afgjorte etaper pr. spiller', () => {
    expect(tippedFinishedCounts(stages, byStage)).toEqual({ a: 2, b: 1 });
  });

  it('robust over for tomme/manglende input', () => {
    expect(tippedFinishedCounts([], new Map())).toEqual({});
    expect(tippedFinishedCounts(null, null)).toEqual({});
    expect(tippedFinishedCounts(stages, new Map())).toEqual({});
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
  const todayStr = '2026-07-15';

  // Afgjorte etaper har et result; date afgør "i dag".
  const stages = [
    {
      id: 's-1', date: '2026-07-15',
      result: { winnerTeam: 'A', gcTeam: 'A', mountainTeam: 'B', sprintTeam: 'C' },
    },
    {
      id: 's-2', date: '2026-07-14', // i går → ikke talt med
      result: { winnerTeam: 'B' },
    },
    {
      id: 's-3', date: '2026-07-15', kickoff: '2999-07-15T12:00:00+02:00', result: null, // ikke afgjort
    },
  ];

  // Etape-tip med serverberegnede point.
  const bets = [
    { uid: 'player-1', stageId: 's-1', points: 5 },
    { uid: 'player-2', stageId: 's-1', points: 2 },
    { uid: 'player-1', stageId: 's-2', points: 4 }, // i går → tæller ikke
    { uid: 'player-1', stageId: 's-3', points: 0 }, // ikke afgjort → tæller ikke
  ];

  it('returnerer korrekte point for dagens etape', () => {
    const result = computeDailyPoints(stages, bets, todayStr);
    expect(result['player-1']).toBe(5);
    expect(result['player-2']).toBe(2);
  });

  it('medtager ikke tip fra andre datoer', () => {
    const result = computeDailyPoints(stages, bets, todayStr);
    expect(result['player-1']).toBe(5); // kun s-1
  });

  it('returnerer tomt objekt hvis ingen etaper matcher datoen', () => {
    const result = computeDailyPoints(stages, bets, '2099-01-01');
    expect(result).toEqual({});
  });

  it('returnerer tomt objekt ved tomme input', () => {
    expect(computeDailyPoints([], [], todayStr)).toEqual({});
    expect(computeDailyPoints(stages, [], todayStr)).toEqual({});
  });

  it('summerer point fra flere etaper samme dag', () => {
    const multiStages = [
      ...stages,
      { id: 's-4', date: '2026-07-15', result: { winnerTeam: 'C' } },
    ];
    const multiBets = [
      ...bets,
      { uid: 'player-1', stageId: 's-4', points: 3 },
    ];
    const result = computeDailyPoints(multiStages, multiBets, todayStr);
    expect(result['player-1']).toBe(8); // 5 + 3
  });

  it('genberegner point lokalt når bet mangler points-felt', () => {
    const local = [
      // intet points-felt → scoreStageBet bruges; rammer winnerTeam (5 point som standard)
      { uid: 'calc', stageId: 's-1', winnerTeam: 'A', gcTeam: '', mountainTeam: '', sprintTeam: '' },
    ];
    const result = computeDailyPoints(stages, local, todayStr);
    expect(result['calc']).toBeGreaterThan(0);
  });

  it('ignorerer tip uden tilhørende etape', () => {
    const result = computeDailyPoints(stages, [
      { uid: 'x', stageId: 'ukendt', points: 9 },
    ], todayStr);
    expect(result['x']).toBeUndefined();
  });

  it('ignorerer etaper uden result (null)', () => {
    const noResult = [{ id: 's-nr', date: todayStr, result: null }];
    const result = computeDailyPoints(noResult, [
      { uid: 'y', stageId: 's-nr', points: 3 },
    ], todayStr);
    expect(result['y']).toBeUndefined();
  });
});
