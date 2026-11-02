// ---------------------------------------------------------------------------
// FACIT-KONTRAKTEN (facit.js) — og spejlingen mod src/lib/facit.js.
//
// Fladen viser fejlen i dialogen, FØR der kaldes; serveren validerer igen
// med sin egen kopi. Er de uenige, siger dialogen "ok" til noget, serveren
// afviser (eller omvendt) — uden at nogen af dem fejler. Derfor kører hver
// vektor mod begge.
// ---------------------------------------------------------------------------
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const server = require('./facit');

const HB = {
  type: 'football', status: 'live',
  faser: [
    { navn: 'Indledende runde', fra: 1, til: 3 },
    { navn: 'Hovedrunde', fra: 4, til: 6 },
    { navn: 'Kvartfinaler', fra: 7, til: 7, knockout: true },
    { navn: 'Finaledag', fra: 9, til: 9, knockout: true },
  ],
};

describe('facitFejl — streng validering', () => {
  const { facitFejl } = server;
  it('godtager et almindeligt facit og uafgjort uden knockout', () => {
    expect(facitFejl({ home: 2, away: 1 })).toBeNull();
    expect(facitFejl({ home: 0, away: 0 })).toBeNull();
    expect(facitFejl({ home: 99, away: 0 })).toBeNull();
  });
  it('afviser mål, der ikke er hele tal i [0, 99]', () => {
    for (const [home, away] of [['2', 1], [1.5, 1], [-1, 0], [100, 0], [null, 1], [undefined, 1], [NaN, 1]]) {
      expect(facitFejl({ home, away })).toMatch(/hele tal fra 0 til 99/);
    }
  });
  it('knockout + uafgjort kræver slut; knockout + vinder forbyder det', () => {
    expect(facitFejl({ home: 30, away: 30 }, { knockout: true })).toMatch(/Uafgjort efter ordinær tid i en knockout-kamp/);
    expect(facitFejl({ home: 31, away: 30 }, { knockout: true })).toBeNull();
    expect(facitFejl({ home: 31, away: 30, slut: { home: 31, away: 30, afgjort: 'forlaenget' } }, { knockout: true }))
      .toMatch(/afgjort i ordinær tid/);
  });
  it('uden knockout afvises ethvert slut — også et velformet', () => {
    expect(facitFejl({ home: 1, away: 1, slut: { home: 2, away: 1, afgjort: 'forlaenget' } }))
      .toMatch(/ikke en knockout-kamp/);
  });
  it('slut skal have en vinder, en kendt afgørelse og mindst stillingens mål', () => {
    const k = { knockout: true };
    expect(facitFejl({ home: 30, away: 30, slut: { home: 35, away: 34, afgjort: 'forlaenget' } }, k)).toBeNull();
    expect(facitFejl({ home: 30, away: 30, slut: { home: 34, away: 35, afgjort: 'straffe' } }, k)).toBeNull();
    expect(facitFejl({ home: 30, away: 30, slut: { home: 35, away: 35, afgjort: 'straffe' } }, k)).toMatch(/vinder/);
    expect(facitFejl({ home: 30, away: 30, slut: { home: 35, away: 34, afgjort: 'slut' } }, k)).toMatch(/Vælg, hvordan/);
    expect(facitFejl({ home: 30, away: 30, slut: { home: 29, away: 31, afgjort: 'straffe' } }, k)).toMatch(/færre mål/);
    expect(facitFejl({ home: 30, away: 30, slut: { home: 31, away: 29, afgjort: 'straffe' } }, k)).toMatch(/færre mål/);
    expect(facitFejl({ home: 30, away: 30, slut: { home: '35', away: 34, afgjort: 'straffe' } }, k)).toMatch(/Slutresultatet skal være hele tal/);
  });
});

