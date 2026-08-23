import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../../../firebase', () => ({ db: {} }));

const mockOpdeling = vi.fn();
vi.mock('./useSpillerOpdeling', () => ({
  useSpillerOpdeling: () => mockOpdeling(),
}));

import SpillerDetalje from './SpillerDetalje';

const KICKOFF = new Date('2026-08-01T17:00:00Z');
const MATCHES = [
  { id: 'm1', round: 1, home: 'AGF', away: 'OB', kickoff: KICKOFF, result: '1', odds: { 1: 2.5, X: 4, 2: 4 } },
  { id: 'm2', round: 1, home: 'Viborg FF', away: 'Silkeborg IF', kickoff: KICKOFF, result: 'X', odds: { 1: 3, X: 3.4, 2: 2.6 } },
];
const GAME = { id: 'sl', type: 'football' };
const SPILLER = {
  uid: 'u1',
  name: 'Anne',
  totalPoints: 60,
  opdeling: { p1x2: 31, chance: 12.5, combi: 9.5, pulje: 7 },
};

const setup = (props = {}) => render(
  <SpillerDetalje game={GAME} matches={MATCHES} spiller={SPILLER} {...props} />,
);

beforeEach(() => {
  vi.clearAllMocks();
  mockOpdeling.mockReturnValue({ kampe: {}, loading: false, error: null });
});

describe('SpillerDetalje', () => {
  it('viser spillerens navn', () => {
    setup();
    expect(screen.getByText('Anne')).toBeInTheDocument();
  });

  it('viser spillerens tips med facit og udbytte', () => {
    mockOpdeling.mockReturnValue({
      kampe: {
        m1: { pick: '1', points: 2.5, chanceStake: 0 },   // ramt
        m2: { pick: '1', points: 0, chanceStake: 0 },     // ikke ramt
      },
      loading: false,
      error: null,
    });
    setup();
    expect(screen.getByText(/Runde 1/)).toBeInTheDocument();
    expect(screen.getByText(/2 tippet · 1 ramt/)).toBeInTheDocument();
  });

  // Opdelingen er SERVERENS tal, ikke noget panelet regner. Samme komponent og
  // samme tal som i stillingen — det er hele løftet om "ens alle steder".
  it('viser serverens opdeling, ikke sin egen udregning', () => {
    setup();
    expect(screen.getByText('31')).toBeInTheDocument();
    expect(screen.getByText('+12,5')).toBeInTheDocument();
    expect(screen.getByText('60')).toBeInTheDocument(); // totalen fra serveren
  });

  // Kampe FØR spillets starttidspunkt hører ikke med — hverken her eller på
  // tip-fladen. Uden filteret ville en spiller, der kom med i runde 5, få
  // runde 1-4 tegnet ind som "ikke tippet".
  it('skjuler kampe fra før spillet startede', () => {
    mockOpdeling.mockReturnValue({
      kampe: { m1: { pick: '1', points: 2.5, chanceStake: 0 } }, loading: false, error: null,
    });
    setup({ game: { ...GAME, startAt: new Date('2026-08-02T00:00:00Z') } });
    expect(screen.queryByText(/Runde 1/)).toBeNull();
  });

  // Rækkerne her er KUN afgjorte-og-begyndte kampe. Stod der "tips afgivet",
  // ville ens egen detalje vise et lavere tal end Mine tips-fanen for den
  // samme person — under den samme mærkat.
  it('siger, at optællingen kun dækker afgjorte kampe', () => {
    mockOpdeling.mockReturnValue({
      kampe: { m1: { pick: '1', points: 2.5, chanceStake: 0 } }, loading: false, error: null,
    });
    setup();
    expect(screen.getByText('tips på afgjorte kampe')).toBeInTheDocument();
    expect(screen.queryByText('tips afgivet')).toBeNull();
  });

  // Puljebonussen står allerede i spillerens gemte total, så den må IKKE også
  // lægges til historikken. Det kan kun ses, når serverens total mangler og
  // historikkens tal træder til — ellers er fejlen skjult bag totalPoints.
  it('lægger ikke puljebonussen til historikkens egen total', () => {
    mockOpdeling.mockReturnValue({
      kampe: { m1: { pick: '1', points: 2.5, chanceStake: 0 } }, loading: false, error: null,
    });
    setup({ spiller: { uid: 'u1', name: 'Anne', bonusPoints: 25 } });
    expect(screen.getByText('2,5')).toBeInTheDocument();
    expect(screen.queryByText('27,5')).toBeNull();
  });

  // En afvist læsning er den forventede fejl: man deler ikke længere liga.
  // Vises der bare en tom liste, ligner det, at spilleren intet har tippet.
  it('siger hvad der skete, når læsningen blev afvist', () => {
    mockOpdeling.mockReturnValue({
      kampe: null, loading: false, error: 'Du deler ikke længere liga med denne spiller.',
    });
    setup();
    expect(screen.getByText(/deler ikke længere liga/)).toBeInTheDocument();
  });

  // En nytilmeldt spiller har intet dokument endnu. Det er en tom tilstand,
  // ikke en fejl — og ikke en tom kasse uden tekst.
  it('siger til, når spilleren ingen afgjorte kampe har', () => {
    setup();
    expect(screen.getByText(/Ingen afgjorte kampe endnu/)).toBeInTheDocument();
  });

  it('viser en spinner, mens der hentes', () => {
    mockOpdeling.mockReturnValue({ kampe: null, loading: true, error: null });
    setup();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  // KOMPLETHED: at komponenten findes beviser ikke, at panelet VISES. Her
  // spores knappen hele vejen ud i fladen for netop den tilstand, den gælder —
  // en anden spiller, set af en kendt bruger.
  it('viser det indbyrdes opgør, når en KENDT bruger ser en ANDEN spiller', async () => {
    setup({ minUid: 'en-anden-bruger' });
    expect(await screen.findByRole('button', { name: /Jer to imellem/ })).toBeInTheDocument();
  });

  it('viser det IKKE uden en kendt bruger, og ikke på ens eget navn', async () => {
    setup();
    expect(screen.queryByRole('button', { name: /Jer to imellem/ })).not.toBeInTheDocument();
    setup({ minUid: SPILLER.uid });
    expect(screen.queryByRole('button', { name: /Jer to imellem/ })).not.toBeInTheDocument();
  });
});
