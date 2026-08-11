/**
 * Tests for TeamThemePicker + TEAM_THEMES-data.
 * - Picker sætter/rydder data-team + localStorage.teamTheme.
 * - TEAM_THEMES har 23 poster med gyldig hex.
 * - `applyTeamTheme` skriver de FEM udledte variabler på <html>, ikke en
 *   attribut, som en håndskrevet CSS-blok skulle oversætte.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import TeamThemePicker, { getInitialTeamTheme, applyTeamTheme } from './TeamThemePicker';
import { TEAM_THEMES, teamThemeByKey, teamThemeKeyForName } from '../../data/teamThemes';
import { accentTema } from '../../lib/accentTema';
import { kontrast } from '../../lib/contrastText';

const HEX = /^#[0-9a-fA-F]{6}$/;

// KONTRASTREGNESTYKKET LÅ HER SOM EN LOKAL HJÆLPER. Så længe det kun fandtes i
// en testfil, kunne koden ikke måle sig selv — og det var netop derfor,
// temaerne blev holdt i hånden. Den bor i src/lib/contrastText.js nu.
const contrast = kontrast;

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
      // `onPrimary` SKAL VÆRE VÆK. Feltet var et skøn pr. hold, og det var
      // netop skønnet, der gav hvid tekst på visma-gul (1,28:1). Blækket
      // udledes nu af fladen — står feltet her igen, er nogen holdt op med at
      // regne og begyndt at vurdere.
      expect(t.onPrimary).toBeUndefined();
    }
  });

  it('hvert tema består begge kontrastkrav i begge basistemaer', () => {
    // Baren HER var >= 3 mellem to tal, CSS'en ikke brugte. Den er nu 4,5 mod
    // den flade, farven faktisk står på. `accentTema.test.js` har de fulde
    // krav; den her sikrer, at Tour-listen er med i dem.
    for (const t of TEAM_THEMES) {
      for (const [mode, haardeste] of [['lyst', '#ffffff'], ['moerkt', '#202a34']]) {
        const tema = accentTema(t.primary, mode);
        expect(contrast(tema.pitch, haardeste), `${t.key}/${mode}`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(tema.onPitch, tema.pitch), `${t.key}/${mode}`).toBeGreaterThanOrEqual(4.5);
      }
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
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('style');
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

// ---------------------------------------------------------------------------
// FARVERNE KOMMER FRA FUNKTIONEN, IKKE FRA EN CSS-BLOK.
//
// Før satte `applyTeamTheme` KUN en attribut, og 23 håndskrevne rækker i
// theme.css oversatte den til farver. Ingen test bandt de to sammen.
// `scripts/accent-tema.mjs --foer` måler den blok: 36 af 46 kombinationer faldt.
// ---------------------------------------------------------------------------
describe('applyTeamTheme skriver de udledte variabler', () => {
  const stil = () => document.documentElement.style;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-team');
    document.documentElement.removeAttribute('style');
  });
  afterEach(() => {
    cleanup();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('style');
  });

  it('sætter alle fem variabler for det LYSE basistema', () => {
    document.documentElement.setAttribute('data-theme', 'light');
    applyTeamTheme('visma');
    const t = accentTema('#FFE500', 'lyst');
    expect(stil().getPropertyValue('--c-pitch')).toBe(t.pitch);
    expect(stil().getPropertyValue('--c-pitch-dark')).toBe(t.pitchDark);
    expect(stil().getPropertyValue('--c-on-pitch')).toBe(t.onPitch);
    expect(stil().getPropertyValue('--c-pitch-weak')).toBe(t.pitchWeak);
    expect(stil().getPropertyValue('--c-pitch-tint')).toBe(t.pitchTint);
    // BÆRENDE: den RÅ #FFE500 stod her før, og som tekst på hvidt gav den
    // 1,15:1. Den må aldrig komme igennem urørt i lyst tema.
    expect(stil().getPropertyValue('--c-pitch')).not.toBe('#FFE500');
    expect(contrast(stil().getPropertyValue('--c-pitch'), '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });

  it('udleder ANDRE farver i mørkt basistema', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    applyTeamTheme('visma');
    expect(stil().getPropertyValue('--c-pitch')).toBe(accentTema('#FFE500', 'moerkt').pitch);
    // …og det er ikke den samme udledning som i lyst tema.
    expect(stil().getPropertyValue('--c-pitch')).not.toBe(accentTema('#FFE500', 'lyst').pitch);
  });

  it('rydder variablerne helt ved Standard', () => {
    document.documentElement.setAttribute('data-theme', 'light');
    applyTeamTheme('visma');
    applyTeamTheme('');
    // Blev bare ÉN af dem stående, ville app-grøn stå med et fremmed blæk.
    for (const v of ['--c-pitch', '--c-pitch-dark', '--c-on-pitch', '--c-pitch-weak', '--c-pitch-tint']) {
      expect(stil().getPropertyValue(v), v).toBe('');
    }
  });

  it('rydder også for en key, der ikke findes', () => {
    document.documentElement.setAttribute('data-theme', 'light');
    applyTeamTheme('visma');
    applyTeamTheme('findes-ikke');
    expect(stil().getPropertyValue('--c-pitch')).toBe('');
    expect(document.documentElement.hasAttribute('data-team')).toBe(false);
  });
});
