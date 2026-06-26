/**
 * Tests for ThemeToggle-komponenten.
 * Tester at tema-skift opdaterer data-theme og localStorage.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ThemeToggle from './ThemeToggle';

// ── Setup matchMedia mock ─────────────────────────────────────────────────────
function setupMatchMedia(prefersDark = false) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: prefersDark && query === '(prefers-color-scheme: dark)',
      media: query,
      addListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  });
}

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    setupMatchMedia(false); // default: lyst tema
  });

  afterEach(() => {
    cleanup();
  });

  it('renderer en knap', () => {
    render(<ThemeToggle />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('starter med lyst tema når localStorage er tom og OS ikke foretrækker mørkt', () => {
    render(<ThemeToggle />);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('starter med mørkt tema når OS foretrækker mørkt og localStorage er tom', () => {
    setupMatchMedia(true);
    render(<ThemeToggle />);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('starter med gemt tema fra localStorage (dark)', () => {
    localStorage.setItem('theme', 'dark');
    render(<ThemeToggle />);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('starter med gemt tema fra localStorage (light)', () => {
    setupMatchMedia(true); // OS foretrækker mørkt, men localStorage siger light
    localStorage.setItem('theme', 'light');
    render(<ThemeToggle />);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('skifter fra lyst til mørkt tema ved klik', () => {
    render(<ThemeToggle />);
    const btn = screen.getByRole('button');
    fireEvent.click(btn);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('skifter fra mørkt til lyst tema ved andet klik', () => {
    localStorage.setItem('theme', 'dark');
    render(<ThemeToggle />);
    const btn = screen.getByRole('button');
    fireEvent.click(btn);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('gemmer lyst tema i localStorage efter skift', () => {
    localStorage.setItem('theme', 'dark');
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole('button'));
    expect(localStorage.getItem('theme')).toBe('light');
  });

  it('gemmer mørkt tema i localStorage efter skift', () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole('button'));
    expect(localStorage.getItem('theme')).toBe('dark');
  });

  it('knappens aria-label ændres ved skift', () => {
    render(<ThemeToggle />);
    const btn = screen.getByRole('button');
    // Starter lyst → label bør sige "Skift til mørkt tema"
    expect(btn).toHaveAttribute('aria-label', 'Skift til mørkt tema');
    fireEvent.click(btn);
    // Nu mørkt → label bør sige "Skift til lyst tema"
    expect(btn).toHaveAttribute('aria-label', 'Skift til lyst tema');
  });

  it('knapteksten viser ☀️ Lyst i mørkt tema', () => {
    localStorage.setItem('theme', 'dark');
    render(<ThemeToggle />);
    expect(screen.getByRole('button')).toHaveTextContent('☀️ Lyst');
  });

  it('knapteksten viser 🌙 Mørkt i lyst tema', () => {
    render(<ThemeToggle />);
    expect(screen.getByRole('button')).toHaveTextContent('🌙 Mørkt');
  });

  it('toggler korrekt frem og tilbage (tre klik)', () => {
    render(<ThemeToggle />);
    const btn = screen.getByRole('button');
    fireEvent.click(btn); // → dark
    fireEvent.click(btn); // → light
    fireEvent.click(btn); // → dark
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('theme')).toBe('dark');
  });

  it('sætter data-theme allerede ved mount (useEffect)', () => {
    render(<ThemeToggle />);
    // Efter mount bør data-theme være sat
    expect(document.documentElement.hasAttribute('data-theme')).toBe(true);
  });
});
