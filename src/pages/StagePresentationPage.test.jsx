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
// StageAnswers henter bets + auth — mockes; her testes kun HVORNÅR den vises.
vi.mock('../features/stages/StageAnswers', () => ({
  default: () => <div data-testid="stage-answers-mock" />,
}));

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
    // Rute vises i Hero'ens undertitel.
    expect(screen.getByText('Bordeaux → Pau')).toBeInTheDocument();
    expect(screen.getByText(/174.2 km/)).toBeInTheDocument();
    expect(screen.getByText(/13:25/)).toBeInTheDocument();
    expect(screen.getAllByText(/Flad/).length).toBeGreaterThan(0);
    // Mål-by-billede + bytekst.
    expect(screen.getByAltText('Pau')).toBeInTheDocument();
    expect(screen.getByText(/Om mål-byen Pau/)).toBeInTheDocument();
  });

  it('udfylder højdemeter fra den statiske rute når den seedede etape mangler den', () => {
    // flatStage() har ingen elevation, men route2026 (etape 5) har 1600 m.
    useStages.mockReturnValue({ stages: [flatStage()] });
    renderAt(5);
    expect(screen.getByText(/Højdemeter/)).toBeInTheDocument();
    expect(screen.getByText(/1600 m/)).toBeInTheDocument();
  });

  it('lader den seedede etapes elevation vinde over den statiske rute', () => {
    useStages.mockReturnValue({ stages: [flatStage({ elevation: 2450 })] });
    renderAt(5);
    expect(screen.getByText(/Højdemeter/)).toBeInTheDocument();
    expect(screen.getByText(/2450 m/)).toBeInTheDocument();
  });
});

describe('StagePresentationPage – berigelse fra letour', () => {
  it('viser højdeprofil, stigninger med kategori og mellemsprint fra ruten', () => {
    // Etape 5 i route2026 er beriget med profil, Côte de Baleix (kat. 3) og Vic-en-Bigorre.
    useStages.mockReturnValue({ stages: [flatStage()] });
    renderAt(5);
    expect(screen.getByTestId('stage-profile')).toBeInTheDocument();
    expect(screen.getByTestId('stage-challenges')).toBeInTheDocument();
    expect(screen.getByText(/Côte de Baleix/)).toBeInTheDocument();
    expect(screen.getByText(/VIC-EN-BIGORRE/)).toBeInTheDocument();
  });

  it('viser ingen udfordrings-sektion på en etape uden stigninger/sprints (etape 1)', () => {
    useStages.mockReturnValue({ stages: [] });
    renderAt(1);
    expect(screen.queryByTestId('stage-challenges')).toBeNull();
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
    // Aktive spørgsmål markeres med en neutral prik (✅ er reserveret til
    // "rigtigt gættet" på resultat-visningen).
    expect(screen.getByTestId('question-winnerTeam')).toHaveTextContent('●');
    expect(screen.getByTestId('question-gcTeam')).toHaveTextContent('●');
    expect(screen.getByTestId('question-sprintTeam')).toHaveTextContent('●');
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
    // Etape 1 i 2026 er Barcelone → Barcelone (fra route2026.json) — vises i Hero.
    expect(screen.getByText('Barcelone → Barcelone')).toBeInTheDocument();
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

describe('StagePresentationPage – etapens resultat', () => {
  it('viser målrækkefølgen (resultRows) for en afgjort etape', () => {
    useStages.mockReturnValue({ stages: [flatStage({
      kickoff: '2026-07-01T13:00:00+02:00', // i fortiden
      result: { winnerTeam: 'Lidl-Trek' },  // → status 'done'
      resultRows: [
        { rank: 1, rider: 'VINGEGAARD Jonas', team: 'Team Visma | Lease a Bike', time: "21'47\"" },
        { rank: 2, rider: 'GANNA Filippo', team: 'Netcompany Ineos', time: "21'55\"" },
      ],
    })] });
    renderAt(5);
    expect(screen.getByTestId('stage-finish-order')).toBeInTheDocument();
    expect(screen.getByText(/Etapens resultat/)).toBeInTheDocument();
    // Fuldt navn (letours forkortelse konverteres) + tid.
    expect(screen.getByText('Jonas Vingegaard')).toBeInTheDocument();
  });

  it('vises IKKE på en åben etape eller uden resultRows', () => {
    useStages.mockReturnValue({ stages: [flatStage({ kickoff: '2999-07-08T13:00:00+02:00' })] });
    renderAt(5);
    expect(screen.queryByTestId('stage-finish-order')).toBeNull();
  });
});

describe('StagePresentationPage – klassement-resultater pr. etape', () => {
  it('viser bjerg-, sprint- og hold-blokkene når data findes', () => {
    useStages.mockReturnValue({ stages: [flatStage({
      kickoff: '2026-07-01T13:00:00+02:00',
      result: { winnerTeam: 'Lidl-Trek' },
      resultRows: [{ rank: 1, rider: 'PEDERSEN Mads', team: 'Lidl-Trek', time: "4h 12' 03\"" }],
      mountainRows: [{ rank: 1, rider: 'MARTINEZ Lenny', team: 'Bahrain Victorious', points: 5 }],
      sprintRows: [{ rank: 1, rider: 'PHILIPSEN Jasper', team: 'Alpecin-Premier Tech', points: 50 }],
      holdRows: [{ rank: 1, rider: 'Team Visma | Lease a Bike', team: 'Team Visma | Lease a Bike', time: "12h 40' 12\"" }],
    })] });
    renderAt(5);
    expect(screen.getByTestId('stage-mountain-result')).toBeInTheDocument();
    expect(screen.getByTestId('stage-sprint-result')).toBeInTheDocument();
    expect(screen.getByTestId('stage-team-result')).toBeInTheDocument();
    expect(screen.getByText('50 p')).toBeInTheDocument();
  });

  it('skjuler tomme blokke (fx TTT uden bjerg-/sprintpoint)', () => {
    useStages.mockReturnValue({ stages: [flatStage({
      kickoff: '2026-07-01T13:00:00+02:00',
      result: { winnerTeam: 'Lidl-Trek' },
      resultRows: [{ rank: 1, rider: 'PEDERSEN Mads', team: 'Lidl-Trek', time: "21' 47\"" }],
      mountainRows: [],
      sprintRows: [],
      holdRows: [{ rank: 1, rider: 'Team Visma | Lease a Bike', team: 'Team Visma | Lease a Bike', time: "21' 47\"" }],
    })] });
    renderAt(5);
    expect(screen.queryByTestId('stage-mountain-result')).toBeNull();
    expect(screen.queryByTestId('stage-sprint-result')).toBeNull();
    expect(screen.getByTestId('stage-team-result')).toBeInTheDocument();
  });
});
