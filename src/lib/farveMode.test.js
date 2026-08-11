// ---------------------------------------------------------------------------
// HVILKET BASISTEMA STÅR VI I — OG SIGER SKÆRMEN DET SAMME?
//
// Det andet spørgsmål er det vigtige. `data-theme` blev før kun skrevet af
// `ThemeToggle`, som kun mounter på Min profil, og `theme.css` har ingen
// `@media (prefers-color-scheme: dark)`. Ved en frisk indlæsning fandtes
// attributten altså slet ikke, og siden blev tegnet LYS — også for den, der
// havde valgt mørkt tema.
//
// Så længe farverne lå i CSS, var det "bare" et forkert tema. Da accenten
// begyndte at blive regnet ud i koden, blev det til en MODSIGELSE: opslaget
// faldt tilbage på localStorage, fandt "mørkt", og udledte en lys accentfarve
// til en lys side. FCK-blå gav #608dec — 3,22:1 på et hvidt kort.
// ---------------------------------------------------------------------------
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { laesFarveMode, anvendFarveMode, lytTilFarveMode } from './farveMode';
import { accentTema } from './accentTema';
import { kontrast } from './contrastText';

const root = () => document.documentElement;

function osMoerkt(ja) {
  window.matchMedia = vi.fn().mockImplementation((q) => ({
    matches: ja && q === '(prefers-color-scheme: dark)',
    media: q, addEventListener() {}, removeEventListener() {},
  }));
}

beforeEach(() => {
  localStorage.clear();
  root().removeAttribute('data-theme');
  osMoerkt(false);
});
afterEach(() => root().removeAttribute('data-theme'));

describe('laesFarveMode', () => {
  it('tager attributten først — den er dét, skærmen viser LIGE NU', () => {
    localStorage.setItem('theme', 'dark');
    root().setAttribute('data-theme', 'light');
    expect(laesFarveMode()).toBe('lyst');
  });

  it('falder tilbage på det gemte valg, når attributten mangler', () => {
    localStorage.setItem('theme', 'dark');
    expect(laesFarveMode()).toBe('moerkt');
  });

  it('falder til sidst tilbage på OS-indstillingen', () => {
    osMoerkt(true);
    expect(laesFarveMode()).toBe('moerkt');
    osMoerkt(false);
    expect(laesFarveMode()).toBe('lyst');
  });

  it('overlever, at localStorage kaster', () => {
    // Privat browsertilstand i Safari kaster på getItem. Uden try/catch ville
    // hele modulet dø ved sidestart — og modulet kaldes fra `main.jsx` FØR
    // React monteres, så der ville ikke være noget at fejle pænt tilbage til.
    const rigtig = Object.getOwnPropertyDescriptor(Storage.prototype, 'getItem');
    Storage.prototype.getItem = () => { throw new Error('nægtet'); };
    osMoerkt(true);
    try {
      expect(laesFarveMode()).toBe('moerkt');
      expect(() => anvendFarveMode()).not.toThrow();
    } finally {
      Object.defineProperty(Storage.prototype, 'getItem', rigtig);
    }
  });

  it('lader sig ikke narre af en ukendt værdi i attributten', () => {
    localStorage.setItem('theme', 'dark');
    root().setAttribute('data-theme', 'sepia');
    expect(laesFarveMode()).toBe('moerkt');
  });
});

describe('anvendFarveMode', () => {
  it('skriver attributten, så CSS og kode ser det samme', () => {
    localStorage.setItem('theme', 'dark');
    expect(root().hasAttribute('data-theme')).toBe(false);
    expect(anvendFarveMode()).toBe('moerkt');
    // BÆRENDE. Uden den her linje står `[data-theme='dark']` i theme.css uden
    // at matche noget, og hele den mørke palet er slået fra.
    expect(root().getAttribute('data-theme')).toBe('dark');
  });

  it('skriver den også for lyst — ikke kun for mørkt', () => {
    localStorage.setItem('theme', 'light');
    anvendFarveMode();
    // Fjernede man den gren, ville attributten mangle for lyse brugere, og så
    // ville `laesFarveMode` igen kunne finde noget andet end skærmen.
    expect(root().getAttribute('data-theme')).toBe('light');
  });

  it('lader mørkt OS slå igennem uden et gemt valg', () => {
    osMoerkt(true);
    anvendFarveMode();
    expect(root().getAttribute('data-theme')).toBe('dark');
  });

  // DEN FEJL, DEN FINDES FOR. Uden attributten sagde opslaget "mørkt", mens
  // theme.css tegnede lyst — og accenten blev udledt for det forkerte tema.
  it('gør en lys side og en mørk udledning umulig samtidig', () => {
    localStorage.setItem('theme', 'dark');
    const foer = accentTema('#0d2c6e', laesFarveMode()); // uden attributten
    expect(foer.pitch).toBe('#608dec');
    expect(kontrast(foer.pitch, '#ffffff')).toBeCloseTo(3.22, 1);

    anvendFarveMode();
    // Nu er siden faktisk mørk, og 3,22:1 måles ikke længere mod hvidt papir.
    expect(root().getAttribute('data-theme')).toBe('dark');
    expect(kontrast(accentTema('#0d2c6e', laesFarveMode()).pitch, '#202a34'))
      .toBeGreaterThanOrEqual(4.5);
  });
});

describe('lytTilFarveMode', () => {
  it('kalder tilbage, når attributten skifter', async () => {
    const set = [];
    const stop = lytTilFarveMode((m) => set.push(m));
    root().setAttribute('data-theme', 'dark');
    await Promise.resolve();
    expect(set).toContain('moerkt');
    stop();
    root().setAttribute('data-theme', 'light');
    await Promise.resolve();
    // …og holder op, når man siger op. Ellers ville hver spil-side lægge en
    // observer oveni ved hver navigation.
    expect(set).not.toContain('lyst');
  });
});

describe('main.jsx starter i den rigtige rækkefølge', () => {
  it('sætter basistemaet FØR holdtemaet udledes', async () => {
    // Rækkefølgen ER logikken: `applyTeamTheme` kalder `laesFarveMode`, som
    // læser attributten. Bytter de to linjer plads, udleder den første kørsel
    // igen for det forkerte tema — og intet ville rette den, før brugeren slog
    // temaet manuelt om.
    const { readFileSync } = await import('node:fs');
    const { resolve, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const her = dirname(fileURLToPath(import.meta.url));
    const kode = readFileSync(resolve(her, '../main.jsx'), 'utf8');
    const a = kode.indexOf('anvendFarveMode()');
    const b = kode.indexOf('applyTeamTheme(getInitialTeamTheme())');
    expect(a).toBeGreaterThan(-1);
    expect(b).toBeGreaterThan(-1);
    expect(a).toBeLessThan(b);
    // …og den er IKKE gated på PLATFORM_MODE: platformens spil-tema bruger
    // samme opslag, så begge apps skal have attributten.
    expect(kode).not.toMatch(/PLATFORM_MODE\s*&&\s*anvendFarveMode/);
    expect(kode).not.toMatch(/!PLATFORM_MODE\)\s*anvendFarveMode/);
  });
});
