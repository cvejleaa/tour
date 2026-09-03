import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';
import { readFileSync } from 'fs';

const require = createRequire(import.meta.url);
const {
  liveMaalAf, syncLiveMaalCore, syncLiveMaalForSpil, liveMaalLinje, liveMaalNiveau, sammeListe,
  LIVE_SKRIVBARE, LIVE_LOFT, LIVE_BUDGET_MS, LIVE_TIMEOUT_S, LIVE_NEDKOELING_MS, ANNULLERET_IT, ANNULLERET_LOFT,
} = require('./liveMaal');
const { SYNCED_GAMES } = require('./syncProviders');
const { SKRIVBARE_FELTER, KALD_TIMEOUT_MS } = require('./kampDetaljer');

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/livescore-kampe.json', import.meta.url), 'utf8'));
const kamp = (eid) => {
  const k = FIXTURE.kampe.find((x) => x.Eid === eid);
  if (!k) throw new Error(`fixture mangler Eid ${eid}`);
  return k;
};
// 1793564: 2-2 med et ANNULLERET mål (IT 62, VAR) i 32. — og 1784439: 0-0,
// hvis eneste hændelse med stilling er et annulleret mål.
const TO_TO = kamp('1793564').incidents;
const NUL_NUL = kamp('1784439').incidents;
const EN_NUL = kamp('1784451').incidents;

