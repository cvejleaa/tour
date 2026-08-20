// BroadcastTab i PLATFORM-tilstand: invitations-skabelonen SKAL sende spillet
// med. Uden gameId bygger serveren Superligaens mail til alle spil — det var
// præcis fejlen ved PL-launch-mailen (hero, pulje-løfte og SL-skærmbilleder i
// en Premier League-invitation). Payload-asserten her er båndet, der gør
// mutationen "drop gameId" rød.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../firebase', () => ({ db: {}, functions: {} }));
vi.mock('../../lib/platform', async (orig) => ({ ...(await orig()), PLATFORM_MODE: true }));

const mockSend = vi.fn(() => Promise.resolve({ ok: true, data: { sent: 1, total: 1, failed: [] } }));
const mockUpload = vi.fn(() => Promise.resolve({ ok: true, data: { url: 'https://firebasestorage.googleapis.com/v0/b/x/o/broadcast%2Fabc.png?alt=media&token=t' } }));
vi.mock('./adminActions', () => ({
  callSendBroadcastEmail: (...a) => mockSend(...a),
  callUploadBroadcastImage: (...a) => mockUpload(...a),
}));

vi.mock('./useUsers', () => ({ useUsers: () => ({ users: [], loading: false, error: '' }) }));
vi.mock('../leagues/useAllLeagues', () => ({ useAllLeagues: () => ({ leagues: [], loading: false, error: '' }) }));
vi.mock('../games/useGames', () => ({
  useGames: () => ({
    games: [{ id: 'pl2627-efteraar', name: 'Premier League 2026/27 — efterår', emoji: '⚽' }],
    myGameIds: [], loading: false,
  }),
}));
vi.mock('../games/useGameLeagues', () => ({
  useGameLeagues: (gameId) => ({
    leagues: gameId ? [{ id: 'bl', name: 'Buddy ligaen', code: '4GGR99', status: 'approved' }] : [],
    loading: false, error: null,
  }),
}));
vi.mock('../games/useGamePlayerUids', () => ({ useGamePlayerUids: () => ({ uids: [], loading: false, error: '' }) }));
vi.mock('./legacyResults', () => ({ fetchLegacyResults: async () => [], applyLegacyResult: (b) => b }));

import BroadcastTab from './BroadcastTab';

describe('BroadcastTab (platform) — invitationen følger spillet', () => {
  beforeEach(() => { mockSend.mockClear(); vi.spyOn(window, 'confirm').mockReturnValue(true); });

  it('sender template "invitation" MED gameId for det valgte spil', async () => {
    render(<BroadcastTab />);
    fireEvent.click(screen.getByTestId('broadcast-template')); // skabelon TIL (platform starter uden)
    fireEvent.change(screen.getByTestId('broadcast-game'), { target: { value: 'pl2627-efteraar' } });
    fireEvent.change(screen.getByTestId('broadcast-league'), { target: { value: 'bl' } });
    fireEvent.change(screen.getByTestId('broadcast-recipients'), { target: { value: 'ven@x.dk' } });
    fireEvent.change(screen.getByTestId('broadcast-subject'), { target: { value: 'Kom med' } });
    fireEvent.change(screen.getByTestId('broadcast-body'), { target: { value: 'Er du klar?' } });
    fireEvent.click(screen.getByTestId('broadcast-send'));
    await waitFor(() => expect(mockSend).toHaveBeenCalled());
    const arg = mockSend.mock.calls[0][0];
    expect(arg.template).toBe('invitation'); // IKKE 'superliga' — serveren skelner
    expect(arg.gameId).toBe('pl2627-efteraar');
    expect(arg.joinLink).toContain('spil=pl2627-efteraar');
    expect(arg.joinLink).toContain('kode=4GGR99');
    expect(arg.leagueName).toBe('Buddy ligaen');
  });
});

