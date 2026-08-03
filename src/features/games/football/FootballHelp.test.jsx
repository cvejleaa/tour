import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import FootballHelp from './FootballHelp';
import { RUBRIKKER } from './PointOpdeling';

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
  // Hjælpesiden skal blive ved med at passe på appen. Fjernes afsnittet, står
  // der intet sted, at stillingen kommer af sig selv — og så genindlæser folk
  // siden manuelt for at se, om der er sket noget.
  it('forklarer, at stillingen opdaterer sig selv under kampen', () => {
    render(<MemoryRouter><FootballHelp /></MemoryRouter>);
    expect(screen.getByText(/Mens kampen spilles/)).toBeInTheDocument();
    expect(screen.getByText(/opdaterer sig selv hvert minut/)).toBeInTheDocument();
  });

  // Hjælpeteksten og kortet er drevet fra hinanden to gange på to dage: først
  // lovede den, at slutresultatet AFLØSER den levende stilling, og derefter at
  // kortet står uden tal. Begge dele var forkerte, og intet fangede det.
  it('lover det samme om slutfløjt, som kortet faktisk gør', () => {
    render(<MemoryRouter><FootballHelp /></MemoryRouter>);
    expect(screen.getByText(/Slut · afventer facit/)).toBeInTheDocument();
    expect(screen.getByText(/tallet forsvinder ikke/)).toBeInTheDocument();
  });

  // To nye ting kan man ikke gætte sig til: at knappen findes, og at et navn
  // kan klikkes. Står de ikke i hjælpen, findes de i praksis ikke.
  it('fortæller om opdelingen og om at klikke på et navn', () => {
    render(<MemoryRouter><FootballHelp /></MemoryRouter>);
    expect(screen.getByText(/Hvor kommer pointene fra/)).toBeInTheDocument();
    expect(screen.getByText(/Klik på et navn/)).toBeInTheDocument();
  });

  // Rubrik-navnene hentes fra RUBRIKKER. Skrives de af, hedder de noget andet
  // på hjælpesiden end på skærmen, næste gang et ord ændres.
  it('bruger de samme rubrik-navne som skærmen', () => {
    const { container } = render(<MemoryRouter><FootballHelp /></MemoryRouter>);
    for (const { navn } of RUBRIKKER) {
      expect(container.textContent).toContain(navn);
    }
  });

  // Man kan nu se en ligakammerats tips for HELE sæsonen i ét klik. Det skal
  // stå i hjælpen — begge veje.
  it('siger, at de andre kan se ens egne tips på samme måde', () => {
    render(<MemoryRouter><FootballHelp /></MemoryRouter>);
    expect(screen.getByText(/de kan se dine på samme måde/)).toBeInTheDocument();
  });

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
