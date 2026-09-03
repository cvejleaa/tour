// Invariant 4b: AFLEDTE TAL ⇔ DOM'EN — «Næste kamp låser om» og dens "snart"-
// markering skal følge af de kort, der faktisk står på skærmen, uanset
// fixture og tidspunkt. Skrevet som en EGENSKAB over flere tidspunkter på det
// fælles scenarie (src/test/scenarie/superliga.js), ikke som én case:
//
//   (a) tælleren findes  ⇔  mindst ét kort har aktive 1X2-knapper
//   (b) tælleren lyser (--soon)  ⇔  det første aktive kort låser om under 2 t
//   (c) det første aktive kort er det med det tidligste kickoff blandt de aktive
//
// #213 var præcis et brud på (c): tælleren regnede på rundens egne kampe,
// mens den lånte stod øverst på skærmen og låste først. Ingen af de tre
// egenskaber kender fixturen — de læser kortene og regner selv.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { scenarie, NU } from '../../../test/scenarie/superliga.js';
import { AABEN_RUNDE } from '../../../../e2e/fixtures/konstanter.mjs';
import { toMillis } from './footballRounds';

vi.mock('../../../firebase', () => ({ db: {} }));
const mockBets = vi.fn(() => ({ betsByMatch: {}, loading: false }));
vi.mock('../useGameBets', () => ({ useGameBets: () => mockBets() }));
vi.mock('../useVisibleGameStandings', () => ({
  useVisibleGameStandings: () => ({ standings: [], leagues: [], leagueCount: 0, loading: false, error: null }),
}));
vi.mock('../betActions', () => ({ setBet: vi.fn().mockResolvedValue({ ok: true }), setChance: vi.fn().mockResolvedValue({ ok: true, indsats: 0, flyttetFra: [] }) }));
vi.mock('./LeagueBets', () => ({ default: () => <div data-testid="liga-tips" /> }));
vi.mock('../../../components/ClubBadge', () => ({ default: () => <span /> }));
vi.mock('../../../lib/share', () => ({ shareText: vi.fn().mockResolvedValue({ ok: true, mode: 'clipboard' }) }));

import FootballTip from './FootballTip';

const T = 60 * 60 * 1000;
/** Tidspunkter, der rammer hver gren: før den lånte låser, lige efter, før/efter den åbne, og når alt er spillet. */
const TIDSPUNKTER = [
  NU,
  new Date(NU.getTime() + 1 * T + 60_000),    // den lånte er lige låst → næste er den åbne (om ~2 d)
  new Date(NU.getTime() + 2 * 24 * T + 5 * T),  // den åbne låser om 1 t → snart
  new Date(NU.getTime() + 2 * 24 * T + 7 * T),  // alt låst
  new Date('2026-09-07T20:00:00Z'),
];

function kortPaaSkaermen(container, S) {
  return [...container.querySelectorAll('.match-card')].map((k) => {
    const m = S.kampe.find((x) => k.textContent.includes(x.home) && k.textContent.includes(x.away) && (k.textContent.includes(`Runde ${x.round}`) || x.round === AABEN_RUNDE));
    const knapper = [...k.querySelectorAll('button.pick')];
    return { kort: k, match: m, aktiv: knapper.length > 0 && knapper.every((b) => !b.disabled) };
  });
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => vi.useRealTimers());

describe('4b — tælleren følger af kortene, ikke af fixturen', () => {
  for (const nu of TIDSPUNKTER) {
    it(`holder kl. ${nu.toISOString()}`, () => {
      vi.setSystemTime(nu);
      const S = scenarie({ nu });
      mockBets.mockReturnValue({ betsByMatch: S.tips, loading: false });
      const { container } = render(
        <MemoryRouter initialEntries={[`/spil/e2e-liga?runde=${AABEN_RUNDE}`]}>
          <Routes><Route path="/spil/:gameId" element={<FootballTip game={S.spil} me={S.mig} matches={S.kampe} />} /></Routes>
        </MemoryRouter>,
      );
      const kort = kortPaaSkaermen(container, S);
      expect(kort.length).toBeGreaterThan(0);
      expect(kort.every((k) => k.match)).toBe(true);
      const aktive = kort.filter((k) => k.aktiv);
      const taeller = [...container.querySelectorAll('*')].find((el) => /^Næste kamp låser om/.test(el.textContent || '') && el.children.length === 0);
      // (a)
      expect(Boolean(taeller), 'tælleren findes ⇔ et kort er aktivt').toBe(aktive.length > 0);
      if (!aktive.length) return;
      // (c) det første aktive kort er det tidligste blandt de aktive
      const tidligst = Math.min(...aktive.map((k) => toMillis(k.match.kickoff)));
      expect(toMillis(aktive[0].match.kickoff)).toBe(tidligst);
      // (b)
      const snart = container.querySelector('.round-head__deadline--soon') != null;
      expect(snart, 'snart ⇔ under 2 t til det første aktive kort').toBe(tidligst - nu.getTime() < 2 * T);
      // Og hvert aktivt kort er ulåst efter sit kickoff — kortets knapper lyver ikke om tiden.
      for (const k of aktive) expect(toMillis(k.match.kickoff)).toBeGreaterThan(nu.getTime());
    });
  }
});
