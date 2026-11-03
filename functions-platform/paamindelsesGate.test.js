// ---------------------------------------------------------------------------
// paamindelsesGate.test.js — hvilke spil forventer daglige påmindelser, og
// er serverens gate og klientens spejl (spilEvner.forventerPaamindelser) ENIGE?
// ---------------------------------------------------------------------------
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { forventerPaamindelser as klientGate } from '../src/features/games/spilEvner.js';
import { GAMES } from '../scripts/games.mjs';

const require = createRequire(import.meta.url);
const { forventerPaamindelser } = require('./paamindelsesGate');

describe('forventerPaamindelser', () => {
  it('sand for fodbold-spil med status open eller live', () => {
    expect(forventerPaamindelser({ type: 'football', status: 'open' })).toBe(true);
    expect(forventerPaamindelser({ type: 'football', status: 'live' })).toBe(true);
  });

  it('falsk for afsluttede spil, ikke-fodbold, manglende/ukendt status og manglende spil', () => {
    expect(forventerPaamindelser({ type: 'football', status: 'finished' })).toBe(false);
    expect(forventerPaamindelser({ type: 'cycling', status: 'live' })).toBe(false);
    expect(forventerPaamindelser({ type: 'football' })).toBe(false);
    expect(forventerPaamindelser({ type: 'football', status: 'mystisk' })).toBe(false);
    expect(forventerPaamindelser(null)).toBe(false);
    expect(forventerPaamindelser(undefined)).toBe(false);
  });

  // `paused` er en TILSTAND, kortet viser — aldrig en gate. Muteres gaten til
  // også at se på paused, forsvinder et pauset spils kort præcis dér, hvor
  // man leder efter tavse udfald — og denne linje bliver rød.
  it('paused fjerner IKKE spillet fra gaten', () => {
    expect(forventerPaamindelser({ type: 'football', status: 'live', paused: true })).toBe(true);
  });
});

// SPEJL-PARITET (mailMarkdown-mønstret, blot adfærd i stedet for bytes —
// modulerne er CJS/ESM og kan ikke være byte-identiske): server og klient
// skal svare ENS på hele tilstandsmatrixen. Driver de fra hinanden, kan
// DriftTab forvente et kort, jobbet aldrig skriver — eller omvendt.
describe('spejl-paritet med src/features/games/spilEvner.js', () => {
  const matrix = [];
  for (const type of ['football', 'cycling', undefined]) {
    for (const status of ['open', 'live', 'finished', undefined, 'mystisk']) {
      for (const paused of [true, false, undefined]) {
        matrix.push({ type, status, paused });
      }
    }
  }

  it(`server og klient er enige om alle ${matrix.length} kombinationer (+ null/undefined)`, () => {
    for (const game of [...matrix, null, undefined]) {
      expect(forventerPaamindelser(game), JSON.stringify(game)).toBe(klientGate(game));
    }
  });

  // VENDT MED VILJE (D6): Håndbold-VM er et åbent kampspil og forventer
  // påmindelser — også uden synk (gaten er bevidst ikke gated på provider:
  // et håndseedet spil skal også rykke sine spillere). Skjult (joinable:
  // false) har det ingen spillere, så jobbet sender intet, men Drift-kortet
  // for 09-jobbet findes fra fødslen og kan ikke stå tavst.
  it('præcis Superligaen, PL og Håndbold-VM forventer påmindelser i den levende spilliste', () => {
    const med = GAMES.filter((g) => forventerPaamindelser(g)).map((g) => g.id).sort();
    expect(med).toEqual(['hvm2027', 'pl2627-efteraar', 'superliga2627']);
  });
});
