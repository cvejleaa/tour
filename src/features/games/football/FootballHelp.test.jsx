import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import FootballHelp from './FootballHelp';

describe('FootballHelp (spil-intern hjælp)', () => {
  it('viser Superliga-mekanikken inkl. hvordan combi-bonus beregnes', () => {
    render(
      <MemoryRouter initialEntries={['/spil/sl?fane=hjaelp']}>
        <Routes>
          <Route path="/spil/:gameId" element={<FootballHelp />} />
        </Routes>
      </MemoryRouter>,
    );
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

  // Guiden henviser til faner mange steder. Uden en Route ville GameTabLink
  // falde tilbage til ren tekst, og alle henvisningerne ville være grønne og
  // utestede.
  it('gør fane-henvisningerne til rigtige links', () => {
    render(
      <MemoryRouter initialEntries={['/spil/sl?fane=hjaelp']}>
        <Routes>
          <Route path="/spil/:gameId" element={<FootballHelp />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getAllByRole('link', { name: '👥 Ligaer' })[0])
      .toHaveAttribute('href', '/spil/sl?fane=ligaer');
    expect(screen.getAllByRole('link', { name: '📈 Elo' })[0])
      .toHaveAttribute('href', '/spil/sl?fane=elo');
    // "Mit hold" hedder profil som fane-nøgle — nem at ramme forkert.
    expect(screen.getAllByRole('link', { name: '🙂 Mit hold' })[0])
      .toHaveAttribute('href', '/spil/sl?fane=profil');
  });
});
