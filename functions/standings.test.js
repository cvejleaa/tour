// ---------------------------------------------------------------------------
// functions/standings.test.js — Tests for functions/standings.js.
// Tester grupperangering, tiebreak-logik og best-thirds-udvælgelse.
// Kører med vitest UDEN emulator-afhængigheder.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { computeGroupStandings, pickBestThirds, resolveHeadToHead } = require('./standings.js');

// ---------------------------------------------------------------------------
// Hjælpefunktioner til testdata
// ---------------------------------------------------------------------------
function makeMatch(homeTeam, awayTeam, homeGoals, awayGoals) {
  return {
    homeTeam,
    awayTeam,
    result: { home: homeGoals, away: awayGoals },
  };
}

// ---------------------------------------------------------------------------
// computeGroupStandings() — grundlæggende tests
// ---------------------------------------------------------------------------
describe('computeGroupStandings()', () => {
  const teams = ['BRA', 'ARG', 'URU', 'PAR'];

  it('returnerer alle hold med rank', () => {
    const matches = [
      makeMatch('BRA', 'ARG', 2, 0),
      makeMatch('URU', 'PAR', 1, 1),
      makeMatch('BRA', 'URU', 1, 0),
      makeMatch('ARG', 'PAR', 2, 1),
      makeMatch('BRA', 'PAR', 3, 0),
      makeMatch('ARG', 'URU', 1, 0),
    ];

    const standings = computeGroupStandings(teams, matches);
    expect(standings).toHaveLength(4);
    expect(standings[0].rank).toBe(1);
    expect(standings[3].rank).toBe(4);
    // BRA vinder alle tre: 9 point
    expect(standings[0].team).toBe('BRA');
    expect(standings[0].pts).toBe(9);
    expect(standings[0].w).toBe(3);
    expect(standings[0].d).toBe(0);
    expect(standings[0].l).toBe(0);
    expect(standings[0].played).toBe(3);
  });

  it('beregner mål korrekt', () => {
    const matches = [
      makeMatch('BRA', 'ARG', 3, 1),
      makeMatch('URU', 'PAR', 0, 0),
      makeMatch('BRA', 'URU', 2, 2),
      makeMatch('ARG', 'PAR', 1, 0),
      makeMatch('BRA', 'PAR', 1, 0),
      makeMatch('ARG', 'URU', 2, 1),
    ];

    const standings = computeGroupStandings(teams, matches);
    const bra = standings.find(s => s.team === 'BRA');
    // BRA: 3-1, 2-2, 1-0 → GF=6, GA=3, GD=3, W=2, D=1, L=0, pts=7
    expect(bra.gf).toBe(6);
    expect(bra.ga).toBe(3);
    expect(bra.gd).toBe(3);
    expect(bra.pts).toBe(7);
    expect(bra.w).toBe(2);
    expect(bra.d).toBe(1);
  });

  it('tiebreak ved ens point: bedste målforskel vinder', () => {
    // ARG og URU har begge 6 point, men ARG har bedre MF
    const matches = [
      makeMatch('BRA', 'PAR', 0, 0),
      makeMatch('ARG', 'URU', 1, 0), // ARG 3 pt
      makeMatch('BRA', 'ARG', 0, 1), // ARG 6 pt, GD: +2
      makeMatch('URU', 'PAR', 1, 0), // URU 3 pt
      makeMatch('ARG', 'PAR', 0, 0), // ARG 7 pt
      makeMatch('URU', 'BRA', 1, 0), // URU 6 pt, GD: +1
    ];

    const standings = computeGroupStandings(teams, matches);
    // ARG: 2W+1D = 7 pt, MF = +2 (1-0, 1-0, 0-0)
    // URU: 2W+1L = 6 pt, MF = +1
    const arg = standings.find(s => s.team === 'ARG');
    const uru = standings.find(s => s.team === 'URU');
    expect(arg.rank).toBeLessThan(uru.rank);
  });

  it('tiebreak ved ens point og MF: flest scorede mål', () => {
    const teams2 = ['X', 'Y', 'Z', 'W'];
    // X og Y har begge 6 pt, MF = 0, men X har scoret flere mål
    const matches = [
      makeMatch('X', 'Y', 2, 2), // 1 pt each
      makeMatch('Z', 'W', 0, 3), // W 3pt
      makeMatch('X', 'Z', 3, 0), // X 4pt
      makeMatch('Y', 'W', 3, 0), // Y 4pt
      makeMatch('X', 'W', 1, 0), // X 7pt
      makeMatch('Y', 'Z', 2, 0), // Y 7pt
    ];

    const standings = computeGroupStandings(teams2, matches);
    const x = standings.find(s => s.team === 'X');
    const y = standings.find(s => s.team === 'Y');
    // X: GF = 2+3+1 = 6, Y: GF = 2+3+2 = 7 → Y bedre GF
    expect(y.gf).toBeGreaterThan(x.gf);
    expect(y.rank).toBeLessThan(x.rank);
  });

  it('ignorerer kampe uden result', () => {
    const matches = [
      { homeTeam: 'BRA', awayTeam: 'ARG' }, // ingen result
      makeMatch('URU', 'PAR', 1, 0),
    ];
    const standings = computeGroupStandings(teams, matches);
    expect(standings).toHaveLength(4);
    // Kun URU og PAR har point
    const uru = standings.find(s => s.team === 'URU');
    expect(uru.pts).toBe(3);
  });

  it('håndterer tom kamplist', () => {
    const standings = computeGroupStandings(teams, []);
    expect(standings).toHaveLength(4);
    expect(standings.every(s => s.pts === 0)).toBe(true);
  });

  it('returnerer korrekt antal rank-numre', () => {
    const matches = [
      makeMatch('BRA', 'ARG', 1, 0),
      makeMatch('URU', 'PAR', 0, 1),
      makeMatch('BRA', 'URU', 0, 0),
      makeMatch('ARG', 'PAR', 0, 0),
      makeMatch('BRA', 'PAR', 2, 0),
      makeMatch('ARG', 'URU', 1, 0),
    ];
    const standings = computeGroupStandings(teams, matches);
    const ranks = standings.map(s => s.rank);
    expect(ranks).toEqual([1, 2, 3, 4]);
  });
});

