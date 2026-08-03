// ---------------------------------------------------------------------------
// "Mine tips" og spillerdetaljen SKAL være samme visning.
//
// Begge flader viser tips runde for runde med facit og point. Bygger de hver
// sin, har appen to sandheder om de samme data, og de driver fra hinanden ved
// næste ændring — præcis som de to formler for "point i alt" gjorde.
//
// Testen mocker TipsHistorik og efterprøver, at BEGGE flader render den. Uden
// den kunne MyTips skrive sin egen tabel igen, uden at én test faldt: hele
// begrundelsen for opsplitningen var uhåndhævet.
// ---------------------------------------------------------------------------
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../../../firebase', () => ({ db: {} }));
vi.mock('../useGameBets', () => ({ useGameBets: () => ({ betsByMatch: BETS, loading: false }) }));
vi.mock('./useSpillerOpdeling', () => ({
  useSpillerOpdeling: () => ({ kampe: BETS, loading: false, error: null }),
}));

// Fælles mock: registrerer de props, hver flade sender ind.
const kald = [];
vi.mock('./TipsHistorik', () => ({
  default: (props) => {
    kald.push(props);
    return <div data-testid="historik" />;
  },
}));

const BETS = { m1: { pick: '1', points: 2.5, chanceStake: 0 } };

import MyTips from './MyTips';
import SpillerDetalje from './SpillerDetalje';

const MATCHES = [{
  id: 'm1', round: 1, home: 'AGF', away: 'OB',
  kickoff: new Date('2026-08-01T17:00:00Z'), result: '1', odds: { 1: 2.5, X: 4, 2: 4 },
}];
const GAME = { id: 'sl', type: 'football' };
const OPDELING = { p1x2: 31, chance: 12.5, combi: 9.5, pulje: 7 };

beforeEach(() => { kald.length = 0; });

describe('Mine tips og spillerdetaljen', () => {
  it('bruger den SAMME visningskomponent', () => {
    render(
      <MemoryRouter initialEntries={['/spil/sl']}>
        <Routes>
          <Route
            path="/spil/:gameId"
            element={<MyTips game={GAME} matches={MATCHES} me={{ totalPoints: 60, opdeling: OPDELING }} />}
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('historik')).toBeInTheDocument();
    const fraMineTips = kald.length;

    render(
      <SpillerDetalje
        game={GAME}
        matches={MATCHES}
        spiller={{ uid: 'u1', name: 'Anne', totalPoints: 60, opdeling: OPDELING }}
      />,
    );
    expect(kald.length).toBeGreaterThan(fraMineTips);
  });

  // Samme input → samme historik. Er de to flader ikke enige om, hvilke runder
  // og rækker der findes, viser de to forskellige billeder af én spiller.
  it('fodrer den med den samme historik ved det samme input', () => {
    render(
      <MemoryRouter initialEntries={['/spil/sl']}>
        <Routes>
          <Route
            path="/spil/:gameId"
            element={<MyTips game={GAME} matches={MATCHES} me={{ totalPoints: 60, opdeling: OPDELING }} />}
          />
        </Routes>
      </MemoryRouter>,
    );
    render(
      <SpillerDetalje
        game={GAME}
        matches={MATCHES}
        spiller={{ uid: 'u1', name: 'Anne', totalPoints: 60, opdeling: OPDELING }}
      />,
    );

    const [mine, andens] = kald;
    expect(andens.history).toEqual(mine.history);
    expect(andens.opdeling).toEqual(mine.opdeling);
    expect(andens.total).toBe(mine.total);
  });
});
