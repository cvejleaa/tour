import { describe, it, expect } from 'vitest';
import { medStilling } from './maalRaekke';

const m = (minut, hold) => ({ minut, hold, scorer: `S${minut}` });

describe('medStilling', () => {
  it('tæller stillingen op EFTER hvert mål', () => {
    expect(medStilling([m(12, 'home'), m(40, 'away'), m(70, 'home')])
      .map((g) => `${g.hjemme}-${g.ude}`)).toEqual(['1-0', '1-1', '2-1']);
  });

  it('den sidste stilling ER slutresultatet', () => {
    // Hele pointen med at udlede frem for at gemme: rækken kan ikke komme i
    // modstrid med kampens facit, fordi den er talt af de samme mål.
    const r = medStilling([m(5, 'away'), m(60, 'away'), m(88, 'home')]);
    expect(`${r.at(-1).hjemme}-${r.at(-1).ude}`).toBe('1-2');
  });

  it('SORTERER på minut — en byttet rækkefølge ville gøre HVER mellemstilling forkert', () => {
    // Det er dét, der gør funktionen værd at have: uden sorteringen ville
    // 70' stå som 1-0 og 12' som 2-1, altså en kamp, der aldrig blev spillet.
    expect(medStilling([m(70, 'home'), m(12, 'home'), m(40, 'away')])
      .map((g) => `${g.minut}:${g.hjemme}-${g.ude}`))
      .toEqual(['12:1-0', '40:1-1', '70:2-1']);
  });

  it('bevarer serverens rækkefølge for mål i SAMME minut', () => {
    // Stabil sortering. Vendte den om, ville 45:0-1 komme før 45:1-0 og
    // begge mellemstillinger blive byttet.
    expect(medStilling([m(45, 'home'), m(45, 'away')])
      .map((g) => `${g.hjemme}-${g.ude}`)).toEqual(['1-0', '1-1']);
  });

  it('rører ikke listen, den fik', () => {
    const ind = [m(70, 'home'), m(12, 'away')];
    medStilling(ind);
    expect(ind.map((g) => g.minut)).toEqual([70, 12]);
  });

  it('springer poster uden brugbart hold over frem for at tælle dem forkert', () => {
    // Et mål uden side kan ikke placeres i stillingen. At gætte 'home' ville
    // give en række, der ser rigtig ud og er forkert — og som ville modsige
    // kampens facit uden at nogen kunne se hvorfor.
    expect(medStilling([m(10, 'home'), { minut: 20 }, m(30, 'away'), null])
      .map((g) => `${g.hjemme}-${g.ude}`)).toEqual(['1-0', '1-1']);
  });

  it('tom eller ugyldig ind giver tom ud', () => {
    for (const v of [[], null, undefined, 'ikke en liste', 42]) {
      expect(medStilling(v), String(v)).toEqual([]);
    }
  });
});
