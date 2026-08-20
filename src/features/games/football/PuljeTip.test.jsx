// Pulje-vælgeren skal vise SPILLETS hold.
//
// Den var det eneste sted i fodbold-fladen, der ikke allerede faldt tilbage på
// `game.teams` — den importerede den danske holdliste direkte. På et engelsk
// spil ville vælgeren derfor have vist tolv danske klubber, og et tip ville
// have været umuligt at afgive rigtigt.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../../firebase', () => ({ db: {} }));

// Firestore-lytteren: styrbar pr. test — mockBet.current er spillerens
// gemte pulje-tip (null = intet tip endnu).
const mockBet = { current: null };
vi.mock('firebase/firestore', () => ({
  doc: () => ({}),
  onSnapshot: (_ref, cb) => {
    cb({ exists: () => mockBet.current != null, data: () => mockBet.current });
    return () => {};
  },
}));

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'A' } }),
}));

const mockSetPuljeBet = vi.fn().mockResolvedValue({ ok: true });
vi.mock('../gameActions', () => ({ setPuljeBet: (...a) => mockSetPuljeBet(...a) }));

// Fixtures har game.pulje med: komponenten er konfigurations-gated (#8) og
// renderer intet uden pulje — fanen er alligevel data-gated på samme felt.
import PuljeTip from './PuljeTip';
import { PREMIER_LEAGUE_TEAMS_2026 } from '../../../data/premierLeagueTeams2026';
import { SUPERLIGA_TEAMS_2026 } from '../../../data/superligaTeams2026';

beforeEach(() => { vi.clearAllMocks(); mockBet.current = null; });

