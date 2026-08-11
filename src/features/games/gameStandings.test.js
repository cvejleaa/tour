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
  // Opdelingen kommer FÆRDIG fra serveren og skal med igennem her, ellers når
  // rubrikkerne aldrig fladen. GameStandings-testene mocker hooken og springer
  // derfor denne funktion over — uden testen her kunne feltet fjernes, og
  // opdelings-fanen ville vise streger for alle uden at nogen test faldt.
  it('fører opdelingen med ud til fladen', () => {
    const opdeling = { p1x2: 31, chance: 12.5, combi: 9.5, pulje: 7 };
    const [row] = rankStandings([{ uid: 'a', totalPoints: 60, opdeling }], users);
    expect(row.opdeling).toEqual(opdeling);
  });

  // null og ikke {} eller fire nuller: fladen skal kunne skelne "ikke skrevet
  // endnu" fra "spilleren har ingen point fået".
  it('giver null, når serveren endnu ikke har skrevet opdelingen', () => {
    const [row] = rankStandings([{ uid: 'a', totalPoints: 12 }], users);
    expect(row.opdeling).toBeNull();
  });

  // Samme fælde som opdelingen, men for ligaernes runde-vektor: dette er den
  // ENESTE datavej fra Firestore til `ligaRanking`. UI-testene mocker hookene
  // og leverer rækker, der allerede bærer perRound — fjernes felterne her,
  // viser alle ligaer med startrunde samtlige spillere som "ikke klar".
  it('bevarer perRound og bonusPoints på rækken', () => {
    const perRound = { 1: 12.4, uden: 2 };
    const [row] = rankStandings([{ uid: 'a', totalPoints: 14.4, perRound, bonusPoints: 7 }], users);
    expect(row.perRound).toEqual(perRound);
    expect(row.bonusPoints).toBe(7);
  });

  it('giver null-vektor og 0 i pulje, når serveren ikke har skrevet dem', () => {
    const [row] = rankStandings([{ uid: 'a', totalPoints: 12 }], users);
    expect(row.perRound).toBeNull();
    expect(row.bonusPoints).toBe(0);
  });

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

  // previousRank er spillets SAMLEDE rang. Følger den uændret med ind i en
  // delmængde, sammenligner rankDelta to forskellige skalaer, og alle får en
  // stor grøn pil op uden at have flyttet sig.
  it('gen-tildeler også previousRank inden for delmængden', () => {
    const rows = [
      { uid: 'b', totalPoints: 12, rank: 1, previousRank: 11 },
      { uid: 'c', totalPoints: 8, rank: 2, previousRank: 4 },
      { uid: 'a', totalPoints: 5, rank: 3, previousRank: 17 },
    ];
    const league = subsetRanking(rows, ['a', 'b']);
    // b var bedst placeret af de to (11 < 17) → forrige plads 1, nu 1: ingen pil.
    expect(league.map((r) => [r.uid, r.rank, r.previousRank]))
      .toEqual([['b', 1, 1], ['a', 2, 2]]);
    expect(league.map(rankDelta)).toEqual([0, 0]);
  });

  it('lader en spiller uden forrige placering slippe for en pil', () => {
    const rows = [
      { uid: 'b', totalPoints: 12, rank: 1, previousRank: 3 },
      { uid: 'a', totalPoints: 5, rank: 2 }, // ny spiller
    ];
    const league = subsetRanking(rows, ['a', 'b']);
    expect(league[1].previousRank).toBeNull();
    expect(rankDelta(league[1])).toBeNull();
  });

  it('deler forrige placering ved lige forrige rang', () => {
    const rows = [
      { uid: 'b', totalPoints: 12, rank: 1, previousRank: 5 },
      { uid: 'a', totalPoints: 9, rank: 2, previousRank: 5 },
      { uid: 'c', totalPoints: 3, rank: 3, previousRank: 9 },
    ];
    const league = subsetRanking(rows, ['a', 'b', 'c']);
    expect(league.map((r) => r.previousRank)).toEqual([1, 1, 3]);
  });

  it('gen-tildeler rank ved lige point', () => {
    const rows = [
      { uid: 'b', totalPoints: 9, rank: 2, previousRank: 2 },
      { uid: 'a', totalPoints: 9, rank: 3, previousRank: 3 },
      { uid: 'c', totalPoints: 1, rank: 8, previousRank: 8 },
    ];
    expect(subsetRanking(rows, ['a', 'b', 'c']).map((r) => r.rank)).toEqual([1, 1, 3]);
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
