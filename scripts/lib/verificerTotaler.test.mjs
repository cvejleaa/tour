import { describe, it, expect } from 'vitest';
import { TOLERANCE, harIndsatsAf, kontrollerSpiller, vurder, tabel } from './verificerTotaler.mjs';

const ingen = new Set();
const spiller = (over) => ({ uid: 'u1', totalPoints: 15.2, opdeling: { p1x2: 10, chance: 0, combi: 5.2, pulje: 0 }, ...over });

describe('kontrollerSpiller — rubrikkerne mod totalen', () => {
  it('ok, når rubrikkerne summer til totalen', () => {
    const r = kontrollerSpiller(spiller(), ingen);
    expect(r.noter).toEqual([]);
    expect(r).toMatchObject({ sum: 15.2, total: 15.2 });
  });

  it('afrunding alene må ikke give fejl: 0,2 er grøn (den gamle grænse 0,15 gjorde den rød)', () => {
    // pointOpdeling.js: p1x2 10,049 + chance 0,049 + combi 5,049 + pulje 0,049
    // → rubrikker 10,0/0,0/5,0/0,0 (sum 15,0), total round1(15,196) = 15,2.
    expect(TOLERANCE).toBeGreaterThanOrEqual(0.2);
    const r = kontrollerSpiller(spiller({ totalPoints: 15.2, opdeling: { p1x2: 10, chance: 0, combi: 5, pulje: 0 } }), ingen);
    expect(r.noter).toEqual([]);
  });

  it('fejler, når afvigelsen er større end afrundingen kan forklare (0,3)', () => {
    const r = kontrollerSpiller(spiller({ totalPoints: 15.3, opdeling: { p1x2: 10, chance: 0, combi: 5, pulje: 0 } }), ingen);
    expect(r.noter).toEqual(['SUM 15 ≠ TOTAL 15.3']);
  });

  it('fejler tydeligt på en hel manglende kamp — ikke kun på tiendedele', () => {
    const r = kontrollerSpiller(spiller({ totalPoints: 18.7 }), ingen);
    expect(r.noter).toEqual(['SUM 15.2 ≠ TOTAL 18.7']);
  });

  it('gulvet: total 0 med negativ sum er legitimt (11 + (−44,8) + 8,5 → 0)', () => {
    const r = kontrollerSpiller({ uid: 'u1', totalPoints: 0, opdeling: { p1x2: 11, chance: -44.8, combi: 8.5, pulje: 0 } }, new Set(['u1']));
    expect(r.noter).toEqual([]);
    expect(r.sum).toBe(-25.3);
  });

  it('gulvet undtager KUN sum < 0: total 0 med positiv sum er en fejl', () => {
    const r = kontrollerSpiller({ uid: 'u1', totalPoints: 0, opdeling: { p1x2: 3, chance: 0, combi: 0, pulje: 0 } }, ingen);
    expect(r.noter).toEqual(['SUM 3 ≠ TOTAL 0']);
  });

  it('en spiller uden opdeling får sin egen besked — Genberegn point, ikke bagfyldning', () => {
    const r = kontrollerSpiller({ uid: 'u1', totalPoints: 12 }, ingen);
    expect(r.noter).toEqual(['INGEN OPDELING — kør Genberegn point for spillet']);
    expect(r.noter.join()).not.toMatch(/SUM/);
  });

  it('en manglende total læses som 0, og tal som tekst afrundes til én decimal', () => {
    const r = kontrollerSpiller({ uid: 'u1', totalPoints: '15.24', opdeling: { p1x2: '10.0', chance: 0, combi: 5.2, pulje: 0 } }, ingen);
    expect(r).toMatchObject({ total: 15.2, p1x2: 10, sum: 15.2, noter: [] });
    expect(kontrollerSpiller({ uid: 'u2', opdeling: { p1x2: 0, chance: 0, combi: 0, pulje: 0 } }, ingen).total).toBe(0);
  });
});

