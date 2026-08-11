// ---------------------------------------------------------------------------
// SPEJLINGEN AF LIGA-POINTENE.
//
// Serveren skriver `perRound`; fladen lægger sammen. Er de to udgaver uenige
// om, hvad en runde bidrager med, viser ligaens stilling andre tal end dem,
// serveren har regnet — og ingen af delene ville fejle.
//
// Grenene er valgt, så hver især kan drive alene: gulvet ved 0, puljens
// grænse, kampe uden rundenummer, og en startrunde efter sidste runde.
// ---------------------------------------------------------------------------
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const server = require('./ligaPoint');

const VEKTORER = [
  ['almindelig sæson', { 1: 10, 2: 5, 3: -2, 4: 8 }],
  ['med tabt Chancen', { 4: 8, 5: -20 }],
  ['kamp uden rundenummer', { 1: 10, uden: 3 }],
  ['fremmede nøgler', { 1: 5, pulje: 34, ukendt: 100 }],
  ['tom', {}],
];

describe('spejling mod src/lib', () => {
  for (const [navn, vektor] of VEKTORER) {
    for (const startRunde of [null, 1, 2, 3, 4, 99]) {
      for (const pulje of [0, 34]) {
        it(`matcher src: ${navn} · runde ${startRunde} · pulje ${pulje}`, async () => {
          const src = await import('../src/lib/ligaPoint.js');
          expect(server.ligaPoint(vektor, startRunde, pulje))
            .toBe(src.ligaPoint(vektor, startRunde, pulje));
        });
      }
    }
  }

  it('matcher src på puljens grænse', async () => {
    const src = await import('../src/lib/ligaPoint.js');
    expect(server.PULJE_MAKS_STARTRUNDE).toBe(src.PULJE_MAKS_STARTRUNDE);
    expect(server.UDEN_RUNDE).toBe(src.UDEN_RUNDE);
    for (const r of [null, 1, 2, 3, 4, 20]) {
      expect(server.puljenTaeller(r)).toBe(src.puljenTaeller(r));
    }
  });

  // PARITETEN KAN IKKE SE SYMMETRISK DRIFT. Ændres begge spejle ens, bliver de
  // ved med at være enige. Grænsen måles derfor mod en HÅNDSKREVET forventning.
  it('serverudgaven har præcis ét rundes slæk til puljens deadline', () => {
    // Superligaens puljeLockAt er 1. august 15:59 UTC, lige før runde 2.
    expect(server.PULJE_MAKS_STARTRUNDE).toBe(3);
    expect(server.puljenTaeller(3)).toBe(true);
    expect(server.puljenTaeller(4)).toBe(false);
  });
});
