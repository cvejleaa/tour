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

function vis(felt = UDEN_BEVAEGELSE) {
  mockStandings.mockReturnValue({
    standings: felt, leagues: [], leagueCount: 1, loading: false, error: null,
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
