import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  gammelCombi, udledFoer, vaelgGren, byggMail, dk,
} = require('./pointOpdateringMail');
const { buildRoundContext } = require('./pointOpdeling');

describe('gammelCombi — FROSSEN regel, må aldrig "rettes"', () => {
  it('loft 25 ved nul fejl, 12 ved én, nul fra to og op', () => {
    expect(gammelCombi([2, 3, 2, 2, 2, 2], 6)).toBe(25);   // produkt 96 → loft
    expect(gammelCombi([2, 3], 2)).toBe(6);                // under loftet
    expect(gammelCombi([2, 3, 2, 2, 2], 6)).toBe(12);      // én fejl → loft 12
    expect(gammelCombi([2, 3, 2, 2], 6)).toBe(0);          // to fejl → nul
  });
  it('kræver mindst to kampe i runden', () => {
    expect(gammelCombi([2], 1)).toBe(0);
  });
  it('robust mod skrald', () => {
    expect(gammelCombi(null, 6)).toBe(0);
    expect(gammelCombi([0, 3], 2)).toBe(0);
    expect(gammelCombi([-2, -3], 2)).toBe(0);
  });
});

// Kernen: kan vi genskabe "før" ud af det, der står i basen NU?
describe('udledFoer', () => {
  const kampe = [
    { id: 'm1', round: 1, result: '1', odds: { 1: 2.0, X: 4, 2: 4 } },
    { id: 'm2', round: 1, result: 'X', odds: { 1: 4, X: 3.0, 2: 4 } },
    { id: 'm3', round: 1, result: '2', odds: { 1: 4, X: 4, 2: 2.5 } },
  ];
  const ctx = () => buildRoundContext(kampe);

  it('trækker præcis ét point fra pr. træffer', () => {
    // Tre træffere: 1X2 nu = (2+1)+(3+1)+(2,5+1) = 11,5 → før = 8,5
    const bets = [
      { matchId: 'm1', pick: '1' }, { matchId: 'm2', pick: 'X' }, { matchId: 'm3', pick: '2' },
    ];
    const f = udledFoer({ opdeling: { p1x2: 11.5, chance: 0, combi: 9.5, pulje: 0 } }, bets, ctx());
    expect(f.traeffere).toBe(3);
    expect(f.p1x2).toBe(8.5);
  });

  it('lader Chancen og puljen stå — de er uændrede af reglen', () => {
    const bets = [{ matchId: 'm1', pick: '1' }];
    const f = udledFoer({ opdeling: { p1x2: 3, chance: 7.5, combi: 0, pulje: 24 } }, bets, ctx());
    expect(f.chance).toBe(7.5);
    expect(f.pulje).toBe(24);
  });

  it('regner den gamle combi af HELE runden, ikke af ugens kupon', () => {
    // Alle tre ramt → gammel combi = 2,0 × 3,0 × 2,5 = 15
    const bets = [
      { matchId: 'm1', pick: '1' }, { matchId: 'm2', pick: 'X' }, { matchId: 'm3', pick: '2' },
    ];
    const f = udledFoer({ opdeling: { p1x2: 11.5, chance: 0, combi: 0, pulje: 0 } }, bets, ctx());
    expect(f.combi).toBe(15);
  });

  it('gav INTET i gammel combi, hvis man ikke havde tippet hele runden', () => {
    // To af tre tippet og ramt — den gamle regel krævede alle tre.
    const bets = [{ matchId: 'm1', pick: '1' }, { matchId: 'm2', pick: 'X' }];
    const f = udledFoer({ opdeling: { p1x2: 7, chance: 0, combi: 4.9, pulje: 0 } }, bets, ctx());
    expect(f.combi).toBe(0);
  });

  it('gav INTET ved to fejl, uanset hvor svære kampene var', () => {
    const bets = [
      { matchId: 'm1', pick: '1' }, { matchId: 'm2', pick: '1' }, { matchId: 'm3', pick: '1' },
    ];
    const f = udledFoer({ opdeling: { p1x2: 3, chance: 0, combi: 0, pulje: 0 } }, bets, ctx());
    expect(f.combi).toBe(0);
    expect(f.traeffere).toBe(1);
  });

  it('venter på en runde, der ikke er afgjort', () => {
    const halv = buildRoundContext([
      { id: 'm1', round: 1, result: '1', odds: { 1: 2, X: 4, 2: 4 } },
      { id: 'm2', round: 1, result: null, odds: { 1: 4, X: 3, 2: 4 } },
    ]);
    const f = udledFoer({ opdeling: { p1x2: 3, chance: 0, combi: 0, pulje: 0 } },
      [{ matchId: 'm1', pick: '1' }], halv);
    expect(f.combi).toBe(0);
  });

  it('gulver totalen ved 0', () => {
    const f = udledFoer({ opdeling: { p1x2: 1, chance: -20, combi: 0, pulje: 0 } },
      [{ matchId: 'm1', pick: '1' }], ctx());
    expect(f.total).toBe(0);
  });
});

