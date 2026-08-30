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
import {
  sidsteRunde, rundensPoint, rundeFoerende, rundePile,
} from './rundePoint';
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

describe('rundePile — pilen skal måle DEN VISTE RUNDE', () => {
  const regn = (perRound, startRunde, bonus = 0) => {
    let sum = Number(bonus) || 0;
    for (const [k, v] of Object.entries(perRound || {})) {
      const n = Number(k);
      if (!Number.isFinite(n)) { sum += Number(v) || 0; continue; }
      if (Number.isFinite(startRunde) && n < startRunde) continue;
      sum += Number(v) || 0;
    }
    return Math.max(0, Math.round(sum * 10) / 10);
  };
  const harVektor = (pr) => !!pr && Object.keys(pr).length > 0;
  const spiller = (uid, name, perRound) => ({ uid, name, perRound, bonusPoints: 0 });

  it('EJERENS SAG: rundens næsthøjeste tal og INGEN pil, fordi han ikke rykkede', () => {
    // Serveren havde et forældet øjebliksbillede, og fladen gav ▼1 til en
    // spiller, der stod nummer 4 både før og efter runden.
    const raekker = [
      spiller('a', 'Marianne', { 5: 60, 6: 15.4 }),
      spiller('b', 'Better', { 5: 55, 6: 9.4 }),
      spiller('c', 'Sonja', { 5: 57, 6: 6.9 }),
      spiller('d', 'Bibamus', { 5: 50, 6: 13 }),
    ];
    const ud = rundePile(raekker, 6, null, regn, harVektor);
    const prev = Object.fromEntries(ud.map((r) => [r.name, r.previousRank]));
    // Før runde 6: Marianne 60, Sonja 57, Better 55, Bibamus 50.
    expect(prev).toEqual({ Marianne: 1, Sonja: 2, Better: 3, Bibamus: 4 });
    // Bibamus står nummer 4 nu OG var nummer 4 før → ingen pil.
  });

  it('regner FORFRA af vektoren, ikke som total minus rundens point', () => {
    // Gulvet lægges på SUMMEN, så et delta er forkert nær nul — og fixturet er
    // valgt, så de to metoder giver FORSKELLIG RANGORDEN. Ellers beviser
    // testen ingenting: første udgave brugte tal, hvor begge metoder gav samme
    // rækkefølge, og en delta-mutation overlevede.
    //
    //   Anne { 5: −10, 6: 12 }: forfra max(0, −10) = 0.  Delta: 2 − 12 = −10.
    //   Bo   { 5:  −1, 6: 0.5 }: forfra max(0,  −1) = 0.  Delta: 0 − 0,5 = −0,5.
    //
    // Forfra står de LIGE (begge 0) og deler førstepladsen. Med delta ville Bo
    // føre alene, og Anne falde til andenpladsen.
    const raekker = [
      spiller('a', 'Anne', { 5: -10, 6: 12 }),
      spiller('b', 'Bo', { 5: -1, 6: 0.5 }),
    ];
    const ud = rundePile(raekker, 6, null, regn, harVektor);
    const prev = Object.fromEntries(ud.map((r) => [r.name, r.previousRank]));
    expect(prev).toEqual({ Anne: 1, Bo: 1 });
  });

  it('respekterer ligaens startrunde — runder før den tæller ikke', () => {
    const raekker = [
      spiller('a', 'Anne', { 3: 100, 20: 5, 21: 1 }),
      spiller('b', 'Bo', { 3: 0, 20: 9, 21: 1 }),
    ];
    const ud = rundePile(raekker, 21, 20, regn, harVektor);
    const prev = Object.fromEntries(ud.map((r) => [r.name, r.previousRank]));
    // Kun runde 20 tæller før runde 21: Bo 9 mod Annes 5.
    expect(prev).toEqual({ Bo: 1, Anne: 2 });
  });

  it('uafgjort før runden giver SAMME previousRank til begge', () => {
    const ud = rundePile([
      spiller('a', 'Anne', { 5: 10, 6: 1 }),
      spiller('b', 'Bo', { 5: 10, 6: 5 }),
      spiller('c', 'Carl', { 5: 2, 6: 0.5 }),
    ], 6, null, regn, harVektor);
    const prev = Object.fromEntries(ud.map((r) => [r.name, r.previousRank]));
    expect(prev.Anne).toBe(1);
    expect(prev.Bo).toBe(1);
    expect(prev.Carl).toBe(3); // næste springer over
  });

  it('en spiller uden vektor får INGEN pil frem for en falsk', () => {
    const ud = rundePile([
      spiller('a', 'Anne', { 6: 5 }),
      { uid: 'n', name: 'Ny', perRound: null },
    ], 6, null, regn, harVektor);
    expect(ud.find((r) => r.uid === 'n').previousRank).toBeNull();
  });

  it('uden en runde røres rækkerne ikke — serverens billede beholdes', () => {
    const ind = [{ uid: 'a', name: 'Anne', previousRank: 7, perRound: { 6: 1 } }];
    expect(rundePile(ind, null, null, regn, harVektor)).toEqual(ind);
  });
});
