// Tests for MatchElo — Elo-rating og seneste udvikling på kampkortet.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import MatchElo from './MatchElo';

const ELO = {
  AGF: {
    current: 1525,
    start: 1500,
    trend: 15,
    form: [
      { round: 2, elo: 1505, delta: -5 },
      { round: 3, elo: 1520, delta: 15 },
      { round: 4, elo: 1515, delta: -5 },
      { round: 5, elo: 1530, delta: 15 },
      { round: 6, elo: 1525, delta: -5 },
    ],
  },
  FCK: { current: 1620, start: 1600, trend: 20, form: [{ round: 6, elo: 1620, delta: 20 }] },
};

const renderIt = (props = {}) =>
  render(<MatchElo home="AGF" away="FCK" eloByTeam={ELO} {...props} />);

describe('MatchElo', () => {
  it('viser begge holds aktuelle rating', () => {
    const { container } = renderIt();
    expect(container.textContent).toContain('1525');
    expect(container.textContent).toContain('1620');
  });

  it('viser ét udviklingspunkt pr. spillet runde', () => {
    renderIt();
    const stribe = screen.getByLabelText(/AGF: udvikling over de seneste 5 runder/);
    expect(stribe.children).toHaveLength(5);
  });

  // Retningen skal kunne læses uden at regne: ▲ op, ▼ ned.
  it('markerer op og ned hver for sig', () => {
    renderIt();
    const stribe = screen.getByLabelText(/AGF: udvikling/);
    const tekster = [...stribe.children].map((c) => c.textContent);
    expect(tekster).toEqual(['▼5', '▲15', '▼5', '▲15', '▼5']);
  });

  it('viser forskellen mellem holdene — det er dét, odds bygger på', () => {
    const { container } = renderIt();
    // FCK er 95 stærkere end AGF, så pilen peger mod udebanen.
    expect(container.textContent).toContain('95');
    expect(container.textContent).toContain('→');
  });

  it('siger til, når sæsonen ikke har givet udviklingspunkter endnu', () => {
    renderIt({
      eloByTeam: {
        AGF: { current: 1500, start: 1500, trend: 0, form: [] },
        FCK: { current: 1600, start: 1600, trend: 0, form: [] },
      },
    });
    expect(screen.getByText(/Start-rating/)).toBeInTheDocument();
  });

  it('viser færre punkter, når der er spillet færre runder', () => {
    renderIt();
    const stribe = screen.getByLabelText(/FCK: udvikling over de seneste 1 runder/);
    expect(stribe.children).toHaveLength(1);
  });

  it('viser intet, når spillet slet ikke har Elo', () => {
    const { container } = renderIt({ eloByTeam: {} });
    expect(container).toBeEmptyDOMElement();
  });

  it('klarer at kun det ene hold har rating', () => {
    const { container } = renderIt({ eloByTeam: { AGF: ELO.AGF } });
    expect(container.textContent).toContain('1525');
    // Ingen forskel at vise, når modstanderen mangler.
    expect(container.textContent).not.toContain('→');
  });
});