describe('PuljeTip — holdene kommer fra spillet', () => {
  it('viser de engelske hold på et Premier League-spil', () => {
    render(<PuljeTip game={{ id: 'pl', teams: PREMIER_LEAGUE_TEAMS_2026, pulje: { poolSize: 4, nedSize: 3, facitKilde: 'egneKampe', tabelDeling: false } }} matches={[]} />);
    // PL-konfigurationen har BÅDE top- og bund-sektion, så hvert hold står
    // i to grids — deraf getAllByText (2 = én pr. sektion).
    expect(screen.getAllByText('Arsenal')).toHaveLength(2);
    expect(screen.getAllByText('Manchester City')).toHaveLength(2);
    // …og ingen danske. Dét var fejlen.
    expect(screen.queryByText('Brøndby IF')).not.toBeInTheDocument();
    expect(screen.queryByText('F.C. København')).not.toBeInTheDocument();
  });

  it('viser de danske hold på Superligaen', () => {
    render(<PuljeTip game={{ id: 'sl', teams: SUPERLIGA_TEAMS_2026, pulje: { poolSize: 6 } }} matches={[]} />);
    expect(screen.getByText('Brøndby IF')).toBeInTheDocument();
    expect(screen.queryByText('Arsenal')).not.toBeInTheDocument();
  });

  // Fallbacken må ikke vinde over spillets egne hold — den er kun til et spil,
  // der endnu ikke er seedet.
  it('falder tilbage på Superligaen for et spil uden hold', () => {
    render(<PuljeTip game={{ id: 'nyt', pulje: { poolSize: 6 } }} matches={[]} />);
    expect(screen.getByText('Brøndby IF')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// #8: konfigurationsdrevet pulje — to sektioner, ærlig deadline-tekst, delt
// facit-kilde og "lige nu"-puls. Små egne hold, så tabellen er forudsigelig.
// ---------------------------------------------------------------------------
const HOLD8 = Array.from({ length: 8 }, (_, i) => ({ name: `H${i + 1}`, short: `H${i + 1}` }));
const PL_KONFIG = {
  poolSize: 4, nedSize: 3, perTeam: 4, perfectBonus: 10, facitKilde: 'egneKampe', tabelDeling: false,
  labels: { overskrift: '🎄 Juletabellen', top: 'top 4 juleaften', ned: 'nedrykningszonen', facit: 'stillingen, når alle 18 runder er spillet' },
};
// 4 spillede kampe → 8 hold i tabellen: H1,H3,H5,H7 vandt.
const SPILLEDE = [
  { home: 'H1', away: 'H2', homeGoals: 2, awayGoals: 0 },
  { home: 'H3', away: 'H4', homeGoals: 1, awayGoals: 0 },
  { home: 'H5', away: 'H6', homeGoals: 3, awayGoals: 1 },
  { home: 'H7', away: 'H8', homeGoals: 1, awayGoals: 0 },
];
const plGame = (over = {}) => ({
  id: 'pl', teams: HOLD8, pulje: PL_KONFIG, puljeLockAt: Date.now() + 86400000, ...over,
});

describe('PuljeTip — PL-formen (top + bund)', () => {
  it('UDEN deadline: ærlig "ikke åbnet"-tekst, ingen Gem-knap, knapper slået fra', () => {
    render(<PuljeTip game={plGame({ puljeLockAt: undefined })} matches={[]} />);
    // Den gamle tekst "🟢 Åbent — deadline fastsættes af admin" inviterede til
    // en gemme-knap, rules garanteret afviste (QC-fund). Assertér på begge.
    expect(screen.getByText(/Endnu ikke åbnet — arrangøren har ikke sat en deadline/)).toBeInTheDocument();
    expect(screen.queryByText(/Åbent/)).toBeNull();
    expect(screen.queryByText('Gem pulje-tip')).toBeNull();
    expect(screen.getAllByText('H1')[0].closest('button')).toBeDisabled();
  });

  it('to sektioner med hver sit antal — Gem er låst, til BEGGE er fulde, og gemmer samlet', async () => {
    render(<PuljeTip game={plGame()} matches={[]} />);
    expect(screen.getByText(/Toppen — vælg 4/)).toBeInTheDocument();
    expect(screen.getByText(/Bunden — vælg 3/)).toBeInTheDocument();
    // Overskriften og reglen kommer fra konfigurationen — ikke hårdkodet SL.
    expect(screen.getByText('🎄 Juletabellen')).toBeInTheDocument();
    expect(screen.queryByText(/mesterskabsspillet/)).toBeNull();

    const knap = () => screen.getByText('Gem pulje-tip').closest('button');
    // getAllByText(navn): [0] = top-griddet, [1] = bund-griddet.
    for (const navn of ['H1', 'H2', 'H3', 'H4']) fireEvent.click(screen.getAllByText(navn)[0]);
    expect(knap()).toBeDisabled(); // halvt svar må ikke kunne gemmes (QC-fund)
    expect(screen.getByText(/begge dele gemmes samlet/)).toBeInTheDocument();
    for (const navn of ['H6', 'H7', 'H8']) fireEvent.click(screen.getAllByText(navn)[1]);
    expect(knap()).not.toBeDisabled();
    fireEvent.click(knap());
    await waitFor(() => expect(mockSetPuljeBet).toHaveBeenCalled());
    const [uid, gameId, picks, opts] = mockSetPuljeBet.mock.calls[0];
    expect(uid).toBe('A');
    expect(gameId).toBe('pl');
    expect(picks).toEqual(['H1', 'H2', 'H3', 'H4']);
    expect(opts.relegation).toEqual(['H6', 'H7', 'H8']);
    expect(opts.konfig.poolSize).toBe(4);
  });

  it('et hold kan ikke vælges i BÅDE toppen og bunden (rules-spejl)', () => {
    render(<PuljeTip game={plGame()} matches={[]} />);
    fireEvent.click(screen.getAllByText('H1')[0]); // toppen
    fireEvent.click(screen.getAllByText('H1')[1]); // bunden — skal ignoreres
    expect(screen.getByText('1/4 valgt')).toBeInTheDocument();
    expect(screen.getByText('0/3 valgt')).toBeInTheDocument();
  });

  it('facit-kortet SPLITTER de to spørgsmål — bonus-summen har en forklaring', () => {
    mockBet.current = {
      championship: ['H1', 'H3', 'H5', 'H7'], relegation: ['H2', 'H4', 'H8'],
      correct: 2, points: 8, nedCorrect: 1, nedPoints: 4,
    };
    // Alle kampe spillet → egneKampe-facit findes (klienten regnede før med
    // en 12-holds-antagelse og viste ALDRIG kortet for PL — QC-fund).
    render(<PuljeTip game={plGame()} matches={SPILLEDE} />);
    expect(screen.getByText('Facit: top 4 juleaften')).toBeInTheDocument();
    expect(screen.getByText('Facit: nedrykningszonen')).toBeInTheDocument();
    expect(screen.getByText(/2\/4 rigtige/)).toBeInTheDocument();
    expect(screen.getByText(/1\/3 rigtige/)).toBeInTheDocument();
  });

  it('"lige nu"-linjen viser pulsen midt i sæsonen — og siger, at intet er afgjort', () => {
    mockBet.current = { championship: ['H1', 'H3', 'H5', 'H7'], relegation: ['H2', 'H4', 'H8'] };
    const medUspillet = [...SPILLEDE, { home: 'H1', away: 'H3', homeGoals: null, awayGoals: null }];
    render(<PuljeTip game={plGame()} matches={medUspillet} />);
    const linje = screen.getByTestId('pulje-ligenu');
    expect(linje.textContent).toContain('Lige nu');
    expect(linje.textContent).toContain('hvis tabellen sluttede i dag');
    expect(linje.textContent).toContain('Intet er afgjort endnu');
    // Vinderne af de 4 kampe er toppen lige nu → 4 af 4; bunden: 2 af 3.
    expect(linje.textContent).toContain('4 af 4');
  });

  it('SL-formen er uændret: ét grid, 6 valg, ingen bund-sektion', () => {
    render(<PuljeTip game={{ id: 'sl', teams: HOLD8, pulje: { poolSize: 6 }, puljeLockAt: Date.now() + 86400000 }} matches={[]} />);
    expect(screen.queryByText(/Bunden — vælg/)).toBeNull();
    expect(screen.getByText('0/6 valgt')).toBeInTheDocument();
    expect(screen.getByText(/mesterskabsspillet/)).toBeInTheDocument();
  });
});
