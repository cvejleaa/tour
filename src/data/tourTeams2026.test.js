// Tests for 2026-startfeltet: holdliste, metadata-opslag og prettyTeam.
import { describe, it, expect } from 'vitest';
import { TOUR_TEAMS, TEAM_META, teamMeta, prettyTeam } from './tourTeams2026';

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
  it('title-caser ALL-CAPS letour-resultatnavne', () => {
    expect(prettyTeam('SOUDAL QUICK-STEP')).toBe('Soudal Quick-step');
  });
  it('bevarer kendte forkortelser i versaler', () => {
    expect(prettyTeam('UAE TEAM EMIRATES XRG')).toBe('UAE Team Emirates XRG');
  });
  it('tom → tom streng', () => {
    expect(prettyTeam('')).toBe('');
    expect(prettyTeam(null)).toBe('');
  });
});
