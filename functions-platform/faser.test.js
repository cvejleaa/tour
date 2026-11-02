// ---------------------------------------------------------------------------
// SPEJLINGEN AF FASEKALENDEREN.
//
// Serveren (Runde-Botten) og fladen (Tip, Stilling, Ligaer) skal være enige
// om, hvad en dag hedder, og om der kommer en næste. Var de uenige, kunne
// botten skrive "Hovedrunde · dag 1" om en dag, Tip kalder "Dag 7" — eller
// sige, at turneringen er slut, mens Tip siger, at hovedrunden kommer.
//
// To vagter: (1) KILDEN er den samme byte for byte (bortset fra hovedet,
// `export` og module.exports), og (2) ADFÆRDEN er den samme på en matrix af
// spil × runder × tidspunkter — også spil uden eller med en ugyldig kalender.
// Selve teksterne er testet i src/lib/faser.test.js.
// ---------------------------------------------------------------------------
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { TEST_FASER, HAANDBOLD_SPIL, kl18 } from '../src/test/faseKalender.js';

const require = createRequire(import.meta.url);
const server = require('./faser');
const her = dirname(fileURLToPath(import.meta.url));

/** Kroppen uden hovedkommentar, `export` og module.exports. */
function krop(fil) {
  const linjer = readFileSync(resolve(her, fil), 'utf8').split('\n');
  const start = linjer.findIndex((l) => l.startsWith('// UDEN') || l.startsWith('// HVORFOR EN KALENDER'));
  const slut = linjer.findIndex((l) => l.startsWith('module.exports'));
  return linjer.slice(start, slut === -1 ? undefined : slut)
    .map((l) => l.replace(/^export function/, 'function'))
    .join('\n').trimEnd();
}

