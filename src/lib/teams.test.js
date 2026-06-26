/**
 * Tests for teams.js – teamName, teamIso, flagUrl.
 */
import { describe, it, expect } from 'vitest';
import { teamName, teamIso, flagUrl } from './teams';

// ─── teamName ─────────────────────────────────────────────────────────────────

describe('teamName', () => {
  it('returnerer dansk navn for kendte hold', () => {
    expect(teamName('ARG')).toBe('Argentina');
    expect(teamName('BRA')).toBe('Brasilien');
    expect(teamName('GER')).toBe('Tyskland');
    expect(teamName('FRA')).toBe('Frankrig');
    expect(teamName('ESP')).toBe('Spanien');
  });

  it('returnerer selve koden for ukendte hold', () => {
    expect(teamName('XYZ')).toBe('XYZ');
    expect(teamName('AAA')).toBe('AAA');
  });

  it('returnerer tom streng ved null', () => {
    expect(teamName(null)).toBe('');
  });

  it('returnerer tom streng ved undefined', () => {
    expect(teamName(undefined)).toBe('');
  });

  it('returnerer tom streng ved tom streng', () => {
    expect(teamName('')).toBe('');
  });

  it('returnerer korrekt navn for England med gb-eng iso', () => {
    expect(teamName('ENG')).toBe('England');
  });

  it('returnerer korrekt navn for Skotland med gb-sct iso', () => {
    expect(teamName('SCO')).toBe('Skotland');
  });

  it('returnerer korrekt navn for særlige tegn (Curaçao)', () => {
    expect(teamName('CUW')).toBe('Curaçao');
  });

  it('returnerer korrekt navn for Østrig', () => {
    expect(teamName('AUT')).toBe('Østrig');
  });

  it('returnerer korrekt navn for Bosnien-Hercegovina', () => {
    expect(teamName('BIH')).toBe('Bosnien-Hercegovina');
  });
});

// ─── teamIso ──────────────────────────────────────────────────────────────────

describe('teamIso', () => {
  it('returnerer iso-kode for kendte hold', () => {
    expect(teamIso('ARG')).toBe('ar');
    expect(teamIso('BRA')).toBe('br');
    expect(teamIso('GER')).toBe('de');
    expect(teamIso('FRA')).toBe('fr');
    expect(teamIso('USA')).toBe('us');
  });

  it('returnerer gb-eng for England', () => {
    expect(teamIso('ENG')).toBe('gb-eng');
  });

  it('returnerer gb-sct for Skotland', () => {
    expect(teamIso('SCO')).toBe('gb-sct');
  });

  it('returnerer null for ukendte hold', () => {
    expect(teamIso('XYZ')).toBeNull();
    expect(teamIso('ZZZ')).toBeNull();
  });

  it('returnerer null ved null input', () => {
    expect(teamIso(null)).toBeNull();
  });

  it('returnerer null ved undefined input', () => {
    expect(teamIso(undefined)).toBeNull();
  });

  it('returnerer null ved tom streng', () => {
    expect(teamIso('')).toBeNull();
  });
});

// ─── flagUrl ──────────────────────────────────────────────────────────────────

describe('flagUrl', () => {
  it('returnerer korrekt flagcdn-URL for kendte hold med default bredde', () => {
    expect(flagUrl('ARG')).toBe('https://flagcdn.com/w40/ar.png');
    expect(flagUrl('BRA')).toBe('https://flagcdn.com/w40/br.png');
    expect(flagUrl('GER')).toBe('https://flagcdn.com/w40/de.png');
  });

  it('bruger den angivne bredde i URL', () => {
    expect(flagUrl('ARG', 20)).toBe('https://flagcdn.com/w20/ar.png');
    expect(flagUrl('ARG', 80)).toBe('https://flagcdn.com/w80/ar.png');
    expect(flagUrl('ARG', 160)).toBe('https://flagcdn.com/w160/ar.png');
  });

  it('returnerer korrekt URL for England (gb-eng)', () => {
    expect(flagUrl('ENG')).toBe('https://flagcdn.com/w40/gb-eng.png');
    expect(flagUrl('ENG', 20)).toBe('https://flagcdn.com/w20/gb-eng.png');
  });

  it('returnerer korrekt URL for Skotland (gb-sct)', () => {
    expect(flagUrl('SCO')).toBe('https://flagcdn.com/w40/gb-sct.png');
  });

  it('returnerer null for ukendte hold', () => {
    expect(flagUrl('XYZ')).toBeNull();
    expect(flagUrl('UKEND')).toBeNull();
  });

  it('returnerer null ved null input', () => {
    expect(flagUrl(null)).toBeNull();
  });

  it('returnerer null ved undefined input', () => {
    expect(flagUrl(undefined)).toBeNull();
  });

  it('returnerer null ved tom streng', () => {
    expect(flagUrl('')).toBeNull();
  });

  it('dækker alle 50 hold i TEAMS', () => {
    const kendte = ['MEX', 'KOR', 'RSA', 'CZE', 'CAN', 'SUI', 'QAT', 'BIH', 'BRA', 'MAR',
      'HAI', 'SCO', 'USA', 'PAR', 'AUS', 'TUR', 'GER', 'CUW', 'CIV', 'ECU',
      'NED', 'SWE', 'TUN', 'JPN', 'BEL', 'EGY', 'IRN', 'NZL', 'ESP', 'CPV',
      'KSA', 'URU', 'FRA', 'SEN', 'IRQ', 'NOR', 'ARG', 'ALG', 'AUT', 'JOR',
      'POR', 'COD', 'UZB', 'COL', 'ENG', 'CRO', 'GHA', 'PAN'];
    for (const code of kendte) {
      const url = flagUrl(code);
      expect(url, `${code} bør returnere en URL`).not.toBeNull();
      expect(url).toMatch(/^https:\/\/flagcdn\.com\/w\d+\/.+\.png$/);
    }
  });
});
