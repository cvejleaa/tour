// Tests for TeamPage – ét holds side (/hold/:code).
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), onSnapshot: vi.fn() }));

// Mock holddata, så vi kan styre hold-opslag.
vi.mock('../data/tourTeams2026', () => {
  const META = {
    UAD: { code: 'UAD', name: 'UAE Team Emirates', nationality: 'uae', color: '#000000' },
    TVL: { code: 'TVL', name: 'Team Visma | Lease a Bike', nationality: 'ned', color: '#f7d417' },
  };
  return {
    teamMeta: (c) => META[c] || null,
    prettyTeam: (n) => n,
  };
});

// Mock den statiske startliste (live-hook'en er no-op pga. onSnapshot-mocken).
vi.mock('../data/startlist2026', () => {
  const SL = {
    TVL: { announced: true, riders: [
      { name: 'Rytter Én', country: 'Danmark' },
      { name: 'Rider Two', country: 'USA' },
    ] },
  };
  return { staticStartlist: (c) => SL[c] || null };
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

  it('viser rytterlisten med danskere fremhævet', () => {
    renderAt('TVL');
    expect(screen.getByTestId('rider-list')).toBeInTheDocument();
    expect(screen.getByText('Rytter Én')).toBeInTheDocument();
    expect(screen.getByText('Rider Two')).toBeInTheDocument();
    // Den danske rytter får et flag-mærke.
    expect(screen.getByTitle('Dansk rytter')).toBeInTheDocument();
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
