// Tests for kampdetalje-synken (halvleg, målscorere, tilskuertal).
//
// TRE TING BÆRES AF DEM, SOM INGEN ANDEN TEST KAN SE:
//
//  1. AT MÅL UDLEDES AF STILLINGEN OG IKKE AF HÆNDELSESKODEN. Fixturen
//     `fixtures/livescore-kampe.json` er valgt på KODE-DÆKNING: den rummer et
//     annulleret mål i en 0-0-kamp (en IT-whitelist ville opfinde et mål der),
//     flade mål uden container (en whitelist ville tabe dem), og en kamp uden
//     tilskuertal. Payloaden er committet, fordi paritetstesten mod den
//     LEVENDE kilde fanger drift, men ikke kan bevise, at parseren tåler de
//     former, kilden faktisk sender.
//  2. AT DE FORBUDTE FELTER IKKE KAN SKRIVES. `result`, `homeGoals`,
//     `awayGoals` og `kickoff` afgør point, Elo og tip-vinduet. Testen muterer
//     selve felt-listen for at bevise, at vagten er dén ene liste.
//  3. AT EN PERMANENT UENIG KAMP IKKE BLIVER EN GIFTPILLE. Uden karantænen
//     hentes den igen ved hver kørsel for evigt og æder loftet.
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';
import { readFileSync } from 'fs';

const require = createRequire(import.meta.url);
const {
  syncKampDetaljerCore, detaljerAf, maalAf, kaedeOk, noegleAfKamp,
  heltal, tilskuertal, hentNoegler, KildenLukkerOs,
  SKRIVBARE_FELTER, FORBUDTE_FELTER, DETALJE_LOFT, AFVIST_KARANTAENE_MS, API,
} = require('./kampDetaljer');

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/livescore-kampe.json', import.meta.url), 'utf8'));
const kamp = (eid) => {
  const k = FIXTURE.kampe.find((x) => x.Eid === eid);
  if (!k) throw new Error(`fixture mangler Eid ${eid} — er filen genskrevet?`);
  return k;
};

