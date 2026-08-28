// Paritetstest: fanebredde.mjs' ADMIN_FANER er en HARDKODET KOPI af
// AdminPage.jsx' faneetiketter, og et spejl uden vagt er den næste
// "Spillene lige nu"-løgn. Uden denne test kunne en ny fane landes uden at
// komme med i harnesset, og målingen af fanerækkens bredde ville tavst gælde
// en række, der ikke findes.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ADMIN_FANER } from './fanebredde.mjs';

const kilde = readFileSync(`${process.cwd()}/src/pages/AdminPage.jsx`, 'utf8');
const guide = readFileSync(`${process.cwd()}/docs/admin-guide.md`, 'utf8');

/** Etiketterne i AdminPage, i den rækkefølge de står. */
function etiketterFraKilden() {
  return [...kilde.matchAll(/\blabel:\s*'([^']+)'/g)].map((m) => m[1]);
}

describe('fanebredde.mjs spejler AdminPage', () => {
  it('kender hver eneste PLATFORM-fane, der findes i AdminPage', () => {
    const iKilden = etiketterFraKilden();
    // Harnesset måler ejerens faner på platformen. Tour-fanerne står også i
    // AdminPage, men bag PLATFORM_MODE-gaten, så de er ikke med — derfor
    // testes DELMÆNGDE-retningen: alt i harnesset skal findes i kilden.
    for (const f of ADMIN_FANER) {
      expect(iKilden, `"${f}" står i harnesset, men findes ikke i AdminPage`).toContain(f);
    }
  });

  it('mangler ingen af de faner, harnesset skal måle', () => {
    // Den anden retning, og den vigtige: en NY platform-fane skal tvinge
    // harnesset til at blive rettet. Tour-only-fanerne udelades eksplicit, så
    // listen her er en BESLUTNING og ikke bare det, der tilfældigvis passer.
    // Hver fane skal KLASSIFICERES, ikke bare passe. Listen her er gated på
    // !PLATFORM_MODE i AdminPage — '⚙️ Indstillinger' kom med, fordi testen
    // afslørede den: den er isOwner && !PLATFORM_MODE, altså Tour-only.
    const kunTour = [
      '🚴 Tour', '🏷️ Ryttertyper', 'Bonus', 'Ligaer', '📋 Køreplan',
      '⚙️ Indstillinger',
    ];
    const forventet = etiketterFraKilden().filter((f) => !kunTour.includes(f));
    expect(ADMIN_FANER).toEqual(forventet);
  });

  it('har den nye Liga-medlemmer-fane med', () => {
    expect(ADMIN_FANER).toContain('🧑‍🤝‍🧑 Liga-medlemmer');
    // Og den må IKKE hedde det samme som spillets egen Ligaer-fane.
    expect(ADMIN_FANER).not.toContain('👥 Ligaer');
  });
});

// Anden gang en ny admin-fane ramte koden korrekt, men ikke docs-spejlet
// (Quality Controls fund). Guiden er den flade, ejeren slår op i, når han
// ikke kan finde en knap — en fane, den ikke nævner, er reelt uopdaget.
// Derfor bindes den her, i stedet for at blive husket.
describe('docs/admin-guide.md spejler admin-fanerne', () => {
  it('nævner hver platform-fane, harnesset måler', () => {
    // Emojien tælles ikke med: guiden skriver navnene i en prosalinje, og en
    // emoji-forskel dér er ikke det, testen skal fange. Ordene er.
    const udenEmoji = (s) => s.replace(/[^\p{L}\p{N}\s-]/gu, '').trim();
    for (const fane of ADMIN_FANER) {
      const ord = udenEmoji(fane);
      expect(
        udenEmoji(guide).includes(ord),
        `admin-guide.md nævner ikke "${ord}" — en fane, guiden ikke kender, `
        + 'er reelt uopdaget for den, der slår op i den',
      ).toBe(true);
    }
  });
});