describe('vaelgGren', () => {
  const g = (fc, ft, ec, et) => vaelgGren(
    { combi: fc, total: ft }, { combi: ec, total: et },
  );
  // Den, hvis combi FALDER, må ikke få "du har fået point tilbage" oven over
  // sit eget faldende tal.
  it('combiNed når combi falder — også når totalen stiger', () => {
    expect(g(25, 40, 20.7, 41.7)).toBe('combiNed');
  });
  it('franul når combi gik fra nul til noget', () => {
    expect(g(0, 10.9, 10.1, 25)).toBe('franul');
  });
  it('op når combi steg, men ikke fra nul', () => {
    expect(g(12, 25.2, 15.5, 33.7)).toBe('op');
  });
  // "Alle går op" er direkte usandt for den, der står stille.
  it('urort når totalen ikke rykkede sig', () => {
    expect(g(0, 0, 0, 0)).toBe('urort');
  });
});

describe('dk — dansk komma', () => {
  it('bruger komma og dropper overflødig decimal', () => {
    expect(dk(33.7)).toBe('33,7');
    expect(dk(25)).toBe('25');
    expect(dk(0)).toBe('0');
  });
});

describe('byggMail', () => {
  const arg = (foer, efter) => ({
    navn: 'Anna', foer, efter, appUrl: 'https://tip.vejleaa.dk', gameId: 'superliga2627',
  });

  it('skriver spillerens navn og et link til stillingen', () => {
    const m = byggMail(arg(
      { p1x2: 13.2, chance: 0, combi: 12, pulje: 0, total: 25.2, traeffere: 5 },
      { p1x2: 18.2, chance: 0, combi: 15.5, pulje: 0, total: 33.7 },
    ));
    expect(m.tekst).toContain('Hej Anna');
    expect(m.tekst).toContain('https://tip.vejleaa.dk/spil/superliga2627?fane=stilling');
    expect(m.tekst).toContain('fra 25,2 til 33,7');
  });

  // Den, der ikke rykkede sig, må ALDRIG få et emne om point, han ikke fik.
  it('giver den urørte sin egen emnelinje', () => {
    const m = byggMail(arg(
      { p1x2: 0, chance: 0, combi: 0, pulje: 0, total: 0, traeffere: 0 },
      { p1x2: 0, chance: 0, combi: 0, pulje: 0, total: 0 },
    ));
    expect(m.gren).toBe('urort');
    expect(m.emne).not.toContain('point tilbage');
    expect(m.tekst).not.toContain('point tilbage');
    expect(m.tekst).toContain('ikke taget noget');
  });

  it('siger det lige ud til den, hvis combi falder', () => {
    const m = byggMail(arg(
      { p1x2: 15, chance: 0, combi: 25, pulje: 0, total: 40, traeffere: 6 },
      { p1x2: 21, chance: 0, combi: 20.7, pulje: 0, total: 41.7 },
    ));
    expect(m.gren).toBe('combiNed');
    expect(m.tekst).toContain('går NED, fra 25 til 20,7');
    expect(m.tekst).toContain('fra 40 til 41,7');
  });

  it('nævner Chancen, når spilleren har point derfra', () => {
    const m = byggMail(arg(
      { p1x2: 13.2, chance: 1, combi: 12, pulje: 0, total: 26.2, traeffere: 5 },
      { p1x2: 18.2, chance: 1, combi: 15.5, pulje: 0, total: 34.7 },
    ));
    expect(m.tekst).toContain('Chancen');
    expect(m.tekst).toContain('34,7');
  });

  it('nævner IKKE Chancen for den, der aldrig har brugt den', () => {
    const m = byggMail(arg(
      { p1x2: 5, chance: 0, combi: 0, pulje: 0, total: 5, traeffere: 3 },
      { p1x2: 8, chance: 0, combi: 4.4, pulje: 0, total: 12.5 },
    ));
    expect(m.tekst).not.toContain('fra Chancen');
  });
});
