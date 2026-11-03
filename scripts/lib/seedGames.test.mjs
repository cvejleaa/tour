// seedGames' forløb mod en fake Firestore, der TÆLLER skrivninger.
//
// Før havde seed-games.mjs ingen tør-kørsel: hver kørsel skrev alle spil med
// merge, og merge fjerner aldrig et felt. Testene her binder de tre ting, der
// gør tør-kørslen til en vagt og ikke en pynt: (1) uden skriv skrives INTET,
// (2) planen viser præcis det, skrivningen ville gøre, og (3) pulje-vagten
// afviser hele kørslen, før noget læses eller skrives.
import { describe, it, expect } from 'vitest';
import { koerSeedGames, spilPlan, planLinjer, feltAendringer, staarTilbage, ens } from './seedGames.mjs';
import { seedPayload } from '../seed-payload.mjs';
import { GAMES } from '../games.mjs';

const NU = { _serverTimestamp: true };
const utenId = (g) => Object.fromEntries(Object.entries(g).filter(([k]) => k !== 'id'));

/** Firestores merge: maps flettes i dybden, alt andet (også lister) erstattes. */
function flet(gammel, ny) {
  const ud = { ...(gammel || {}) };
  for (const [k, v] of Object.entries(ny)) {
    const erMap = (x) => x && typeof x === 'object' && !Array.isArray(x);
    ud[k] = erMap(v) && erMap(ud[k]) ? flet(ud[k], v) : v;
  }
  return ud;
}

function fakeDb(docs = {}) {
  const store = new Map(Object.entries(docs));
  const t = { laest: [], sat: [], batches: 0, commits: 0 };
  const ref = (id) => ({
    id,
    get: async () => { t.laest.push(id); return { exists: store.has(id), data: () => store.get(id) }; },
  });
  return {
    t,
    store,
    collection: (navn) => { expect(navn).toBe('games'); return { doc: ref }; },
    batch: () => {
      t.batches += 1;
      const ventende = [];
      return {
        set: (r, data, opts) => { t.sat.push({ id: r.id, data, opts }); ventende.push([r.id, data, opts]); },
        commit: async () => {
          t.commits += 1;
          for (const [id, data, opts] of ventende) {
            expect(opts).toEqual({ merge: true });
            store.set(id, flet(store.get(id), data));
          }
        },
      };
    },
  };
}

const ingenFejl = () => [];
const koer = (db, o = {}) => {
  const log = [];
  return koerSeedGames({ games: GAMES, db, now: NU, puljeSeedFejl: ingenFejl, log: (s) => log.push(s), ...o })
    .then((ud) => ({ ...ud, log }));
};

describe('koerSeedGames — tør-kørsel er default', () => {
  it('uden skriv skrives INTET — heller ikke et nyt spil', async () => {
    const db = fakeDb();
    const ud = await koer(db, { skriv: false });
    expect(db.t.batches).toBe(0);
    expect(db.t.sat).toEqual([]);
    expect(db.t.commits).toBe(0);
    expect(ud.skrevet).toBe(false);
    expect(ud.log).toContain('\nTør-kørsel — der er IKKE skrevet noget. Kør igen med --skriv (workflowet: seedGamesSkriv).');
    // Men den har LÆST hvert spil — planen er bygget af databasens tilstand.
    expect(db.t.laest).toEqual(GAMES.map((g) => g.id));
  });

  // Fejlsikker: et glemt flag (undefined) er en tør-kørsel, ikke en skrivning.
  it('et skriv, der ikke er sat, er en tør-kørsel', async () => {
    const db = fakeDb();
    await koerSeedGames({ games: GAMES, db, now: NU, puljeSeedFejl: ingenFejl });
    expect(db.t.sat).toEqual([]);
    expect(db.t.commits).toBe(0);
  });

  it('med skriv skrives hvert nyt spil med seedPayload og merge — i ÉN commit', async () => {
    const db = fakeDb();
    const ud = await koer(db, { skriv: true });
    expect(ud.skrevet).toBe(true);
    expect(db.t.commits).toBe(1);
    expect(db.t.sat.map((s) => s.id)).toEqual(GAMES.map((g) => g.id));
    for (const { id, ...data } of GAMES) {
      const s = db.t.sat.find((x) => x.id === id);
      expect(s.data, id).toEqual(seedPayload(data, { exists: false, now: NU }));
      expect(s.opts, id).toEqual({ merge: true });
    }
    expect(ud.log.at(-1)).toBe(`\n✅ ${GAMES.length} spil skrevet: ${GAMES.map((g) => g.id).join(', ')}.`);
  });

  // IDEMPOTENT: et seed oven på et seed ændrer intet — og skriver intet. Uden
  // det ville tør-kørslen melde «felter ændres» om et katalog, der står rigtigt.
  it('anden kørsel oven på den første: alle uændrede, intet skrives', async () => {
    const db = fakeDb();
    await koer(db, { skriv: true });
    const sat = db.t.sat.length;
    const ud = await koer(db, { skriv: true });
    expect(ud.planer.map((p) => p.handling)).toEqual(GAMES.map(() => 'uaendret'));
    expect(db.t.sat.length).toBe(sat);
    expect(db.t.commits).toBe(1);
    expect(ud.log).toContain('\nIntet at skrive — alle spil står allerede som i listen.');
  });

  it('skriver KUN de spil, der ændres — et uændret spil røres ikke', async () => {
    const db = fakeDb();
    await koer(db, { skriv: true });
    const gammel = db.store.get('superliga2627');
    db.store.set('superliga2627', { ...gammel, order: 99 });
    db.t.sat.length = 0;
    const ud = await koer(db, { skriv: true });
    expect(db.t.sat.map((s) => s.id)).toEqual(['superliga2627']);
    expect(ud.planer.find((p) => p.id === 'superliga2627').aendringer).toEqual([{ felt: 'order', fra: 99, til: 3 }]);
  });
});

