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
const { kampNoegle } = require('./livescoreHold');
const {
  syncKampDetaljerCore, detaljerAf, maalAf, kaedeOk, noegleAfKamp,
  heltal, tilskuertal, hentNoegler, KildenLukkerOs,
  SKRIVBARE_FELTER, FORBUDTE_FELTER, DETALJE_LOFT, AFVIST_KARANTAENE_MS, API,
  DETALJE_BUDGET_BROEK, detaljeNiveau, DETALJE_VERSION, efterFacitDetaljer,
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

  it('et mål nestet med sit EGET nummer tælles med (rekursionens eksistensberettigelse)', () => {
    // MÅLT: ingen af kildens 218 nestede hændelser bærer i dag et andet
    // målnummer end sin forælder, så rekursionen er redundant på ægte data.
    // Den er der som den sikre retning — og uden denne test ville forsvaret
    // være en påstand, ingen efterprøver: mutationstesten viste, at
    // rekursionen kunne fjernes med hele suiten grøn.
    const incs = {
      1: [{
        Min: 10,
        Nm: 1,
        Sc: ['1', '0'],
        Incs: [
          { Min: 10, Nm: 1, Sc: ['1', '0'], IT: 36, Pn: 'Foerste Scorer' },
          // Et ANDET mål, gemt inde i den samme container. Uden rekursion
          // findes det aldrig, kæden knækker, og hele kampen afvises.
          { Min: 11, Nm: 1, Sc: ['2', '0'], IT: 36, Pn: 'Anden Scorer' },
        ],
      }],
    };
    const m = maalAf(incs);
    expect(m).toHaveLength(2);
    expect(m.map((x) => x.nr)).toEqual([1, 2]);
    expect(m[1].scorer).toBe('Anden Scorer');
  });

  it('en container-post giver ét mål, ikke to (den indre dubletteres væk)', () => {
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
    // DENNE TEST BLEV VIGTIGERE, DA NØGLEN MISTEDE SIT KLOKKESLÆT. Før flyttede
    // en tidszonefejl nøglen to timer; nu flytter den kampen en HEL DAG, og
    // datoen er alt, der er tilbage at koble på.
    //
    // Derfor er tidspunktet valgt, så de to svar er FORSKELLIGE DATOER:
    // 22:30 UTC den 24. juli er 00:30 dansk den 25. En test på en eftermiddags-
    // kamp ville give samme dato begge veje og bevise ingenting.
    const n = noegleAfKamp({ home: 'Viborg FF', away: 'OB', kickoff: new Date('2026-07-24T22:30:00Z') }, koder);
    expect(n).toBe('20260724|VIB|OB');
    expect(n).not.toBe('20260725|VIB|OB');
  });

  it('tåler en Firestore-Timestamp', () => {
    const ts = { toMillis: () => Date.parse('2026-07-24T22:30:00Z') };
    expect(noegleAfKamp({ home: 'Viborg FF', away: 'OB', kickoff: ts }, koder))
      .toBe('20260724|VIB|OB');
  });

  it('kobler VORES planlagte tid til DERES faktiske starttid', () => {
    // Produktionsfundet ved første tryk: FCM-Randers stod hos os til 12:00:00
    // og hos dem til 12:05:00, og kampen kunne ikke kobles. Her mødes de to
    // sider af koblingen i én test — vores dokument mod deres event.
    const vores = noegleAfKamp(
      { home: 'FC Midtjylland', away: 'Randers FC', kickoff: new Date('2026-08-23T12:00:00Z') },
      new Map([['FC Midtjylland', 'FCM'], ['Randers FC', 'RFC']]),
    );
    expect(vores).toBe(kampNoegle(20260823120500, 'FCM', 'RFC'));
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
    expect(m.get('20260724|VIB|OB')).toBe('123');
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
          doc: (id) => ({
            id,
            // Enkeltopslag — efterFacitDetaljer genlæser de netop afgjorte kampe.
            get: async () => {
              const hit = matches.find(([mid]) => mid === id);
              return hit ? { exists: true, data: () => hit[1] } : { exists: false, data: () => undefined };
            },
          }),
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

  it('springer en kamp over, der har detaljer i den AKTUELLE udgave', async () => {
    // VENDT BEVIDST. Testen stod før uden `detaljerVersion` og fastfrøs
    // dermed netop den fejl, Quality Control fandt: et NYT felt kunne aldrig
    // nå en kamp, der allerede var hentet. "Allerede hentet" er ikke længere
    // nok — det skal være hentet af en kode, der skriver de samme felter.
    const db = fakeDb(TEAMS, []);
    const ud = await syncKampDetaljerCore(db, FieldValue, opts({
      only: [{ id: 'r1-a', data: { ...KAMP_DATA, detaljerSyncedAt: 'TS', detaljerVersion: DETALJE_VERSION } }],
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

  it('bryder ud MIDT i løkken, når wall-clock-budgettet er brugt', async () => {
    const db = fakeDb(TEAMS, []);
    const mange = Array.from({ length: 5 }, (_, i) => ({ id: `r1-${i}`, data: KAMP_DATA }));
    // Injiceret klokke, ikke en rigtig forsinkelse: uret springer forbi
    // budgettet undervejs, så testen hverken sover eller afhænger af
    // maskinens hastighed.
    //
    // Aflæsningerne er: udloeb = 100+2000 = 2100 · før stage 200 · løkke 300
    // (< 2100, én kamp hentes) · løkke 2400 (>= 2100, brud).
    let t = 0;
    const ud = await syncKampDetaljerCore(db, FieldValue, opts({
      only: mange,
      budgetMs: 2000,
      klokke: () => { t += t >= 300 ? 2100 : 100; return t; },
    }));
    expect(ud.forsoegt).toBe(1);
    expect(ud.manglede).toBe(5);
  });

  it('tager IKKE stage-kaldet, hvis budgettet allerede er brugt', async () => {
    // Stage-svaret er 90-260 KB og kan koste sine fulde 10 sekunder. Lå det
    // uden for budgettet, var budgettet ikke et loft på KØRSLEN, men kun på
    // løkken — Security regnede værste tilfælde til stage + budget + ét
    // kald-sæt.
    const db = fakeDb(TEAMS, []);
    const f = fakeFetch();
    const ud = await syncKampDetaljerCore(db, FieldValue, opts({
      fetchFn: f,
      only: [{ id: 'r1-a', data: KAMP_DATA }],
      budgetMs: 1000,
      // Første aflæsning sætter udloeb (0+1000); anden er tjekket lige før
      // stage-kaldet. En KONSTANT klokke ville aldrig kunne udløbe, fordi
      // udløbet regnes af samme ur — den fælde faldt testen selv i.
      klokke: (() => { let n = 0; return () => (n++ === 0 ? 0 : 999999); })(),
    }));
    expect(ud.forsoegt).toBe(0);
    expect(f).not.toHaveBeenCalled();
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

  // ── Test Managers to overlevende mutationer ─────────────────────────────
  it('tæller et HTTP-fejlsvar som UTILGÆNGELIGT, ikke som uparset', () => {
    // Test Manager fjernede tælleren her, og alle 63 tests forblev grønne.
    // Security viste hvorfor det betyder noget: `uparsede` udløser alarmen
    // "kilden har sandsynligvis skiftet form — se kampDetaljer.js", så en
    // times nedetid ville sende ejeren på kodejagt. De to tal SKAL kunne
    // skelnes, for de har hver sin remedie.
    const db = fakeDb(TEAMS, []);
    const f = vi.fn(async (url) => {
      if (url.includes('/stage/')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            Stages: [{
              Events: [{
                Eid: '1784451', Esd: 20260724170000,
                T1: [{ Abr: 'FCM' }], T2: [{ Abr: 'RAN' }],
              }],
            }],
          }),
        };
      }
      return { ok: false, status: 500 };
    });
    return syncKampDetaljerCore(db, FieldValue, opts({
      fetchFn: f, only: [{ id: 'r1-a', data: KAMP_DATA }],
    })).then((ud) => {
      expect(ud.utilgaengelige).toBe(1);
      expect(ud.uparsede).toBe(0);
      expect(ud.uenige).toBe(0);
      expect(ud.skrevet).toBe(0);
      // Og INTET committes: en tom batch er et unødigt kald, og en
      // afvisnings-markering ville sætte kampen i en uges karantæne for en
      // fejl, der ikke var dens.
      expect(db.commits).toBe(0);
      expect(db.skrevet).toEqual([]);
    });
  });

  it('beholder det allerede hentede, når kredsløbet brydes MIDT i løkken', async () => {
    // Test Manager: den eneste 429-test lod kilden svare 429 på ALLE kald,
    // inkl. stage-opslaget — så kredsløbet brød, før nogen kamp var
    // behandlet, og batchen var tom. Scenariet, kommentaren faktisk
    // beskriver, blev aldrig prøvet: mutationen `if (!ud.afbrudt && …)`
    // overlevede, og i produktion ville et helt gennemløbs arbejde blive
    // smidt væk, hver gang et rate-limit rammer midt i en batch.
    const db = fakeDb(TEAMS, []);
    let kampOpslag = 0;
    const f = vi.fn(async (url) => {
      if (url.includes('/stage/')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            Stages: [{
              Events: [
                { Eid: '1784451', Esd: 20260724170000, T1: [{ Abr: 'FCM' }], T2: [{ Abr: 'RAN' }] },
                { Eid: '1784452', Esd: 20260725170000, T1: [{ Abr: 'FCM' }], T2: [{ Abr: 'RAN' }] },
              ],
            }],
          }),
        };
      }
      // Den FØRSTE kamps to kald svarer normalt; derefter lukker kilden os ude.
      kampOpslag += 1;
      if (kampOpslag > 2) return { ok: false, status: 429 };
      return {
        ok: true,
        status: 200,
        json: async () => (url.includes('/incidents/') ? K.incidents : K.info),
      };
    });
    const ud = await syncKampDetaljerCore(db, FieldValue, opts({
      fetchFn: f,
      only: [
        { id: 'r1-a', data: KAMP_DATA },
        { id: 'r1-b', data: { ...KAMP_DATA, kickoff: new Date('2026-07-25T17:00:00Z') } },
      ],
    }));
    expect(ud.afbrudt).toBe(true);
    expect(ud.skrevet).toBe(1);
    // DÉT er pointen: den første kamps arbejde er ikke blevet mindre rigtigt
    // af, at den anden fik 429.
    expect(db.commits).toBe(1);
    expect(db.skrevet).toHaveLength(1);
    expect(db.skrevet[0].id).toBe('r1-a');
    expect(db.skrevet[0].felter.maal).toHaveLength(1);
  });

  // ── Security Reviewers fund: giftpillen i selve LISTEN ──────────────────
  it('én uduelig post i stage-listen koster ÉN kamp, ikke hele sæsonen', async () => {
    // Kørt PoC: ét event blandt 380 med Eid: {"toString":null} fik String()
    // til at kaste ud af hele kernen — og så fik spillet ALDRIG detaljer, i
    // nogen kørsel. Det er husets "validér pr. POST, ikke pr. felt" i en ny
    // forklædning: fælden lå i LISTEN, ikke i kampen.
    const db = fakeDb(TEAMS, []);
    const f = vi.fn(async (url) => {
      if (url.includes('/stage/')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            Stages: [{
              Events: [
                { Eid: { toString: null }, Esd: 20260101000000, T1: [{ Abr: 'AAA' }], T2: [{ Abr: 'BBB' }] },
                { Eid: '1784451', Esd: { toString: null }, T1: [{ Abr: 'CCC' }], T2: [{ Abr: 'DDD' }] },
                { Eid: '1784451', Esd: 20260724170000, T1: [{ Abr: 'FCM' }], T2: [{ Abr: 'RAN' }] },
              ],
            }],
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => (url.includes('/incidents/') ? K.incidents : K.info),
      };
    });
    const ud = await syncKampDetaljerCore(db, FieldValue, opts({
      fetchFn: f, only: [{ id: 'r1-a', data: KAMP_DATA }],
    }));
    expect(ud.skrevet).toBe(1);
  });

  it('et giftigt kickoff på VORES kamp kaster ikke', () => {
    // firestore.rules type-tjekker ikke kickoff, så feltet kan i princippet
    // være hvad som helst. new Date({toString:null}) kaster.
    const koder = new Map([['A', 'AA'], ['B', 'BB']]);
    expect(noegleAfKamp({ home: 'A', away: 'B', kickoff: { toString: null } }, koder)).toBeNull();
  });

  it('budget-brøken er et TAL, kalderen kan regne med', () => {
    // Konstanten er kernens gulv; brøken er dét, index.js deler sweep'ets
    // sekunder med. Stod tallet kun som en literal med en kommentar, der
    // påstod udledningen, ville et tredje spil gøre påstanden forkert i
    // stilhed — begge roller fandt netop dét.
    expect(Number.isInteger(DETALJE_BUDGET_BROEK)).toBe(true);
    expect(DETALJE_BUDGET_BROEK).toBeGreaterThan(3); // xG tager en tredjedel
  });

  it('committer ikke, når intet blev skrevet', async () => {
    const db = fakeDb(TEAMS, []);
    await syncKampDetaljerCore(db, FieldValue, opts({
      only: [{ id: 'r1-a', data: { ...KAMP_DATA, kickoff: new Date('2026-08-01T17:00:00Z') } }],
    }));
    expect(db.commits).toBe(0);
  });
});

describe('efterFacitDetaljer — de netop afgjorte kampe, straks', () => {
  it('genlæser kampene og henter detaljer for præcis dem, der fik facit', async () => {
    // Dokumentet i basen HAR facit (det blev lige skrevet); listen minut-synken
    // arbejdede på, havde det ikke. Derfor genlæsningen.
    const db = fakeDb(TEAMS, [['r1-a', KAMP_DATA], ['r1-b', { ...KAMP_DATA, home: 'X', away: 'Y' }]]);
    const fetchFn = fakeFetch();
    const ud = await efterFacitDetaljer(db, FieldValue, opts({ fetchFn, rettede: ['r1-a'] }));
    expect(ud.skrevet).toBe(1);
    expect(db.skrevet.map((x) => x.id)).toEqual(['r1-a']);   // ikke r1-b
    expect(ud.valgte).toBe(1);
  });

  it('en kamp, der er væk fra basen, springes over uden at vælte de andre', async () => {
    const db = fakeDb(TEAMS, [['r1-a', KAMP_DATA]]);
    const ud = await efterFacitDetaljer(db, FieldValue, opts({ rettede: ['findes-ikke', 'r1-a'] }));
    expect(ud.skrevet).toBe(1);
  });

  it('intet at gøre → null, og INGEN kald til kilden', async () => {
    const db = fakeDb(TEAMS, [['r1-a', KAMP_DATA]]);
    const fetchFn = fakeFetch();
    expect(await efterFacitDetaljer(db, FieldValue, opts({ fetchFn, rettede: [] }))).toBeNull();
    expect(await efterFacitDetaljer(db, FieldValue, opts({ fetchFn, rettede: undefined }))).toBeNull();
    // Et spil uden livescore-konfiguration har ikke evnen.
    expect(await efterFacitDetaljer(db, FieldValue, opts({ fetchFn, rettede: ['r1-a'], livescore: null }))).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('loftet er listen selv — aldrig over DETALJE_LOFT', async () => {
    const mange = Array.from({ length: DETALJE_LOFT + 3 }, (_, i) => [`k${i}`, KAMP_DATA]);
    const db = fakeDb(TEAMS, mange);
    const ud = await efterFacitDetaljer(db, FieldValue, opts({ rettede: mange.map(([id]) => id) }));
    expect(ud.valgte).toBe(DETALJE_LOFT);
  });

  // Ingen egen forbudsliste-test her: vejen har INGEN egen skrivning, og en
  // test, der kigger på en kilde uden forbudte feltnavne, beviser ingenting
  // (Security Reviewer: pluck-løkken kunne erstattes af Object.assign med
  // grøn suite). Vagten er `forbudslisten er vagten` ovenfor, på kernen.
});

// ---------------------------------------------------------------------------
// detaljeNiveau — Drift-kortets dom.
//
// QUALITY CONTROLS FUND EFTER UDRULNINGEN, og en ægte produktionsfejl: reglen
// lå inline i sweep-handleren i index.js, hvor den ikke kunne unit-testes — og
// den var forkert. `ukendte` manglede i advarsels-betingelsen, så en kørsel med
// 33 skrevne og 1 ukoblet gav GRØNT Drift-kort, mens den manuelle knap for
// præcis samme tæller sagde rødt.
//
// Det er husets "korrekt er ikke komplet": jeg udvidede klassifikationen på
// knappen (`ukendte` → err, fordi den ALDRIG retter sig selv) og fulgte den
// ikke hele vejen ud i den anden flade, der læser samme tal.
// ---------------------------------------------------------------------------
describe('detaljeNiveau', () => {
  it('en ren kørsel er ok', () => {
    expect(detaljeNiveau({ skrevet: 8, uenige: 0, uparsede: 0, utilgaengelige: 0, ukendte: 0 })).toBe('ok');
  });

  it('ADVARER om en ukoblet kamp — den retter sig aldrig selv', () => {
    // Dagens situation, tal for tal: 34 kampe, 33 skrevet, 1 uden kobling.
    // Den gamle kode svarede 'ok' her, og dét var fejlen.
    expect(detaljeNiveau({ skrevet: 33, uenige: 0, uparsede: 0, utilgaengelige: 0, ukendte: 1 })).toBe('advarsel');
  });

  it('advarer om HVER af de fire — de har hver sin remedie', () => {
    // Fire separate assertions, ikke ét kombineret objekt: et objekt med alle
    // fire sat ville bestå, selv om tre af leddene var fjernet fra reglen.
    for (const felt of ['uenige', 'uparsede', 'utilgaengelige', 'ukendte']) {
      expect(detaljeNiveau({ [felt]: 1 }), felt).toBe('advarsel');
    }
  });

  it('tåler skrald i tællerne uden at kalde det en advarsel', () => {
    // Number(null) er 0 og Number('') er 0 — begge finite, begge falsy her.
    // Men NaN ville være falsy ved en naiv sum og sandt ved en naiv boolean.
    for (const v of [null, undefined, '', 'to', NaN, {}]) {
      expect(detaljeNiveau({ ukendte: v }), String(v)).toBe('ok');
    }
    expect(detaljeNiveau(null)).toBe('ok');
    expect(detaljeNiveau(undefined)).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
// SELVMÅL. `Nm` er det hold, der FIK målet — ikke scorerens eget. Uden flaget
// står en Aston Villa-spiller på kortet som "(Brighton)".
//
// MÅLT (scripts/maal-selvmaal.mjs, 1/9-2026, alle 54 færdigspillede kampe):
// kriteriet er, om scoreren står i det MODSATTE holds startopstilling. IT=39
// gør det i 5 af 5 opløselige tilfælde, IT 36/37/38 i 0 af 121.
// ---------------------------------------------------------------------------
describe('maalAf — selvmål', () => {
  // maalAf tager `Incs`-objektet SELV, ikke hele incidents-svaret — nøglen er
  // halvlegen. Min første hjælper pakkede det ét niveau for dybt, og
  // funktionen svarede en tom liste på alt.
  const inc = (haendelser) => ({ 1: haendelser });

  it('mærker IT=39 som selvmål — og krediterer det hold, der FIK målet', () => {
    // Brighton–Aston Villa, 8'. Lindelöf spiller for Villa (ude), men målet
    // gik til Brighton (hjemme), og dét er hvad `Nm: 1` siger.
    const [m] = maalAf(inc([
      { Min: 8, Nm: 1, IT: 39, Sc: ['1', '0'], Pn: 'Victor Lindelof' },
    ]));
    expect(m.hold).toBe('home');
    expect(m.scorer).toBe('Victor Lindelof');
    expect(m.selvmaal).toBe(true);
  });

  it('mærker fixturens ÆGTE selvmål (CRY–MCI, Donnarumma 56\')', () => {
    // TEST MANAGERS FUND, og en rettelse af min egen påstand: jeg fortalte
    // rollerne, at fixturen ikke havde et selvmål. Den har — Eid 1793566,
    // Donnarumma i 56'. Hele selvmåls-dækningen var håndbygget, mens den
    // ÆGTE payload lå ubundet ved siden af.
    //
    // Forskellen er ikke kosmetisk: en håndbygget hændelse er skrevet af den
    // samme, der skrev koden, og indkoder samme forståelse — også når den er
    // forkert. Kildens eget svar gør ikke.
    const m = maalAf(kamp('1793566').incidents.Incs);
    const selv = m.filter((x) => x.selvmaal);
    expect(selv).toHaveLength(1);
    expect(selv[0].scorer).toBe('Gianluigi Donnarumma');
    expect(selv[0].minut).toBe(56);
    // Krediteret HJEMMEHOLDET, som fik målet — Donnarumma spiller for udeholdet.
    expect(selv[0].hold).toBe('home');
    // …og kampens øvrige mål er IKKE selvmål.
    expect(m.filter((x) => !x.selvmaal)).toHaveLength(m.length - 1);
  });

  it('mærker IKKE et almindeligt mål som selvmål', () => {
    // De tre koder, målingen fandt hos scorerens EGET hold. Hver for sig:
    // ét objekt med alle tre ville bestå, selv om to led var fjernet.
    for (const it of [36, 37, 38]) {
      const [m] = maalAf(inc([{ Min: 20, Nm: 1, IT: it, Sc: ['1', '0'], Pn: 'Spiller' }]));
      expect(m.selvmaal, `IT=${it}`).toBe(false);
    }
  });

  it('en UKENDT kode bliver et almindeligt mål, aldrig et selvmål', () => {
    // Den sikre retning. Den modsatte fejl hænger en forkert etiket på en
    // rigtig scorer, og dét ser en spiller straks.
    const [m] = maalAf(inc([{ Min: 20, Nm: 2, IT: 99, Sc: ['0', '1'], Pn: 'Spiller' }]));
    expect(m.selvmaal).toBe(false);
  });

  it('et mål med OPLÆG er aldrig et selvmål', () => {
    // Container-formen findes for at bære oplægget, og et selvmål har ikke et
    // oplæg — derfor er IT=39 flad i 7 af 7 målte tilfælde og nestet i 0.
    // Testen binder følgen af dét: den almindelige container-form giver
    // selvmaal:false, og reglen behøver derfor kun den flade gren.
    const [m] = maalAf(inc([
      { Min: 30, Nm: 1, Sc: ['1', '0'], Incs: [
        { Min: 30, Nm: 1, IT: 36, Sc: ['1', '0'], Pn: 'Scorer Jensen' },
        { Min: 30, Nm: 1, IT: 63, Sc: ['1', '0'], Pn: 'Oplaegger Hansen' },
      ] },
    ]));
    expect(m.selvmaal).toBe(false);
    expect(m.scorer).toBe('Scorer Jensen');
    expect(m.oplaeg).toBe('Oplaegger Hansen');
  });

  it('feltet når hele vejen ud i det, der SKRIVES', () => {
    // Første udgave asserterede på maalAf's mellemresultat, ikke på
    // skrivningen — så `ud.selvmaal = …` kunne fjernes fra detaljerAf med grøn
    // suite, og flaget ville aldrig nå Firestore. Husets "korrekt er ikke
    // komplet": en evne skal følges hele vejen ud.
    const svar = detaljerAf(
      { Tr1: '1', Tr2: '0', Trh1: '0', Trh2: '0', Incs: { 1: [
        { Min: 8, Nm: 1, IT: 39, Sc: ['1', '0'], Pn: 'Victor Lindelof' },
      ] } },
      null,
      { homeGoals: 1, awayGoals: 0 },
    );
    expect(svar.afvist).toBeFalsy();
    expect(svar.felter.maal).toHaveLength(1);
    expect(svar.felter.maal[0].selvmaal).toBe(true);
  });

  it('…og skrives som false, ikke udeladt, på et almindeligt mål', () => {
    // En liste af ens objekter: et felt, der kun findes på nogle af dem,
    // tvinger hver læser til at kende forskellen.
    const svar = detaljerAf(
      { Tr1: '1', Tr2: '0', Trh1: '0', Trh2: '0', Incs: { 1: [
        { Min: 8, Nm: 1, IT: 36, Sc: ['1', '0'], Pn: 'Dreyer' },
      ] } },
      null,
      { homeGoals: 1, awayGoals: 0 },
    );
    expect(Object.hasOwn(svar.felter.maal[0], 'selvmaal')).toBe(true);
    expect(svar.felter.maal[0].selvmaal).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// VERSIONSMÆRKET — så et NYT FELT når de kampe, der allerede er hentet.
//
// Quality Controls blokerende fund: `if (d.detaljerSyncedAt) return false;` var
// permanent, så da `selvmaal` kom til, ville de fem selvmål, der allerede stod
// på skærmen, aldrig blive mærket. Husets "korrekt er ikke komplet" — bagud.
//
// Versionsmærket er valgt frem for et migreringsscript, fordi et script ville
// være en SKRIVNING I PRODUKTIONSDATA, med tør-kørsel og godkendelse, og hele
// forløbet igen ved næste felt. Sweep'et er selvhelende i forvejen.
// ---------------------------------------------------------------------------
describe('DETALJE_VERSION', () => {
  const kampMed = (extra) => [{
    id: 'r1-a',
    data: { ...KAMP_DATA, result: '1', ...extra },
  }];
  const koer = (extra) => syncKampDetaljerCore(
    fakeDb(TEAMS, []), FieldValue, opts({ fetchFn: fakeFetch(), only: kampMed(extra) }),
  );

  it('henter en kamp igen, når den er hentet i en ÆLDRE udgave', () => {
    // Det er hele pointen: uden versions-leddet var svaret 0.
    return koer({ detaljerSyncedAt: new Date('2026-08-01'), detaljerVersion: DETALJE_VERSION - 1 })
      .then((ud) => expect(ud.manglede).toBe(1));
  });

  it('henter en kamp igen, når versionen MANGLER helt', () => {
    // De kampe, der blev hentet før mærket fandtes. Number(undefined) er NaN,
    // og NaN >= n er falsk — men det skal bindes, ikke antages.
    return koer({ detaljerSyncedAt: new Date('2026-08-01') })
      .then((ud) => expect(ud.manglede).toBe(1));
  });

  it('lader en kamp i AKTUEL udgave være i fred', () => {
    return koer({ detaljerSyncedAt: new Date('2026-08-01'), detaljerVersion: DETALJE_VERSION })
      .then((ud) => expect(ud.manglede).toBe(0));
  });

  it('lader en kamp i en NYERE udgave være i fred', () => {
    // Et rul tilbage må ikke få den gamle kode til at overskrive nyere data
    // med færre felter. `>=` og ikke `===`.
    return koer({ detaljerSyncedAt: new Date('2026-08-01'), detaljerVersion: DETALJE_VERSION + 1 })
      .then((ud) => expect(ud.manglede).toBe(0));
  });

  it('ét GIFTIGT versionsfelt draeber ikke hele spillets synk', async () => {
    // SECURITY REVIEWERS FUND, med en kørt PoC: Number({toString:null}) KASTER,
    // og kastet lå i filter-kroppen uden for al try/catch — 1 giftig kamp
    // blandt 19 sunde gav 0 skrevet, i hver eneste kørsel. Samme klasse som
    // `Eid`-fælden, filen allerede lukkede i hentNoegler; denne lå på VORES
    // side af hegnet, hvor rules ikke type-tjekker feltet.
    const db = fakeDb(TEAMS, []);
    const ud = await syncKampDetaljerCore(db, FieldValue, opts({
      fetchFn: fakeFetch(),
      only: [
        { id: 'gift', data: { ...KAMP_DATA, result: '1', detaljerSyncedAt: 'TS', detaljerVersion: { toString: null } } },
        { id: 'r1-a', data: KAMP_DATA },
      ],
    }));
    // Den sunde kamp skal igennem. Uden vagten er dette tal 0.
    expect(ud.skrevet).toBeGreaterThanOrEqual(1);
  });

  it('en skraldeværdi fejler mod GENHENTNING, ikke mod evig overspringelse', () => {
    // Den sikre retning: kampen heler sig selv ved næste kørsel. Ville
    // vagten svare et højt tal i stedet for 0, blev kampen usynlig for
    // enhver fremtidig feltudvidelse — og Drift-kortet ville sige "alle
    // færdige kampe har detaljer", mens den aldrig fik dem.
    return Promise.all(['ni', {}, [], true, null].map((v) => koer({
      detaljerSyncedAt: new Date('2026-08-01'), detaljerVersion: v,
    }).then((ud) => expect(ud.manglede, String(v)).toBe(1))));
  });

  it('Infinity gør ikke en kamp permanent usynlig', () => {
    // `>=` er rigtig (et rul tilbage må ikke overskrive nyere data), men
    // prisen er, at en for HØJ værdi er permanent og usynlig. Number.isFinite
    // lukker Infinity-varianten.
    return koer({ detaljerSyncedAt: new Date('2026-08-01'), detaljerVersion: Infinity })
      .then((ud) => expect(ud.manglede).toBe(1));
  });

  it('SKRIVER versionen sammen med detaljerne', () => {
    // Uden dette ville hver kørsel hente hver kamp igen, for evigt.
    const db = fakeDb(TEAMS, []);
    return syncKampDetaljerCore(db, FieldValue, opts({
      fetchFn: fakeFetch(), only: [{ id: 'r1-a', data: KAMP_DATA }],
    })).then(() => {
      expect(db.skrevet[0].felter.detaljerVersion).toBe(DETALJE_VERSION);
    });
  });

  it('versionen er talt OP, da selvmaal kom til', () => {
    // Båndet gøres rødt af den GAMLE værdi: var mærket ikke bumpet, ville de
    // allerede hentede kampe aldrig få selvmåls-flaget.
    expect(DETALJE_VERSION).toBeGreaterThanOrEqual(2);
  });
});
