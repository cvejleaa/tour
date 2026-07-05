import { describe, it, expect } from 'vitest';
import { riderInfo, profileLabel, teamRiders, isDanishRider, RIDERS } from './ridersTdf2026';

describe('ridersTdf2026 – datasæt', () => {
  it('184 ryttere, unikke startnumre, 23 hold', () => {
    expect(RIDERS).toHaveLength(184);
    expect(new Set(RIDERS.map((r) => r.bib)).size).toBe(184);
    expect(new Set(RIDERS.map((r) => r.team)).size).toBe(23);
  });
});

describe('riderInfo – tolerant navnematch', () => {
  it('matcher startliste-stil ("Tadej Pogačar") mod letour-stil (POGACAR Tadej)', () => {
    expect(riderInfo('Tadej Pogačar', 'UEX')).toMatchObject({ bib: 1, profile: 'leader' });
    expect(riderInfo('POGACAR Tadej')).toMatchObject({ bib: 1 });
  });

  it('matcher dansk rytter med kortere navn end letours fulde ("Jonas Vingegaard")', () => {
    // letour: "Jonas VINGEGAARD HANSEN" — 2 fælles ord er nok inden for holdet.
    expect(riderInfo('Jonas Vingegaard', 'TVL')).toMatchObject({ bib: 11, profile: 'leader' });
  });

  it('matcher fler-ords-efternavne delvist ("Isaac Del Toro")', () => {
    expect(riderInfo('Isaac Del Toro', 'UEX')).toMatchObject({ bib: 2 });
  });

  it('ukendt navn → null', () => {
    expect(riderInfo('Eddy Merckx', 'UEX')).toBeNull();
    expect(riderInfo('')).toBeNull();
    expect(riderInfo(null)).toBeNull();
  });
});

describe('profileLabel', () => {
  it('oversætter letours fire typer til dansk', () => {
    expect(profileLabel('leader')).toEqual({ label: 'Kaptajn', emoji: '⭐' });
    expect(profileLabel('climber')).toEqual({ label: 'Bjergrytter', emoji: '⛰️' });
    expect(profileLabel('sprinter')).toEqual({ label: 'Sprinter', emoji: '🚀' });
    expect(profileLabel('polyvalent')).toEqual({ label: 'Allrounder', emoji: '🔄' });
  });
  it('ukendt/tom type → null', () => {
    expect(profileLabel('hest')).toBeNull();
    expect(profileLabel(null)).toBeNull();
  });
});

describe('teamRiders', () => {
  it('returnerer holdets 8 ryttere sorteret efter startnummer', () => {
    const uex = teamRiders('UEX');
    expect(uex).toHaveLength(8);
    expect(uex[0].bib).toBe(1);
    expect([...uex].sort((a, b) => a.bib - b.bib)).toEqual(uex);
  });
});

describe('isDanishRider', () => {
  it('genkender danskere — også på letours navneformer', () => {
    expect(isDanishRider('Jonas Vingegaard')).toBe(true);
    expect(isDanishRider('VINGEGAARD Jonas')).toBe(true);
    expect(isDanishRider('Tadej Pogačar')).toBe(false);
    expect(isDanishRider('')).toBe(false);
  });
});
