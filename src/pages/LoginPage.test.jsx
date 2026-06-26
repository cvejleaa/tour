// Udtømmende tests for LoginPage — faneskift, login, signup, glemt adgangskode, fejlkoder.
// Firebase og AuthContext mockes — ingen netværk.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// ─── Mock Firebase ────────────────────────────────────────────────────────────
vi.mock('../firebase', () => ({
  auth: {},
  db: {},
}));

vi.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  updateProfile: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  setDoc: vi.fn(),
  serverTimestamp: vi.fn(() => ({ _serverTimestamp: true })),
}));

// ─── Mock useAuth ─────────────────────────────────────────────────────────────
const mockUseAuth = vi.fn();
vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

// ─── Mock useAuthActions ──────────────────────────────────────────────────────
const mockLogin = vi.fn();
const mockSignup = vi.fn();
const mockResetPassword = vi.fn();
const mockClearError = vi.fn();

let mockError = '';
let mockLoading = false;

vi.mock('../features/auth/useAuthActions', () => ({
  useAuthActions: () => ({
    loading: mockLoading,
    error: mockError,
    clearError: mockClearError,
    signup: mockSignup,
    login: mockLogin,
    resetPassword: mockResetPassword,
  }),
}));

// ─── Mock react-router-dom navigate ──────────────────────────────────────────
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

import LoginPage from './LoginPage';

function renderLoginPage() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>
  );
}

function getTabButton(label) {
  return screen.getAllByRole('button', { name: label }).find(
    (btn) => !btn.getAttribute('type') || btn.getAttribute('type') === 'button'
  );
}

