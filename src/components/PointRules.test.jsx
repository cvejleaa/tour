// Tests for PointRules-komponenten – point-regler fra POINTS-konstanterne.
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PointRules from './PointRules';
import { POINTS } from '../lib/scoring';

describe('PointRules – grundlæggende rendering', () => {
  it('renderer uden fejl', () => {
    expect(() => render(<PointRules />)).not.toThrow();
  });

  it('viser "Sådan får du point" som summary-tekst', () => {
    render(<PointRules />);
    expect(screen.getByText(/Sådan får du point/)).toBeInTheDocument();
  });

  it('viser "klik for detaljer" badge', () => {
    render(<PointRules />);
    expect(screen.getByText('klik for detaljer')).toBeInTheDocument();
  });

  it('er implementeret som <details> element (sammenfoldelig)', () => {
    const { container } = render(<PointRules />);
    expect(container.querySelector('details')).toBeInTheDocument();
  });
});

describe('PointRules – pointværdier', () => {
  it(`viser ${POINTS.EXACT} point for "Helt korrekt score"`, () => {
    render(<PointRules />);
    // POINTS.EXACT = 5
    expect(screen.getByText(/Helt korrekt score/)).toBeInTheDocument();
    expect(screen.getByText(`${POINTS.EXACT} p`)).toBeInTheDocument();
  });

  it(`viser ${POINTS.GOAL_DIFF} point for "Korrekt målforskel + vinder"`, () => {
    render(<PointRules />);
    expect(screen.getByText(/Korrekt målforskel/)).toBeInTheDocument();
    expect(screen.getByText(`${POINTS.GOAL_DIFF} p`)).toBeInTheDocument();
  });

  it(`viser ${POINTS.OUTCOME} point for "Korrekt vinder/uafgjort"`, () => {
    render(<PointRules />);
    expect(screen.getByText(/Korrekt vinder\/uafgjort/)).toBeInTheDocument();
    expect(screen.getByText(`${POINTS.OUTCOME} p`)).toBeInTheDocument();
  });

  it(`viser ${POINTS.WRONG} point for "Forkert udfald"`, () => {
    render(<PointRules />);
    expect(screen.getByText(/Forkert udfald/)).toBeInTheDocument();
    expect(screen.getByText(`${POINTS.WRONG} p`)).toBeInTheDocument();
  });

  it(`viser +${POINTS.KNOCKOUT_ADVANCE} point for korrekt "hvem går videre" i slutspil`, () => {
    render(<PointRules />);
    // Teksten er spredt over strong-tag og brødtekst – søg i container
    const { container } = render(<PointRules />);
    expect(container.textContent).toContain(`+${POINTS.KNOCKOUT_ADVANCE} point`);
  });

  it(`viser ${POINTS.BONUS} point for korrekt bonus-svar`, () => {
    const { container } = render(<PointRules />);
    expect(container.textContent).toContain(`${POINTS.BONUS} point`);
  });

  it('nævner "Bonus" i ekstra info', () => {
    render(<PointRules />);
    expect(screen.getByText(/Bonus:/)).toBeInTheDocument();
  });

  it('nævner "Slutspil" i ekstra info', () => {
    render(<PointRules />);
    expect(screen.getByText(/Slutspil:/)).toBeInTheDocument();
  });

  it('nævner "Deadline" i ekstra info', () => {
    render(<PointRules />);
    expect(screen.getByText(/Deadline:/)).toBeInTheDocument();
  });
});

describe('PointRules – eksempler', () => {
  it('viser eksempel for eksakt score', () => {
    render(<PointRules />);
    expect(screen.getByText(/fx du tipper 2–1, og det ender 2–1/)).toBeInTheDocument();
  });

  it('viser eksempel for korrekt målforskel', () => {
    render(<PointRules />);
    expect(screen.getByText(/fx du tipper 2–1, det ender 3–2/)).toBeInTheDocument();
  });

  it('viser eksempel for korrekt vinder', () => {
    render(<PointRules />);
    expect(screen.getByText(/fx du tipper 2–1, det ender 4–0/)).toBeInTheDocument();
  });

  it('viser eksempel for forkert udfald', () => {
    render(<PointRules />);
    expect(screen.getByText(/fx du tipper hjemmesejr, men holdet taber/)).toBeInTheDocument();
  });
});

describe('PointRules – sammenfoldelig', () => {
  it('details-elementet er lukket som standard', () => {
    const { container } = render(<PointRules />);
    const details = container.querySelector('details');
    expect(details.open).toBe(false);
  });

  it('åbner ved klik på summary', () => {
    const { container } = render(<PointRules />);
    const summary = container.querySelector('summary');
    fireEvent.click(summary);
    // Note: jsdom toggler details.open ved click på summary
    const details = container.querySelector('details');
    expect(details.open).toBe(true);
  });

  it('lukker igen ved andet klik', () => {
    const { container } = render(<PointRules />);
    const summary = container.querySelector('summary');
    fireEvent.click(summary); // åbn
    fireEvent.click(summary); // luk
    const details = container.querySelector('details');
    expect(details.open).toBe(false);
  });

  it('indeholder tabel med pointregler', () => {
    const { container } = render(<PointRules />);
    expect(container.querySelector('table')).toBeInTheDocument();
  });

  it('pointtabellen har 4 rækker (én pr. pointkategori)', () => {
    const { container } = render(<PointRules />);
    const tbody = container.querySelector('tbody');
    const rows = tbody.querySelectorAll('tr');
    expect(rows.length).toBe(4);
  });
});

describe('PointRules – konsistens med POINTS-konstanter', () => {
  it('POINTS.EXACT er 5', () => {
    expect(POINTS.EXACT).toBe(5);
  });

  it('POINTS.GOAL_DIFF er 3', () => {
    expect(POINTS.GOAL_DIFF).toBe(3);
  });

  it('POINTS.OUTCOME er 2', () => {
    expect(POINTS.OUTCOME).toBe(2);
  });

  it('POINTS.WRONG er 0', () => {
    expect(POINTS.WRONG).toBe(0);
  });

  it('POINTS.KNOCKOUT_ADVANCE er 2', () => {
    expect(POINTS.KNOCKOUT_ADVANCE).toBe(2);
  });

  it('POINTS.BONUS er 10', () => {
    expect(POINTS.BONUS).toBe(10);
  });
});
