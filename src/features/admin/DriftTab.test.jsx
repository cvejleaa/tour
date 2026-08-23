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
      // type/status SKAL med i fixturen: reminder-kortets gate
      // (forventerPaamindelser) kræver football + open/live. Uden felterne
      // gav gaten 0 reminder-kort, og suiten stod grøn på en feature, der
      // ikke gjorde noget (arkitektens fælde-advarsel på planen).
      { id: 'sl', name: 'Superligaen', type: 'football', status: 'open', sync: { provider: 'superliga' } },
      { id: 'pl', name: 'Premier League', type: 'football', status: 'live', sync: { provider: 'pulselive' } },
      { id: 'tour', name: 'Touren', type: 'cycling', status: 'finished' }, // intet sync-felt → ingen kort
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
    // BÅDE SL og PL har kickoff-synk (begge providere har hentKickoffs), så:
    // SL: sweep + kickoff + reminder. PL: sweep + kickoff + reminder.
    // Touren (uden sync, cycling/finished): ingenting.
    // 4 → 6: SL og PL fik hver et påmindelses-kort (09-jobbet kunne før kun
    // fejle tavst — opgave #47).
    expect(screen.getAllByText('afventer første kørsel').length).toBe(6);
    // Præcist TO kickoff-kort — ét for hvert synket spil, ikke kun PL. Ét af
    // dem SKAL være Superligaens (titlen er "Daglig kickoff-synk · <navn>").
    expect(screen.getAllByText(/Daglig kickoff-synk/).length).toBe(2);
    expect(screen.getByText(/Daglig kickoff-synk · Superligaen/)).toBeInTheDocument();
    expect(screen.queryByText(/Touren/)).toBeNull();
  });

  // Matrixen maskineri × spil for påmindelses-kortet: præcis de spil, 09-
  // jobbet kører for, har et kort — med det DANSKE navn, aldrig den rå
  // 'reminder'-streng (den ville ellers stå der via orphan-grenen).
  it('påmindelses-kort for præcis de aktive fodbold-spil — på dansk', () => {
    mockDrift.mockReturnValue(basis);
    render(<DriftTab />);
    expect(screen.getAllByText(/Daglig tip-påmindelse/).length).toBe(2);
    expect(screen.getByText(/Daglig tip-påmindelse · Superligaen/)).toBeInTheDocument();
    expect(screen.getByText(/Daglig tip-påmindelse · Premier League/)).toBeInTheDocument();
    expect(screen.queryByText(/reminder/)).toBeNull();
    expect(screen.queryByText(/Touren/)).toBeNull();
  });

  // Afslutnings-status: når et spil sættes til finished, forsvinder dets
  // forventede kort, og serveren lukker dokumentet med naesteForventetFoer:
  // null. Et sådant dokument (vises via orphan-grenen) må ALDRIG stå som
  // "HAR IKKE KØRT til tiden" — det var den evigt-røde fælde fra planen.
  it('et lukket kort (naesteForventetFoer: null) står aldrig som "HAR IKKE KØRT"', () => {
    mockDrift.mockReturnValue({
      ...basis,
      status: [{
        id: 'reminder-gammel', type: 'reminder', gameId: 'gammel', gameNavn: 'Gammelt spil',
        niveau: 'ok', besked: 'Spillet er afsluttet — der sendes ikke flere påmindelser.',
        koertAt: 1, naesteForventetFoer: null,
      }],
    });
    render(<DriftTab />);
    expect(screen.getByText(/Spillet er afsluttet/)).toBeInTheDocument();
    expect(screen.queryByText('HAR IKKE KØRT til tiden')).toBeNull();
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
