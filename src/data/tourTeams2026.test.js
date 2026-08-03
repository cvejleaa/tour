// Tests for 2026-startfeltet: holdliste, metadata-opslag og prettyTeam.
import { describe, it, expect } from 'vitest';
import { TOUR_TEAMS, TEAM_META, teamMeta, prettyTeam, countryName } from './tourTeams2026';

describe('countryName', () => {
  it('oversætter 3-bogstavs-koder til danske landenavne', () => {
    expect(countryName('brn')).toBe('Bahrain');
    expect(countryName('FRA')).toBe('Frankrig');
    expect(countryName('ned')).toBe('Holland');
    expect(countryName('uae')).toBe('De Forenede Arabiske Emirater');
  });
  it('falder tilbage til versal-kode for ukendte', () => {
    expect(countryName('zzz')).toBe('ZZZ');
    expect(countryName('')).toBe('');
  });
  it('alle holds nationalitet giver en ikke-tom streng', () => {
    for (const code of Object.keys(TEAM_META)) {
      const nat = TEAM_META[code].nationality;
      if (nat) expect(countryName(nat).length).toBeGreaterThan(0);
    }
  });
});

describe('TOUR_TEAMS', () => {
  it('er 23 holdnavne (strenge)', () => {
    expect(TOUR_TEAMS).toHaveLength(23);
    expect(TOUR_TEAMS.every((t) => typeof t === 'string')).toBe(true);
  });
  it('indeholder de officielle 2026-navne', () => {
    expect(TOUR_TEAMS).toContain('UAE Team Emirates XRG');
    expect(TOUR_TEAMS).toContain('Team Visma | Lease a Bike');
  });
});

describe('teamMeta', () => {
  it('slår op på kode', () => {
    const m = teamMeta('UEX');
    expect(m).not.toBeNull();
    expect(m.name).toBe('UAE Team Emirates XRG');
    expect(m.logo).toContain('http');
    expect(m.code).toBe('UEX');
  });
  it('slår op på navn (case-insensitivt)', () => {
    expect(teamMeta('cofidis').code).toBe('COF');
    expect(teamMeta('Cofidis').code).toBe('COF');
  });
  it('returnerer null for ukendt', () => {
    expect(teamMeta('Ukendt Hold')).toBeNull();
    expect(teamMeta(null)).toBeNull();
  });
  it('TEAM_META er nøglet på både kode og navn', () => {
    expect(TEAM_META.COF).toBeTruthy();
    expect(TEAM_META.cofidis).toBeTruthy();
    expect(TEAM_META.COF).toBe(TEAM_META.cofidis);
  });
});

describe('prettyTeam', () => {
  it('lader blandet-kasse navne være urørt', () => {
    expect(prettyTeam('Team Visma | Lease a Bike')).toBe('Team Visma | Lease a Bike');
    expect(prettyTeam('Cofidis')).toBe('Cofidis');
  });
  it('kendte hold vises ALTID med det officielle navn fra holdlisten', () => {
    expect(prettyTeam('SOUDAL QUICK-STEP')).toBe('Soudal Quick-Step');
    expect(prettyTeam('UAE TEAM EMIRATES XRG')).toBe('UAE Team Emirates XRG');
  });
  it('ALIAS: resultattabellernes "INEOS GRENADIERS" vises som "Netcompany Ineos"', () => {
    expect(prettyTeam('INEOS GRENADIERS')).toBe('Netcompany Ineos');
    expect(prettyTeam('Ineos Grenadiers')).toBe('Netcompany Ineos');
    expect(prettyTeam('NETCOMPANY INEOS CYCLING TEAM')).toBe('Netcompany Ineos');
  });
  it('ukendte ALL-CAPS navne title-cases stadig (fallback)', () => {
    expect(prettyTeam('TEAM UKENDT CYKLING')).toBe('Team Ukendt Cykling');
  });
  it('tom → tom streng', () => {
    expect(prettyTeam('')).toBe('');
    expect(prettyTeam(null)).toBe('');
  });
});