// Rig tekst + billeder i den RENE mail. Værktøjslinjen og forhåndsvisningen må
// KUN vises for den rene tekstmail (ikke skabelon-introen, ikke Tour), fordi
// kun DÉR renderer serveren markdown — ellers ville preview love formatering,
// modtageren ikke får.
describe('BroadcastTab (platform) — rig tekst + billeder', () => {
  beforeEach(() => { mockSend.mockClear(); mockUpload.mockClear(); vi.spyOn(window, 'confirm').mockReturnValue(true); });

  it('viser værktøjslinje + forhåndsvisning i den rene mail — og SKJULER dem, når en skabelon vælges', () => {
    render(<BroadcastTab />);
    // Platform starter uden skabelon → rig redigering er tilgængelig.
    expect(screen.getByTestId('broadcast-toolbar')).toBeInTheDocument();
    expect(screen.getByTestId('broadcast-preview')).toBeInTheDocument();
    // Slå skabelonen TIL → introen bliver ren tekst, værktøjer forsvinder.
    fireEvent.click(screen.getByTestId('broadcast-template'));
    expect(screen.queryByTestId('broadcast-toolbar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('broadcast-preview')).not.toBeInTheDocument();
  });

  it('forhåndsvisningen renderer markdown med den delte mailMarkdown', () => {
    render(<BroadcastTab />);
    fireEvent.change(screen.getByTestId('broadcast-body'), { target: { value: 'helt **fed** her' } });
    const preview = screen.getByTestId('broadcast-preview');
    expect(preview.innerHTML).toContain('<strong>fed</strong>');
  });

  // TM-fund: "Fed" skal ombryde den MARKEREDE tekst DÉR, hvor cursoren står —
  // ikke føje til enden. Uden markering midt i teksten kunne cursor-logikken
  // fjernes (ren append) uden at fejle.
  it('ombryder den markerede tekst ved cursor — ikke for enden', () => {
    render(<BroadcastTab />);
    const ta = screen.getByTestId('broadcast-body');
    fireEvent.change(ta, { target: { value: 'Kære alle og tak' } });
    ta.setSelectionRange(5, 9); // markér "alle"
    fireEvent.click(screen.getByTitle('Fed'));
    expect(ta.value).toBe('Kære **alle** og tak');
  });

  it('“Billed-URL” indsætter ![](url) — og afviser en ikke-https URL', () => {
    render(<BroadcastTab />);
    fireEvent.change(screen.getByTestId('broadcast-body'), { target: { value: '' } });
    // Ikke-https → dansk fejl, intet indsat.
    vi.spyOn(window, 'prompt').mockReturnValueOnce('http://usikkert/a.png');
    fireEvent.click(screen.getByRole('button', { name: /Billed-URL/ }));
    expect(screen.getByTestId('broadcast-img-error').textContent).toMatch(/https:\/\//);
    expect(screen.getByTestId('broadcast-body').value).toBe('');
    // https → indsat som markdown-billede.
    window.prompt.mockReturnValueOnce('https://x.dk/a.png');
    fireEvent.click(screen.getByRole('button', { name: /Billed-URL/ }));
    expect(screen.getByTestId('broadcast-body').value).toContain('![](https://x.dk/a.png)');
  });

  it('upload kalder callablen og indsætter det returnerede billede i teksten', async () => {
    render(<BroadcastTab />);
    fireEvent.change(screen.getByTestId('broadcast-body'), { target: { value: '' } });
    const fil = new File([new Uint8Array([1, 2, 3])], 'stilling.png', { type: 'image/png' });
    fireEvent.change(screen.getByTestId('broadcast-file'), { target: { files: [fil] } });
    await waitFor(() => expect(mockUpload).toHaveBeenCalled());
    // Serveren afgør type/størrelse; klienten sender content-type + base64.
    expect(mockUpload.mock.calls[0][0].contentType).toBe('image/png');
    expect(typeof mockUpload.mock.calls[0][0].data).toBe('string');
    await waitFor(() => expect(screen.getByTestId('broadcast-body').value)
      .toContain('![stilling.png](https://firebasestorage.googleapis.com'));
  });

  it('viser serverens danske fejl, hvis upload afvises (fx for stort billede)', async () => {
    mockUpload.mockResolvedValueOnce({ ok: false, error: 'Billedet er for stort (2000 KB) — maks 1500 KB.' });
    render(<BroadcastTab />);
    const fil = new File([new Uint8Array([1, 2, 3])], 'stor.png', { type: 'image/png' });
    fireEvent.change(screen.getByTestId('broadcast-file'), { target: { files: [fil] } });
    await waitFor(() => expect(screen.getByTestId('broadcast-img-error').textContent).toMatch(/for stort/));
  });
});
