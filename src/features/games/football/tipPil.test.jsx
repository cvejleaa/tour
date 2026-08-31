// Pilen på TIP-fanens facit-blok.
//
// Findes, fordi rettelsen af pilen i stillingen efterlod DENNE flade på den
// gamle vej: serverens previousRank er et øjebliksbillede, der kun skrives,
// når en rundes KUPON er afgjort, og kun én gang pr. runde. Efter rettelsen
// ville Stilling-fanen og Tip-fanen have vist FORSKELLIGE pile for samme
// runde — og delingsteksten ville sende den forkerte påstand videre til
// vennerne. Quality Controls blokerende fund.
//
// Den eksisterende FootballTip.test.jsx mocker stillingen som TOM, så
// facit-blokkens placeringslinje aldrig renderes dér. Derfor en egen fil med
// et felt, hvor serverens tal er bevidst forkert.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../../../firebase', () => ({ db: {} }));

const mockBets = vi.fn();
vi.mock('../useGameBets', () => ({ useGameBets: () => mockBets() }));
const mockStandings = vi.fn();
vi.mock('../useVisibleGameStandings', () => ({
  useVisibleGameStandings: () => mockStandings(),
}));
vi.mock('../betActions', () => ({
  setBet: vi.fn().mockResolvedValue({ ok: true }),
  setChance: vi.fn().mockResolvedValue({ ok: true, indsats: 0, flyttetFra: [] }),
}));
vi.mock('./LeagueBets', () => ({ default: () => <div /> }));
vi.mock('../../../components/ClubBadge', () => ({ default: () => <span /> }));
vi.mock('../../../lib/share', () => ({ shareText: vi.fn().mockResolvedValue({ ok: true }) }));

import FootballTip from './FootballTip';

const K = new Date('2026-08-01T18:00:00Z');
const MATCHES = [
  { id: 'm1', round: 1, home: 'AGF', away: 'F.C. København', kickoff: K, odds: null, result: '1' },
  { id: 'm2', round: 1, home: 'Brøndby IF', away: 'FC Midtjylland', kickoff: K, odds: null, result: 'X' },
];
const TEAMS = [
  { name: 'AGF', short: 'AGF', elo: 1500 },
  { name: 'F.C. København', short: 'FCK', elo: 1600 },
  { name: 'Brøndby IF', short: 'BIF', elo: 1560 },
  { name: 'FC Midtjylland', short: 'FCM', elo: 1450 },
];

/**
 * FELT A — ingen har flyttet sig i runden.
 * `previousRank` er sat som serveren HAVDE den (forældet), mens `perRound`
 * fortæller sandheden om runde 1.
 *
 * Før runde 1: Anne 50, Bo 40, Mig 30, Carl 20.
 * Efter:       Anne 60, Bo 48, Mig 39, Carl 21.  Samme orden.
 * Serverens previousRank påstår, at Mig var nr. 2 og altså er faldet.
 */
const UDEN_BEVAEGELSE = [
  { uid: 'a', name: 'Anne', totalPoints: 60, rank: 1, previousRank: 1, perRound: { 1: 10, 0: 50 }, bonusPoints: 0 },
  { uid: 'b', name: 'Bo', totalPoints: 48, rank: 2, previousRank: 3, perRound: { 1: 8, 0: 40 }, bonusPoints: 0 },
  { uid: 'me', name: 'Mig', totalPoints: 39, rank: 3, previousRank: 2, perRound: { 1: 9, 0: 30 }, bonusPoints: 0 },
  { uid: 'c', name: 'Carl', totalPoints: 21, rank: 4, previousRank: 4, perRound: { 1: 1, 0: 20 }, bonusPoints: 0 },
];

