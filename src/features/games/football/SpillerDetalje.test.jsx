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
    expect(screen.getByText('12,5')).toBeInTheDocument();
    expect(screen.getByText('60')).toBeInTheDocument(); // totalen fra serveren
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
});
