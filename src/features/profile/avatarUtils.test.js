import { describe, it, expect } from 'vitest';
import { avatarColor, initials } from './avatarUtils';

describe('avatarColor', () => {
  it('er deterministisk for samme seed', () => {
    expect(avatarColor('user-1')).toBe(avatarColor('user-1'));
  });

  it('returnerer en hex-farve', () => {
    expect(avatarColor('abc')).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('giver (typisk) forskellige farver for forskellige seeds', () => {
    const colors = new Set(['a', 'b', 'c', 'd', 'e'].map(avatarColor));
    expect(colors.size).toBeGreaterThan(1);
  });
});

describe('initials', () => {
  it('tager forbogstaver fra for- og efternavn', () => {
    expect(initials('Anna Hansen')).toBe('AH');
  });
  it('tager to bogstaver fra ét navn', () => {
    expect(initials('Bo')).toBe('BO');
  });
  it('håndterer tomt navn', () => {
    expect(initials('')).toBe('?');
    expect(initials('   ')).toBe('?');
  });
  it('bruger første og sidste ved flere navne', () => {
    expect(initials('Jens Peter Hansen')).toBe('JH');
  });
});