/**
 * FELT B — Bo overhaler MIG i netop runde 1.
 *
 * Før runde 1: Anne 50, Mig 45, Bo 40, Carl 20.
 * Efter:       Anne 60, Bo 52, Mig 47, Carl 21.
 * Mig går 2 → 3, Bo går 3 → 2. Her SKAL der være en pil.
 *
 * Fixturet findes, fordi et felt uden bevægelse ikke kan skelne en rigtig
 * runde fra en forkert: bruger koden en runde, der ikke findes, fjernes intet,
 * og "før" bliver lig "nu" — altså ingen pil, som også var det rigtige svar.
 * Mutationstestet: sætter man en anden runde ind, bliver DENNE rød.
 */
const MED_BEVAEGELSE = [
  { uid: 'a', name: 'Anne', totalPoints: 60, rank: 1, previousRank: 1, perRound: { 1: 10, 0: 50 }, bonusPoints: 0 },
  { uid: 'b', name: 'Bo', totalPoints: 52, rank: 2, previousRank: 2, perRound: { 1: 12, 0: 40 }, bonusPoints: 0 },
  { uid: 'me', name: 'Mig', totalPoints: 47, rank: 3, previousRank: 3, perRound: { 1: 2, 0: 45 }, bonusPoints: 0 },
  { uid: 'c', name: 'Carl', totalPoints: 21, rank: 4, previousRank: 4, perRound: { 1: 1, 0: 20 }, bonusPoints: 0 },
];

function vis(felt = UDEN_BEVAEGELSE, ligaer = []) {
  mockStandings.mockReturnValue({
    // `leagues` var før ALTID tom, mens `leagueCount` sagde 1 — en umulig
    // tilstand, og grunden til at facit-blokkens liga-skala aldrig blev kørt
    // af suiten. Quality Controls fund.
    standings: felt, leagues: ligaer, leagueCount: ligaer.length, loading: false, error: null,
  });
  mockBets.mockReturnValue({
    betsByMatch: { m1: { pick: '1', points: 5 }, m2: { pick: 'X', points: 4 } },
    loading: false,
  });
  return render(
    <MemoryRouter initialEntries={['/spil/sl?runde=1']}>
      <Routes>
        <Route
          path="/spil/:gameId"
          element={(
            <FootballTip
              game={{ id: 'sl', type: 'football', teams: TEAMS, eloHistory: [] }}
              me={{ uid: 'me', totalPoints: 39 }}
              matches={MATCHES}
            />
          )}
        />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-02T12:00:00Z'));
  mockStandings.mockReset();
  mockBets.mockReset();
});
afterEach(() => { vi.useRealTimers(); });

describe('facit-blokkens pil måler DEN VISTE RUNDE', () => {
  it('viser placeringen for runden', () => {
    vis();
    expect(screen.getByText(/Du er nr\./)).toBeInTheDocument();
  });

  it('ingen pil, når man ikke rykkede i runden — heller ikke serverens falske', () => {
    // Serverens previousRank siger 2 mod nu 3, altså ▼1. Regnet af runde 1's
    // egen vektor stod Mig nr. 3 både før og efter.
    const { container } = vis();
    const linje = container.querySelector('.facit__rank');
    expect(linje).not.toBeNull();
    expect(linje.textContent).not.toMatch(/[▲▼]/);
  });

  it('ingen påstand om at være overhalet, når ingen overhalede', () => {
    // Delingsteksten arver de samme lister, så en falsk pil ville også blive
    // sendt til vennerne som "⬇ Overhalet af …".
    vis();
    expect(screen.queryByText(/Overhalet af/)).toBeNull();
    expect(screen.queryByText(/Du overhalede/)).toBeNull();
  });

  it('viser pilen NED, når man FAKTISK blev overhalet i runden', () => {
    const { container } = vis(MED_BEVAEGELSE);
    expect(container.querySelector('.facit__rank').textContent).toMatch(/▼1/);
  });

  it('navngiver den, der overhalede — og kun ham', () => {
    vis(MED_BEVAEGELSE);
    expect(screen.getByText(/Overhalet af Bo/)).toBeInTheDocument();
    expect(screen.queryByText(/Du overhalede/)).toBeNull();
  });
});

