import { describe, it, expect } from 'vitest';
import { lavQuiz, rundeEt, rundeTo, tipStatistik, svarMuligheder, PR_RUNDE } from './quiz';

const VM = {
  source: 'vm', name: 'Dreamteam', memberCount: 12,
  top: [
    { rank: 1, name: 'Joe', points: 210.5 },
    { rank: 2, name: 'Sonja', points: 198 },
    { rank: 3, name: 'Ole', points: 190 },
    { rank: 4, name: 'Better', points: 185 },
    { rank: 5, name: 'No1.', points: 180 },
  ],
};
const TOUR = {
  source: 'tour', name: 'Dreamteam', memberCount: 9,
  top: [
    { rank: 1, name: 'Marianne', points: 1500 },
    { rank: 2, name: 'Oldefar', points: 1420 },
    { rank: 3, name: 'Joe', points: 1400 },
    { rank: 4, name: 'Forza Bif', points: 1300 },
    { rank: 5, name: 'Sonja', points: 1250 },
  ],
};

const kamp = (id, home, away, result, odds, round = 1) => ({ id, home, away, result, odds, round });
const MATCHES = [
  kamp('m1', 'FCK', 'Brøndby', '1', { 1: 2, X: 3.5, 2: 4 }),
  kamp('m2', 'AGF', 'OB', '2', { 1: 1.8, X: 3.6, 2: 5 }),
  kamp('m3', 'FCM', 'Randers', null, { 1: 1.5, X: 4, 2: 6 }), // ikke afgjort
];
const bet = (uid, matchId, pick, points, chanceStake = 0) => ({ uid, matchId, pick, points, chanceStake });
const SL = {
  rows: [
    { uid: 'a', name: 'Joe', rank: 1, totalPoints: 40 },
    { uid: 'b', name: 'Sonja', rank: 2, totalPoints: 33.5 },
    { uid: 'c', name: 'Ole', rank: 3, totalPoints: 20 },
  ],
  bets: [
    bet('a', 'm1', '1', 2), bet('a', 'm2', '2', 13, 2), // ramt med chance: 5 + 2×4 = 13
    bet('b', 'm1', '1', 6, 4), bet('b', 'm2', '1', -3, 3), // ramt m1 (2 + 4), tabt m2 (−3)
    bet('c', 'm1', 'X', 0), bet('c', 'm2', '2', 5),
    bet('c', 'm3', '1', null), // uafgjort kamp tæller ikke
  ],
  matches: MATCHES,
  startRound: null,
};
const PL = {
  rows: [
    { uid: 'a', name: 'Joe', rank: 2, totalPoints: 30 },
    { uid: 'b', name: 'Sonja', rank: 1, totalPoints: 35 },
    { uid: 'c', name: 'Ole', rank: 3, totalPoints: 10 },
  ],
  bets: [bet('b', 'p1', '1', 3)],
  matches: [kamp('p1', 'Arsenal', 'Chelsea', '1', { 1: 3, X: 3, 2: 3 })],
  startRound: null,
};

describe('svarMuligheder', () => {
  it('fire muligheder med det rigtige blandt dem, stabilt for samme nøgle', () => {
    const a = svarMuligheder('Joe', ['Joe', 'Sonja', 'Ole', 'Better', 'No1.'], 'q1');
    expect(a).toHaveLength(4);
    expect(a).toContain('Joe');
    expect(new Set(a).size).toBe(4);
    expect(svarMuligheder('Joe', ['Joe', 'Sonja', 'Ole', 'Better', 'No1.'], 'q1')).toEqual(a);
  });
  it('null uden andre navne', () => {
    expect(svarMuligheder('Joe', ['Joe'], 'q')).toBeNull();
  });
});

