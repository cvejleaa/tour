// ---------------------------------------------------------------------------
// SKIFTER MAN BASISTEMA, SKAL HOLDTEMAET REGNES OM.
//
// Da holdfarverne lå i CSS (`[data-team='visma'] { … }`), fulgte de gratis med
// et skift af `data-theme`, fordi CSS'en gjorde det samme uanset hvad — den
// tog bare aldrig hensyn til basistemaet, og DET var fejlen.
//
// Nu er farverne inline-værdier på <html>, udledt for ét bestemt basistema.
// Uden en omregning ved skiftet bliver den lyse udledning stående på en mørk
// side: visma ville stå som #7a7800 (dyb okker) på #0e1419, altså 2,05:1.
// Der findes ingen CSS-regel, der kan redde det — så testen står her.
// ---------------------------------------------------------------------------
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ThemeToggle from './ThemeToggle';
import { applyTeamTheme } from '../profile/TeamThemePicker';
import { accentTema } from '../../lib/accentTema';

const root = () => document.documentElement;
const pitch = () => root().style.getPropertyValue('--c-pitch');

beforeEach(() => {
  localStorage.clear();
  root().removeAttribute('data-theme');
  root().removeAttribute('data-team');
  root().removeAttribute('style');
});
afterEach(() => {
  cleanup();
  root().removeAttribute('data-theme');
  root().removeAttribute('data-team');
  root().removeAttribute('style');
});

describe('ThemeToggle', () => {
  it('sætter data-theme og gemmer valget', () => {
    localStorage.setItem('theme', 'light');
    render(<ThemeToggle />);
    expect(root().getAttribute('data-theme')).toBe('light');
    fireEvent.click(screen.getByRole('button'));
    expect(root().getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('theme')).toBe('dark');
  });

  it('regner holdtemaet om ved skiftet', () => {
    localStorage.setItem('theme', 'light');
    localStorage.setItem('teamTheme', 'visma');
    root().setAttribute('data-theme', 'light');
    applyTeamTheme('visma');
    expect(pitch()).toBe(accentTema('#FFE500', 'lyst').pitch);

    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole('button'));

    // BÆRENDE. Uden omregningen ville #7a7800 blive stående på næsten sort.
    expect(pitch()).toBe(accentTema('#FFE500', 'moerkt').pitch);
    expect(pitch()).not.toBe(accentTema('#FFE500', 'lyst').pitch);
  });

  it('rører ikke variablerne, når der ikke er valgt et holdtema', () => {
    localStorage.setItem('theme', 'light');
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole('button'));
    // App-grøn kommer fra :root i theme.css. Skrev togglen en tom eller forkert
    // værdi her, ville den vinde over stylesheetet.
    expect(pitch()).toBe('');
  });
});