// ---------------------------------------------------------------------------
// Fixturen selv. En fixture, der har mistet sin dækning, gør alle testene
// nedenfor til teater — de ville stadig være grønne.
// ---------------------------------------------------------------------------
describe('fixturen dækker de former, der væltede IT-whitelisten', () => {
  const koder = (k) => {
    const ud = new Set();
    const gaa = (x) => {
      if (Array.isArray(x)) { x.forEach(gaa); return; }
      if (x && typeof x === 'object') {
        if (x.IT != null) ud.add(x.IT);
        if (Array.isArray(x.Incs)) gaa(x.Incs);
      }
    };
    gaa(Object.values(k.incidents.Incs || {}));
    return ud;
  };

  it('rummer et ANNULLERET mål (IT 62) i en kamp uden mål', () => {
    const k = kamp('1784439');
    expect(k.incidents.Tr1).toBe('0');
    expect(k.incidents.Tr2).toBe('0');
    expect(koder(k).has(62)).toBe(true);
  });

  it('rummer FLADE mål (IT 37/38/39) uden container', () => {
    const flade = FIXTURE.kampe.filter((k) => [...koder(k)].some((c) => [37, 38, 39].includes(c)));
    expect(flade.length).toBeGreaterThanOrEqual(3);
  });

  it('rummer en kamp UDEN tilskuertal', () => {
    expect(FIXTURE.kampe.some((k) => k.info?.Vsp == null)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Målene
// ---------------------------------------------------------------------------
describe('maalAf — stillingen, ikke koden', () => {
  it('et annulleret mål bliver IKKE til et mål (0-0 forbliver målløs)', () => {
    // Præcis dét, en IT-whitelist med 62 udenfor ville have klaret — men som
    // en whitelist med 62 INDENFOR ville have fejlet på. Reglen skal kunne
    // afvise en hændelse, den aldrig har set.
    expect(maalAf(kamp('1784439').incidents.Incs)).toEqual([]);
  });

  it('flade mål uden container tælles med (BRE-TOT 3-0)', () => {
    const m = maalAf(kamp('1793556').incidents.Incs);
    expect(m.filter((x) => x.hold === 'home')).toHaveLength(3);
    expect(m.filter((x) => x.hold === 'away')).toHaveLength(0);
  });

  it('finder både mål og oplæg i en container (FCM-RAN 1-0)', () => {
    const m = maalAf(kamp('1784451').incidents.Incs);
    expect(m).toHaveLength(1);
    expect(m[0].hold).toBe('home');
    expect(m[0].minut).toBeGreaterThan(0);
    // Assertér på INDHOLDET, ikke på at der stod noget: en test, der kun
    // tjekker at feltet findes, ville overleve at scorer og oplæg byttede
    // plads.
    expect(typeof m[0].scorer).toBe('string');
    expect(m[0].scorer.length).toBeGreaterThan(2);
  });

  it('en kamp med BÅDE annulleret og fladt mål rammer kæden (LIV-FOR 2-2)', () => {
    const k = kamp('1793564');
    const m = maalAf(k.incidents.Incs);
    expect(m.filter((x) => x.hold === 'home')).toHaveLength(2);
    expect(m.filter((x) => x.hold === 'away')).toHaveLength(2);
  });

  it('målene kommer i minut-rækkefølge', () => {
    const m = maalAf(kamp('1793564').incidents.Incs);
    expect(m.map((x) => x.minut)).toEqual([...m.map((x) => x.minut)].sort((a, b) => a - b));
  });

  it('holdet er en SIDE, aldrig et navn', () => {
    for (const k of FIXTURE.kampe) {
      for (const m of maalAf(k.incidents.Incs)) {
        expect(['home', 'away']).toContain(m.hold);
      }
    }
  });

  it('alle fixturens mål har et scorernavn', () => {
    for (const k of FIXTURE.kampe) {
      for (const m of maalAf(k.incidents.Incs)) expect(m.scorer).toBeTruthy();
    }
  });

  it('en nestet liste gennemløbes rekursivt — en flad løkke taber mål', () => {
    // Container-formen: mål+oplæg i en indre liste, uden IT på den ydre.
    const incs = {
      1: [{ Min: 10, Nm: 1, Sc: ['1', '0'], Incs: [{ Min: 10, Nm: 1, Sc: ['1', '0'], IT: 36, Pn: 'A B' }] }],
    };
    expect(maalAf(incs)).toHaveLength(1);
    expect(maalAf(incs)[0].scorer).toBe('A B');
  });

  it('fremmed fritekst renses — og {toString:null} vælter ikke opslaget', () => {
    const giftig = {
      1: [{ Min: 5, Nm: 1, Sc: ['1', '0'], IT: 36, Pn: { toString: null } }],
      2: [{ Min: 60, Nm: 1, Sc: ['2', '0'], IT: 36, Pn: '<script>alert(1)</script>Ond {Person}' }],
    };
    const m = maalAf(giftig);
    expect(m).toHaveLength(2);
    expect(m[0].scorer).toBeNull(); // ikke 'Spiller' — et opdigtet navn er værre
    expect(m[1].scorer).not.toContain('<');
    expect(m[1].scorer).not.toContain('{');
    expect(m[1].scorer).not.toContain('}');
  });
});

describe('kaedeOk', () => {
  const m = (nr) => nr.map((n) => ({ nr: n }));
  it('accepterer den ubrudte kæde', () => expect(kaedeOk(m([1, 2, 3]), 3)).toBe(true));
  it('accepterer nul mål mod nul', () => expect(kaedeOk([], 0)).toBe(true));
  it('afviser et hul i kæden', () => expect(kaedeOk(m([1, 3]), 2)).toBe(false));
  it('afviser en dublet', () => expect(kaedeOk(m([1, 1]), 2)).toBe(false));
  it('afviser for få mål', () => expect(kaedeOk(m([1]), 2)).toBe(false));
  it('afviser for mange mål', () => expect(kaedeOk(m([1, 2, 3]), 2)).toBe(false));
  it('afviser et facit, der ikke er et heltal', () => expect(kaedeOk([], null)).toBe(false));
});

// ---------------------------------------------------------------------------
// Parserne — Number-fælden
// ---------------------------------------------------------------------------
describe('heltal og tilskuertal', () => {
  it('heltal afviser dét, Number ville gøre til 0', () => {
    for (const v of [null, undefined, '', '  ', {}, [], NaN]) expect(heltal(v)).toBeNull();
  });
  it('heltal tager kildens STRENGE', () => {
    expect(heltal('3')).toBe(3);
    expect(heltal('0')).toBe(0);
  });
  it('tilskuertal tager kildens NUMBER — Vsp er ikke en streng som Tr1', () => {
    expect(tilskuertal(60098)).toBe(60098);
    expect(tilskuertal('6111')).toBe(6111);
  });
  it('tilskuertal afviser 0 og negative — nul tilskuere findes ikke', () => {
    expect(tilskuertal(0)).toBeNull();
    expect(tilskuertal(-5)).toBeNull();
    expect(tilskuertal(null)).toBeNull();
  });
  it('tilskuertal afviser et tal, der ikke kan være et publikum', () => {
    expect(tilskuertal(9999999)).toBeNull();
    expect(tilskuertal(1.5)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Krydsvalideringen
// ---------------------------------------------------------------------------
describe('detaljerAf — krydsvalidering', () => {
  const k = kamp('1784451'); // FCM-RAN 1-0

  it('godtager en kamp, hvor facit stemmer', () => {
    const r = detaljerAf(k.incidents, k.info, { homeGoals: 1, awayGoals: 0 });
    expect(r.afvist).toBeUndefined();
    expect(r.felter.maal).toHaveLength(1);
    expect(r.felter.tilskuere).toBeGreaterThan(0);
  });

  it('afviser som UENIG, når vores facit er et andet end deres', () => {
    // Båndet skal blive rødt af den forkerte værdi. 2-0 mod deres 1-0.
    expect(detaljerAf(k.incidents, k.info, { homeGoals: 2, awayGoals: 0 }).afvist).toBe('uenig');
    expect(detaljerAf(k.incidents, k.info, { homeGoals: 1, awayGoals: 1 }).afvist).toBe('uenig');
  });

  it('afviser som UENIG, når vores mål mangler', () => {
    expect(detaljerAf(k.incidents, k.info, {}).afvist).toBe('uenig');
    // Number(null) er 0 — en naiv vagt ville læse det som 0-0 og "stemme"
    // med en 0-0-kamp.
    const nul = kamp('1784439');
    expect(detaljerAf(nul.incidents, nul.info, { homeGoals: null, awayGoals: null }).afvist)
      .toBe('uenig');
  });

  it('afviser som UPARSET, når målene ikke danner kæden', () => {
    // Facit siger 1-0 og kilden siger 1-0, men hændelsen er fjernet: så er
    // det VORES parsning, der er utilstrækkelig — ikke en uenighed om facit.
    const uden = { ...k.incidents, Incs: {} };
    expect(detaljerAf(uden, k.info, { homeGoals: 1, awayGoals: 0 }).afvist).toBe('uparset');
  });

  it('de to afvisningsgrunde er forskellige — de har hver sin remedie', () => {
    const uden = { ...k.incidents, Incs: {} };
    expect(detaljerAf(k.incidents, k.info, { homeGoals: 9, awayGoals: 9 }).afvist)
      .not.toBe(detaljerAf(uden, k.info, { homeGoals: 1, awayGoals: 0 }).afvist);
  });

  it('en 0-0-kamp med et annulleret mål skrives som TOM målliste', () => {
    const nul = kamp('1784439');
    const r = detaljerAf(nul.incidents, nul.info, { homeGoals: 0, awayGoals: 0 });
    expect(r.afvist).toBeUndefined();
    // Tom liste SKAL skrives: ellers ser en målløs kamp for evigt ud som
    // "ikke hentet endnu", og den bliver hentet igen ved hver kørsel.
    expect(r.felter.maal).toEqual([]);
  });

  it('UDELADER tilskuertal, når kilden mangler det — sætter det aldrig til 0', () => {
    const uden = kamp('1793566'); // CRY-MCI, tilskuertal mangler
    const r = detaljerAf(uden.incidents, uden.info, { homeGoals: 1, awayGoals: 4 });
    expect(r.afvist).toBeUndefined();
    expect(Object.hasOwn(r.felter, 'tilskuere')).toBe(false);
    expect(r.felter.tilskuere).not.toBe(0);
  });

  it('UDELADER halvlegen, når den er større end slutstillingen', () => {
    const umulig = { ...k.incidents, Trh1: '5', Trh2: '0' };
    const r = detaljerAf(umulig, k.info, { homeGoals: 1, awayGoals: 0 });
    expect(Object.hasOwn(r.felter, 'halvlegHome')).toBe(false);
  });

  it('skriver halvlegen, når den er lovlig', () => {
    const r = detaljerAf(kamp('1793564').incidents, kamp('1793564').info,
      { homeGoals: 2, awayGoals: 2 });
    expect(typeof r.felter.halvlegHome).toBe('number');
    expect(r.felter.halvlegHome).toBeLessThanOrEqual(2);
  });

  it('sætter ALDRIG et felt til undefined — det ville kaste i batchen', () => {
    for (const f of FIXTURE.kampe) {
      const r = detaljerAf(f.incidents, f.info, {
        homeGoals: Number(f.incidents.Tr1), awayGoals: Number(f.incidents.Tr2),
      });
      if (r.felter) for (const v of Object.values(r.felter)) expect(v).not.toBeUndefined();
    }
  });

  it('rører ALDRIG et forbudt felt', () => {
    for (const f of FIXTURE.kampe) {
      const r = detaljerAf(f.incidents, f.info, {
        homeGoals: Number(f.incidents.Tr1), awayGoals: Number(f.incidents.Tr2),
      });
      for (const forbudt of FORBUDTE_FELTER) {
        expect(Object.hasOwn(r.felter || {}, forbudt)).toBe(false);
      }
    }
  });
});

describe('forbudslisten er vagten', () => {
  it('ingen skrivbar felt er også forbudt', () => {
    for (const f of SKRIVBARE_FELTER) expect(FORBUDTE_FELTER).not.toContain(f);
  });
  it('forbudslisten rummer præcis de fire, der afgør point og tip-vindue', () => {
    // Skrives listen om, skal nogen tage stilling. Elo, rescore og
    // Runde-Botten hænger i result; tip-vinduet i kickoff.
    expect([...FORBUDTE_FELTER].sort()).toEqual(['awayGoals', 'homeGoals', 'kickoff', 'result']);
  });
});

// ---------------------------------------------------------------------------
// Nøglen
// ---------------------------------------------------------------------------
describe('noegleAfKamp', () => {
  const koder = new Map([['Viborg FF', 'VFF'], ['OB', 'OB']]);

  it('regner kickoff om til UTC, ikke til lokal tid', () => {
    // 17:00 UTC i juli er 19:00 dansk. Nøglen SKAL bære 170000 — /0-endpointet
    // er ægte UTC (livescoreHold.js). Et lokalt-tid-regnestykke ville give
    // 190000 og ramme en anden kamp eller ingen. Koden er VIB og ikke vores
    // VFF: nøglen bygges af DERES koder — se testen længere nede.
    const n = noegleAfKamp({ home: 'Viborg FF', away: 'OB', kickoff: new Date('2026-07-24T17:00:00Z') }, koder);
    expect(n).toBe('20260724170000|VIB|OB');
  });

  it('tåler en Firestore-Timestamp', () => {
    const ts = { toMillis: () => Date.parse('2026-07-24T17:00:00Z') };
    expect(noegleAfKamp({ home: 'Viborg FF', away: 'OB', kickoff: ts }, koder))
      .toBe('20260724170000|VIB|OB');
  });

  it('giver null for et ulæseligt kickoff', () => {
    for (const k of [null, undefined, '', 'i morgen', {}]) {
      expect(noegleAfKamp({ home: 'Viborg FF', away: 'OB', kickoff: k }, koder)).toBeNull();
    }
  });

  it('giver null for et hold, holdlisten ikke kender', () => {
    expect(noegleAfKamp({ home: 'Ukendt IF', away: 'OB', kickoff: new Date() }, koder)).toBeNull();
  });

  it('oversætter gennem livescoreHold — VFF bliver VIB hos dem', () => {
    // Nøglen bygges af livescores koder, ikke vores. Falder oversættelsen ud,
    // matcher intet.
    const n = noegleAfKamp({ home: 'Viborg FF', away: 'OB', kickoff: new Date('2026-07-24T17:00:00Z') }, koder);
    expect(n).toContain('|VIB|');
    expect(n).not.toContain('|VFF|');
  });
});

// ---------------------------------------------------------------------------
// hentNoegler
// ---------------------------------------------------------------------------
describe('hentNoegler', () => {
  const svar = (events) => async () => ({
    ok: true, status: 200, json: async () => ({ Stages: [{ Events: events }] }),
  });

  it('afviser et Eid, der ikke er cifre — det går i en URL', () => {
    const ondt = [{ Eid: '../../admin', Esd: 20260724170000, T1: [{ Abr: 'VIB' }], T2: [{ Abr: 'OB' }] }];
    return hentNoegler({ land: 'a', liga: 'b' }, svar(ondt)).then((m) => expect(m.size).toBe(0));
  });

  it('bygger nøglen af deres egne koder', async () => {
    const m = await hentNoegler({ land: 'a', liga: 'b' }, svar([
      { Eid: '123', Esd: 20260724170000, T1: [{ Abr: 'VIB' }], T2: [{ Abr: 'OB' }] },
    ]));
    expect(m.get('20260724170000|VIB|OB')).toBe('123');
  });

  it('henter med /0 — offsettet er en tidszone, ikke en version', async () => {
    const spion = vi.fn(svar([]));
    await hentNoegler({ land: 'denmark', liga: 'superliga' }, spion);
    expect(spion.mock.calls[0][0]).toBe(`${API}/stage/soccer/denmark/superliga/0`);
  });

  it('kaster KildenLukkerOs ved 429 og 403', async () => {
    for (const status of [429, 403]) {
       
      await expect(hentNoegler({ land: 'a', liga: 'b' }, async () => ({ ok: false, status })))
        .rejects.toBeInstanceOf(KildenLukkerOs);
    }
  });

  it('kaster IKKE ved 500 — en enkelt fejl er ikke en udelukkelse', async () => {
    await expect(hentNoegler({ land: 'a', liga: 'b' }, async () => ({ ok: false, status: 500 })))
      .resolves.toEqual(new Map());
  });
});

// ---------------------------------------------------------------------------
// Kernen
// ---------------------------------------------------------------------------
const FieldValue = { serverTimestamp: () => 'TS', delete: () => 'DEL' };

/** Firestore-attrap. Ingen `set` — kernen må ikke kunne OPRETTE en kamp. */
function fakeDb(teams, matches) {
  const skrevet = [];
  const self = {
    skrevet,
    commits: 0,
    collection: () => ({
      doc: () => ({
        get: async () => ({ exists: true, data: () => ({ teams }) }),
        collection: () => ({
          doc: (id) => ({ id }),
          get: async () => ({ docs: matches.map(([id, data]) => ({ id, data: () => data })) }),
        }),
      }),
    }),
    batch: () => ({
      update(ref, felter) {
        // Den ægte Admin SDK KASTER på undefined og river hele batchen med.
        for (const [k, v] of Object.entries(felter)) {
          if (v === undefined) throw new Error(`undefined i felt ${k}`);
        }
        skrevet.push({ id: ref.id, felter });
      },
      async commit() { self.commits += 1; },
    }),
  };
  return self;
}

const TEAMS = [{ name: 'FC Midtjylland', short: 'FCM' }, { name: 'Randers FC', short: 'RFC' }];
const K = kamp('1784451'); // FCM-RAN 1-0

/** fetch-attrap, der svarer stage-listen og ét kampopslag. */
function fakeFetch({ eid = '1784451', incidents = K.incidents, info = K.info, esd } = {}) {
  return vi.fn(async (url) => {
    if (url.includes('/stage/')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          Stages: [{
            Events: [{
              Eid: eid, Esd: esd ?? 20260724170000,
              T1: [{ Abr: 'FCM' }], T2: [{ Abr: 'RAN' }],
            }],
          }],
        }),
      };
    }
    if (url.includes('/incidents/')) return { ok: true, status: 200, json: async () => incidents };
    return { ok: true, status: 200, json: async () => info };
  });
}

const KAMP_DATA = {
  home: 'FC Midtjylland',
  away: 'Randers FC',
  kickoff: new Date('2026-07-24T17:00:00Z'),
  result: '1',
  homeGoals: 1,
  awayGoals: 0,
};

const opts = (extra = {}) => ({
  gameId: 'superliga2627',
  livescore: { land: 'denmark', liga: 'superliga' },
  fetchFn: fakeFetch(),
  ...extra,
});

describe('syncKampDetaljerCore', () => {
  it('skriver detaljerne på en færdig kamp, der mangler dem', async () => {
    const db = fakeDb(TEAMS, []);
    const ud = await syncKampDetaljerCore(db, FieldValue, opts({
      only: [{ id: 'r1-a', data: KAMP_DATA }],
    }));
    expect(ud.skrevet).toBe(1);
    expect(db.commits).toBe(1);
    expect(db.skrevet[0].felter.detaljerSyncedAt).toBe('TS');
    expect(db.skrevet[0].felter.maal).toHaveLength(1);
  });

  it('rører ALDRIG et forbudt felt i en skrivning', async () => {
    const db = fakeDb(TEAMS, []);
    await syncKampDetaljerCore(db, FieldValue, opts({ only: [{ id: 'r1-a', data: KAMP_DATA }] }));
    for (const s of db.skrevet) {
      for (const forbudt of FORBUDTE_FELTER) expect(Object.hasOwn(s.felter, forbudt)).toBe(false);
      // Og intet felt UDEN FOR den frosne liste: en mutation, der tilføjer et
      // felt uden at føje det til listen, skal blive rød her.
      for (const felt of Object.keys(s.felter)) expect(SKRIVBARE_FELTER).toContain(felt);
    }
  });

  it('springer en kamp UDEN facit over', async () => {
    const db = fakeDb(TEAMS, []);
    const ud = await syncKampDetaljerCore(db, FieldValue, opts({
      only: [{ id: 'r1-a', data: { ...KAMP_DATA, result: null } }],
    }));
    expect(ud.manglede).toBe(0);
    expect(db.commits).toBe(0);
  });

  it('springer en kamp over, der ALLEREDE har detaljer', async () => {
    const db = fakeDb(TEAMS, []);
    const ud = await syncKampDetaljerCore(db, FieldValue, opts({
      only: [{ id: 'r1-a', data: { ...KAMP_DATA, detaljerSyncedAt: 'TS' } }],
    }));
    expect(ud.manglede).toBe(0);
  });

  it('tæller en kamp uden nøglematch som UKENDT og skriver intet', async () => {
    const db = fakeDb(TEAMS, []);
    const ud = await syncKampDetaljerCore(db, FieldValue, opts({
      // Kickoff en anden dag → nøglen rammer ikke stage-listen.
      only: [{ id: 'r1-a', data: { ...KAMP_DATA, kickoff: new Date('2026-08-01T17:00:00Z') } }],
    }));
    expect(ud.ukendte).toBe(1);
    expect(ud.skrevet).toBe(0);
    expect(db.commits).toBe(0);
  });

  it('markerer en UENIG kamp i stedet for at skrive den', async () => {
    const db = fakeDb(TEAMS, []);
    const ud = await syncKampDetaljerCore(db, FieldValue, opts({
      only: [{ id: 'r1-a', data: { ...KAMP_DATA, homeGoals: 4, awayGoals: 4, result: 'X' } }],
    }));
    expect(ud.uenige).toBe(1);
    expect(ud.skrevet).toBe(0);
    expect(db.skrevet[0].felter.detaljerAfvistGrund).toBe('uenig');
    expect(Object.hasOwn(db.skrevet[0].felter, 'maal')).toBe(false);
  });

  it('holder en afvist kamp i karantæne — den er ellers en giftpille', async () => {
    const nu = Date.parse('2026-09-01T00:00:00Z');
    const iGaar = { toMillis: () => nu - 24 * 3600 * 1000 };
    const db = fakeDb(TEAMS, []);
    const f = fakeFetch();
    const ud = await syncKampDetaljerCore(db, FieldValue, opts({
      fetchFn: f, nowMs: nu,
      only: [{ id: 'r1-a', data: { ...KAMP_DATA, detaljerAfvistAt: iGaar } }],
    }));
    expect(ud.manglede).toBe(0);
    // Og den koster INTET kald — heller ikke stage-listen.
    expect(f).not.toHaveBeenCalled();
  });

  it('prøver en afvist kamp igen, når karantænen er udløbet', async () => {
    const nu = Date.parse('2026-09-01T00:00:00Z');
    const gammel = { toMillis: () => nu - AFVIST_KARANTAENE_MS - 1000 };
    const db = fakeDb(TEAMS, []);
    const ud = await syncKampDetaljerCore(db, FieldValue, opts({
      nowMs: nu,
      only: [{ id: 'r1-a', data: { ...KAMP_DATA, detaljerAfvistAt: gammel } }],
    }));
    expect(ud.skrevet).toBe(1);
    // Og markeringen ryddes, så tælleren betyder NYE uenigheder.
    expect(db.skrevet[0].felter.detaljerAfvistAt).toBe('DEL');
    expect(db.skrevet[0].felter.detaljerAfvistGrund).toBe('DEL');
  });

  it('et ULÆSELIGT afvisnings-tidsstempel giver ikke evig karantæne', async () => {
    const db = fakeDb(TEAMS, []);
    const ud = await syncKampDetaljerCore(db, FieldValue, opts({
      only: [{ id: 'r1-a', data: { ...KAMP_DATA, detaljerAfvistAt: 'skrald' } }],
    }));
    expect(ud.skrevet).toBe(1);
  });

  it('holder loftet — et loft på ØNSKER er ikke et loft på KALD', async () => {
    const f = fakeFetch();
    const db = fakeDb(TEAMS, []);
    const mange = Array.from({ length: DETALJE_LOFT + 5 }, (_, i) => ({
      id: `r1-${i}`, data: KAMP_DATA,
    }));
    const ud = await syncKampDetaljerCore(db, FieldValue, opts({ fetchFn: f, only: mange }));
    expect(ud.manglede).toBe(DETALJE_LOFT + 5);
    expect(ud.forsoegt).toBe(DETALJE_LOFT);
    // 1 stage-kald + 2 pr. forsøgt kamp. Flere ville betyde, at loftet talte
    // ønsker og ikke kald.
    expect(f).toHaveBeenCalledTimes(1 + 2 * DETALJE_LOFT);
  });

  it('bryder ud, når wall-clock-budgettet er brugt', async () => {
    const db = fakeDb(TEAMS, []);
    const mange = Array.from({ length: 5 }, (_, i) => ({ id: `r1-${i}`, data: KAMP_DATA }));
    // Injiceret klokke, ikke en rigtig forsinkelse: uret springer forbi
    // budgettet efter det første opslag, så testen hverken sover eller
    // afhænger af maskinens hastighed.
    let t = 0;
    const ud = await syncKampDetaljerCore(db, FieldValue, opts({
      only: mange, budgetMs: 1000, klokke: () => { t += 900; return t; },
    }));
    // Første tjek: 900 < 0+1000 → én kamp hentes. Andet: 1800 >= 1000 → brud.
    expect(ud.forsoegt).toBe(1);
    expect(ud.manglede).toBe(5);
  });

  it('afbryder hele kørslen ved 429 — delt NAT rammer nabo-synken', async () => {
    const db = fakeDb(TEAMS, []);
    const f = vi.fn(async () => ({ ok: false, status: 429 }));
    const ud = await syncKampDetaljerCore(db, FieldValue, opts({
      fetchFn: f, only: [{ id: 'r1-a', data: KAMP_DATA }],
    }));
    expect(ud.afbrudt).toBe(true);
    expect(f).toHaveBeenCalledTimes(1); // ikke ét kald mere
  });

  it('gør intet for et spil uden livescore-konfiguration', async () => {
    const db = fakeDb(TEAMS, []);
    const f = fakeFetch();
    for (const ls of [undefined, {}, { land: 'denmark' }]) {
       
      const ud = await syncKampDetaljerCore(db, FieldValue, {
        gameId: 'x', livescore: ls, fetchFn: f, only: [{ id: 'r1-a', data: KAMP_DATA }],
      });
      expect(ud.manglede).toBe(0);
    }
    expect(f).not.toHaveBeenCalled();
  });

  it('gør intet, når spillet mangler sin holdliste', async () => {
    const db = fakeDb(null, []);
    const ud = await syncKampDetaljerCore(db, FieldValue, opts({
      only: [{ id: 'r1-a', data: KAMP_DATA }],
    }));
    expect(ud.skrevet).toBe(0);
    expect(db.commits).toBe(0);
  });

  it('committer ikke, når intet blev skrevet', async () => {
    const db = fakeDb(TEAMS, []);
    await syncKampDetaljerCore(db, FieldValue, opts({
      only: [{ id: 'r1-a', data: { ...KAMP_DATA, kickoff: new Date('2026-08-01T17:00:00Z') } }],
    }));
    expect(db.commits).toBe(0);
  });
});
