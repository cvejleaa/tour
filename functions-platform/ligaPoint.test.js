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

  // VAGTEN SKAL SPEJLES OGSÅ. Den afgør, om en spiller vises som "ikke klar"
  // — i fladen OG i Runde-Bottens opslag. Drev de to fra hinanden, kunne
  // botten poste en total, fladen nægter at vise, eller omvendt. Totalerne
  // er valgt, så de rammer begge sider af slækket: præcis, inden for
  // afrundings-driften, og et helt point ved siden af.
  for (const [navn, vektor] of VEKTORER) {
    for (const total of [0, 21, 21.1, 26, 39]) {
      for (const pulje of [0, 34]) {
        it(`matcher src på vektorStemmer: ${navn} · total ${total} · pulje ${pulje}`, async () => {
          const src = await import('../src/lib/ligaPoint.js');
          expect(server.vektorStemmer(vektor, total, pulje))
            .toBe(src.vektorStemmer(vektor, total, pulje));
        });
      }
    }
  }

  it('matcher src på slækkets KANT — den eneste gren, der kan drive uset', async () => {
    // Løkken ovenfor ramte aldrig kanten: dens totaler lå enten klart inden
    // for eller klart uden for slækket, og en server med et HELT andet slæk
    // (0,5 mod 0,25) bestod hele paritetstesten. Det er husets egen
    // "et bånd, der rummer både før og efter, måler ingenting".
    //
    // Vektoren har fire nøgler og summer til 21, så slækket er
    // 0,05 · 4 + 0,05 = 0,25. Tallene herunder ligger på begge sider af
    // præcis den grænse.
    const src = await import('../src/lib/ligaPoint.js');
    const vektor = { 1: 10, 2: 5, 3: -2, 4: 8 };
    for (const total of [21, 21.2, 21.25, 21.3, 21.4, 21.5, 22]) {
      expect(server.vektorStemmer(vektor, total, 0), `total ${total}`)
        .toBe(src.vektorStemmer(vektor, total, 0));
    }
  });

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
