// ---------------------------------------------------------------------------
// KNOCKOUT OG SPORT-TEKSTER PÅ FLADERNE (delopgave 11 og 12).
//
// D11: en knockout-kamp tippes på stillingen efter ordinær tid (60 min i
// håndbold), og X er muligt (ejerens beslutning §11.1). Slutresultatet efter
// forlængelse/straffekast står for sig: «30-30 · 35-34 e.f.». Hver flade, der
// viser et resultat eller et 1X2, skal vise begge — ellers står der ✗ på et
// 1-tip til det hold, der gik videre, uden et ord om hvorfor.
//
// D12: tekster, der kun er sande for en liga med hjemmebane, gates på EVNERNE
// (harFaseKalender, harHjemmebane, harKnockout) — aldrig på sporten.
//
// Hver flade testes MED (håndbold) og UDEN (Superligaen), og der assertes på
// det, der IKKE må stå. Kampkortet på Tip står i FootballTip.test.jsx.
// ---------------------------------------------------------------------------
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { HAANDBOLD_SPIL as HB, TEST_FASER, kl18 } from '../../test/faseKalender';
import { medProeveSport } from '../../test/proeveSport';

vi.mock('./football/useSpillerOpdeling', () => ({
  useSpillerOpdeling: (gameId, uid) => {
    if (!gameId) return { kampe: null, loading: false, error: null };
    return {
      kampe: uid === 'mig' ? { k1: { pick: 'X', points: 6 } } : { k1: { pick: '1', points: 0 } },
      loading: false,
      error: null,
    };
  },
}));

import TipsHistorik from './football/TipsHistorik';
import Indbyrdes from './football/Indbyrdes';
import HoldSide from './football/HoldSide';
import EloTable from './football/EloTable';
import FootballHelp from './football/FootballHelp';
import { groupByRound } from './football/footballRounds';
import { buildTipsHistory } from './football/tipsHistory';

const SL = { id: 'superliga2627', type: 'football', sync: { provider: 'superliga' } };
const REGEL = 'Knockout: vi tipper stillingen efter 60 min. Uafgjort er X, også når nogen vinder i forlængelsen.';

// Kvartfinalen (runde 14 i testkalenderen) gik i forlængelse: 30-30 efter
// 60 min, Danmark vandt 35-34. X er det rigtige tip.
const KO = {
  id: 'k1', round: 14, home: 'Danmark', away: 'Norge', kickoff: new Date(kl18('2027-01-27')),
  homeGoals: 30, awayGoals: 30, result: 'X', slut: { home: 35, away: 34, afgjort: 'forlaenget' },
  odds: { 1: 1.8, X: 6, 2: 3 },
};
// Samme dag, afgjort i ordinær tid — ingen slut.
const KO2 = {
  id: 'k2', round: 14, home: 'Sverige', away: 'Spanien', kickoff: new Date(kl18('2027-01-27') + 7200000),
  homeGoals: 27, awayGoals: 25, result: '1', odds: { 1: 2, X: 6, 2: 2.5 },
};

