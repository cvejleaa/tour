/**
 * Tests for visningsnavnet.
 *
 * Det farlige her er ikke, at et navn ser forkert ud — det er, at nogen retter
 * `name` for at få skærmen til at passe. `name` er den EKSAKTE streng fra
 * pulselive og api.superliga.dk, og `teamElo()` falder TAVST tilbage til 1500
 * for et navn, den ikke kender. Testene holder derfor fast i, at visningsnavnet
 * er et EKSTRA felt og aldrig erstatter nøglen.
 */
import { describe, it, expect } from 'vitest';
import {
  VISNINGSNAVN, standardVisningsnavn, visningsnavn, medVisningsnavn,
} from './visningsnavn';

describe('husets forslag', () => {
  // De fire er valgt, fordi de sparer en linje på en telefon — målt med
  // scripts/navnbredde.mjs. Brighton er det ENESTE navn, der ellers klippes.
  it.each([
    ['Brighton and Hove Albion', 'Brighton'],
    ['Tottenham Hotspur', 'Tottenham'],
    ['Sønderjyske Fodbold', 'Sønderjyske'],
    ['FC Nordsjælland', 'Nordsjælland'],
  ])('%s vises som %s', (navn, vis) => {
    expect(standardVisningsnavn(navn)).toBe(vis);
  });

  // Og de øvrige skal stå uændret. Et visningsnavn, der ikke sparer plads,
  // er støj — og en forkortelse, spillerne ikke kan tyde, var hele problemet.
  it.each(['Arsenal', 'Manchester United', 'AGF', 'OB', 'Randers FC'])(
    '%s står uændret', (navn) => {
      expect(standardVisningsnavn(navn)).toBe(navn);
    },
  );

  it('holder listen kort — kun de navne, der faktisk sparer plads', () => {
    expect(Object.keys(VISNINGSNAVN)).toHaveLength(4);
  });
});

describe('spillets egen override', () => {
  it('vinder over husets forslag', () => {
    expect(visningsnavn({ 'Tottenham Hotspur': { visningsnavn: 'Spurs' } }, 'Tottenham Hotspur'))
      .toBe('Spurs');
  });

  it('bruges også på et hold uden forslag', () => {
    expect(visningsnavn({ Arsenal: { visningsnavn: 'The Gunners' } }, 'Arsenal')).toBe('The Gunners');
  });

  // EN TOM OVERRIDE ER IKKE ET NAVN. Ryddede nogen feltet i stedet for at
  // trykke nulstil, ville holdet ellers komme til at hedde ingenting.
  it.each(['', '   ', null, undefined])('falder tilbage på forslaget ved %p', (v) => {
    expect(visningsnavn({ 'Tottenham Hotspur': { visningsnavn: v } }, 'Tottenham Hotspur'))
      .toBe('Tottenham');
  });

  it('trimmer mellemrum', () => {
    expect(visningsnavn({ Arsenal: { visningsnavn: '  Gunners  ' } }, 'Arsenal')).toBe('Gunners');
  });

  it('klarer sig uden teamStyles overhovedet', () => {
    expect(visningsnavn(null, 'Brighton and Hove Albion')).toBe('Brighton');
    expect(visningsnavn(undefined, 'Arsenal')).toBe('Arsenal');
  });
});

describe('medVisningsnavn', () => {
  const HOLD = [
    { name: 'Brighton and Hove Albion', short: 'BHA', elo: 1522 },
    { name: 'Arsenal', short: 'ARS', elo: 1664 },
  ];

  // BÆRENDE: `name` må ALDRIG erstattes. Bliver den det, mister holdet sin
  // Elo og sine resultater uden en eneste fejlbesked.
  it('lægger `vis` ved siden af `name` — ikke i stedet for', () => {
    const ud = medVisningsnavn(HOLD, null);
    expect(ud[0].name).toBe('Brighton and Hove Albion');
    expect(ud[0].vis).toBe('Brighton');
    expect(ud[1].name).toBe('Arsenal');
    expect(ud[1].vis).toBe('Arsenal');
  });

  it('bevarer alle øvrige felter', () => {
    const ud = medVisningsnavn(HOLD, null);
    expect(ud[0]).toMatchObject(HOLD[0]);
    expect(ud[1]).toMatchObject(HOLD[1]);
  });

  // CACHEN er ikke pynt: uden den giver hvert kald en ny liste, og hver
  // useMemo, der har den som dependency, regner forfra ved hver render.
  it('giver samme objekt igen ved samme input', () => {
    expect(medVisningsnavn(HOLD, null)).toBe(medVisningsnavn(HOLD, null));
  });

  // …men SKAL give en ny liste, når overrides ændrer sig. Ellers ville en
  // rettelse i admin ikke slå igennem, før siden blev genindlæst.
  it('giver en ny liste, når overrides ændrer sig', () => {
    const a = medVisningsnavn(HOLD, null);
    const b = medVisningsnavn(HOLD, { Arsenal: { visningsnavn: 'Gunners' } });
    expect(b).not.toBe(a);
    expect(b[1].vis).toBe('Gunners');
    // Og tilbage igen skal ramme cachen, ikke bygge en tredje liste.
    expect(medVisningsnavn(HOLD, null)).toBe(a);
  });

  it('lader en tom liste være', () => {
    expect(medVisningsnavn([], null)).toEqual([]);
    expect(medVisningsnavn(null, null)).toBeNull();
  });
});
