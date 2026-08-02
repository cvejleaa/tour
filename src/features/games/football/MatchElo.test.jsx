// Tests for MatchElo — Elo-rating og seneste udvikling på kampkortet.
//
// Assertions er bevidst præcise (title-attributter, eksakte tekster) frem for
// toContain: "1525" findes også i "-1525", og en løs assertion kan ikke
// skelne en rigtig visning fra en forkert.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import MatchElo from './MatchElo';

const punkt = (round, elo, delta) => ({ round, elo, delta });

const AGF = { // navnet i seedet er 'AGF'
  current: 1525,
  start: 1500,
  trend: 15,
  form: [
    punkt(2, 1505, -5), punkt(3, 1520, 15), punkt(4, 1515, -5),
    punkt(5, 1530, 15), punkt(6, 1525, -5),
  ],
};
const FCK = { current: 1620, start: 1600, trend: 20, form: [punkt(6, 1620, 20)] };
const UDEN = (elo) => ({ current: elo, start: elo, trend: 0, form: [] });

const renderIt = (props = {}) =>
  render(<MatchElo home="AGF" away="FCK" eloByTeam={{ AGF, FCK }} {...props} />);

describe('MatchElo', () => {
  it('viser begge holds aktuelle rating', () => {
    renderIt();
    expect(screen.getByTitle('AGF: rating 1525')).toBeInTheDocument();
    expect(screen.getByTitle('FCK: rating 1620')).toBeInTheDocument();
  });

  it('viser ét udviklingspunkt pr. spillet runde', () => {
    renderIt();
    expect(screen.getByLabelText(/AGF: udvikling over de seneste 5 runder/).children).toHaveLength(5);
  });

  it('markerer op og ned hver for sig', () => {
    renderIt();
    const stribe = screen.getByLabelText(/AGF: udvikling/);
    expect([...stribe.children].map((c) => c.textContent))
      .toEqual(['▼5', '▲15', '▼5', '▲15', '▼5']);
  });

  it('viser ±0 for en runde uden bevægelse', () => {
    renderIt({
      eloByTeam: { AGF: { ...AGF, trend: 0, form: [punkt(6, 1525, 0)] }, FCK },
    });
    const stribe = screen.getByLabelText(/AGF: udvikling/);
    expect(stribe.textContent).toBe('±0');
  });

  it('siger til, når sæsonen ikke har givet udviklingspunkter endnu', () => {
    renderIt({ eloByTeam: { AGF: UDEN(1500), FCK: UDEN(1600) } });
    expect(screen.getByText(/Start-rating/)).toBeInTheDocument();
  });

  // Har ét hold spillet runder, er det ikke "start-rating" — så skal beskeden væk.
  it('siger ikke start-rating, når kun det ene hold har punkter', () => {
    renderIt({ eloByTeam: { AGF, FCK: UDEN(1600) } });
    expect(screen.queryByText(/Start-rating/)).not.toBeInTheDocument();
  });

  // Med præcis én spillet runde skal teksten ikke sige "de seneste 1 runder".
  it('bøjer teksten rigtigt ved én enkelt runde', () => {
    const { container } = renderIt({ eloByTeam: { AGF: FCK, FCK } });
    expect(screen.getAllByLabelText(/udvikling seneste runde/)).toHaveLength(2);
    expect(container.textContent).toContain('seneste runde');
    expect(container.textContent).not.toContain('seneste 1');
  });

  it('viser færre punkter, når der er spillet færre runder', () => {
    renderIt();
    expect(screen.getByLabelText(/FCK: udvikling seneste runde/).children).toHaveLength(1);
  });

  it('viser intet, når spillet slet ikke har Elo', () => {
    const { container } = renderIt({ eloByTeam: {} });
    expect(container).toBeEmptyDOMElement();
  });

  it('klarer at kun det ene hold har rating', () => {
    renderIt({ eloByTeam: { AGF } });
    expect(screen.getByTitle('AGF: rating 1525')).toBeInTheDocument();
  });

  // Vi viser bevidst IKKE, hvem der er stærkest: odds lægger 60 point
  // hjemmebanefordel oveni, så et "hvem vinder" her ville modsige knapperne
  // lige nedenunder.
  it('udtaler sig ikke om, hvem der er favorit', () => {
    const { container } = renderIt();
    expect(container.textContent).not.toContain('→');
    expect(container.textContent).not.toContain('←');
    expect(container.textContent).toContain('ikke et bud på denne kamp');
  });
});
