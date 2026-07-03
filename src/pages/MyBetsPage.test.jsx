// Tests for MyBetsPage – overblik over brugerens etape-tip.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mock Firebase
vi.mock('../firebase', () => ({ db: {}, auth: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  onSnapshot: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  where: vi.fn(),
}));

// Mock hooks
vi.mock('../features/stages/useStages', () => ({ useStages: vi.fn() }));
vi.mock('../features/stages/useMyStageBets', () => ({ useMyStageBets: vi.fn() }));
vi.mock('../features/stages/useActiveSeason', () => ({ useActiveSeason: () => 2026 }));
vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }));

import MyBetsPage from './MyBetsPage';
import { useStages } from '../features/stages/useStages';
import { useMyStageBets } from '../features/stages/useMyStageBets';
import { useAuth } from '../context/AuthContext';

function renderPage() {
  return render(
    <MemoryRouter>
      <MyBetsPage />
    </MemoryRouter>,
  );
}

const pastKickoff = '2020-07-01T12:00:00+02:00';
const futureKickoff = '2099-07-01T12:00:00+02:00';

// Afgjort etape (result udfyldt). Åben etape (intet result, fremtid).
const mockStages = [
  {
    id: '2026-stage-1', season: 2026, number: 1, kickoff: pastKickoff,
    result: { winnerTeam: 'A', gcTeam: 'A', mountainTeam: 'B', sprintTeam: 'C' },
  },
  {
    id: '2026-stage-2', season: 2026, number: 2, kickoff: futureKickoff, result: null,
  },
];

beforeEach(() => {
  useAuth.mockReturnValue({ user: { uid: 'user1' } });
});

describe('MyBetsPage – tom tilstand', () => {
  it('viser tom-tilstand når ingen tips er afgivet', () => {
    useStages.mockReturnValue({ stages: mockStages, loading: false });
    useMyStageBets.mockReturnValue({ betsByStage: {}, loading: false });
    renderPage();
    expect(screen.getByText(/Ingen tips endnu/)).toBeInTheDocument();
    expect(screen.getByText('Gå til etaper')).toBeInTheDocument();
  });
});

describe('MyBetsPage – loading', () => {
  it('viser spinner under indlæsning', () => {
    useStages.mockReturnValue({ stages: [], loading: true });
    useMyStageBets.mockReturnValue({ betsByStage: {}, loading: true });
    renderPage();
    expect(screen.getByLabelText('Henter tips…')).toBeInTheDocument();
  });

  it('viser spinner hvis kun stages loader', () => {
    useStages.mockReturnValue({ stages: [], loading: true });
    useMyStageBets.mockReturnValue({ betsByStage: {}, loading: false });
    renderPage();
    expect(screen.getByLabelText('Henter tips…')).toBeInTheDocument();
  });
});

describe('MyBetsPage – tippede etaper', () => {
  it('viser tabel-headers', () => {
    useStages.mockReturnValue({ stages: mockStages, loading: false });
    useMyStageBets.mockReturnValue({
      betsByStage: { '2026-stage-1': { winnerTeam: 'A', gcTeam: 'A', mountainTeam: 'B', sprintTeam: 'C' } },
      loading: false,
    });
    renderPage();
    expect(screen.getByText('Etape')).toBeInTheDocument();
    // Emoji-headers (mobilvenlige) med fuldt navn som title/aria-label.
    expect(screen.getByTitle('Etapevinderens hold')).toBeInTheDocument();
    expect(screen.getByTitle('Flest bjergpoint')).toBeInTheDocument();
    expect(screen.getByText('Point')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
  });

  it('viser kun etaper som brugeren har tippet', () => {
    useStages.mockReturnValue({ stages: mockStages, loading: false });
    useMyStageBets.mockReturnValue({
      betsByStage: { '2026-stage-1': { winnerTeam: 'A' } },
      loading: false,
    });
    renderPage();
    expect(screen.getByText('Etape 1')).toBeInTheDocument();
    expect(screen.queryByText('Etape 2')).not.toBeInTheDocument();
  });
});

describe('MyBetsPage – point-beregning', () => {
  it('beregner totale point for afgjort etape (alle fire rigtige)', () => {
    useStages.mockReturnValue({ stages: mockStages, loading: false });
    useMyStageBets.mockReturnValue({
      betsByStage: { '2026-stage-1': { winnerTeam: 'A', gcTeam: 'A', mountainTeam: 'B', sprintTeam: 'C' } },
      loading: false,
    });
    renderPage();
    // 5 + 4 + 3 + 3 = 15 point
    expect(screen.getByTestId('total-points')).toHaveTextContent('15');
  });

  it('viser "–" for point ved ikke-afgjorte etaper', () => {
    useStages.mockReturnValue({ stages: mockStages, loading: false });
    useMyStageBets.mockReturnValue({
      betsByStage: { '2026-stage-2': { winnerTeam: 'A' } },
      loading: false,
    });
    renderPage();
    const dashes = screen.getAllByText('–');
    expect(dashes.length).toBeGreaterThan(0);
  });
});

describe('MyBetsPage – status-badges', () => {
  it('viser "Afventer" badge for ulåst etape', () => {
    useStages.mockReturnValue({ stages: mockStages, loading: false });
    useMyStageBets.mockReturnValue({
      betsByStage: { '2026-stage-2': { winnerTeam: 'A' } },
      loading: false,
    });
    renderPage();
    expect(screen.getByText('Afventer')).toBeInTheDocument();
  });

  it('viser "Afgjort" badge for afgjort etape', () => {
    useStages.mockReturnValue({ stages: mockStages, loading: false });
    useMyStageBets.mockReturnValue({
      betsByStage: { '2026-stage-1': { winnerTeam: 'A' } },
      loading: false,
    });
    renderPage();
    expect(screen.getByText('Afgjort')).toBeInTheDocument();
  });
});

describe('MyBetsPage – rediger-links', () => {
  it('viser rediger-link for ulåste etaper', () => {
    useStages.mockReturnValue({ stages: mockStages, loading: false });
    useMyStageBets.mockReturnValue({
      betsByStage: { '2026-stage-2': { winnerTeam: 'A' } },
      loading: false,
    });
    renderPage();
    expect(screen.getByTitle('Rediger tip')).toBeInTheDocument();
  });

  it('viser IKKE rediger-link for låste etaper', () => {
    useStages.mockReturnValue({ stages: mockStages, loading: false });
    useMyStageBets.mockReturnValue({
      betsByStage: { '2026-stage-1': { winnerTeam: 'A' } },
      loading: false,
    });
    renderPage();
    expect(screen.queryByTitle('Rediger tip')).not.toBeInTheDocument();
  });

  it('viser link til etapesiden i statistik-boks', () => {
    useStages.mockReturnValue({ stages: mockStages, loading: false });
    useMyStageBets.mockReturnValue({
      betsByStage: { '2026-stage-1': { winnerTeam: 'A' } },
      loading: false,
    });
    renderPage();
    expect(screen.getByText(/Til etaperne/)).toBeInTheDocument();
  });
});
