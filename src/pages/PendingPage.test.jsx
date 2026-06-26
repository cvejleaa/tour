// Udtømmende tests for PendingPage — viser korrekt indhold pr. status og redirecter.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// ─── Mock Firebase ────────────────────────────────────────────────────────────
vi.mock('../firebase', () => ({
  auth: {},
  db: {},
}));

vi.mock('firebase/auth', () => ({
  signOut: vi.fn().mockResolvedValue(undefined),
}));

// ─── Mock useAuth ─────────────────────────────────────────────────────────────
const mockUseAuth = vi.fn();
vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

// ─── Mock react-router-dom navigate ──────────────────────────────────────────
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

// ─── Mock invitationskode-indløsning ─────────────────────────────────────────
const mockRedeem = vi.fn();
vi.mock('../features/auth/inviteActions', () => ({
  redeemInviteCode: (...args) => mockRedeem(...args),
}));

import PendingPage from './PendingPage';

function renderPendingPage() {
  return render(
    <MemoryRouter>
      <PendingPage />
    </MemoryRouter>
  );
}

describe('PendingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Loading-tilstand ─────────────────────────────────────────────────────

  it('viser indlæsningsindikator mens loading er true', () => {
    mockUseAuth.mockReturnValue({ user: null, status: 'pending', loading: true });
    renderPendingPage();
    expect(screen.getByText(/Indlæser/i)).toBeInTheDocument();
  });

  it('viser IKKE afventside-indhold under loading', () => {
    mockUseAuth.mockReturnValue({ user: null, status: 'pending', loading: true });
    renderPendingPage();
    expect(screen.queryByText(/Afventer godkendelse/i)).not.toBeInTheDocument();
  });

  // ─── Pending-status ───────────────────────────────────────────────────────

  it('viser Afventer godkendelse-overskrift for pending bruger', () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'abc' }, status: 'pending', loading: false });
    renderPendingPage();
    expect(screen.getByText(/Afventer godkendelse/i)).toBeInTheDocument();
  });

  it('viser administrator-besked for pending bruger', () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'abc' }, status: 'pending', loading: false });
    renderPendingPage();
    expect(screen.getAllByText(/administrator/i).length).toBeGreaterThan(0);
  });

  it('viser Hvad sker der nu-liste for pending bruger', () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'abc' }, status: 'pending', loading: false });
    renderPendingPage();
    expect(screen.getByText(/Hvad sker der nu/i)).toBeInTheDocument();
  });

  it('viser Log ud-knap for pending bruger', () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'abc' }, status: 'pending', loading: false });
    renderPendingPage();
    expect(screen.getByRole('button', { name: /Log ud/i })).toBeInTheDocument();
  });

  it('viser IKKE Adgang afvist for pending bruger', () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'abc' }, status: 'pending', loading: false });
    renderPendingPage();
    expect(screen.queryByText(/Adgang afvist/i)).not.toBeInTheDocument();
  });

  // ─── Rejected-status ──────────────────────────────────────────────────────

  it('viser Adgang afvist-overskrift for rejected bruger', () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'abc' }, status: 'rejected', loading: false });
    renderPendingPage();
    expect(screen.getByText(/Adgang afvist/i)).toBeInTheDocument();
  });

  it('viser afvist-statusbesked for rejected bruger', () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'abc' }, status: 'rejected', loading: false });
    renderPendingPage();
    expect(screen.getAllByText(/afvist/i).length).toBeGreaterThan(0);
  });

  it('viser Log ud-knap for rejected bruger', () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'abc' }, status: 'rejected', loading: false });
    renderPendingPage();
    expect(screen.getByRole('button', { name: /Log ud/i })).toBeInTheDocument();
  });

  it('viser IKKE Afventer godkendelse for rejected bruger', () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'abc' }, status: 'rejected', loading: false });
    renderPendingPage();
    expect(screen.queryByText(/Afventer godkendelse/i)).not.toBeInTheDocument();
  });

  it('viser kontaktoplysninger til turneringsarrangør for rejected bruger', () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'abc' }, status: 'rejected', loading: false });
    renderPendingPage();
    expect(screen.getByText(/turneringsarrangøren/i)).toBeInTheDocument();
  });

  // ─── Approved → redirect ──────────────────────────────────────────────────

  it('redirecter approved bruger til "/"', () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'abc' }, status: 'approved', loading: false });
    renderPendingPage();
    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
  });

  it('redirecter ikke-logget-ind bruger til /login', () => {
    mockUseAuth.mockReturnValue({ user: null, status: 'pending', loading: false });
    renderPendingPage();
    expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
  });

  it('redirecter IKKE pending bruger', () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'abc' }, status: 'pending', loading: false });
    renderPendingPage();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('redirecter IKKE rejected bruger', () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'abc' }, status: 'rejected', loading: false });
    renderPendingPage();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  // ─── Log ud-knap ──────────────────────────────────────────────────────────

  it('kalder signOut ved klik på Log ud for pending bruger', async () => {
    const { signOut } = await import('firebase/auth');
    mockUseAuth.mockReturnValue({ user: { uid: 'abc' }, status: 'pending', loading: false });
    renderPendingPage();

    fireEvent.click(screen.getByRole('button', { name: /Log ud/i }));

    await waitFor(() => {
      expect(signOut).toHaveBeenCalled();
    });
  });

  it('navigerer til /login efter log ud for pending bruger', async () => {
    const { signOut } = await import('firebase/auth');
    signOut.mockResolvedValue(undefined);

    mockUseAuth.mockReturnValue({ user: { uid: 'abc' }, status: 'pending', loading: false });
    renderPendingPage();

    fireEvent.click(screen.getByRole('button', { name: /Log ud/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
    });
  });

  it('kalder signOut ved klik på Log ud for rejected bruger', async () => {
    const { signOut } = await import('firebase/auth');
    mockUseAuth.mockReturnValue({ user: { uid: 'abc' }, status: 'rejected', loading: false });
    renderPendingPage();

    fireEvent.click(screen.getByRole('button', { name: /Log ud/i }));

    await waitFor(() => {
      expect(signOut).toHaveBeenCalled();
    });
  });

  // ─── Invitationskode (selvbetjent godkendelse) ────────────────────────────

  it('viser invitationskode-felt for pending bruger', () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'abc' }, status: 'pending', loading: false });
    renderPendingPage();
    expect(screen.getByLabelText(/invitationskode/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Indløs/i })).toBeInTheDocument();
  });

  it('viser IKKE invitationskode-felt for rejected bruger', () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'abc' }, status: 'rejected', loading: false });
    renderPendingPage();
    expect(screen.queryByRole('button', { name: /Indløs/i })).not.toBeInTheDocument();
  });

  it('indløser kode og navigerer til "/" ved succes', async () => {
    vi.useFakeTimers();
    mockRedeem.mockResolvedValue({ leagueId: 'lg1', leagueName: 'Vennernes liga' });
    mockUseAuth.mockReturnValue({ user: { uid: 'abc' }, status: 'pending', loading: false });
    renderPendingPage();

    fireEvent.change(screen.getByLabelText(/invitationskode/i), { target: { value: 'abc123' } });
    fireEvent.click(screen.getByRole('button', { name: /Indløs/i }));

    await vi.waitFor(() => expect(mockRedeem).toHaveBeenCalledWith('abc123'));
    await vi.waitFor(() => expect(screen.getByText(/Godkendt!/i)).toBeInTheDocument());

    await vi.advanceTimersByTimeAsync(1300);
    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
    vi.useRealTimers();
  });

  it('viser fejl når koden er ugyldig', async () => {
    mockRedeem.mockRejectedValue(new Error('Ugyldig invitationskode — tjek den og prøv igen.'));
    mockUseAuth.mockReturnValue({ user: { uid: 'abc' }, status: 'pending', loading: false });
    renderPendingPage();

    fireEvent.change(screen.getByLabelText(/invitationskode/i), { target: { value: 'WRONG1' } });
    fireEvent.click(screen.getByRole('button', { name: /Indløs/i }));

    await waitFor(() => expect(screen.getByText(/Ugyldig invitationskode/i)).toBeInTheDocument());
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
