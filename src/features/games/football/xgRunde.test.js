import { describe, it, expect } from 'vitest';
import { rundensVildeste, VILDESTE_GAB } from './xgRunde';

const kamp = (id, runde, home, away, hg, ag, xh, xa) => ({
  id, round: runde, home, away, homeGoals: hg, awayGoals: ag, xgHome: xh, xgAway: xa,
});

describe('rundensVildeste', () => {
  it('tærsklen er 1,0 — målt, ikke valgt', () => {
    // Hardkodet med vilje. Testene nedenfor bygger deres tal AF konstanten og
    // ville derfor bestå, hvis den blev sat til 0,01 eller 99. Grundlaget står
    // i xgRunde.js: ved 1,0 fyrer kortet ca. hver anden runde; ved 0,5 bliver
    // det inventar, ved 1,5 ses det to gange på en sæson.
    expect(VILDESTE_GAB).toBe(1.0);
  });

  it('finder kampen, hvor VINDEREN havde færrest målchancer', () => {
    const v = rundensVildeste([
      kamp('a', 2, 'OB', 'AGF', 1, 0, 0.4, 2.8),
      kamp('b', 2, 'FCK', 'Vejle', 3, 1, 2.5, 0.6),
    ], 2);
    expect(v.matchId).toBe('a');
    expect(v.gab).toBe(2.4);
  });

  it('regner rigtigt, når det er UDEHOLDET der vinder mod chancerne', () => {
    // Symmetrien er værd at teste for sig: en fejl i hjemme/ude ville give et
    // negativt gab og dermed slet ingen kamp — altså et tomt kort, ikke et
    // forkert et, og det er svært at se i produktion.
    const v = rundensVildeste([kamp('a', 2, 'OB', 'AGF', 0, 1, 2.9, 0.5)], 2);
    expect(v.gab).toBe(2.4);
    expect(v.away).toBe('AGF');
  });

  it('under gabet vises INTET — kortet er en begivenhed, ikke inventar', () => {
    expect(rundensVildeste([kamp('a', 2, 'OB', 'AGF', 1, 0, 1.2, 2.0)], 2)).toBeNull();
  });

  it('præcis på gabet tæller med', () => {
    const v = rundensVildeste([kamp('a', 2, 'OB', 'AGF', 1, 0, 0.5, 1.5)], 2);
    expect(v.gab).toBe(1);
  });

  it('UAFGJORT springes over — der er ingen vinder at måle mod', () => {
    expect(rundensVildeste([kamp('a', 2, 'OB', 'AGF', 1, 1, 0.2, 3.0)], 2)).toBeNull();
  });

  it('kampe uden xG springes over — aldrig 0 for "ved ikke"', () => {
    expect(rundensVildeste([kamp('a', 2, 'OB', 'AGF', 1, 0, null, null)], 2)).toBeNull();
    expect(rundensVildeste([kamp('a', 2, 'OB', 'AGF', 1, 0, 0.4, null)], 2)).toBeNull();
  });

  it('ser kun på den valgte runde', () => {
    const v = rundensVildeste([
      kamp('a', 1, 'OB', 'AGF', 1, 0, 0.1, 3.0),
      kamp('b', 2, 'FCK', 'Vejle', 1, 0, 0.6, 1.9),
    ], 2);
    expect(v.matchId).toBe('b');
  });

  it('vælger den STØRSTE, når flere er over gabet', () => {
    const v = rundensVildeste([
      kamp('a', 2, 'OB', 'AGF', 1, 0, 0.9, 2.0),
      kamp('b', 2, 'FCK', 'Vejle', 1, 0, 0.3, 2.9),
    ], 2);
    expect(v.matchId).toBe('b');
  });

  it('en runde uden kampe eller et ugyldigt rundetal giver null', () => {
    expect(rundensVildeste([], 2)).toBeNull();
    expect(rundensVildeste(null, 2)).toBeNull();
    expect(rundensVildeste([kamp('a', 2, 'OB', 'AGF', 1, 0, 0.4, 2.8)], undefined)).toBeNull();
  });
});
