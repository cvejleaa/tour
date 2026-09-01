import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// NU er fast i testene, og fixturets datoer ligger 1 dag før. Uden det ville
// mockene ældes af sig selv, og forældet-advarslen ville dukke op i alle de
// øvrige tests, den dag suiten blev kørt 15 dage efter at filen blev skrevet.
// De to filer har MED VILJE forskellige datoer: rapporten 31/8, diagrammet
// 29/8. Med ens datoer kan en test ikke skelne "viser sin egen dato" fra
// "viser den andens", og netop dén forveksling er fejlen, ændringen retter.
// Diagrammet er ældst, så det er også dét, der styrer forældet-grænsen.
//
// Datoerne står som
// LITTERAL inde i vi.mock-fabrikkerne: kaldet hejses til toppen af filen, så
// en top-level konstant ikke kan nås derfra ("Cannot access before
// initialization"). NU er fast, så mockene ikke ældes af sig selv og lader
// forældet-advarslen dukke op i de øvrige tests fjorten dage efter.
const NU = new Date('2026-09-01T12:00:00.000Z');

// Mock rapport-data så testen er uafhængig af det genererede øjebliksbillede
vi.mock('../../data/testReport.json', () => ({
  default: {
    generatedAt: '2026-08-31T12:00:00.000Z', // litteral: vi.mock hejses
    totals: { files: 3, tests: 6, passed: 6, failed: 0 },
    suites: [
      { file: 'src/lib/scoring.test.js', area: 'frontend', passed: 3, failed: 0,
        tests: [
          { name: 'scoreMatch › eksakt', status: 'passed' },
          { name: 'scoreMatch › udfald', status: 'passed' },
          { name: 'scoreBonus › korrekt', status: 'passed' },
        ] },
      { file: 'functions/scoring.test.js', area: 'functions', passed: 2, failed: 0,
        tests: [
          { name: 'POINTS', status: 'passed' },
          { name: 'standings', status: 'passed' },
        ] },
      // Platform-suiten manglede helt i rapporten, indtil #2. Fixturet har den
      // nu, så en mutation, der taber området igen, bliver rød.
      { file: 'functions-platform/kampDetaljer.test.js', area: 'platform', passed: 1, failed: 0,
        tests: [{ name: 'maalAf udleder mål af Sc-kæden', status: 'passed' }] },
    ],
  },
}));

// Mock afhængighedsgraf (lille)
vi.mock('../../data/depGraph.json', () => ({
  default: {
    generatedAt: '2026-08-29T12:00:00.000Z', // litteral: vi.mock hejses
    nodes: [
      { id: 'lib (kerne)', layer: 0, files: 3 },
      { id: 'pages', layer: 3, files: 2 },
    ],
    edges: [{ from: 'pages', to: 'lib (kerne)', count: 4 }],
  },
}));

import TestsTab, { erForaeldet, FORAELDET_DAGE } from './TestsTab';

describe('TestsTab', () => {
  it('viser oversigt med antal tests, filer og bestået-andel', () => {
    render(<TestsTab />);
    expect(screen.getByText('6 tests')).toBeInTheDocument();
    expect(screen.getByText('3 filer')).toBeInTheDocument();
    expect(screen.getByText(/6 bestået/)).toBeInTheDocument();
  });

  it('detaljer-fanen viser testfiler og testnavne', () => {
    render(<TestsTab />);
    fireEvent.click(screen.getByTestId('subtab-details'));
    expect(screen.getByText('src/lib/scoring.test.js')).toBeInTheDocument();
    expect(screen.getByText(/scoreMatch › eksakt/)).toBeInTheDocument();
  });

  it('afhængigheds-fanen viser et diagram', () => {
    render(<TestsTab />);
    fireEvent.click(screen.getByTestId('subtab-deps'));
    expect(screen.getByRole('img', { name: /Afhængighedsdiagram/i })).toBeInTheDocument();
  });

  it('viser tests pr. område — og navngiver hver af de to servere', () => {
    render(<TestsTab />);
    expect(screen.getByText('Frontend (UI)')).toBeInTheDocument();
    // Begge servere skal navngives. Stod der bare "Cloud Functions", kunne man
    // ikke se hvilken af de to — og det var netop fejlen: kun Tourens blev talt
    // med, under et navn der lød som om der kun fandtes én.
    expect(screen.getByText('Cloud Functions (Tour)')).toBeInTheDocument();
    expect(screen.getByText('Cloud Functions (platform)')).toBeInTheDocument();
    expect(screen.queryByText('Cloud Functions')).not.toBeInTheDocument();
  });

  it('viser BEGGE datoer — testrapportens og diagrammets hver for sig', () => {
    render(<TestsTab />);
    // FORSKELLIGE datoer, så en ombytning af de to felter bliver rød.
    expect(screen.getByText(/Tests-tallene: 31\. august 2026/)).toBeInTheDocument();
    expect(screen.getByText(/Afhængighedsdiagrammet: 29\. august 2026/)).toBeInTheDocument();
    // Den gamle linje sagde "Senest opdateret" om ALLE tre underfaner, men
    // hentede kun testrapportens dato. Den formulering må ikke komme igen.
    expect(screen.queryByText(/Senest opdateret/)).not.toBeInTheDocument();
  });

  it('siger INTET om forældelse, når tallene er friske', () => {
    render(<TestsTab />);
    expect(screen.queryByTestId('rapport-forældet')).not.toBeInTheDocument();
    expect(screen.queryByText(/forældede/)).not.toBeInTheDocument();
  });
});

