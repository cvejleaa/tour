import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import FootballHelp from './FootballHelp';

describe('FootballHelp (spil-intern hjælp)', () => {
  it('viser Superliga-mekanikken inkl. hvordan combi-bonus beregnes', () => {
    render(<MemoryRouter><FootballHelp /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: /Sådan forløber en runde/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Point følger oddsene/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Combi-runde-bonus/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Chancen/ })).toBeInTheDocument();
    // Combi-beregningen forklares konkret (ganges sammen + eksempel).
    expect(screen.getByText(/Sådan beregnes den/)).toBeInTheDocument();
    expect(screen.getByText(/1,5 × 2,0 × 3,0/)).toBeInTheDocument();
    // Elo-beregningen forklares også — inkl. hvorfor holdene ikke starter ens
    // og et outsider-slår-favorit-eksempel.
    expect(screen.getByRole('heading', { name: /Elo-tabellen/ })).toBeInTheDocument();
    expect(screen.getByText(/Sådan beregnes Elo/)).toBeInTheDocument();
    expect(screen.getByText(/sidste 3 års resultater/)).toBeInTheDocument();
    expect(screen.getByText(/outsider slår favorit/i)).toBeInTheDocument();
  });
});
