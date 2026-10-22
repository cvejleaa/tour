// ---------------------------------------------------------------------------
// EN LIGAS RUBRIKKER — summen af `opdelingPerRunde` for de runder, ligaen
// tæller. Bindingen til ligaPoint er det vigtigste her: to definitioner af
// "talt runde" ville give en tabel, hvis I alt ikke er stillingens tal — den
// fejl, hele ændringen handler om.
// ---------------------------------------------------------------------------
import { describe, it, expect } from 'vitest';
import { ligaOpdeling, RUNDE_RUBRIKKER } from './ligaOpdeling';
import { ligaPoint, puljenTaeller, PULJE_MAKS_STARTRUNDE, UDEN_RUNDE } from '../../lib/ligaPoint';
import { RUBRIKKER } from './football/PointOpdeling';

const round1 = (n) => Math.round(n * 10) / 10;

// Fire runder med hver sin blanding. Chancen er negativ i runde 3 — ligaens
// sum er stadig positiv, så gulvet ikke blander sig i bindingstesten.
const PER_ROUND = { 1: 10, 2: 5, 3: -2, 4: 8 };
const RUBRIKKER_PR_RUNDE = {
  1: { p1x2: 7, chance: 2, combi: 1 },
  2: { p1x2: 4.5, chance: 0.5, combi: 0 },
  3: { p1x2: 3, chance: -5, combi: 0 },
  4: { p1x2: 5, chance: 1, combi: 2 },
};

describe('ligaOpdeling', () => {
  it('lægger rubrikkerne sammen for runderne fra startrunden', () => {
    expect(ligaOpdeling(PER_ROUND, RUBRIKKER_PR_RUNDE, 3, 0))
      .toEqual({ p1x2: 8, chance: -4, combi: 2, pulje: 0 });
  });

  it('tager startrunden SELV med — `<`, ikke `<=`', () => {
    expect(ligaOpdeling({ 2: 7 }, { 2: { p1x2: 7, chance: 0, combi: 0 } }, 2, 0).p1x2).toBe(7);
  });

  it('tager alle runder med uden startrunde', () => {
    expect(ligaOpdeling(PER_ROUND, RUBRIKKER_PR_RUNDE, null, 0))
      .toEqual({ p1x2: 19.5, chance: -1.5, combi: 3, pulje: 0 });
  });

  it('tager kampe uden rundenummer med, uanset startrunde', () => {
    const v = { 1: 10, [UDEN_RUNDE]: 3 };
    const o = { 1: { p1x2: 10, chance: 0, combi: 0 }, [UDEN_RUNDE]: { p1x2: 3, chance: 0, combi: 0 } };
    expect(ligaOpdeling(v, o, 20, 0)).toEqual({ p1x2: 3, chance: 0, combi: 0, pulje: 0 });
  });

  it('springer en ulæselig runde-nøgle over, som ligaPoint gør', () => {
    const v = { 1: 10, x: 99 };
    const o = { 1: { p1x2: 10, chance: 0, combi: 0 } };
    expect(ligaOpdeling(v, o, null, 0).p1x2).toBe(10);
  });

  // Puljen følger ligaPoints regel, ikke sin egen. PULJE_MAKS_STARTRUNDE er
  // ejerens valg; her bindes kun, at de to funktioner er enige om det.
  it('lægger puljen på, når ligaen tæller den — og 0 ellers', () => {
    const v = { 1: 10 };
    const o = { 1: { p1x2: 10, chance: 0, combi: 0 } };
    expect(ligaOpdeling(v, o, null, 7).pulje).toBe(7);
    expect(ligaOpdeling(v, o, PULJE_MAKS_STARTRUNDE, 7).pulje).toBe(7);
    expect(ligaOpdeling(v, o, PULJE_MAKS_STARTRUNDE + 1, 7).pulje).toBe(0);
    expect(puljenTaeller(PULJE_MAKS_STARTRUNDE + 1)).toBe(false);
  });

  it('afrunder hver rubrik til én decimal og skriver aldrig −0', () => {
    const v = { 1: 0.1, 2: 0.2, 3: 0.3 };
    const o = {
      1: { p1x2: 0.1, chance: 0.1, combi: -0.1 },
      2: { p1x2: 0.1, chance: 0.2, combi: -0.1 },
      3: { p1x2: 0.1, chance: 0.1, combi: 0.1 },
    };
    const r = ligaOpdeling(v, o, 3, 0);
    expect(r).toEqual({ p1x2: 0.1, chance: 0.1, combi: 0.1, pulje: 0 });
    // Math.round(−0,4) er −0, og −0/10 er stadig −0. Object.is skelner,
    // toEqual gør ikke — uden `|| 0` i round1 ville tabellen vise «−0».
    const nul = ligaOpdeling({ 1: 0.06 }, { 1: { p1x2: -0.04, chance: 0.1, combi: 0 } }, null, 0);
    expect(Object.is(nul.p1x2, 0)).toBe(true);
    expect(Object.is(nul.chance, 0.1)).toBe(true);
  });

  describe('null — «har vi ikke», aldrig nuller', () => {
    const v = { 1: 10, 12: 5 };
    const o = { 1: { p1x2: 10, chance: 0, combi: 0 }, 12: { p1x2: 5, chance: 0, combi: 0 } };

    it('uden rundevektor', () => {
      expect(ligaOpdeling(null, o, 12, 0)).toBeNull();
      expect(ligaOpdeling([], o, 12, 0)).toBeNull();
    });

    it('uden rubrikker pr. runde — spilleren er ikke genberegnet endnu', () => {
      expect(ligaOpdeling(v, null, 12, 0)).toBeNull();
      expect(ligaOpdeling(v, undefined, 12, 0)).toBeNull();
      expect(ligaOpdeling(v, 'nej', 12, 0)).toBeNull();
    });

    it('når en TALT runde mangler i opdelingen — forældet efter tilbagerulning', () => {
      // Runde 12 er afgjort, efter at functions blev rullet tilbage til kode
      // uden opdelingPerRunde: vektoren har nøglen, opdelingen har den ikke.
      expect(ligaOpdeling(v, { 1: o[1] }, 12, 0)).toBeNull();
      expect(ligaOpdeling(v, { 1: o[1] }, null, 0)).toBeNull();
    });

    it('men IKKE når kun en runde FØR startrunden mangler', () => {
      // Ligaen fra runde 12 bruger ikke runde 1. Krævede vi ALLE nøgler, ville
      // en liga, der starter sent, stå med streger for noget, den ikke ser.
      expect(ligaOpdeling(v, { 12: o[12] }, 12, 0)).toEqual({ p1x2: 5, chance: 0, combi: 0, pulje: 0 });
    });

    it('når en talt rundes rubrik ikke er et tal', () => {
      for (const skidt of [{ p1x2: '5', chance: 0, combi: 0 }, { p1x2: 5, chance: NaN, combi: 0 },
        { p1x2: 5, chance: 0 }, { p1x2: 5, chance: 0, combi: null }, null, 7]) {
        expect(ligaOpdeling(v, { 1: o[1], 12: skidt }, 12, 0), JSON.stringify(skidt)).toBeNull();
      }
    });

    it('ignorerer nøgler, der KUN findes i opdelingen — totalen kender dem ikke', () => {
      expect(ligaOpdeling({ 12: 5 }, o, 12, 0)).toEqual({ p1x2: 5, chance: 0, combi: 0, pulje: 0 });
    });
  });

  it('klarer tomt input uden at kaste', () => {
    expect(ligaOpdeling({}, {}, 5, 0)).toEqual({ p1x2: 0, chance: 0, combi: 0, pulje: 0 });
    expect(() => ligaOpdeling()).not.toThrow();
    expect(ligaOpdeling()).toBeNull();
  });
});

