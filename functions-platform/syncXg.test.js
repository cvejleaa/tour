// Tests for xG-synken. To ting bæres af dem, som ingen anden test kan se:
//
//  1. At hentningen kun rører kampe, der er FÆRDIGE og MANGLER tallet — og at
//     loftet holder. Uden loftet ville den første kørsel efter udrulningen
//     forsøge ~132 kald og ramme sweep'ets timeout, så INGEN blev skrevet,
//     hver eneste gang.
//  2. At et felt uden værdi UDELADES frem for at sættes til undefined. Der er
//     ingen ignoreUndefinedProperties i dette projekt, så et undefined i en
//     batch kaster og river hele skrivningen med.
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { syncXgCore, XG_LOFT, XG_BUDGET_MS } = require('./superligaSync');

/** Firestore-attrap, der husker hvad der blev skrevet. */
function fakeDb(matches) {
  const skrevet = [];
  const docs = matches.map(([id, data]) => ({ id, data: () => data }));
  return {
    skrevet,
    commits: 0,
    collection() {
      return {
        doc: () => ({ collection: () => ({ get: async () => ({ docs }) }) }),
      };
    },
    batch() {
      const self = this;
      return {
        // update og ikke set: kernen må ikke kunne OPRETTE et kamp-dokument.
        // Attrappen har derfor ingen set — kalder kernen den, ryger testen.
        update(ref, felter) {
          // Den ægte Admin SDK KASTER på undefined (der er ingen
          // ignoreUndefinedProperties i dette projekt) og river hele batchen
          // med. En attrap, der bare gemmer objektet, ville bevise ingenting
          // om netop dét — så den efterligner opførslen.
          for (const [k, v] of Object.entries(felter)) {
            if (v === undefined) {
              throw new Error(`Cannot use "undefined" as a Firestore value (field: ${k})`);
            }
          }
          skrevet.push({ id: ref.id, felter });
        },
        async commit() { self.commits += 1; },
      };
    },
  };
}

// db.collection('games').doc(x).collection('matches').doc(id) skal give et
// objekt med .id — attrappen ovenfor giver kun get(), så den udvides her.
function dbMedDoc(matches) {
  const base = fakeDb(matches);
  base.collection = () => ({
    doc: () => ({
      collection: () => ({
        get: async () => ({ docs: matches.map(([id, data]) => ({ id, data: () => data })) }),
        doc: (id) => ({ id }),
      }),
    }),
  });
  return base;
}

const FieldValue = { serverTimestamp: () => 'TS' };

/** Provider hvor sourceKey ER dokument-id'et (som superligaen). */
const identitet = (rows, spion) => ({
  async hentXg(sync, fetchFn, docIds, deadlineMs) { if (spion) spion(docIds, deadlineMs); return rows; },
  resolveDocs(sourceKeys, docIds) {
    const kendte = new Set(docIds);
    const m = new Map();
    for (const k of sourceKeys) if (kendte.has(k)) m.set(k, k);
    return m;
  },
});

