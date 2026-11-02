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

  // Tomtilstanden står UNDER titlen «Dagens konge» — og skal tale om dage
  // (modstanderens fund 3). Begge grene: intet færdigt, og færdigt uden vinder.
  it('håndbold, tom: «Ingen dage er spillet færdig endnu» — ikke «runder»', () => {
    const { container } = render(<Pokaler rows={rows} matches={[{ round: 1, result: null }]} startRunde={null} game={HB} />);
    expect(container.textContent).toContain('Ingen dage er spillet færdig endnu.');
    expect(container.textContent).not.toMatch(/\brunde/);
  });

  it('håndbold, ingen vinder: «Ingen har vundet en dag endnu»', () => {
    const nul = rows.map((r) => ({ ...r, perRound: { 1: 0, 2: 0 } }));
    const { container } = render(<Pokaler rows={nul} matches={matches} startRunde={null} game={HB} />);
    expect(container.textContent).toContain('Ingen har vundet en dag endnu.');
    expect(container.textContent).not.toMatch(/\brunde/);
  });

  it('Superligaen, tom: tomtilstandens tekster som før', () => {
    const tom = render(<Pokaler rows={rows} matches={[{ round: 1, result: null }]} startRunde={null} game={SL} />);
    expect(tom.container.textContent).toContain('Ingen runder er spillet færdig endnu.');
    tom.unmount();
    const nul = rows.map((r) => ({ ...r, perRound: { 1: 0, 2: 0 } }));
    const ingen = render(<Pokaler rows={nul} matches={matches} startRunde={null} game={SL} />);
    expect(ingen.container.textContent).toContain('Ingen har vundet en runde endnu.');
    expect(ingen.container.textContent).not.toMatch(/\bdag/);
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
    // «Hver spilledag er én runde for pointene» var en sætning, hvor «runde»
    // betød noget andet end resten af guiden (modstanderen).
    expect(faser.textContent).toContain('Pointene gøres op pr. spilledag: hver dag har sin egen kupon og sin egen combi');
    expect(faser.textContent).not.toMatch(/\bén runde/);
    expect(container.textContent).toContain('👑 Dagens konge');
    expect(container.textContent).not.toContain('Rundekongen');
    expect(container.textContent).toContain('Dag X →');
    expect(container.textContent).not.toContain('Runde X →');
    expect(container.textContent).toContain('Med knappen Dag N over podiet');
  });

  // Puljegrænsen er tre DAGE i en turnering (PULJE_MAKS_STARTRUNDE tæller
  // runder = dage) — teksten skal sige det, ikke «efter runde 3».
  it('håndbold med pulje: «Starter ligaen efter dag 3»', () => {
    const { container } = medSpil({ ...HB, pulje: { type: 'top' } });
    const t = container.textContent.replace(/\s+/g, ' ');
    expect(t).toContain('Starter ligaen efter dag 3, tæller puljebonussen ikke med');
    expect(t).not.toContain('efter runde 3');
  });

  it('håndbold med egen puljegrænse: «Starter ligaen efter dag 8»', () => {
    const { container } = medSpil({ ...HB, pulje: { maksStartRunde: 8 } });
    const t = container.textContent.replace(/\s+/g, ' ');
    expect(t).toContain('Starter ligaen efter dag 8, tæller puljebonussen ikke med');
    expect(t).not.toContain('efter dag 3');
  });

  // Runde-puljen (semifinalisterne): HVORNÅR den afgøres står i kalenderen,
  // og liga-sproget ("står lige nu") må ikke stå i en turnerings regelbog.
  it('håndbold med runde-pulje: afgøres, når semifinalerne er lagt ind', () => {
    const { container } = medSpil({ ...HB, pulje: { poolSize: 4, facitKilde: 'runde', facitFase: 'Semifinaler' } });
    const t = container.textContent.replace(/\s+/g, ' ');
    // Et hold NÅR semifinalerne; «står i» er liga-sprog (PuljeTip.test.jsx
    // forbyder det samme ord på pulje-kortet — de to flader siger nu det samme).
    expect(t).toContain('forudsiger du de 4 hold, der når semifinalerne.');
    expect(t).toContain('Puljen afgøres, når semifinalerne er lagt ind — de spilles fredag 29. januar. Hvert hold, du rammer, giver +4 point');
    expect(t).toContain('og når semifinalerne er lagt ind, hvordan det gik i din liga.');
    const afsnit = t.slice(t.indexOf('Bonus: pulje-tip'), t.indexOf('hvordan det gik i din liga'));
    expect(afsnit).not.toMatch(/står i|står rigtigt|Afgøres på|grundspillets slutstilling|står lige nu i din liga/);
  });

  // MELLEMRUMMET (modstander-fund R1): «.» + linjeskift + {grenen} gav
  // «mesterskabsspillet.Afgøres på». Teksten er her den samme som før D10 —
  // byte for byte, uden at normalisere mellemrum væk.
  it('Superligaen med pulje: pulje-afsnittet er uændret — med mellemrum efter punktum', () => {
    const { container } = medSpil({ ...SL, pulje: { poolSize: 6 } });
    const t = container.textContent;
    expect(t).toContain('forudsiger du de 6 hold, der står i mesterskabsspillet. Afgøres på grundspillets slutstilling: hvert hold, der står rigtigt, giver +');
    expect(t).not.toContain('mesterskabsspillet.Afgøres');
    expect(t).not.toMatch(/der når|du rammer, giver|lagt ind/);
  });

  it('Superligaen med pulje: «Starter ligaen efter runde 3» som før', () => {
    const { container } = medSpil({ ...SL, pulje: { type: 'top' } });
    const t = container.textContent.replace(/\s+/g, ' ');
    expect(t).toContain('Starter ligaen efter runde 3, tæller puljebonussen ikke med');
    expect(t).not.toContain('efter dag 3');
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

  // Den SYNLIGE tekst og aria-labelen fulgte ikke med punkternes title
  // (modstanderens fund 4). Alle tre former: to punkter, ét punkt, ingen.
  const visMed = (game, form) => render(
    <MemoryRouter initialEntries={['/spil/sl']}>
      <Routes>
        <Route path="/spil/:gameId" element={<MatchElo home="AGF" away="FCK" eloByTeam={{ AGF: { ...AGF, form } }} game={game} />} />
      </Routes>
    </MemoryRouter>,
  );

  it('håndbold: «Styrke efter seneste spillede dag» og «seneste 2 dage»', () => {
    const { container } = visMed(HB, AGF.form);
    expect(container.textContent).toContain('Styrke efter seneste spillede dag — ikke et bud på denne kamp.');
    expect(screen.getByLabelText('AGF: udvikling over de seneste 2 dage')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\brunde/);
  });

  it('håndbold, ét punkt: «seneste dag»', () => {
    const { container } = visMed(HB, [punkt(7, 15)]);
    expect(screen.getByLabelText('AGF: udvikling seneste dag')).toBeInTheDocument();
    expect(container.textContent).toContain('seneste dag');
    expect(container.textContent).not.toMatch(/\brunde/);
  });

  it('håndbold, ingen punkter: «når der er spillet dage»', () => {
    const { container } = visMed(HB, []);
    expect(container.textContent).toContain('Start-rating — udviklingen kommer, når der er spillet dage.');
    expect(container.textContent).not.toMatch(/\brunde/);
  });

  it('Superligaen: de synlige tekster og aria-labels som før', () => {
    const to = visMed(SL, AGF.form);
    expect(to.container.textContent).toContain('Styrke efter seneste spillede runde — ikke et bud på denne kamp.');
    expect(screen.getByLabelText('AGF: udvikling over de seneste 2 runder')).toBeInTheDocument();
    to.unmount();
    const et = visMed(SL, [punkt(7, 15)]);
    expect(screen.getByLabelText('AGF: udvikling seneste runde')).toBeInTheDocument();
    expect(et.container.textContent).toContain('seneste runde');
    et.unmount();
    const ingen = visMed(SL, []);
    expect(ingen.container.textContent).toContain('Start-rating — udviklingen kommer, når der er spillet runder.');
    expect(ingen.container.textContent).not.toMatch(/\bdag/);
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
