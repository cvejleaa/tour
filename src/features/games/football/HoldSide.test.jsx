import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import HoldSide from './HoldSide';

const TEAMS = [
  { name: 'FC København', short: 'FCK', color: '#fff', elo: 1600 },
  { name: 'Brøndby IF', short: 'BIF', color: '#ff0', elo: 1500 },
  { name: 'AGF', short: 'AGF', color: '#f00', elo: 1450 },
];

function spil(extra = {}) {
  return { id: 'sl', name: 'Superligaen', type: 'football', teams: TEAMS, ...extra };
}

function kamp(id, round, home, away, extra = {}) {
  return { id, round, home, away, ...extra };
}

function vis(ui) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

/** I et spil (ruten /spil/:gameId), så GameTabLink kan bygge sine stier. */
function visISpil(ui) {
  return render(
    <MemoryRouter initialEntries={['/spil/sl?fane=elo&hold=FCK']}>
      <Routes><Route path="/spil/:gameId" element={ui} /></Routes>
    </MemoryRouter>,
  );
}

describe('HoldSide', () => {
  it('siger hvilken kortkode der ikke findes — ikke bare "ukendt"', () => {
    // Et delt link til et hold, spillet ikke har. Modtageren skal kunne se
    // HVAD der blev spurgt om, ellers kan han ikke gætte, hvad linket ville.
    vis(<HoldSide game={spil()} matches={[]} short="XYZ" />);
    expect(screen.getByText(/ikke noget hold med kortkoden/i)).toBeInTheDocument();
    expect(screen.getByText('XYZ')).toBeInTheDocument();
    expect(screen.getByText(/Superligaen/)).toBeInTheDocument();
  });

  it('finder holdet uanset store og små bogstaver i URL en', () => {
    vis(<HoldSide game={spil()} matches={[]} short="fck" />);
    expect(screen.getByText('FC København')).toBeInTheDocument();
    expect(screen.queryByText(/ikke noget hold med kortkoden/i)).not.toBeInTheDocument();
  });

  it('skriver "i dette spil", ALDRIG "sæsonen"', () => {
    // Premier League-spillet er runde 1-18 af 38; forårets kampe bliver et
    // andet games-dokument. "Sæsonen" ville være usandt på skærmen.
    const matches = [kamp('a', 1, 'FC København', 'AGF', { result: '1', homeGoals: 2, awayGoals: 0 })];
    const { container } = vis(<HoldSide game={spil()} matches={matches} short="FCK" />);
    expect(screen.getByText(/1 kamp spillet i dette spil/i)).toBeInTheDocument();
    // Ordet må ikke findes NOGEN steder på siden — heller ikke i en
    // korttitel eller en fodnote.
    expect(container.textContent).not.toMatch(/sæsonen/i);
  });

  it('viser den tomme tilstand uden at finde på tal', () => {
    const { container } = vis(<HoldSide game={spil()} matches={[]} short="FCK" />);
    expect(screen.getByText(/ingen spillede kampe i dette spil endnu/i)).toBeInTheDocument();
    // Ingen form, ingen hjemme/ude, ingen forventning — kortene må ikke stå
    // med nuller, som om de var målt.
    expect(container.textContent).not.toMatch(/Hjemme og ude/);
    expect(container.textContent).not.toMatch(/Mod modellens forventning/);
  });

  it('viser RÅ tal hjemme og ude — aldrig en procent', () => {
    const matches = [
      kamp('h', 1, 'FC København', 'AGF', { result: '1', homeGoals: 3, awayGoals: 0 }),
      kamp('u', 2, 'Brøndby IF', 'FC København', { result: '1', homeGoals: 1, awayGoals: 0 }),
    ];
    const { container } = vis(<HoldSide game={spil()} matches={matches} short="FCK" />);
    expect(screen.getByText(/1 kamp: 1-0-0, mål 3-0/)).toBeInTheDocument();
    expect(screen.getByText(/1 kamp: 0-0-1, mål 0-1/)).toBeInTheDocument();
    // Efter én hjemmekamp ville "100 %" ligne en statistik.
    expect(container.textContent).not.toMatch(/%/);
  });

  it('SKJULER bankerkortet for et hold, der aldrig var favorit', () => {
    // Hull City-tilfældet: en brøk med nævner nul er et fravær, ikke et tal.
    const matches = [
      kamp('a', 1, 'AGF', 'FC København', {
        result: '2', odds: { 1: 4.5, X: 3.6, 2: 1.7 },
      }),
    ];
    vis(<HoldSide game={spil()} matches={matches} short="AGF" />);
    expect(screen.getByText(/Mod oddsenes favorit/)).toBeInTheDocument();
    expect(screen.getByText(/Som udfordrer/)).toBeInTheDocument();
    expect(screen.queryByText(/Som favorit/)).not.toBeInTheDocument();
  });

  it('skjuler HELE favoritkortet, når holdet hverken var favorit eller udfordrer', () => {
    const matches = [kamp('a', 1, 'FC København', 'AGF', { result: '1' })];
    const { container } = vis(<HoldSide game={spil()} matches={matches} short="FCK" />);
    expect(container.textContent).not.toMatch(/Mod oddsenes favorit/);
  });

  it('siger MODELLEN, aldrig oddsene, om forventningen', () => {
    // Tallet regnes forfra på én model — ikke af de frosne odds, der bærer
    // to forskellige modeller. Ordvalget er hele forskellen på skærmen.
    const matches = [kamp('a', 1, 'FC København', 'AGF', { result: '1' })];
    vis(<HoldSide game={spil()} matches={matches} short="FCK" />);
    expect(screen.getByText(/Mod modellens forventning/)).toBeInTheDocument();
    expect(screen.getByText(/end modellen ventede/)).toBeInTheDocument();
    expect(screen.getByText(/ikke\s+af de odds, kampene blev prissat med/i)).toBeInTheDocument();
  });

  it('viser en LISTE frem for en graf under gulvet, og siger hvorfor', () => {
    const matches = [
      kamp('a', 1, 'FC København', 'AGF', { result: '1', homeGoals: 2, awayGoals: 0 }),
      kamp('b', 2, 'FC København', 'Brøndby IF', { result: '1', homeGoals: 1, awayGoals: 0 }),
    ];
    const { container } = vis(<HoldSide game={spil()} matches={matches} short="FCK" />);
    // Selve LISTEN skal stå der — fodnoten alene beviser ikke, at grafen
    // udeblev. Mutationen "tegn altid grafen" overlevede netop dét hul.
    expect(screen.getByText(/1× med 1 mål/)).toBeInTheDocument();
    expect(screen.getByText(/1× med 2 mål/)).toBeInTheDocument();
    expect(screen.getByText(/for få til en fordeling/i)).toBeInTheDocument();
    expect(screen.getByText(/der skal 5 til/i)).toBeInTheDocument();
    // Og ingen søjler: en graf med to søjler inviterer til at læse en form.
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBe(0);
  });

  it('tegner grafen, når der ER sejre nok', () => {
    const matches = Array.from({ length: 5 }, (_, i) => kamp(`s${i}`, i + 1, 'FC København', 'AGF', {
      result: '1', homeGoals: 2, awayGoals: 0,
    }));
    const { container } = vis(<HoldSide game={spil()} matches={matches} short="FCK" />);
    expect(screen.getByText(/Fordelt på 5 sejre/)).toBeInTheDocument();
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
    expect(screen.queryByText(/for få til en fordeling/i)).not.toBeInTheDocument();
  });

  it('markerer HVILKE runder Elo er målt efter, så et hul er synligt', () => {
    // Snapshottet skrives kun, når en HEL runde er spillet. Forbandt vi bare
    // punkterne, ville en udsat runde blive usynlig.
    const game = spil({
      eloHistory: [
        { round: 1, elo: { 'FC København': 1610 } },
        { round: 3, elo: { 'FC København': 1625 } },
      ],
    });
    vis(<HoldSide game={game} matches={[]} short="FCK" />);
    expect(screen.getByText(/Målt efter runde 1, 3/)).toBeInTheDocument();
    expect(screen.getByText(/endnu ikke spillet færdig/)).toBeInTheDocument();
  });

  it('viser kampene med runde, side og resultat', () => {
    const matches = [
      kamp('a', 7, 'AGF', 'FC København', { result: '2', homeGoals: 0, awayGoals: 2 }),
      kamp('b', 9, 'FC København', 'Brøndby IF'),
    ];
    vis(<HoldSide game={spil()} matches={matches} short="FCK" />);
    expect(screen.getByText('R7')).toBeInTheDocument();
    expect(screen.getByText('R9')).toBeInTheDocument();
    expect(screen.getByText('2-0')).toBeInTheDocument();
  });

  // ── Hop til kampens kort (ejerens ønske 6/9 2026) ─────────────────────────
  it('hver kamprække er ét link til kampens kort på Tip-fanen — i kampens EGEN runde, med kampens id', () => {
    const matches = [
      kamp('r7-agf-fck', 7, 'AGF', 'FC København', { result: '2', homeGoals: 0, awayGoals: 2 }),
      kamp('r9-fck-bif', 9, 'FC København', 'Brøndby IF'),
    ];
    visISpil(<HoldSide game={spil()} matches={matches} short="FCK" />);
    const raekker = screen.getAllByTestId('holdside-kamp');
    expect(raekker).toHaveLength(2);
    expect(raekker[0].tagName).toBe('A');
    expect(raekker[0].getAttribute('href')).toBe('/spil/sl?runde=7&kamp=r7-agf-fck');
    expect(raekker[0]).toHaveAttribute('title', 'Åbn kampen på Tip-fanen');
    // Hele rækken er linket — runde, side, modstander og resultat står inde i det.
    expect(raekker[0].textContent).toContain('R7');
    expect(raekker[0].textContent).toContain('2-0');
    // En kommende kamp linker også (kortet viser kickoff og tip).
    expect(raekker[1].getAttribute('href')).toBe('/spil/sl?runde=9&kamp=r9-fck-bif');
  });

  it('en kamp uden rundenummer står som ren tekst — Tip-fanen kan ikke vise den', () => {
    const matches = [kamp('x', 0, 'AGF', 'FC København')];
    visISpil(<HoldSide game={spil()} matches={matches} short="FCK" />);
    const raekke = screen.getByTestId('holdside-kamp');
    expect(raekke.tagName).toBe('DIV');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  // QC-FUND PÅ PLANEN: Tip-fanen tegner aldrig runder før startrunden
  // (fraStartRunde). Stod de her, landede et klik på en tilfældig anden runde
  // uden fremhævning. Gaten gælder HELE holdsiden, så «i dette spil» også
  // er sandt for tallene.
  it('runder før spillets startrunde er IKKE med — hverken i listen eller i tallene', () => {
    const matches = [
      kamp('r1-fck-agf', 1, 'FC København', 'AGF', { result: '1', homeGoals: 3, awayGoals: 0 }),
      kamp('r2-agf-fck', 2, 'AGF', 'FC København', { result: '2', homeGoals: 0, awayGoals: 2 }),
    ];
    visISpil(<HoldSide game={spil({ startRound: 2 })} matches={matches} short="FCK" />);
    expect(screen.queryByText('R1')).not.toBeInTheDocument();
    expect(screen.getByText('R2')).toBeInTheDocument();
    expect(screen.getAllByTestId('holdside-kamp')).toHaveLength(1);
    // Tallene tæller kun runde 2: 1 kamp spillet, 2 mål for, 0 imod.
    expect(screen.getByText(/1 kamp spillet i dette spil/)).toBeInTheDocument();
    expect(screen.queryByText(/2 kampe spillet i dette spil/)).not.toBeInTheDocument();
  });
});
