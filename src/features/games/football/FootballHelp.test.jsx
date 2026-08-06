import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import FootballHelp from './FootballHelp';
import { RUBRIKKER } from './PointOpdeling';
import { COMBI, ODDS, TRAEF_BONUS } from '../../../lib/superligaScoring';

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
    expect(screen.getByText(/1,5 · 2,0 · 3,0/)).toBeInTheDocument();
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

  // Udbetalingstabellen er hele pointen med "et link til en tabel": spilleren
  // skal kunne se, hvad en kupon giver, uden at regne kvadratrødder i hovedet.
  // Tallene REGNES af formlen — testen tjekker dem derfor mod formlen, ikke mod
  // en afskrift. Ændres faktoren, skal tabellen følge med af sig selv.
  it('viser en udbetalingstabel, der er regnet af den rigtige formel', () => {
    render(
      <MemoryRouter initialEntries={['/spil/sl?fane=hjaelp']}>
        <Routes>
          <Route path="/spil/:gameId" element={<FootballHelp />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: /Udbetalingstabel/ })).toBeInTheDocument();
    // Produkt 100 → 2 × √100 = 20,0. Produkt 300 er over loftet → 25.
    const raekke = (tekst) => screen.getByText(tekst).closest('tr');
    expect(raekke('100,0')).toHaveTextContent('+20,0');
    expect(raekke('300,0')).toHaveTextContent(`+${COMBI.LOFT}`);
    expect(raekke('300,0')).toHaveTextContent('loft');
    // Og et lille produkt må IKKE give loftet — ellers er tabellen bare pynt.
    expect(raekke('4,0')).toHaveTextContent('+4,0');
    expect(raekke('4,0')).not.toHaveTextContent('loft');
  });

  // Udsatte kampe er den ændring, spillerne bliver spurgt om. Kan hjælpesiden
  // ikke svare, ender spørgsmålet i chatten.
  it('forklarer, hvad der sker med en udsat kamp', () => {
    render(
      <MemoryRouter initialEntries={['/spil/sl?fane=hjaelp']}>
        <Routes>
          <Route path="/spil/:gameId" element={<FootballHelp />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: /Når en kamp bliver udsat/ })).toBeInTheDocument();
    expect(screen.getByText(/rundens kampe i samme uge/)).toBeInTheDocument();
    // Det vigtigste for spilleren: point går ikke tabt, kun combi'en venter ikke.
    expect(screen.getByText(/1X2-point og Chancen præcis som altid/)).toBeInTheDocument();
  });

  // Den gamle regel ("alle på nær én, ellers ingenting") stod fem steder. Står
  // den stadig ét sted, lover hjælpesiden noget, serveren ikke udbetaler.
  it('lover ikke længere den gamle 0-eller-1-fejl-regel', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/spil/sl?fane=hjaelp']}>
        <Routes>
          <Route path="/spil/:gameId" element={<FootballHelp />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(container.textContent).not.toMatch(/på nær én/);
    expect(container.textContent).not.toMatch(/To eller flere fejl/);
    expect(container.textContent).toMatch(/Hver ramt kamp tæller/);
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

  // GUIDEN ER SPILLERNES REGELBOG, og den har nu tre gange på tre dage sagt
  // noget andet end koden. Eksempeltallene bindes derfor til FORMLEN, ikke til
  // en afskrift: hardkodes de tilbage til de gamle 2,3/5,5, skal denne test
  // falde. Og teksten må aldrig kunne skrive "plus 0 point", når skruen er nul.
  it('regner eksemplerne af træf-bonussen — og skriver aldrig "plus 0 point"', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/spil/sl?fane=hjaelp']}>
        <Routes>
          <Route path="/spil/:gameId" element={<FootballHelp />} />
        </Routes>
      </MemoryRouter>,
    );
    const komma = (n) => n.toFixed(1).replace('.', ',');
    expect(container.textContent).toContain(`${komma(1.3 + TRAEF_BONUS)} point`);
    expect(container.textContent).toContain(`${komma(4.5 + TRAEF_BONUS)} point`);
    // Regex, ikke toContain: "plus 0 point" findes også inde i "plus 0,5 point".
    expect(container.textContent).not.toMatch(/plus 0 point/);
    // Loftet SKAL nævnes ved sit navn. Uden det lover teksten ren fairness
    // netop dér, hvor spillet betaler mindre end fair — på de mest
    // usandsynlige udfald. En løsere regex på "6,0" ville ramme et hvilket
    // som helst andet tal i teksten og lyse grønt uden at bevise noget.
    // Bindes til konstanten, ikke til et tal i teksten: hæves ODDS.MAX for et
    // spil, skal guiden følge med af sig selv.
    expect(container.textContent).toContain(`højst ${ODDS.MAX.toFixed(1).replace('.', ',')}`);
  });
});
