/**
 * Tests for rene hjælpefunktioner i leagueUtils.js.
 */
import { describe, it, expect } from 'vitest';
import { generateJoinCode, filterUsersByLeague } from './leagueUtils';

// Tilladte tegn (ingen tvetydige)
const ALLOWED_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const AMBIGUOUS_CHARS = '0O1I';

// ── generateJoinCode ─────────────────────────────────────────────────────────
describe('generateJoinCode', () => {
  it('genererer en kode på præcis 6 tegn', () => {
    const code = generateJoinCode();
    expect(code).toHaveLength(6);
  });

  it('indeholder kun tilladte tegn (store bogstaver og tal, ingen tvetydige)', () => {
    // Kør 50 gange for at dække tilfældighed
    for (let i = 0; i < 50; i++) {
      const code = generateJoinCode();
      expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
      // Sikr at tvetydige tegn ikke er med
      expect(code).not.toMatch(/[0OI1]/);
    }
  });

  it('genererer unikke koder (statistisk)', () => {
    const codes = new Set();
    for (let i = 0; i < 100; i++) {
      codes.add(generateJoinCode());
    }
    // Med ~28^6 kombinationer bør 100 kode-genereringer næsten altid give 100 unikke
    expect(codes.size).toBeGreaterThan(95);
  });

  it('indeholder ingen tvetydige tegn (0, O, 1, I) over 200 kald', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateJoinCode();
      for (const c of AMBIGUOUS_CHARS) {
        expect(code, `kode ${code} indeholder tvetydigt tegn ${c}`).not.toContain(c);
      }
    }
  });

  it('alle tegn er fra det tilladte sæt over 200 kald', () => {
    const allowedSet = new Set(ALLOWED_CHARS);
    for (let i = 0; i < 200; i++) {
      const code = generateJoinCode();
      for (const c of code) {
        expect(allowedSet.has(c), `ugyldigt tegn '${c}' i kode ${code}`).toBe(true);
      }
    }
  });

  it('returnerer en streng (ikke tal)', () => {
    expect(typeof generateJoinCode()).toBe('string');
  });

  it('er altid store bogstaver', () => {
    for (let i = 0; i < 20; i++) {
      const code = generateJoinCode();
      expect(code).toBe(code.toUpperCase());
    }
  });
});

// ── filterUsersByLeague ──────────────────────────────────────────────────────
describe('filterUsersByLeague', () => {
  const users = [
    { uid: 'uid-1', displayName: 'Alice', totalPoints: 30 },
    { uid: 'uid-2', displayName: 'Bob', totalPoints: 50 },
    { uid: 'uid-3', displayName: 'Charlie', totalPoints: 20 },
  ];

  it('returnerer kun brugere der er i memberUids', () => {
    const result = filterUsersByLeague(users, ['uid-1', 'uid-3']);
    expect(result).toHaveLength(2);
    const uids = result.map((u) => u.uid);
    expect(uids).toContain('uid-1');
    expect(uids).toContain('uid-3');
    expect(uids).not.toContain('uid-2');
  });

  it('returnerer tom liste ved tom memberUids', () => {
    expect(filterUsersByLeague(users, [])).toHaveLength(0);
  });

  it('returnerer tom liste ved null memberUids', () => {
    expect(filterUsersByLeague(users, null)).toHaveLength(0);
  });

  it('returnerer tom liste hvis ingen brugere matcher', () => {
    expect(filterUsersByLeague(users, ['uid-999'])).toHaveLength(0);
  });

  it('returnerer alle matchende brugere når alle uid-er er i listen', () => {
    const result = filterUsersByLeague(users, ['uid-1', 'uid-2', 'uid-3']);
    expect(result).toHaveLength(3);
  });

  it('ignorerer uid-er i memberUids der ikke har tilsvarende bruger', () => {
    const result = filterUsersByLeague(users, ['uid-1', 'uid-999']);
    expect(result).toHaveLength(1);
    expect(result[0].uid).toBe('uid-1');
  });
});
