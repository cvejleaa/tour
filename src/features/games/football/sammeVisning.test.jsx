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

import { shortOf } from './teamInfo';
import MyTips from './MyTips';
import SpillerDetalje from './SpillerDetalje';

const MATCHES = [{
  id: 'm1', round: 1, home: 'AGF', away: 'OB',
  kickoff: new Date('2026-08-01T17:00:00Z'), result: '1', odds: { 1: 2.5, X: 4, 2: 4 },
}];
// SPILLET SKAL HAVE SIN EGEN HOLDLISTE, og `short` skal være FORSKELLIG fra
// `name`. Uden det faldt `teamsOf()` tilbage på Superliga-listen begge steder,
// og assertionen kunne ikke skelne spillets liste fra en tom — `teams={[]}`
// overlevede med hele suiten grøn på BEGGE flader.
const GAME = {
  id: 'sl',
  type: 'football',
  teams: [
    { name: 'AGF', short: 'ÅGF', elo: 1578 },
    { name: 'OB', short: 'ODE', elo: 1486 },
  ],
};
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

  // TEAMS SKAL MED BEGGE STEDER. Spillerdetaljen sendte den ikke, og så faldt
  // kortkoden tilbage på det fulde navn — panelet viste altså fulde navne på en
  // telefon, hvor "Mine tips" viste kortkoder. Forskellen kom af en glemt prop,
  // ikke af en beslutning, og den er præcis den drift, filen her findes for.
  it('sender holdlisten med fra BEGGE flader', () => {
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
    expect(kald.length).toBeGreaterThanOrEqual(2);
    // IKKE `Array.isArray`. Den består for en tom liste, for en hårdkodet
    // Superliga-liste og for to flader, der sender hver sin — altså for netop
    // de fejl, filen findes for at fange. Assertér på spillets EGNE koder:
    // 'ÅGF' findes kun i GAME.teams.
    for (const props of kald) {
      expect(shortOf(props.teams, 'AGF'), 'holdlisten er ikke spillets').toBe('ÅGF');
    }
    // Og at de to flader er ENIGE — ikke bare hver for sig gyldige.
    expect(kald[0].teams).toEqual(kald[kald.length - 1].teams);
  });
});
