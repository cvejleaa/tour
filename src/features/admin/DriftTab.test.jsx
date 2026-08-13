// ---------------------------------------------------------------------------
// DriftTab — statusfladen må ALDRIG lyve (TM-fund: klientlaget var utestet,
// ⚠-badget kunne fjernes med grøn suite):
//   - et forventet kort uden dokument er GRÅT ("afventer"), ikke et hul
//   - serverens naesteForventetFoer i fortiden = rødt "HAR IKKE KØRT"
//   - et status-dokument UDEN forventet kort vises alligevel (QC-fund:
//     divergens mellem klientens afledte liste og serverens SYNCED_GAMES)
//   - en læsefejl vises som fejl — aldrig som "ingen problemer"
//   - titlen flipper ikke til råt id efter første kørsel
// ---------------------------------------------------------------------------
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const mockDrift = vi.fn();
vi.mock('./useDriftStatus', async (orig) => ({
  ...(await orig()),
  useDriftStatus: () => mockDrift(),
}));
vi.mock('../games/useGames', () => ({
  useGames: () => ({
    games: [
      { id: 'sl', name: 'Superligaen', sync: { provider: 'superliga' } },
      { id: 'pl', name: 'Premier League', sync: { provider: 'pulselive' } },
      { id: 'tour', name: 'Touren' }, // intet sync-felt → ingen kort
    ],
  }),
}));
vi.mock('../../firebase', () => ({ db: {}, functions: {} }));
vi.mock('firebase/functions', () => ({ httpsCallable: () => vi.fn() }));

import DriftTab from './DriftTab';

const basis = { status: [], alarmer: [], loading: false, error: '' };

describe('DriftTab', () => {
  it('tegner GRÅT kort pr. forventet kørsel uden dokument — aldrig et hul i listen', () => {
    mockDrift.mockReturnValue(basis);
    render(<DriftTab />);
    // SL: sweep. PL: sweep + kickoff. Touren: ingenting.
    expect(screen.getAllByText('afventer første kørsel').length).toBe(3);
    expect(screen.queryByText(/Touren/)).toBeNull();
  });

  it('serverens naesteForventetFoer i fortiden gør kortet rødt "HAR IKKE KØRT til tiden"', () => {
    mockDrift.mockReturnValue({
      ...basis,
      status: [{ id: 'sweep-sl', type: 'sweep', gameId: 'sl', gameNavn: 'sl', niveau: 'ok', besked: 'Alt vel.', koertAt: 1, naesteForventetFoer: Date.now() - 60000 }],
    });
    render(<DriftTab />);
    expect(screen.getByText('HAR IKKE KØRT til tiden')).toBeInTheDocument();
  });

  it('et status-dokument UDEN forventet kort vises alligevel — et rødt dokument må ikke gemme sig i divergensen', () => {
    mockDrift.mockReturnValue({
      ...basis,
      status: [{ id: 'sweep-vaek', type: 'sweep', gameId: 'vaek', gameNavn: 'vaek', niveau: 'fejl', besked: 'Resultat-synken fejlede.', koertAt: 1, naesteForventetFoer: Date.now() + 3600000 }],
    });
    render(<DriftTab />);
    expect(screen.getByText(/Resultat-synken fejlede/)).toBeInTheDocument();
  });

  it('en læsefejl vises som fejl — aldrig som "ingen problemer"', () => {
    mockDrift.mockReturnValue({ ...basis, error: 'Kunne ikke hente driftstatus — det er i sig selv en driftfejl.' });
    render(<DriftTab />);
    expect(screen.getByText(/i sig selv en driftfejl/)).toBeInTheDocument();
    expect(screen.queryByText(/ingen åbne/)).toBeNull();
  });

  it('titlen bruger spillets NAVN — også når serverens dokument kun kender det rå id', () => {
    mockDrift.mockReturnValue({
      ...basis,
      status: [{ id: 'sweep-sl', type: 'sweep', gameId: 'sl', gameNavn: 'sl', niveau: 'ok', besked: 'Alt vel.', koertAt: 1, naesteForventetFoer: Date.now() + 3600000 }],
    });
    render(<DriftTab />);
    expect(screen.getAllByText(/Superligaen/).length).toBeGreaterThan(0);
  });

  it('kvittér-knappen findes kun på ukvitterede alarmer, der kræver kvittering', () => {
    mockDrift.mockReturnValue({
      ...basis,
      alarmer: [
        { id: 'a1', besked: 'Genåbning afvist.', kraeverKvittering: true, kvitteretAt: null, loestAt: null, antal: 1, foersteSetAt: 1, sidstSetAt: 1 },
        { id: 'a2', besked: 'Strandet kamp.', kraeverKvittering: false, kvitteretAt: null, loestAt: null, antal: 1, foersteSetAt: 1, sidstSetAt: 1 },
      ],
    });
    render(<DriftTab />);
    expect(screen.getAllByRole('button', { name: /Kvittér/ }).length).toBe(1);
  });
});
