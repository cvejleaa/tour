/**
 * Tests for TeamThemePicker + TEAM_THEMES-data.
 * - Picker sætter/rydder data-team + localStorage.teamTheme.
 * - TEAM_THEMES har 23 poster med gyldig hex og læsbar onPrimary.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import TeamThemePicker, { getInitialTeamTheme, applyTeamTheme } from './TeamThemePicker';
import { TEAM_THEMES, teamThemeByKey, teamThemeKeyForName } from '../../data/teamThemes';

const HEX = /^#[0-9a-fA-F]{6}$/;

// Relativ luminans (sRGB) for kontrast-tjek.
function luminance(hex) {
  const n = hex.replace('#', '');
  const ch = [0, 2, 4].map((i) => {
    const c = parseInt(n.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
function contrast(a, b) {
  const la = luminance(a), lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

describe('TEAM_THEMES data', () => {
  it('har præcis 23 poster', () => {
    expect(TEAM_THEMES).toHaveLength(23);
  });

  it('hver post har unik key og gyldige hex-farver', () => {
    const keys = new Set();
    for (const t of TEAM_THEMES) {
      expect(t.key).toBeTruthy();
      expect(keys.has(t.key)).toBe(false);
      keys.add(t.key);
      expect(t.label).toBeTruthy();
      expect(t.primary).toMatch(HEX);
      expect(t.secondary).toMatch(HEX);
      expect(['#fff', '#111']).toContain(t.onPrimary);
    }
  });

  it('onPrimary er læsbar oven på primary (kontrast >= 3)', () => {
    for (const t of TEAM_THEMES) {
      const onHex = t.onPrimary === '#fff' ? '#ffffff' : '#111111';
      expect(contrast(t.primary, onHex)).toBeGreaterThanOrEqual(3);
    }
  });

  it('teamThemeByKey og teamThemeKeyForName matcher labels', () => {
    expect(teamThemeByKey('visma').label).toMatch(/Visma/);
    expect(teamThemeByKey('nope')).toBeNull();
    expect(teamThemeKeyForName('Team Visma | Lease a Bike')).toBe('visma');
    expect(teamThemeKeyForName('  cofidis  ')).toBe('cofidis');
    expect(teamThemeKeyForName('Ukendt Hold')).toBeNull();
  });
});

describe('TeamThemePicker', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-team');
  });
  afterEach(() => cleanup());

  it('sætter data-team + localStorage ved valg af hold', () => {
    render(<TeamThemePicker />);
    const select = screen.getByLabelText(/holdfarve-tema/i);
    fireEvent.change(select, { target: { value: 'soudal' } });
    expect(document.documentElement.getAttribute('data-team')).toBe('soudal');
    expect(localStorage.getItem('teamTheme')).toBe('soudal');
  });

  it('rydder data-team + localStorage ved valg af Standard', () => {
    localStorage.setItem('teamTheme', 'uae');
    render(<TeamThemePicker />);
    const select = screen.getByLabelText(/holdfarve-tema/i);
    fireEvent.change(select, { target: { value: '' } });
    expect(document.documentElement.hasAttribute('data-team')).toBe(false);
    expect(localStorage.getItem('teamTheme')).toBeNull();
  });

  it('initialiserer fra gemt key i localStorage', () => {
    localStorage.setItem('teamTheme', 'visma');
    render(<TeamThemePicker />);
    expect(document.documentElement.getAttribute('data-team')).toBe('visma');
    expect(screen.getByLabelText(/holdfarve-tema/i)).toHaveValue('visma');
  });

  it('viser Standard + 23 hold-options', () => {
    render(<TeamThemePicker />);
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(TEAM_THEMES.length + 1);
  });

  it('getInitialTeamTheme ignorerer ugyldig gemt key', () => {
    localStorage.setItem('teamTheme', 'bogus');
    expect(getInitialTeamTheme()).toBe('');
  });

  it('applyTeamTheme sætter og fjerner attributten', () => {
    applyTeamTheme('astana');
    expect(document.documentElement.getAttribute('data-team')).toBe('astana');
    applyTeamTheme('');
    expect(document.documentElement.hasAttribute('data-team')).toBe(false);
  });
});
