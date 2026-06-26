import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock rapport-data så testen er uafhængig af det genererede øjebliksbillede
vi.mock('../../data/testReport.json', () => ({
  default: {
    generatedAt: '2026-06-04T10:00:00.000Z',
    totals: { files: 2, tests: 5, passed: 5, failed: 0 },
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
    ],
  },
}));

// Mock afhængighedsgraf (lille)
vi.mock('../../data/depGraph.json', () => ({
  default: {
    generatedAt: '2026-06-04T10:00:00.000Z',
    nodes: [
      { id: 'lib (kerne)', layer: 0, files: 3 },
      { id: 'pages', layer: 3, files: 2 },
    ],
    edges: [{ from: 'pages', to: 'lib (kerne)', count: 4 }],
  },
}));

import TestsTab from './TestsTab';

describe('TestsTab', () => {
  it('viser oversigt med antal tests, filer og bestået-andel', () => {
    render(<TestsTab />);
    expect(screen.getByText('5 tests')).toBeInTheDocument();
    expect(screen.getByText('2 filer')).toBeInTheDocument();
    expect(screen.getByText(/5 bestået/)).toBeInTheDocument();
  });

  it('viser tests pr. område (Frontend og Cloud Functions)', () => {
    render(<TestsTab />);
    expect(screen.getByText(/Frontend \(UI\)/)).toBeInTheDocument();
    expect(screen.getByText(/Cloud Functions/)).toBeInTheDocument();
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
});
