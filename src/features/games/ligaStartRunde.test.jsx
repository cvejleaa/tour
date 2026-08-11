// ---------------------------------------------------------------------------
// EN LIGA, DER STARTER VED RUNDE N — når den ud på skærmen?
//
// `ligaPoint.test.js` beviser, at summen er rigtig. Den beviser INTET om, at
// stillingen bruger den: `ligaRanking` kunne fjernes fra GameStandings og
// GameLeagues med alle kernetests grønne, og hver liga ville vise spillets
// totaler igen — tavst. Den her fil er listen over fladerne.
// ---------------------------------------------------------------------------
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ligaRanking } from './gameStandings';
import { ligaPoint, harRundeVektor } from '../../lib/ligaPoint';

// Runde-vektorer, som serveren ville skrive dem. Anna vandt runde 1 stort;
// Bo har været bedst siden runde 2. Ligaens startrunde afgør, hvem der fører.
const RÆKKER = [
  { uid: 'A', name: 'Anna', totalPoints: 30, rank: 1, previousRank: 1, perRound: { 1: 20, 2: 5, 3: 5 }, bonusPoints: 0 },
  { uid: 'B', name: 'Bo', totalPoints: 24, rank: 2, previousRank: 2, perRound: { 1: 2, 2: 11, 3: 11 }, bonusPoints: 0 },
  { uid: 'C', name: 'Carla', totalPoints: 10, rank: 3, previousRank: 3, perRound: { 1: 4, 2: 3, 3: 3 }, bonusPoints: 0 },
];

describe('ligaRanking', () => {
  it('uden startrunde: spillets tal, uændret', () => {
    const ud = ligaRanking(RÆKKER, { memberUids: ['A', 'B'] }, ligaPoint, harRundeVektor);
    expect(ud.map((r) => [r.uid, r.totalPoints])).toEqual([['A', 30], ['B', 24]]);
  });

  // BÆRENDE: ordenen VENDER. Med spillets totaler fører Anna; tæller ligaen
  // først fra runde 2, fører Bo. En liga, der bare filtrerede, ville vise
  // Anna øverst — og så var hele opgaven en attrap.
  it('med startrunde: totalerne regnes forfra, og ordenen kan vende', () => {
    const ud = ligaRanking(RÆKKER, { memberUids: ['A', 'B', 'C'], startRound: 2 }, ligaPoint, harRundeVektor);
    expect(ud.map((r) => [r.uid, r.totalPoints, r.rank])).toEqual([
      ['B', 22, 1], ['A', 10, 2], ['C', 6, 3],
    ]);
  });

  // TO-SKALA-FEJLEN. Serverens previousRank er spillets skala (Anna nr. 1).
  // Brugtes den mod ligaens nye orden, fik Bo en evig grøn pil for at "overhale"
  // en Anna, han aldrig lå bag i ligaen. Pilene regnes derfor af samme vektor:
  // stillingen uden den seneste runde.
  it('pilene sammenligner ligaens egen skala, ikke spillets', () => {
    const ud = ligaRanking(RÆKKER, { memberUids: ['A', 'B', 'C'], startRound: 2 }, ligaPoint, harRundeVektor);
    // Før runde 3 (ligaens seneste): B=11, A=5, C=3 → samme orden som nu.
    // Ingen har flyttet sig, så previousRank == rank for alle — ingen pile.
    for (const r of ud) expect(r.previousRank).toBe(r.rank);
  });

  it('en spiller uden runde-vektor vises som "ikke klar", ikke som nul', () => {
    const raekker = [...RÆKKER, { uid: 'D', name: 'Dan', totalPoints: 50, rank: 1, perRound: null, bonusPoints: 0 }];
    const ud = ligaRanking(raekker, { memberUids: ['A', 'D'], startRound: 2 }, ligaPoint, harRundeVektor);
    const dan = ud.find((r) => r.uid === 'D');
    expect(dan.klar).toBe(false);
    expect(dan.rank).toBeNull();
  });

  it('puljen følger sin regel gennem hele kæden', () => {
    const medPulje = RÆKKER.map((r) => ({ ...r, bonusPoints: 34 }));
    const fra3 = ligaRanking(medPulje, { memberUids: ['A'], startRound: 3 }, ligaPoint, harRundeVektor);
    const fra4 = ligaRanking(medPulje, { memberUids: ['A'], startRound: 4 }, ligaPoint, harRundeVektor);
    expect(fra3[0].totalPoints).toBe(5 + 34); // runde 3 + pulje (grænsen er 3)
    expect(fra4[0].totalPoints).toBe(0);      // intet tilbage, pulje udeladt
  });
});