describe('Mine tips / spillerdetaljen (TipsHistorik): begge stillinger og reglen', () => {
  const hist = (kampe, bets) => buildTipsHistory(groupByRound(kampe), bets, 0);

  it('knockout ud over ordinær tid: «30-30 · 35-34 e.f.» ved kampen og reglen én gang', () => {
    const { container } = render(
      <TipsHistorik history={hist([KO, KO2], { k1: { pick: '1', points: 0 }, k2: { pick: '1', points: 3 } })} total={3} game={HB} />,
    );
    expect(screen.getByTestId('slut-k1').textContent).toBe('30-30 · 35-34 e.f.');
    // Kampen afgjort i ordinær tid får ingen stillingslinje.
    expect(screen.queryByTestId('slut-k2')).toBeNull();
    expect(screen.getByTestId('ko-regel-14').textContent).toBe(REGEL);
    expect(container.querySelectorAll('.mytips__ko-regel')).toHaveLength(1);
  });

  it('en dag uden en kamp ud over ordinær tid: ingen regel', () => {
    render(<TipsHistorik history={hist([KO2], { k2: { pick: '1', points: 3 } })} total={3} game={HB} />);
    expect(screen.queryByTestId('ko-regel-14')).toBeNull();
    expect(screen.queryByText(/Knockout:/)).toBeNull();
  });

  it('et slut, der modsiger stillingen, vises ikke — kampen står som det, den er', () => {
    const forkert = { ...KO2, slut: { home: 27, away: 25, afgjort: 'forlaenget' } };
    const h = hist([forkert], { k2: { pick: '1', points: 3 } });
    expect(h.rounds[0].rows[0]).not.toHaveProperty('stilling');
    render(<TipsHistorik history={h} total={3} game={HB} />);
    expect(screen.queryByTestId('slut-k2')).toBeNull();
    expect(screen.queryByText(/e\.f\./)).toBeNull();
  });

  it('Superligaen: rækkerne får ikke én ny nøgle, og der står intet om knockout', () => {
    const sl = [{ id: 's1', round: 3, home: 'AGF', away: 'OB', kickoff: new Date('2026-09-01T18:00:00Z'), homeGoals: 1, awayGoals: 1, result: 'X', odds: { 1: 2, X: 3, 2: 3 } }];
    const h = hist(sl, { s1: { pick: 'X', points: 3 } });
    expect(Object.keys(h.rounds[0].rows[0])).not.toContain('stilling');
    const { container } = render(<TipsHistorik history={h} total={3} game={SL} />);
    expect(container.textContent).not.toMatch(/Knockout|e\.f\.|e\.str\.|60 min|90 min/);
  });
});

describe('Jer to imellem (Indbyrdes): stillingen ved den uenige kamp', () => {
  it('knockout ud over ordinær tid: begge stillinger — så X-ramt ikke ligner en fejl', async () => {
    render(<Indbyrdes game={{ ...HB, id: 'g1' }} rounds={[{ round: 14, matches: [KO] }]} minUid="mig" dueUid="dem" dueNavn="Morten" />);
    await userEvent.click(screen.getByRole('button', { name: /Jer to imellem/ }));
    expect(screen.getByTestId('h2h-slut-k1').textContent).toBe('30-30 · 35-34 e.f.');
  });

  it('uden slut: ingen stillingslinje', async () => {
    const uden = { ...KO, slut: undefined, homeGoals: 31, awayGoals: 30, result: '1' };
    render(<Indbyrdes game={{ id: 'g1' }} rounds={[{ round: 14, matches: [uden] }]} minUid="mig" dueUid="dem" dueNavn="Morten" />);
    await userEvent.click(screen.getByRole('button', { name: /Jer to imellem/ }));
    expect(screen.queryByTestId('h2h-slut-k1')).toBeNull();
  });
});

