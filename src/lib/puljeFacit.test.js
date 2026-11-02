// Puljen «semifinalisterne»: HVORNÅR en runde-pulje er afgjort, og hvad facit er.
//
// Fælden, testene her er skrevet for: "alle kampe har mål" var serverens
// eneste vagt. I en turnering er den sand efter kvartfinalerne, FØR
// semifinalerne er lagt ind — og så ville puljen blive afregnet mod en tabel
// over hele turneringen. Den første test nedenfor er derfor præcis dén liste.
import { describe, it, expect } from 'vitest';
import {
  alleKampeSpillet, facitFase, faseHold, rundeFacit, puljeKanAfregnes, puljeKonfigFejl,
  rundePuljeTekster,
} from './puljeFacit';
import { puljeKonfig } from './superligaScoring';
import { TEST_FASER, HAANDBOLD_SPIL, kl18 } from '../test/faseKalender';

const RUNDE_PULJE = Object.freeze({ poolSize: 4, facitKilde: 'runde', facitFase: 'Semifinaler' });
const HVM = Object.freeze({ ...HAANDBOLD_SPIL, pulje: RUNDE_PULJE });
const K = puljeKonfig(HVM);

function kampe(runde, par, maal = false) {
  return par.map(([h, a], i) => ({
    id: `r${runde}-${i}`, round: runde, home: h, away: a, kickoff: kl18('2027-01-29'),
    ...(maal ? { homeGoals: 30, awayGoals: 28 } : {}),
  }));
}
// Kvartfinalerne spillet (runde 14-15), semifinalerne (runde 16) lagt ind uden mål.
const KVART = [
  ...kampe(14, [['DK', 'NO'], ['FR', 'ES']], true),
  ...kampe(15, [['SE', 'DE'], ['HR', 'IS']], true),
];
const SEMI = kampe(16, [['DK', 'FR'], ['SE', 'HR']]);

describe('puljeKanAfregnes — runde-puljen', () => {
  it('IKKE efter kvartfinalerne, selv om hver oprettet kamp har mål', () => {
    // Det gamle kriterium siger ja her. Det er hele fejlen.
    expect(alleKampeSpillet(KVART)).toBe(true);
    expect(puljeKanAfregnes(K, HVM, KVART)).toBe(false);
    expect(rundeFacit(K, HVM, KVART)).toBeNull();
  });

  it('JA, så snart semifinalerne er lagt ind — før de er spillet', () => {
    const liste = [...KVART, ...SEMI];
    // Og her siger det gamle kriterium nej (semifinalerne har ingen mål).
    expect(alleKampeSpillet(liste)).toBe(false);
    expect(puljeKanAfregnes(K, HVM, liste)).toBe(true);
    expect(rundeFacit(K, HVM, liste)).toEqual(['DK', 'FR', 'SE', 'HR']);
  });

  it('facit er KUN semifinalernes hold — ikke kvartfinalernes, ikke finalens', () => {
    const finale = kampe(17, [['DK', 'SE'], ['FR', 'HR']]);
    const facit = rundeFacit(K, HVM, [...KVART, ...SEMI, ...finale]);
    expect(facit).toEqual(['DK', 'FR', 'SE', 'HR']);
    for (const ude of ['NO', 'ES', 'DE', 'IS']) expect(facit).not.toContain(ude);
  });

  it('en HALV fase giver intet facit', () => {
    expect(puljeKanAfregnes(K, HVM, [...KVART, SEMI[0]])).toBe(false);
  });

  it('for MANGE kampe i fasens runder giver heller intet (en datafejl er ikke et facit)', () => {
    const ekstra = { ...SEMI[0], id: 'x', home: 'NO', away: 'ES' };
    expect(puljeKanAfregnes(K, HVM, [...KVART, ...SEMI, ekstra])).toBe(false);
  });

  it('et hold, der mangler, eller står tomt, giver intet facit', () => {
    expect(faseHold(HVM, [SEMI[0], { ...SEMI[1], away: null }], 'Semifinaler')).toBeNull();
    expect(faseHold(HVM, [SEMI[0], { ...SEMI[1], home: '   ' }], 'Semifinaler')).toBeNull();
    expect(faseHold(HVM, [SEMI[0], { ...SEMI[1], home: 7 }], 'Semifinaler')).toBeNull();
  });

  it('samme hold to gange giver intet facit', () => {
    expect(faseHold(HVM, [SEMI[0], { ...SEMI[1], home: 'DK' }], 'Semifinaler')).toBeNull();
  });

  it('holdnavne trimmes, og runde som tekst tæller ikke', () => {
    expect(faseHold(HVM, [{ ...SEMI[0], home: ' DK ' }, SEMI[1]], 'Semifinaler')).toEqual(['DK', 'FR', 'SE', 'HR']);
    expect(faseHold(HVM, [{ ...SEMI[0], round: '16' }, SEMI[1]], 'Semifinaler')).toEqual(['DK', 'FR', 'SE', 'HR']);
    expect(faseHold(HVM, [{ ...SEMI[0], round: 16.5 }, SEMI[1]], 'Semifinaler')).toBeNull();
  });

  it('fasen slås op på NAVN; ukendt, tomt eller dobbelt navn giver intet', () => {
    expect(facitFase(HVM, 'Semifinaler')).toMatchObject({ fra: 16, til: 16, antalKampe: 2, start: '2027-01-29' });
    expect(facitFase(HVM, ' Semifinaler ')).toMatchObject({ fra: 16 });
    expect(facitFase(HVM, 'Ottendedele')).toBeNull();
    expect(facitFase(HVM, '')).toBeNull();
    expect(facitFase(HVM, null)).toBeNull();
    expect(facitFase({ ...HVM, faser: undefined }, 'Semifinaler')).toBeNull();
  });

  it('uden antalKampe på fasen kan den aldrig afgøres', () => {
    const uden = { ...HVM, faser: TEST_FASER.map((f) => (f.navn === 'Semifinaler' ? { ...f, antalKampe: undefined } : f)) };
    expect(puljeKanAfregnes(puljeKonfig(uden), uden, [...KVART, ...SEMI])).toBe(false);
  });
});