describe('xG (målchancer) på kampkortet', () => {
  /** Samme opsætning, men med xG på den ene kamp. */
  function medXg(xh, xa) {
    mockStandings.mockReturnValue({
      standings: UDEN_BEVAEGELSE, leagues: [], leagueCount: 0, loading: false, error: null,
    });
    mockBets.mockReturnValue({ betsByMatch: { m1: { pick: '1', points: 5 } }, loading: false });
    const matches = [
      { ...MATCHES[0], xgHome: xh, xgAway: xa },
      MATCHES[1],
    ];
    return render(
      <MemoryRouter initialEntries={['/spil/sl?runde=1']}>
        <Routes>
          <Route
            path="/spil/:gameId"
            element={(
              <FootballTip
                game={{ id: 'sl', type: 'football', teams: TEAMS, eloHistory: [] }}
                me={{ uid: 'me', totalPoints: 39 }}
                matches={matches}
              />
            )}
          />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('viser begge holds målchancer med navn, så retningen er tydelig', () => {
    const { container } = medXg(1.8, 0.4);
    const linje = container.querySelector('.match-card__xg');
    expect(linje).not.toBeNull();
    expect(linje.textContent).toMatch(/xG \(målchancer\)/);
    expect(linje.textContent).toMatch(/1,8/);
    expect(linje.textContent).toMatch(/0,4/);
  });

  it('et ÆGTE 0 vises — det er ikke det samme som "ved ikke"', () => {
    const { container } = medXg(0, 2.1);
    expect(container.querySelector('.match-card__xg').textContent).toMatch(/0,0/);
  });

  it('null giver INGEN linje — aldrig "0,0" for et tal vi mangler', () => {
    // fmtDec gør Number(n) || 0, så uden vagten FØR formateringen ville en
    // manglende måling blive vist som 0,0 — præcis den løgn, planen forbød.
    const { container } = medXg(null, null);
    expect(container.querySelector('.match-card__xg')).toBeNull();
  });

  it('kun det ene tal er nok til at udelade linjen', () => {
    const { container } = medXg(1.2, null);
    expect(container.querySelector('.match-card__xg')).toBeNull();
  });

  it('INGEN linje på en kamp uden facit — xG hører til noget, der er sket', () => {
    // Vagten er `m.result && …`. Uden den ville en kamp med målchancer, men
    // uden resultat, vise tallet — fx hvis en admin fortryder et facit.
    mockStandings.mockReturnValue({
      standings: UDEN_BEVAEGELSE, leagues: [], leagueCount: 0, loading: false, error: null,
    });
    mockBets.mockReturnValue({ betsByMatch: {}, loading: false });
    const { container } = render(
      <MemoryRouter initialEntries={['/spil/sl?runde=1']}>
        <Routes>
          <Route
            path="/spil/:gameId"
            element={(
              <FootballTip
                game={{ id: 'sl', type: 'football', teams: TEAMS, eloHistory: [] }}
                me={{ uid: 'me', totalPoints: 39 }}
                matches={[{ ...MATCHES[0], result: null, xgHome: 1.8, xgAway: 0.4 }, MATCHES[1]]}
              />
            )}
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(container.querySelector('.match-card__xg')).toBeNull();
  });

  it('NaN giver INGEN linje — Number.isFinite er den vagt, der bærer', () => {
    // NaN ER typeof 'number', så typeof-halvdelen slipper den igennem, og
    // fmtDec gør Number(NaN) || 0 til "0,0". Testen dækker netop den halvdel
    // af vagten, som Test Manager kunne fjerne uden at noget blev rødt.
    const { container } = medXg(NaN, 0.4);
    expect(container.querySelector('.match-card__xg')).toBeNull();
  });

  it('Infinity giver heller INGEN linje', () => {
    const { container } = medXg(Infinity, 0.4);
    expect(container.querySelector('.match-card__xg')).toBeNull();
  });

  it('linjen står UDEN FOR badge-rækken, som ikke kan ombryde', () => {
    // Meta-rækken er inline-flex uden wrap; et fjerde element dér klipper
    // venue-teksten i stedet for at ombryde. Quality Controls fund.
    const { container } = medXg(1.8, 0.4);
    const linje = container.querySelector('.match-card__xg');
    expect(linje.closest('.match-card__meta')).toBeNull();
  });

  it('ingen dom om kampen — de forbudte ord står ingen steder', () => {
    medXg(0.2, 3.4); // resultatet 1-0 mod chancerne 0,2-3,4
    const tekst = document.body.textContent.toLowerCase();
    for (const ord of ['fortjent', 'burde have vundet', 'heldig', 'uheldig', 'tyveri', 'snydt']) {
      expect(tekst, `"${ord}" står på kampkortet`).not.toContain(ord);
    }
  });
});


// ---------------------------------------------------------------------------
// FACIT-BLOKKEN PÅ LIGAENS SKALA.
//
// Quality Controls blokerende fund på koden: hver eneste test mockede
// `leagues: []`, så `enesteLiga` var null i dem alle, og hele den nye gren —
// den der giver facit-blokken ligaens startrunde — blev aldrig kørt. Grøn
// suite, urørt kode. Samme form som wiring-hullet i hold-listen.
//
// Blokkens tal FORLADER APPEN via delingsteksten, så en forkert skala her er
// dyrere end de fleste.
// ---------------------------------------------------------------------------
describe('facit-blokken følger ligaens startrunde', () => {
  // Anne fører spillet stort på runde 0, men ligaen tæller først fra runde 1.
  // På ligaens skala: Bo 12, Mig 2, Anne 10, Carl 1 → Bo fører, jeg er nr. 3.
  const LIGA1 = [{ id: 'l1', name: 'Familien', memberUids: ['a', 'b', 'me', 'c'], startRound: 1 }];

  it('regner rang og total af ligaens runder, ikke spillets', () => {
    vis(MED_BEVAEGELSE, LIGA1);
    // Spillets tal for mig er 47. Ligaens er 2. Står der 47, er skalaen
    // spillets — præcis fejlen.
    expect(screen.getByText(/· 2 point/)).toBeInTheDocument();
    expect(screen.queryByText(/· 47 point/)).toBeNull();
  });

  it('bruger spillets skala, når man er i FLERE ligaer', () => {
    // Med to ligaer findes der ingen ét-svar-skala, og blokken falder tilbage
    // til spillets tal. Uden denne kunne gaten hardkodes til altid at bruge
    // den første liga.
    vis(MED_BEVAEGELSE, [...LIGA1, { id: 'l2', name: 'Kontoret', memberUids: ['a', 'me'] }]);
    expect(screen.getByText(/· 47 point/)).toBeInTheDocument();
  });

  it('udelader en spiller uden brugbar vektor af "af N" og pilene', () => {
    // Test Managers fund: `rangerbare`-filteret kunne fjernes helt med grøn
    // suite. Carl har 21 point ifølge serveren, men en vektor der kun kender
    // runde 1 — han kan ikke rangeres, og han må ikke tælle med i feltet.
    const medHalv = MED_BEVAEGELSE.map((r) => (r.uid === 'c'
      ? { ...r, perRound: { 1: 1 } } : r));
    vis(medHalv, LIGA1);
    // Tre rangerbare tilbage, ikke fire. Teksten er brudt af et <strong>,
    // så den læses af elementet frem for med en tekst-matcher.
    const rang = document.querySelector('.facit__rank').textContent;
    expect(rang).toMatch(/af 3/);
    expect(rang).not.toMatch(/af 4/);
  });

  it('lader blokken være, når ligaen ikke lister mig', () => {
    // Samme defensive vagt som i GameStandings: en liga, jeg ikke står i,
    // må ikke afgøre min skala. Uden vagten ville `ligaRanking` filtrere mig
    // væk, og blokken ville forsvinde i stedet for at vise spillets tal.
    vis(MED_BEVAEGELSE, [{ id: 'l9', name: 'Uden mig', memberUids: ['a', 'b'], startRound: 1 }]);
    expect(screen.getByText(/· 47 point/)).toBeInTheDocument();
  });
});
