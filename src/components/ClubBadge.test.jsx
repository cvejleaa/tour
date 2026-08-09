/**
 * Tests for ClubBadge — især trøje-varianten.
 *
 * Badgen står på hver kamp på hver skærm, og den bærer holdets identitet.
 * Cirklen gjorde det med tre bogstaver; trøjen gør det med farve og form, og
 * så skal formen faktisk komme frem.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ClubBadge from './ClubBadge';

const svg = (c) => c.querySelector('svg');

describe('ClubBadge — cirkel (uændret)', () => {
  it('viser kortkoden', () => {
    render(<ClubBadge code="ARS" color="#EC0000" title="Arsenal" />);
    expect(screen.getByText('ARS')).toBeInTheDocument();
  });

  it('er stadig standard, så intet brugssted skifter form af sig selv', () => {
    const { container } = render(<ClubBadge code="ARS" color="#EC0000" />);
    expect(svg(container)).toBeNull();
  });
});

describe('ClubBadge — trøje', () => {
  it('tegner en trøje i klubbens farve', () => {
    const { container } = render(
      <ClubBadge variant="troeje" code="CHE" color="#1B379B" title="Chelsea" />,
    );
    const s = svg(container);
    expect(s).toBeInTheDocument();
    expect(container.innerHTML).toContain('#1B379B');
  });

  // KODEN KAN IKKE VÆRE I TRØJEN — kroppen er for smal ved alle tre
  // størrelser. Brugsstedet viser den ved siden af. Slap den ind i badgen,
  // ville den enten flyde ud over kanten eller blive ulæselig.
  it('bærer ikke kortkoden som tekst', () => {
    const { container } = render(
      <ClubBadge variant="troeje" code="CHE" color="#1B379B" title="Chelsea" />,
    );
    expect(container.textContent).not.toContain('CHE');
  });

  // Holdnavnet er identiteten for skærmlæsere, uanset form.
  it('læses op som holdets navn', () => {
    render(<ClubBadge variant="troeje" code="CHE" color="#1B379B" title="Chelsea" />);
    expect(screen.getByRole('img', { name: 'Chelsea' })).toBeInTheDocument();
  });

  it('giver ærmerne deres egen farve', () => {
    const { container } = render(
      <ClubBadge variant="troeje" code="ARS" color="#EC0000" aerme="#FFFFFF" title="Arsenal" />,
    );
    // Både krop og ærmer skal være der — ikke kun den ene.
    expect(container.innerHTML).toContain('#EC0000');
    expect(container.innerHTML).toContain('#FFFFFF');
  });

  it('bruger kropsfarven på ærmerne, når holdet ikke har en egen', () => {
    const { container } = render(
      <ClubBadge variant="troeje" code="CHE" color="#1B379B" title="Chelsea" />,
    );
    // Tre paths (to ærmer + krop) skal alle bære samme farve.
    const fyld = [...container.querySelectorAll('path[fill]')].map((p) => p.getAttribute('fill'));
    expect(fyld.filter((f) => f === '#1B379B').length).toBeGreaterThanOrEqual(3);
  });
});

describe('ClubBadge — mønstre', () => {
  const tegn = (moenster) => render(
    <ClubBadge
      variant="troeje" code="NEW" color="#FDFDFD" color2="#0A0A0A"
      moenster={moenster} title="Newcastle United"
    />,
  ).container;

  it('tegner lodrette bånd ved striber', () => {
    const r = [...tegn('striber').querySelectorAll('rect')];
    expect(r.length).toBe(2);
    // Lodret = højere end bredt.
    for (const b of r) {
      expect(Number(b.getAttribute('height'))).toBeGreaterThan(Number(b.getAttribute('width')));
    }
  });

  it('tegner vandrette bånd ved bøjler', () => {
    const r = [...tegn('boejler').querySelectorAll('rect')];
    expect(r.length).toBe(2);
    for (const b of r) {
      expect(Number(b.getAttribute('width'))).toBeGreaterThan(Number(b.getAttribute('height')));
    }
  });

  // Striber og bøjler må ikke tegnes ens — det var hele grunden til at måle
  // mønstret i grafikken i stedet for at antage striber.
  it('tegner striber og bøjler forskelligt', () => {
    const s = tegn('striber').innerHTML;
    const b = tegn('boejler').innerHTML;
    expect(s).not.toBe(b);
  });

  it('deler trøjen i to ved halveret', () => {
    expect([...tegn('halveret').querySelectorAll('rect')].length).toBe(1);
  });

  it('tegner intet mønster uden en sekundærfarve', () => {
    const { container } = render(
      <ClubBadge variant="troeje" code="CHE" color="#1B379B" moenster="striber" title="Chelsea" />,
    );
    expect(container.querySelectorAll('rect').length).toBe(0);
  });

  // Tre bånd, ikke tolv: kroppen er 6,9 px bred ved størrelse 22, og flere
  // bånd bliver til en grå tåge — præcis den fejl, et farvegennemsnit laver.
  it('holder antallet af bånd nede', () => {
    expect([...tegn('striber').querySelectorAll('rect')].length).toBeLessThanOrEqual(3);
  });

  // To trøjer på samme kampkort må ikke dele klipsti — så ville den ene miste
  // sit mønster.
  it('giver hver trøje sin egen klipsti', () => {
    const { container } = render(
      <div>
        <ClubBadge variant="troeje" code="NEW" color="#FDFDFD" color2="#0A0A0A" moenster="striber" title="Newcastle" />
        <ClubBadge variant="troeje" code="BOU" color="#FB0000" color2="#000000" moenster="striber" title="Bournemouth" />
      </div>,
    );
    const ider = [...container.querySelectorAll('clipPath')].map((c) => c.id);
    expect(new Set(ider).size).toBe(2);
  });
});
