import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Platform-tilstand: spil-liga-flowet.
vi.mock('../lib/platform', () => ({ PLATFORM_MODE: true }));

const joinLeagueByCode = vi.fn();
vi.mock('../features/games/gameLeagueActions', () => ({
  joinLeagueByCode: (...a) => joinLeagueByCode(...a),
}));
// Tour-top-niveau-handlinger må ikke kaldes i platform-flowet.
vi.mock('../features/leagues/leagueActions', () => ({ joinLeague: vi.fn() }));
vi.mock('../features/leagues/activityActions', () => ({ tryLogActivity: vi.fn(), ACTIVITY: { JOIN: 'join' } }));

let authValue;
vi.mock('../context/AuthContext', () => ({ useAuth: () => authValue }));

import JoinPage from './JoinPage';

function renderAt(url) {
  return render(<MemoryRouter initialEntries={[url]}><JoinPage /></MemoryRouter>);
}

describe('JoinPage (platform spil-liga)', () => {
  beforeEach(() => {
    joinLeagueByCode.mockReset();
    localStorage.clear();
    authValue = { user: { uid: 'me' }, status: 'approved', profile: { displayName: 'Bo' }, loading: false };
  });

  it('indløser spil-liga via ?spil=…&kode=… for logget-ind bruger', async () => {
    joinLeagueByCode.mockResolvedValue({ ok: true, name: 'Vennerne', already: false });
    renderAt('/tilmeld?spil=spil-7&kode=x4kr2m');
    await waitFor(() => expect(joinLeagueByCode).toHaveBeenCalledWith({ gameId: 'spil-7', code: 'X4KR2M' }));
    expect(await screen.findByText(/Du er nu med i "Vennerne"/)).toBeInTheDocument();
  });

  it('viser invitations-skærm når man ikke er logget ind', () => {
    authValue = { user: null, status: null, profile: null, loading: false };
    renderAt('/tilmeld?spil=spil-7&kode=X4KR2M');
    expect(screen.getByText(/inviteret til en liga/i)).toBeInTheDocument();
    expect(joinLeagueByCode).not.toHaveBeenCalled();
  });

  it('fejler pænt hvis linket mangler spil-id', () => {
    renderAt('/tilmeld?kode=X4KR2M');
    expect(screen.getByText(/mangler et spil/i)).toBeInTheDocument();
    expect(joinLeagueByCode).not.toHaveBeenCalled();
  });

  it('viser fejl når indløsningen mislykkes', async () => {
    joinLeagueByCode.mockResolvedValue({ ok: false, error: 'Ingen liga fundet med den kode.' });
    renderAt('/tilmeld?spil=spil-7&kode=NOPE12');
    expect(await screen.findByText(/Ingen liga fundet/)).toBeInTheDocument();
  });
});