describe('syncXgCore', () => {
  it('spørger KUN om kampe der er afgjort og mangler xG', async () => {
    const spion = vi.fn();
    const db = dbMedDoc([
      ['spillet-uden-xg', { result: '1' }],
      ['spillet-med-xg', { result: 'X', xgHome: 1.2, xgAway: 0.8 }],
      ['ikke-spillet', {}],
    ]);
    await syncXgCore(db, FieldValue, { provider: identitet([], spion), sync: {} });
    expect(spion.mock.calls[0][0]).toEqual(['spillet-uden-xg']);
  });

  it('loftet er 30 — tallet selv, ikke bare mekanismen', () => {
    // Hardkodet med vilje. Testen nedenfor bygger sit fixture af XG_LOFT og
    // skalerer derfor MED konstanten: sættes den til 999999, bliver den grøn.
    // 30 er valgt efter kvote: 132 kampe i sæsonen, 12 sweep-kørsler i døgnet
    // (cron '25 2,13-23 * * *'), så 30x12 = 360 henter et fuldt efterslæb ind
    // på under et døgn, og en normal runde på 6-10 kampe klares i én kørsel.
    expect(XG_LOFT).toBe(30);
  });

  it('budgettet gives VIDERE til provideren — kernen kan ikke selv afbryde et await', async () => {
    // Uden fristen er løkken i provideren kun bundet af per-kald-timeouten
    // gange antallet af kampe. Sweep'et ville så kunne dø af sin egen
    // platform-timeout, og hverken alarm eller driftlog-kort nåede at køre.
    let fristen = null;
    const provider = {
      async hentXg(sync, fetchFn, docIds, deadlineMs) { fristen = deadlineMs; return []; },
      resolveDocs: () => new Map(),
    };
    const foer = Date.now();
    await syncXgCore(dbMedDoc([['a', { result: '1' }]]), FieldValue,
      { provider, sync: {}, budgetMs: 5000 });
    expect(fristen).toBeGreaterThanOrEqual(foer + 5000);
    expect(fristen).toBeLessThanOrEqual(Date.now() + 5000);
  });

  it('uden budgetMs bruges XG_BUDGET_MS — fristen er aldrig uendelig', async () => {
    let fristen = null;
    const provider = {
      async hentXg(sync, fetchFn, docIds, deadlineMs) { fristen = deadlineMs; return []; },
      resolveDocs: () => new Map(),
    };
    const foer = Date.now();
    await syncXgCore(dbMedDoc([['a', { result: '1' }]]), FieldValue, { provider, sync: {} });
    expect(Number.isFinite(fristen)).toBe(true);
    expect(fristen).toBeGreaterThanOrEqual(foer + XG_BUDGET_MS);
  });

  it('en fejl i hentXg SLIPPER UD — den må ikke sluges her', async () => {
    // Hele begrundelsen for at flytte xG ud af minut-synken er, at fejlen ikke
    // må forsvinde tavst. Sluges den inde i kernen, når den aldrig frem til
    // st.fejl() i sweep'et, og Drift-kortet ville melde grønt på en kilde,
    // der er holdt op med at svare.
    const provider = {
      async hentXg() { throw new Error('kilden svarer ikke'); },
      resolveDocs: () => new Map(),
    };
    await expect(syncXgCore(dbMedDoc([['a', { result: '1' }]]), FieldValue, { provider, sync: {} }))
      .rejects.toThrow('kilden svarer ikke');
  });

  it('en kamp med xgHome: null prøves IGEN — Number(null) er 0, ikke "har xG"', async () => {
    // Prøvefiltret må ikke bruge Number(): et null ville tælle som et finite 0
    // og dermed som "har allerede xG", så kampen aldrig blev hentet igen.
    const spion = vi.fn();
    const db = dbMedDoc([['a', { result: '1', xgHome: null, xgAway: null }]]);
    await syncXgCore(db, FieldValue, { provider: identitet([], spion), sync: {} });
    expect(spion.mock.calls[0][0]).toEqual(['a']);
  });

  it('et ægte 0 tæller som "har xG" og hentes ikke igen', async () => {
    const spion = vi.fn();
    const db = dbMedDoc([['a', { result: '1', xgHome: 0, xgAway: 0 }]]);
    const r = await syncXgCore(db, FieldValue, { provider: identitet([], spion), sync: {} });
    expect(spion).not.toHaveBeenCalled();
    expect(r.manglede).toBe(0);
  });

  it('holder loftet og melder hvor mange der MANGLEDE i alt', async () => {
    // `manglede` er tallet FØR kørslen — det er dét, driftlog-kortet viser,
    // og det skal kunne gå mod nul over flere kørsler.
    const spion = vi.fn();
    const mange = Array.from({ length: XG_LOFT + 7 }, (_, i) => [`k${i}`, { result: '1' }]);
    const db = dbMedDoc(mange);
    const r = await syncXgCore(db, FieldValue, { provider: identitet([], spion), sync: {} });
    expect(spion.mock.calls[0][0]).toHaveLength(XG_LOFT);
    expect(r.manglede).toBe(XG_LOFT + 7);
  });

  it('skriver begge tal og et tidsstempel', async () => {
    const db = dbMedDoc([['a', { result: '1' }]]);
    const rows = [{ sourceKey: 'a', xgHome: 1.42, xgAway: 0.37 }];
    const r = await syncXgCore(db, FieldValue, { provider: identitet(rows), sync: {} });
    expect(db.skrevet).toEqual([
      { id: 'a', felter: { xgHome: 1.42, xgAway: 0.37, xgSyncedAt: 'TS' } },
    ]);
    expect(r.skrevet).toBe(1);
  });

  it('UDELADER en kamp med ubrugelige tal — aldrig undefined i en batch', async () => {
    // Et undefined ville kaste og rive hele skrivningen med, fordi der ikke er
    // ignoreUndefinedProperties i dette projekt.
    const db = dbMedDoc([['a', { result: '1' }], ['b', { result: '1' }]]);
    const rows = [
      { sourceKey: 'a', xgHome: undefined, xgAway: 0.5 },
      { sourceKey: 'b', xgHome: 1.1, xgAway: 0.9 },
    ];
    const r = await syncXgCore(db, FieldValue, { provider: identitet(rows), sync: {} });
    expect(db.skrevet.map((x) => x.id)).toEqual(['b']);
    expect(JSON.stringify(db.skrevet)).not.toContain('null');
    expect(r.skrevet).toBe(1);
  });

  it('rører ikke basen, når intet mangler — heller ikke med en commit', async () => {
    const db = dbMedDoc([['a', { result: '1', xgHome: 1, xgAway: 2 }]]);
    const r = await syncXgCore(db, FieldValue, { provider: identitet([]), sync: {} });
    expect(r).toEqual({ manglede: 0, hentet: 0, skrevet: 0 });
    expect(db.commits).toBe(0);
  });

  it('commit ikke, når kilden svarede men intet var brugbart', async () => {
    // Præcis den sti, driftlog-linjen findes for: kampe mangler, kilden
    // svarer, men leverer ingen tal. Uden vagten ville hver kørsel skrive en
    // tom batch — en skrivning uden indhold, der ligner arbejde i loggen.
    const db = dbMedDoc([['a', { result: '1' }]]);
    const r = await syncXgCore(db, FieldValue, { provider: identitet([]), sync: {} });
    expect(r).toEqual({ manglede: 1, hentet: 0, skrevet: 0 });
    expect(db.commits).toBe(0);
  });

  it('er stille for en kilde UDEN hentXg — det er ikke en fejl', async () => {
    const db = dbMedDoc([['a', { result: '1' }]]);
    const uden = { resolveDocs: () => new Map() };
    expect(await syncXgCore(db, FieldValue, { provider: uden, sync: {} }))
      .toEqual({ manglede: 0, hentet: 0, skrevet: 0 });
  });

  it('oversætter kildens nøgle tilbage til dokumentet — også når de er forskellige', async () => {
    // Pulselive-formen: dokument-id er r{runde}-{matchId}, kildens nøgle er
    // halen. Kernen må ikke selv kende den form.
    const suffiks = {
      async hentXg(sync, fetchFn, docIds) {
        return docIds.map((id) => ({
          sourceKey: String(id).slice(String(id).lastIndexOf('-') + 1),
          xgHome: 2, xgAway: 1,
        }));
      },
      resolveDocs(sourceKeys, docIds) {
        const efter = new Map();
        for (const id of docIds) efter.set(String(id).slice(String(id).lastIndexOf('-') + 1), id);
        const m = new Map();
        for (const k of sourceKeys) if (efter.has(String(k))) m.set(k, efter.get(String(k)));
        return m;
      },
    };
    const db = dbMedDoc([['r1-2645195', { result: '1' }]]);
    await syncXgCore(db, FieldValue, { provider: suffiks, sync: {} });
    expect(db.skrevet[0].id).toBe('r1-2645195');
  });
});
