// Tests for GameTabLink — internt link til en anden fane i samme spil.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import GameTabLink, { gameTabPath, withTab } from './GameTabLink';

/** Render inde på den rigtige rute, så useParams giver et spil-id. */
function iSpil(ui, url = '/spil/sl') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/spil/:gameId" element={ui} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('gameTabPath', () => {
  it('lader standardfanen være uden parameter — URL\'en skal være ren', () => {
    expect(gameTabPath('sl')).toBe('/spil/sl');
    expect(gameTabPath('sl', { fane: 'tip' })).toBe('/spil/sl');
  });

  it('sætter fanen som parameter', () => {
    expect(gameTabPath('sl', { fane: 'stilling' })).toBe('/spil/sl?fane=stilling');
  });

  it('kan forvælge en liga på Ligaer-fanen', () => {
    expect(gameTabPath('sl', { fane: 'ligaer', liga: 'L1' })).toBe('/spil/sl?fane=ligaer&liga=L1');
  });

  it('kan pege på en bestemt runde', () => {
    expect(gameTabPath('sl', { fane: 'tip', runde: 3 })).toBe('/spil/sl?runde=3');
    expect(gameTabPath('sl', { fane: 'mine', runde: 3 })).toBe('/spil/sl?fane=mine&runde=3');
  });

  // Runder er 1-indekserede, og læseren i FootballTip ignorerer 0 og negative
  // tal. Byggeren må derfor ikke producere dem.
  it('udelader runder, der ikke findes', () => {
    expect(gameTabPath('sl', { fane: 'tip', runde: 0 })).toBe('/spil/sl');
    expect(gameTabPath('sl', { fane: 'tip', runde: -1 })).toBe('/spil/sl');
    expect(gameTabPath('sl', { fane: 'stilling', runde: 0 })).toBe('/spil/sl?fane=stilling');
  });
});

describe('GameTabLink', () => {
  it('linker til fanen i det spil, man står i', () => {
    iSpil(<GameTabLink fane="ligaer">Ligaer</GameTabLink>);
    expect(screen.getByRole('link', { name: 'Ligaer' }))
      .toHaveAttribute('href', '/spil/sl?fane=ligaer');
  });

  it('bruger spil-id\'et fra URL\'en, ikke et fast', () => {
    iSpil(<GameTabLink fane="elo">Elo</GameTabLink>, '/spil/vm2026');
    expect(screen.getByRole('link', { name: 'Elo' }))
      .toHaveAttribute('href', '/spil/vm2026?fane=elo');
  });

  // Uden spil-id er der intet at linke til. Et dødt link ville være værre end
  // ren tekst: det ser klikbart ud og fører ingen steder hen.
  it('viser ren tekst uden for et spil frem for et dødt link', () => {
    render(
      <MemoryRouter initialEntries={['/spil']}>
        <Routes>
          <Route path="/spil" element={<GameTabLink fane="ligaer">Ligaer</GameTabLink>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('Ligaer')).toBeInTheDocument();
  });
});

describe('withTab', () => {
  const p = (qs) => new URLSearchParams(qs);

  it('sætter fanen', () => {
    expect(withTab(p(''), 'stilling').toString()).toBe('fane=stilling');
  });

  it('fjerner parameteren for standardfanen', () => {
    expect(withTab(p('fane=elo'), 'tip').toString()).toBe('');
  });

  // Kernen: et fane-klik må ikke tørre runden af.
  it('bevarer de øvrige parametre', () => {
    expect(withTab(p('runde=7'), 'elo').toString()).toBe('runde=7&fane=elo');
    expect(withTab(p('fane=tip&runde=7'), 'tip').toString()).toBe('runde=7');
  });

  it('rører ikke det oprindelige sæt', () => {
    const før = p('runde=7');
    withTab(før, 'elo');
    expect(før.toString()).toBe('runde=7');
  });
});