describe('koerSeedGames — pulje-vagten afviser hele kørslen', () => {
  for (const skriv of [false, true]) {
    it(`før der læses eller skrives noget (skriv: ${skriv})`, async () => {
      const db = fakeDb();
      const vagt = (g) => (g.id === 'hvm2027' ? ['fasen «X» findes ikke i kalenderen'] : []);
      await expect(koer(db, { skriv, puljeSeedFejl: vagt }))
        .rejects.toThrow('Puljen kan ikke seedes — intet er skrevet:\n  hvm2027: fasen «X» findes ikke i kalenderen');
      expect(db.t.laest).toEqual([]);
      expect(db.t.batches).toBe(0);
      expect(db.t.sat).toEqual([]);
    });
  }

  it('vagten kaldes på HVER post — ikke kun den første', async () => {
    const set = [];
    await koer(fakeDb(), { skriv: false, puljeSeedFejl: (g) => { set.push(g.id); return []; } });
    expect(set).toEqual(GAMES.map((g) => g.id));
  });
});

describe('spilPlan — det, tør-kørslen viser', () => {
  const HVM = GAMES.find((g) => g.id === 'hvm2027');

  it('et nyt spil OPRETTES med listens status og joinable', () => {
    const p = spilPlan(HVM, { exists: false, data: null }, NU);
    expect(p.handling).toBe('opret');
    expect(p.payload.joinable).toBe(false);
    expect(p.payload.status).toBe('open');
    expect(p.adminBevaret).toEqual([]);
    expect(p.staar).toEqual([]);
    // Et nyt dokument har ingen «fra» — hele payloaden ER skrivningen.
    expect(p.aendringer).toEqual([]);
  });

  it('et spil, der findes: ADMIN_OWNED bevares med databasens værdi og listens ved siden af', () => {
    const { id, ...data } = HVM;
    const db = { ...data, joinable: true, status: 'live', createdAt: 1, updatedAt: 2 };
    const p = spilPlan(HVM, { exists: true, data: db }, NU);
    expect(p.handling).toBe('uaendret');
    expect(p.aendringer).toEqual([]);
    expect(p.adminBevaret).toEqual([
      { felt: 'status', db: 'live', liste: 'open' },
      { felt: 'joinable', db: true, liste: false },
    ]);
    expect(id).toBe('hvm2027');
  });

  // MERGE-SEMANTIK: maps flettes (bladstier), lister erstattes helt.
  it('ændringer vises som bladstier i maps og som hele lister', () => {
    const data = utenId(HVM);
    const db = {
      ...data,
      pulje: { ...data.pulje, labels: { overskrift: 'Gammel' }, gammelNoegle: 7 },
      faser: data.faser.slice(0, 2),
      puljeLockAt: 'en dato',
    };
    const p = spilPlan(HVM, { exists: true, data: db }, NU);
    expect(p.handling).toBe('opdater');
    expect(p.aendringer).toEqual([
      { felt: 'faser', fra: data.faser.slice(0, 2), til: data.faser },
      { felt: 'pulje.labels.overskrift', fra: 'Gammel', til: '🏆 Semifinalisterne' },
    ]);
    // Det, merge IKKE fjerner — også inde i en map, der flettes i.
    expect(p.staar).toEqual(['pulje.gammelNoegle', 'puljeLockAt']);
  });

  it('et felt, der mangler i databasen, er en ændring fra «findes ikke»', () => {
    expect(feltAendringer({ sport: 'haandbold' }, {})).toEqual([{ felt: 'sport', fra: undefined, til: 'haandbold' }]);
    expect(feltAendringer({ updatedAt: NU, createdAt: NU }, {})).toEqual([]);
  });

  it('staarTilbage nævner ikke tidsstempler eller admin-ejede felter (de vises for sig)', () => {
    expect(staarTilbage({ updatedAt: 1, createdAt: 1, status: 'x', joinable: true, paused: true }, {})).toEqual(['paused']);
    expect(staarTilbage(null, {})).toEqual([]);
  });
});