describe('liveMaalAf — målene, bundet til VORES levende stilling', () => {
  it('skriver kæden, når kilden og vores live-stilling er enige', () => {
    const ud = liveMaalAf(EN_NUL, { home: 1, away: 0 });
    expect(ud.afvist).toBeUndefined();
    // Præcis to lister og INGEN kopi af stillingen: den står allerede i
    // match.live, og en kopi skrevet af et andet job ville drive fra den.
    expect(Object.keys(ud).sort()).toEqual(['annullerede', 'maal']);
    expect(ud.maal.filter((m) => m.hold === 'home')).toHaveLength(1);
    expect(ud.maal.filter((m) => m.hold === 'away')).toHaveLength(0);
    expect(ud.maal).toHaveLength(1);
    expect(ud.maal[0]).toMatchObject({ hold: 'home', selvmaal: false });
    expect(typeof ud.maal[0].minut).toBe('number');
    expect(ud.annullerede).toEqual([]);
  });

  it('UENIGHED om stillingen → intet — en liste, der modsiger tallet, er værre end ingen', () => {
    // Kilden siger 1-0, vores live siger 0-0 (bagud) eller 1-1 (foran).
    expect(liveMaalAf(EN_NUL, { home: 0, away: 0 })).toEqual({ afvist: 'uenig' });
    expect(liveMaalAf(EN_NUL, { home: 1, away: 1 })).toEqual({ afvist: 'uenig' });
    // Pr. SIDE, ikke på totalen: 1-0 mod 0-1 er samme total og stadig uenig.
    expect(liveMaalAf(EN_NUL, { home: 0, away: 1 })).toEqual({ afvist: 'uenig' });
  });

  it('uden en brugbar stilling i en af enderne → uenig, aldrig et kast', () => {
    expect(liveMaalAf(EN_NUL, null)).toEqual({ afvist: 'uenig' });
    expect(liveMaalAf(EN_NUL, { home: '1', away: null })).toEqual({ afvist: 'uenig' });
    expect(liveMaalAf({ Tr1: null, Tr2: 0 }, { home: 0, away: 0 })).toEqual({ afvist: 'uenig' });
    expect(liveMaalAf(null, { home: 0, away: 0 })).toEqual({ afvist: 'uenig' });
  });

  it('et ANNULLERET mål står for sig, markeret — og tæller ikke i kæden', () => {
    const ud = liveMaalAf(TO_TO, { home: 2, away: 2 });
    expect(ud.afvist).toBeUndefined();
    expect(ud.maal).toHaveLength(4);
    expect(ud.annullerede).toEqual([{ hold: 'home', minut: 32, scorer: 'Florian Wirtz' }]);
    // Den annullerede scorer må ikke også stå i den tællende liste i 32.
    expect(ud.maal.some((m) => m.minut === 32 && m.scorer === 'Florian Wirtz')).toBe(false);
  });

  it('en målløs kamp med et annulleret mål: tom kæde, én annulleret', () => {
    const ud = liveMaalAf(NUL_NUL, { home: 0, away: 0 });
    expect(ud.maal).toEqual([]);
    expect(ud.annullerede).toEqual([{ hold: 'away', minut: 7, scorer: 'Thomas Joergensen' }]);
  });

  it('en brudt kæde → uparset, selv om stillingen stemmer', () => {
    // Fjern målenes stillinger: Tr siger 1-0, men ingen hændelse bærer Sc.
    const uden = JSON.parse(JSON.stringify(EN_NUL));
    for (const liste of Object.values(uden.Incs || {})) for (const h of liste) delete h.Sc;
    expect(liveMaalAf(uden, { home: 1, away: 0 })).toEqual({ afvist: 'uparset' });
  });

  it('kæden tjekkes PR. SIDE — en brudt udekæde afviser, selv om hjemmekæden er hel', () => {
    // 2-2: fjern stillingen på UDE-målene alene. Hjemme 1..2 er ubrudt,
    // ude er tom mod 2 → uparset. Uden side-tjekket på ude ville totalen
    // eller hjemmekæden alene slippe listen igennem med to mål for lidt.
    // Stillingen sidder BÅDE på containeren og på under-hændelserne (36/63),
    // og maalAf læser dem alle — så begge lag skal strippes for siden.
    const udenSc = (inc, side) => {
      const kopi = JSON.parse(JSON.stringify(inc));
      const strip = (h) => { if (h.Nm === side) delete h.Sc; (h.Incs || []).forEach(strip); };
      for (const liste of Object.values(kopi.Incs || {})) liste.forEach(strip);
      return kopi;
    };
    expect(liveMaalAf(udenSc(TO_TO, 2), { home: 2, away: 2 })).toEqual({ afvist: 'uparset' });
    // Og spejlet: hjemme brudt, ude hel.
    expect(liveMaalAf(udenSc(TO_TO, 1), { home: 2, away: 2 })).toEqual({ afvist: 'uparset' });
  });

  it('en giftig post kaster ikke ud af regnedelen', () => {
    const gift = JSON.parse(JSON.stringify(TO_TO));
    gift.Incs['1'].push({ IT: ANNULLERET_IT, Nm: 1, Min: 40, Pn: { toString: null } });
    const ud = liveMaalAf(gift, { home: 2, away: 2 });
    expect(ud.annullerede.map((a) => a.minut)).toEqual([32, 40]);
    expect(ud.annullerede[1].scorer).toBeUndefined();
  });
});

describe('annullerede har et loft — listen er ikke bundet af kæden', () => {
  it('beholder de FØRSTE efter minut og kapper resten', () => {
    // Security: 20.000 IT-62 → 1,58 MB, over Firestores 1 MiB pr. dokument.
    const mange = Array.from({ length: ANNULLERET_LOFT + 10 }, (_, i) => ({
      IT: ANNULLERET_IT, Nm: 1, Min: 90 - i, Pn: `Spiller ${i}`,
    }));
    const ud = liveMaalAf({ Tr1: 0, Tr2: 0, Incs: { 1: mange } }, { home: 0, away: 0 });
    expect(ud.afvist).toBeUndefined();
    expect(ud.annullerede).toHaveLength(ANNULLERET_LOFT);
    expect(ud.annullerede[0].minut).toBe(90 - (ANNULLERET_LOFT + 9));
    expect(ud.annullerede.at(-1).minut).toBe(90 - 10);
    expect(ANNULLERET_LOFT).toBeLessThanOrEqual(25);
  });
});