describe('facitFelter — formen på et facit-dokument', () => {
  const { facitFelter } = server;
  it('præcis de fire felter, synken altid har skrevet — og INTET slut uden knockout', () => {
    // Fraværs-assertion med vilje: Superligaen og Premier League må ikke få
    // et nyt felt (toEqual afviser en ekstra nøgle).
    expect(facitFelter({ home: 2, away: 1 })).toEqual({ result: '1', homeGoals: 2, awayGoals: 1, status: 'finished' });
    expect(facitFelter({ home: 0, away: 0 })).toEqual({ result: 'X', homeGoals: 0, awayGoals: 0, status: 'finished' });
    expect(facitFelter({ home: 0, away: 3 }).result).toBe('2');
  });
  it('null, når der ikke kan udledes et udfald', () => {
    expect(facitFelter({ home: null, away: 1 })).toBeNull();
    expect(facitFelter({ home: '', away: 1 })).toBeNull();
    expect(facitFelter({})).toBeNull();
  });
  it('slut kommer med, når det hænger sammen — og hele facit er ugyldigt, når det ikke gør', () => {
    expect(facitFelter({ home: 30, away: 30, slut: { home: 35, away: 34, afgjort: 'forlaenget' } }))
      .toEqual({ result: 'X', homeGoals: 30, awayGoals: 30, status: 'finished', slut: { home: 35, away: 34, afgjort: 'forlaenget' } });
    // Et slut på en kamp afgjort i ordinær tid modsiger sin egen stilling.
    expect(facitFelter({ home: 31, away: 30, slut: { home: 31, away: 30, afgjort: 'forlaenget' } })).toBeNull();
    expect(facitFelter({ home: 30, away: 30, slut: { home: 35, away: 34, afgjort: 'ukendt' } })).toBeNull();
  });
  it('kopierer kun slut-felterne — fremmede nøgler slipper ikke med ind', () => {
    const ud = facitFelter({ home: 30, away: 30, slut: { home: 35, away: 34, afgjort: 'straffe', ekstra: 'x' } });
    expect(ud.slut).toEqual({ home: 35, away: 34, afgjort: 'straffe' });
  });
});

describe('forventerFacit og erManuelFacit', () => {
  const { forventerFacit, erManuelFacit, erKampspil } = server;
  it('kampspil, åbne eller i gang — uafhængigt af kilde', () => {
    expect(forventerFacit({ type: 'football', status: 'open' })).toBe(true);
    expect(forventerFacit({ type: 'football', status: 'live' })).toBe(true);
    expect(forventerFacit({ type: 'football', status: 'live', sync: { provider: 'superliga' } })).toBe(true);
    expect(forventerFacit({ type: 'football', status: 'finished' })).toBe(false);
    expect(forventerFacit({ type: 'football' })).toBe(false);
    expect(forventerFacit({ type: 'cycling', status: 'live' })).toBe(false);
    expect(erKampspil({ type: 'football' })).toBe(true);
    expect(erKampspil({ type: 'cycling' })).toBe(false);
  });
  it('kun mærket "manuel" fredner kampen', () => {
    expect(erManuelFacit({ resultatKilde: 'manuel' })).toBe(true);
    expect(erManuelFacit({ resultatKilde: 'synk' })).toBe(false);
    expect(erManuelFacit({})).toBe(false);
    expect(erManuelFacit(null)).toBe(false);
  });
});

// --- Spejlingen -------------------------------------------------------------
const FEJL_VEKTORER = [
  [{ home: 2, away: 1 }, {}],
  [{ home: 1, away: 1 }, { knockout: true }],
  [{ home: '1', away: 1 }, {}],
  [{ home: 100, away: 1 }, {}],
  [{ home: 30, away: 30, slut: { home: 35, away: 34, afgjort: 'forlaenget' } }, { knockout: true }],
  [{ home: 30, away: 30, slut: { home: 35, away: 34, afgjort: 'forlaenget' } }, {}],
  [{ home: 31, away: 30, slut: { home: 31, away: 30, afgjort: 'straffe' } }, { knockout: true }],
  [{ home: 30, away: 30, slut: { home: 35, away: 35, afgjort: 'straffe' } }, { knockout: true }],
  [{ home: 30, away: 30, slut: { home: 29, away: 31, afgjort: 'straffe' } }, { knockout: true }],
  [{ home: 30, away: 30, slut: { home: 35, away: 34, afgjort: 'x' } }, { knockout: true }],
  [{ home: 30, away: 30, slut: { home: 1.5, away: 34, afgjort: 'straffe' } }, { knockout: true }],
];
const SPIL = [null, {}, { type: 'football', status: 'open' }, { type: 'football', status: 'finished' },
  { type: 'cycling', status: 'live' }, HB];