describe('TestsTab — forældet-advarslen', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NU); });
  afterEach(() => { vi.useRealTimers(); });

  it('advarer med dato, alder OG vejen videre, når tallene er for gamle', () => {
    vi.setSystemTime(new Date('2026-09-20T12:00:00.000Z'));
    render(<TestsTab />);
    const boks = screen.getByTestId('rapport-forældet');
    // ASSERTÉR PÅ INDHOLDET, ikke bare på at noget blev vist. Hele teksten
    // kunne erstattes med "OK?" og en test på blot tilstedeværelse ville
    // stadig være grøn (CLAUDE.md).
    expect(boks).toHaveTextContent('Tallene her er forældede');
    // DEN ÆLDSTE fil skal navngives — diagrammet (29/8), ikke rapporten (31/8).
    // En advarsel, der peger på den friskeste af de to, sender ejeren efter
    // den forkerte fil.
    expect(boks).toHaveTextContent('29. august 2026');
    expect(boks).toHaveTextContent('22 dage gammelt');
    expect(boks).not.toHaveTextContent('31. august 2026');
    expect(boks).toHaveTextContent('Opdatér test-rapporten');
    // Deploy-forbeholdet er ikke pynt: et commit på main ændrer INTET på
    // skærmen, før platformen deployes. Der assertéres på PÅSTANDEN, ikke på
    // ordet "deploy" — det står også i knapsætningen lige før, så en løs
    // /deploy/i overlevede, at hele forbeholdet blev slettet.
    expect(boks).toHaveTextContent('skifter først ved et deploy');
  });

  it('er tavs præcis PÅ grænsen og larmer lige efter — målt på den ældste fil', () => {
    // Båndet må ikke rumme både før og efter (CLAUDE.md). Grænsen regnes fra
    // DIAGRAMMET (29/8), som er den ældste — ikke fra rapporten (31/8). De to
    // datoer giver forskellige svar netop her, så testen beviser også, at
    // komponenten måler på den rigtige.
    vi.setSystemTime(new Date('2026-09-12T12:00:00.000Z')); // præcis 14 dage
    const { unmount } = render(<TestsTab />);
    expect(screen.queryByTestId('rapport-forældet')).not.toBeInTheDocument();
    unmount();

    vi.setSystemTime(new Date('2026-09-12T15:00:00.000Z')); // 14 dage + 3 timer
    render(<TestsTab />);
    expect(screen.getByTestId('rapport-forældet')).toBeInTheDocument();
  });
});

describe('erForaeldet — vagten selv', () => {
  const NU_MS = Date.parse('2026-09-01T12:00:00.000Z');
  const dageSiden = (n) => new Date(NU_MS - n * 86_400_000).toISOString();

  it('måler på den ÆLDSTE af de to filer', () => {
    // En frisk testrapport må ikke kunne skjule et forældet diagram bag sin
    // egen dato. De to er selvstændige filer og kan komme fra hver sin kørsel.
    expect(erForaeldet([dageSiden(1), dageSiden(40)], NU_MS)).toBe(true);
    expect(erForaeldet([dageSiden(40), dageSiden(1)], NU_MS)).toBe(true);
    expect(erForaeldet([dageSiden(1), dageSiden(2)], NU_MS)).toBe(false);
  });

  it('behandler en ULÆSELIG dato som forældet — vagten fejler åbent', () => {
    expect(erForaeldet([dageSiden(1), 'ikke en dato'], NU_MS)).toBe(true);
    expect(erForaeldet([dageSiden(1), ''], NU_MS)).toBe(true);
    expect(erForaeldet([dageSiden(1), undefined], NU_MS)).toBe(true);
  });

  it('grænsen er 14 dage, bundet til den ugentlige kørsel', () => {
    expect(FORAELDET_DAGE).toBe(14);
  });
});
