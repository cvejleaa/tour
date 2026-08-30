// xG (målchancer) i de to flader, og de ord der ALDRIG må stå der.
//
// Målingen (scripts/maal-xg.mjs) viser, at xG peger på det modsatte hold i 13
// af 37 afgjorte kampe. Et tal, der rammer forbi hver tredje gang, må ikke
// præsenteres som en dom over kampen. Sprogreglen er derfor ikke en aftale i
// en kommentar, men en test: den forbudte ordliste asserteres på fladen.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import HoldSide from './HoldSide';
import FootballHelp from './FootballHelp';

// Ord, der gør et beskrivende tal til en dom. "fortjent" er forbudt overalt,
// også i filnavne. De øvrige er Quality Controls udvidelse af listen.
const FORBUDTE = [
  'fortjent', 'undertjent', 'burde have vundet', 'skulle have vundet',
  'var bedst', 'spillede bedst', 'heldig', 'uheldig', 'tyveri', 'røvet', 'snydt',
];

const TEAMS = [
  { name: 'AGF', short: 'AGF', elo: 1500 },
  { name: 'OB', short: 'OB', elo: 1480 },
];
const kamp = (id, home, away, hg, ag, xh, xa) => ({
  id, round: 1, home, away, kickoff: 1000 + id,
  result: hg > ag ? '1' : (hg < ag ? '2' : 'X'),
  homeGoals: hg, awayGoals: ag, xgHome: xh, xgAway: xa,
});

const visHold = (matches) => render(
  <MemoryRouter initialEntries={['/spil/sl?fane=elo&hold=AGF']}>
    <Routes>
      <Route
        path="/spil/:gameId"
        element={<HoldSide game={{ id: 'sl', type: 'football', teams: TEAMS }} matches={matches} short="AGF" />}
      />
    </Routes>
  </MemoryRouter>,
);

describe('holdsidens kort: Mål og målchancer', () => {
  it('viser begge sider af regnskabet', () => {
    visHold([kamp(1, 'AGF', 'OB', 2, 0, 1.4, 0.7), kamp(2, 'OB', 'AGF', 1, 3, 0.9, 2.2)]);
    expect(screen.getByText(/Mål og målchancer/)).toBeInTheDocument();
    expect(screen.getByText('Scoret')).toBeInTheDocument();
    expect(screen.getByText('Lukket ind')).toBeInTheDocument();
  });

  it('siger at BEGGE kolonner dækker samme kampe — og hvor mange', () => {
    visHold([kamp(1, 'AGF', 'OB', 2, 0, 1.4, 0.7), kamp(2, 'OB', 'AGF', 1, 3, 0.9, 2.2)]);
    expect(screen.getByText(/Begge kolonner dækker de samme 2 kampe/)).toBeInTheDocument();
  });

  it('siger det HØJT, når nogle spillede kampe mangler målchancer', () => {
    // Uden den sætning ser et manglende tal ud som en overpræstation.
    visHold([
      kamp(1, 'AGF', 'OB', 2, 0, 1.4, 0.7),
      kamp(2, 'OB', 'AGF', 0, 4, null, null),
    ]);
    expect(screen.getByText(/holdet har spillet 2 kampe/)).toBeInTheDocument();
  });

  it('kortet SKJULES helt, når ingen kamp har målchancer', () => {
    visHold([kamp(1, 'AGF', 'OB', 2, 0, null, null)]);
    expect(screen.queryByText(/Mål og målchancer/)).toBeNull();
    // Og der står ingen nuller i stedet.
    expect(screen.queryByText('Scoret')).toBeNull();
  });

  it('ÉT datapunkt er nok — kortet må ikke være skjult for et nystartet spil', () => {
    visHold([kamp(1, 'AGF', 'OB', 1, 1, 0.8, 1.9)]);
    expect(screen.getByText(/Mål og målchancer/)).toBeInTheDocument();
    expect(screen.getByText(/Begge kolonner dækker de samme 1 kamp/)).toBeInTheDocument();
  });

  it('fælder INGEN dom — ingen af de forbudte ord står på siden', () => {
    visHold([kamp(1, 'AGF', 'OB', 4, 0, 0.3, 2.8)]); // groft "heldig" resultat
    const tekst = document.body.textContent.toLowerCase();
    for (const ord of FORBUDTE) {
      expect(tekst, `"${ord}" står på holdsiden`).not.toContain(ord);
    }
  });
});

describe('guidens afsnit om målchancer', () => {
  const guide = (game) => render(
    <MemoryRouter initialEntries={['/spil/sl?fane=hjaelp']}>
      <Routes><Route path="/spil/:gameId" element={<FootballHelp game={game} />} /></Routes>
    </MemoryRouter>,
  );
  const medKilde = { id: 'sl', type: 'football', sync: { provider: 'superliga' } };

  it('forklarer hvad tallet ER, og hvad det IKKE er', () => {
    guide(medKilde);
    const afsnit = screen.getByText(/Målchancer \(xG\)/).closest('section, div');
    expect(afsnit.textContent).toMatch(/hvor gode chancer hvert hold skabte/i);
    expect(afsnit.textContent).toMatch(/ikke et bud på, hvem der burde have vundet/i);
  });

  it('siger hvor ofte tallet er uenigt — 13 af 37, ikke en vag advarsel', () => {
    guide(medKilde);
    const afsnit = screen.getByText(/Målchancer \(xG\)/).closest('section, div');
    expect(afsnit.textContent).toMatch(/13 ud af 37/);
  });

  it('lover ALDRIG et nul for et manglende tal', () => {
    guide(medKilde);
    const afsnit = screen.getByText(/Målchancer \(xG\)/).closest('section, div');
    expect(afsnit.textContent).toMatch(/aldrig 0,0 for et tal, vi mangler/i);
  });

  it('afsnittet er VÆK i et spil, hvis kilde ikke kan levere målchancer', () => {
    // Guiden er en regelbog for ÉT spil. Den må ikke forklare et tal, spillet
    // aldrig får — gaten er spil-bred, ikke pr. kamp.
    guide({ id: 'x', type: 'football', sync: { provider: 'ukendt' } });
    expect(screen.queryByText(/Målchancer \(xG\)/)).toBeNull();
  });
});
