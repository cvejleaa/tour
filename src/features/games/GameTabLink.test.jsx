// Tests for GameTabLink — internt link til en anden fane i samme spil.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import GameTabLink, { gameTabPath } from './GameTabLink';

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
    expect(gameTabPath('sl', 'tip')).toBe('/spil/sl');
  });

  it('sætter fanen som parameter', () => {
    expect(gameTabPath('sl', 'stilling')).toBe('/spil/sl?fane=stilling');
  });

  it('kan pege på en bestemt runde', () => {
    expect(gameTabPath('sl', 'tip', 3)).toBe('/spil/sl?runde=3');
    expect(gameTabPath('sl', 'mine', 3)).toBe('/spil/sl?fane=mine&runde=3');
  });

  // Runder er 1-indekserede, og læseren i FootballTip ignorerer 0 og negative
  // tal. Byggeren må derfor ikke producere dem.
  it('udelader runder, der ikke findes', () => {
    expect(gameTabPath('sl', 'tip', 0)).toBe('/spil/sl');
    expect(gameTabPath('sl', 'tip', -1)).toBe('/spil/sl');
    expect(gameTabPath('sl', 'stilling', 0)).toBe('/spil/sl?fane=stilling');
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