describe('LIVE_SKRIVBARE — én vagt pr. skrivesti', () => {
  it('live-feltet står IKKE på facit-stiens liste, og facit-felterne står ikke på live-stiens', () => {
    // KUN liveMaal: kortlægningen (livescoreEid) er sweep'ets, aldrig live-stiens.
    expect(LIVE_SKRIVBARE).toEqual(['liveMaal']);
    expect(Object.isFrozen(LIVE_SKRIVBARE)).toBe(true);
    expect(SKRIVBARE_FELTER).not.toContain('liveMaal');
    for (const f of ['maal', 'result', 'homeGoals', 'awayGoals', 'kickoff']) expect(LIVE_SKRIVBARE).not.toContain(f);
  });
});

// ---------------------------------------------------------------------------
// syncLiveMaalCore — løkken. Fake-Firestore: games/{g} med teams, matches med
// where-kæde (pendingMatches) og batch.update/commit, der registrerer alt.
// ---------------------------------------------------------------------------
const FieldValue = { serverTimestamp: () => '@ts', delete: () => '@delete' };
const TEAMS = [{ name: 'FC Midtjylland', short: 'FCM' }, { name: 'Randers FC', short: 'RFC' }];
const NU = Date.parse('2026-07-24T18:00:00Z');
const KICKOFF = new Date('2026-07-24T17:00:00Z');

function fakeDb(matches, teams = TEAMS, spil = {}) {
  const docs = new Map(matches.map((m) => [m.id, m.data]));
  const spilDoc = { teams, ...spil };
  const alle = () => [...docs.entries()].map(([id, data]) => ({ id, data: () => data }));
  const medFiltre = (filtre) => ({
    where: (felt, op, v) => medFiltre([...filtre, { felt, op, v }]),
    async get() {
      const passer = (d) => filtre.every(({ felt, op, v }) => {
        const x = d.data()[felt];
        if (x == null) return false;
        if (op === '>=') return x >= v;
        if (op === '<=') return x <= v;
        throw new Error(`faken kender ikke ${op}`);
      });
      return { docs: alle().filter(passer) };
    },
  });
  const self = {
    updates: [], commits: 0, gameReads: 0, spilSkrivninger: [], spil: spilDoc,
    collection: (navn) => {
      if (navn !== 'games') throw new Error(`uventet ${navn}`);
      return {
        doc: (gid) => ({
          get: async () => { self.gameReads += 1; return { exists: true, data: () => ({ ...spilDoc }) }; },
          async set(patch, o) {
            if (o?.merge !== true) throw new Error('set() uden merge ville overskrive spil-dokumentet');
            Object.assign(spilDoc, patch); self.spilSkrivninger.push(patch);
          },
          collection: () => ({
            doc: (id) => ({ id, __gid: gid }),
            where: (felt, op, v) => medFiltre([{ felt, op, v }]),
            get: async () => ({ docs: alle() }),
          }),
        }),
      };
    },
    batch: () => ({
      update(ref, felter) {
        for (const [k, v] of Object.entries(felter)) if (v === undefined) throw new Error(`undefined i ${k}`);
        self.updates.push({ id: ref.id, felter });
      },
      async commit() { self.commits += 1; },
    }),
  };
  return self;
}

/** fetch-attrap: stage-listen + incidents pr. Eid (eller null = 404). */
function fakeFetch({ incidentsAf = {}, stageEid = '1784451', status = 200 } = {}) {
  return vi.fn(async (url) => {
    if (status !== 200) return { ok: false, status };
    if (url.includes('/stage/')) {
      return {
        ok: true, status: 200,
        json: async () => ({ Stages: [{ Events: [{ Eid: stageEid, Esd: 20260724170000, T1: [{ Abr: 'FCM' }], T2: [{ Abr: 'RAN' }] }] }] }),
      };
    }
    const m = url.match(/incidents\/soccer\/(\d+)/);
    const inc = m ? incidentsAf[m[1]] : undefined;
    if (inc === undefined) return { ok: false, status: 404 };
    return { ok: true, status: 200, json: async () => inc };
  });
}

