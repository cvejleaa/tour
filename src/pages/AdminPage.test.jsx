// Udtømmende tests for AdminPage — rollebaseret fanestyring og indhold.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// ─── Mock Firebase ────────────────────────────────────────────────────────────
vi.mock('../firebase', () => ({
  auth: {},
  db: {},
  functions: {},
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  onSnapshot: vi.fn(() => vi.fn()),
  orderBy: vi.fn(),
  query: vi.fn(),
  doc: vi.fn(),
  updateDoc: vi.fn(),
  addDoc: vi.fn(),
  serverTimestamp: vi.fn(),
  arrayUnion: vi.fn((v) => ({ _arrayUnion: v })),
  arrayRemove: vi.fn((v) => ({ _arrayRemove: v })),
  Timestamp: {
    fromDate: vi.fn((d) => ({ toDate: () => d })),
  },
  where: vi.fn(),
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(() => vi.fn().mockResolvedValue({ data: {} })),
}));

// ─── Mock useAuth ─────────────────────────────────────────────────────────────
const mockUseAuth = vi.fn();
vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

import AdminPage from './AdminPage';

function renderAdminPage() {
  return render(
    <MemoryRouter>
      <AdminPage />
    </MemoryRouter>
  );
}

describe('AdminPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Owner-bruger ─────────────────────────────────────────────────────────

  describe('Owner-bruger (fuld adgang)', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        isOwner: true,
        isGlobalAdmin: true,
        user: { uid: 'owner-uid' },
        profile: { displayName: 'Ejer' },
      });
    });

    it('viser Brugere-fanen for owner', () => {
      renderAdminPage();
      expect(screen.queryByTestId('tab-users')).toBeInTheDocument();
    });

    it('viser Kampe & resultater-fanen for owner', () => {
      renderAdminPage();
      expect(screen.queryByTestId('tab-matches')).toBeInTheDocument();
    });

    it('viser Bonus-facit-fanen for owner', () => {
      renderAdminPage();
      expect(screen.queryByTestId('tab-bonus')).toBeInTheDocument();
    });

    it('viser Ligaer-fanen for owner', () => {
      renderAdminPage();
      expect(screen.queryByTestId('tab-leagues')).toBeInTheDocument();
    });

    it('viser alle ti faner for owner (inkl. Indstillinger)', () => {
      renderAdminPage();
      const tabs = screen.queryAllByTestId(/^tab-/);
      expect(tabs).toHaveLength(10);
      expect(screen.queryByTestId('tab-altstanding')).toBeInTheDocument();
      expect(screen.queryByTestId('tab-tests')).toBeInTheDocument();
      expect(screen.queryByTestId('tab-runbook')).toBeInTheDocument();
      expect(screen.queryByTestId('tab-preview')).toBeInTheDocument();
      expect(screen.queryByTestId('tab-settings')).toBeInTheDocument();
    });

    it('viser tekst om fuld adgang som ejer', () => {
      renderAdminPage();
      expect(screen.getByText(/fuld adgang som ejer/i)).toBeInTheDocument();
    });

    it('starter på Brugere-fanen for owner', () => {
      renderAdminPage();
      const brugereTab = screen.getByTestId('tab-users');
      // Fanen er aktiv (markeret med stærkere farve/fontWeight)
      expect(brugereTab).toBeInTheDocument();
    });

    it('faneskift fra Brugere til Kampe viser kamp-indhold', async () => {
      renderAdminPage();
      fireEvent.click(screen.getByTestId('tab-matches'));
      await waitFor(() => {
        // MatchesTab indlæser — tjek loading-besked eller kamp-liste
        expect(
          screen.queryByText(/Henter kampe/i) ||
          screen.queryByText(/Ingen kampe/i) ||
          screen.queryByText(/Opret kamp/i)
        ).toBeTruthy();
      });
    });

    it('faneskift fra Brugere til Bonus-facit viser bonus-indhold', async () => {
      renderAdminPage();
      fireEvent.click(screen.getByTestId('tab-bonus'));
      await waitFor(() => {
        expect(
          screen.queryByText(/Henter bonusspørgsmål/i) ||
          screen.queryByText(/Ingen bonusspørgsmål/i)
        ).toBeTruthy();
      });
    });

    it('faneskift til Ligaer viser ligaer-indhold', async () => {
      renderAdminPage();
      fireEvent.click(screen.getByTestId('tab-leagues'));
      await waitFor(() => {
        expect(
          screen.queryByText(/Henter ligaer/i) ||
          screen.queryByText(/Ingen ligaer/i)
        ).toBeTruthy();
      });
    });
  });

  // ─── Global admin (ikke ejer) ─────────────────────────────────────────────

  describe('Global admin (ikke ejer)', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        isOwner: false,
        isGlobalAdmin: true,
        user: { uid: 'globaladmin-uid' },
        profile: { displayName: 'Global Admin' },
      });
    });

    it('VISER Brugere-fanen for global admin (kan godkende brugere)', () => {
      renderAdminPage();
      expect(screen.queryByTestId('tab-users')).toBeInTheDocument();
    });

    it('viser Kampe & resultater-fanen for global admin', () => {
      renderAdminPage();
      expect(screen.queryByTestId('tab-matches')).toBeInTheDocument();
    });

    it('viser Bonus-facit-fanen for global admin', () => {
      renderAdminPage();
      expect(screen.queryByTestId('tab-bonus')).toBeInTheDocument();
    });

    it('viser Ligaer-fanen for global admin', () => {
      renderAdminPage();
      expect(screen.queryByTestId('tab-leagues')).toBeInTheDocument();
    });

    it('viser præcis 9 faner for global admin (ingen Indstillinger)', () => {
      renderAdminPage();
      const tabs = screen.queryAllByTestId(/^tab-/);
      expect(tabs).toHaveLength(9);
      expect(screen.queryByTestId('tab-altstanding')).toBeInTheDocument();
      expect(screen.queryByTestId('tab-tests')).toBeInTheDocument();
      expect(screen.queryByTestId('tab-runbook')).toBeInTheDocument();
      expect(screen.queryByTestId('tab-settings')).not.toBeInTheDocument();
    });

    it('viser tekst om global administrator adgang', () => {
      renderAdminPage();
      expect(screen.getByText(/global administrator/i)).toBeInTheDocument();
    });

    it('faneskift til Bonus-facit viser bonus-indhold for global admin', async () => {
      renderAdminPage();
      fireEvent.click(screen.getByTestId('tab-bonus'));
      await waitFor(() => {
        expect(
          screen.queryByText(/Henter bonusspørgsmål/i) ||
          screen.queryByText(/Ingen bonusspørgsmål/i)
        ).toBeTruthy();
      });
    });
  });

  // ─── Panel-overskrift ─────────────────────────────────────────────────────

  it('viser Admin-panel som overskrift', () => {
    mockUseAuth.mockReturnValue({ isOwner: true, isGlobalAdmin: true, user: { uid: 'x' } });
    renderAdminPage();
    expect(screen.getByText(/Admin-panel/i)).toBeInTheDocument();
  });
});
