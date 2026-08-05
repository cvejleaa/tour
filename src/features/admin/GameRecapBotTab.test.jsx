// Tests for GameRecapBotTab.
//
// Fladen her har allerede sendt én fejl i produktion. Da botten begyndte at
// bygge ét opslag PR. LIGA, skiftede dryRun-svaret fra `{ text }` til
// `{ udkast: [...] }` — serveren og dens test fulgte med, fladen gjorde ikke.
// Resultatet var en forhåndsvisning, der svarede "Intet postet (ukendt
// årsag)" på et helt gyldigt svar. Ingen test var rød.
//
// Derfor tester vi her netop FLADENS LÆSNING AF SVARET: `adminActions` er
// mocket, så det er formen på serverens svar, der er under prøve — ikke
// Firebase.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../firebase', () => ({ db: {} }));

const mockGames = vi.fn();
vi.mock('../games/useGames', () => ({ useGames: () => mockGames() }));

const mockRecapNow = vi.fn();
const mockRetOpslag = vi.fn();
vi.mock('./adminActions', () => ({
  callGenerateGameRecapNow: (...a) => mockRecapNow(...a),
  callRetGamleRundeOpslag: (...a) => mockRetOpslag(...a),
}));

import GameRecapBotTab from './GameRecapBotTab';

const SPIL = {
  id: 'superliga2627', name: 'Superligaen 26/27', emoji: '⚽',
  type: 'football', status: 'live', season: '2026/27',
};

const UDKAST = {
  dryRun: true,
  round: 2,
  posted: 0,
  udkast: [
    { leagueId: 'L1', navn: 'Familien', medlemmer: 7, text: 'Sikke en runde i Familien!' },
    { leagueId: 'L2', navn: 'Kollegerne', medlemmer: 3, text: 'Og hos Kollegerne…' },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGames.mockReturnValue({ games: [SPIL], loading: false });
  window.confirm = vi.fn(() => true);
});

describe('forhåndsvisning af runde-opslaget', () => {
  // DEN FEJL, DER VAR I PRODUKTION. Et gyldigt udkast-svar må aldrig lande i
  // fejlgrenen. Læses `res.data.text` igen, bliver denne test rød.
  it('viser udkastene og IKKE "Intet postet", når serveren svarer med udkast', async () => {
    mockRecapNow.mockResolvedValue({ ok: true, data: UDKAST });
    render(<GameRecapBotTab />);
    fireEvent.click(screen.getByRole('button', { name: /Forhåndsvis runde-opslag/ }));

    await screen.findByText('Sikke en runde i Familien!');
    expect(screen.getByText('Og hos Kollegerne…')).toBeInTheDocument();
    expect(screen.queryByText(/Intet postet/)).not.toBeInTheDocument();
    expect(screen.queryByText(/ukendt årsag/)).not.toBeInTheDocument();
  });

  // Hver liga har sin egen tekst — og navn og medlemstal hører til den rigtige.
  // Bindes de til elementet, kan "3 medlemmer" ikke bestå på "7 medlemmer".
  it('viser ét kort pr. liga med ligaens eget navn og medlemstal', async () => {
    mockRecapNow.mockResolvedValue({ ok: true, data: UDKAST });
    render(<GameRecapBotTab />);
    fireEvent.click(screen.getByRole('button', { name: /Forhåndsvis runde-opslag/ }));

    const familien = (await screen.findByText('Familien')).closest('div');
    expect(familien).toHaveTextContent('(7 medlemmer)');
    expect(familien).toHaveTextContent('runde 2');
    expect(screen.getByText('Kollegerne').closest('div')).toHaveTextContent('(3 medlemmer)');
  });

  it('forhåndsvis poster ikke; "Post nu" gør', async () => {
    mockRecapNow.mockResolvedValue({ ok: true, data: UDKAST });
    render(<GameRecapBotTab />);

    fireEvent.click(screen.getByRole('button', { name: /Forhåndsvis runde-opslag/ }));
    await waitFor(() => expect(mockRecapNow).toHaveBeenCalled());
    expect(mockRecapNow.mock.calls[0][0]).toMatchObject({ dryRun: true });

    mockRecapNow.mockResolvedValue({ ok: true, data: { posted: 2, round: 2 } });
    fireEvent.click(screen.getByRole('button', { name: /Post runde-opslag nu/ }));
    await waitFor(() => expect(mockRecapNow).toHaveBeenCalledTimes(2));
    expect(mockRecapNow.mock.calls[1][0]).toMatchObject({ dryRun: false });
  });

  // En tør-kørsel, der ikke skulle poste noget, må ikke svare "ukendt årsag" —
  // netop den besked sendte mig på jagt efter en fejl, der ikke fandtes.
  it('forklarer en tom tør-kørsel i stedet for at sige "ukendt årsag"', async () => {
    mockRecapNow.mockResolvedValue({ ok: true, data: { dryRun: true, posted: 0, round: 2, udkast: [] } });
    render(<GameRecapBotTab />);
    fireEvent.click(screen.getByRole('button', { name: /Forhåndsvis runde-opslag/ }));

    expect(await screen.findByText(/Ingen liga gav en tekst/)).toBeInTheDocument();
    expect(screen.queryByText(/ukendt årsag/)).not.toBeInTheDocument();
  });

  it('oversætter serverens grund til dansk', async () => {
    mockRecapNow.mockResolvedValue({ ok: true, data: { posted: 0, reason: 'already', round: 2 } });
    render(<GameRecapBotTab />);
    fireEvent.click(screen.getByRole('button', { name: /Forhåndsvis runde-opslag/ }));
    expect(await screen.findByText('Runde 2 har allerede fået sit opslag.')).toBeInTheDocument();
  });
});

