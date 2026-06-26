// Tests for LeaguesAdminTab — ligaliste, status-badges, godkend/afvis, tilmeld/fjern.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ─── Mock Firebase ────────────────────────────────────────────────────────────
vi.mock('../../firebase', () => ({
  db: {},
}));

const mockOnSnapshot = vi.fn();

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  onSnapshot: (...args) => mockOnSnapshot(...args),
  orderBy: vi.fn(),
  query: vi.fn(),
  doc: vi.fn(() => ({ id: 'doc-ref' })),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  arrayUnion: vi.fn((v) => ({ _arrayUnion: v })),
  arrayRemove: vi.fn((v) => ({ _arrayRemove: v })),
  where: vi.fn(),
}));

// ─── Mock leagueActions ───────────────────────────────────────────────────────
const mockSetLeagueStatus = vi.fn();
const mockAdminAddMember = vi.fn();
const mockRemoveMember = vi.fn();
const mockRenameLeague = vi.fn();
const mockSetLeagueAdmin = vi.fn();

vi.mock('../leagues/leagueActions', () => ({
  setLeagueStatus: (...args) => mockSetLeagueStatus(...args),
  adminAddMember: (...args) => mockAdminAddMember(...args),
  removeMember: (...args) => mockRemoveMember(...args),
  renameLeague: (...args) => mockRenameLeague(...args),
  setLeagueAdmin: (...args) => mockSetLeagueAdmin(...args),
}));

// Som standard er testbrugeren global ejer (kan tildele liga-admins)
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ isOwner: true }),
}));

import LeaguesAdminTab from './LeaguesAdminTab';

const pendingLeague = {
  id: 'league-1',
  name: 'Vennenes Liga',
  ownerUid: 'user-1',
  joinCode: 'ABCD12',
  status: 'pending',
  memberUids: ['user-1'],
};

const approvedLeague = {
  id: 'league-2',
  name: 'Godkendt Liga',
  ownerUid: 'user-2',
  joinCode: 'XY1234',
  status: 'approved',
  memberUids: ['user-2', 'user-3'],
};

const rejectedLeague = {
  id: 'league-3',
  name: 'Afvist Liga',
  ownerUid: 'user-4',
  joinCode: 'ZZ9999',
  status: 'rejected',
  memberUids: ['user-4'],
};

const approvedUsers = [
  { id: 'user-1', displayName: 'Anders', email: 'a@test.dk', status: 'approved' },
  { id: 'user-2', displayName: 'Bent', email: 'b@test.dk', status: 'approved' },
  { id: 'user-3', displayName: 'Carla', email: 'c@test.dk', status: 'approved' },
  { id: 'user-4', displayName: 'Dorte', email: 'd@test.dk', status: 'approved' },
];

// Setup: første snapshot = ligaer, andet snapshot = brugere
function setupData(leagues, users = approvedUsers) {
  let callCount = 0;
  mockOnSnapshot.mockImplementation((q, cb) => {
    callCount++;
    if (callCount === 1) {
      cb({ docs: leagues.map((l) => ({ id: l.id, data: () => ({ ...l }) })) });
    } else {
      cb({ docs: users.map((u) => ({ id: u.id, data: () => ({ ...u }) })) });
    }
    return vi.fn();
  });
}

