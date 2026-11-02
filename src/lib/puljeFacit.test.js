// Puljen «semifinalisterne»: HVORNÅR en runde-pulje er afgjort, og hvad facit er.
//
// Fælden, testene her er skrevet for: "alle kampe har mål" var serverens
// eneste vagt. I en turnering er den sand efter kvartfinalerne, FØR
// semifinalerne er lagt ind — og så ville puljen blive afregnet mod en tabel
// over hele turneringen. Den første test nedenfor er derfor præcis dén liste.
import { describe, it, expect } from 'vitest';
import {
  alleKampeSpillet, facitFase, faseHold, rundeFacit, puljeKanAfregnes, puljeKonfigFejl,
  puljeFaseFejl, rundePuljeDato, rundePuljeTekster,
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

  // QC-fund: badgen under Spil-tidsplan siger «bliver aldrig afregnet, før det
  // er rettet» ved ENHVER puljeKonfigFejl. Med fasen rigtigt lagt ind gav
  // prædikatet før ja til forkert poolSize og et bundspørgsmål — så serveren
  // afregnede, og PuljeTip viste et facit, under den røde advarsel.
  it('en konfigurationsfejl afgør intet — også med fasen rigtigt lagt ind', () => {
    const liste = [...KVART, ...SEMI];
    for (const pulje of [{ ...RUNDE_PULJE, poolSize: 6 }, { ...RUNDE_PULJE, nedSize: 2 }]) {
      const g = { ...HVM, pulje };
      expect(puljeKonfigFejl(g), JSON.stringify(pulje)).toHaveLength(1);
      expect(puljeKanAfregnes(puljeKonfig(g), g, liste), JSON.stringify(pulje)).toBe(false);
    }
    // Kontrol: den rigtige konfiguration afgør på samme liste.
    expect(puljeKanAfregnes(K, HVM, liste)).toBe(true);
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
    // …og FOR FÅ er også en fejl (M07b: «!==» → «>» overlevede, fordi kun
    // «6 > 4» var testet).
    expect(puljeKonfigFejl({ ...HVM, pulje: { ...RUNDE_PULJE, poolSize: 2 } }))
      .toEqual(['puljen beder om 2 hold, men «Semifinaler» har 4 (2 kampe)']);
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

// ---------------------------------------------------------------------------
// FASENS KAMPE LAGT FORKERT IND (modstander-fund R4b). faseHold svarer null
// både for "ikke lagt ind endnu" og for "lagt forkert ind"; den første er
// normal, den anden en tavs fejl. Semifinalerne starter fredag 29/1 2027.
// ---------------------------------------------------------------------------
describe('puljeFaseFejl — fasen lagt forkert ind siges højt', () => {
  const FOER = Date.parse('2027-01-28T12:00:00Z');   // dagen før
  const DAGEN = Date.parse('2027-01-29T22:00:00Z');  // fredag aften, dansk tid (23.00)
  const EFTER = Date.parse('2027-01-30T12:00:00Z');  // dagen efter

  it('rigtigt lagt ind: ingen fejl — før, på og efter startdagen', () => {
    for (const t of [FOER, DAGEN, EFTER]) expect(puljeFaseFejl(HVM, [...KVART, ...SEMI], t)).toBeNull();
  });

  it('ikke lagt ind endnu er IKKE en fejl — før og på startdagen', () => {
    for (const t of [FOER, DAGEN]) {
      expect(puljeFaseFejl(HVM, KVART, t)).toBeNull();
      expect(puljeFaseFejl(HVM, [...KVART, SEMI[0]], t)).toBeNull();
      expect(puljeFaseFejl(HVM, [...KVART, SEMI[0], { ...SEMI[1], away: '' }], t)).toBeNull();
    }
  });

  it('efter startdagen er en manglende kamp en fejl — med tal og dato', () => {
    expect(puljeFaseFejl(HVM, KVART, EFTER))
      .toBe('«Semifinaler» skulle være begyndt fredag 29. januar, men kun 0 af 2 kampe er lagt ind');
    expect(puljeFaseFejl(HVM, [...KVART, SEMI[0]], EFTER))
      .toBe('«Semifinaler» skulle være begyndt fredag 29. januar, men kun 1 af 2 kampe er lagt ind');
  });

  it('efter startdagen er et manglende hold en fejl', () => {
    expect(puljeFaseFejl(HVM, [...KVART, SEMI[0], { ...SEMI[1], away: '' }], EFTER))
      .toBe('«Semifinaler» skulle være begyndt fredag 29. januar, men et hold mangler i fasens kampe');
    expect(puljeFaseFejl(HVM, [...KVART, SEMI[0], { ...SEMI[1], home: null, away: ' ' }], EFTER))
      .toBe('«Semifinaler» skulle være begyndt fredag 29. januar, men 2 hold mangler i fasens kampe');
  });

  it('for mange kampe og et hold i to kampe er fejl MED DET SAMME', () => {
    const tre = [...KVART, ...SEMI, { id: 'x', round: 16, home: 'NO', away: 'ES' }];
    expect(puljeFaseFejl(HVM, tre, FOER)).toBe('«Semifinaler» har 3 kampe, men kalenderen siger 2');
    const dublet = [...KVART, SEMI[0], { ...SEMI[1], home: 'DK' }];
    expect(puljeFaseFejl(HVM, dublet, FOER)).toBe('DK står i to kampe i «Semifinaler»');
  });

  it('en konfigurationsfejl meldes af puljeKonfigFejl, ikke her — og liga-puljer har aldrig fejl her', () => {
    expect(puljeFaseFejl({ ...HVM, pulje: { ...RUNDE_PULJE, facitFase: 'Ottendedele' } }, KVART, EFTER)).toBeNull();
    for (const g of [{ pulje: { poolSize: 6 } }, { pulje: { poolSize: 4, nedSize: 3, facitKilde: 'egneKampe' } }, HAANDBOLD_SPIL, null]) {
      expect(puljeFaseFejl(g, KVART, EFTER)).toBeNull();
    }
  });

  // DANSK DATO, IKKE UTC (TM-fund). 00.30 dansk tid lørdag er 23.30Z fredag:
  // i UTC er semifinalernes startdag ikke passeret endnu. Testens øvrige
  // tidspunkter (12.00Z, 22.00Z) ligger, hvor de to datoer er ens, så en
  // `toISOString()` i stedet for kbhDato overlevede. Begge ender skal ramme
  // døgnskiftet: 23.30 dansk tid fredag er IKKE begyndt.
  it('døgnskiftet er dansk: 00.30 lørdag tæller fasen som begyndt, 23.30 fredag gør ikke', () => {
    const fredag2330 = Date.parse('2027-01-29T22:30:00Z');
    const loerdag0030 = Date.parse('2027-01-29T23:30:00Z');
    expect(puljeFaseFejl(HVM, KVART, fredag2330)).toBeNull();
    expect(puljeFaseFejl(HVM, KVART, loerdag0030))
      .toBe('«Semifinaler» skulle være begyndt fredag 29. januar, men kun 0 af 2 kampe er lagt ind');
    expect(rundePuljeTekster(HVM, K, fredag2330).afgoeres)
      .toBe('Puljen afgøres, når semifinalerne er lagt ind — de spilles fredag 29. januar.');
    expect(rundePuljeTekster(HVM, K, loerdag0030).afgoeres)
      .toBe('Puljen afgøres, når semifinalerne er lagt ind — de skulle være begyndt fredag 29. januar.');
  });

  it('uden et ur er intet "begyndt" — kun de strukturelle fejl meldes', () => {
    expect(puljeFaseFejl(HVM, KVART, undefined)).toBeNull();
    expect(puljeFaseFejl(HVM, [...KVART, SEMI[0], { ...SEMI[1], home: 'DK' }], undefined)).toBe('DK står i to kampe i «Semifinaler»');
  });

  // DEN BINDENDE EGENSKAB: efter startdagen er "intet facit" ALDRIG tavst.
  // Hver liste, hvor faseHold er null, har en grund — og hver grund betyder,
  // at der intet facit er.
  it('efter startdagen: faseHold null ⇔ en fejl (matrix)', () => {
    const LISTER = [
      KVART, [...KVART, ...SEMI], [...KVART, SEMI[0]], [...KVART, SEMI[0], { ...SEMI[1], away: '' }],
      [...KVART, SEMI[0], { ...SEMI[1], home: 'DK' }], [...KVART, ...SEMI, { id: 'x', round: 16, home: 'NO', away: 'ES' }],
      [...KVART, SEMI[0], { ...SEMI[1], home: '  ' }], [...SEMI],
    ];
    let nul = 0;
    for (const liste of LISTER) {
      const tomt = faseHold(HVM, liste, 'Semifinaler') == null;
      if (tomt) nul += 1;
      expect(puljeFaseFejl(HVM, liste, EFTER) != null, JSON.stringify(liste.slice(-2))).toBe(tomt);
    }
    expect(nul).toBeGreaterThanOrEqual(5); // matrixen rammer begge udfald
  });
});

describe('rundePuljeDato og den forsinkede tekst', () => {
  it('datoen er én funktion — med "fra" over flere dage, null uden fasen', () => {
    expect(rundePuljeDato(HVM, K)).toBe('fredag 29. januar');
    const kvart = { ...HVM, pulje: { ...RUNDE_PULJE, facitFase: 'Kvartfinaler', poolSize: 8 } };
    expect(rundePuljeDato(kvart, puljeKonfig(kvart))).toBe('fra onsdag 27. januar');
    expect(rundePuljeDato({ ...HVM, faser: undefined }, puljeKonfig({ ...HVM, faser: undefined }))).toBeNull();
    expect(rundePuljeDato({ pulje: { poolSize: 6 } }, puljeKonfig({ pulje: { poolSize: 6 } }))).toBeNull();
  });

  it('er startdagen passeret, loves ingen dato, der er gået', () => {
    const efter = Date.parse('2027-01-30T12:00:00Z');
    expect(rundePuljeTekster(HVM, K, efter).afgoeres)
      .toBe('Puljen afgøres, når semifinalerne er lagt ind — de skulle være begyndt fredag 29. januar.');
    // Over flere dage: "skulle være begyndt" UDEN "fra".
    const kvart = { ...HVM, pulje: { ...RUNDE_PULJE, facitFase: 'Kvartfinaler', poolSize: 8 } };
    expect(rundePuljeTekster(kvart, puljeKonfig(kvart), efter).afgoeres)
      .toBe('Puljen afgøres, når kvartfinalerne er lagt ind — de skulle være begyndt onsdag 27. januar.');
  });

  it('på startdagen og før: som før — og uden ur: som før', () => {
    for (const t of [Date.parse('2027-01-29T22:00:00Z'), Date.parse('2027-01-01T12:00:00Z'), undefined]) {
      expect(rundePuljeTekster(HVM, K, t).afgoeres)
        .toBe('Puljen afgøres, når semifinalerne er lagt ind — de spilles fredag 29. januar.');
    }
  });
});
