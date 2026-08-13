/**
 * ⚠-driftmarkøren i navigationen — TM-fund: den kunne fjernes helt med grøn
 * suite. Den betyder "noget er i stykker" og drives af UKVITTEREDE alarmer;
 * den må hverken forveksles med godkendelses-badget eller vises for nul.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

let alarmCount = 0;
vi.mock('../features/admin/useDriftStatus', () => ({
  useDriftAlarmCount: () => alarmCount,
}));
vi.mock('../lib/platform', async (orig) => ({ ...(await orig()), PLATFORM_MODE: true }));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { uid: 'me' }, isApproved: true, isGlobalAdmin: true, isOwner: true,
    profile: { displayName: 'Ejer' },
  }),
}));
vi.mock('../context/TasksContext', () => ({ useTasks: () => ({ total: 0 }) }));
vi.mock('../features/admin/usePendingApprovals', () => ({ usePendingApprovals: () => ({ total: 3 }) }));
vi.mock('../features/comments/useUnreadMessages', () => ({ useUnreadMessages: () => ({ total: 0 }) }));
vi.mock('../firebase', () => ({ auth: {}, db: {} }));
vi.mock('../features/presence/usePresenceBeacon', () => ({ usePresenceBeacon: vi.fn() }));
vi.mock('firebase/auth', () => ({ signOut: vi.fn(async () => {}) }));

import Layout from './Layout';

function renderLayout() {
  return render(<MemoryRouter><Layout><div /></Layout></MemoryRouter>);
}

describe('Layout — ⚠ driftmarkøren', () => {
  it('vises ved ukvitterede alarmer — ADSKILT fra godkendelses-badget', () => {
    alarmCount = 2;
    renderLayout();
    const markoer = screen.getByTestId('admin-drift-alarm');
    expect(markoer.textContent).toBe('⚠');
    expect(markoer.title).toContain('Driftstatus');
    // Godkendelses-badget står der SAMTIDIG med sit eget tal — to forskellige
    // betydninger, to elementer.
    expect(screen.getByTestId('admin-pending-count')).toBeInTheDocument();
  });

  it('vises IKKE, når intet venter på kvittering', () => {
    alarmCount = 0;
    renderLayout();
    expect(screen.queryByTestId('admin-drift-alarm')).toBeNull();
  });
});