describe('LeaguesAdminTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSetLeagueStatus.mockResolvedValue(undefined);
    mockAdminAddMember.mockResolvedValue(undefined);
    mockRemoveMember.mockResolvedValue(undefined);
    window.alert = vi.fn();

    // Standard: ingen ligaer
    mockOnSnapshot.mockImplementation((q, cb) => {
      cb({ docs: [] });
      return vi.fn();
    });
  });

  // ─── Loading ──────────────────────────────────────────────────────────────

  it('viser indlæsningsbesked under hentning', () => {
    mockOnSnapshot.mockImplementation(() => vi.fn());
    render(<LeaguesAdminTab />);
    expect(screen.getByText(/Henter ligaer/i)).toBeInTheDocument();
  });

  // ─── Tom liste ────────────────────────────────────────────────────────────

  it('viser Ingen ligaer-besked ved tom liste', () => {
    render(<LeaguesAdminTab />);
    expect(screen.getByText(/Ingen ligaer oprettet/i)).toBeInTheDocument();
  });

  // ─── Ligaliste ────────────────────────────────────────────────────────────

  it('viser lignavn', () => {
    setupData([pendingLeague]);
    render(<LeaguesAdminTab />);
    expect(screen.getByText('Vennenes Liga')).toBeInTheDocument();
  });

  it('viser join-kode', () => {
    setupData([pendingLeague]);
    render(<LeaguesAdminTab />);
    expect(screen.getByText('ABCD12')).toBeInTheDocument();
  });

  it('viser antal medlemmer', () => {
    setupData([pendingLeague]);
    render(<LeaguesAdminTab />);
    expect(screen.getByText(/1 medlem\b/)).toBeInTheDocument();
  });

  it('viser flertals-form for antal medlemmer', () => {
    setupData([approvedLeague]);
    render(<LeaguesAdminTab />);
    expect(screen.getByText(/2 medlemmer/)).toBeInTheDocument();
  });

  // ─── Status-badges ────────────────────────────────────────────────────────

  it('viser Afventer-badge for pending liga', () => {
    setupData([pendingLeague]);
    render(<LeaguesAdminTab />);
    expect(screen.getByText('Afventer')).toBeInTheDocument();
  });

  it('viser Godkendt-badge for approved liga', () => {
    setupData([approvedLeague]);
    render(<LeaguesAdminTab />);
    expect(screen.getByText('Godkendt')).toBeInTheDocument();
  });

  it('viser Afvist-badge for rejected liga', () => {
    setupData([rejectedLeague]);
    render(<LeaguesAdminTab />);
    expect(screen.getByText('Afvist')).toBeInTheDocument();
  });

  // ─── Godkend / afvis knapper ──────────────────────────────────────────────

  it('viser Godkend-knap for pending liga', () => {
    setupData([pendingLeague]);
    render(<LeaguesAdminTab />);
    expect(screen.getByRole('button', { name: /✓ Godkend/i })).toBeInTheDocument();
  });

  it('viser Afvis-knap for pending liga', () => {
    setupData([pendingLeague]);
    render(<LeaguesAdminTab />);
    expect(screen.getByRole('button', { name: 'Afvis' })).toBeInTheDocument();
  });

  it('viser IKKE Godkend-knap for allerede godkendt liga', () => {
    setupData([approvedLeague]);
    render(<LeaguesAdminTab />);
    expect(screen.queryByRole('button', { name: /✓ Godkend/i })).not.toBeInTheDocument();
  });

  it('viser IKKE Afvis-knap for allerede afvist liga', () => {
    setupData([rejectedLeague]);
    render(<LeaguesAdminTab />);
    expect(screen.queryByRole('button', { name: 'Afvis' })).not.toBeInTheDocument();
  });

  it('kan omdøbe en liga via blyant-knappen', async () => {
    setupData([pendingLeague]);
    render(<LeaguesAdminTab />);

    // Åbn redigering
    fireEvent.click(screen.getByTestId('rename-btn-league-1'));
    const input = screen.getByTestId('rename-input-league-1');
    expect(input).toHaveValue('Vennenes Liga');

    fireEvent.change(input, { target: { value: 'Nyt Liganavn' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gem' }));

    await waitFor(() => {
      expect(mockRenameLeague).toHaveBeenCalledWith('league-1', 'Nyt Liganavn');
    });
  });

  it('kalder setLeagueStatus med approved ved klik på Godkend', async () => {
    setupData([pendingLeague]);
    render(<LeaguesAdminTab />);
    fireEvent.click(screen.getByRole('button', { name: /✓ Godkend/i }));

    await waitFor(() => {
      expect(mockSetLeagueStatus).toHaveBeenCalledWith('league-1', 'approved');
    });
  });

  it('kalder setLeagueStatus med rejected ved klik på Afvis', async () => {
    setupData([pendingLeague]);
    render(<LeaguesAdminTab />);
    fireEvent.click(screen.getByRole('button', { name: /Afvis/i }));

    await waitFor(() => {
      expect(mockSetLeagueStatus).toHaveBeenCalledWith('league-1', 'rejected');
    });
  });

  // ─── Tilmeld medlem ───────────────────────────────────────────────────────

  it('viser Tilmeld medlem-knap', () => {
    setupData([approvedLeague]);
    render(<LeaguesAdminTab />);
    expect(screen.getByRole('button', { name: /Tilmeld medlem/i })).toBeInTheDocument();
  });

  it('kalder adminAddMember med korrekte argumenter', async () => {
    setupData([approvedLeague], [
      { id: 'user-5', displayName: 'Emil', email: 'e@test.dk', status: 'approved' },
      ...approvedUsers,
    ]);
    render(<LeaguesAdminTab />);

    // Vælg ny spiller fra dropdown
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'user-5' } });
    fireEvent.click(screen.getByRole('button', { name: /Tilmeld medlem/i }));

    await waitFor(() => {
      expect(mockAdminAddMember).toHaveBeenCalledWith('league-2', 'user-5');
    });
  });

  it('Tilmeld-knap er deaktiveret når ingen spiller er valgt', () => {
    setupData([approvedLeague]);
    render(<LeaguesAdminTab />);
    expect(screen.getByRole('button', { name: /Tilmeld medlem/i })).toBeDisabled();
  });

  // ─── Fjern medlem ─────────────────────────────────────────────────────────

  it('viser Fjern-knap for ikke-ejer-medlemmer', () => {
    setupData([approvedLeague]);
    render(<LeaguesAdminTab />);
    // user-3 (Carla) er ikke ejer af league-2 (ejer er user-2)
    const fjernKnapper = screen.getAllByTitle(/Fjern medlem/i);
    expect(fjernKnapper.length).toBeGreaterThan(0);
  });

  it('viser IKKE Fjern-knap for ligaens ejer', () => {
    setupData([{ ...approvedLeague, memberUids: ['user-2'] }]);
    render(<LeaguesAdminTab />);
    // Kun ejeren i listen — ingen fjern-knap
    expect(screen.queryByTitle(/Fjern medlem/i)).not.toBeInTheDocument();
  });

  it('kalder removeMember ved klik på Fjern', async () => {
    setupData([approvedLeague]);
    render(<LeaguesAdminTab />);
    const fjernKnapper = screen.getAllByTitle(/Fjern medlem/i);
    fireEvent.click(fjernKnapper[0]);

    await waitFor(() => {
      expect(mockRemoveMember).toHaveBeenCalled();
    });
  });

  // ─── Ejer-navn ────────────────────────────────────────────────────────────

  it('viser ejerens displayName', () => {
    setupData([pendingLeague]);
    render(<LeaguesAdminTab />);
    // user-1 = Anders
    expect(screen.getByText(/Ejer: Anders/i)).toBeInTheDocument();
  });

  it('viser (ejer)-label for ejeren i medlemslisten', () => {
    setupData([approvedLeague]);
    render(<LeaguesAdminTab />);
    expect(screen.getByText(/\(ejer\)/i)).toBeInTheDocument();
  });

  // ─── Fejlhåndtering ───────────────────────────────────────────────────────

  it('viser fejlbesked ved snapshot-fejl', () => {
    mockOnSnapshot.mockImplementation((q, onNext, onError) => {
      onError(new Error('Permission denied'));
      return vi.fn();
    });
    render(<LeaguesAdminTab />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