describe('samme afgrænsning som ligaPoint', () => {
  it('summer PRÆCIS til ligaens total for hver startrunde — før gulvet', () => {
    // Bindingen mellem de to begreber. Ændrer nogen startrunde-filteret,
    // "uden"-reglen eller puljereglen ét sted, bliver denne test rød.
    const v = { ...PER_ROUND, [UDEN_RUNDE]: 1.5 };
    const o = { ...RUBRIKKER_PR_RUNDE, [UDEN_RUNDE]: { p1x2: 1.5, chance: 0, combi: 0 } };
    for (const startRunde of [null, 1, 2, 3, 4, 99]) {
      for (const pulje of [0, 7]) {
        const r = ligaOpdeling(v, o, startRunde, pulje);
        const sum = round1(RUBRIKKER.reduce((s, { key }) => s + r[key], 0));
        expect(sum, `startRunde ${startRunde}, pulje ${pulje}`).toBe(ligaPoint(v, startRunde, pulje));
      }
    }
  });

  it('gulver IKKE — det gør kun ligaPoint, og det er hele grunden til en egen funktion', () => {
    const v = { 1: 50, 12: -5 };
    const o = { 1: { p1x2: 50, chance: 0, combi: 0 }, 12: { p1x2: 2, chance: -7, combi: 0 } };
    const r = ligaOpdeling(v, o, 12, 0);
    expect(r).toEqual({ p1x2: 2, chance: -7, combi: 0, pulje: 0 });
    expect(ligaPoint(v, 12, 0)).toBe(0);
  });

  it('rubrikkerne pr. runde er præcis spillets tre — puljen er spil-niveau', () => {
    expect(RUNDE_RUBRIKKER).toEqual(RUBRIKKER.map(({ key }) => key).filter((k) => k !== 'pulje'));
  });
});
