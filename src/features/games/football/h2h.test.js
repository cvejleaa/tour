import { describe, it, expect } from 'vitest';
import { bygIndbyrdes, indbyrdesLinje } from './h2h';

const kamp = (id, round, result, extra = {}) => ({
  id, round, home: `H${id}`, away: `U${id}`, result, kickoff: 1000 + Number(id), ...extra,
});

/** Runder i den form, groupByRound giver. */
const runder = (...matches) => {
  const pr = new Map();
  for (const m of matches) {
    if (!pr.has(m.round)) pr.set(m.round, []);
    pr.get(m.round).push(m);
  }
  return [...pr.entries()].map(([round, ms]) => ({ round, matches: ms }));
};

const raek = (obj) => obj;

describe('bygIndbyrdes', () => {
  it('tæller kun UENIGHEDER som opgør — enighed er ét tal, ikke en liste', () => {
    const rounds = runder(kamp('1', 1, '1'), kamp('2', 1, '2'), kamp('3', 1, 'X'));
    const r = bygIndbyrdes({
      rounds,
      mine: raek({ 1: { pick: '1' }, 2: { pick: '1' }, 3: { pick: 'X' } }),
      deres: raek({ 1: { pick: '1' }, 2: { pick: '2' }, 3: { pick: 'X' } }),
    });
    expect(r.enige).toBe(2);            // kamp 1 og 3
    expect(r.uenige).toHaveLength(1);   // kun kamp 2
    expect(r.uenige[0].id).toBe('2');
  });

  it('giver point i opgøret til den, der fik RET', () => {
    const rounds = runder(kamp('1', 1, '1'), kamp('2', 1, '2'));
    const r = bygIndbyrdes({
      rounds,
      mine: raek({ 1: { pick: '1' }, 2: { pick: '1' } }),   // ret i 1, forkert i 2
      deres: raek({ 1: { pick: 'X' }, 2: { pick: '2' } }),  // forkert i 1, ret i 2
    });
    expect(r).toMatchObject({ mig: 1, dem: 1, ingen: 0 });
  });

  it('tæller en uenighed, hvor INGEN fik ret, for sig selv', () => {
    // Begge tog fejl — det er stadig en uenighed, men ingen vandt den.
    // Uden denne gren ville tallene ikke summe op, og en 0-0-uenighed ville
    // tavst forsvinde fra opgørelsen.
    const rounds = runder(kamp('1', 1, 'X'));
    const r = bygIndbyrdes({
      rounds,
      mine: raek({ 1: { pick: '1' } }),
      deres: raek({ 1: { pick: '2' } }),
    });
    expect(r).toMatchObject({ mig: 0, dem: 0, ingen: 1 });
    expect(r.uenige[0]).toMatchObject({ minRet: false, deresRet: false });
  });

  it('regner ikke en kamp, kun den ene har tippet, som en uenighed', () => {
    // Ingen valgte imod nogen. Tælles for sig, så tallene kan summe op.
    const rounds = runder(kamp('1', 1, '1'), kamp('2', 1, '1'));
    const r = bygIndbyrdes({
      rounds,
      mine: raek({ 1: { pick: '2' } }),
      deres: raek({ 2: { pick: '2' } }),
    });
    expect(r).toMatchObject({ kunMig: 1, kunDem: 1, mig: 0, dem: 0 });
    expect(r.uenige).toEqual([]);
  });

  it('springer kampe UDEN facit over — der er intet opgør endnu', () => {
    const rounds = runder(kamp('1', 1, null), kamp('2', 1, ''), kamp('3', 1, '1'));
    const r = bygIndbyrdes({
      rounds,
      mine: raek({ 1: { pick: '1' }, 2: { pick: '1' }, 3: { pick: '1' } }),
      deres: raek({ 1: { pick: '2' }, 2: { pick: '2' }, 3: { pick: '2' } }),
    });
    expect(r.uenige).toHaveLength(1);
    expect(r.uenige[0].id).toBe('3');
  });

  it('afviser et ugyldigt valg i stedet for at kalde det en uenighed', () => {
    // '?' eller et tomt felt er ikke et 1X2-valg. Uden vagten ville det tælle
    // som en uenighed, modparten automatisk vandt.
    const rounds = runder(kamp('1', 1, '1'));
    for (const daarlig of ['?', '', null, undefined, 0, 'Y']) {
      const r = bygIndbyrdes({
        rounds,
        mine: raek({ 1: { pick: daarlig } }),
        deres: raek({ 1: { pick: '1' } }),
      });
      expect(r.uenige, String(daarlig)).toEqual([]);
      expect(r.kunDem, String(daarlig)).toBe(1);
    }
  });

  it('sorterer uenighederne NYESTE først', () => {
    const rounds = runder(kamp('1', 1, '1'), kamp('9', 9, '1'), kamp('5', 5, '1'));
    const r = bygIndbyrdes({
      rounds,
      mine: raek({ 1: { pick: '1' }, 9: { pick: '1' }, 5: { pick: '1' } }),
      deres: raek({ 1: { pick: '2' }, 9: { pick: '2' }, 5: { pick: '2' } }),
    });
    expect(r.uenige.map((u) => u.round)).toEqual([9, 5, 1]);
  });

  it('tager point fra serverens rækker og regner ikke selv', () => {
    const rounds = runder(kamp('1', 1, '1'));
    const r = bygIndbyrdes({
      rounds,
      mine: raek({ 1: { pick: '1', points: 4.2 } }),
      deres: raek({ 1: { pick: '2', points: -3 } }),
    });
    expect(r.uenige[0]).toMatchObject({ minPoint: 4.2, deresPoint: -3 });
  });

  it('afgjorteSammen er enige + uenige — regnet ét sted', () => {
    const rounds = runder(kamp('1', 1, '1'), kamp('2', 1, '1'), kamp('3', 1, '1'));
    const r = bygIndbyrdes({
      rounds,
      mine: raek({ 1: { pick: '1' }, 2: { pick: '1' }, 3: { pick: '1' } }),
      deres: raek({ 1: { pick: '1' }, 2: { pick: '2' }, 3: { pick: '2' } }),
    });
    expect(r.afgjorteSammen).toBe(r.enige + r.uenige.length);
    expect(r.afgjorteSammen).toBe(3);
  });

  it('klarer tomme og manglende data uden at kaste', () => {
    expect(bygIndbyrdes({ rounds: [], mine: {}, deres: {} })).toMatchObject({
      enige: 0, uenige: [], mig: 0, dem: 0, afgjorteSammen: 0,
    });
    expect(() => bygIndbyrdes({})).not.toThrow();
    expect(bygIndbyrdes({ rounds: null, mine: null, deres: null }).uenige).toEqual([]);
  });
});

