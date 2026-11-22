// ---------------------------------------------------------------------------
// THEME.CSS SKAL VÆRE ENIG MED `accentTema` — OG DEN GAMLE BLOK SKAL VÆRE VÆK.
//
// Der lå 23 rækker `[data-team='…'] { --c-pitch: …; }` i theme.css, som var en
// håndskrevet kopi af src/data/teamThemes.js. Ingen test bandt de to filer
// sammen, så de kunne glide fra hinanden i det stille — og gjorde det: blokken
// satte --c-on-pitch i øjemål, mens ingen af de fire flader, farven faktisk
// blev tegnet på, blev målt.
//
// jsdom anvender ingen CSS, så filen læses som TEKST. Det er groft, men det er
// den eneste måde at binde et stylesheet til den funktion, der skal have
// regnet det ud.
// ---------------------------------------------------------------------------
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { accentTema, TEMA_VARIABLE } from '../lib/accentTema';
import { kontrast } from '../lib/contrastText';

const CSS = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), './theme.css'), 'utf8');

/** Værdien af en variabel inde i den første blok, der matcher `vaelger`. */
function variabel(vaelger, navn) {
  const start = CSS.indexOf(vaelger);
  expect(start, `${vaelger} findes ikke i theme.css`).toBeGreaterThan(-1);
  const blok = CSS.slice(start, CSS.indexOf('\n}', start));
  const m = blok.match(new RegExp(`${navn}:\\s*([^;]+);`));
  return m ? m[1].trim() : null;
}

