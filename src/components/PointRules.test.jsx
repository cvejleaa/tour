// Tests for PointRules-komponenten – hold-spillets pointregler.
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PointRules from './PointRules';
import { DEFAULT_POINTS, DEFAULT_PODIUM } from '../lib/tourScoring';

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
  it('viser podie-skalaen for "Etapevinderens hold" (5 / 3 / 1)', () => {
    render(<PointRules />);
    expect(screen.getByText(/Etapevinderens hold/)).toBeInTheDocument();
    expect(screen.getByText(`${DEFAULT_PODIUM.winnerTeam.join(' / ')} p`)).toBeInTheDocument();
  });

  it('viser podie-skalaen for "Bedste hold" (4 / 2 / 1) med N-regel', () => {
    render(<PointRules />);
    expect(screen.getByText(/Bedste hold \(holdets \d+ bedste ryttere\)/)).toBeInTheDocument();
    // Q2-reglen forklares: laveste sum + kvalifikationskravet.
    expect(screen.getByText(/laveste sum vinder/)).toBeInTheDocument();
    expect(screen.getByText(`${DEFAULT_PODIUM.gcTeam.join(' / ')} p`)).toBeInTheDocument();
  });

  it(`viser bjergpoint-rækken`, () => {
    render(<PointRules />);
    expect(screen.getByText(/Flest bjergpoint/)).toBeInTheDocument();
  });

  it(`viser sprintpoint-rækken`, () => {
    render(<PointRules />);
    expect(screen.getByText(/Flest sprintpoint/)).toBeInTheDocument();
  });

  it('bonus giver spørgsmålets egne point — IKKE et fast tal (regression: gammel "10 point"-tekst)', () => {
    const { container } = render(<PointRules />);
    expect(container.textContent).toContain('de point, der står ved spørgsmålet');
    expect(container.textContent).not.toContain('10 point');
  });

  it('forklarer at ikke alle spørgsmål stilles på alle etaper', () => {
    render(<PointRules />);
    expect(screen.getByText(/Ikke alle spørgsmål på alle etaper:/)).toBeInTheDocument();
  });

  it('nævner "Bonus" i ekstra info', () => {
    render(<PointRules />);
    expect(screen.getByText(/Bonus:/)).toBeInTheDocument();
  });

  it('nævner "Utippet etape" i ekstra info', () => {
    render(<PointRules />);
    expect(screen.getByText(/Utippet etape:/)).toBeInTheDocument();
  });

  it('nævner "Deadline" i ekstra info', () => {
    render(<PointRules />);
    expect(screen.getByText(/Deadline:/)).toBeInTheDocument();
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

  it('pointtabellen har 4 rækker (én pr. spørgsmål)', () => {
    const { container } = render(<PointRules />);
    const tbody = container.querySelector('tbody');
    const rows = tbody.querySelectorAll('tr');
    expect(rows.length).toBe(4);
  });
});

describe('PointRules – konsistens med pointkonstanter', () => {
  it('DEFAULT_POINTS.winnerTeam er 5', () => {
    expect(DEFAULT_POINTS.winnerTeam).toBe(5);
  });

  it('DEFAULT_POINTS.gcTeam er 4', () => {
    expect(DEFAULT_POINTS.gcTeam).toBe(4);
  });
});