// ---------------------------------------------------------------------------
// STILLINGS-FANEN: vælger man en liga med startrunde, skal DENS tal stå der.
// ---------------------------------------------------------------------------
const mockStandings = vi.fn();
vi.mock('./useVisibleGameStandings', () => ({
  useVisibleGameStandings: () => mockStandings(),
}));
vi.mock('../../firebase', () => ({ db: {} }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { uid: 'A' } }) }));
vi.mock('./useGamePlayerUids', () => ({ useGamePlayerUids: () => ({ uids: [], loading: false }) }));
vi.mock('./football/useSpillerOpdeling', () => ({ useSpillerOpdeling: () => ({ opdeling: null, loading: false }) }));

const { default: GameStandings } = await import('./GameStandings');
const { MemoryRouter } = await import('react-router-dom');

describe('stillings-fanen med en liga-startrunde', () => {
  beforeEach(() => {
    cleanup();
    mockStandings.mockReturnValue({
      standings: RÆKKER,
      leagues: [
        { id: 'fam', name: 'Familien', memberUids: ['A', 'B', 'C'] },
        { id: 'kon', name: 'Kontoret', memberUids: ['A', 'B', 'C'], startRound: 2 },
      ],
      leagueCount: 2,
      loading: false,
      error: null,
    });
  });

  // Tre spillere ender ALLE på podiet — der er ingen tabelrækker at spørge
  // om. Podie-pladserne bærer navn og pointtal, så der måles på dem.
  const vaelg = (navn) => {
    const { container } = render(
      <MemoryRouter>
        <GameStandings gameId="sl" game={{ id: 'sl', type: 'football' }} />
      </MemoryRouter>,
    );
    fireEvent.change(screen.getByLabelText(/vis/i), { target: { value: navn } });
    return container;
  };

  const plads = (container, navn) => [...container.querySelectorAll('.podium__spot')]
    .map((e) => e.textContent)
    .find((t) => t.includes(navn));

  it('viser ligaens EGNE totaler, når ligaen har en startrunde', async () => {
    const container = vaelg('kon');
    // Bo fører med 22 — ikke Anna med 30. Stod spillets tal her, var
    // beregningen koblet fra fanen.
    await waitFor(() => {
      expect(plads(container, 'Bo')).toContain('22');
      expect(plads(container, 'Anna')).toContain('10');
      expect(plads(container, 'Anna')).not.toContain('30');
      // …og rækkefølgen er ligaens: Bo står som nummer 1.
      expect(plads(container, 'Bo')).toContain('🥇');
    });
  });

  it('viser spillets tal for en liga UDEN startrunde', async () => {
    const container = vaelg('fam');
    await waitFor(() => {
      expect(plads(container, 'Anna')).toContain('30');
      expect(plads(container, 'Anna')).toContain('🥇');
    });
  });
});

// ---------------------------------------------------------------------------
// LIGA-KORTET: ejeren sætter runden HER — trin 0b: dér hvor en ligaejer leder,
// ved siden af Omdøb/Slet. Og valgets konsekvens skal stå VED valget.
// ---------------------------------------------------------------------------
const mockSetStartRound = vi.fn();
vi.mock('./gameLeagueActions', async (orig) => ({
  // Alt andet ægte (konstanter m.m.) — kun skrivningerne mockes.
  ...(await orig()),
  createLeague: vi.fn(),
  joinLeagueByCode: vi.fn(),
  leaveLeague: vi.fn(),
  renameLeague: vi.fn(),
  deleteLeague: vi.fn(),
  setLeagueStartRound: (...a) => mockSetStartRound(...a),
}));
// Foranderlig, så badge-testene kan prøve BEGGE sider af puljegrænsen.
let mockLigaer = [];
vi.mock('./useGameLeagues', () => ({
  useGameLeagues: () => ({ leagues: mockLigaer, loading: false, error: null }),
}));
vi.mock('./useGameStandings', () => ({ useGameStandings: () => ({ standings: RÆKKER }) }));
vi.mock('./useLeagueMessages', () => ({ useLeagueMessages: () => ({ messages: [], loading: false, error: null }) }));
vi.mock('./useLeagueQuestions', () => ({ useLeagueQuestions: () => ({ questions: [], answersByQid: {} }) }));

