// erIGang — klassifikationen bag --live. En forkert dom gør målingen tom
// (alt dømt "ikke i gang") eller støjende (aflyste kampe koster kald).
import { describe, it, expect } from 'vitest';
import { erIGang, IKKE_I_GANG } from './maal-livescore-detaljer.mjs';

describe('erIGang', () => {
  it('minuttal, pause, forlænget spilletid og straffe er i gang', () => {
    for (const eps of ["1'", "45'", "68'", "90+3'", 'HT', 'AET', 'Pen.', 'ET']) {
      expect(erIGang(eps), eps).toBe(true);
    }
  });
  it('ikke startet, slut, udsat, aflyst og afbrudt er IKKE i gang', () => {
    for (const eps of ['NS', 'FT', 'Postp.', 'Canc.', 'Abd.', 'Aband.', 'Susp.']) {
      expect(erIGang(eps), eps).toBe(false);
    }
    expect(IKKE_I_GANG.has('FT')).toBe(true);
  });
  it('tomt eller manglende Eps er ikke i gang — en kamp uden status må ikke koste et kald', () => {
    expect(erIGang(undefined)).toBe(false);
    expect(erIGang(null)).toBe(false);
    expect(erIGang('')).toBe(false);
    expect(erIGang(68)).toBe(false);
  });
});
