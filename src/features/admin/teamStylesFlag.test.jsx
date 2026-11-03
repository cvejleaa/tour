// ---------------------------------------------------------------------------
// HOLD-FARVER I ET FLAG-SPIL (QC på flagplanen, fund 3).
//
// Admin-teksten forklarer, hvordan kampkortet vælger mellem hjemme-, ude- og
// 3. farve, og sender ejeren til trøjerne under Mit hold. I et spil med
// landeflag er begge dele falske: badgen er flaget, og trøjeoversigten er
// skjult. Og det er netop her, ejeren sidder og retter farverne — så teksten
// skal sige, hvad farverne FAKTISK gør dér (ring og tema). Samme evne som
// badgen (`harLandeflag`).
// ---------------------------------------------------------------------------
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { HAANDBOLD_VM2027_HOLD } from '../../data/haandboldVm2027Hold';

vi.mock('../../firebase', () => ({ db: {} }));
vi.mock('../../components/ClubBadge', () => ({ default: () => <span /> }));
vi.mock('firebase/firestore', () => ({
  doc: () => ({}),
  getDoc: () => Promise.resolve({ exists: () => true, data: () => ({ teamStyles: {} }) }),
}));
vi.mock('../games/gameActions', () => ({ setTeamStyles: vi.fn().mockResolvedValue({ ok: true }) }));

const mockSpil = { current: [] };
vi.mock('../games/useGames', () => ({ useGames: () => ({ games: mockSpil.current, loading: false }) }));

import TeamStylesTab from './TeamStylesTab';

const HB = { id: 'hvm2027', name: 'Håndbold-VM 2027', teams: HAANDBOLD_VM2027_HOLD.slice(0, 3) };
const SL = {
  id: 'sl', name: 'Superligaen',
  teams: [{ name: 'Brøndby IF', short: 'BIF', color: '#003DA5', awayColor: '#FFFFFF', thirdColor: '#FFD200' }],
};

const vis = async (spil) => {
  mockSpil.current = [spil];
  const r = render(<TeamStylesTab />);
  await waitFor(() => expect(screen.getByText(spil.name, { selector: 'strong' })).toBeInTheDocument());
  return r.container.textContent.replace(/\s+/g, ' ');
};

beforeEach(() => { mockSpil.current = []; });

describe('Hold-farver — teksten følger evnen', () => {
  it('flag-spil: siger, at farverne er ring og tema — ikke kampkortets trøjer', async () => {
    const t = await vis(HB);
    expect(screen.getByTestId('teamstyles-flag-tekst')).toBeInTheDocument();
    expect(t).toContain('viser landeflag i stedet for trøjer');
    expect(t).toContain('Hjemmefarven er ringen om spillernes avatar');
    // Det, der IKKE må stå: reglen om ude/3. farve og henvisningen til Mit hold.
    expect(t).not.toMatch(/udeholdet i udefarve/);
    expect(t).not.toMatch(/de to badges ligner/);
    expect(t).not.toMatch(/Mit hold/);
  });

  it('Superligaen: kampkortets regel står som før', async () => {
    const t = await vis(SL);
    expect(screen.queryByTestId('teamstyles-flag-tekst')).toBeNull();
    expect(t).toContain('I en kamp vises hjemmeholdet i hjemmefarve og udeholdet i udefarve');
    expect(t).not.toMatch(/landeflag/);
  });
});
