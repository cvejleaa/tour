// Udtømmende tests for UsersTab — synlighed, brugerliste, godkend/afvis, rolle-toggle.
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
}));

import UsersTab from './UsersTab';

// Hjælper: konfigurer snapshot til at returnere en liste af brugere
function setupSnapshot(users) {
  mockOnSnapshot.mockImplementation((q, cb) => {
    cb({
      docs: users.map((u) => ({
        id: u.id,
        data: () => ({ ...u }),
      })),
    });
    return vi.fn(); // unsubscribe
  });
}

describe('UsersTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Standard: returnér tomt snapshot
    mockOnSnapshot.mockImplementation((q, cb) => {
      cb({ docs: [] });
      return vi.fn();
    });
  });

  // ─── Synlighed ────────────────────────────────────────────────────────────

  it('returnerer null for ikke-owner (isOwner=false)', () => {
    const { container } = render(<UsersTab isOwner={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renderer for owner (isOwner=true)', () => {
    render(<UsersTab isOwner={true} isGlobalAdmin={true} />);
    expect(screen.getByText(/Ingen brugere/i)).toBeInTheDocument();
  });

  // ─── Tom liste ────────────────────────────────────────────────────────────

  it('viser Ingen brugere-besked ved tom liste', () => {
    render(<UsersTab isOwner={true} isGlobalAdmin={true} />);
    expect(screen.getByText(/Ingen brugere registreret/i)).toBeInTheDocument();
  });

  // ─── Brugerliste med data ─────────────────────────────────────────────────

  it('viser brugerliste med pending-bruger øverst', () => {
    setupSnapshot([
      { id: 'u1', displayName: 'Anders', email: 'a@test.dk', status: 'approved', role: 'player' },
      { id: 'u2', displayName: 'Bent', email: 'b@test.dk', status: 'pending', role: 'player' },
    ]);
    render(<UsersTab isOwner={true} isGlobalAdmin={true} />);

    const items = screen.getAllByRole('listitem');
    // Bent (pending) skal komme før Anders (approved) i den sorterede liste
    expect(items[0]).toHaveTextContent('Bent');
    expect(items[1]).toHaveTextContent('Anders');
  });

  it('viser pending-advarsel når der er afventende brugere', () => {
    setupSnapshot([
      { id: 'u1', displayName: 'Bent', email: 'b@test.dk', status: 'pending', role: 'player' },
    ]);
    render(<UsersTab isOwner={true} isGlobalAdmin={true} />);
    expect(screen.getByText(/1 bruger afventer godkendelse/i)).toBeInTheDocument();
  });

  it('viser flertal i pending-advarsel ved flere afventende brugere', () => {
    setupSnapshot([
      { id: 'u1', displayName: 'A', email: 'a@test.dk', status: 'pending', role: 'player' },
      { id: 'u2', displayName: 'B', email: 'b@test.dk', status: 'pending', role: 'player' },
    ]);
    render(<UsersTab isOwner={true} isGlobalAdmin={true} />);
    expect(screen.getByText(/2 brugere afventer godkendelse/i)).toBeInTheDocument();
  });

  it('viser IKKE pending-advarsel når ingen afventer', () => {
    setupSnapshot([
      { id: 'u1', displayName: 'Anders', email: 'a@test.dk', status: 'approved', role: 'player' },
    ]);
    render(<UsersTab isOwner={true} isGlobalAdmin={true} />);
    expect(screen.queryByText(/afventer godkendelse/i)).not.toBeInTheDocument();
  });

  it('viser sorteret liste: pending, approved, rejected', () => {
    setupSnapshot([
      { id: 'u1', displayName: 'Rejected Bruger', email: 'r@test.dk', status: 'rejected', role: 'player' },
      { id: 'u2', displayName: 'Approved Bruger', email: 'a@test.dk', status: 'approved', role: 'player' },
      { id: 'u3', displayName: 'Pending Bruger', email: 'p@test.dk', status: 'pending', role: 'player' },
    ]);
    render(<UsersTab isOwner={true} isGlobalAdmin={true} />);

    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Pending Bruger');
    expect(items[1]).toHaveTextContent('Approved Bruger');
    expect(items[2]).toHaveTextContent('Rejected Bruger');
  });

  // ─── Godkend/afvis knapper ────────────────────────────────────────────────

  it('viser Godkend-knap for pending bruger', () => {
    setupSnapshot([
      { id: 'u1', displayName: 'Bent', email: 'b@test.dk', status: 'pending', role: 'player' },
    ]);
    render(<UsersTab isOwner={true} isGlobalAdmin={true} />);
    expect(screen.getByRole('button', { name: /Godkend/i })).toBeInTheDocument();
  });

  it('viser Afvis-knap for pending bruger', () => {
    setupSnapshot([
      { id: 'u1', displayName: 'Bent', email: 'b@test.dk', status: 'pending', role: 'player' },
    ]);
    render(<UsersTab isOwner={true} isGlobalAdmin={true} />);
    expect(screen.getByRole('button', { name: /Afvis/i })).toBeInTheDocument();
  });

  it('viser IKKE Godkend-knap for allerede godkendt bruger', () => {
    setupSnapshot([
      { id: 'u1', displayName: 'Anders', email: 'a@test.dk', status: 'approved', role: 'player' },
    ]);
    render(<UsersTab isOwner={true} isGlobalAdmin={true} />);
    expect(screen.queryByRole('button', { name: /Godkend/i })).not.toBeInTheDocument();
  });

  it('viser IKKE Afvis-knap for allerede afvist bruger', () => {
    setupSnapshot([
      { id: 'u1', displayName: 'Carla', email: 'c@test.dk', status: 'rejected', role: 'player' },
    ]);
    render(<UsersTab isOwner={true} isGlobalAdmin={true} />);
    expect(screen.queryByRole('button', { name: /Afvis/i })).not.toBeInTheDocument();
  });

  it('kalder updateDoc med approved ved klik på Godkend (bekræftet)', async () => {
    const { updateDoc } = await import('firebase/firestore');
    window.confirm = vi.fn(() => true);

    setupSnapshot([
      { id: 'u1', displayName: 'Bent', email: 'b@test.dk', status: 'pending', role: 'player' },
    ]);
    render(<UsersTab isOwner={true} isGlobalAdmin={true} />);

    fireEvent.click(screen.getByRole('button', { name: /Godkend/i }));

    await waitFor(() => {
      expect(updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        { status: 'approved' }
      );
    });
  });

  it('kalder updateDoc med rejected ved klik på Afvis (bekræftet)', async () => {
    const { updateDoc } = await import('firebase/firestore');
    window.confirm = vi.fn(() => true);

    setupSnapshot([
      { id: 'u1', displayName: 'Bent', email: 'b@test.dk', status: 'pending', role: 'player' },
    ]);
    render(<UsersTab isOwner={true} isGlobalAdmin={true} />);

    fireEvent.click(screen.getByRole('button', { name: /Afvis/i }));

    await waitFor(() => {
      expect(updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        { status: 'rejected' }
      );
    });
  });

  it('kalder IKKE updateDoc når bekræftelse afvises', async () => {
    const { updateDoc } = await import('firebase/firestore');
    window.confirm = vi.fn(() => false);

    setupSnapshot([
      { id: 'u1', displayName: 'Bent', email: 'b@test.dk', status: 'pending', role: 'player' },
    ]);
    render(<UsersTab isOwner={true} isGlobalAdmin={true} />);

    fireEvent.click(screen.getByRole('button', { name: /Godkend/i }));

    await waitFor(() => {
      expect(updateDoc).not.toHaveBeenCalled();
    });
  });

  // ─── Rolle-toggle ─────────────────────────────────────────────────────────

  it('viser Til global admin-knap for player-bruger', () => {
    setupSnapshot([
      { id: 'u1', displayName: 'Carla', email: 'c@test.dk', status: 'approved', role: 'player' },
    ]);
    render(<UsersTab isOwner={true} isGlobalAdmin={true} />);
    expect(screen.getByRole('button', { name: /Til global admin/i })).toBeInTheDocument();
  });

  it('viser Til spiller-knap for globalAdmin-bruger', () => {
    setupSnapshot([
      { id: 'u1', displayName: 'Dorte', email: 'd@test.dk', status: 'approved', role: 'globalAdmin' },
    ]);
    render(<UsersTab isOwner={true} isGlobalAdmin={true} />);
    expect(screen.getByRole('button', { name: /Til spiller/i })).toBeInTheDocument();
  });

  it('kalder updateDoc med ny rolle ved klik på rolle-toggle (bekræftet)', async () => {
    const { updateDoc } = await import('firebase/firestore');
    window.confirm = vi.fn(() => true);

    setupSnapshot([
      { id: 'u1', displayName: 'Carla', email: 'c@test.dk', status: 'approved', role: 'player' },
    ]);
    render(<UsersTab isOwner={true} isGlobalAdmin={true} />);

    fireEvent.click(screen.getByRole('button', { name: /Til global admin/i }));

    await waitFor(() => {
      expect(updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        { role: 'globalAdmin' }
      );
    });
  });

  it('viser IKKE handlingsknapper for owner-bruger (rollen er beskyttet)', () => {
    setupSnapshot([
      { id: 'u1', displayName: 'Ejer Person', email: 'ejer@test.dk', status: 'approved', role: 'owner' },
    ]);
    render(<UsersTab isOwner={true} isGlobalAdmin={true} />);
    // Owner-bruger skal have EJER-badge men ingen handlingsknapper
    expect(screen.queryByRole('button', { name: /Godkend/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Til global admin/i })).not.toBeInTheDocument();
  });

  // ─── Global admin (ikke ejer) ─────────────────────────────────────────────

  it('global admin (ikke ejer) kan godkende, men ser IKKE rolle-toggle', () => {
    setupSnapshot([
      { id: 'u1', displayName: 'Bent', email: 'b@test.dk', status: 'pending', role: 'player' },
    ]);
    render(<UsersTab isOwner={false} isGlobalAdmin={true} />);
    expect(screen.getByRole('button', { name: /Godkend/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Til global admin/i })).not.toBeInTheDocument();
  });

  it('returnerer null for almindelig spiller (hverken ejer eller global admin)', () => {
    const { container } = render(<UsersTab isOwner={false} isGlobalAdmin={false} />);
    expect(container.firstChild).toBeNull();
  });

  // ─── Fejlhåndtering ───────────────────────────────────────────────────────

  it('viser fejlbesked ved snapshot-fejl', () => {
    mockOnSnapshot.mockImplementation((q, onNext, onError) => {
      onError(new Error('Permission denied'));
      return vi.fn();
    });
    render(<UsersTab isOwner={true} isGlobalAdmin={true} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  // ─── Loading ──────────────────────────────────────────────────────────────

  it('viser indlæsningsbesked mens snapshot ikke er returneret', () => {
    mockOnSnapshot.mockImplementation(() => {
      // Kalder hverken onNext eller onError — simulerer loading
      return vi.fn();
    });
    render(<UsersTab isOwner={true} isGlobalAdmin={true} />);
    expect(screen.getByText(/Henter brugere/i)).toBeInTheDocument();
  });
});
