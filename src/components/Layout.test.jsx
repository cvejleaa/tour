/**
 * Tests for Layout-navigationen.
 * Profil-linket skal nu vise teksten "Min profil" (ikke kun et avatar-ikon).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Layout from './Layout';

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { uid: 'me' },
    isApproved: true,
    isGlobalAdmin: false,
    isOwner: false,
    profile: { displayName: 'Carsten' },
  }),
}));
vi.mock('../context/TasksContext', () => ({
  useTasks: () => ({ total: 0 }),
}));
vi.mock('../features/admin/usePendingApprovals', () => ({
  usePendingApprovals: () => ({ total: 0 }),
}));
vi.mock('../features/comments/useUnreadMessages', () => ({
  useUnreadMessages: () => ({ total: 0 }),
}));
vi.mock('../firebase', () => ({ auth: {} }));
vi.mock('firebase/auth', () => ({ signOut: vi.fn(async () => {}) }));

function renderLayout() {
  return render(
    <MemoryRouter>
      <Layout><div>indhold</div></Layout>
    </MemoryRouter>,
  );
}

describe('Layout', () => {
  it('viser "Min profil"-tekst i profil-linket', () => {
    renderLayout();
    expect(screen.getByText('Min profil')).toBeInTheDocument();
  });

  it('profil-linket peger på /profil', () => {
    renderLayout();
    const link = screen.getByRole('link', { name: /min profil/i });
    expect(link).toHaveAttribute('href', '/profil');
  });
});
