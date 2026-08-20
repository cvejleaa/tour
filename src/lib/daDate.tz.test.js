// tilLokalInput SKAL bruge LOKAL tid, ikke UTC (QC-fund på #40: en min-attribut
// bygget med toISOString().slice(0,16) rammer 1-2 timer forkert i DK, så
// browseren ville acceptere et tidspunkt FØR den rigtige deadline).
//
// TM-fund: sandkassen kører TZ=UTC, hvor lokal == UTC, så en værdi-test kan
// IKKE skelne de to implementeringer. Men det kan en STRUKTUR-test, og den er
// TZ-uafhængig: den lokale implementering kalder Date-instansens LOKALE getters
// (getHours, getFullYear …); `toISOString().slice(0,16)` kalder ingen af dem.
// En mutation til UTC-formen bliver derfor rød her i enhver tidszone.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { tilLokalInput } from './daDate';

afterEach(() => vi.restoreAllMocks());

describe('tilLokalInput — lokal tid, ikke UTC', () => {
  it('bruger Date-instansens LOKALE getters (ikke toISOString/UTC)', () => {
    const getHours = vi.spyOn(Date.prototype, 'getHours');
    const getUTCHours = vi.spyOn(Date.prototype, 'getUTCHours');
    tilLokalInput(Date.UTC(2026, 6, 1, 10, 30));
    expect(getHours).toHaveBeenCalled();     // lokal impl
    expect(getUTCHours).not.toHaveBeenCalled(); // ikke UTC
  });

  it('round-tripper via LOKAL parsing — som browserens min-attribut', () => {
    // Browseren fortolker en datetime-local-streng i LOKAL tid. Bygges strengen
    // også i lokal tid, giver new Date(streng) præcis inputtet igen (minut-rundet).
    // En UTC-bygget streng ville afvige med tidszone-offsettet i produktion.
    const ms = Math.floor(Date.UTC(2026, 0, 15, 23, 45) / 60000) * 60000;
    expect(new Date(tilLokalInput(ms)).getTime()).toBe(ms);
  });

  it('formen er altid YYYY-MM-DDTHH:mm (minut-præcision, nul-udfyldt)', () => {
    expect(tilLokalInput(Date.UTC(2026, 2, 5, 4, 8))).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it('tom/ugyldig værdi → tom streng', () => {
    expect(tilLokalInput(null)).toBe('');
    expect(tilLokalInput(undefined)).toBe('');
    expect(tilLokalInput(NaN)).toBe('');
  });
});
