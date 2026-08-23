import { describe, it, expect } from 'vitest';
import { rundeSejre, faerdigeRunder } from './rundeSejre';
import { ligaPoint } from '../../lib/ligaPoint';

const kamp = (round, result) => ({ round, result });
const spiller = (uid, perRound) => ({ uid, perRound });

describe('faerdigeRunder', () => {
  it('tæller kun runder, hvor HVER kamp har facit', () => {
    const r = faerdigeRunder([
      kamp(1, '1'), kamp(1, 'X'),
      kamp(2, '1'), kamp(2, null),   // halvspillet
      kamp(3, '2'),
    ]);
    expect(r).toEqual([1, 3]);
  });

  it('venter på den UDSATTE kamp — rundekongen kåres ikke for tidligt', () => {
    // SL runde 3 strakte sig 7. august til 3. september. Uden denne regel
    // ville rundekongen skifte, hver gang en enkelt kamp faldt.
    const r = faerdigeRunder([
      kamp(3, '1'), kamp(3, '1'), kamp(3, '1'), kamp(3, '1'),
      kamp(3, null),               // den udsatte
    ]);
    expect(r).toEqual([]);
  });

  it('regner en TOM streng som manglende facit', () => {
    expect(faerdigeRunder([kamp(1, '1'), kamp(1, '')])).toEqual([]);
  });

  it('springer kampe uden rundenummer over', () => {
    expect(faerdigeRunder([kamp(1, '1'), { result: '1' }, kamp(2, '1')])).toEqual([1, 2]);
  });

  it('sorterer stigende og klarer tomt input', () => {
    expect(faerdigeRunder([kamp(9, '1'), kamp(2, '1'), kamp(5, '1')])).toEqual([2, 5, 9]);
    expect(faerdigeRunder([])).toEqual([]);
    expect(faerdigeRunder(null)).toEqual([]);
  });
});

describe('rundeSejre', () => {
  const felt = [
    spiller('a', { 1: 10, 2: 3, 3: 8 }),
    spiller('b', { 1: 4, 2: 12, 3: 8 }),
    spiller('c', { 1: 4, 2: 1, 3: 2 }),
  ];

  it('kårer den med flest point i runden', () => {
    const s = rundeSejre(felt, null, [1, 2]);
    expect(s.get('a')).toBe(1);   // runde 1
    expect(s.get('b')).toBe(1);   // runde 2
    expect(s.has('c')).toBe(false);
  });

  it('DELER sejren ved uafgjort', () => {
    // Alternativet — ingen får den — ville lade pokalen forsvinde, netop når
    // to var lige gode.
    const s = rundeSejre(felt, null, [3]);
    expect(s.get('a')).toBe(1);
    expect(s.get('b')).toBe(1);
  });

  it('uddeler INGEN sejr, når hele feltet ramte forbi', () => {
    // Ellers ville en runde, alle tabte, give en pokal til samtlige deltagere.
    const nul = [spiller('a', { 4: 0 }), spiller('b', { 4: 0 })];
    expect(rundeSejre(nul, null, [4]).size).toBe(0);
  });

  it('uddeler ingen sejr, når alle stod i minus', () => {
    const minus = [spiller('a', { 4: -2 }), spiller('b', { 4: -5 })];
    expect(rundeSejre(minus, null, [4]).size).toBe(0);
  });

  it('respekterer LIGAENS startrunde', () => {
    // Uden dette ville en liga fra runde 3 arve sejre fra runde 1 og 2.
    const s = rundeSejre(felt, 3, [1, 2, 3]);
    expect(s.get('a')).toBe(1);
    expect(s.get('b')).toBe(1);
    expect([...s.values()].reduce((x, y) => x + y, 0)).toBe(2); // kun runde 3
  });

  it('lader en spiller UDEN nøgle stå uden for runden — ikke som nul', () => {
    // Kom han først med i runde 5, skal runde 1 hverken vindes eller tabes.
    const sent = [spiller('a', { 1: -5 }), spiller('ny', { 5: 9 })];
    const s = rundeSejre(sent, null, [1]);
    expect(s.size).toBe(0);            // -5 er ikke en sejr
    expect(s.has('ny')).toBe(false);   // og den nye deltog ikke
  });

  it('kræver MERE end nul for at vinde — også over et felt i minus', () => {
    // Den ENE vagt, der bærer både "nul vinder ikke" og "en manglende nøgle
    // er ikke nul". Sænkes den til `bedst < 0`, ville en spiller uden tips
    // vinde runden fra dem, der faktisk tippede og tabte.
    const s = rundeSejre([spiller('a', { 1: -5 }), spiller('b', { 1: 0 })], null, [1]);
    expect(s.size).toBe(0);
    // Og med ét positivt tal i feltet er der en vinder igen.
    expect(rundeSejre([spiller('a', { 1: -5 }), spiller('b', { 1: 0.1 })], null, [1]).get('b')).toBe(1);
  });

  it('springer en spiller uden rundevektor over — den skrives af serveren', () => {
    const blandet = [spiller('a', { 1: 5 }), spiller('u', null), { uid: 'x' }];
    expect(rundeSejre(blandet, null, [1]).get('a')).toBe(1);
  });

  it('afviser ulæselige værdier i stedet for at gøre dem til nul', () => {
    const skidt = [spiller('a', { 1: 'ti' }), spiller('b', { 1: 3 })];
    const s = rundeSejre(skidt, null, [1]);
    expect(s.get('b')).toBe(1);
    expect(s.has('a')).toBe(false);
  });

  it('tæller ALDRIG nøglen "uden" som en runde', () => {
    // Kampe uden rundenummer tæller med i totalen (ligaPoint), men der findes
    // ingen "runde uden nummer" at vinde.
    const s = rundeSejre([spiller('a', { uden: 20 })], null, ['uden']);
    expect(s.size).toBe(0);
  });

  it('klarer tomt input uden at kaste', () => {
    expect(rundeSejre([], null, [1]).size).toBe(0);
    expect(rundeSejre(null, null, null).size).toBe(0);
    expect(() => rundeSejre()).not.toThrow();
  });
});

describe('samme afgrænsning som ligaPoint', () => {
  it('tæller PRÆCIS de runder, ligaens point også tæller', () => {
    // Bindingen mellem de to begreber. Ændrer nogen startrunde-filteret ét
    // sted, bliver denne test rød — modulerne ligger i hver sin fil, netop
    // fordi ligaPoint er spejlet mod serveren og dette ikke er.
    const perRound = { 1: 5, 2: 7, 3: 9, 4: 11 };
    for (const startRunde of [null, 1, 2, 3, 4, 99]) {
      // Runder, rundeSejre ville kunne kåre en vinder i (spilleren er alene,
      // så han vinder hver runde, der overhovedet tælles med).
      const talte = rundeSejre([spiller('a', perRound)], startRunde, [1, 2, 3, 4]).get('a') || 0;
      // Runder, ligaPoint lægger sammen — udledt af summen.
      const forventet = [1, 2, 3, 4]
        .filter((r) => !(Number.isFinite(startRunde) && r < startRunde)).length;
      expect(talte, `startRunde ${startRunde}`).toBe(forventet);
      // Og summen selv skal komme fra de samme runder.
      const sum = [1, 2, 3, 4]
        .filter((r) => !(Number.isFinite(startRunde) && r < startRunde))
        .reduce((s, r) => s + perRound[r], 0);
      expect(ligaPoint(perRound, startRunde, 0), `sum ${startRunde}`).toBe(sum);
    }
  });
});