const { default: GameLeagues } = await import('./GameLeagues');

describe('liga-kortet', () => {
  beforeEach(() => {
    cleanup();
    mockSetStartRound.mockResolvedValue({ ok: true });
    mockLigaer = [{ id: 'kon', name: 'Kontoret', code: 'KODE12', ownerUid: 'A', memberUids: ['A', 'B'], startRound: 20 }];
  });

  const tegn = () => render(
    <MemoryRouter initialEntries={['/spil/sl/ligaer?liga=kon']}>
      <GameLeagues gameId="sl" game={{ id: 'sl', type: 'football' }} />
    </MemoryRouter>,
  );

  it('viser startrunden på kortet — og at puljen ikke tæller', () => {
    tegn();
    const badge = screen.getByTestId('liga-startrunde');
    expect(badge.textContent).toContain('Tæller fra runde 20');
    // Startrunde 20 > grænsen på 3: puljereglen skal stå på kortet, ikke
    // opdages i stillingen ved sæsonslut.
    expect(badge.textContent).toContain('puljen tæller ikke');
  });

  // DEN ANDEN SIDE AF GRÆNSEN. Uden denne test kunne "· puljen tæller ikke"
  // vises UBETINGET med grøn suite — og en liga fra runde 2, hvis stilling
  // faktisk tæller puljen med, ville have en badge, der modsagde dens egne tal.
  it('nævner IKKE puljen for en liga inden for grænsen', () => {
    mockLigaer = [{ id: 'kon', name: 'Kontoret', code: 'KODE12', ownerUid: 'A', memberUids: ['A', 'B'], startRound: 2 }];
    tegn();
    const badge = screen.getByTestId('liga-startrunde');
    expect(badge.textContent).toContain('Tæller fra runde 2');
    expect(badge.textContent).not.toContain('puljen tæller ikke');
  });

  it('ejeren kan sætte runden, og den gemmes som TAL', async () => {
    tegn();
    fireEvent.click(screen.getByRole('button', { name: /Startrunde/ }));
    const felt = screen.getByLabelText(/Ligaen tæller fra runde/);
    fireEvent.change(felt, { target: { value: '21' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Gem' })[0]);
    await waitFor(() => expect(mockSetStartRound).toHaveBeenCalled());
    const arg = mockSetStartRound.mock.calls[0][0];
    expect(arg).toMatchObject({ gameId: 'sl', leagueId: 'kon', startRound: 21 });
    expect(typeof arg.startRound).toBe('number');
  });

  it('forklarer konsekvensen VED valget', () => {
    tegn();
    fireEvent.click(screen.getByRole('button', { name: /Startrunde/ }));
    const t = document.body.textContent.replace(/\s+/g, ' ');
    expect(t).toContain('Runder før den valgte tæller ikke i ligaens stilling');
    expect(t).toContain('tæller puljebonussen ikke med');
  });

  // LIGA-TABELLEN INDE PÅ KORTET skal også bruge ligaens tal — den har sin
  // egen vej gennem leagueRankingWithQuestions, og den kunne før kun spillets.
  it('liga-tabellen viser ligaens totaler, ikke spillets', () => {
    const { container } = tegn();
    const tekst = container.textContent;
    // Med startrunde 20 og vektorer, der kun har runde 1-3, har alle 0 point.
    // Spillets totaler (30/24) må IKKE stå i tabellen.
    expect(tekst).not.toContain('30');
    expect(tekst).not.toContain('24');
  });
});
