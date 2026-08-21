// MessagesPage i PLATFORM-tilstand: kontaktkredsen kommer fra mini-ligaerne på
// tværs af spil, og en sendt besked SKAL bære både leagueId og gameId — ellers
// afviser serverens game-league-gren den. Payload-asserten her er båndet, der
// gør mutationen "drop gameId" rød. Desuden: uden delt mini-liga skal den tomme
// tilstand være en invitation, ikke "vælg en spiller ovenfor" (der er ingen).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../firebase', () => ({ db: {} }));
vi.mock('../lib/platform', async (orig) => ({ ...(await orig()), PLATFORM_MODE: true }));
vi.mock('../components/Avatar', () => ({ default: () => null }));
vi.mock('../features/comments/EmojiPicker', () => ({ default: () => null }));

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { uid: 'me' } }) }));
vi.mock('../features/leaderboard/useStandings', () => ({
  useStandings: () => ({
    standings: [
      { uid: 'me', displayName: 'Mig' },
      { uid: 'b', displayName: 'Bo' },
      { uid: 'x', displayName: 'Xenia' }, // deler INGEN mini-liga → må ikke stå i dropdownen
    ],
    loading: false,
  }),
}));
// Tour-kilden er tom; på platformen bruges cross-game-hooken.
vi.mock('../features/leagues/useLeagues', () => ({ useLeagues: () => ({ leagues: [] }) }));

const mockLeagues = vi.fn();
vi.mock('../features/games/useMyLeaguesAcrossGames', () => ({
  useMyLeaguesAcrossGames: () => mockLeagues(),
}));

vi.mock('../features/comments/useMessages', async (orig) => ({
  ...(await orig()),
  useMyMessages: () => ({ messages: [], loading: false }),
}));

const mockSend = vi.fn(() => Promise.resolve('new-id'));
vi.mock('../features/comments/commentActions', async (orig) => ({
  ...(await orig()),
  sendMessage: (...a) => mockSend(...a),
  deleteMessage: vi.fn(),
}));
vi.mock('../features/comments/dmRead', () => ({ markConversationSeen: vi.fn() }));

import MessagesPage from './MessagesPage';

function renderPage() {
  return render(<MemoryRouter><MessagesPage /></MemoryRouter>);
}

describe('MessagesPage (platform) — mini-liga-kontakter + gameId på beskeden', () => {
  beforeEach(() => { mockSend.mockClear(); });

  it('dropdownen viser KUN mini-liga-fæller, og Send bærer både leagueId og gameId', async () => {
    // me deler mini-ligaen L (i spil G) med b — ikke med x.
    mockLeagues.mockReturnValue({
      leagues: [{ id: 'L', gameId: 'G', memberUids: ['me', 'b'] }],
      loading: false,
    });
    renderPage();

    const select = screen.getByLabelText('Vælg modtager');
    // Bo er en mulig modtager; Xenia (ingen delt liga) er det IKKE.
    expect(screen.getByRole('option', { name: 'Bo' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Xenia' })).not.toBeInTheDocument();

    fireEvent.change(select, { target: { value: 'b' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));

    const ta = screen.getByLabelText('Ny privat besked');
    fireEvent.change(ta, { target: { value: 'Hej Bo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(mockSend).toHaveBeenCalledTimes(1));
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
      from: 'me', to: 'b', text: 'Hej Bo', leagueId: 'L', gameId: 'G',
    }));
  });

  it('uden delt mini-liga viser den tomme tilstand en invitation med link til Spil — ikke "vælg en spiller"', () => {
    mockLeagues.mockReturnValue({ leagues: [], loading: false });
    renderPage();

    // Ærlig invitation, ikke blindgyden.
    expect(screen.getByTestId('dm-no-contacts')).toBeInTheDocument();
    expect(screen.getByText(/kom med i en pulje/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Spil' })).toHaveAttribute('href', '/spil');
    expect(screen.queryByText(/Vælg en spiller ovenfor/i)).not.toBeInTheDocument();
    // Ingen modtagere i dropdownen.
    expect(screen.queryByRole('option', { name: 'Bo' })).not.toBeInTheDocument();
  });
});