// Kampe, som visningen skal tåle — gyldige slut, modsigende slut og
// slut-løse kampe. Facit-dokumenter fra synken kan bære mål som tekst.
const VIS_VEKTORER = [
  { homeGoals: 2, awayGoals: 1 },
  { homeGoals: 0, awayGoals: 0 },
  { homeGoals: 30, awayGoals: 30, slut: { home: 35, away: 34, afgjort: 'forlaenget' } },
  { homeGoals: 28, awayGoals: 28, slut: { home: 31, away: 33, afgjort: 'straffe' } },
  { homeGoals: 31, awayGoals: 30, slut: { home: 31, away: 30, afgjort: 'forlaenget' } },
  { homeGoals: 30, awayGoals: 30, slut: { home: 35, away: 35, afgjort: 'straffe' } },
  { homeGoals: 30, awayGoals: 30, slut: { home: 35, away: 34, afgjort: 'slut' } },
  { homeGoals: 30, awayGoals: 30, slut: 'forlaenget' },
  { homeGoals: '2', awayGoals: '1' },
  { homeGoals: null, awayGoals: 1 },
  { homeGoals: '', awayGoals: '' },
  {}, null,
];

describe('knockout-visningen: «30-30 · 35-34 e.f.»', () => {
  const { kampSlut, slutTekst, stillingTekst, knockoutRegel } = server;
  it('en gyldig forlængelse og et gyldigt straffekast — med begge stillinger', () => {
    const ef = { homeGoals: 30, awayGoals: 30, slut: { home: 35, away: 34, afgjort: 'forlaenget' } };
    const str = { homeGoals: 28, awayGoals: 28, slut: { home: 33, away: 31, afgjort: 'straffe' } };
    expect(stillingTekst(ef)).toBe('30-30 · 35-34 e.f.');
    expect(stillingTekst(str)).toBe('28-28 · 33-31 e.str.');
    expect(slutTekst(ef)).toBe('35-34 e.f.');
    expect(kampSlut(str)).toEqual({ home: 33, away: 31, afgjort: 'straffe' });
  });
  it('vendt til udeholdets side — begge stillinger vendes', () => {
    const ef = { homeGoals: 30, awayGoals: 30, slut: { home: 35, away: 34, afgjort: 'forlaenget' } };
    expect(stillingTekst(ef, { vend: true })).toBe('30-30 · 34-35 e.f.');
    expect(stillingTekst({ homeGoals: 2, awayGoals: 1 }, { vend: true })).toBe('1-2');
  });
  it('uden slut: stillingen som altid — og intet «e.f.»', () => {
    expect(stillingTekst({ homeGoals: 2, awayGoals: 1 })).toBe('2-1');
    expect(stillingTekst({ homeGoals: 0, awayGoals: 0 })).toBe('0-0');
    expect(slutTekst({ homeGoals: 2, awayGoals: 1 })).toBeNull();
    expect(kampSlut({ homeGoals: 2, awayGoals: 1 })).toBeNull();
  });
  it('et slut, der modsiger sin egen stilling, vises IKKE', () => {
    // Afgjort i ordinær tid, intet afgørende mål, ukendt afgørelse, ikke et objekt.
    for (const k of VIS_VEKTORER.slice(4, 8)) {
      expect(kampSlut(k), JSON.stringify(k)).toBeNull();
      expect(stillingTekst(k), JSON.stringify(k)).not.toMatch(/e\.f\.|e\.str\./);
    }
    expect(stillingTekst(VIS_VEKTORER[4])).toBe('31-30');
  });
  it('ingen mål: null — også når felterne er tomme tekster', () => {
    expect(stillingTekst({ homeGoals: null, awayGoals: 1 })).toBeNull();
    expect(stillingTekst({ homeGoals: '', awayGoals: '' })).toBeNull();
    expect(stillingTekst(null)).toBeNull();
  });
  it('reglen bærer SPORTENS spilletid — Spilførerens ordlyd', () => {
    expect(knockoutRegel({ sport: 'haandbold' }))
      .toBe('Knockout: vi tipper stillingen efter 60 min. Uafgjort er X, også når nogen vinder i forlængelsen.');
    expect(knockoutRegel({})).toBe('Knockout: vi tipper stillingen efter 90 min. Uafgjort er X, også når nogen vinder i forlængelsen.');
    expect(knockoutRegel({ sport: 'haandbold' })).not.toMatch(/90 min/);
  });
});

