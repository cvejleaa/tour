import { describe, it, expect } from 'vitest';
import { kvitteringFor } from './chanceKvittering';

// Test Manager fandt tre grene, der kunne fjernes eller byttes om med hele
// suiten grøn: `indsats === 0`, fald-igennem, og navne-grenen mod den navnløse.
// FootballTip.test.jsx asserterede kun på præfikset `/Chancen er flyttet fra/`
// og aldrig på selve kampnavnet — så de to flytte-grene var ikke til at skelne.
// Derfor prøves hver gren her, direkte og med sit eget indhold.

const navnAf = (id) => ({ me_m1: 'Brøndby–FCK', me_m2: 'AGF–Viborg' }[id] || null);

describe('kvitteringFor', () => {
  it('siger at INTET skete, når serveren ikke skrev', () => {
    // `uaendret` er et svar, ikke en fejl. Tavshed ville være det eneste, der
    // lignede en fejl — og så trykker spilleren igen.
    const t = kvitteringFor({ uaendret: true, indsats: 4, flyttetFra: [] }, navnAf);
    expect(t).toMatch(/står, som den stod/);
    expect(t).not.toMatch(/flyttet|sat|fjernet/);
  });

  it('kalder en FJERNELSE en handling — ikke "ingen chance"', () => {
    // Nul er ikke fravær. Uden denne gren ser en bevidst fjernelse ud, som om
    // intet skete, og spilleren tror, klikket ikke virkede.
    const t = kvitteringFor({ indsats: 0, flyttetFra: [], uaendret: false }, navnAf);
    expect(t).toMatch(/Chancen er fjernet/);
    expect(t).toMatch(/anden kamp i runden/);
  });

  it('NÆVNER kampen, chancen blev flyttet fra — ved navn', () => {
    const t = kvitteringFor({ indsats: 4, flyttetFra: ['me_m1'], uaendret: false }, navnAf);
    expect(t).toContain('Brøndby–FCK');
    expect(t).toContain('4 point');
  });

  it('nævner ALLE kampe, hvis serveren flyttede flere', () => {
    const t = kvitteringFor({ indsats: 2, flyttetFra: ['me_m1', 'me_m2'], uaendret: false }, navnAf);
    expect(t).toContain('Brøndby–FCK');
    expect(t).toContain('AGF–Viborg');
  });

  it('siger STADIG at den blev flyttet, når navnet er ukendt', () => {
    // Den navnløse gren er ikke kosmetik. Fortav vi flytningen, ville
    // spilleren tro, han havde to chancer i runden — præcis det hul, hele
    // ændringen lukker. De to flytte-grene skal derfor kunne skelnes.
    const t = kvitteringFor({ indsats: 4, flyttetFra: ['me_ukendt'], uaendret: false }, () => null);
    expect(t).toMatch(/flyttet fra en anden kamp i runden/);
    expect(t).toContain('4 point');
    expect(t).not.toContain('undefined');
    expect(t).not.toContain('null');
  });

  it('siger bare at den er SAT, når der ikke blev flyttet noget', () => {
    const t = kvitteringFor({ indsats: 3, flyttetFra: [], uaendret: false }, navnAf);
    expect(t).toBe('Chancen er sat: 3 point på spil.');
    expect(t).not.toMatch(/flyttet/);
  });

  it('skelner de fire udfald fra hinanden — ingen to giver samme tekst', () => {
    // Bindingen mellem grenene. Byttes to om — som de kunne, uden at noget
    // blev rødt — ville denne test fange det.
    const tekster = [
      kvitteringFor({ uaendret: true, indsats: 4, flyttetFra: [] }, navnAf),
      kvitteringFor({ indsats: 0, flyttetFra: [], uaendret: false }, navnAf),
      kvitteringFor({ indsats: 4, flyttetFra: ['me_m1'], uaendret: false }, navnAf),
      kvitteringFor({ indsats: 4, flyttetFra: [], uaendret: false }, navnAf),
    ];
    expect(new Set(tekster).size).toBe(4);
  });

  it('klarer manglende svar og manglende opslag uden at kaste', () => {
    expect(kvitteringFor(null, navnAf)).toBe('');
    expect(() => kvitteringFor({ indsats: 4, flyttetFra: ['x'] })).not.toThrow();
    expect(kvitteringFor({ indsats: 4, flyttetFra: null, uaendret: false }, navnAf))
      .toMatch(/Chancen er sat/);
  });

  it('viser ALDRIG en procent eller et odds — kvitteringen er en handling', () => {
    for (const res of [
      { uaendret: true, indsats: 4 },
      { indsats: 0, flyttetFra: [] },
      { indsats: 4, flyttetFra: ['me_m1'] },
    ]) {
      expect(kvitteringFor(res, navnAf)).not.toMatch(/%/);
    }
  });
});
