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
    // BÆRENDE: den var #0b6e4f UÆNDRET i mørkt tema, altså 2,54:1 som tekst på
    // --c-surface-2. Står den værdi her igen, er hele rettelsen rullet tilbage.
    expect(variabel("[data-theme='dark'] {", '--c-pitch')).not.toBe('#0b6e4f');
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