function getSubmitButton(label) {
  return screen.getAllByRole('button', { name: label }).find(
    (btn) => btn.getAttribute('type') === 'submit'
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockError = '';
    mockLoading = false;
    mockUseAuth.mockReturnValue({ user: null, isApproved: false, status: 'pending' });
  });

  // ─── Grundlæggende rendering ──────────────────────────────────────────────

  it('viser Tour de France Tip-overskrift', () => {
    renderLoginPage();
    expect(screen.getByText(/Tour de France Tip/i)).toBeInTheDocument();
  });

  it('viser tagline om Danmarks bedste cykel-tippekonkurrence', () => {
    renderLoginPage();
    expect(screen.getByText(/Danmarks bedste/i)).toBeInTheDocument();
  });

  it('viser Log ind-fane som standard', () => {
    renderLoginPage();
    expect(screen.getAllByText('Log ind').length).toBeGreaterThan(0);
  });

  it('viser Opret bruger-fane', () => {
    renderLoginPage();
    expect(screen.getAllByText('Opret bruger').length).toBeGreaterThan(0);
  });

  // ─── Login-formular ───────────────────────────────────────────────────────

  it('viser e-mail og adgangskode-felt i login-tilstand', () => {
    renderLoginPage();
    expect(screen.getByPlaceholderText('din@email.dk')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument();
  });

  it('viser Glemt adgangskode-knap i login-fane', () => {
    renderLoginPage();
    expect(screen.getByText(/Glemt adgangskode/i)).toBeInTheDocument();
  });

  it('kalder login med korrekte data ved indsendelse', async () => {
    mockLogin.mockResolvedValue({ user: { uid: '123' } });
    renderLoginPage();

    fireEvent.change(screen.getByPlaceholderText('din@email.dk'), {
      target: { value: 'test@test.dk' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'password123' },
    });

    fireEvent.click(getSubmitButton('Log ind'));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('test@test.dk', 'password123');
    });
  });

  it('viser login-knappen som deaktiveret under loading', () => {
    mockLoading = true;
    renderLoginPage();
    const btn = screen.getByRole('button', { name: /Logger ind/i });
    expect(btn).toBeDisabled();
  });

  it('viser teksten "Logger ind…" under loading', () => {
    mockLoading = true;
    renderLoginPage();
    expect(screen.getByText(/Logger ind/i)).toBeInTheDocument();
  });

  // ─── Faneskift ────────────────────────────────────────────────────────────

  it('skifter til Opret bruger-formular ved klik på fane', () => {
    renderLoginPage();
    fireEvent.click(getTabButton('Opret bruger'));
    expect(screen.getByLabelText(/Visningsnavn/i)).toBeInTheDocument();
  });

  it('skjuler login-formular efter faneskift til Opret bruger', () => {
    renderLoginPage();
    fireEvent.click(getTabButton('Opret bruger'));
    expect(screen.queryByPlaceholderText('••••••••')).not.toBeInTheDocument();
  });

  it('kalder clearError ved faneskift', () => {
    renderLoginPage();
    fireEvent.click(getTabButton('Opret bruger'));
    expect(mockClearError).toHaveBeenCalled();
  });

  it('skifter tilbage til login-fane fra opret-fane', () => {
    renderLoginPage();
    fireEvent.click(getTabButton('Opret bruger'));
    fireEvent.click(getTabButton('Log ind'));
    expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument();
  });

  // ─── Glemt adgangskode ────────────────────────────────────────────────────

  it('viser nulstillingsformular ved klik på Glemt adgangskode', () => {
    renderLoginPage();
    fireEvent.click(screen.getByText(/Glemt adgangskode/i));
    expect(screen.getByText(/Send nulstillingslink/i)).toBeInTheDocument();
  });

  it('viser vejledende tekst i nulstillingsformularen', () => {
    renderLoginPage();
    fireEvent.click(screen.getByText(/Glemt adgangskode/i));
    expect(screen.getByText(/Indtast din e-mail/i)).toBeInTheDocument();
  });

  it('viser fejl ved tom e-mail i nulstillingsformular', async () => {
    renderLoginPage();
    fireEvent.click(screen.getByText(/Glemt adgangskode/i));
    fireEvent.click(getSubmitButton('Send nulstillingslink'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/e-mail/i);
    });
  });

  it('kalder resetPassword med e-mail ved indsendelse', async () => {
    mockResetPassword.mockResolvedValue(true);
    renderLoginPage();

    fireEvent.click(screen.getByText(/Glemt adgangskode/i));
    fireEvent.change(screen.getByPlaceholderText('din@email.dk'), {
      target: { value: 'bruger@test.dk' },
    });
    fireEvent.click(getSubmitButton('Send nulstillingslink'));

    await waitFor(() => {
      expect(mockResetPassword).toHaveBeenCalledWith('bruger@test.dk');
    });
  });

  it('viser succesbesked efter vellykket nulstilling', async () => {
    mockResetPassword.mockResolvedValue(true);
    renderLoginPage();

    fireEvent.click(screen.getByText(/Glemt adgangskode/i));
    fireEvent.change(screen.getByPlaceholderText('din@email.dk'), {
      target: { value: 'bruger@test.dk' },
    });
    fireEvent.click(getSubmitButton('Send nulstillingslink'));

    await waitFor(() => {
      expect(screen.getByText(/nulstilling/i)).toBeInTheDocument();
    });
  });

  it('viser Tilbage til login-knap i nulstillingsformular', () => {
    renderLoginPage();
    fireEvent.click(screen.getByText(/Glemt adgangskode/i));
    expect(screen.getByText(/Tilbage til login/i)).toBeInTheDocument();
  });

  it('skifter tilbage til login ved klik på Tilbage til login', () => {
    renderLoginPage();
    fireEvent.click(screen.getByText(/Glemt adgangskode/i));
    fireEvent.click(screen.getByText(/Tilbage til login/i));
    expect(screen.queryByText(/Send nulstillingslink/i)).not.toBeInTheDocument();
  });

  // ─── Opret bruger-formular — validering ──────────────────────────────────

  it('viser fejl ved tomt visningsnavn ved signup', async () => {
    renderLoginPage();
    fireEvent.click(getTabButton('Opret bruger'));
    fireEvent.click(getSubmitButton('Opret bruger'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/visningsnavn/i);
    });
  });

  it('viser fejl når visningsnavn er for kort (1 tegn)', async () => {
    renderLoginPage();
    fireEvent.click(getTabButton('Opret bruger'));

    fireEvent.change(screen.getByLabelText(/Visningsnavn/i), {
      target: { value: 'A' },
    });
    fireEvent.click(getSubmitButton('Opret bruger'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/mindst 2 tegn/i);
    });
  });

  it('viser fejl ved adgangskode kortere end 6 tegn', async () => {
    renderLoginPage();
    fireEvent.click(getTabButton('Opret bruger'));

    fireEvent.change(screen.getByLabelText(/Visningsnavn/i), {
      target: { value: 'Anders' },
    });
    fireEvent.change(screen.getByLabelText(/E-mail/i), {
      target: { value: 'anders@test.dk' },
    });
    fireEvent.change(screen.getByLabelText(/Adgangskode/i), {
      target: { value: '123' },
    });
    fireEvent.click(getSubmitButton('Opret bruger'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/6 tegn/i);
    });
  });

  it('viser fejl ved manglende e-mail ved signup', async () => {
    renderLoginPage();
    fireEvent.click(getTabButton('Opret bruger'));

    fireEvent.change(screen.getByLabelText(/Visningsnavn/i), {
      target: { value: 'Anders' },
    });
    fireEvent.click(getSubmitButton('Opret bruger'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/e-mail/i);
    });
  });

  it('viser fejl ved manglende adgangskode ved signup', async () => {
    renderLoginPage();
    fireEvent.click(getTabButton('Opret bruger'));

    fireEvent.change(screen.getByLabelText(/Visningsnavn/i), {
      target: { value: 'Anders' },
    });
    fireEvent.change(screen.getByLabelText(/E-mail/i), {
      target: { value: 'anders@test.dk' },
    });
    fireEvent.click(getSubmitButton('Opret bruger'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/adgangskode/i);
    });
  });

  it('kalder signup med korrekte data ved succesfuld validering', async () => {
    mockSignup.mockResolvedValue({ uid: 'new-uid' });
    renderLoginPage();
    fireEvent.click(getTabButton('Opret bruger'));

    fireEvent.change(screen.getByLabelText(/Visningsnavn/i), {
      target: { value: 'Ny Bruger' },
    });
    fireEvent.change(screen.getByLabelText(/E-mail/i), {
      target: { value: 'ny@test.dk' },
    });
    fireEvent.change(screen.getByLabelText(/Adgangskode/i), {
      target: { value: 'password123' },
    });
    fireEvent.click(getSubmitButton('Opret bruger'));

    await waitFor(() => {
      expect(mockSignup).toHaveBeenCalledWith('ny@test.dk', 'password123', 'Ny Bruger');
    });
  });

  it('navigerer til /afventer efter vellykket oprettelse', async () => {
    mockSignup.mockResolvedValue({ uid: 'new-uid' });
    renderLoginPage();
    fireEvent.click(getTabButton('Opret bruger'));

    fireEvent.change(screen.getByLabelText(/Visningsnavn/i), {
      target: { value: 'Ny Bruger' },
    });
    fireEvent.change(screen.getByLabelText(/E-mail/i), {
      target: { value: 'ny@test.dk' },
    });
    fireEvent.change(screen.getByLabelText(/Adgangskode/i), {
      target: { value: 'password123' },
    });
    fireEvent.click(getSubmitButton('Opret bruger'));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/afventer', { replace: true });
    });
  });

  it('navigerer IKKE til /afventer når signup returnerer null (fejl)', async () => {
    mockSignup.mockResolvedValue(null);
    renderLoginPage();
    fireEvent.click(getTabButton('Opret bruger'));

    fireEvent.change(screen.getByLabelText(/Visningsnavn/i), {
      target: { value: 'Ny Bruger' },
    });
    fireEvent.change(screen.getByLabelText(/E-mail/i), {
      target: { value: 'ny@test.dk' },
    });
    fireEvent.change(screen.getByLabelText(/Adgangskode/i), {
      target: { value: 'password123' },
    });
    fireEvent.click(getSubmitButton('Opret bruger'));

    await waitFor(() => {
      expect(mockNavigate).not.toHaveBeenCalledWith('/afventer', expect.anything());
    });
  });

  it('viser Opretter…-tekst under signup loading', () => {
    mockLoading = true;
    renderLoginPage();
    fireEvent.click(getTabButton('Opret bruger'));
    expect(screen.getByText(/Opretter/i)).toBeInTheDocument();
  });

  it('viser deaktiveringsnotat om admin-godkendelse', () => {
    renderLoginPage();
    fireEvent.click(getTabButton('Opret bruger'));
    expect(screen.getByText(/godkendes af en administrator/i)).toBeInTheDocument();
  });

  // ─── Fejlvisning fra hook ─────────────────────────────────────────────────

  it('viser fejlbesked fra hook (role="alert")', () => {
    mockError = 'Forkert e-mail eller adgangskode.';
    renderLoginPage();
    expect(screen.getByRole('alert')).toHaveTextContent(/Forkert e-mail/i);
  });

  it('kombinerer lokal valideringsfejl og hook-fejl — lokal viser først', async () => {
    mockError = 'Firebase fejl';
    renderLoginPage();
    fireEvent.click(getTabButton('Opret bruger'));
    fireEvent.click(getSubmitButton('Opret bruger'));

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      // Lokal fejl (visningsnavn) overstyrer hook-fejl
      expect(alert).toHaveTextContent(/visningsnavn/i);
    });
  });

  // ─── Redirect-logik ───────────────────────────────────────────────────────

  it('redirecter godkendt bruger til forsiden', () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'abc' }, isApproved: true });
    renderLoginPage();
    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
  });

  it('redirecter ikke-godkendt logget-ind bruger til /afventer', () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'abc' }, isApproved: false });
    renderLoginPage();
    expect(mockNavigate).toHaveBeenCalledWith('/afventer', { replace: true });
  });

  it('redirecter IKKE når ingen bruger er logget ind', () => {
    mockUseAuth.mockReturnValue({ user: null, isApproved: false });
    renderLoginPage();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