describe('ens — sammenligningen bag «uændret»', () => {
  it('skelner tal fra tal-streng, rækkefølge i lister og ekstra nøgler', () => {
    expect(ens(1, '1')).toBe(false);
    expect(ens([1, 2], [2, 1])).toBe(false);
    expect(ens({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(ens({ a: 1, b: 2 }, { a: 1 })).toBe(false);
    expect(ens({ a: undefined }, { b: undefined })).toBe(false);
    expect(ens({ a: [{ x: 1 }] }, { a: [{ x: 1 }] })).toBe(true);
    expect(ens(null, {})).toBe(false);
    expect(ens([1], [1, 2])).toBe(false);
    expect(ens([1, 2], [1])).toBe(false);
    // Et klasse-objekt er ikke en map: to forskellige datoer er ikke «ens»,
    // bare fordi ingen af dem har egne nøgler.
    expect(ens(new Date(1), new Date(2))).toBe(false);
  });

  it('to Timestamps sammenlignes på millisekundet', () => {
    const ts = (ms) => ({ toMillis: () => ms });
    expect(ens(ts(5), ts(5))).toBe(true);
    expect(ens(ts(5), ts(6))).toBe(false);
  });
});

describe('planLinjer — teksten operatøren læser', () => {
  const HVM = GAMES.find((g) => g.id === 'hvm2027');

  it('et nyt spil: hvert felt, kalenderen én fase pr. linje, og at admin ejer status/joinable bagefter', () => {
    const l = planLinjer(spilPlan(HVM, { exists: false }, NU));
    expect(l[0]).toBe('  • hvm2027 — Håndbold-VM 2027: OPRETTES');
    expect(l).toContain('      sport: "haandbold"');
    expect(l).toContain('      joinable: false');
    expect(l).toContain('      status: "open"');
    expect(l).toContain('      puljeLockRound: 1');
    const i = l.indexOf('      faser:');
    expect(i).toBeGreaterThan(0);
    expect(l.slice(i + 1, i + 6)).toEqual(HVM.faser.map((f) => `        ${JSON.stringify(f)}`));
    expect(l.at(-1)).toBe('      (status og joinable skrives fra listen nu — derefter ejer admin dem)');
    // Tidsstemplerne er ikke en ændring, nogen skal læse — og hvm2027 har
    // hverken sync eller season.
    expect(l.join('\n')).not.toMatch(/updatedAt|createdAt|sync|season/);
  });

  it('et ændret spil: fra → til, de bevarede admin-felter og det, der bliver stående', () => {
    const data = utenId(HVM);
    const db = { ...data, order: 9, joinable: true, status: 'open', paused: true };
    const l = planLinjer(spilPlan(HVM, { exists: true, data: db }, NU));
    expect(l).toEqual([
      '  • hvm2027 — Håndbold-VM 2027: 1 felt ændres',
      '      order: 9 → 5',
      '      admin-ejet, bevares: status = "open"',
      '      admin-ejet, bevares: joinable = true (listen siger false)',
      '      står i databasen, listen nævner det ikke — bliver stående (merge fjerner aldrig et felt): paused',
    ]);
  });

  // Q10: hvm2027 findes i produktionen UDEN grupper. Tør-kørslen, ejeren skal
  // sige ja til, er netop denne — og den skal kunne læses gruppe for gruppe,
  // ikke som én JSON-linje på ~1 KB.
  const GRUPPE_LINJER = [
    '          point: {"sejr":2,"uafgjort":1}',
    '          faser:',
    '            - fase: "Indledende runde", videre: 3',
    '              grupper:',
    '                {"navn":"A","hold":["Serbien","Uruguay","Tyskland","Tunesien"]}',
    '                {"navn":"B","hold":["Italien","Saudi-Arabien","Egypten","Kap Verde"]}',
    '                {"navn":"C","hold":["Spanien","Tyrkiet","Kroatien","Chile"]}',
    '                {"navn":"D","hold":["Argentina","Brasilien","Frankrig","Kuwait"]}',
    '                {"navn":"E","hold":["Sverige","Grækenland","Norge","Qatar"]}',
    '                {"navn":"F","hold":["Færøerne","Algeriet","Portugal","Polen"]}',
    '                {"navn":"G","hold":["Slovenien","Angola","Danmark","USA"]}',
    '                {"navn":"H","hold":["Nordmakedonien","Japan","Island","Bahrain"]}',
    '            - fase: "Hovedrunde", videre: 2',
    '              grupper:',
    '                {"navn":"I","fra":["A","B"]}',
    '                {"navn":"II","fra":["C","D"]}',
    '                {"navn":"III","fra":["E","F"]}',
    '                {"navn":"IV","fra":["G","H"]}',
  ];

  it('grupper, der mangler i databasen: ÉT ændret felt, én gruppe pr. linje', () => {
    const { grupper, ...data } = utenId(HVM);
    expect(grupper).toBeDefined();
    const l = planLinjer(spilPlan(HVM, { exists: true, data: { ...data, joinable: false } }, NU));
    expect(l).toEqual([
      '  • hvm2027 — Håndbold-VM 2027: 1 felt ændres',
      '      grupper:',
      '        fra: (findes ikke)',
      '        til:',
      ...GRUPPE_LINJER,
      '      admin-ejet, bevares: status = "open"',
      '      admin-ejet, bevares: joinable = false',
    ]);
    // Ingen linje er hele strukturen som én JSON-klump.
    expect(l.every((x) => x.length < 100)).toBe(true);
  });

  it('et nyt spil: grupperne står også én gruppe pr. linje', () => {
    const l = planLinjer(spilPlan(HVM, { exists: false }, NU));
    const i = l.indexOf('      grupper:');
    expect(i).toBeGreaterThan(0);
    expect(l.slice(i + 1, i + 1 + GRUPPE_LINJER.length)).toEqual(GRUPPE_LINJER.map((x) => x.slice(2)));
  });

  // En ændring i en liste af objekter (grupper.faser) viser fra og til hver
  // for sig, udfoldet; et blad (grupper.point.sejr) står stadig på én linje.
  it('en ændret gruppeliste: fra og til udfoldet — et ændret blad på én linje', () => {
    const data = utenId(HVM);
    const gammel = structuredClone(data.grupper);
    gammel.faser[1].grupper[0].fra = ['A', 'C'];
    gammel.point.sejr = 3;
    const l = planLinjer(spilPlan(HVM, { exists: true, data: { ...data, grupper: gammel } }, NU));
    expect(l[0]).toBe('  • hvm2027 — Håndbold-VM 2027: 2 felter ændres');
    expect(l[1]).toBe('      grupper.point.sejr: 3 → 2');
    expect(l[2]).toBe('      grupper.faser:');
    expect(l[3]).toBe('        fra:');
    const til = l.indexOf('        til:');
    expect(l.slice(4, til)).toContain('              {"navn":"I","fra":["A","C"]}');
    expect(l.slice(til)).toContain('              {"navn":"I","fra":["A","B"]}');
    expect(l.slice(til)).not.toContain('              {"navn":"I","fra":["A","C"]}');
  });

  it('et uændret spil siger det — og intet om ændringer', () => {
    const data = utenId(HVM);
    const l = planLinjer(spilPlan(HVM, { exists: true, data: { ...data } }, NU));
    expect(l[0]).toBe('  • hvm2027 — Håndbold-VM 2027: uændret — skrives ikke');
    expect(l.join('\n')).not.toMatch(/ændres|→|bliver stående/);
  });
});
