// Tests for GameReminderTab — Tip-status-sektionen (opgave #37).
//
// Kortet står lige over 'Send påmindelser nu' og må ALDRIG kunne læses som
// knappens løfte: knappens eget tal og dets forklaring ("næste døgn") skal
// stå der ordret. Og grænsen skal stå i teksten: OM der er tippet, aldrig hvad.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../firebase', () => ({ db: {}, functions: {} }));

const mockTipStatus = vi.fn();
const mockSendNow = vi.fn();
vi.mock('./adminActions', () => ({
  callSendGameTipRemindersNow: (...a) => mockSendNow(...a),
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

const mockSpil = vi.fn();
vi.mock('../games/useGames', () => ({
  useGames: () => mockSpil(),
}));

const mockSetPaused = vi.fn();
vi.mock('../games/gameActions', () => ({
  setGamePaused: (...a) => mockSetPaused(...a),
}));

const SL = { id: 'sl', name: 'Superligaen', type: 'football', status: 'open' };
/** useGames-svar med ét spil — pr. test, så pause/status kan varieres. */
function spil(extra = {}) {
  return { games: [{ ...SL, ...extra }], myGameIds: [], loading: false };
}

import GameReminderTab from './GameReminderTab';

const kampDocs = [
  { id: 'r3-a', round: 3, home: 'OB', away: 'AGF', kickoff: new Date(NU - 100 * H), result: '1' },
  { id: 'r4-a', round: 4, home: 'FCK', away: 'BIF', kickoff: new Date(NU + 3 * H) },
  { id: 'r4-b', round: 4, home: 'VFF', away: 'FCM', kickoff: new Date(NU + 30 * H) },
].map((d) => ({ id: d.id, data: () => d }));

beforeEach(() => {
  vi.clearAllMocks();
  mockSpil.mockReturnValue(spil());
  mockSetPaused.mockResolvedValue({ ok: true });
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

// ---------------------------------------------------------------------------
// Pause-nødstoppet (#47). Kontakten er den ENESTE måde at standse det daglige
// 09-job for ét spil — og en glemt pause koster deltagerne en deadline. Derfor
// skal både etiketten, badget, hjælpeteksten OG afgrænsningen bevises: teksten
// må ikke påstå, at synk eller Runde-Botten også stopper.
// ---------------------------------------------------------------------------
describe('pause-nødstop', () => {
  const pauseKnap = () => screen.getByRole('button', { name: /pause|Genoptag/i });

  it('viser "Kører" og tilbyder at sætte på pause, når spillet ikke er pauset', () => {
    render(<GameReminderTab />);
    expect(screen.getByText('● Kører')).toBeInTheDocument();
    expect(pauseKnap()).toHaveTextContent('Sæt påmindelser på pause');
  });

  it('viser "På pause" og tilbyder at genoptage, når spillet ER pauset', () => {
    mockSpil.mockReturnValue(spil({ paused: true }));
    render(<GameReminderTab />);
    expect(screen.getByText('● På pause')).toBeInTheDocument();
    expect(pauseKnap()).toHaveTextContent('Genoptag påmindelser');
  });

  // Vender man argumentet (!paused → paused), tænder klikket den pause, det
  // skulle slukke — og omvendt. Begge retninger skal derfor bevises.
  it('skriver den MODSATTE tilstand — begge veje', async () => {
    const { unmount } = render(<GameReminderTab />);
    fireEvent.click(pauseKnap());
    await waitFor(() => expect(mockSetPaused).toHaveBeenCalledWith('sl', true));
    unmount();

    mockSetPaused.mockClear();
    mockSpil.mockReturnValue(spil({ paused: true }));
    render(<GameReminderTab />);
    fireEvent.click(pauseKnap());
    await waitFor(() => expect(mockSetPaused).toHaveBeenCalledWith('sl', false));
  });

  it('viser serverens fejl, hvis pausen ikke kunne skrives', async () => {
    mockSetPaused.mockResolvedValue({ ok: false, error: 'Du har ikke adgang.' });
    render(<GameReminderTab />);
    fireEvent.click(pauseKnap());
    await waitFor(() => expect(screen.getByText(/ikke adgang/)).toBeInTheDocument());
  });

  // INDHOLDET, ikke kun at der står noget: 09.00-løftet og "På pause" må aldrig
  // stå som to nabosætninger, der modsiger hinanden — og teksten må ikke love
  // mere, end pausen gør (synk og Runde-Botten kører videre).
  it('hjælpeteksten skifter med tilstanden og lover ikke for meget', () => {
    const { unmount } = render(<GameReminderTab />);
    expect(screen.getByText(/får automatisk en mail/)).toBeInTheDocument();
    unmount();

    mockSpil.mockReturnValue(spil({ paused: true }));
    render(<GameReminderTab />);
    // Teksten er brudt op af <strong>, så assertionen skal stå på HELE
    // afsnittet — ellers måler den kun det fremhævede stykke.
    const afsnit = screen.getByText(/sat på pause for dette spil/).closest('p');
    expect(afsnit.textContent).toMatch(/resultat-synk, pointafregning og Runde-Botten kører videre/);
    expect(afsnit.textContent).toMatch(/nødstop/);
    expect(afsnit.textContent).toMatch(/Send nu.*virker stadig manuelt/);
    // Det gamle, ubetingede 09.00-løfte må IKKE stå samtidig.
    expect(screen.queryByText(/får automatisk en mail/)).toBeNull();
  });

  // Pausen standser AUTOMATIKKEN — ikke den manuelle udvej. Teksten lover det,
  // så knappen skal stadig kunne trykkes.
  it('Send nu virker stadig under pause — det er udvejen, teksten lover', () => {
    mockSpil.mockReturnValue(spil({ paused: true }));
    render(<GameReminderTab />);
    expect(screen.getByRole('button', { name: /Send påmindelser nu/ })).toBeEnabled();
  });
});

describe('gate mod det daglige job', () => {
  // Et spil uden for jobbets gate må ikke have aktive påmindelses-knapper —
  // ellers lover fanen en udsendelse, automatikken aldrig ville lave. Men
  // tip-status og pulje-status er IKKE påmindelser og skal blive (QC-krav).
  it('slår påmindelses-knapperne fra for et spil uden status — men ikke tip-/pulje-status', () => {
    mockSpil.mockReturnValue({
      games: [{ id: 'sl', name: 'Superligaen', type: 'football' }], myGameIds: [], loading: false,
    });
    render(<GameReminderTab />);
    expect(screen.getByRole('button', { name: /Send påmindelser nu/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Send testmail/ })).toBeDisabled();
    expect(screen.getByTestId('tipstatus-tjek')).toBeEnabled();
    expect(screen.getByRole('button', { name: /Tjek pulje-status/ })).toBeEnabled();
    expect(screen.getByText(/uden for det daglige jobs gate/)).toBeInTheDocument();
    // Pause-kontakten hører til jobbet — den skal heller ikke stå der.
    expect(screen.queryByRole('button', { name: /pause|Genoptag/i })).toBeNull();
  });

  it('lader påmindelses-knapperne stå for et spil i gang', () => {
    mockSpil.mockReturnValue(spil({ status: 'live' }));
    render(<GameReminderTab />);
    expect(screen.getByRole('button', { name: /Send påmindelser nu/ })).toBeEnabled();
    expect(screen.queryByText(/uden for det daglige jobs gate/)).toBeNull();
  });
});

// Send nu-knappens egen rapport. Rettede vi kun automatikkens driftkort, ville
// knappen stadig sige grønt "Sendte 0" på et totalt SMTP-nedbrud — en halv
// rettelse (QC-fund). De to udfald må ikke dele ordlyd.
describe('Send påmindelser nu — rapporten', () => {
  const sendNu = () => screen.getByRole('button', { name: /Send påmindelser nu/ });

  it('melder FEJL, når afsendelser er slået fejl — ikke "Sendte 0"', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockSendNow.mockResolvedValue({ ok: true, data: { sent: 0, fejlede: 5, upcoming: 3, members: 12 } });
    render(<GameReminderTab />);
    fireEvent.click(sendNu());
    await waitFor(() => expect(screen.getByText(/5 af 5 påmindelser kunne ikke sendes/)).toBeInTheDocument());
    expect(screen.queryByText(/^Sendte 0/)).toBeNull();
    window.confirm.mockRestore();
  });

  it('melder antal sendt, når det lykkedes', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockSendNow.mockResolvedValue({ ok: true, data: { sent: 4, fejlede: 0, upcoming: 3, members: 12 } });
    render(<GameReminderTab />);
    fireEvent.click(sendNu());
    await waitFor(() => expect(screen.getByText(/Sendte 4 påmindelser/)).toBeInTheDocument());
    expect(screen.queryByText(/kunne ikke sendes/)).toBeNull();
    window.confirm.mockRestore();
  });
});
