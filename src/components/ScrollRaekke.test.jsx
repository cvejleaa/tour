// Tests for ScrollRaekke — hintet, der viser at en række gemmer noget.
//
// Safari-rapporten (aug. 2026): "fanerne kommer ikke frem". Målt med
// scripts/fanebredde.mjs: 3 af 9 faner synlige på telefon, resten skjult
// uden markering. Denne fil beviser mekanikken — IKKE kun at noget blev
// renderet: klasse-skiftet fra observeren, argumenterne til scrollIntoView
// (uden block:'nearest' hopper HELE siden — QC-fund) og CSS'ens
// pointer-events (uden den æder overlægget klik på yderste fane).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ScrollRaekke from './ScrollRaekke';

// jsdom har ingen IntersectionObserver — stubben fanger callback og options,
// så testen kan SPILLE observeren og se, hvad komponenten gør ved svaret.
let observere;
class FakeIO {
  constructor(cb, options) {
    this.cb = cb;
    this.options = options;
    this.sete = [];
    this.disconnected = false;
    observere.push(this);
  }

  observe(el) { this.sete.push(el); }

  disconnect() { this.disconnected = true; }
}

beforeEach(() => {
  observere = [];
  vi.stubGlobal('IntersectionObserver', FakeIO);
});
afterEach(() => vi.unstubAllGlobals());

const raekke = (props = {}) => render(
  <ScrollRaekke className="tabs" role="tablist" {...props}>
    <button className="tab tab--active">Tip</button>
    <button className="tab">Elo</button>
  </ScrollRaekke>,
);

describe('ScrollRaekke — vagterne og klasserne', () => {
  it('observerer begge vagter med rækken som root — og rammen starter uden hint', () => {
    const { container } = raekke();
    const [io] = observere;
    const indre = container.querySelector('.tabs');
    expect(io.sete).toEqual([indre.firstElementChild, indre.lastElementChild]);
    expect(io.options.root).toBe(indre);
    expect(container.firstChild.className).toBe('scrollx');
  });

  it('en usynlig vagt tænder hintet i SIN ende — og slukker det igen, når den ses', () => {
    const { container } = raekke();
    const [io] = observere;
    const ramme = container.firstChild;
    const [venstre, hoejre] = io.sete;
    io.cb([{ target: hoejre, isIntersecting: false }]);
    expect(ramme.classList.contains('scrollx--hoejre')).toBe(true);
    expect(ramme.classList.contains('scrollx--venstre')).toBe(false);
    io.cb([{ target: venstre, isIntersecting: false }, { target: hoejre, isIntersecting: true }]);
    expect(ramme.classList.contains('scrollx--venstre')).toBe(true);
    expect(ramme.classList.contains('scrollx--hoejre')).toBe(false);
  });

  it('kobler observeren af ved unmount', () => {
    const { unmount } = raekke();
    unmount();
    expect(observere[0].disconnected).toBe(true);
  });

  it('vagterne er skjult for skærmlæsere', () => {
    const { container } = raekke();
    for (const vagt of container.querySelectorAll('.scrollx__vagt')) {
      expect(vagt.getAttribute('aria-hidden')).toBe('true');
    }
  });
});

describe('ScrollRaekke — aktiv fane scrolles i syne', () => {
  it('kalder scrollIntoView med BÅDE inline og block "nearest" — alt andet flytter hele siden', () => {
    // Argument-asserten er selve båndet: en kaldt-uden-argumenter-stub ville
    // være grøn både med og uden block:'nearest' (QC-fund på planen).
    const spy = vi.fn();
    Element.prototype.scrollIntoView = spy;
    const { rerender } = render(
      <ScrollRaekke className="tabs" aktivNoegle="tip">
        <button className="tab tab--active">Tip</button>
      </ScrollRaekke>,
    );
    expect(spy).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
    spy.mockClear();
    rerender(
      <ScrollRaekke className="tabs" aktivNoegle="elo">
        <button className="tab tab--active">Elo</button>
      </ScrollRaekke>,
    );
    expect(spy).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
    delete Element.prototype.scrollIntoView;
  });

  it('uden aktivNoegle scrolles der aldrig', () => {
    const spy = vi.fn();
    Element.prototype.scrollIntoView = spy;
    raekke();
    expect(spy).not.toHaveBeenCalled();
    delete Element.prototype.scrollIntoView;
  });
});

describe('ScrollRaekke — CSS-kontrakten i theme.css', () => {
  const css = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '../styles/theme.css'),
    'utf8',
  );

  it('overlægget må ikke kunne æde klik: pointer-events none i .scrollx-blokken', () => {
    const blok = css.slice(css.indexOf('.scrollx::before,'), css.indexOf('.scrollx::before {'));
    expect(blok).toContain('pointer-events: none');
  });

  it('.tabs wrapper på desktop og scroller kun under 720 px — begge grene skal stå der', () => {
    // Rødt af den GAMLE CSS (overflow-x altid, ingen wrap): dette bånd måler
    // netop skiftet, ikke bare at ordene findes et sted i filen.
    const tabsBlok = css.slice(css.indexOf('.tabs {'), css.indexOf('.tab {'));
    expect(tabsBlok).toContain('flex-wrap: wrap');
    expect(tabsBlok).toMatch(/@media \(max-width: 720px\) \{[^}]*\.tabs \{[^}]*flex-wrap: nowrap/);
    expect(tabsBlok).toMatch(/@media \(max-width: 720px\) \{[^}]*\.tabs \{[^}]*overflow-x: auto/);
  });

  it('hint-blækket findes i BEGGE temaer — en mørk fade drukner på mørk baggrund', () => {
    expect(css).toMatch(/:root \{ --scrollx-blaek:/);
    expect(css).toMatch(/\[data-theme='dark'\] \{ --scrollx-blaek:/);
  });
});
