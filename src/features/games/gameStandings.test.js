import { describe, it, expect } from 'vitest';
import {
  rankStandings, rankDelta, subsetRanking, leagueMateUids, leagueMateStandings,
} from './gameStandings';

const users = {
  a: { displayName: 'Anna', avatarEmoji: '🦊' },
  b: { displayName: 'Bo' },
  c: { displayName: 'Cille', favoriteTeam: 'FCK' },
};

describe('rankStandings', () => {
  it('sorterer faldende efter point og tildeler placering', () => {
    const rows = rankStandings([
      { uid: 'a', totalPoints: 5 },
      { uid: 'b', totalPoints: 12 },
      { uid: 'c', totalPoints: 8 },
    ], users);
    expect(rows.map((r) => r.uid)).toEqual(['b', 'c', 'a']);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(rows[0].name).toBe('Bo');
  });

  it('håndterer lige point (samme placering, spring over)', () => {
    const rows = rankStandings([
      { uid: 'a', totalPoints: 10 },
      { uid: 'b', totalPoints: 10 },
      { uid: 'c', totalPoints: 4 },
    ], users);
    // Anna og Bo har begge 10 → placering 1 og 1, Cille → 3.
    expect(rows.map((r) => r.rank)).toEqual([1, 1, 3]);
    // Ens point: alfabetisk (Anna før Bo).
    expect(rows.map((r) => r.uid)).toEqual(['a', 'b', 'c']);
  });

  it('bruger fallback-navn og default 0 point', () => {
    const rows = rankStandings([{ uid: 'x' }], {});
    expect(rows[0].name).toBe('Ukendt spiller');
    expect(rows[0].totalPoints).toBe(0);
    expect(rows[0].rank).toBe(1);
  });

  it('tomt input giver tom liste', () => {
    expect(rankStandings(null)).toEqual([]);
    expect(rankStandings([])).toEqual([]);
  });

  it('tager avatar/hold med fra profilen', () => {
    const rows = rankStandings([{ uid: 'a', totalPoints: 1 }, { uid: 'c', totalPoints: 2 }], users);
    const cille = rows.find((r) => r.uid === 'c');
    expect(cille.favoriteTeam).toBe('FCK');
    expect(rows.find((r) => r.uid === 'a').emoji).toBe('🦊');
  });

  it('per-spil-hold (players-doc) har forrang for den globale profil', () => {
    // Cille har 'FCK' i den globale profil, men 'Brøndby' i dette spil.
    const rows = rankStandings([{ uid: 'c', totalPoints: 2, favoriteTeam: 'Brøndby' }], users);
    expect(rows.find((r) => r.uid === 'c').favoriteTeam).toBe('Brøndby');
  });
});

describe('subsetRanking (liga-stilling)', () => {
  const ranked = rankStandings([
    { uid: 'b', totalPoints: 12 },
    { uid: 'c', totalPoints: 8 },
    { uid: 'a', totalPoints: 5 },
  ], users);

  it('filtrerer til medlemmer og gen-tildeler placering', () => {
    const league = subsetRanking(ranked, ['a', 'b']); // uden c
    expect(league.map((r) => r.uid)).toEqual(['b', 'a']);
    expect(league.map((r) => r.rank)).toEqual([1, 2]); // gen-rangeret indenfor ligaen
  });

  it('tom medlemsliste → tom stilling', () => {
    expect(subsetRanking(ranked, [])).toEqual([]);
  });
});

describe('rankDelta', () => {
  it('positiv = rykket op, negativ = ned', () => {
    expect(rankDelta({ rank: 2, previousRank: 5 })).toBe(3);
    expect(rankDelta({ rank: 6, previousRank: 3 })).toBe(-3);
    expect(rankDelta({ rank: 1, previousRank: 1 })).toBe(0);
    expect(rankDelta({ rank: 1 })).toBeNull();
  });
});

describe('leagueMateUids / leagueMateStandings', () => {
  const ranked = rankStandings([
    { uid: 'a', totalPoints: 5 },
    { uid: 'b', totalPoints: 12 },
    { uid: 'c', totalPoints: 8 },
  ], users);
  const leagues = [
    { id: 'L1', memberUids: ['a', 'b'] },
    { id: 'L2', memberUids: ['a', 'x'] },
  ];

  it('samler medlemmer fra alle mine ligaer plus mig selv', () => {
    expect([...leagueMateUids(leagues, 'a')].sort()).toEqual(['a', 'b', 'x']);
  });

  it('ser bort fra ligaer jeg ikke selv er med i', () => {
    expect([...leagueMateUids([{ memberUids: ['b', 'c'] }], 'a')]).toEqual(['a']);
  });

  it('viser kun liga-kammerater og gen-rangerer', () => {
    const rows = leagueMateStandings(ranked, leagues, 'a');
    // c er ikke i nogen af mine ligaer → væk. b (12 p) foran a (5 p).
    expect(rows.map((r) => r.uid)).toEqual(['b', 'a']);
    expect(rows.map((r) => r.rank)).toEqual([1, 2]);
  });

  it('uden ligaer står man alene på listen', () => {
    const rows = leagueMateStandings(ranked, [], 'a');
    expect(rows.map((r) => r.uid)).toEqual(['a']);
    expect(rows[0].rank).toBe(1);
  });

  it('uden bruger vises ingenting', () => {
    expect(leagueMateStandings(ranked, leagues, null)).toEqual([]);
  });
});