describe('uenigTekst — én uenig kamp som tekst (knappen og Drift-kortet)', () => {
  it('holdnavne og begge stillinger — ikke id\'et', () => {
    const t = server.uenigTekst({ id: 'r5-agf-ob', home: 'AGF', away: 'OB', haand: { home: 1, away: 1 }, kilde: { home: 2, away: 1 } });
    expect(t).toBe('AGF – OB (i hånden 1-1, kilden 2-1)');
    expect(t).not.toContain('r5-agf-ob');
  });
  it('id\'et kun, når holdnavnene mangler — og en tom stilling er en tankestreg', () => {
    expect(server.uenigTekst({ id: 'r5-x', haand: { home: null, away: 1 }, kilde: { home: 0, away: 0 } }))
      .toBe('r5-x (i hånden —, kilden 0-0)');
  });
  it('spejlet giver samme tekst', async () => {
    const src = await import('../src/lib/facit.js');
    for (const u of [{ id: 'a', home: 'X', away: 'Y', haand: { home: 3, away: 0 }, kilde: { home: 3, away: 1 } }, { id: 'b' }, null]) {
      expect(src.uenigTekst(u)).toBe(server.uenigTekst(u));
    }
  });
});

describe('spejling mod src/lib/facit.js', () => {
  it('samme konstanter', async () => {
    const src = await import('../src/lib/facit.js');
    expect(src.RESULTAT_KILDE_MANUEL).toBe(server.RESULTAT_KILDE_MANUEL);
    expect([...src.AFGJORT]).toEqual([...server.AFGJORT]);
    expect({ ...src.AFGJORT_NAVN }).toEqual({ ...server.AFGJORT_NAVN });
    expect(src.MAKS_MAAL).toBe(server.MAKS_MAAL);
    expect({ ...src.AFGJORT_KORT }).toEqual({ ...server.AFGJORT_KORT });
  });
  it('samme visning af knockout-stillingen og samme regel', async () => {
    const src = await import('../src/lib/facit.js');
    for (const k of VIS_VEKTORER) {
      expect(src.kampSlut(k), JSON.stringify(k)).toEqual(server.kampSlut(k));
      for (const vend of [false, true]) {
        expect(src.slutTekst(k, { vend })).toBe(server.slutTekst(k, { vend }));
        expect(src.stillingTekst(k, { vend })).toBe(server.stillingTekst(k, { vend }));
      }
    }
    for (const g of [...SPIL, { sport: 'haandbold' }]) expect(src.knockoutRegel(g)).toBe(server.knockoutRegel(g));
  });
  it('samme svar fra facitFejl og facitFelter på hver vektor', async () => {
    const src = await import('../src/lib/facit.js');
    for (const [input, opts] of FEJL_VEKTORER) {
      expect(src.facitFejl(input, opts)).toBe(server.facitFejl(input, opts));
      expect(src.facitFelter(input)).toEqual(server.facitFelter(input));
    }
  });
  it('samme svar fra spil-prædikaterne', async () => {
    const src = await import('../src/lib/facit.js');
    for (const g of SPIL) {
      expect(src.forventerFacit(g)).toBe(server.forventerFacit(g));
      expect(src.erKampspil(g)).toBe(server.erKampspil(g));
    }
    for (const k of [null, {}, { resultatKilde: 'manuel' }, { resultatKilde: 'x' }]) {
      expect(src.erManuelFacit(k)).toBe(server.erManuelFacit(k));
    }
  });
  // Et vektor-sæt kan overse en gren, ingen vektor rammer. Teksten er derfor
  // ÉN gang til: kroppene skal være identiske, bortset fra import/export og
  // filhovedet — samme vagt som mailMarkdown-spejlet.
  it('kroppene er identiske ud over import/export og hovedkommentaren', async () => {
    const { readFileSync } = await import('node:fs');
    const krop = (sti) => readFileSync(new URL(sti, import.meta.url), 'utf8')
      .replace(/^\/\/[^\n]*\n/gm, '') // linjekommentarer (filhovedet varierer)
      .replace(/^(const|import) \{ outcomeFromScore, sportOrd \}[^\n]*\n/m, '')
      .replace(/^export /gm, '')
      .replace(/\nmodule\.exports = \{[\s\S]*?\};\n?$/, '\n')
      .trim();
    expect(krop('../src/lib/facit.js')).toBe(krop('./facit.js'));
  });
});
