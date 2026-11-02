// ---------------------------------------------------------------------------
// FASEKALENDEREN OG SPORTENS ORD PÅ DE ØVRIGE FLADER (delopgave 5).
//
// Tip-fladen er testet i FootballTip.test.jsx, Runde-Botten i
// functions-platform/gameRecap.test.js. Her står resten af de flader, der
// sagde "Runde N" eller "Rundekongen": hver testes MED kalender (håndbold) og
// UDEN (Superligaen), og der assertes på det, der IKKE må stå — en flade, der
// glemte spillet, ville ellers stå grøn på fodboldens tekst.
// ---------------------------------------------------------------------------
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { HAANDBOLD_SPIL as HB, kl18 } from '../../test/faseKalender';

vi.mock('./football/useSpillerOpdeling', () => ({
  useSpillerOpdeling: (gameId, uid) => {
    if (!gameId) return { kampe: null, loading: false, error: null };
    return {
      kampe: uid === 'mig' ? { m1: { pick: '1' } } : { m1: { pick: '2' } },
      loading: false,
      error: null,
    };
  },
}));

import Pokaler from './Pokaler';
import FootballHelp from './football/FootballHelp';
import TipsHistorik from './football/TipsHistorik';
import MatchElo from './football/MatchElo';
import Indbyrdes from './football/Indbyrdes';
import { groupByRound } from './football/footballRounds';
import { buildTipsHistory } from './football/tipsHistory';

const SL = { id: 'superliga2627', type: 'football' };

describe('Pokaler — pokalens navn er sportens ord', () => {
  const rows = [
    { uid: 'a', name: 'Anne', perRound: { 1: 10, 2: 12 } },
    { uid: 'b', name: 'Bo', perRound: { 1: 4, 2: 3 } },
  ];
  const matches = [{ round: 1, result: '1' }, { round: 2, result: '2' }];

  it('håndbold: "Dagens konge" og "dagssejre" — aldrig "Rundekongen"', () => {
    const { container } = render(<Pokaler rows={rows} matches={matches} startRunde={null} game={HB} />);
    expect(screen.getByText(/^👑\s*Dagens konge$/)).toBeInTheDocument();
    expect(container.textContent).toMatch(/2 dagssejre/);
    expect(container.textContent).not.toMatch(/Rundekongen|rundesejr/);
  });

  it('håndbold med ligaens startdag: skalaen hedder "fra dag 1"', () => {
    const { container } = render(<Pokaler rows={rows} matches={matches} startRunde={1} game={HB} />);
    expect(container.textContent).toContain('fra dag 1');
    expect(container.textContent).not.toContain('fra runde');
  });

  it('Superligaen og intet spil: "Rundekongen" og "rundesejre" som før', () => {
    for (const game of [SL, null]) {
      const { container, unmount } = render(<Pokaler rows={rows} matches={matches} startRunde={1} game={game} />);
      expect(screen.getByText(/^👑\s*Rundekongen$/)).toBeInTheDocument();
      expect(container.textContent).toMatch(/2 rundesejre/);
      expect(container.textContent).toContain('fra runde 1');
      expect(container.textContent).not.toMatch(/Dagens konge|dagssejr|fra dag/);
      unmount();
    }
  });
});

describe('FootballHelp — faserne læses af kalenderen', () => {
  const medSpil = (game) => render(
    <MemoryRouter initialEntries={['/spil/x?fane=hjaelp']}>
      <Routes>
        <Route path="/spil/:gameId" element={<FootballHelp game={game} />} />
      </Routes>
    </MemoryRouter>,
  );

  it('håndbold: faserne fra kalenderen, "Dag 1 af 17", "Dagens konge" og "Dag X →"', () => {
    const { container } = medSpil(HB);
    const faser = screen.getByTestId('hjaelp-faser');
    expect(faser.textContent).toContain('Indledende runde, Hovedrunde, Kvartfinaler, Semifinaler, Finaledag.');
    expect(faser.textContent).toContain('Dag 1 af 17');
    expect(container.textContent).toContain('👑 Dagens konge');
    expect(container.textContent).not.toContain('Rundekongen');
    expect(container.textContent).toContain('Dag X →');
    expect(container.textContent).not.toContain('Runde X →');
    expect(container.textContent).toContain('Med knappen Dag N over podiet');
  });

  it('en anden kalender giver andre navne — teksten er ikke skrevet af', () => {
    medSpil({ ...HB, faser: [{ navn: 'Gruppespil', fra: 1, til: 3, start: '2027-06-01' }, { navn: 'Finale', fra: 4, til: 4, start: '2027-06-10' }] });
    const faser = screen.getByTestId('hjaelp-faser');
    expect(faser.textContent).toContain('Gruppespil, Finale.');
    expect(faser.textContent).toContain('Dag 1 af 4');
    expect(faser.textContent).not.toContain('Hovedrunde');
  });

  it('Superligaen: intet faseafsnit, "Rundekongen" og "Runde X →" som før', () => {
    const { container } = medSpil(SL);
    expect(screen.queryByTestId('hjaelp-faser')).toBeNull();
    expect(container.textContent).toContain('👑 Rundekongen');
    expect(container.textContent).toContain('Runde X →');
    expect(container.textContent).toContain('Med knappen Runde N over podiet');
    expect(container.textContent).not.toMatch(/Dagens konge|Dag X →|Turneringen har faser/);
  });
});

