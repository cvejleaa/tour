import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PointOpdeling, { RUBRIKKER } from './PointOpdeling';

const FULD = { p1x2: 12.4, chance: 3.1, combi: 6, pulje: 8 };

describe('PointOpdeling', () => {
  it('viser alle fire kilder plus totalen', () => {
    render(<PointOpdeling opdeling={FULD} total={29.5} />);
    expect(screen.getByText('12,4')).toBeInTheDocument();
    expect(screen.getByText('3,1')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('29,5')).toBeInTheDocument();
  });

  // Navnene er dem, spillet og hjælpesiden allerede bruger. Et nyt ord for en
  // mekanik, brugeren har lært, er ren forvirring — derfor ikke
  // "betting-bonus" og ikke "5/6 rigtige".
  it('bruger spillets egne ord', () => {
    render(<PointOpdeling opdeling={FULD} total={29.5} />);
    expect(screen.getByText(/Chancen/)).toBeInTheDocument();
    expect(screen.getByText(/Combi/)).toBeInTheDocument();
    expect(screen.queryByText(/betting/i)).toBeNull();
    expect(screen.queryByText(/5\/6/)).toBeNull();
  });

  // ⚡ er Chancen overalt i appen. Får Combi det samme ikon, betyder tegnet to
  // ting på samme skærm.
  it('giver ikke Combi samme ikon som Chancen', () => {
    const chance = RUBRIKKER.find((r) => r.key === 'chance');
    const combi = RUBRIKKER.find((r) => r.key === 'combi');
    expect(chance.ikon).toBe('⚡');
    expect(combi.ikon).not.toBe(chance.ikon);
  });

  // Serveren skriver opdelingen ved næste genberegning. Fire nuller ville
  // påstå, at spilleren ingen point har fået — det er en anden ting end
  // "tallet er ikke klar".
  it('siger til, når opdelingen ikke findes endnu — i stedet for at vise nuller', () => {
    render(<PointOpdeling opdeling={null} total={42} />);
    expect(screen.getByText(/ikke klar endnu/)).toBeInTheDocument();
    expect(screen.queryByText('0')).toBeNull();
  });

  // Rubrikkerne kan mangle; totalen kan ikke. Uden den ville "point i alt"
  // forsvinde fra Mine tips, indtil serveren nåede rundt til spilleren.
  it('viser totalen, også når rubrikkerne mangler', () => {
    render(<PointOpdeling opdeling={null} total={42} />);
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  // Gulvet er en feature (saldoen går aldrig i minus), men det gør, at
  // rubrikkerne kan summe til noget helt andet end totalen. Uden forklaringen
  // ser regnestykket forkert ud.
  it('forklarer gulvet, når delene summer under nul', () => {
    render(<PointOpdeling opdeling={{ p1x2: 11, chance: -44.8, combi: 0, pulje: 8.5 }} total={0} raaTotal={-25.3} />);
    expect(screen.getByText(/kan ikke gå i minus/)).toBeInTheDocument();
    expect(screen.getByText(/-25,3/)).toBeInTheDocument();
  });

  it('forklarer ingenting, når gulvet ikke har været i brug', () => {
    render(<PointOpdeling opdeling={FULD} total={29.5} raaTotal={29.5} />);
    expect(screen.queryByText(/kan ikke gå i minus/)).toBeNull();
  });
});