describe('puljeKanAfregnes — liga-puljerne er uændrede', () => {
  const SPILLET = [{ home: 'A', away: 'B', homeGoals: 1, awayGoals: 0 }];
  const HALVT = [...SPILLET, { home: 'C', away: 'D', homeGoals: null, awayGoals: null }];

  for (const [navn, game] of [
    ['Superligaen', { pulje: { poolSize: 6 } }],
    ['Premier League', { pulje: { poolSize: 4, nedSize: 3, facitKilde: 'egneKampe', tabelDeling: false } }],
    ['intet spil', null],
  ]) {
    it(`${navn}: alle kampe skal have mål`, () => {
      const k = puljeKonfig(game);
      expect(puljeKanAfregnes(k, game, SPILLET)).toBe(true);
      expect(puljeKanAfregnes(k, game, HALVT)).toBe(false);
      expect(puljeKanAfregnes(k, game, [])).toBe(false);
      // rundeFacit er KUN for runde-puljen.
      expect(rundeFacit(k, game, SPILLET)).toBeNull();
    });
  }

  it('alleKampeSpillet: tom streng og null er ikke mål; 0 er', () => {
    expect(alleKampeSpillet([{ homeGoals: 0, awayGoals: 0 }])).toBe(true);
    expect(alleKampeSpillet([{ homeGoals: '', awayGoals: 0 }])).toBe(false);
    expect(alleKampeSpillet([{ homeGoals: 1, awayGoals: undefined }])).toBe(false);
    expect(alleKampeSpillet(null)).toBe(false);
  });
});

