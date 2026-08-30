/**
 * Tests for rundens point + kronen.
 *
 * To ting bæres af dem, som ingen anden test kan se:
 *  1. At kronen ikke kan uddeles på et nul — en runde, hele feltet tabte, må
 *     ikke krone samtlige deltagere.
 *  2. At en runde FØR ligaens startrunde aldrig kan blive "rundens" runde.
 *     Ellers ser to venner i hver sin liga hvert sit tal for det samme.
 */
import { describe, it, expect } from 'vitest';
import { sidsteRunde, rundensPoint, rundeFoerende } from './rundePoint';
import { UDEN_RUNDE } from '../../lib/ligaPoint';

const r = (uid, perRound) => ({ uid, perRound });

describe('sidsteRunde', () => {
  it('tager den HØJESTE rundenøgle på tværs af feltet', () => {
    expect(sidsteRunde([r('a', { 3: 5, 7: 2 }), r('b', { 5: 1, 9: 4 })])).toBe(9);
  });

  it('"uden" er ikke en runde — kampe uden rundenummer kan ikke være rundens', () => {
    expect(sidsteRunde([r('a', { 4: 3, uden: 12 })])).toBe(4);
  });

  it('ANTAGELSEN bag: UDEN_RUNDE er ikke et tal', () => {
    // sidsteRunde har ingen egen vagt for 'uden' — Number.isFinite kaster den
    // ud, fordi Number('uden') er NaN. En ekstra vagt ville være en anden vagt
    // om samme regel og kunne fjernes med grøn suite. Derfor testes antagelsen
    // direkte: ændres nøglen til noget numerisk, bliver DENNE rød, og så ved
    // den næste, at vagten skal skrives.
    expect(Number.isFinite(Number(UDEN_RUNDE))).toBe(false);
  });

  it('kun "uden" giver null — der er ingen runde at vise', () => {
    expect(sidsteRunde([r('a', { uden: 12 })])).toBeNull();
  });

  it('runder FØR ligaens startrunde tæller ikke med', () => {
    // Ligaen starter i runde 20: runde 3 findes ikke for den.
    expect(sidsteRunde([r('a', { 3: 9, 21: 2 })], 20)).toBe(21);
    expect(sidsteRunde([r('a', { 3: 9 })], 20)).toBeNull();
  });

  it('tomt felt og manglende vektorer giver null, ikke et kast', () => {
    expect(sidsteRunde([])).toBeNull();
    expect(sidsteRunde(null)).toBeNull();
    expect(sidsteRunde([r('a', null), { uid: 'b' }])).toBeNull();
  });

  it('numerisk og ikke alfabetisk: runde 10 slår runde 9', () => {
    // '9' > '10' som strenge — fejlen ville stå ubemærket resten af sæsonen.
    expect(sidsteRunde([r('a', { 9: 1, 10: 1 })])).toBe(10);
  });
});

describe('rundensPoint', () => {
  it('giver tallet for netop den runde', () => {
    expect(rundensPoint(r('a', { 8: 12.3 }), 8)).toBe(12.3);
  });

  it('giver null for en runde uden nøgle — IKKE nul', () => {
    // Serveren springer nul-værdier over (pointOpdeling.js:339), så "ingen
    // nøgle" dækker BÅDE den, der ramte alt forbi, og den der ikke tippede.
    // De må ikke vises som 0, for så anklages den sidste for noget andet,
    // end der skete.
    expect(rundensPoint(r('a', { 7: 5 }), 8)).toBeNull();
  });

  it('et ægte 0 i vektoren vises som 0', () => {
    // Kan i praksis ikke skrives af serveren i dag, men funktionen må ikke
    // selv finde på at skjule det, hvis den regel ændrer sig.
    expect(rundensPoint(r('a', { 8: 0 }), 8)).toBe(0);
  });

  it('negative point overlever — en tabt chance er et rigtigt tal', () => {
    expect(rundensPoint(r('a', { 8: -5 }), 8)).toBe(-5);
  });

  it('null runde eller manglende vektor giver null', () => {
    expect(rundensPoint(r('a', { 8: 1 }), null)).toBeNull();
    expect(rundensPoint({ uid: 'a' }, 8)).toBeNull();
    expect(rundensPoint(null, 8)).toBeNull();
  });
});

describe('rundeFoerende — hvem fører runden', () => {
  it('markerer den højeste', () => {
    expect([...rundeFoerende([r('a', { 8: 5 }), r('b', { 8: 12 })], 8)]).toEqual(['b']);
  });

  it('UAFGJORT DELES — begge fører', () => {
    const ud = rundeFoerende([r('a', { 8: 12 }), r('b', { 8: 12 }), r('c', { 8: 3 })], 8);
    expect([...ud].sort()).toEqual(['a', 'b']);
  });

  it('NUL FØRER IKKE — en runde hele feltet tabte markerer ingen', () => {
    // Uden vagten ville alle tre stå som førende, og det ville intet betyde.
    expect(rundeFoerende([r('a', { 8: 0 }), r('b', { 8: 0 })], 8).size).toBe(0);
  });

  it('et felt hvor alle er i MINUS markerer ingen', () => {
    expect(rundeFoerende([r('a', { 8: -2 }), r('b', { 8: -5 })], 8).size).toBe(0);
  });

  it('en positiv slår en negativ — føringen findes stadig', () => {
    expect([...rundeFoerende([r('a', { 8: -2 }), r('b', { 8: 0.5 })], 8)]).toEqual(['b']);
  });

  it('EN MANGLENDE NØGLE ER IKKE NUL — den udenforstående trækker ikke feltet ned', () => {
    // c er ikke i runden. Havde han talt som 0, ville han stadig ikke føre —
    // men vagten skal gælde, også når ALLE de deltagende er i minus.
    const ud = rundeFoerende([r('a', { 8: -1 }), r('b', { 8: -3 }), r('c', { 7: 9 })], 8);
    expect(ud.size).toBe(0);
  });

  it('føringen regnes af det VISTE felt — en vinder i en anden liga tæller ikke', () => {
    // Kaldes med de rækker, stillingen faktisk viser. Står ligaens bedste
    // uden for filteret, er føringen ligaens egen.
    const vist = [r('a', { 8: 4 }), r('b', { 8: 2 })];
    expect([...rundeFoerende(vist, 8)]).toEqual(['a']);
  });

  it('ingen runde giver ingen fører', () => {
    expect(rundeFoerende([r('a', { 8: 5 })], null).size).toBe(0);
  });
});