describe('kontrollerSpiller — Chancen', () => {
  const tabt = (uid) => ({ uid, totalPoints: 7, opdeling: { p1x2: 10, chance: -3, combi: 0, pulje: 0 } });

  it('negativ Chancen UDEN indsats er fejlen, hele bagfyldningen findes for', () => {
    const r = kontrollerSpiller(tabt('u1'), ingen);
    expect(r.noter).toEqual(['CHANCEN NEGATIV UDEN INDSATS — bet-pointene følger ikke reglen, genscor (bagfyld)']);
  });

  it('negativ Chancen MED indsats er bare en tabt indsats', () => {
    expect(kontrollerSpiller(tabt('u1'), new Set(['u1'])).noter).toEqual([]);
  });

  it('indsatsen skal være SPILLERENS egen — en andens indsats frikender ikke', () => {
    expect(kontrollerSpiller(tabt('u1'), new Set(['u2'])).noter).toHaveLength(1);
  });

  it('afrundingsstøj (−0,04) og −0 er ikke negativ', () => {
    for (const chance of [-0.04, -0]) {
      const r = kontrollerSpiller({ uid: 'u1', totalPoints: 10, opdeling: { p1x2: 10, chance, combi: 0, pulje: 0 } }, ingen);
      expect(r.noter).toEqual([]);
    }
  });

  it('begge fejl kan stå på samme spiller og tæller hver for sig', () => {
    const r = kontrollerSpiller({ uid: 'u1', totalPoints: 20, opdeling: { p1x2: 10, chance: -3, combi: 0, pulje: 0 } }, ingen);
    expect(r.noter).toHaveLength(2);
  });
});

describe('harIndsatsAf', () => {
  it('samler uids med chanceStake > 0 — 0, udeladt og ugyldigt tæller ikke; tekst-tal gør', () => {
    const s = harIndsatsAf([
      { uid: 'a', chanceStake: 2 }, { uid: 'b', chanceStake: 0 }, { uid: 'c' },
      { uid: 'd', chanceStake: 'x' }, { uid: 'e', chanceStake: '3' }, { chanceStake: 5 },
    ]);
    expect([...s].sort()).toEqual(['a', 'e']);
  });
});

describe('vurder + tabel', () => {
  const spillere = [
    { uid: 'lav', totalPoints: 5, opdeling: { p1x2: 5, chance: 0, combi: 0, pulje: 0 } },
    { uid: 'top', totalPoints: 30.5, opdeling: { p1x2: 20, chance: 2, combi: 8.5, pulje: 0 } },
    { uid: 'skaev', totalPoints: 9, opdeling: { p1x2: 10, chance: -3, combi: 0, pulje: 0 } },
  ];
  const bets = [{ uid: 'top', chanceStake: 2 }];

  it('sorterer som stillingen, tæller fejl og summerer totalerne', () => {
    const v = vurder(spillere, bets);
    expect(v.rows.map((r) => r.uid)).toEqual(['top', 'skaev', 'lav']);
    expect(v.fejl).toBe(2); // skæv: sum 7 ≠ 9 OG negativ chance uden indsats
    expect(v.iAlt).toBe(44.5);
  });

  it('tabellen siger ok på de rene rækker, fejlen på den skæve, I ALT og LÆS-ONLY', () => {
    const v = vurder(spillere, bets);
    const t = tabel(v, new Map([['top', 'Bibamus']]), 'superliga2627').join('\n');
    expect(t).toMatch(/^VERIFICÉR TOTALER · superliga2627/);
    expect(t).toMatch(/Bibamus .*30\.5 {2}ok$/m);
    expect(t).toMatch(/^lav .*5 {2}ok$/m);
    expect(t).toMatch(/^skaev .*SUM 7 ≠ TOTAL 9 · CHANCEN NEGATIV UDEN INDSATS/m);
    expect(t).not.toMatch(/^skaev .*ok$/m);
    expect(t).toMatch(/^I ALT +44\.5$/m);
    expect(t).toContain('⚠️  2 problem(er) fundet.');
    expect(t).not.toContain('✓ Ingen fejl fundet.');
    expect(t).toContain('LÆS-ONLY — der er ikke skrevet noget.');
  });

  it('uden fejl lyser ✓ — og ikke ⚠️', () => {
    const t = tabel(vurder(spillere.slice(0, 2), bets), new Map(), 'x').join('\n');
    expect(t).toContain('✓ Ingen fejl fundet.');
    expect(t).not.toContain('⚠️');
  });

  it('et spil uden spillere er ikke en fejl', () => {
    const v = vurder([], []);
    expect(v).toEqual({ rows: [], fejl: 0, iAlt: 0 });
  });
});