describe('Holdsiden: neutral bane, «Dag N» og V-U-T efter 60 min', () => {
  const HOLD = [
    { name: 'Danmark', short: 'DEN', color: '#c00', elo: 1700 },
    { name: 'Norge', short: 'NOR', color: '#00c', elo: 1650 },
  ];
  const vis = (game, matches, short) => render(
    <MemoryRouter><HoldSide game={{ ...game, teams: HOLD }} matches={matches} short={short} /></MemoryRouter>,
  );
  const kampListe = () => screen.getAllByTestId('holdside-kamp').map((e) => e.textContent);

  it('håndbold: intet «Hjemme og ude», intet H/U — V-U-T samlet og «Dag 14»', () => {
    const { container } = vis(HB, [KO], 'NOR');
    expect(screen.queryByRole('heading', { name: /Hjemme og ude/ })).toBeNull();
    expect(container.textContent).not.toMatch(/Hjemmebane:/);
    expect(screen.getByTestId('holdside-vut').textContent).toContain('1 kamp: 0-1-0');
    // Norge er udehold: egne mål først, begge stillinger vendt.
    expect(kampListe()[0]).toBe('Dag 14Danmark30-30 · 34-35 e.f.U');
    expect(kampListe()[0]).not.toMatch(/R14|^.*U.*H/);
  });

  it('knockout ud over ordinær tid: siden siger, at V-U-T tæller efter 60 min', () => {
    vis(HB, [KO], 'DEN');
    const note = screen.getByTestId('holdside-ordinaer').textContent;
    expect(note).toContain('tæller stillingen efter 60 min');
    expect(note).toContain('er uafgjort (X), også når holdet vandt i forlængelsen');
    expect(kampListe()[0]).toBe('Dag 14Norge30-30 · 35-34 e.f.U');
  });

  it('uden en kamp ud over ordinær tid: ingen note', () => {
    vis(HB, [{ ...KO, slut: undefined, homeGoals: 31, awayGoals: 30, result: '1' }], 'DEN');
    expect(screen.queryByTestId('holdside-ordinaer')).toBeNull();
  });

  it('Superligaen: «Hjemme og ude», H/U og «R14» som før — ingen V-U-T-linje og ingen note', () => {
    vis({ ...SL, teams: HOLD }, [{ ...KO, slut: undefined, homeGoals: 2, awayGoals: 1, result: '1' }], 'DEN');
    expect(screen.getByRole('heading', { name: /Hjemme og ude/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /⚽ Form og mål/ })).toBeInTheDocument();
    expect(kampListe()[0]).toBe('R14HNorge2-1V');
    expect(screen.queryByTestId('holdside-vut')).toBeNull();
    expect(screen.queryByTestId('holdside-ordinaer')).toBeNull();
  });

  describe('en model uden hjemmebanefordel (prøvesporten, HFA 0)', () => {
    medProeveSport();
    it('heller ingen «Hjemme og ude» — evnen kræver også modellen', () => {
      vis({ ...SL, sport: 'proeve', teams: HOLD }, [{ ...KO, slut: undefined, homeGoals: 2, awayGoals: 1, result: '1' }], 'DEN');
      expect(screen.queryByRole('heading', { name: /Hjemme og ude/ })).toBeNull();
      expect(kampListe()[0]).toBe('R14Norge2-1V');
    });
  });

  it('håndbold: sportens tegn i overskriften — ikke ⚽', () => {
    vis(HB, [KO], 'DEN');
    expect(screen.getByRole('heading', { name: /🤾 Form og mål/ })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /⚽/ })).toBeNull();
  });
});

describe('Elo-tabellen: kolonnen og ordene', () => {
  const HOLD = [{ name: 'Danmark', short: 'DEN', elo: 1700 }, { name: 'Norge', short: 'NOR', elo: 1650 }];
  const HIST = [{ round: 1, elo: { Danmark: 1710, Norge: 1640 } }];
  const vis = (game) => render(<MemoryRouter><EloTable game={{ ...game, teams: HOLD, eloHistory: HIST }} /></MemoryRouter>);
  const hoved = () => screen.getAllByRole('columnheader').map((e) => e.textContent);

  it('håndbold: «Dag 1» og «gennem turneringen» — aldrig «R1» eller «sæsonen»', () => {
    const { container } = vis(HB);
    expect(hoved()).toEqual(['Hold', 'Dag 1', 'Start']);
    expect(container.textContent).toContain('Elo-rating gennem turneringen');
    expect(container.textContent).toContain('Efter hver spillet dag kommer en ny kolonne');
    expect(container.textContent).toContain('kalibrerede startværdier');
    expect(container.textContent).not.toMatch(/sæson|runde|R1\b/);
  });

  it('Superligaen: som før', () => {
    const { container } = vis(SL);
    expect(hoved()).toEqual(['Hold', 'R1', 'Start']);
    expect(container.textContent).toContain('Elo-rating gennem sæsonen');
    expect(container.textContent).toContain('Efter hver spillet runde kommer en ny kolonne');
    expect(container.textContent).toContain('kalibrerede sæson-startværdier');
  });

  it('ingen kolonner endnu: «dage» i en turnering', () => {
    const { container } = render(<MemoryRouter><EloTable game={{ ...HB, teams: HOLD }} /></MemoryRouter>);
    expect(container.textContent).toContain('Endnu ingen færdigspillede dage');
  });
});

