// HelpPage i PLATFORM-tilstand: "Spillene lige nu" skal AFLEDES af den levende
// games-collection — den hardkodede liste stod med Touren som "i gang" efter
// sin afslutning og uden PL. Counter-proofs binder afledningen: status kommer
// fra data (et afsluttet spil må ALDRIG stå "i gang"), skjulte spil annonceres
// ikke, halen lover kun det, spillet kan holde (Guide kun for medlemmer), og
// pulje-linjen afledes af spillets egne labels.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../firebase', () => ({ db: {} }));
vi.mock('../lib/platform', async (orig) => ({ ...(await orig()), PLATFORM_MODE: true }));

const mockUse = vi.fn();
// useGames mockes; splitGames er den ÆGTE (så afledningen testes, ikke en kopi).
vi.mock('../features/games/useGames', async (orig) => ({
  ...(await orig()),
  useGames: () => mockUse(),
}));

import HelpPage from './HelpPage';

const VM = {
  id: 'vm2026', name: 'VM 2026', emoji: '⚽', type: 'football',
  status: 'finished', joinable: false, externalUrl: 'https://vm.vejleaa.dk', order: 1,
};
const TOUR = {
  id: 'tour2026', name: 'Tour de France 2026', emoji: '🚴', type: 'cycling',
  status: 'finished', joinable: false, externalUrl: 'https://tour.vejleaa.dk', order: 2,
};
const SL = {
  id: 'superliga2627', name: 'Superligaen 2026/27', emoji: '⚽', type: 'football',
  status: 'open', joinable: true, order: 3,
  // SPEJLER DEN ÆGTE games.mjs-post: pulje UDEN labels. Ordene skal komme fra
  // puljeKonfigs defaults — et fixture med opfundne labels bekræftede sig selv
  // og skjulte, at en rå g.pulje.labels-læsning fjernede SL's pulje-linje
  // (QC-fund på 6341f42).
  pulje: { poolSize: 6 },
};
const PL = {
  id: 'pl2627-efteraar', name: 'Premier League 2026/27 — efterår', emoji: '⚽', type: 'football',
  status: 'open', joinable: true, order: 4,
  pulje: { poolSize: 4, nedSize: 3, labels: { top: 'top 4 juleaften', ned: 'nedrykningszonen juleaften' } },
};

function renderMed(games, myIds = [], loading = false) {
  mockUse.mockReturnValue({ games, myGameIds: new Set(myIds), loading });
  return render(<MemoryRouter><HelpPage /></MemoryRouter>);
}

describe('HelpPage (platform) — Spillene lige nu afledes af games-collectionen', () => {
  beforeEach(() => { mockUse.mockReset(); });

  it('status kommer fra DATA: afsluttede spil står "Afsluttet" — og "I gang" findes ikke, når intet spil er i gang', () => {
    renderMed([VM, TOUR, SL, PL], ['superliga2627']);
    // Begge afsluttede spil bærer det ærlige badge …
    expect(screen.getAllByText('Afsluttet').length).toBe(2);
    // … og løgnen fra den hardkodede liste kan ikke opstå: intet "i gang"
    // uden et live-spil i data. (Det var præcis Tour-fejlen.)
    expect(screen.queryByText(/i gang/i)).toBeNull();
    // De åbne spil viser deres data-status.
    expect(screen.getAllByText('Åben').length).toBe(2);
  });

  it('PL vises nu — med navn fra data og Deltag-opfordring til ikke-medlemmer', () => {
    renderMed([VM, TOUR, SL, PL], ['superliga2627']);
    expect(screen.getByText('Premier League 2026/27 — efterår')).toBeInTheDocument();
    // Halen lover kun det, spillet kan holde: medlem (SL) → Guide-fanen,
    // ikke-medlem (PL) → Deltag. Præcis én af hver.
    expect(screen.getAllByText(/Fuld guide inde i spillet/).length).toBe(1);
    expect(screen.getAllByText(/for at være med/).length).toBe(1);
  });

  it('et SKJULT spil annonceres aldrig (samme synlighed som 🎮 Spil)', () => {
    const skjult = { id: 'hemmelig', name: 'Hemmeligt spil', emoji: '🤫', status: 'open', joinable: false, order: 9 };
    renderMed([SL, skjult], []);
    expect(screen.queryByText('Hemmeligt spil')).toBeNull();
    expect(screen.getByText('Superligaen 2026/27')).toBeInTheDocument();
  });

  it('pulje-linjen går gennem puljeKonfig: PL får sine egne labels, SL får DEFAULT-ordene uden labels i posten', () => {
    renderMed([VM, TOUR, SL, PL], ['superliga2627']);
    // PL: egne labels fra data.
    expect(screen.getByText('top 4 juleaften')).toBeInTheDocument();
    expect(screen.getByText('nedrykningszonen juleaften')).toBeInTheDocument();
    // SL: posten har INGEN labels (som i games.mjs) — "mesterskabsspillet" kan
    // KUN komme fra puljeKonfigs defaults. En rå g.pulje.labels-læsning ville
    // fjerne hele SL's pulje-linje og gøre denne assertion rød.
    expect(screen.getByText('mesterskabsspillet')).toBeInTheDocument();
    // Kun spil MED pulje får linjen (SL + PL = 2); Tour/VM har ingen.
    expect(screen.getAllByText(/Dertil et pulje-tip/).length).toBe(2);
  });

  it('eksterne spil (VM + Tour) vises som link-ud med deres egen URL fra data', () => {
    renderMed([VM, TOUR, SL, PL], []);
    const links = screen.getAllByRole('link', { name: /åbn spillet/ });
    const hrefs = links.map((a) => a.getAttribute('href')).sort();
    expect(hrefs).toEqual(['https://tour.vejleaa.dk', 'https://vm.vejleaa.dk']);
  });

  it('et NYT ukendt spil mangler måske tekst, men lyver aldrig: navn + status + generisk hale', () => {
    const nyt = { id: 'x2027', name: 'X-ligaen 2027', emoji: '🏐', status: 'open', joinable: true, order: 5 };
    renderMed([nyt], []);
    expect(screen.getByText('X-ligaen 2027')).toBeInTheDocument();
    expect(screen.getByText('Åben')).toBeInTheDocument();
    expect(screen.getByText(/for at være med/)).toBeInTheDocument();
  });

  it('tom liste er en henvisning, ikke en tavs tom overskrift — og loading siger Henter', () => {
    const { unmount } = renderMed([], []);
    expect(screen.getByText(/Se alle spil under/)).toBeInTheDocument();
    unmount();
    renderMed([], [], true);
    expect(screen.getByText(/Henter spillene/)).toBeInTheDocument();
  });
});