describe('theme.css: appens egen accent', () => {
  it('lyst tema er #0b6e4f kørt igennem accentTema', () => {
    const tema = accentTema('#0b6e4f', 'lyst');
    for (const [felt, navn] of Object.entries(TEMA_VARIABLE)) {
      expect(variabel(':root {', navn), navn).toBe(tema[felt]);
    }
  });

  it('mørkt tema er den SAMME farve, men udledt mod de mørke flader', () => {
    const tema = accentTema('#0b6e4f', 'moerkt');
    for (const [felt, navn] of Object.entries(TEMA_VARIABLE)) {
      expect(variabel("[data-theme='dark'] {", navn), navn).toBe(tema[felt]);
    }
    // BÆRENDE: den var #0b6e4f UÆNDRET i mørkt tema, altså 2,33:1 som tekst på
    // --c-surface-2. Står den værdi her igen, er hele rettelsen rullet tilbage.
    // (Tallet stod først som 2,54 — et skøn, jeg aldrig havde regnet efter.
    //  Testen nedenfor MÅLER det nu, så påstanden ikke kan drive igen.)
    expect(variabel("[data-theme='dark'] {", '--c-pitch')).not.toBe('#0b6e4f');
    expect(kontrast('#0b6e4f', '#202a34')).toBeCloseTo(2.33, 2);
    expect(kontrast(variabel("[data-theme='dark'] {", '--c-pitch'), '#202a34'))
      .toBeGreaterThanOrEqual(4.5);
  });

  it('definerer weak og tint i BEGGE temaer', () => {
    // De blev brugt to steder og var aldrig defineret nogen steder.
    for (const vaelger of [':root {', "[data-theme='dark'] {"]) {
      expect(variabel(vaelger, '--c-pitch-weak')).toMatch(/^#[0-9a-f]{6}$/);
      expect(variabel(vaelger, '--c-pitch-tint')).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('har ingen næsten-hvid fallback tilbage', () => {
    // `var(--c-pitch-weak, #eef7f1)` gjorde en manglende definition USYNLIG —
    // og i mørkt tema ulæselig (1,40-1,70:1).
    expect(CSS).not.toContain('#eef7f1');
    expect(CSS).not.toMatch(/var\(--c-pitch-(weak|tint),/);
  });
});

describe('theme.css: den håndholdte holdtema-blok', () => {
  it('er væk', () => {
    // Ikke "er rettet" — VÆK. Så længe én af rækkerne stod, ville den vinde
    // over inline-variablerne i en gren, ingen huskede at teste.
    // Kun i begyndelsen af en linje: kommentaren, der forklarer hvorfor blokken
    // er væk, citerer selv en af rækkerne.
    expect(CSS).not.toMatch(/^\[data-team='[a-z]+'\]/m);
  });
});

describe('theme.css: den gule accent har sit eget blæk', () => {
  it('bruger --c-on-accent, ikke --c-pitch-dark', () => {
    // --c-pitch-dark er en FLADE nu, og i mørkt tema en lys en. Blev den ved
    // med at være tekstfarve oven på den gule --c-accent, ville .btn--accent
    // og .chance-pill stå lysegrøn på gul.
    expect(CSS).toContain('--c-on-accent:');
    expect(CSS).not.toMatch(/var\(--c-accent\);?\s*color: var\(--c-pitch-dark\)/);
  });
});

// ---------------------------------------------------------------------------
// HVEM TIPPEDE HVAD (LeagueBets): fed grøn til de rigtige, læselig dæmpning
// til de forkerte. jsdom anvender ingen CSS, så komponenttesten kan kun se
// KLASSEN hvem--ramt; at klassen er fed grøn og læselig, måles her.
// ---------------------------------------------------------------------------

/** Alle regler som [selektor, krop] — kommentarer fjernet. */
const REGLER = CSS.replace(/\/\*[\s\S]*?\*\//g, '')
  .split('}')
  .map((del) => del.split('{'))
  .filter((d) => d.length === 2)
  .map(([sel, krop]) => [sel.trim(), krop]);
/** Kroppene af de regler, hvis selektorliste indeholder `sel` præcist. */
const kroppe = (sel) => REGLER
  .filter(([s]) => s.split(',').map((x) => x.trim()).includes(sel))
  .map(([, k]) => k);

describe('theme.css: hvem tippede hvad', () => {
  const LYS = ':root {';
  const MOERK = "[data-theme='dark'] {";

  it('de rigtige navne er fed i et grønt BLÆK, der holder 4,5:1 i begge temaer', () => {
    const krop = kroppe('.hvem--ramt li').join(' ');
    expect(krop).toMatch(/color:\s*var\(--c-ok-blaek\)/);
    expect(krop).toMatch(/font-weight:\s*700/);
    expect(kontrast(variabel(LYS, '--c-ok-blaek'), variabel(LYS, '--c-surface'))).toBeGreaterThanOrEqual(4.5);
    expect(kontrast(variabel(MOERK, '--c-ok-blaek'), variabel(MOERK, '--c-surface'))).toBeGreaterThanOrEqual(4.5);
    // Grunden til, at --c-ok ikke selv blev brugt: som tekst på hvidt kort er
    // den 3,49:1 — rødt, hvis nogen bytter blækket tilbage.
    expect(kontrast(variabel(LYS, '--c-ok'), variabel(LYS, '--c-surface'))).toBeCloseTo(3.49, 2);
  });

  it('de forkerte dæmpes med --c-muted, der holder 4,5:1 — og ALDRIG med opacity', () => {
    // «Joe tippede 2 igen» er halvdelen af sjovet; navnet skal kunne læses.
    expect(kroppe('.hvem--forbi li').join(' ')).toMatch(/color:\s*var\(--c-muted\)/);
    expect(kontrast(variabel(LYS, '--c-muted'), variabel(LYS, '--c-surface'))).toBeGreaterThanOrEqual(4.5);
    expect(kontrast(variabel(MOERK, '--c-muted'), variabel(MOERK, '--c-surface'))).toBeGreaterThanOrEqual(4.5);
    const hvemRegler = REGLER.filter(([s]) => /\.hvem/.test(s));
    expect(hvemRegler.length).toBeGreaterThan(5);
    for (const [s, k] of hvemRegler) expect(k, s).not.toMatch(/opacity/);
  });

  it('grønt kun i den RAMTE kolonne — og «Dig» aldrig i accentfarven', () => {
    // --c-pitch er spillerens holdtema og som standard grøn. Et fed grønt «Dig»
    // i en forkert kolonne ville ligne "ramt" (QC).
    for (const [s, k] of REGLER.filter(([sel]) => /\.hvem/.test(sel))) {
      if (!/hvem--ramt/.test(s)) expect(k, s).not.toMatch(/--c-ok|--c-pitch/);
    }
    expect(kroppe('.hvem__dig').join(' ')).toMatch(/font-weight:\s*700/);
  });

  it('kolonnerne kan ikke blive bredere end deres tredjedel', () => {
    // 1fr er minmax(auto,1fr): ét langt navn uden mellemrum ville skubbe
    // gitteret ud af flugt med knapperne.
    expect(kroppe('.hvem-grid').join(' ')).toMatch(/repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
    expect(kroppe('.hvem li').join(' ')).toMatch(/overflow-wrap:\s*anywhere/);
  });

  it('de forkerte kolonner er hverken grønne eller fede — fed grøn er KUN de rigtiges belønning', () => {
    // Selv om .hvem--forbi li senere overskriver farven, ville en fælles regel
    // med .hvem--ramt stadig gøre de forkerte fede.
    const forbi = REGLER.filter(([s]) => /hvem--forbi/.test(s));
    expect(forbi.length).toBeGreaterThan(0);
    for (const [s, k] of forbi) {
      expect(k, s).not.toMatch(/c-ok/);
      expect(k, s).not.toMatch(/font-weight:\s*700/);
    }
    const ramt = REGLER.filter(([s]) => /hvem--ramt/.test(s));
    for (const [s] of ramt) expect(s, 'ramt-regel må ikke dele selektor med forbi').not.toMatch(/hvem--forbi/);
  });

  it('«Ingen så den komme» i den rigtige kolonne er også fed grøn', () => {
    const krop = kroppe('.hvem--ramt .hvem__tom').join(' ');
    expect(krop).toMatch(/color:\s*var\(--c-ok-blaek\)/);
    expect(krop).toMatch(/font-weight:\s*700/);
  });
});