describe('Guiden for en turnering med knockout (håndbold-VM)', () => {
  const vis = (game) => {
    const { container } = render(
      <MemoryRouter initialEntries={['/spil/x?fane=hjaelp']}>
        <Routes><Route path="/spil/:gameId" element={<FootballHelp game={game} />} /></Routes>
      </MemoryRouter>,
    );
    return container.textContent;
  };

  it('knockout-reglen og begge forkortelser — forklaret', () => {
    const ko = screen.queryByTestId('hjaelp-knockout');
    expect(ko).toBeNull();
    vis(HB);
    const t = screen.getByTestId('hjaelp-knockout').textContent;
    expect(t).toContain(REGEL);
    expect(t).toContain('30-30 · 35-34 e.f. (e.f. = efter forlænget spilletid)');
    expect(t).toContain('28-28 · 33-31 e.str. (e.str. = efter straffekast)');
    expect(t).toContain('Den første stilling er den, der giver point.');
  });

  it('dagens ord og neutral bane — og INTET af ligaens', () => {
    const t = vis(HB);
    expect(t).toContain('fra dit daglige flow');
    expect(t).toContain('Sådan forløber en dag');
    expect(t).toContain('1 (det første hold på kampkortet vinder)');
    expect(screen.getByTestId('hjaelp-neutral-bane').textContent).toContain('der regnes ingen hjemmebanefordel');
    expect(screen.getByTestId('hjaelp-intet-loft')).toBeInTheDocument();
    expect(screen.getByTestId('hjaelp-uden-live')).toBeInTheDocument();
    expect(t).toContain('Combi-bonus pr. dag');
    expect(t).toContain('holdets resultater ved de seneste slutrunder');
    for (const forbudt of [
      'hjemmesejr', 'udesejr', 'hjemmebanefordel på', 'takket være hjemmebanen', 'hjemmebanen tæller',
      'Superligaen op til', 'Premier League helt op til', 'storklub', 'oprykker', 'sidste 3 års resultater',
      'midt i sæsonen', 'Når en kamp bliver udsat', 'DIREKTE', 'Slut · afventer facit', 'ugentlige',
      'hele sæsonen', 'alle seks', 'efterår', 'hjemme og ude', 'startrunde', 'runde for runde',
    ]) {
      expect(t, forbudt).not.toContain(forbudt);
    }
    // «runde» må kun stå i fasenavnene («Indledende runde», «Hovedrunde») og
    // i bottens navn (Runde-Botten er et navn, ikke et ord om spilledagen).
    expect(t.replace(/Indledende runde|Hovedrunde|Runde-Botten/g, '')).not.toMatch(/\brunde/i);
    expect(t).toContain('dér vises kun medalje, point og dagens tal');
    expect(t).not.toMatch(/omkring \d+ % til hvert|takket være/);
  });

  it('en kalender uden knockout-faser: ingen knockout-afsnit', () => {
    vis({ ...HB, faser: TEST_FASER.slice(0, 2) });
    expect(screen.queryByTestId('hjaelp-knockout')).toBeNull();
  });

  it('Superligaen: ingen knockout, ingen neutral bane — ligaens tekster', () => {
    const t = vis(SL);
    expect(screen.queryByTestId('hjaelp-knockout')).toBeNull();
    expect(screen.queryByTestId('hjaelp-neutral-bane')).toBeNull();
    expect(screen.queryByTestId('hjaelp-intet-loft')).toBeNull();
    expect(screen.queryByTestId('hjaelp-uden-live')).toBeNull();
    expect(t).toContain('1 (hjemmesejr)');
    expect(t).toContain('i Superligaen op til omkring 8');
    expect(t).toContain('Når en kamp bliver udsat');
    expect(t).toContain('Combi-runde-bonus');
    expect(t).not.toMatch(/Knockout|e\.f\.|60 min/);
  });
});

describe('Holdsiden og guiden kender evnen, ikke sporten', () => {
  // En tænkt fodbold-TURNERING (kalender, men fodbold: hjemmebane): dagens
  // ord, men hjemmebanen bliver stående — de to evner er uafhængige.
  it('kalender + hjemmebane: «dag», men stadig «Hjemme og ude» og «hjemmesejr»', () => {
    const fodboldVm = { ...HB, sport: undefined };
    const { container } = render(
      <MemoryRouter initialEntries={['/spil/x?fane=hjaelp']}>
        <Routes><Route path="/spil/:gameId" element={<FootballHelp game={fodboldVm} />} /></Routes>
      </MemoryRouter>,
    );
    expect(container.textContent).toContain('Sådan forløber en dag');
    expect(container.textContent).toContain('1 (hjemmesejr)');
    expect(within(container).getByTestId('hjaelp-knockout').textContent).toContain('efter 90 min');
  });
});
