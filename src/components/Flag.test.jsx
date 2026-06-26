// Tests for Flag-komponenten – flag-billede med flagcdn, fallback for ukendte koder.
// Flag-komponenten bruger teams.js TEAMS-mapping (3-bogstavs koder: GER, FRA, BRA, etc.)
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Flag from './Flag';

describe('Flag – kendte holdkoder (fra teams.js)', () => {
  it('viser img-element for GER (Tyskland)', () => {
    render(<Flag code="GER" />);
    const img = screen.getByRole('img');
    expect(img).toBeInTheDocument();
    expect(img.alt).toBe('Tyskland');
  });

  it('viser flagcdn-URL i src for GER', () => {
    render(<Flag code="GER" />);
    const img = screen.getByRole('img');
    expect(img.src).toContain('flagcdn.com');
    // GER → iso: 'de'
    expect(img.src).toContain('de');
  });

  it('viser korrekt alt-tekst for FRA (Frankrig)', () => {
    render(<Flag code="FRA" />);
    const img = screen.getByRole('img');
    expect(img.alt).toBe('Frankrig');
  });

  it('viser korrekt alt-tekst for BRA (Brasilien)', () => {
    render(<Flag code="BRA" />);
    const img = screen.getByRole('img');
    expect(img.alt).toBe('Brasilien');
  });

  it('viser img med korrekt iso-URL for BRA (br)', () => {
    render(<Flag code="BRA" />);
    const img = screen.getByRole('img');
    expect(img.src).toContain('br');
  });

  it('viser flag med title = fuldt holdnavn', () => {
    render(<Flag code="GER" />);
    const img = screen.getByRole('img');
    expect(img.title).toBe('Tyskland');
  });

  it('bruger lazy loading', () => {
    render(<Flag code="GER" />);
    const img = screen.getByRole('img');
    expect(img.getAttribute('loading')).toBe('lazy');
  });

  it('viser img for USA (USA)', () => {
    render(<Flag code="USA" />);
    const img = screen.getByRole('img');
    expect(img.alt).toBe('USA');
    expect(img.src).toContain('us');
  });

  it('viser img for ARG (Argentina)', () => {
    render(<Flag code="ARG" />);
    const img = screen.getByRole('img');
    expect(img.alt).toBe('Argentina');
    expect(img.src).toContain('ar');
  });

  it('viser img for ENG (England) med gb-eng iso', () => {
    render(<Flag code="ENG" />);
    const img = screen.getByRole('img');
    expect(img.alt).toBe('England');
    expect(img.src).toContain('gb-eng');
  });

  it('viser img for SCO (Skotland) med gb-sct iso', () => {
    render(<Flag code="SCO" />);
    const img = screen.getByRole('img');
    expect(img.alt).toBe('Skotland');
    expect(img.src).toContain('gb-sct');
  });
});

describe('Flag – ukendte/ugyldige holdkoder (fallback)', () => {
  it('viser 🏳️ fallback-span (ikke img) for ukendt kode (DK ikke i teams.js)', () => {
    // DK er IKKE i teams.js → flagUrl returnerer null → fallback span med role="img"
    render(<Flag code="DK" />);
    // Fallback er en <span> med role="img" og tekst 🏳️ – IKKE en <img>
    expect(screen.queryByRole('img', { hidden: false })?.tagName).not.toBe('IMG');
    expect(screen.getByText('🏳️')).toBeInTheDocument();
  });

  it('viser 🏳️ fallback for fuldstændig ukendt kode', () => {
    render(<Flag code="UKENDT" />);
    expect(screen.getByText('🏳️')).toBeInTheDocument();
  });

  it('viser 🏳️ fallback for null', () => {
    render(<Flag code={null} />);
    expect(screen.getByText('🏳️')).toBeInTheDocument();
  });

  it('viser 🏳️ fallback for undefined', () => {
    render(<Flag code={undefined} />);
    expect(screen.getByText('🏳️')).toBeInTheDocument();
  });

  it('viser 🏳️ fallback for tom streng', () => {
    render(<Flag code="" />);
    expect(screen.getByText('🏳️')).toBeInTheDocument();
  });

  it('fallback bruger "ukendt hold" som aria-label ved null kode', () => {
    render(<Flag code={null} />);
    // teamName(null) = '' → aria-label = 'ukendt hold'
    const fallback = screen.getByText('🏳️');
    expect(fallback).toBeInTheDocument();
    expect(fallback).toHaveAttribute('aria-label', 'ukendt hold');
  });

  it('fallback bruger koden som aria-label for UKENDT kode', () => {
    render(<Flag code="UKENDT" />);
    // teamName('UKENDT') = 'UKENDT' (fallback til selve koden)
    const fallback = screen.getByText('🏳️');
    expect(fallback).toBeInTheDocument();
  });

  it('viser img-element (ikke fallback) for kendt kode GER', () => {
    render(<Flag code="GER" />);
    const img = screen.getByRole('img');
    expect(img.tagName).toBe('IMG');
    expect(img.alt).toBe('Tyskland');
  });
});

describe('Flag – størrelse', () => {
  it('accepterer size prop og renderer korrekt', () => {
    render(<Flag code="GER" size={40} />);
    const img = screen.getByRole('img');
    expect(img).toBeInTheDocument();
  });

  it('bruger w40 URL for size=40', () => {
    render(<Flag code="GER" size={40} />);
    const img = screen.getByRole('img');
    expect(img.src).toContain('w40');
  });

  it('bruger w20 URL for size=16 (≤20)', () => {
    render(<Flag code="GER" size={16} />);
    const img = screen.getByRole('img');
    // size <= 20 → brug w20
    expect(img.src).toContain('w20');
  });

  it('bruger w80 URL for size=60 (>40)', () => {
    render(<Flag code="GER" size={60} />);
    const img = screen.getByRole('img');
    // size > 40 → brug w80
    expect(img.src).toContain('w80');
  });

  it('bruger w20 URL for size=20 (præcis grænseværdi)', () => {
    render(<Flag code="GER" size={20} />);
    const img = screen.getByRole('img');
    expect(img.src).toContain('w20');
  });

  it('bruger w40 URL for size=28 (default)', () => {
    render(<Flag code="GER" />);
    const img = screen.getByRole('img');
    // default size=28, 20 < 28 <= 40 → w40
    expect(img.src).toContain('w40');
  });
});
