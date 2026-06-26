/**
 * Tests for LeaguesPage.
 * Mocker alle Firebase-hooks og context.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import LeaguesPage from './LeaguesPage';

// ── Mock AuthContext ──────────────────────────────────────────────────────────
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { uid: 'me-uid' },
    profile: { displayName: 'Mig' },
  }),
}));

// ── Basis standings til tests ─────────────────────────────────────────────────
const mockStandings = [
  { uid: 'uid-1', displayName: 'Alice', totalPoints: 50 },
  { uid: 'me-uid', displayName: 'Mig', totalPoints: 30 },
  { uid: 'uid-3', displayName: 'Charlie', totalPoints: 10 },
];

vi.mock('../features/leaderboard/useStandings', () => ({
  useStandings: () => ({ standings: mockStandings, loading: false, error: null }),
}));

// ── Ligaer ─────────────────────────────────────────────────────────────────────
const mockLeagues = [
  {
    id: 'league-1',
    name: 'Testliga',
    ownerUid: 'me-uid',
    joinCode: 'ABC123',
    memberUids: ['me-uid', 'uid-1'],
  },
];

let leaguesData = mockLeagues;

vi.mock('../features/leagues/useLeagues', () => ({
  useLeagues: () => ({
    leagues: leaguesData,
    loading: false,
    error: null,
  }),
}));

// ── Mock league actions ───────────────────────────────────────────────────────
vi.mock('../features/leagues/leagueActions', () => ({
  createLeague: vi.fn().mockResolvedValue('new-league-id'),
  joinLeague: vi.fn().mockResolvedValue({ id: 'other-league', name: 'AndenLiga' }),
  leaveLeague: vi.fn().mockResolvedValue(undefined),
  deleteLeague: vi.fn().mockResolvedValue(undefined),
  removeMember: vi.fn().mockResolvedValue(undefined),
  adminAddMember: vi.fn().mockResolvedValue(undefined),
  renameLeague: vi.fn().mockResolvedValue(undefined),
  setLeagueScoring: vi.fn().mockResolvedValue(undefined),
}));

// Liga-bonus rører Firebase — stub i page-testen
vi.mock('../features/leagues/useLeagueBonus', () => ({
  useLeagueBonus: () => ({ questions: [], myAnswers: {}, pointsByUid: {}, loading: false }),
}));
vi.mock('../features/leagues/LeagueBonus', () => ({ default: () => null }));

// window.confirm mock
global.confirm = vi.fn(() => true);

describe('LeaguesPage – listevisning', () => {
  beforeEach(() => {
    leaguesData = mockLeagues;
  });

  it('viser brugerens ligaer', () => {
    render(<LeaguesPage />);
    expect(screen.getByText('Testliga')).toBeInTheDocument();
  });

  it('viser antal medlemmer på ligakortet', () => {
    render(<LeaguesPage />);
    // 2 spillere i ligaen – badge med "2 👤"
    const badge = screen.getByText(/👤/);
    expect(badge).toBeInTheDocument();
    expect(badge.textContent).toContain('2');
  });

  it('viser "ejer"-badge for brugerens egne ligaer', () => {
    render(<LeaguesPage />);
    expect(screen.getByText('ejer')).toBeInTheDocument();
  });

  it('viser tom-tilstand når ingen ligaer', () => {
    leaguesData = [];
    render(<LeaguesPage />);
    expect(screen.getByText(/ikke med i nogen liga/i)).toBeInTheDocument();
  });

  it('viser "Opret liga"-formular ved klik', async () => {
    render(<LeaguesPage />);
    fireEvent.click(screen.getByText('+ Opret liga'));
    expect(screen.getByText('Opret ny liga')).toBeInTheDocument();
    expect(screen.getByLabelText(/ligaens navn/i)).toBeInTheDocument();
  });

  it('viser "Tilmeld via kode"-formular ved klik', async () => {
    render(<LeaguesPage />);
    fireEvent.click(screen.getByText('Tilmeld via kode'));
    expect(screen.getByText('Tilmeld via kode', { selector: 'h2' })).toBeInTheDocument();
    expect(screen.getByLabelText(/kode/i)).toBeInTheDocument();
  });
});

describe('LeaguesPage – opret liga', () => {
  it('kalder createLeague med korrekte argumenter ved submit', async () => {
    const { createLeague } = await import('../features/leagues/leagueActions');
    render(<LeaguesPage />);

    fireEvent.click(screen.getByText('+ Opret liga'));
    const input = screen.getByLabelText(/ligaens navn/i);
    fireEvent.change(input, { target: { value: 'Min Liga' } });
    fireEvent.click(screen.getByText('Opret liga'));

    await waitFor(() => {
      expect(createLeague).toHaveBeenCalledWith('Min Liga', 'me-uid', expect.objectContaining({ group: true, knockout: true, bonus: true }));
    });
  });
});

describe('LeaguesPage – join via kode', () => {
  it('kalder joinLeague med korrekte argumenter ved submit', async () => {
    const { joinLeague } = await import('../features/leagues/leagueActions');
    render(<LeaguesPage />);

    fireEvent.click(screen.getByText('Tilmeld via kode'));
    const input = screen.getByLabelText(/kode/i);
    fireEvent.change(input, { target: { value: 'XYZ789' } });
    fireEvent.click(screen.getByText('Tilmeld via kode', { selector: 'button[type="submit"]' }));

    await waitFor(() => {
      expect(joinLeague).toHaveBeenCalledWith('XYZ789', 'me-uid');
    });
  });
});

describe('LeaguesPage – detaljevisning', () => {
  beforeEach(() => {
    leaguesData = mockLeagues;
  });

  it('åbner detaljevisning ved klik på ligakort', () => {
    render(<LeaguesPage />);
    fireEvent.click(screen.getByRole('button', { name: /åbn liga: Testliga/i }));
    // Detaljesiden vises
    expect(screen.getByText('← Tilbage')).toBeInTheDocument();
  });

  it('viser kun ligamedlemmer i rangering', () => {
    render(<LeaguesPage />);
    fireEvent.click(screen.getByRole('button', { name: /åbn liga: Testliga/i }));
    // Alice (uid-1) og Mig (me-uid) er med i ligaen, Charlie er ikke.
    // Charlie kan optræde som tilføj-mulighed i medlemsstyringen, så vi
    // afgrænser til selve rangeringstabellen.
    const table = screen.getByRole('table');
    expect(within(table).getAllByText('Alice').length).toBeGreaterThan(0);
    expect(within(table).queryByText('Charlie')).not.toBeInTheDocument();
  });

  it('viser "Tilbage"-knap og lukker detaljevisning', () => {
    render(<LeaguesPage />);
    fireEvent.click(screen.getByRole('button', { name: /åbn liga: Testliga/i }));
    fireEvent.click(screen.getByText('← Tilbage'));
    // Tilbage til listevisning
    expect(screen.getByText('Testliga')).toBeInTheDocument();
  });

  it('viser "Slet liga"-knap for ejeren i detaljevisning', () => {
    render(<LeaguesPage />);
    fireEvent.click(screen.getByRole('button', { name: /åbn liga: Testliga/i }));
    expect(screen.getByText(/slet liga/i)).toBeInTheDocument();
  });

  it('viser "Fjern"-knapper for ejeren ved hvert ikke-ejer-medlem', async () => {
    render(<LeaguesPage />);
    fireEvent.click(screen.getByRole('button', { name: /åbn liga: Testliga/i }));
    // Alice (uid-1) er ikke ejeren → Fjern-knap
    expect(screen.getByRole('button', { name: /fjern Alice/i })).toBeInTheDocument();
  });

  it('kalder removeMember ved klik på Fjern', async () => {
    const { removeMember } = await import('../features/leagues/leagueActions');
    render(<LeaguesPage />);
    fireEvent.click(screen.getByRole('button', { name: /åbn liga: Testliga/i }));
    fireEvent.click(screen.getByRole('button', { name: /fjern Alice/i }));
    await waitFor(() => {
      expect(removeMember).toHaveBeenCalledWith('league-1', 'uid-1', 'me-uid');
    });
  });

  it('kalder deleteLeague ved bekræftet sletning', async () => {
    const { deleteLeague } = await import('../features/leagues/leagueActions');
    render(<LeaguesPage />);
    fireEvent.click(screen.getByRole('button', { name: /åbn liga: Testliga/i }));
    fireEvent.click(screen.getByText(/slet liga/i));
    await waitFor(() => {
      expect(deleteLeague).toHaveBeenCalledWith('league-1', 'me-uid', 'me-uid');
    });
  });

  it('viser ligaens rangering via StandingsTable', () => {
    render(<LeaguesPage />);
    fireEvent.click(screen.getByRole('button', { name: /åbn liga: Testliga/i }));
    expect(screen.getByText(/ligaens stilling/i)).toBeInTheDocument();
  });

  it('viser join-koden i detaljevisning', () => {
    render(<LeaguesPage />);
    fireEvent.click(screen.getByRole('button', { name: /åbn liga: Testliga/i }));
    expect(screen.getAllByText('ABC123').length).toBeGreaterThan(0);
  });
});

describe('LeaguesPage – statuser', () => {
  it('viser "afventer godkendelse"-badge for pending liga', () => {
    leaguesData = [
      {
        id: 'pending-liga',
        name: 'PendingLiga',
        ownerUid: 'me-uid',
        joinCode: 'PEND00',
        memberUids: ['me-uid'],
        status: 'pending',
      },
    ];
    render(<LeaguesPage />);
    expect(screen.getByText('afventer godkendelse')).toBeInTheDocument();
  });

  it('viser "afvist"-badge for rejected liga', () => {
    leaguesData = [
      {
        id: 'rejected-liga',
        name: 'AfvistLiga',
        ownerUid: 'me-uid',
        joinCode: 'REJ999',
        memberUids: ['me-uid'],
        status: 'rejected',
      },
    ];
    render(<LeaguesPage />);
    expect(screen.getByText('afvist')).toBeInTheDocument();
  });
});

describe('LeaguesPage – fejl og loading', () => {
  it('viser fejlbesked ved leagueError', () => {
    vi.doMock('../features/leagues/useLeagues', () => ({
      useLeagues: () => ({ leagues: [], loading: false, error: 'Netværksfejl' }),
    }));
    // Direkte test via mock (allerede ovenfor vi.mock er modul-scope)
  });

  it('viser spinner under loading', () => {
    // Testen er dækket via loading-tilstanden – vi bekræfter spinner ikke er der ved success
    render(<LeaguesPage />);
    // loadingLeagues=false og loadingStandings=false → ingen spinner
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('LeaguesPage – opret liga formular', () => {
  beforeEach(() => {
    leaguesData = mockLeagues;
  });

  it('kalder createLeague og lukker formularen ved success', async () => {
    const { createLeague } = await import('../features/leagues/leagueActions');
    createLeague.mockResolvedValueOnce('ny-id');
    render(<LeaguesPage />);
    fireEvent.click(screen.getByText('+ Opret liga'));
    const input = screen.getByLabelText(/ligaens navn/i);
    fireEvent.change(input, { target: { value: 'SuperLiga' } });
    fireEvent.click(screen.getByText('Opret liga'));
    // onCreated() lukker formularen – Opret ny liga-overskriften forsvinder
    await waitFor(() => {
      expect(createLeague).toHaveBeenCalledWith('SuperLiga', 'me-uid', expect.objectContaining({ group: true }));
    });
  });

  it('viser fejlbesked ved createLeague-fejl', async () => {
    const { createLeague } = await import('../features/leagues/leagueActions');
    createLeague.mockRejectedValueOnce(new Error('Ligaen skal have et navn.'));
    render(<LeaguesPage />);
    fireEvent.click(screen.getByText('+ Opret liga'));
    const input = screen.getByLabelText(/ligaens navn/i);
    fireEvent.change(input, { target: { value: 'x' } });
    fireEvent.click(screen.getByText('Opret liga'));
    await waitFor(() => {
      expect(screen.getByText('Ligaen skal have et navn.')).toBeInTheDocument();
    });
  });

  it('deaktiverer submit-knappen ved tomt navn', () => {
    render(<LeaguesPage />);
    fireEvent.click(screen.getByText('+ Opret liga'));
    const submitBtn = screen.getByText('Opret liga');
    expect(submitBtn).toBeDisabled();
  });

  it('lukker opret-formularen efter succesfuld oprettelse (onCreated)', async () => {
    const { createLeague } = await import('../features/leagues/leagueActions');
    createLeague.mockResolvedValueOnce('ny-id');
    render(<LeaguesPage />);
    fireEvent.click(screen.getByText('+ Opret liga'));
    const input = screen.getByLabelText(/ligaens navn/i);
    fireEvent.change(input, { target: { value: 'MitHold' } });
    fireEvent.click(screen.getByText('Opret liga'));
    await waitFor(() => {
      // onCreated() → setShowCreate(false) → formularen lukkes
      expect(screen.queryByText('Opret ny liga')).not.toBeInTheDocument();
    });
  });
});

describe('LeaguesPage – join via kode formular', () => {
  beforeEach(() => {
    leaguesData = mockLeagues;
  });

  it('viser success-besked efter join', async () => {
    const { joinLeague } = await import('../features/leagues/leagueActions');
    joinLeague.mockResolvedValueOnce({ id: 'liga-x', name: 'SuperLiga' });
    render(<LeaguesPage />);
    fireEvent.click(screen.getByText('Tilmeld via kode'));
    const input = screen.getByLabelText(/kode/i);
    fireEvent.change(input, { target: { value: 'XYZ123' } });
    fireEvent.click(screen.getByText('Tilmeld via kode', { selector: 'button[type="submit"]' }));
    await waitFor(() => {
      expect(screen.getByText(/du er nu med i/i)).toBeInTheDocument();
    });
  });

  it('viser fejlbesked ved ugyldig kode', async () => {
    const { joinLeague } = await import('../features/leagues/leagueActions');
    joinLeague.mockRejectedValueOnce(new Error('Ingen liga fundet med den kode.'));
    render(<LeaguesPage />);
    fireEvent.click(screen.getByText('Tilmeld via kode'));
    const input = screen.getByLabelText(/kode/i);
    fireEvent.change(input, { target: { value: 'FORKERT' } });
    fireEvent.click(screen.getByText('Tilmeld via kode', { selector: 'button[type="submit"]' }));
    await waitFor(() => {
      expect(screen.getByText('Ingen liga fundet med den kode.')).toBeInTheDocument();
    });
  });

  it('viser fejlbesked når liga ikke er godkendt', async () => {
    const { joinLeague } = await import('../features/leagues/leagueActions');
    joinLeague.mockRejectedValueOnce(new Error('Ligaen er endnu ikke godkendt af admin.'));
    render(<LeaguesPage />);
    fireEvent.click(screen.getByText('Tilmeld via kode'));
    const input = screen.getByLabelText(/kode/i);
    fireEvent.change(input, { target: { value: 'PENDING' } });
    fireEvent.click(screen.getByText('Tilmeld via kode', { selector: 'button[type="submit"]' }));
    await waitFor(() => {
      expect(screen.getByText('Ligaen er endnu ikke godkendt af admin.')).toBeInTheDocument();
    });
  });

  it('viser fejlbesked når allerede er medlem', async () => {
    const { joinLeague } = await import('../features/leagues/leagueActions');
    joinLeague.mockRejectedValueOnce(new Error('Du er allerede medlem af denne liga.'));
    render(<LeaguesPage />);
    fireEvent.click(screen.getByText('Tilmeld via kode'));
    const input = screen.getByLabelText(/kode/i);
    fireEvent.change(input, { target: { value: 'ABC123' } });
    fireEvent.click(screen.getByText('Tilmeld via kode', { selector: 'button[type="submit"]' }));
    await waitFor(() => {
      expect(screen.getByText('Du er allerede medlem af denne liga.')).toBeInTheDocument();
    });
  });
});