describe('rettelse af de gamle opslag', () => {
  const RETTELSE = {
    dryRun: true,
    rettede: 0,
    udkast: [
      {
        leagueId: 'L1', navn: 'Familien', messageId: 'm1', createdAtMs: 1754000000000,
        gammelTekst: 'Anna fører med 40 point', nyTekst: 'Her stod et runde-opslag…',
      },
      { leagueId: 'L2', navn: 'Kollegerne', messageId: 'm9', reason: 'uden tidsstempel — rørt ikke' },
    ],
  };

  // Forhåndsvisningen er hele værnet: den skal vise den tekst, der forsvinder.
  it('viser den gamle tekst, der bliver erstattet', async () => {
    mockRetOpslag.mockResolvedValue({ ok: true, data: RETTELSE });
    render(<GameRecapBotTab />);
    fireEvent.click(screen.getByRole('button', { name: /Forhåndsvis rettelse/ }));

    expect(await screen.findByText('Anna fører med 40 point')).toBeInTheDocument();
    expect(screen.getByText('Her stod et runde-opslag…')).toBeInTheDocument();
    // Og grunden til, at ét opslag IKKE røres, skal kunne ses.
    expect(screen.getByText(/uden tidsstempel/)).toBeInTheDocument();
  });

  it('forhåndsviser med dryRun, og skriver først på det andet klik', async () => {
    mockRetOpslag.mockResolvedValue({ ok: true, data: RETTELSE });
    render(<GameRecapBotTab />);

    fireEvent.click(screen.getByRole('button', { name: /Forhåndsvis rettelse/ }));
    await waitFor(() => expect(mockRetOpslag).toHaveBeenCalled());
    expect(mockRetOpslag.mock.calls[0][0]).toMatchObject({ dryRun: true });

    mockRetOpslag.mockResolvedValue({ ok: true, data: { dryRun: false, rettede: 1, udkast: [] } });
    fireEvent.click(await screen.findByRole('button', { name: /Erstat de gamle opslag/ }));
    await waitFor(() => expect(mockRetOpslag).toHaveBeenCalledTimes(2));
    expect(mockRetOpslag.mock.calls[1][0]).toMatchObject({ dryRun: false });
    expect(window.confirm).toHaveBeenCalled();
  });

  // Man skal ikke kunne skrive i noget, tolv mennesker har læst, uden først at
  // have set hvad der forsvinder.
  it('spærrer skriv-knappen indtil en forhåndsvisning har fundet noget at rette', async () => {
    mockRetOpslag.mockResolvedValue({ ok: true, data: RETTELSE });
    render(<GameRecapBotTab />);
    expect(screen.getByRole('button', { name: /Erstat de gamle opslag/ })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /Forhåndsvis rettelse/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Erstat de gamle opslag/ })).toBeEnabled());
  });

  // Findes der KUN poster, der ikke skal røres, er der intet at skrive.
  it('holder skriv-knappen spærret, når intet udkast har en ny tekst', async () => {
    mockRetOpslag.mockResolvedValue({
      ok: true,
      data: { dryRun: true, rettede: 0, udkast: [{ leagueId: 'L2', navn: 'Kollegerne', messageId: 'm9', reason: 'uden tekst — rørt ikke' }] },
    });
    render(<GameRecapBotTab />);
    fireEvent.click(screen.getByRole('button', { name: /Forhåndsvis rettelse/ }));

    await screen.findByText(/uden tekst/);
    expect(screen.getByRole('button', { name: /Erstat de gamle opslag/ })).toBeDisabled();
  });

  it('siger til, når der ikke er flere gamle opslag', async () => {
    mockRetOpslag.mockResolvedValue({ ok: true, data: { reason: 'ingen-gamle-opslag', rettede: 0, udkast: [] } });
    render(<GameRecapBotTab />);
    fireEvent.click(screen.getByRole('button', { name: /Forhåndsvis rettelse/ }));
    expect(await screen.findByText(/Ingen gamle opslag tilbage/)).toBeInTheDocument();
  });
});

// Et udkast hører til ÉT spil. Bliver det stående, når man skifter spil, skriver
// knappen i spil B ud fra en forhåndsvisning af spil A.
describe('skift af spil', () => {
  it('rydder forhåndsvisningen, når man vælger et andet spil', async () => {
    const ANDET = { ...SPIL, id: 'vm2026', name: 'VM 2026' };
    mockGames.mockReturnValue({ games: [SPIL, ANDET], loading: false });
    mockRecapNow.mockResolvedValue({ ok: true, data: UDKAST });
    render(<GameRecapBotTab />);

    fireEvent.click(screen.getByRole('button', { name: /Forhåndsvis runde-opslag/ }));
    await screen.findByText('Sikke en runde i Familien!');

    fireEvent.change(screen.getByLabelText('Spil'), { target: { value: 'vm2026' } });
    await waitFor(() => expect(screen.queryByText('Sikke en runde i Familien!')).not.toBeInTheDocument());
  });
});
