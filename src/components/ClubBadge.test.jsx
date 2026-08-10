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

  // ---------------------------------------------------------------------------
  // DE TRE NYE FORMER. Uden dem måtte tre danske trøjer stå ensfarvede, selv om
  // de tydeligt har et mønster — og alternativet var værre: et enkelt brystbånd
  // tegnet som `boejler` bliver til TO bånd, altså en anden trøje.
  // ---------------------------------------------------------------------------
  it('tegner ét skråbånd som en polygon, ikke et rektangel', () => {
    const c = tegn('skraabaand');
    expect(c.querySelectorAll('polygon').length).toBe(1);
    // Et rektangel ville være et vandret bånd — altså `baand`, ikke et skråbånd.
    expect(c.querySelectorAll('rect').length).toBe(0);
  });

  // BÆRENDE for skråbåndet: det skal FALDE. Et polygon med samme y i begge
  // ender ville tegne et vandret bånd og bestå testen ovenfor.
  it('lader skråbåndet falde fra venstre mod højre', () => {
    const p = tegn('skraabaand').querySelector('polygon').getAttribute('points');
    const punkter = p.trim().split(/\s+/).map((par) => par.split(',').map(Number));
    const venstre = Math.min(...punkter.map(([, y]) => y));
    const hoejre = Math.max(...punkter.map(([, y]) => y));
    expect(hoejre - venstre).toBeGreaterThan(5);
  });

  it('tegner ÉT bånd ved baand — ikke to som boejler', () => {
    expect(tegn('baand').querySelectorAll('rect').length).toBe(1);
    expect(tegn('boejler').querySelectorAll('rect').length).toBe(2);
  });

  // Båndet skal ligge over maven, ikke i toppen eller bunden.
  it('lægger baand omkring midten af kroppen', () => {
    const r = tegn('baand').querySelector('rect');
    const y = Number(r.getAttribute('y'));
    const h = Number(r.getAttribute('height'));
    expect(y).toBeGreaterThan(6);
    expect(y + h).toBeLessThan(17);
  });

  // `firkanter` er et EGENTLIGT bræt; `ternet` er to modstående kvadranter.
  // Tegnes de ens, er den ene form overflødig — og OB ville få kvarterer, hvor
  // trøjen har et skakbræt.
  it('tegner firkanter som et bræt, ternet som to kvadranter', () => {
    expect(tegn('ternet').querySelectorAll('rect').length).toBe(2);
    expect(tegn('firkanter').querySelectorAll('rect').length).toBeGreaterThan(4);
    expect(tegn('firkanter').innerHTML).not.toBe(tegn('ternet').innerHTML);
  });

  // Men ikke for mange: kroppen er 6,9 px bred ved størrelse 22, så fire
  // kolonner giver 1,7 px hver og bliver til grød.
  it('holder antallet af firkanter nede', () => {
    expect(tegn('firkanter').querySelectorAll('rect').length).toBeLessThanOrEqual(6);
  });

  // Alle otte former skal give hver sit billede. To ens former er en fejl i
  // vokabularet, ikke i dataen — og den ville først blive opdaget på skærmen.
  it('tegner alle otte mønstre forskelligt', () => {
    const alle = ['striber', 'boejler', 'ternet', 'halveret', 'vandret-delt', 'skraabaand', 'baand', 'firkanter'];
    const billeder = alle.map((m) => tegn(m).querySelector('svg').innerHTML);
    expect(new Set(billeder).size).toBe(alle.length);
  });

  // Et ukendt mønsternavn må tegne INTET — ikke falde tilbage på striber.
  // Ellers ville en stavefejl i dataen give en trøje et mønster, den ikke har.
  it('tegner intet ved et ukendt mønsternavn', () => {
    expect(tegn('skakbraet').querySelectorAll('rect,polygon').length).toBe(0);
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
  // Fulhams udetrøje er ternet. Aflæsningen kaldte den bøjler, fordi tern
  // skifter farve BÅDE vandret og lodret, og målingen valgte den ene akse.
  // Rettet i hånden efter klubbens butik.
  it('tegner tern som fire felter, ikke som bånd', () => {
    const { container } = render(
      <ClubBadge
        variant="troeje" code="FUL" color="#FF0000" color2="#000000"
        moenster="ternet" title="Fulham"
      />,
    );
    const r = [...container.querySelectorAll('rect')];
    expect(r.length).toBe(2);
    // Felterne må ikke stå på samme højde — så var det bånd og ikke tern.
    expect(r[0].getAttribute('y')).not.toBe(r[1].getAttribute('y'));
    expect(r[0].getAttribute('x')).not.toBe(r[1].getAttribute('x'));
  });
});
