// Tests for TeamPage – ét holds side (/hold/:code).
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// Mock holddata, så vi kan styre riders-tilstanden (statisk data har dem ikke endnu).
vi.mock('../data/tourTeams2026', () => {
  const META = {
    UAD: { code: 'UAD', name: 'UAE Team Emirates', nationality: 'uae', color: '#000000', riders: [] },
    TVL: {
      code: 'TVL', name: 'Team Visma | Lease a Bike', nationality: 'ned', color: '#f7d417',
      riders: [{ bib: 1, name: 'Rytter Én', role: 'Kaptajn', nationality: 'den' }],
    },
  };
  return {
    teamMeta: (c) => META[c] || null,
    prettyTeam: (n) => n,
  };
});

import TeamPage from './TeamPage';

function renderAt(code) {
  return render(
    <MemoryRouter initialEntries={[`/hold/${code}`]}>
      <Routes>
        <Route path="/hold/:code" element={<TeamPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('TeamPage', () => {
  it('viser holdets header og en "kommer snart" når der ingen ryttere er', () => {
    renderAt('UAD');
    expect(screen.getByTestId('team-presentation')).toBeInTheDocument();
    expect(screen.getAllByText('UAE Team Emirates').length).toBeGreaterThan(0);
    expect(screen.getByTestId('riders-pending')).toBeInTheDocument();
    expect(screen.queryByTestId('rider-list')).toBeNull();
  });

  it('viser rytterlisten når den er til stede', () => {
    renderAt('TVL');
    expect(screen.getByTestId('rider-list')).toBeInTheDocument();
    expect(screen.getByText('Rytter Én')).toBeInTheDocument();
    expect(screen.queryByTestId('riders-pending')).toBeNull();
  });

  it('viser holdets profil og nøgleryttere (TVL = Visma)', () => {
    renderAt('TVL');
    expect(screen.getByTestId('team-profile')).toBeInTheDocument();
    expect(screen.getByText('Klassement & etaper')).toBeInTheDocument();
    // Nøgleryttere fra den kuraterede profil (ikke startliste-mocken).
    expect(screen.getByText('Jonas Vingegaard')).toBeInTheDocument();
  });

  it('viser "Hold ikke fundet" for en ukendt kode', () => {
    renderAt('ZZZ');
    expect(screen.getByText('Hold ikke fundet')).toBeInTheDocument();
  });
});
