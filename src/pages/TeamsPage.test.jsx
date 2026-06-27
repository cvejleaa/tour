// Tests for TeamsPage – holdoversigten (/hold).
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), onSnapshot: vi.fn() }));

import TeamsPage from './TeamsPage';
import { TEAMS } from '../data/tourTeams2026';

function renderPage() {
  return render(<MemoryRouter><TeamsPage /></MemoryRouter>);
}

describe('TeamsPage', () => {
  it('viser et kort pr. hold med link til holdets side', () => {
    renderPage();
    expect(screen.getByTestId('teams-grid')).toBeInTheDocument();
    const cards = screen.getAllByTestId(/^team-card-/);
    expect(cards).toHaveLength(TEAMS.length);
    // Et kendt hold linker til /hold/<kode>.
    const apt = screen.getByTestId('team-card-APT');
    expect(apt).toHaveAttribute('href', '/hold/APT');
  });
});
