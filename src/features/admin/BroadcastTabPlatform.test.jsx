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
vi.mock('./adminActions', () => ({ callSendBroadcastEmail: (...a) => mockSend(...a) }));

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