describe('indbyrdesLinje', () => {
  it('siger hvem der fører — og med hvilke tal', () => {
    expect(indbyrdesLinje({ mig: 5, dem: 3, uenige: new Array(9) }, 'Morten'))
      .toBe('I har været uenige om 9 kampe. Du fører 5-3.');
    expect(indbyrdesLinje({ mig: 3, dem: 5, uenige: new Array(9) }, 'Morten'))
      .toBe('I har været uenige om 9 kampe. Morten fører 5-3.');
  });

  it('bøjer "én kamp" korrekt', () => {
    expect(indbyrdesLinje({ mig: 1, dem: 0, uenige: [1] }, 'Morten'))
      .toContain('uenige om én kamp');
  });

  it('siger det, når det står lige — uden at udpege en fører', () => {
    const l = indbyrdesLinje({ mig: 4, dem: 4, uenige: new Array(8) }, 'Morten');
    expect(l).toBe('I har været uenige om 8 kampe. Det står 4-4.');
    expect(l).not.toContain('fører');
  });

  it('har en ægte tom-tilstand i stedet for "0-0"', () => {
    // En tabel med nul rækker er den fejl, Beskeder-fanen var. Her siges det.
    const l = indbyrdesLinje({ mig: 0, dem: 0, uenige: [] }, 'Morten');
    expect(l).toBe('I har endnu ikke været uenige om en afgjort kamp.');
    expect(l).not.toContain('0-0');
  });

  it('bruger ALDRIG procenter — et opgør er 5-3, ikke 62,5 %', () => {
    // Træfprocent mellem to venner ville mest vise, at sæsonen var tilfældig.
    for (const sag of [{ mig: 5, dem: 3, uenige: new Array(8) }, { mig: 0, dem: 0, uenige: [] }]) {
      expect(indbyrdesLinje(sag, 'Morten')).not.toMatch(/%/);
    }
  });
});