const I_GANG = (extra = {}) => ({
  home: 'FC Midtjylland', away: 'Randers FC', kickoff: KICKOFF, result: null,
  live: { home: 1, away: 0, status: 'anden', at: NU - 60000 },
  livescoreEid: '1784451',
  ...extra,
});
const opts = (extra = {}) => ({
  gameId: 'superliga2627', livescore: { land: 'denmark', liga: 'superliga' }, nowMs: NU,
  fetchFn: fakeFetch({ incidentsAf: { 1784451: EN_NUL } }), ...extra,
});

describe('syncLiveMaalCore — målscorere for kampe i gang', () => {
  it('skriver liveMaal for en kamp i gang med cachet id — ét kald, intet stage-kald', async () => {
    const db = fakeDb([{ id: 'k1', data: I_GANG() }]);
    const fetchFn = fakeFetch({ incidentsAf: { 1784451: EN_NUL } });
    const ud = await syncLiveMaalCore(db, FieldValue, opts({ fetchFn, only: [{ id: 'k1', data: I_GANG() }] }));
    expect(ud).toMatchObject({ iGang: 1, valgte: 1, forsoegt: 1, skrevet: 1, uaendrede: 0, afbrudt: false });
    expect(db.updates).toHaveLength(1);
    expect(Object.keys(db.updates[0].felter)).toEqual(['liveMaal']);
    const lm = db.updates[0].felter.liveMaal;
    expect(lm.maal).toHaveLength(1);
    expect(lm.maal[0]).toMatchObject({ hold: 'home', selvmaal: false });
    expect(lm.annullerede).toEqual([]);
    expect(lm.at).toBe(NU);
    expect(db.commits).toBe(1);
    const kald = fetchFn.mock.calls.map((c) => String(c[0]));
    expect(kald).toHaveLength(1);
    expect(kald[0]).toContain('/incidents/soccer/1784451');
    expect(db.gameReads).toBe(0); // holdlisten læses kun, når et id mangler
  });

  it('skriver IKKE, når listen er uændret — hvert kampdokument lyttes på af hver browser', async () => {
    const foer = { maal: [{ hold: 'home', minut: 45, selvmaal: false, scorer: 'X' }], annullerede: [], at: 1 };
    // Samme indhold som EN_NUL giver — regnes af funktionen selv for at undgå en håndskrevet kopi.
    const facit = liveMaalAf(EN_NUL, { home: 1, away: 0 });
    const kamp = I_GANG({ liveMaal: { ...facit, at: NU - 60000 } });
    const db = fakeDb([{ id: 'k1', data: kamp }]);
    const ud = await syncLiveMaalCore(db, FieldValue, opts({ only: [{ id: 'k1', data: kamp }] }));
    expect(ud).toMatchObject({ forsoegt: 1, skrevet: 0, uaendrede: 1 });
    expect(db.updates).toHaveLength(0);
    expect(db.commits).toBe(0);
    expect(sammeListe(foer, { ...foer, at: 99 })).toBe(true); // `at` tæller ikke
    expect(sammeListe(foer, { ...foer, maal: [] })).toBe(false);
  });

  it('uenig om stillingen → intet skrives, tælles som uenig (næste minut heler det)', async () => {
    const kamp = I_GANG({ live: { home: 2, away: 0, status: 'anden', at: NU } }); // kilden siger 1-0
    const db = fakeDb([{ id: 'k1', data: kamp }]);
    const ud = await syncLiveMaalCore(db, FieldValue, opts({ only: [{ id: 'k1', data: kamp }] }));
    expect(ud).toMatchObject({ forsoegt: 1, skrevet: 0, uenige: 1 });
    expect(db.updates).toHaveLength(0);
  });

  it('404 på et cachet id tæller "kilden svarede ikke" — og RØRER ikke id\'et (sweep\'et heler)', async () => {
    // Første udgave slettede id'et her og slog det op igen næste minut: én
    // kamp gav 150 stage-kald pr. kampvindue (Security målte). Nu: intet.
    const kamp = I_GANG({ livescoreEid: '9999999' });
    const db = fakeDb([{ id: 'k1', data: kamp }]);
    const fetchFn = fakeFetch({ incidentsAf: {} });
    const ud = await syncLiveMaalCore(db, FieldValue, opts({ fetchFn, only: [{ id: 'k1', data: kamp }] }));
    expect(ud).toMatchObject({ forsoegt: 1, utilgaengelige: 1, skrevet: 0 });
    expect(db.updates).toHaveLength(0);
    expect(db.commits).toBe(0);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('mangler id\'et, tælles kampen ukendt — INTET stage-kald, ingen holdlæsning: kortlægning er sweep\'ets', async () => {
    const kamp = I_GANG({ livescoreEid: undefined });
    const gift = I_GANG({ livescoreEid: '../../x' });
    const db = fakeDb([{ id: 'k1', data: kamp }, { id: 'k2', data: gift }, { id: 'k3', data: I_GANG() }]);
    const fetchFn = fakeFetch({ incidentsAf: { 1784451: EN_NUL } });
    const ud = await syncLiveMaalCore(db, FieldValue, opts({ fetchFn, only: [
      { id: 'k1', data: kamp }, { id: 'k2', data: gift }, { id: 'k3', data: I_GANG() },
    ] }));
    expect(ud).toMatchObject({ iGang: 3, ukendte: 2, forsoegt: 1, skrevet: 1 });
    const kald = fetchFn.mock.calls.map((c) => String(c[0]));
    expect(kald).toHaveLength(1);
    expect(kald[0]).toContain('/incidents/soccer/1784451');
    expect(kald.some((u) => u.includes('/stage/') || u.includes('..'))).toBe(false);
    expect(db.gameReads).toBe(0);
    expect(db.updates.map((u) => u.id)).toEqual(['k3']);
  });

  it('et svar, der ikke er JSON, koster én kamp — de andre skrives (den ydre vagt er den eneste)', async () => {
    const ok = fakeFetch({ incidentsAf: { 1784451: EN_NUL } });
    const fetchFn = vi.fn(async (u, o) => (u.includes('/incidents/soccer/5555555')
      ? { ok: true, status: 200, json: async () => { throw new SyntaxError("Unexpected token '<'"); } }
      : ok(u, o)));
    const only = [{ id: 'html', data: I_GANG({ livescoreEid: '5555555' }) }, { id: 'ok', data: I_GANG() }];
    const db = fakeDb(only);
    const ud = await syncLiveMaalCore(db, FieldValue, opts({ fetchFn, only }));
    expect(ud).toMatchObject({ uparsede: 1, skrevet: 1, afbrudt: false });
    expect(db.updates.map((u) => u.id)).toEqual(['ok']);
  });

  it('vælger KUN kampe i gang: facit, slut, afbrudt og uden live springes over', async () => {
    const only = [
      { id: 'facit', data: I_GANG({ result: '1' }) },
      { id: 'slut', data: I_GANG({ live: { home: 1, away: 0, status: 'slut' } }) },
      { id: 'afbrudt', data: I_GANG({ live: { home: 1, away: 0, status: 'afbrudt' } }) },
      { id: 'ingen', data: I_GANG({ live: undefined }) },
      { id: 'gift', data: I_GANG({ live: 'ja' }) },
      { id: 'ok', data: I_GANG() },
    ];
    const db = fakeDb(only);
    const fetchFn = fakeFetch({ incidentsAf: { 1784451: EN_NUL } });
    const ud = await syncLiveMaalCore(db, FieldValue, opts({ fetchFn, only }));
    expect(ud).toMatchObject({ iGang: 1, valgte: 1, skrevet: 1 });
    expect(db.updates.map((u) => u.id)).toEqual(['ok']);
  });

  it('loftet: højst LIVE_LOFT kampe pr. kørsel, resten tælles som over loftet', async () => {
    const only = Array.from({ length: LIVE_LOFT + 3 }, (_, i) => ({ id: `k${i}`, data: I_GANG() }));
    const db = fakeDb(only);
    const fetchFn = fakeFetch({ incidentsAf: { 1784451: EN_NUL } });
    const ud = await syncLiveMaalCore(db, FieldValue, opts({ fetchFn, only }));
    expect(ud).toMatchObject({ iGang: LIVE_LOFT + 3, valgte: LIVE_LOFT, forsoegt: LIVE_LOFT });
    expect(fetchFn).toHaveBeenCalledTimes(LIVE_LOFT);
    expect(LIVE_LOFT).toBe(10); // ejerens valg (2/9)
    const ud2 = await syncLiveMaalCore(fakeDb(only), FieldValue, opts({ fetchFn: fakeFetch({ incidentsAf: { 1784451: EN_NUL } }), only, loft: 2 }));
    expect(ud2).toMatchObject({ valgte: 2, forsoegt: 2 });
  });

  it('429 afbryder kørslen — det, der allerede lå i batchen, skrives stadig', async () => {
    let kald = 0;
    const ok = fakeFetch({ incidentsAf: { 1784451: EN_NUL } });
    const fetchFn = vi.fn(async (u, o) => { kald += 1; return kald >= 2 ? { ok: false, status: 429 } : ok(u, o); });
    const only = [{ id: 'k1', data: I_GANG() }, { id: 'k2', data: I_GANG() }, { id: 'k3', data: I_GANG() }];
    const db = fakeDb(only);
    const ud = await syncLiveMaalCore(db, FieldValue, opts({ fetchFn, only }));
    expect(ud.afbrudt).toBe(true);
    expect(ud.skrevet).toBe(1);
    expect(fetchFn).toHaveBeenCalledTimes(2); // stopper straks — k3 røres ikke
    expect(db.updates.map((u) => u.id)).toEqual(['k1']);
    expect(db.commits).toBe(1);
  });

  it('ét giftigt dokument koster én kamp, ikke de andre', async () => {
    const gift = I_GANG({ live: { home: { toString: null }, away: 0, status: 'anden' } });
    const only = [{ id: 'gift', data: gift }, { id: 'ok', data: I_GANG() }];
    const db = fakeDb(only);
    const ud = await syncLiveMaalCore(db, FieldValue, opts({ only }));
    expect(ud).toMatchObject({ uparsede: 1, skrevet: 1, afbrudt: false });
    expect(db.updates.map((u) => u.id)).toEqual(['ok']);
  });

  it('skriver ALDRIG andet end LIVE_SKRIVBARE — heller ikke facit-felter eller id\'et', async () => {
    const only = [{ id: 'k1', data: I_GANG({ livescoreEid: undefined }) }, { id: 'k2', data: I_GANG() }];
    const db = fakeDb(only);
    await syncLiveMaalCore(db, FieldValue, opts({ only }));
    expect(db.updates.length).toBeGreaterThan(0);
    for (const u of db.updates) {
      expect(Object.keys(u.felter)).toEqual(['liveMaal']);
      for (const f of ['maal', 'result', 'homeGoals', 'awayGoals', 'kickoff', 'live', 'livescoreEid']) expect(u.felter).not.toHaveProperty(f);
    }
  });

  it('budgettet: er tiden gået, røres ingen kamp — og kørslen er ikke afbrudt', async () => {
    const only = [{ id: 'k1', data: I_GANG() }];
    let t = 0;
    const klokke = () => { t += 100000; return t; };
    const fetchFn = fakeFetch({ incidentsAf: { 1784451: EN_NUL } });
    const ud = await syncLiveMaalCore(fakeDb(only), FieldValue, opts({ fetchFn, only, klokke, budgetMs: 50 }));
    expect(ud).toMatchObject({ iGang: 1, forsoegt: 0, afbrudt: false });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('uden livescore-konfiguration eller uden kampe: tomt resultat, intet kald', async () => {
    const fetchFn = fakeFetch();
    expect(await syncLiveMaalCore(fakeDb([]), FieldValue, opts({ fetchFn, livescore: null, only: [{ id: 'k1', data: I_GANG() }] })))
      .toMatchObject({ iGang: 0, skrevet: 0 });
    expect(await syncLiveMaalCore(fakeDb([]), FieldValue, opts({ fetchFn, only: [] }))).toMatchObject({ iGang: 0 });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('budgetterne summer under jobbets timeout MED overløbet på ét kald pr. spil', () => {
    // Et budget-tjek i toppen af løkken kan ikke afbryde et await: loftet pr.
    // spil er budget + KALD_TIMEOUT_MS. Første udgave gav 60 s ved to spil
    // og 70 s ved tre — præcis timeouten og over (Security målte).
    expect(LIVE_TIMEOUT_S).toBe(60);
    expect(KALD_TIMEOUT_MS).toBe(10000);
    const loft = SYNCED_GAMES.length * (LIVE_BUDGET_MS + KALD_TIMEOUT_MS);
    expect(loft).toBeLessThanOrEqual(LIVE_TIMEOUT_S * 1000 - 5000);
    // Og ikke degenereret: der er tid til mindst ét kald pr. spil.
    expect(LIVE_BUDGET_MS).toBeGreaterThanOrEqual(KALD_TIMEOUT_MS);
  });
});

describe('syncLiveMaalForSpil — kampene i vinduet, nedkølingen, så løkken', () => {
  it('bruger pendingMatches (2,5 timer efter kickoff) og skriver for den, der er i gang', async () => {
    const forGammel = I_GANG({ kickoff: new Date(NU - 5 * 3600 * 1000) });
    const fremtid = I_GANG({ kickoff: new Date(NU + 3600 * 1000) });
    const db = fakeDb([{ id: 'gammel', data: forGammel }, { id: 'nu', data: I_GANG() }, { id: 'snart', data: fremtid }]);
    const ud = await syncLiveMaalForSpil(db, FieldValue, opts());
    expect(ud).toMatchObject({ iGang: 1, skrevet: 1, afbrudt: false });
    expect(ud.sprunget).toBeUndefined();
    expect(db.updates.map((u) => u.id)).toEqual(['nu']);
    expect(db.updates[0].felter.liveMaal.at).toBe(NU);
    expect(db.gameReads).toBe(1);
    expect(db.spilSkrivninger).toEqual([]);
  });

  it('et stille minut koster INGEN læsning af spil-dokumentet', async () => {
    const db = fakeDb([{ id: 'facit', data: I_GANG({ result: '1' }) }]);
    const fetchFn = fakeFetch();
    const ud = await syncLiveMaalForSpil(db, FieldValue, opts({ fetchFn }));
    expect(ud).toMatchObject({ iGang: 0 });
    expect(db.gameReads).toBe(0);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('holder pause, mens livescoreLukketTil er i fremtiden — intet kald, kortet siger det', async () => {
    const db = fakeDb([{ id: 'nu', data: I_GANG() }], TEAMS, { livescoreLukketTil: NU + 30 * 60000 });
    const fetchFn = fakeFetch({ incidentsAf: { 1784451: EN_NUL } });
    const ud = await syncLiveMaalForSpil(db, FieldValue, opts({ fetchFn }));
    expect(ud).toMatchObject({ iGang: 1, sprunget: true, lukketTil: NU + 30 * 60000, skrevet: 0 });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(liveMaalNiveau(ud)).toBe('advarsel');
    expect(liveMaalLinje(ud)).toMatch(/^Live-mål: pause efter 429\/403 fra kilden — 1 kamp i gang, prøver igen kl\. \d\d[.:]\d\d\.$/);
    // En UDLØBET pause gælder ikke.
    const db2 = fakeDb([{ id: 'nu', data: I_GANG() }], TEAMS, { livescoreLukketTil: NU - 1 });
    const ud2 = await syncLiveMaalForSpil(db2, FieldValue, opts({ fetchFn: fakeFetch({ incidentsAf: { 1784451: EN_NUL } }) }));
    expect(ud2).toMatchObject({ skrevet: 1 });
  });

  it('sætter pausen på spil-dokumentet, når kilden lukkede os ude', async () => {
    const db = fakeDb([{ id: 'nu', data: I_GANG() }]);
    const fetchFn = vi.fn(async () => ({ ok: false, status: 429 }));
    const ud = await syncLiveMaalForSpil(db, FieldValue, opts({ fetchFn }));
    expect(ud).toMatchObject({ afbrudt: true, lukketTil: NU + LIVE_NEDKOELING_MS });
    expect(db.spilSkrivninger).toEqual([{ livescoreLukketTil: NU + LIVE_NEDKOELING_MS }]);
    expect(LIVE_NEDKOELING_MS).toBe(60 * 60 * 1000);
    expect(liveMaalLinje(ud)).toContain('pause til kl.');
  });
});

describe('liveMaalLinje og liveMaalNiveau — kortets tekst og farve', () => {
  const d = (x) => ({
    iGang: 0, valgte: 0, forsoegt: 0, skrevet: 0, uaendrede: 0, uenige: 0, uparsede: 0,
    utilgaengelige: 0, ukendte: 0, afbrudt: false, ...x,
  });

  it('nævner kun de tal, der er sat — og hvert med sin egen betydning', () => {
    const linje = liveMaalLinje(d({ iGang: 3, valgte: 3, forsoegt: 3, skrevet: 1, uaendrede: 1, uenige: 1 }));
    expect(linje).toBe('Live-mål: 3 kampe i gang, 1 liste skrevet, 1 uændret, 1 uenige om stillingen.');
    expect(linje).not.toMatch(/kilden ikke svarede|uden id|over loftet|pause/);
    const alt = liveMaalLinje(d({ iGang: 12, valgte: 10, forsoegt: 10, utilgaengelige: 2, ukendte: 1, uparsede: 1, afbrudt: true, lukketTil: 0 }));
    expect(alt).toContain('2 hvor kilden ikke svarede');
    expect(alt).toContain('1 uden id hos kilden');
    expect(alt).toContain('1 kunne ikke parses');
    expect(alt).toContain('2 over loftet');
    expect(alt).toContain('429/403');
    expect(liveMaalLinje(d({ iGang: 1, valgte: 1 }))).toBe('Live-mål: 1 kamp i gang, 0 lister skrevet.');
  });

  it('advarsel ved afbrydelse, og når vi prøvede uden at noget kom igennem — ellers ok', () => {
    expect(liveMaalNiveau(d({ afbrudt: true }))).toBe('advarsel');
    expect(liveMaalNiveau(d({ forsoegt: 2, utilgaengelige: 2 }))).toBe('advarsel');
    expect(liveMaalNiveau(d({ forsoegt: 2, uenige: 2 }))).toBe('advarsel');
    expect(liveMaalNiveau(d({ forsoegt: 2, uenige: 1, uaendrede: 1 }))).toBe('ok');
    expect(liveMaalNiveau(d({ forsoegt: 1, skrevet: 1 }))).toBe('ok');
    expect(liveMaalNiveau(d({ iGang: 1, ukendte: 1 }))).toBe('ok'); // intet forsøgt — koblingen er kortets egen linje
    expect(liveMaalNiveau(d({ iGang: 1, sprunget: true }))).toBe('advarsel');
  });
});
