// Tip-fladen på det FÆLLES Superliga-scenarie (src/test/scenarie/superliga.js).
// FootballTip.test.jsx bygger hver describe sin egen, pæne runde; her kører
// alt på ét rodet scenarie med låste OG ulåste kampe i samme runde, en lånt
// kamp der låser først, en afgjort runde med tips og en runde før startRound.
// Hver gate assertéres i BEGGE tilstande, og med det, der IKKE må stå.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { scenarie, NU } from '../../../test/scenarie/superliga.js';
import { AABEN_RUNDE, LAAST_RUNDE } from '../../../../e2e/fixtures/konstanter.mjs';

vi.mock('../../../firebase', () => ({ db: {} }));
const mockBets = vi.fn(() => ({ betsByMatch: {}, loading: false }));
vi.mock('../useGameBets', () => ({ useGameBets: () => mockBets() }));
const mockStandings = vi.fn(() => ({ standings: [], leagues: [], leagueCount: 0, loading: false, error: null }));
vi.mock('../useVisibleGameStandings', () => ({ useVisibleGameStandings: () => mockStandings() }));
vi.mock('../betActions', () => ({
  setBet: vi.fn().mockResolvedValue({ ok: true }),
  setChance: vi.fn().mockResolvedValue({ ok: true, indsats: 0, flyttetFra: [] }),
}));
vi.mock('./LeagueBets', () => ({ default: () => <div data-testid="liga-tips" /> }));
vi.mock('../../../components/ClubBadge', () => ({ default: () => <span /> }));
vi.mock('../../../lib/share', () => ({ shareText: vi.fn().mockResolvedValue({ ok: true, mode: 'clipboard' }) }));

import FootballTip from './FootballTip';

function opsaet(overrides = {}, url = `/spil/e2e-liga`) {
  const S = scenarie(overrides);
  mockBets.mockReturnValue({ betsByMatch: S.tips, loading: false });
  mockStandings.mockReturnValue({ standings: [], leagues: S.ligaer, leagueCount: S.ligaer.length, loading: false, error: null });
  vi.setSystemTime(S.nu);
  const r = render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/spil/:gameId" element={<FootballTip game={S.spil} me={S.mig} matches={S.kampe} />} />
      </Routes>
    </MemoryRouter>,
  );
  return { ...r, S };
}

beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(NU); });
afterEach(() => vi.useRealTimers());

describe('FootballTip på det fælles scenarie', () => {
  it('åbner på runde 20 — ikke på runde 19, selv om den lånte kamp er rundens tidligste ulåste', () => {
    opsaet();
    expect(screen.getByTestId('round-nav-count')).toHaveTextContent(`Runde ${AABEN_RUNDE} af`);
    expect(screen.getByTestId('round-nav-count')).not.toHaveTextContent(`Runde ${LAAST_RUNDE} af`);
  });

  it('viser tre kort i KICKOFF-rækkefølge: den igangværende, så den lånte (mærket med sin runde), så den åbne', () => {
    const { container, S } = opsaet();
    const kort = [...container.querySelectorAll('.match-card')];
    expect(kort).toHaveLength(3);
    const navne = kort.map((k) => k.textContent);
    expect(navne[0]).toContain(S.noegle.igang.home);
    expect(navne[1]).toContain(S.noegle.laant.home);
    expect(navne[2]).toContain(S.noegle.aaben.home);
    // Kun den lånte er mærket — og mærkaten siger, hvor pointene tæller.
    expect(kort[1].className).toContain('match-card--udenfor');
    expect(kort[0].className).not.toContain('match-card--udenfor');
    expect(kort[2].className).not.toContain('match-card--udenfor');
    expect(screen.getByTestId('fra-runde')).toHaveTextContent(`Runde ${LAAST_RUNDE}`);
    expect(screen.getByTestId('fra-runde')).toHaveTextContent('point tæller dér');
  });

  it('tælleren regner kun rundens egne: 1/2 tippet — ikke 2/3 med den lånte', () => {
    opsaet();
    expect(screen.getByText('1/2 tippet')).toBeInTheDocument();
    expect(screen.queryByText('2/3 tippet')).toBeNull();
    expect(screen.queryByText('1/3 tippet')).toBeNull();
  });

  it('"Næste kamp låser om 1 t" peger på den LÅNTE kamp og lyser — rundens egen åbne kamp er først om 2 dage', () => {
    const { container } = opsaet();
    expect(screen.getByText('Næste kamp låser om 1 t')).toBeInTheDocument();
    expect(screen.queryByText(/Næste kamp låser om 2 d/)).toBeNull();
    expect(container.querySelector('.round-head__deadline--soon')).not.toBeNull();
  });

  it('samme runde, to tilstande: den igangværende kamp har låste 1X2-knapper, den åbne har aktive', () => {
    const { container, S } = opsaet();
    const kort = [...container.querySelectorAll('.match-card')];
    const igang = kort.find((k) => k.textContent.includes(S.noegle.igang.home) && k.textContent.includes(S.noegle.igang.away));
    const aaben = kort.find((k) => k.textContent.includes(S.noegle.aaben.home) && k.textContent.includes(S.noegle.aaben.away));
    expect(igang).toBeTruthy();
    expect(aaben).toBeTruthy();
    const knapper = (k) => [...k.querySelectorAll('button.pick')];
    // Låst: 1X2-knapperne findes, men alle er deaktiverede.
    expect(knapper(igang)).toHaveLength(3);
    expect(knapper(igang).every((b) => b.disabled)).toBe(true);
    // Åben: alle tre er aktive.
    expect(knapper(aaben)).toHaveLength(3);
    expect(knapper(aaben).every((b) => !b.disabled)).toBe(true);
  });

  it('startRound skjuler runde 17 — uden startRound kan den åbnes', () => {
    const { unmount, S } = opsaet({}, `/spil/e2e-liga?runde=17`);
    // Med startRound 18 findes runde 17 ikke: ingen af dens kampe vises.
    expect(screen.queryByText(S.noegle.foerStart[0].home + ' – ' + S.noegle.foerStart[0].away)).toBeNull();
    expect(screen.getByTestId('round-nav-count')).not.toHaveTextContent('Runde 17 af');
    unmount();
    opsaet({ spil: { startRound: undefined } }, `/spil/e2e-liga?runde=17`);
    expect(screen.getByTestId('round-nav-count')).toHaveTextContent('Runde 17 af');
  });

  it('når alt på runde 20 (inkl. den lånte) er spillet, forsvinder tælleren — den siger ikke "om 0 t"', () => {
    // 7. sep. 20:00: den lånte og begge runde 20-kampe er låst. Runden vælges
    // eksplicit — den aktive ville ellers være runde 21, som har åbne kampe.
    opsaet({ nu: new Date('2026-09-07T20:00:00Z') }, `/spil/e2e-liga?runde=${AABEN_RUNDE}`);
    expect(screen.getByTestId('round-nav-count')).toHaveTextContent(`Runde ${AABEN_RUNDE} af`);
    expect(screen.queryByText(/Næste kamp låser/)).toBeNull();
  });
});