describe('puljeKonfigFejl — en pulje, der aldrig kan afgøres, siges højt', () => {
  it('den rigtige form har ingen fejl', () => {
    expect(puljeKonfigFejl(HVM)).toEqual([]);
  });

  it('SL, PL og spil uden pulje har aldrig fejl her', () => {
    expect(puljeKonfigFejl({ pulje: { poolSize: 6 } })).toEqual([]);
    expect(puljeKonfigFejl({ pulje: { poolSize: 4, nedSize: 3, facitKilde: 'egneKampe' } })).toEqual([]);
    expect(puljeKonfigFejl(HAANDBOLD_SPIL)).toEqual([]);
    expect(puljeKonfigFejl(null)).toEqual([]);
  });

  it('hver fejl har sin egen tekst', () => {
    expect(puljeKonfigFejl({ ...HVM, pulje: { ...RUNDE_PULJE, facitFase: '' } })[0]).toMatch(/facitFase mangler/);
    expect(puljeKonfigFejl({ ...HVM, faser: undefined })[0]).toMatch(/ingen gyldig fasekalender/);
    expect(puljeKonfigFejl({ ...HVM, pulje: { ...RUNDE_PULJE, facitFase: 'Ottendedele' } }))
      .toEqual(['fasen «Ottendedele» findes ikke i kalenderen']);
    expect(puljeKonfigFejl({ ...HVM, pulje: { ...RUNDE_PULJE, poolSize: 6 } }))
      .toEqual(['puljen beder om 6 hold, men «Semifinaler» har 4 (2 kampe)']);
    // Manglende poolSize er 6 i normalizeren — og det er det, fladen beder om.
    expect(puljeKonfigFejl({ ...HVM, pulje: { facitKilde: 'runde', facitFase: 'Semifinaler' } }))
      .toEqual(['puljen beder om 6 hold, men «Semifinaler» har 4 (2 kampe)']);
    expect(puljeKonfigFejl({ ...HVM, pulje: { ...RUNDE_PULJE, nedSize: 2 } }))
      .toEqual(['en runde-pulje har intet bundspørgsmål (nedSize skal være 0)']);
    const udenAntal = { ...HVM, faser: TEST_FASER.map((f) => (f.navn === 'Semifinaler' ? { ...f, antalKampe: undefined } : f)) };
    expect(puljeKonfigFejl(udenAntal)[0]).toMatch(/intet antalKampe/);
  });

  it('to faser med samme navn er en fejl, ikke et valg', () => {
    // En gyldig kalender kan godt have to faser med samme navn (formkontrollen
    // ser kun på runder og datoer).
    const faser = TEST_FASER.map((f) => (f.navn === 'Finaledag' ? { ...f, navn: 'Semifinaler' } : f));
    const g = { ...HVM, faser };
    expect(puljeKonfigFejl(g)).toEqual(['fasen «Semifinaler» står 2 gange i kalenderen']);
    expect(facitFase(g, 'Semifinaler')).toBeNull();
  });
});

describe('rundePuljeTekster — ordene og datoen kommer af kalenderen', () => {
  it('spørgsmålet og hvornår puljen afgøres', () => {
    expect(rundePuljeTekster(HVM, K)).toEqual({
      spoergsmaal: 'Hvilke fire hold når semifinalerne?',
      afgoeres: 'Puljen afgøres, når semifinalerne er lagt ind — de spilles fredag 29. januar.',
    });
  });

  it('en fase over flere dage siger "fra"', () => {
    const g = { ...HVM, pulje: { ...RUNDE_PULJE, facitFase: 'Kvartfinaler', poolSize: 8 } };
    expect(rundePuljeTekster(g, puljeKonfig(g))).toEqual({
      spoergsmaal: 'Hvilke otte hold når kvartfinalerne?',
      afgoeres: 'Puljen afgøres, når kvartfinalerne er lagt ind — de spilles fra onsdag 27. januar.',
    });
  });

  it('omdøbes fasen i kalenderen, følger teksten med (intet spejl i labels)', () => {
    const faser = TEST_FASER.map((f) => (f.navn === 'Semifinaler' ? { ...f, bestemt: 'De sidste fire' } : f));
    const g = { ...HVM, faser };
    expect(rundePuljeTekster(g, puljeKonfig(g)).spoergsmaal).toBe('Hvilke fire hold når de sidste fire?');
  });

  it('uden fasen i kalenderen loves ingen dato', () => {
    const g = { ...HVM, faser: undefined };
    const t = rundePuljeTekster(g, puljeKonfig(g));
    expect(t.afgoeres).toBe('Puljen afgøres, når semifinaler er lagt ind.');
    expect(t.afgoeres).not.toMatch(/januar|spilles/);
  });

  it('null for alle andre puljer', () => {
    expect(rundePuljeTekster({ pulje: { poolSize: 6 } }, puljeKonfig({ pulje: { poolSize: 6 } }))).toBeNull();
    expect(rundePuljeTekster(HAANDBOLD_SPIL, null)).toBeNull();
  });

  it('tal over ti skrives med cifre', () => {
    const g = { ...HVM, pulje: { ...RUNDE_PULJE, poolSize: 16 } };
    expect(rundePuljeTekster(g, puljeKonfig(g)).spoergsmaal).toBe('Hvilke 16 hold når semifinalerne?');
  });
});
