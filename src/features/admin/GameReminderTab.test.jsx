// Tests for GameReminderTab — Tip-status-sektionen (opgave #37).
//
// Kortet står lige over 'Send påmindelser nu' og må ALDRIG kunne læses som
// knappens løfte: knappens eget tal og dets forklaring ("næste døgn") skal
// stå der ordret. Og grænsen skal stå i teksten: OM der er tippet, aldrig hvad.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../firebase', () => ({ db: {}, functions: {} }));

const mockTipStatus = vi.fn();
vi.mock('./adminActions', () => ({
  callSendGameTipRemindersNow: vi.fn(),
  callSendGameTestReminderToMe: vi.fn(),
  callGamePuljeStatus: vi.fn(),
  callGameTipStatus: (...a) => mockTipStatus(...a),
}));

// Kampene hentes one-shot med getDocs — mockes med to runder, hvor runde 4 er
// den aktive (runde 3 er spillet).
const NU = Date.now();
const H = 3600 * 1000;
const mockGetDocs = vi.fn();
vi.mock('firebase/firestore', () => ({
  collection: (...a) => ({ __col: a.slice(1) }),
  getDocs: (...a) => mockGetDocs(...a),
}));

vi.mock('../games/useGames', () => ({
  useGames: () => ({
    games: [{ id: 'sl', name: 'Superligaen', type: 'football', status: 'open' }],
    myGameIds: [], loading: false,
  }),
}));

import GameReminderTab from './GameReminderTab';

const kampDocs = [
  { id: 'r3-a', round: 3, home: 'OB', away: 'AGF', kickoff: new Date(NU - 100 * H), result: '1' },
  { id: 'r4-a', round: 4, home: 'FCK', away: 'BIF', kickoff: new Date(NU + 3 * H) },
  { id: 'r4-b', round: 4, home: 'VFF', away: 'FCM', kickoff: new Date(NU + 30 * H) },
].map((d) => ({ id: d.id, data: () => d }));

beforeEach(() => {
  vi.clearAllMocks();
  mockGetDocs.mockResolvedValue({ docs: kampDocs });
  mockTipStatus.mockResolvedValue({
    ok: true,
    data: {
      gameNavn: 'Superligaen',
      runde: 4,
      kampeIRunden: 2,
      rammesAfKnappenNu: 1,
      spillere: [
        {
          uid: 'c',
          navn: 'Carla',
          tippet: 0,
          ialt: 2,
          kanRykkes: true,
          manglende: [
            { id: 'r4-a', kamp: 'FCK – BIF', kickoff: NU + 3 * H, naaedeDetIkke: false, haster: true },
            { id: 'r4-b', kamp: 'VFF – FCM', kickoff: NU + 30 * H, naaedeDetIkke: false, haster: false },
          ],
        },
        { uid: 'a', navn: 'Anna', tippet: 2, ialt: 2, kanRykkes: true, manglende: [] },
      ],
    },
  });
});

describe('GameReminderTab — Hvem mangler at tippe?', () => {
  it('henter kampe én gang, kalder callablen med den AKTIVE runde og viser dækningen', async () => {
    render(<GameReminderTab />);
    // Intet hentes ved mount (QC-krav: fanen rummer også Send-knapperne).
    expect(mockGetDocs).not.toHaveBeenCalled();
    expect(mockTipStatus).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('tipstatus-tjek'));
    await waitFor(() => expect(mockTipStatus).toHaveBeenCalled());
    expect(mockGetDocs).toHaveBeenCalledTimes(1);
    // Runde 4 er den aktive (runde 3 er afgjort) — samme valg som Tip-fanen.
    expect(mockTipStatus).toHaveBeenCalledWith('sl', 4);

    await screen.findByTestId('tipstatus-resultat');
    expect(screen.getByText('Carla')).toBeInTheDocument();
    expect(screen.getByText(/FCK – BIF/)).toBeInTheDocument();
    expect(screen.getByText(/haster/)).toBeInTheDocument();
  });

  it('siger knappens EGET tal og dets vindue — kortet må ikke love mere end knappen', async () => {
    render(<GameReminderTab />);
    fireEvent.click(screen.getByTestId('tipstatus-tjek'));
    const knaptal = await screen.findByTestId('tipstatus-knaptal');
    expect(knaptal.textContent).toContain('rammer lige nu 1 spiller');
    expect(knaptal.textContent).toContain('næste døgn');
    expect(knaptal.textContent).toContain('ikke for hele runden');
  });

  it('grænsen står i teksten: OM der er tippet — aldrig hvad', () => {
    render(<GameReminderTab />);
    const kort = screen.getByTestId('tipstatus');
    expect(kort.textContent).toContain('om der er tippet — aldrig hvad');
    expect(kort.textContent).toContain('også dem, du ikke deler liga med');
  });

  it('runde-skift genbruger kampene (ingen ny getDocs) og kalder callablen igen', async () => {
    render(<GameReminderTab />);
    fireEvent.click(screen.getByTestId('tipstatus-tjek'));
    await screen.findByTestId('tipstatus-resultat');
    fireEvent.change(screen.getByLabelText('Runde'), { target: { value: '3' } });
    await waitFor(() => expect(mockTipStatus).toHaveBeenCalledWith('sl', 3));
    expect(mockGetDocs).toHaveBeenCalledTimes(1); // stadig kun én kamplæsning
  });
});
