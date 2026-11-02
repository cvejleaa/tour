// ---------------------------------------------------------------------------
// SPEJLINGEN AF PULJE-FACIT.
//
// Serveren afregner puljen (settlePuljeBets), og fladen viser facit-kortet
// (PuljeTip). Spørger de hver sit, kan fladen vise et facit, serveren aldrig
// har afregnet — eller serveren afregne, mens fladen siger "intet er afgjort".
//
// To vagter: (1) KILDEN er den samme byte for byte (bortset fra hovedet,
// import/require og eksporten), og (2) ADFÆRDEN er den samme på en matrix af
// spil × kamplister — også spil uden kalender og liga-puljerne.
// Selve reglerne er testet i src/lib/puljeFacit.test.js.
// ---------------------------------------------------------------------------
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { TEST_FASER, HAANDBOLD_SPIL, kl18 } from '../src/test/faseKalender.js';

const require = createRequire(import.meta.url);
const server = require('./puljeFacit');
const { puljeKonfig } = require('./superligaScoring');
const her = dirname(fileURLToPath(import.meta.url));

/** Kroppen uden hovedkommentar, import/require og module.exports. */
function krop(fil) {
  const linjer = readFileSync(resolve(her, fil), 'utf8').split('\n');
  const start = linjer.findIndex((l) => l.startsWith('// ÉT PRÆDIKAT'));
  const slut = linjer.findIndex((l) => l.startsWith('module.exports'));
  return linjer.slice(start, slut === -1 ? undefined : slut)
    .filter((l) => !/^import |^const \{ .* \} = require\(/.test(l))
    .map((l) => l.replace(/^export function/, 'function'))
    .join('\n').trimEnd();
}

const RUNDE_PULJE = { poolSize: 4, facitKilde: 'runde', facitFase: 'Semifinaler' };
const HVM = { ...HAANDBOLD_SPIL, pulje: RUNDE_PULJE };

/** n kampe i en runde, med hold og evt. mål. */
function kampe(runde, par, maal = false) {
  return par.map(([h, a], i) => ({
    id: `r${runde}-${i}`, round: runde, home: h, away: a, kickoff: kl18('2027-01-29'),
    ...(maal ? { homeGoals: 30, awayGoals: 28 } : {}),
  }));
}
const KVART = kampe(14, [['DK', 'NO'], ['FR', 'ES']], true).concat(kampe(15, [['SE', 'DE'], ['HR', 'IS']], true));
const SEMI = kampe(16, [['DK', 'FR'], ['SE', 'HR']]);

describe('puljeFacit: server-spejlet er src', () => {
  it('kilden er den samme (bortset fra hovedet og eksporten)', () => {
    expect(krop('./puljeFacit.js')).toBe(krop('../src/lib/puljeFacit.js'));
    // Ikke tom: en kilde, krop ikke kunne finde, ville gøre testen grøn.
    expect(krop('./puljeFacit.js').length).toBeGreaterThan(3000);
  });

  it('eksporterer de samme funktioner', async () => {
    const src = await import('../src/lib/puljeFacit.js');
    expect(Object.keys(server).sort()).toEqual(Object.keys(src).sort());
    expect(Object.keys(server).length).toBeGreaterThanOrEqual(9);
  });

  const SPIL = [
    ['SL', { id: 'superliga2627', pulje: { poolSize: 6 } }],
    ['PL', { id: 'pl', pulje: { poolSize: 4, nedSize: 3, facitKilde: 'egneKampe', tabelDeling: false } }],
    ['intet', null],
    ['håndbold uden pulje', HAANDBOLD_SPIL],
    ['håndbold med runde-pulje', HVM],
    ['runde-pulje uden kalender', { pulje: RUNDE_PULJE }],
    ['ukendt fase', { ...HVM, pulje: { ...RUNDE_PULJE, facitFase: 'Ottendedele' } }],
    ['fase uden antalKampe', { ...HVM, faser: TEST_FASER.map((f) => (f.navn === 'Semifinaler' ? { ...f, antalKampe: undefined } : f)) }],
    ['forkert poolSize', { ...HVM, pulje: { ...RUNDE_PULJE, poolSize: 6 } }],
    ['med bund', { ...HVM, pulje: { ...RUNDE_PULJE, nedSize: 2 } }],
  ];
  // Før, på og efter semifinalernes startdag — og uden ur.
  const UR = [Date.parse('2027-01-28T12:00:00Z'), Date.parse('2027-01-29T22:00:00Z'), Date.parse('2027-01-30T12:00:00Z'), undefined];
  const LISTER = [
    ['ingen', []],
    ['kvart spillet', KVART],
    ['kvart + semi', KVART.concat(SEMI)],
    ['halv semi', KVART.concat(SEMI.slice(0, 1))],
    ['semi uden udehold', KVART.concat([{ ...SEMI[0] }, { ...SEMI[1], away: '' }])],
    ['semi med samme hold to gange', KVART.concat([SEMI[0], { ...SEMI[1], home: 'DK' }])],
  ];

  for (const [spilNavn, spil] of SPIL) {
    it(`adfærden er den samme: ${spilNavn}`, async () => {
      const src = await import('../src/lib/puljeFacit.js');
      const srcKonfig = (await import('../src/lib/superligaScoring.js')).puljeKonfig;
      expect(server.puljeKonfigFejl(spil)).toEqual(src.puljeKonfigFejl(spil));
      expect(server.rundePuljeTekster(spil, puljeKonfig(spil))).toEqual(src.rundePuljeTekster(spil, srcKonfig(spil)));
      expect(server.rundePuljeDato(spil, puljeKonfig(spil))).toEqual(src.rundePuljeDato(spil, srcKonfig(spil)));
      for (const t of UR) {
        expect(server.rundePuljeTekster(spil, puljeKonfig(spil), t)).toEqual(src.rundePuljeTekster(spil, srcKonfig(spil), t));
      }
      for (const [listeNavn, liste] of LISTER) {
        const hvor = `${spilNavn} · ${listeNavn}`;
        expect(server.puljeKanAfregnes(puljeKonfig(spil), spil, liste), hvor)
          .toBe(src.puljeKanAfregnes(srcKonfig(spil), spil, liste));
        expect(server.rundeFacit(puljeKonfig(spil), spil, liste), hvor)
          .toEqual(src.rundeFacit(srcKonfig(spil), spil, liste));
        expect(server.faseHold(spil, liste, 'Semifinaler'), hvor).toEqual(src.faseHold(spil, liste, 'Semifinaler'));
        expect(server.alleKampeSpillet(liste), hvor).toBe(src.alleKampeSpillet(liste));
        for (const t of UR) {
          expect(server.puljeFaseFejl(spil, liste, t), `${hvor} · ${t}`).toEqual(src.puljeFaseFejl(spil, liste, t));
        }
      }
    });
  }

  // Matrixen ovenfor er kun en vagt, hvis den rammer BEGGE svar. Ellers
  // kunne begge ender sige false overalt og være "enige".
  it('matrixen rammer både et afgjort og et uafgjort udfald', () => {
    expect(server.puljeKanAfregnes(puljeKonfig(HVM), HVM, KVART.concat(SEMI))).toBe(true);
    expect(server.rundeFacit(puljeKonfig(HVM), HVM, KVART.concat(SEMI))).toEqual(['DK', 'FR', 'SE', 'HR']);
    expect(server.puljeKanAfregnes(puljeKonfig(HVM), HVM, KVART)).toBe(false);
    // …og fase-fejlen rammer både en fejl og intet.
    expect(server.puljeFaseFejl(HVM, KVART, UR[2])).toMatch(/kun 0 af 2 kampe/);
    expect(server.puljeFaseFejl(HVM, KVART, UR[0])).toBeNull();
  });
});