describe('TipsHistorik — rundens overskrift', () => {
  const MATCHES = [
    { id: 'm1', round: 1, home: 'AGF', away: 'OB', kickoff: new Date(kl18('2027-01-13')), result: '1', odds: { 1: 2.5, X: 4, 2: 4 } },
    { id: 'm2', round: 7, home: 'AGF', away: 'OB', kickoff: new Date(kl18('2027-01-20')), result: 'X', odds: { 1: 3, X: 3.4, 2: 2.6 } },
  ];
  const BETS = { m1: { pick: '1', points: 2.5 }, m2: { pick: 'X', points: 3.4 } };
  const hist = () => buildTipsHistory(groupByRound(MATCHES), BETS, 0);
  const overskrifter = (c) => [...c.querySelectorAll('.mytips__round')].map((e) => e.textContent);

  it('håndbold: dagens navn', () => {
    const { container } = render(<TipsHistorik history={hist()} total={5.9} game={HB} />);
    expect(overskrifter(container)).toEqual(['Hovedrunde · dag 1', 'Indledende runde · dag 1']);
  });

  it('Superligaen og uden spil: "Runde N" som før', () => {
    for (const game of [SL, undefined]) {
      const { container, unmount } = render(<TipsHistorik history={hist()} total={5.9} game={game} />);
      expect(overskrifter(container)).toEqual(['Runde 7', 'Runde 1']);
      unmount();
    }
  });
});

describe('MatchElo — udviklingspunkternes title', () => {
  const punkt = (round, delta) => ({ round, elo: 1500 + delta, delta });
  const AGF = { current: 1520, start: 1500, trend: 20, form: [punkt(6, 5), punkt(7, 15)] };
  const vis = (game) => render(
    <MemoryRouter initialEntries={['/spil/sl']}>
      <Routes>
        <Route path="/spil/:gameId" element={<MatchElo home="AGF" away="FCK" eloByTeam={{ AGF }} game={game} />} />
      </Routes>
    </MemoryRouter>,
  );

  it('håndbold: dagens navn', () => {
    vis(HB);
    expect(screen.getByTitle('Hovedrunde · dag 1')).toBeInTheDocument();
    expect(screen.getByTitle('Indledende runde · dag 6')).toBeInTheDocument();
    expect(screen.queryByTitle('Runde 7')).toBeNull();
  });

  it('Superligaen: "Runde N" som før', () => {
    vis(SL);
    expect(screen.getByTitle('Runde 7')).toBeInTheDocument();
    expect(screen.queryByTitle('Hovedrunde · dag 1')).toBeNull();
  });
});

describe('Indbyrdes — kolonnens navn', () => {
  const KAMPE = [{ id: 'm1', round: 7, home: 'AGF', away: 'OB', result: '1', kickoff: 5 }];
  const rounds = [{ round: 7, matches: KAMPE }];
  const vis = (game) => render(
    <Indbyrdes game={game} rounds={rounds} minUid="mig" dueUid="dem" dueNavn="Morten" />,
  );

  it('håndbold: "Dag"', async () => {
    vis({ ...HB, id: 'g1' });
    await userEvent.click(screen.getByRole('button', { name: /Jer to imellem/ }));
    const hoved = within(screen.getByRole('table')).getAllByRole('columnheader').map((e) => e.textContent);
    expect(hoved[0]).toBe('Dag');
  });

  it('Superligaen: "Runde"', async () => {
    vis({ id: 'g1' });
    await userEvent.click(screen.getByRole('button', { name: /Jer to imellem/ }));
    const hoved = within(screen.getByRole('table')).getAllByRole('columnheader').map((e) => e.textContent);
    expect(hoved[0]).toBe('Runde');
  });
});
