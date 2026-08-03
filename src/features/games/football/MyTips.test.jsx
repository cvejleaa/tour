// Tests for MyTips — især vejen videre, når man endnu ikke har tippet.
// Filen fandtes ikke før, så "Gå til Tip"-linket var helt udækket.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../../../firebase', () => ({ db: {} }));

const mockBets = vi.fn();
vi.mock('../useGameBets', () => ({ useGameBets: () => mockBets() }));

import MyTips from './MyTips';

const MATCHES = [
  {
    id: 'm1', round: 1, home: 'AGF', away: 'F.C. København',
    kickoff: new Date('2026-09-01T18:00:00Z'), odds: null, result: null,
  },
];

// En AFGJORT kamp. De tre tests nedenfor kan kun bevise noget med rækker på
// skærmen — med et tomt tip-sæt renderes den ikke-tomme visning aldrig, og så
// stod hele fladen udækket, mens filen så dækket ud.
const AFGJORT = [
  {
    id: 'm9', round: 1, home: 'Brøndby IF', away: 'AaB',
    kickoff: new Date('2026-08-01T17:00:00Z'), result: '1', odds: { 1: 2.5, X: 4, 2: 4 },
  },
];
const TIPPET = { m9: { pick: '1', points: 2.5, chanceStake: 0 } };

const setup = (props = {}) => render(
  <MemoryRouter initialEntries={['/spil/sl?fane=mine']}>
    <Routes>
      <Route
        path="/spil/:gameId"
        element={<MyTips game={{ id: 'sl', type: 'football' }} matches={MATCHES} {...props} />}
      />
    </Routes>
  </MemoryRouter>,
);

beforeEach(() => {
  vi.clearAllMocks();
  mockBets.mockReturnValue({ betsByMatch: {}, loading: false });
});

describe('MyTips', () => {
  it('siger til, når man ikke har tippet endnu', () => {
    setup();
    expect(screen.getByText(/ikke tippet endnu/i)).toBeInTheDocument();
  });

  // Tomme tilstande skal have en vej videre, ikke bare en anvisning.
  it('sender én uden tips videre til Tip-fanen', () => {
    setup();
    expect(screen.getByRole('link', { name: /Gå til Tip/ }))
      .toHaveAttribute('href', '/spil/sl');
  });

  it('viser en spinner, mens tippene hentes', () => {
    mockBets.mockReturnValue({ betsByMatch: {}, loading: true });
    setup();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  // Serverens tal og ikke fladens egne: stillingen viser præcis de samme, og
  // to veje til ét tal driver fra hinanden. Det var netop dét, der skete med
  // "point i alt", som blev regnet to steder og allerede var uenige.
  it('viser serverens opdeling og total, ikke sin egen udregning', () => {
    mockBets.mockReturnValue({ betsByMatch: TIPPET, loading: false });
    setup({
      matches: AFGJORT,
      me: { totalPoints: 60, opdeling: { p1x2: 31, chance: 12.5, combi: 9.5, pulje: 7 } },
    });
    expect(screen.getByText('60')).toBeInTheDocument();
    expect(screen.getByText('31')).toBeInTheDocument();
    expect(screen.getByText('+12,5')).toBeInTheDocument();
    // 2,5 er kampens egne point — historikkens sum må ikke stå som totalen.
    expect(screen.queryByText('2,5')).toBeNull();
  });

  // DEN OPRINDELIGE FEJL: puljebonussen stod på spilleren og manglede i Mine
  // tips, så fanen sagde et andet tal end stillingen for den samme person.
  // Kan kun ses, når serverens total mangler og historikkens tal træder til.
  it('lægger puljebonussen til, når serverens total mangler', () => {
    mockBets.mockReturnValue({ betsByMatch: TIPPET, loading: false });
    setup({ matches: AFGJORT, me: { bonusPoints: 25 } });
    expect(screen.getByText('27,5')).toBeInTheDocument();
    expect(screen.queryByText('2,5')).toBeNull();
  });

  // Kampe før spillets starttidspunkt hører ikke med — som på tip-fladen.
  it('skjuler kampe fra før spillet startede', () => {
    mockBets.mockReturnValue({ betsByMatch: TIPPET, loading: false });
    setup({
      matches: AFGJORT,
      game: { id: 'sl', type: 'football', startAt: new Date('2026-08-02T00:00:00Z') },
      me: { totalPoints: 60 },
    });
    expect(screen.queryByText(/Runde 1/)).toBeNull();
  });
});
