/**
 * Tests for holdene til håndbold-VM 2027.
 *
 * Holdfilen er nøglen mellem kilden (Wikipedias {{hb|KODE}}) og spillet (det
 * danske navn). En kode, der mangler, får programscriptet til at kaste — men
 * en kode på det FORKERTE hold ville give en kamp med det forkerte land, og
 * det ser rigtigt ud. Derfor står de 32 par skrevet ud her.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { HAANDBOLD_VM2027_HOLD, holdForKode } from './haandboldVm2027Hold';

const PROGRAM = JSON.parse(readFileSync(resolve(process.cwd(), 'scripts/haandbold-vm2027-program.json'), 'utf8'));

describe('listens form', () => {
  it('har præcis 32 hold med entydige navne, kortkoder og kildekoder', () => {
    expect(HAANDBOLD_VM2027_HOLD).toHaveLength(32);
    for (const felt of ['name', 'short', 'hbKode']) {
      expect(new Set(HAANDBOLD_VM2027_HOLD.map((t) => t[felt])).size, felt).toBe(32);
    }
    const alleKoder = HAANDBOLD_VM2027_HOLD.flatMap((t) => [t.hbKode, ...t.aliaser]);
    expect(new Set(alleKoder).size).toBe(alleKoder.length);
  });

  it('kortkoder og kildekoder er tre store bogstaver', () => {
    for (const t of HAANDBOLD_VM2027_HOLD) {
      expect(t.short, t.name).toMatch(/^[A-Z]{3}$/);
      expect(t.hbKode, t.name).toMatch(/^[A-Z]{3}$/);
      expect(Array.isArray(t.aliaser), t.name).toBe(true);
    }
  });

  // Neutral bane: et hjemmestadion ville stå på kampkortet for 31 af 32 hold
  // og være forkert for dem alle. Og Elo måles i D4 — et tal her før målingen
  // ville være et gæt, der så ud som et resultat.
  it('har INGEN venue og INGEN elo', () => {
    for (const t of HAANDBOLD_VM2027_HOLD) {
      expect(t, t.name).not.toHaveProperty('venue');
      expect(t, t.name).not.toHaveProperty('elo');
    }
  });

  it('kode → dansk navn for alle 32 (skrevet ud, så et ombytte er rødt)', () => {
    const par = Object.fromEntries(HAANDBOLD_VM2027_HOLD.map((t) => [t.hbKode, t.name]));
    expect(par).toEqual({
      GER: 'Tyskland', SRB: 'Serbien', TUN: 'Tunesien', URU: 'Uruguay',
      EGY: 'Egypten', ITA: 'Italien', CPV: 'Kap Verde', KSA: 'Saudi-Arabien',
      CRO: 'Kroatien', ESP: 'Spanien', CHI: 'Chile', TUR: 'Tyrkiet',
      ARG: 'Argentina', FRA: 'Frankrig', BRA: 'Brasilien', KUW: 'Kuwait',
      SWE: 'Sverige', NOR: 'Norge', GRE: 'Grækenland', QAT: 'Qatar',
      POR: 'Portugal', FRO: 'Færøerne', POL: 'Polen', ALG: 'Algeriet',
      DEN: 'Danmark', SLO: 'Slovenien', USA: 'USA', ANG: 'Angola',
      ISL: 'Island', MKD: 'Nordmakedonien', BHR: 'Bahrain', JPN: 'Japan',
    });
  });
});

describe('holdForKode', () => {
  it('finder på kildekoden og på et alias — ukendt giver null, aldrig et gæt', () => {
    expect(holdForKode('DEN').name).toBe('Danmark');
    const hold = [{ name: 'Nordmakedonien', hbKode: 'MKD', aliaser: ['MAC'] }];
    expect(holdForKode('MAC', hold).name).toBe('Nordmakedonien');
    expect(holdForKode('XYZ')).toBeNull();
    expect(holdForKode('')).toBeNull();
    expect(holdForKode(undefined)).toBeNull();
    // Et hold uden aliaser-felt må ikke vælte opslaget.
    expect(holdForKode('X', [{ name: 'X-land', hbKode: 'XXX' }])).toBeNull();
  });
});

describe('mod kampprogrammet', () => {
  it('alle hold i programmet findes i holdfilen, og alle 32 spiller', () => {
    const navne = new Set(HAANDBOLD_VM2027_HOLD.map((t) => t.name));
    const iProgram = new Set(PROGRAM.fixtures.flatMap((f) => [f.home, f.away]));
    expect([...iProgram].filter((n) => !navne.has(n))).toEqual([]);
    expect(iProgram.size).toBe(32);
  });

  it('hvert hold spiller tre kampe i én gruppe', () => {
    for (const t of HAANDBOLD_VM2027_HOLD) {
      const kampe = PROGRAM.fixtures.filter((f) => f.home === t.name || f.away === t.name);
      expect(kampe, t.name).toHaveLength(3);
      expect(new Set(kampe.map((f) => f.gruppe)).size, t.name).toBe(1);
    }
  });
});