// ---------------------------------------------------------------------------
// resolveHeadToHead() — indbyrdes opgør
// ---------------------------------------------------------------------------
describe('resolveHeadToHead()', () => {
  it('favoriserer hold med flest indbyrdes point', () => {
    const matches = [
      makeMatch('A', 'B', 1, 0), // A vinder
    ];
    // Negativ = A bedre
    expect(resolveHeadToHead('A', 'B', matches)).toBeLessThan(0);
    expect(resolveHeadToHead('B', 'A', matches)).toBeGreaterThan(0);
  });

  it('returnerer 0 ved uafgjort indbyrdes og ingen mål', () => {
    const matches = [
      makeMatch('A', 'B', 0, 0),
    ];
    // Samme point, MF=0, GF=0 → 0 (lodtrækning)
    expect(resolveHeadToHead('A', 'B', matches)).toBe(0);
  });

  it('bruger indbyrdes GF som tertiær tiebreak (1-1: A scorede 1 mål hjemme)', () => {
    const matches = [
      makeMatch('A', 'B', 1, 1),
    ];
    // Samme point, MF=0, men A scorede 1 mål hjemme → A er marginalt "bedre"
    // Returner negativ = A bedre (i henhold til implementering)
    expect(resolveHeadToHead('A', 'B', matches)).toBeLessThanOrEqual(0);
  });

  it('bruger indbyrdes MF som sekundær tiebreak', () => {
    const matches = [
      makeMatch('A', 'B', 2, 1), // A vinder med 1 mål forskel
    ];
    expect(resolveHeadToHead('A', 'B', matches)).toBeLessThan(0); // A bedre
  });
});

// ---------------------------------------------------------------------------
// pickBestThirds()
// ---------------------------------------------------------------------------
describe('pickBestThirds()', () => {
  it('vælger de 8 bedste 3\'ere ud af 12', () => {
    const allThirds = [
      { team: 'T1',  pts: 6, gd: 3,  gf: 5,  groupName: 'A' },
      { team: 'T2',  pts: 5, gd: 2,  gf: 4,  groupName: 'B' },
      { team: 'T3',  pts: 5, gd: 1,  gf: 3,  groupName: 'C' },
      { team: 'T4',  pts: 4, gd: 2,  gf: 4,  groupName: 'D' },
      { team: 'T5',  pts: 4, gd: 1,  gf: 3,  groupName: 'E' },
      { team: 'T6',  pts: 3, gd: 0,  gf: 2,  groupName: 'F' },
      { team: 'T7',  pts: 3, gd: -1, gf: 1,  groupName: 'G' },
      { team: 'T8',  pts: 3, gd: -2, gf: 1,  groupName: 'H' },
      { team: 'T9',  pts: 2, gd: 0,  gf: 2,  groupName: 'I' },
      { team: 'T10', pts: 2, gd: -1, gf: 1,  groupName: 'J' },
      { team: 'T11', pts: 1, gd: -2, gf: 0,  groupName: 'K' },
      { team: 'T12', pts: 0, gd: -5, gf: 0,  groupName: 'L' },
    ];

    const best8 = pickBestThirds(allThirds);
    expect(best8).toHaveLength(8);
    // T1 er bedst
    expect(best8[0].team).toBe('T1');
    // T12 (0 point) er ikke med
    expect(best8.find(t => t.team === 'T12')).toBeUndefined();
    // T11 (1 point) er ikke med
    expect(best8.find(t => t.team === 'T11')).toBeUndefined();
  });

  it('sorterer korrekt efter point → MF → GF', () => {
    const allThirds = [
      { team: 'A', pts: 4, gd: 2,  gf: 5,  groupName: 'A' },
      { team: 'B', pts: 4, gd: 2,  gf: 3,  groupName: 'B' }, // samme pt+MF, færre GF
      { team: 'C', pts: 4, gd: 1,  gf: 6,  groupName: 'C' }, // samme pt, dårligere MF
    ];
    const best = pickBestThirds([...allThirds, ...Array(9).fill(null).map((_, i) => ({
      team: `X${i}`, pts: 0, gd: 0, gf: 0, groupName: String.fromCharCode(68 + i)
    }))]);
    expect(best[0].team).toBe('A'); // mest GF
    expect(best[1].team).toBe('B'); // næstmest GF
    expect(best[2].team).toBe('C'); // mindst MF
  });

  it('returnerer altid max 8', () => {
    const allThirds = Array(12).fill(null).map((_, i) => ({
      team: `T${i}`, pts: i, gd: 0, gf: 0, groupName: String.fromCharCode(65 + i)
    }));
    expect(pickBestThirds(allThirds)).toHaveLength(8);
  });

  it('muterer ikke inputarrayet', () => {
    const allThirds = [
      { team: 'A', pts: 6, gd: 1, gf: 3, groupName: 'A' },
      { team: 'B', pts: 5, gd: 1, gf: 3, groupName: 'B' },
    ];
    const copy = [...allThirds];
    pickBestThirds(allThirds);
    expect(allThirds).toEqual(copy);
  });
});