describe('faser: server-spejlet er src', () => {
  it('kilden er den samme (bortset fra hovedet og eksporten)', () => {
    expect(krop('./faser.js')).toBe(krop('../src/lib/faser.js'));
    // Ikke tom: en kilde, krop ikke kunne finde, ville gøre testen grøn.
    expect(krop('./faser.js').length).toBeGreaterThan(5000);
  });

  it('eksporterer de samme funktioner', async () => {
    const src = await import('../src/lib/faser.js');
    expect(Object.keys(server).sort()).toEqual(Object.keys(src).sort());
    expect(Object.keys(server).length).toBeGreaterThanOrEqual(19);
  });

  const SPIL = [
    ['SL', { id: 'superliga2627' }],
    ['intet', null],
    ['ugyldig', { faser: [{ ...TEST_FASER[0], fra: 2 }] }],
    // Et HUL før kvartfinalerne (runde 14 mangler): et naivt opslag ville
    // kalde runde 15-17 knockout. Facit i hånden (ManuelFacit ⇄ manuelFacit)
    // spørger erKnockout — klient og server skal begge sige nej.
    ['ugyldig med knockout', { faser: TEST_FASER.map((f) => (f.navn === 'Kvartfinaler' ? { ...f, fra: 15 } : f)) }],
    ['håndbold', HAANDBOLD_SPIL],
  ];
  const RUNDER = [0, 1, 2, 6, 7, 13, 14, 15, 16, 17, 18, 2.5, null];
  const TIDER = [kl18('2027-01-10'), kl18('2027-01-20'), Date.parse('2027-01-19T23:30:00Z'), kl18('2027-02-01'), NaN];

  for (const [navn, game] of SPIL) {
    it(`samme svar: ${navn}`, async () => {
      const src = await import('../src/lib/faser.js');
      expect(server.harFaseKalender(game)).toBe(src.harFaseKalender(game));
      expect(server.sidsteKalenderRunde(game)).toBe(src.sidsteKalenderRunde(game));
      expect(server.rundeNavneord(game)).toBe(src.rundeNavneord(game));
      expect(server.rundeFlertal(game)).toBe(src.rundeFlertal(game));
      expect(server.faseKalenderAdvarsel(game)).toEqual(src.faseKalenderAdvarsel(game));
      expect(server.harKnockout(game)).toBe(src.harKnockout(game));
      expect(server.rundeOrdene(game)).toEqual(src.rundeOrdene(game));
      for (const r of RUNDER) {
        const k = `${navn} · ${r}`;
        expect(server.faseFor(game, r), k).toEqual(src.faseFor(game, r));
        expect(server.erKnockout(game, r), k).toBe(src.erKnockout(game, r));
        expect(server.rundeKort(game, r), k).toBe(src.rundeKort(game, r));
        expect(server.rundeOrd(game, r), k).toBe(src.rundeOrd(game, r));
        expect(server.rundeKolonne(game, r), k).toBe(src.rundeKolonne(game, r));
        expect(server.rundeEtiket(game, r), k).toBe(src.rundeEtiket(game, r));
        expect(server.dagTaeller(game, r, 6), k).toBe(src.dagTaeller(game, r, 6));
        expect(server.naesteKalenderRunde(game, r), k).toEqual(src.naesteKalenderRunde(game, r));
        expect(server.ventendeRunde(game, r), k).toEqual(src.ventendeRunde(game, r));
        for (const t of TIDER) {
          expect(server.rundeEtiket(game, r, t), `${k} · ${t}`).toBe(src.rundeEtiket(game, r, t));
          expect(server.ventetekst(game, r, t), `${k} · ${t}`).toBe(src.ventetekst(game, r, t));
        }
      }
      for (const t of TIDER) {
        expect(server.naesteFase(game, t), `${navn} · ${t}`).toEqual(src.naesteFase(game, t));
      }
    });
  }

  // Paritet alene beviser ikke svaret: to kopier af et naivt opslag ville
  // også være enige. Over en UGYLDIG kalender er INGEN runde knockout — i
  // begge — mens den gyldige kalender har knockout fra runde 14.
  it('erKnockout over en ugyldig kalender: nej i begge, også hvor et naivt opslag sagde ja', async () => {
    const src = await import('../src/lib/faser.js');
    const ugyldig = SPIL.find(([n]) => n === 'ugyldig med knockout')[1];
    expect(server.faseKalenderAdvarsel(ugyldig)).not.toBeNull();
    for (let r = 1; r <= 17; r += 1) {
      expect(server.erKnockout(ugyldig, r), `server · ${r}`).toBe(false);
      expect(src.erKnockout(ugyldig, r), `src · ${r}`).toBe(false);
    }
    expect([15, 16, 17].map((r) => server.erKnockout(HAANDBOLD_SPIL, r))).toEqual([true, true, true]);
    expect([15, 16, 17].map((r) => src.erKnockout(HAANDBOLD_SPIL, r))).toEqual([true, true, true]);
  });

  it('samme formkontrol og samme datoer', async () => {
    const src = await import('../src/lib/faser.js');
    for (const faser of [TEST_FASER, [], null, [{ ...TEST_FASER[0], knockOut: true }], [{ ...TEST_FASER[0], fra: 2 }],
      [TEST_FASER[0], TEST_FASER[1], { ...TEST_FASER[2], start: '2027-01-21' }]]) {
      expect(server.faseKalenderFejl(faser)).toEqual(src.faseKalenderFejl(faser));
    }
    for (const d of ['2027-01-20', '2027-02-30', 'x']) expect(server.fmtFaseStart(d)).toBe(src.fmtFaseStart(d));
    for (const t of TIDER.filter(Number.isFinite)) {
      expect(server.kortDato(t)).toBe(src.kortDato(t));
      expect(server.kbhDato(t)).toBe(src.kbhDato(t));
    }
    // Og serveren giver den forventede tekst — ikke bare den samme som src.
    expect(server.rundeEtiket(HAANDBOLD_SPIL, 2, kl18('2027-01-14'))).toBe('Indledende runde · dag 2 · tor 14/1');
    expect(server.naesteKalenderRunde(HAANDBOLD_SPIL, 6)).toBe(7);
    expect(server.rundeEtiket({}, 7)).toBe('Runde 7');
    expect(server.faseKalenderAdvarsel({ faser: [{ ...TEST_FASER[0], fra: 2 }] }))
      .toEqual(['fase 1: første fase skal starte i runde 1 (ikke 2)']);
    expect(server.faseKalenderAdvarsel({ id: 'superliga2627' })).toBeNull();
    // De nye ord og knockout-evnen — de rigtige svar, ikke kun de samme.
    expect(server.harKnockout(HAANDBOLD_SPIL)).toBe(true);
    expect(server.harKnockout({ id: 'superliga2627' })).toBe(false);
    expect(server.rundeOrdene(HAANDBOLD_SPIL).runden).toBe('dagen');
    expect(server.rundeOrdene({}).runden).toBe('runden');
  });
});
