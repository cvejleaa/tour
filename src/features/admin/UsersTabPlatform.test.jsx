// UsersTab i PLATFORM-tilstand: point-tallet på brugerrækken er Tour-feltet
// users.totalPoints, som ALDRIG skrives på platformen (point bor pr. spil i
// games/{gid}/players). Rækken stod derfor med "0 point" for alle — også
// spillere med hundredvis af Superliga-point — og modsagde slette-vagten, der
// tæller rigtigt fra players-dokumenterne (sweep-fund L1-1). På platformen må
// tallet slet ikke vises; Tour-visningen bevises i UsersTab.test.jsx.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../../firebase', () => ({ db: {}, auth: { currentUser: null }, functions: {} }));
vi.mock('../../lib/platform', async (orig) => ({ ...(await orig()), PLATFORM_MODE: true }));
vi.mock('firebase/functions', () => ({
  httpsCallable: () => () => Promise.resolve({ data: { users: [] } }),
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

describe('UsersTab (platform) — Tour-pointtallet vises ikke', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('brugerrækken viser status og rolle — men INTET vildledende "0 point"', () => {
    mockOnSnapshot.mockImplementation((q, cb) => {
      cb({
        docs: [{
          id: 'u1',
          // En migreret bruger med et GAMMELT Tour-tal i profilen: heller ikke
          // dét må vises — det er forrige spils point, ikke platformens.
          data: () => ({ displayName: 'Anders', email: 'a@test.dk', status: 'approved', role: 'player', totalPoints: 117 }),
        }],
      });
      return vi.fn();
    });
    render(<UsersTab isOwner={true} isGlobalAdmin={true} />);

    expect(screen.getByText('Anders')).toBeInTheDocument();
    expect(screen.getByText('Godkendt')).toBeInTheDocument();
    // Hverken det tomme "0 point" eller det forældede Tour-tal må stå der.
    expect(screen.queryByText(/\d+ point/)).toBeNull();
    expect(screen.queryByText(/117 point/)).toBeNull();
  });
});
