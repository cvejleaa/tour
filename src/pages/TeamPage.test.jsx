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
    countryName: (code) => ({ uae: 'De Forenede Arabiske Emirater', ned: 'Holland' }[code] || String(code).toUpperCase()),
  };
});

// Mock den statiske startliste (live-hook'en er no-op pga. onSnapshot-mocken).
vi.mock('../data/startlist2026', () => {
  const SL = {
    TVL: { announced: true, riders: [
      { name: 'Rytter Én', country: 'Danmark' },
      { name: 'Jonas Vingegaard', country: 'Danmark' }, // hovednavn → ⭐
      { name: 'Rider Two', country: 'USA' },
      { name: 'Ben Healy (Irland)' }, // live-synk-format: land bagt ind i navnet
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
    // Danske ryttere får et flag-mærke.
    expect(screen.getAllByTitle('Dansk rytter').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('riders-pending')).toBeNull();
  });

  it('normaliserer "Navn (Land)"-format så navn og land vises adskilt', () => {
    renderAt('TVL');
    // Navnet vises uden parentesen, og landet vises som separat tekst.
    expect(screen.getByText('Ben Healy')).toBeInTheDocument();
    expect(screen.queryByText('Ben Healy (Irland)')).toBeNull();
    expect(screen.getByText('· Irland')).toBeInTheDocument();
  });

  it('viser holdets profil, hovednavne og mål (TVL = Visma)', () => {
    renderAt('TVL');
    expect(screen.getByTestId('team-profile')).toBeInTheDocument();
    expect(screen.getByText('Klassement & etaper')).toBeInTheDocument();
    // Hovednavne fra den kuraterede profil + mål.
    expect(screen.getAllByText(/Jonas Vingegaard/).length).toBeGreaterThan(0);
    expect(screen.getByText(/vinder samlet/)).toBeInTheDocument();
  });

  it('markerer et hovednavn i startlisten med ⭐', () => {
    renderAt('TVL');
    // Vingegaard er hovednavn → får et ⭐-mærke i rytterlisten.
    expect(screen.getByTitle('Hovednavn')).toBeInTheDocument();
  });

  it('viser skemaet med en kolonne pr. indbygget Tour-konkurrence', () => {
    renderAt('TVL');
    // Tabel-layout med sorterbare kolonner for samlet/sprint/bjerg/ungdom.
    for (const k of ['samlet', 'sprint', 'bjerg', 'ungdom']) {
      expect(screen.getByTestId(`sort-${k}`)).toBeInTheDocument();
    }
    // Uden klassement-data endnu: cellerne viser '–' og en forklaring.
    expect(screen.getAllByText('–').length).toBeGreaterThan(0);
    expect(screen.getByText(/Klassement-kolonnerne udfyldes automatisk/)).toBeInTheDocument();
  });

  it('viser "Hold ikke fundet" for en ukendt kode', () => {
    renderAt('ZZZ');
    expect(screen.getByText('Hold ikke fundet')).toBeInTheDocument();
  });
});