describe('runde 1 (VM + Tour)', () => {
  const r = rundeEt(VM, TOUR, { superliga: 3, pl: 3 });
  it('har 10 spørgsmål, blandet multiple choice og åbne', () => {
    expect(r).toHaveLength(PR_RUNDE);
    expect(r.some((q) => q.type === 'valg')).toBe(true);
    expect(r.some((q) => q.type === 'aaben')).toBe(true);
  });
  it('svarene kommer af dataene', () => {
    const find = (t) => r.find((q) => q.tekst === t);
    expect(find('Hvem vandt ligaen til VM 2026?').svar).toBe('Joe');
    expect(find('Hvor mange point fik vinderen til VM 2026?').svar).toBe('210,5 point (Joe)');
    expect(find('Hvor mange point skilte vinderen og nr. 2 i Tour de France?').svar).toBe('80 point (Marianne 1500 – Oldefar 1420)');
    expect(find('Hvor mange var med i ligaen til VM 2026?').svar).toBe('12');
    expect(find('Hvem blev nr. 3 i Tour de France?').svar).toBe('Joe');
    // Joe og Sonja er i top 5 begge steder → åbent spørgsmål med antal.
    expect(find('Hvor mange sluttede i top 5 i både VM 2026 og Tour de France?').svar).toBe('2 (Joe, Sonja)');
    const flest = find('I hvilket spil havde ligaen flest deltagere?');
    expect(flest.svarValg).toBe('VM 2026');
    expect(flest.valg).toContain('VM 2026');
  });
  it('multiple choice har altid det rigtige svar blandt mulighederne', () => {
    for (const q of r.filter((x) => x.type === 'valg')) {
      expect(q.valg).toContain(q.svarValg ?? q.svar);
    }
  });
  it('en delt førsteplads giver intet «hvem vandt»-spørgsmål', () => {
    const delt = { ...VM, top: [{ rank: 1, name: 'Joe', points: 200 }, { rank: 1, name: 'Sonja', points: 200 }, ...VM.top.slice(2)] };
    const q = rundeEt(delt, TOUR).map((x) => x.tekst);
    expect(q).not.toContain('Hvem vandt ligaen til VM 2026?');
    expect(q).not.toContain('Hvor mange point fik vinderen til VM 2026?');
  });
  it('uden data: tom runde, ingen fejl', () => {
    expect(rundeEt(null, null)).toEqual([]);
  });
});

describe('tipStatistik', () => {
  it('tæller kun afgjorte kampe og regner Chancens netto', () => {
    const { pr, bedsteKamp, mestRamte } = tipStatistik(SL.bets, SL.matches);
    expect(pr.get('a')).toEqual({ tippet: 2, ramt: 2, chancer: 1, chanceNetto: 8 });
    expect(pr.get('b')).toEqual({ tippet: 2, ramt: 1, chancer: 2, chanceNetto: 1 }); // +4 og −3
    expect(pr.get('c')).toEqual({ tippet: 2, ramt: 1, chancer: 0, chanceNetto: 0 });
    expect(bedsteKamp).toMatchObject({ uid: 'a', point: 13, kamp: 'AGF–OB' });
    expect(bedsteKamp.delt).toBeUndefined();
    expect(mestRamte).toMatchObject({ kamp: 'FCK–Brøndby', n: 2, delt: true }); // m1 og m2 har begge 2
  });
  it('startrunden skærer tidligere runder fra', () => {
    const m = [kamp('x', 'A', 'B', '1', { 1: 2 }, 1), kamp('y', 'C', 'D', '1', { 1: 2 }, 5)];
    const { pr } = tipStatistik([bet('a', 'x', '1', 2), bet('a', 'y', '1', 2)], m, 3);
    expect(pr.get('a').tippet).toBe(1);
  });
});

describe('runde 2 (Superligaen + PL)', () => {
  const r = rundeTo(SL, PL);
  const find = (t) => r.find((q) => q.tekst === t);
  it('har 10 spørgsmål med svar af dataene', () => {
    expect(r).toHaveLength(PR_RUNDE);
    expect(find('Hvem fører ligaen i Superligaen lige nu?').svar).toBe('Joe');
    expect(find('Hvor mange point har føreren i Superligaen?').svar).toBe('40 point (Joe)');
    expect(find('Hvem har ramt flest kampe i Superligaen?').svar).toBe('Joe (2 rigtige)');
    expect(find('Hvem har tjent mest på ⚡ Chancen i Superligaen?').svar).toBe('Joe (netto 8 point)');
    expect(find('Hvem fik flest point på én enkelt kamp i Superligaen — og hvor mange?').svar).toBe('Joe: 13 point på AGF–OB');
    expect(find('Hvem fører ligaen i Premier League lige nu?').svar).toBe('Sonja');
  });
  it('multiple choice har altid det rigtige svar blandt mulighederne', () => {
    for (const q of r.filter((x) => x.type === 'valg')) {
      expect(q.valg).toContain(q.svarValg ?? q.svar);
    }
  });
});

describe('lavQuiz', () => {
  it('to runder', () => {
    const q = lavQuiz({ vm: VM, tour: TOUR, sl: SL, pl: PL });
    expect(q.map((x) => x.spoergsmaal.length)).toEqual([10, 10]);
    expect(q[0].titel).toMatch(/Runde 1/);
    expect(q[1].titel).toMatch(/Runde 2/);
  });
});
