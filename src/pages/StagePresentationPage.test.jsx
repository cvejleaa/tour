// Tests for StagePresentationPage – etape-præsentationssiden (/etape/:number).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  onSnapshot: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  where: vi.fn(),
  doc: vi.fn(),
}));

vi.mock('../features/stages/useStages', () => ({ useStages: vi.fn() }));
vi.mock('../features/stages/useActiveSeason', () => ({ useActiveSeason: () => 2026 }));

import StagePresentationPage from './StagePresentationPage';
import { useStages } from '../features/stages/useStages';

// En afgjort/seedet etape med alle nøgletal. Flad type → ingen bjergpoint.
function flatStage(overrides = {}) {
  return {
    id: '2026-stage-5', season: 2026, number: 5, type: 'flat',
    date: '2026-07-08', km: 174.2, startTime: '13:25',
    startCity: 'Bordeaux', finishCity: 'Pau',
    image: 'https://example.com/pau.jpg',
    description: 'A lovely finish town in the Pyrenees.',
    ...overrides,
  };
}

function renderAt(number) {
  return render(
    <MemoryRouter initialEntries={[`/etape/${number}`]}>
      <Routes>
        <Route path="/etape/:number" element={<StagePresentationPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe('StagePresentationPage – nøgletal', () => {
  it('viser rute, distance, starttid og type for en kendt etape', () => {
    useStages.mockReturnValue({ stages: [flatStage()] });
    renderAt(5);
    expect(screen.getByTestId('route-line')).toHaveTextContent('Bordeaux → Pau');
    expect(screen.getByText(/174.2 km/)).toBeInTheDocument();
    expect(screen.getByText(/13:25/)).toBeInTheDocument();
    expect(screen.getAllByText(/Flad/).length).toBeGreaterThan(0);
    // Mål-by-billede + bytekst.
    expect(screen.getByAltText('Pau')).toBeInTheDocument();
    expect(screen.getByText(/Om mål-byen Pau/)).toBeInTheDocument();
  });

  it('skjuler højdemeter-feltet når elevation mangler', () => {
    useStages.mockReturnValue({ stages: [flatStage()] });
    renderAt(5);
    expect(screen.queryByText(/Højdemeter/)).toBeNull();
  });

  it('viser højdemeter-feltet når elevation er til stede', () => {
    useStages.mockReturnValue({ stages: [flatStage({ elevation: 2450 })] });
    renderAt(5);
    expect(screen.getByText(/Højdemeter/)).toBeInTheDocument();
    expect(screen.getByText(/2450 m/)).toBeInTheDocument();
  });
});

describe('StagePresentationPage – ekspert-tip', () => {
  it('viser IKKE ekspert-tip når feltet mangler', () => {
    useStages.mockReturnValue({ stages: [flatStage()] });
    renderAt(5);
    expect(screen.queryByTestId('expert-tip')).toBeNull();
  });

  it('viser ekspert-tip når feltet er til stede', () => {
    useStages.mockReturnValue({ stages: [flatStage({ expertTip: 'Hold øje med sidevinden.' })] });
    renderAt(5);
    expect(screen.getByTestId('expert-tip')).toHaveTextContent('Hold øje med sidevinden.');
  });
});

describe('StagePresentationPage – aktive spørgsmål', () => {
  it('lister hvilke spørgsmål der stilles (flad = ingen bjergpoint)', () => {
    useStages.mockReturnValue({ stages: [flatStage()] });
    renderAt(5);
    expect(screen.getByTestId('question-winnerTeam')).toHaveTextContent('✅');
    expect(screen.getByTestId('question-gcTeam')).toHaveTextContent('✅');
    expect(screen.getByTestId('question-sprintTeam')).toHaveTextContent('✅');
    // Bjergpoint er ikke aktiv på en flad etape → vises med "—".
    const mountain = screen.getByTestId('question-mountainTeam');
    expect(mountain).toHaveTextContent('Bjergpoint');
    expect(mountain.textContent.startsWith('—')).toBe(true);
  });
});

describe('StagePresentationPage – fallback og fejl', () => {
  it('falder tilbage til route2026 når etapen ikke er seedet endnu', () => {
    // Tomt DB-resultat → siden skal stadig finde etape 1 i ruten.
    useStages.mockReturnValue({ stages: [] });
    renderAt(1);
    expect(screen.getByTestId('route-line')).toBeInTheDocument();
    // Etape 1 i 2026 er Barcelone → Barcelone (fra route2026.json).
    expect(screen.getByTestId('route-line')).toHaveTextContent('Barcelone → Barcelone');
  });

  it('viser "Etape ikke fundet" for et ukendt nummer', () => {
    useStages.mockReturnValue({ stages: [] });
    renderAt(999);
    expect(screen.getByText('Etape ikke fundet')).toBeInTheDocument();
    expect(screen.getByText('Tilbage til etaperne')).toBeInTheDocument();
  });

  it('har en "Tip denne etape"-knap der peger på /etaper', () => {
    useStages.mockReturnValue({ stages: [flatStage()] });
    renderAt(5);
    expect(screen.getByTestId('tip-stage-btn')).toHaveAttribute('href', '/etaper');
  });
});
