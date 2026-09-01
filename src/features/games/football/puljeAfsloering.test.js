import { describe, it, expect } from 'vitest';
import {
  erAfgjort, holdTilslutning, puljeRangliste, puljeVindere,
} from './puljeAfsloering';

const VALG = { antal: 3, perTeam: 4, perfectBonus: 10 };
const HOLD = [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }];

describe('erAfgjort — én kilde til tallet, aldrig to', () => {
  it('afgjort først når ALLE dokumenter har serverens correct', () => {
    expect(erAfgjort([{ correct: 3 }, { correct: 1 }])).toBe(true);
    expect(erAfgjort([{ correct: 3 }, {}])).toBe(false);
    // 0 rigtige er et RIGTIGT svar — feltet findes, så det tæller som afgjort.
    expect(erAfgjort([{ correct: 0 }])).toBe(true);
  });

  it('et TOMT felt er ikke afgjort — [].every() er sand', () => {
    // Uden vagten ville en tom liste blive kaldt endelig, og fladen ville
    // sige "afgjort" om et spil, hvor ingen har tippet.
    expect(erAfgjort([])).toBe(false);
    expect(erAfgjort(null)).toBe(false);
  });

  it('en ikke-numerisk correct tæller ikke som afgjort', () => {
    expect(erAfgjort([{ correct: null }])).toBe(false);
    expect(erAfgjort([{ correct: '3' }])).toBe(false);
  });
});

describe('holdTilslutning — konsensus og enegængere på HELE spillet', () => {
  const BETS = [
    { uid: 'u1', championship: ['A', 'B', 'C'] },
    { uid: 'u2', championship: ['A', 'B', 'D'] },
    { uid: 'u3', championship: ['A', 'B', 'C'] },
  ];

  it('tæller pr. hold og sorterer efter tilslutning', () => {
    const r = holdTilslutning(BETS, HOLD);
    expect(r.map((x) => [x.navn, x.antal])).toEqual([
      ['A', 3], ['B', 3], ['C', 2], ['D', 1],
    ]);
  });

  it('udpeger enegængeren — og KUN når præcis én har valgt holdet', () => {
    const r = holdTilslutning(BETS, HOLD);
    expect(r.find((x) => x.navn === 'D').enesteUid).toBe('u2');
    expect(r.find((x) => x.navn === 'C').enesteUid).toBeNull();
    expect(r.find((x) => x.navn === 'A').enesteUid).toBeNull();
  });

  it('et hold, INGEN har valgt, står med 0 og uden enegænger', () => {
    const r = holdTilslutning([{ uid: 'u1', championship: ['A'] }], HOLD);
    const d = r.find((x) => x.navn === 'D');
    expect(d.antal).toBe(0);
    expect(d.enesteUid).toBeNull();
  });

  it('et dublet-hold i ét tip tæller ÉN gang', () => {
    // Reglerne burde forhindre det, men et gammelt dokument kunne bære det,
    // og en enegænger, der talte sig selv to gange, ville forsvinde.
    const r = holdTilslutning([{ uid: 'u1', championship: ['A', 'A'] }], HOLD);
    expect(r.find((x) => x.navn === 'A').antal).toBe(1);
    expect(r.find((x) => x.navn === 'A').enesteUid).toBe('u1');
  });

  it('tåler tip uden championship', () => {
    expect(() => holdTilslutning([{ uid: 'u1' }, { uid: 'u2', championship: null }], HOLD)).not.toThrow();
    expect(holdTilslutning([{ uid: 'u1' }], HOLD).every((x) => x.antal === 0)).toBe(true);
  });
});

describe('puljeRangliste — én liga ad gangen', () => {
  const MEDLEMMER = [
    { uid: 'u1', name: 'Anna' }, { uid: 'u2', name: 'Bo' }, { uid: 'u3', name: 'Carla' },
  ];
  const BETS = [
    { uid: 'u1', championship: ['A', 'B', 'C'] },  // 3 rigtige
    { uid: 'u2', championship: ['A', 'D', 'D'] },  // 1 rigtig
    { uid: 'u9', championship: ['A', 'B', 'C'] },  // uden for ligaen
  ];
  const FACIT = ['A', 'B', 'C'];

  it('skærer mod ligaens medlemmer — en fremmed kommer ikke med', () => {
    const r = puljeRangliste(BETS, MEDLEMMER, FACIT, VALG);
    expect(r.map((x) => x.uid)).toEqual(['u1', 'u2', 'u3']);
    expect(r.some((x) => x.uid === 'u9')).toBe(false);
  });

  it('"tippede ikke" er IKKE "0 rigtige" — og ligger sidst', () => {
    const r = puljeRangliste(BETS, MEDLEMMER, FACIT, VALG);
    const carla = r.find((x) => x.uid === 'u3');
    expect(carla.tippede).toBe(false);
    expect(carla.rigtige).toBeNull();     // ikke 0
    expect(r[r.length - 1].uid).toBe('u3');
  });

  it('en, der tippede og ramte NUL, ligger FØR en, der ikke tippede', () => {
    const r = puljeRangliste(
      [{ uid: 'u2', championship: ['D', 'D', 'D'] }], MEDLEMMER, FACIT, VALG,
    );
    expect(r[0].uid).toBe('u2');
    expect(r[0].tippede).toBe(true);
    expect(r[0].rigtige).toBe(0);
  });

  it('sorterer efter rigtige, så på navn', () => {
    const r = puljeRangliste(BETS, MEDLEMMER, FACIT, VALG);
    expect(r[0].navn).toBe('Anna');
    expect(r[0].rigtige).toBe(3);
    expect(r[1].navn).toBe('Bo');
    expect(r[1].rigtige).toBe(1);
  });

  it('AFGJORT bruger serverens tal, ikke klientens regnestykke', () => {
    // De to kan være uenige — serveren afregner først, når alle KAMPE har
    // mål, klienten regner så snart tabellen er komplet.
    const afgjorteBets = [{ uid: 'u1', championship: ['A', 'B', 'C'], correct: 2, points: 8 }];
    const r = puljeRangliste(afgjorteBets, MEDLEMMER, FACIT, VALG, true);
    expect(r[0].rigtige).toBe(2);   // serverens 2, ikke klientens 3
    expect(r[0].point).toBe(8);
  });
});

describe('puljeVindere — sæsonens udbetaling', () => {
  const R = (uid, navn, rigtige) => ({ uid, navn, tippede: true, rigtige });

  it('kårer den bedste', () => {
    expect(puljeVindere([R('a', 'Anna', 5), R('b', 'Bo', 3)]).map((x) => x.navn))
      .toEqual(['Anna']);
  });

  it('DELT førsteplads navngiver alle — en delt sejr er stadig en sejr', () => {
    expect(puljeVindere([R('a', 'Anna', 4), R('b', 'Bo', 4), R('c', 'C', 1)]).map((x) => x.navn))
      .toEqual(['Anna', 'Bo']);
  });

  it('ingen vinder, når ingen ramte noget — nul er ikke en sejr', () => {
    expect(puljeVindere([R('a', 'Anna', 0), R('b', 'Bo', 0)])).toBeNull();
  });

  it('ingen vinder uden tip', () => {
    expect(puljeVindere([{ uid: 'a', navn: 'Anna', tippede: false, rigtige: null }])).toBeNull();
    expect(puljeVindere([])).toBeNull();
  });
});
