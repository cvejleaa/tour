// ---------------------------------------------------------------------------
// STRANDEDE-ALARMEN for alle aktive kampspil (facitVagt.js).
//
// Før dækkede alarmen kun SYNCED_GAMES — et kampspil uden kilde kunne have en
// kamp, der aldrig fik facit, uden en lyd. Testene binder delingen (et spil
// vogtes af PRÆCIS én vej), teksten (uden synk nævnes synk-knappen ikke),
// kortet (en kørsel uden kort er tavs) og lukningen af et afsluttet spils kort.
// ---------------------------------------------------------------------------
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';
import { HAANDBOLD_SPIL } from '../src/test/faseKalender.js';

const require = createRequire(import.meta.url);
const {
  kampOrd, meldStrandede, spilUdenSynk, facitVagtUdenSynk, meldManuelleUenige, puljeVagt,
} = require('./facitVagt');
const { statusSamler } = require('./driftlog');

const FieldValue = { serverTimestamp: () => '@ts', delete: () => '@delete' };
const NU = Date.parse('2026-11-02T20:00:00Z');
const LAENGE_SIDEN = new Date(NU - 5 * 3600 * 1000);
const LIGE_NU = new Date(NU - 30 * 60 * 1000);

function spioner() {
  const meldt = [];
  const loest = [];
  const skrevet = [];
  return {
    meldt, loest, skrevet,
    meld: async (db, FV, a) => { meldt.push(a); },
    loes: async (db, FV, a) => { loest.push(a); },
    skriv: async (st, o) => {
      // statusSamler skriver gennem db.collection('driftlog') — fang dokumentet.
      const fang = { collection: () => ({ doc: (id) => ({ set: async (doc) => skrevet.push({ id, doc, o }) }) }) };
      await st.skriv(fang, FieldValue, { naesteForventetFoerMs: typeof o.naesteForventetFoerMs === 'function' ? o.naesteForventetFoerMs() : o.naesteForventetFoerMs, nowMs: NU });
    },
  };
}

function makeDb({ games, matches = {}, driftlog = {}, kampFejl = null }) {
  return {
    collection(name) {
      if (name === 'driftlog') {
        return { doc: (id) => ({ async get() { return driftlog[id] ? { exists: true, data: () => driftlog[id] } : { exists: false, data: () => undefined }; } }) };
      }
      if (name !== 'games') throw new Error(`uventet ${name}`);
      return {
        where(felt, op, v) {
          if (felt !== 'type' || op !== '==' || v !== 'football') throw new Error(`uventet filter ${felt} ${op} ${v}`);
          return { async get() { return { docs: Object.entries(games).filter(([, g]) => g.type === v).map(([id, g]) => ({ id, data: () => g })) }; } };
        },
        doc: (gameId) => ({
          collection: () => ({
            async get() {
              if (kampFejl === gameId) throw new Error('Firestore haltede');
              return { docs: Object.entries(matches[gameId] || {}).map(([id, d]) => ({ id, data: () => d })) };
            },
          }),
        }),
      };
    },
  };
}

describe('spilUdenSynk — hvert kampspil vogtes af præcis én vej', () => {
  const games = [
    { id: 'superliga2627', type: 'football', status: 'live' },
    { id: 'pl2627-efteraar', type: 'football', status: 'finished' },
    { id: 'hvm2027', type: 'football', status: 'open', sport: 'haandbold' },
    { id: 'gammel', type: 'football', status: 'finished' },
    { id: 'tour2026', type: 'cycling', status: 'live' },
  ];
  it('synkede spil (også afsluttede) overlades til sweep-løkken; ikke-kampspil er ikke med', () => {
    const { aktive, lukkes } = spilUdenSynk(games, ['superliga2627', 'pl2627-efteraar']);
    expect(aktive.map((g) => g.id)).toEqual(['hvm2027']);
    // Alle andre kampspil får et eventuelt gammelt kort lukket — også de synkede.
    expect(lukkes.map((g) => g.id)).toEqual(['superliga2627', 'pl2627-efteraar', 'gammel']);
  });
  it('uden synkede spil vogtes alle aktive kampspil her', () => {
    expect(spilUdenSynk(games, []).aktive.map((g) => g.id)).toEqual(['superliga2627', 'hvm2027']);
  });
});

describe('meldStrandede — én kerne for begge veje', () => {
  it('melder hver strandet kamp med tekst for spillets situation og lukker resten', async () => {
    const s = spioner();
    const kampe = [
      { id: 'r1-a', data: { round: 1, home: 'Danmark', away: 'Norge', kickoff: LAENGE_SIDEN } },
      { id: 'r1-b', data: { round: 1, kickoff: LAENGE_SIDEN, result: '1' } },
      { id: 'r1-c', data: { round: 1, kickoff: LIGE_NU } },
    ];
    const ud = await meldStrandede({}, FieldValue, { gameId: 'hvm2027', kampe, harSynk: false, nowMs: NU, meld: s.meld, loes: s.loes });
    expect(ud.map((m) => m.id)).toEqual(['r1-a']);
    expect(s.meldt).toHaveLength(1);
    expect(s.meldt[0]).toMatchObject({ type: 'strandet', gameId: 'hvm2027', kampId: 'r1-a' });
    // Holdnavnene står i alarmen — og remediet for et spil UDEN synk.
    expect(s.meldt[0].besked).toContain('Danmark – Norge, runde 1 (r1-a)');
    expect(s.meldt[0].besked).toContain('✍️ Sæt eller ret facit i hånden');
    expect(s.meldt[0].besked).not.toContain('Synk resultater nu');
    expect(s.loest).toEqual([{ type: 'strandet', gameId: 'hvm2027', aktuelleKampIds: ['r1-a'] }]);
  });

  it('lukker alle, når intet er strandet — også når listen er tom', async () => {
    const s = spioner();
    await meldStrandede({}, FieldValue, { gameId: 'g', kampe: [], harSynk: true, nowMs: NU, meld: s.meld, loes: s.loes });
    expect(s.meldt).toEqual([]);
    expect(s.loest).toEqual([{ type: 'strandet', gameId: 'g', aktuelleKampIds: [] }]);
  });

  // QC-fundet: en kamp uden kickoff melder sig straks. Det bevares (den sikre
  // retning), men teksten skal sige "ret kickoff", ikke "sæt facit" — facit i
  // hånden afviser netop sådan en kamp.
  it('en kamp uden kickoff meldes straks — med kickoff som remedie', async () => {
    const s = spioner();
    await meldStrandede({}, FieldValue, {
      gameId: 'hvm2027', kampe: [{ id: 'r7-x', data: { round: 7, kickoff: null } }], harSynk: false, nowMs: NU, meld: s.meld, loes: s.loes,
    });
    expect(s.meldt).toHaveLength(1);
    expect(s.meldt[0].besked).toMatch(/intet læseligt kickoff/);
    expect(s.meldt[0].besked).toMatch(/Ret kickoff/);
    expect(s.meldt[0].besked).not.toMatch(/Sæt eller ret facit/);
  });
});

// Produktionens kickoff er et Firestore Timestamp. Hele vejen — strandedMatches
// OG alarmens tekst — skal læse det som et kickoff; ellers fik hver strandet
// kamp i drift remediet "ret kickoff" for et kickoff, der er fint.
describe('meldStrandede — kickoff som Firestore Timestamp', () => {
  it('meldes som manglende facit, ikke som et ulæseligt kickoff', async () => {
    const s = spioner();
    const ts = { toMillis: () => LAENGE_SIDEN.getTime() };
    const ud = await meldStrandede({}, FieldValue, {
      gameId: 'hvm2027', kampe: [{ id: 'r1-a', data: { round: 1, home: 'Danmark', away: 'Norge', kickoff: ts } }],
      harSynk: false, nowMs: NU, meld: s.meld, loes: s.loes,
    });
    expect(ud.map((m) => m.id)).toEqual(['r1-a']);
    expect(s.meldt).toHaveLength(1);
    expect(s.meldt[0].besked).toContain('Danmark – Norge, runde 1 (r1-a) mangler facit');
    expect(s.meldt[0].besked).toContain('✍️ Sæt eller ret facit i hånden');
    expect(s.meldt[0].besked).not.toMatch(/læseligt kickoff|Ret kickoff/);
  });

  it('et Timestamp lige efter kickoff er ikke strandet', async () => {
    const s = spioner();
    const ud = await meldStrandede({}, FieldValue, {
      gameId: 'hvm2027', kampe: [{ id: 'r1-c', data: { round: 1, kickoff: { toMillis: () => LIGE_NU.getTime() } } }],
      harSynk: false, nowMs: NU, meld: s.meld, loes: s.loes,
    });
    expect(ud).toEqual([]);
    expect(s.meldt).toEqual([]);
  });
});

describe('facitVagtUdenSynk', () => {
  const games = {
    superliga2627: { type: 'football', status: 'live', name: 'Superligaen' },
    hvm2027: { type: 'football', status: 'open', name: 'Håndbold-VM 2027' },
    gammel: { type: 'football', status: 'finished', name: 'Gammelt spil' },
  };
  const matches = {
    superliga2627: { 'r1-x': { round: 1, kickoff: LAENGE_SIDEN } },
    hvm2027: {
      'r1-1': { round: 1, kickoff: LAENGE_SIDEN, home: 'Danmark', away: 'Norge' },
      'r1-2': { round: 1, kickoff: LAENGE_SIDEN, result: 'X', homeGoals: 30, awayGoals: 30 },
    },
  };

  it('vogter KUN spillet uden synk og skriver et rødt kort med næste frist', async () => {
    const s = spioner();
    const ud = await facitVagtUdenSynk(makeDb({ games, matches }), FieldValue, {
      synkedeIds: ['superliga2627'], nowMs: NU, naesteForventetFoerMs: () => NU + 3600e3, skriv: s.skriv, meld: s.meld, loes: s.loes,
    });
    expect(ud).toEqual([{ gameId: 'hvm2027', strandede: 1, fejl: null }]);
    // Superligaens strandede kamp er IKKE meldt herfra (sweep-løkken gør det).
    expect(s.meldt.map((a) => a.gameId)).toEqual(['hvm2027']);
    expect(s.skrevet).toHaveLength(1);
    expect(s.skrevet[0].id).toBe('facitvagt-hvm2027');
    expect(s.skrevet[0].doc).toMatchObject({ type: 'facitvagt', gameId: 'hvm2027', gameNavn: 'Håndbold-VM 2027', niveau: 'fejl', naesteForventetFoer: NU + 3600e3 });
    expect(s.skrevet[0].doc.besked).toMatch(/^✖ 1 kamp uden facit.*sæt facit i hånden/);
    // M36: alarmen for et spil UDEN synk sendes med harSynk:false — den
    // nævner knappen i hånden og IKKE synk-knappen, der ikke findes for spillet.
    expect(s.meldt).toHaveLength(1);
    expect(s.meldt[0].besked).toContain('Danmark – Norge, runde 1 (r1-1)');
    expect(s.meldt[0].besked).toContain('Spillet har ingen resultat-synk');
    expect(s.meldt[0].besked).toContain('✍️ Sæt eller ret facit i hånden');
    expect(s.meldt[0].besked).not.toContain('Synk resultater nu');
  });

  it('grønt kort, når intet mangler', async () => {
    const s = spioner();
    await facitVagtUdenSynk(makeDb({ games, matches: { hvm2027: { 'r1-2': matches.hvm2027['r1-2'] } } }), FieldValue, {
      synkedeIds: ['superliga2627'], nowMs: NU, naesteForventetFoerMs: 1, skriv: s.skriv, meld: s.meld, loes: s.loes,
    });
    expect(s.skrevet[0].doc.niveau).toBe('ok');
    expect(s.skrevet[0].doc.besked).toMatch(/1 kamp gennemgået — ingen mangler facit/);
  });

  it('en fejl i ét spils opslag giver et rødt kort — ikke et tavst hul', async () => {
    const s = spioner();
    const ud = await facitVagtUdenSynk(makeDb({ games, matches, kampFejl: 'hvm2027' }), FieldValue, {
      synkedeIds: ['superliga2627'], nowMs: NU, naesteForventetFoerMs: 1, skriv: s.skriv, meld: s.meld, loes: s.loes,
    });
    expect(ud[0].fejl).toMatch(/haltede/);
    expect(s.skrevet[0].doc.niveau).toBe('fejl');
    expect(s.skrevet[0].doc.besked).toMatch(/Strandede-tjekket fejlede: Firestore haltede/);
  });

  it('lukker kortet for et afsluttet spil ÉN gang (frist null) — og laver aldrig et nyt', async () => {
    const s = spioner();
    await facitVagtUdenSynk(makeDb({
      games: { ...games, ogsaaGammel: { type: 'football', status: 'finished', name: 'Uden kort' } },
      matches,
      driftlog: { 'facitvagt-gammel': { naesteForventetFoer: NU - 1 } },
    }), FieldValue, { synkedeIds: ['superliga2627'], nowMs: NU, naesteForventetFoerMs: 1, skriv: s.skriv, meld: s.meld, loes: s.loes });
    const lukket = s.skrevet.filter((w) => w.id !== 'facitvagt-hvm2027');
    expect(lukket).toHaveLength(1);
    expect(lukket[0].id).toBe('facitvagt-gammel');
    expect(lukket[0].doc.naesteForventetFoer).toBeNull();

    // Et spil, der har fået synk (håndbold, når provideren lander): kortet
    // lukkes med en tekst, der siger hvorfor — ellers stod det rødt for evigt.
    const s3 = spioner();
    await facitVagtUdenSynk(makeDb({ games, matches, driftlog: { 'facitvagt-superliga2627': { naesteForventetFoer: NU - 1 } } }), FieldValue, {
      synkedeIds: ['superliga2627'], nowMs: NU, naesteForventetFoerMs: 1, skriv: s3.skriv, meld: s3.meld, loes: s3.loes,
    });
    const flyttet = s3.skrevet.find((w) => w.id === 'facitvagt-superliga2627');
    expect(flyttet.doc.naesteForventetFoer).toBeNull();
    expect(flyttet.doc.besked).toMatch(/fået resultat-synk.*Times-sweep/);

    const s2 = spioner();
    await facitVagtUdenSynk(makeDb({ games, matches, driftlog: { 'facitvagt-gammel': { naesteForventetFoer: null } } }), FieldValue, {
      synkedeIds: ['superliga2627'], nowMs: NU, naesteForventetFoerMs: 1, skriv: s2.skriv, meld: s2.meld, loes: s2.loes,
    });
    expect(s2.skrevet.map((w) => w.id)).toEqual(['facitvagt-hvm2027']);
  });
});

// ---------------------------------------------------------------------------
// UDEBLIVELSES-ALARMEN for en runde-pulje (QC-fund, server bør 1). Alarmen
// `puljeFacit` blev før kun regnet i afregningen, og den kører ved et
// resultat. Netop det scenarie, alarmen er bygget til — semifinalerne bliver
// aldrig lagt ind — giver ingen kamp og dermed intet resultat. Her tjekkes
// den i hver times-sweep. Semifinalerne (TEST_FASER) starter fredag 29/1 2027.
// ---------------------------------------------------------------------------
describe('puljeVagt — runde-puljen i times-sweep\'et', () => {
  const PULJE = { poolSize: 4, facitKilde: 'runde', facitFase: 'Semifinaler', maksStartRunde: 1 };
  const HVM = { ...HAANDBOLD_SPIL, id: 'hvm2027', status: 'open', pulje: PULJE };
  const k = (id, round, home, away, extra = {}) => ({ id, data: { round, home, away, kickoff: LAENGE_SIDEN, ...extra } });
  const KVART = [
    k('r14-1', 14, 'DK', 'NO', { result: '1', homeGoals: 30, awayGoals: 28 }),
    k('r14-2', 14, 'FR', 'ES', { result: '1', homeGoals: 30, awayGoals: 28 }),
    k('r15-1', 15, 'SE', 'DE', { result: '1', homeGoals: 30, awayGoals: 28 }),
    k('r15-2', 15, 'HR', 'IS', { result: '1', homeGoals: 30, awayGoals: 28 }),
  ];
  const SEMI = [k('r16-1', 16, 'DK', 'FR'), k('r16-2', 16, 'SE', 'HR')];
  const FOER = Date.parse('2027-01-28T12:00:00Z');
  const DAGEN = Date.parse('2027-01-29T22:30:00Z');      // 23.30 dansk tid fredag
  const NATTEN_EFTER = Date.parse('2027-01-29T23:30:00Z'); // 00.30 dansk tid lørdag
  const tavs = () => vi.spyOn(console, 'error').mockImplementation(() => {});

  it('semifinalerne udeblev: alarm fra dagen efter startdagen (dansk dato) — med tal og remedie', async () => {
    const fejl = tavs();
    try {
      for (const t of [FOER, DAGEN]) {
        const s = spioner();
        expect(await puljeVagt({}, FieldValue, { game: HVM, kampe: KVART, nowMs: t, meld: s.meld, loes: s.loes }))
          .toEqual({ kan: false, fejl: [] });
        expect(s.meldt, String(t)).toEqual([]);
        // «Ikke lagt ind endnu» lukker heller ikke en åben alarm.
        expect(s.loest, String(t)).toEqual([]);
      }
      // 00.30 dansk tid er dagen EFTER — i UTC er det stadig fredag.
      const s = spioner();
      await puljeVagt({}, FieldValue, { game: HVM, kampe: KVART, nowMs: NATTEN_EFTER, meld: s.meld, loes: s.loes });
      expect(s.meldt).toHaveLength(1);
      expect(s.meldt[0]).toMatchObject({ type: 'puljeFacit', gameId: 'hvm2027', nowMs: NATTEN_EFTER });
      expect(s.meldt[0].besked).toBe('Pulje-tippene i «Håndbold-VM 2027» kan ikke afregnes: '
        + '«Semifinaler» skulle være begyndt fredag 29. januar, men kun 0 af 2 kampe er lagt ind. '
        + 'Mangler fasens kampe, så læg dem ind med 📥 Læg næste fases kampe ind; er de lagt forkert ind (eller er pulje/faser i scripts/games.mjs forkerte), så ret dem. Tryk så 🎖️ Afregn puljen — begge under Admin → 🗓️ Spil-tidsplan.');
      expect(s.loest).toEqual([]);
      expect(fejl).toHaveBeenCalledWith(expect.stringContaining('puljeVagt(hvm2027): puljen kan ikke afgøres'));
    } finally { fejl.mockRestore(); }
  });

  it('kun den ene semifinale: alarm efter startdagen', async () => {
    const fejl = tavs();
    try {
      const s = spioner();
      await puljeVagt({}, FieldValue, { game: HVM, kampe: [...KVART, SEMI[0]], nowMs: NATTEN_EFTER, meld: s.meld, loes: s.loes });
      expect(s.meldt[0].besked).toContain('kun 1 af 2 kampe er lagt ind');
    } finally { fejl.mockRestore(); }
  });

  it('en dublet meldes med det samme; lagt rigtigt ind lukkes alarmen', async () => {
    const fejl = tavs();
    try {
      const s = spioner();
      await puljeVagt({}, FieldValue, {
        game: HVM, kampe: [...KVART, SEMI[0], k('r16-2', 16, 'DK', 'HR')], nowMs: FOER, meld: s.meld, loes: s.loes,
      });
      expect(s.meldt[0].besked).toContain('DK står i to kampe i «Semifinaler»');
    } finally { fejl.mockRestore(); }
    const s = spioner();
    expect(await puljeVagt({}, FieldValue, { game: HVM, kampe: [...KVART, ...SEMI], nowMs: NATTEN_EFTER, meld: s.meld, loes: s.loes }))
      .toEqual({ kan: true, fejl: [] });
    expect(s.meldt).toEqual([]);
    expect(s.loest).toEqual([{ type: 'puljeFacit', gameId: 'hvm2027', aktuelleKampIds: [], nowMs: NATTEN_EFTER }]);
  });

  // FRAVÆRS-ASSERTION MED VILJE: Superligaen, Premier League og et spil uden
  // pulje rører aldrig alarmen — hverken melder eller lukker.
  it('liga-puljer og spil uden pulje: intet', async () => {
    for (const game of [
      { id: 'superliga2627', pulje: { poolSize: 6 } },
      { id: 'pl', pulje: { poolSize: 4, nedSize: 3, facitKilde: 'egneKampe' } },
      { ...HAANDBOLD_SPIL, id: 'hvm-uden' },
    ]) {
      const s = spioner();
      expect(await puljeVagt({}, FieldValue, { game, kampe: KVART, nowMs: NATTEN_EFTER, meld: s.meld, loes: s.loes }), game.id).toBeNull();
      expect(s.meldt).toEqual([]);
      expect(s.loest).toEqual([]);
    }
  });

  describe('i facitVagtUdenSynk', () => {
    const kampeMap = (liste) => Object.fromEntries(liste.map((m) => [m.id, m.data]));

    it('spillet uden synk: alarmen meldes, og kortet er stadig strandede-kortet', async () => {
      const fejl = tavs();
      try {
        const s = spioner();
        await facitVagtUdenSynk(makeDb({ games: { hvm2027: HVM }, matches: { hvm2027: kampeMap(KVART) } }), FieldValue, {
          synkedeIds: ['superliga2627'], nowMs: NATTEN_EFTER, naesteForventetFoerMs: 1, skriv: s.skriv, meld: s.meld, loes: s.loes,
        });
        expect(s.meldt.map((a) => a.type)).toEqual(['puljeFacit']);
        expect(s.meldt[0].besked).toContain('kun 0 af 2 kampe er lagt ind');
        expect(s.skrevet.map((w) => w.id)).toEqual(['facitvagt-hvm2027']);
        expect(s.skrevet[0].doc.niveau).toBe('ok');
      } finally { fejl.mockRestore(); }
    });

    it('et SYNKET spil med runde-pulje vogtes også — uden et kort herfra', async () => {
      const fejl = tavs();
      try {
        const s = spioner();
        await facitVagtUdenSynk(makeDb({
          games: { hvm2027: { ...HVM, status: 'live' }, superliga2627: { type: 'football', status: 'live', pulje: { poolSize: 6 } } },
          matches: { hvm2027: kampeMap(KVART), superliga2627: {} },
        }), FieldValue, {
          synkedeIds: ['hvm2027', 'superliga2627'], nowMs: NATTEN_EFTER, naesteForventetFoerMs: 1, skriv: s.skriv, meld: s.meld, loes: s.loes,
        });
        expect(s.meldt).toHaveLength(1);
        expect(s.meldt[0]).toMatchObject({ type: 'puljeFacit', gameId: 'hvm2027' });
        expect(s.skrevet).toEqual([]);
        // Et afsluttet spil med runde-pulje vogtes IKKE (ingen alarm, ingen kan handle på).
        const s2 = spioner();
        await facitVagtUdenSynk(makeDb({ games: { hvm2027: { ...HVM, status: 'finished' } }, matches: { hvm2027: kampeMap(KVART) } }), FieldValue, {
          synkedeIds: ['hvm2027'], nowMs: NATTEN_EFTER, naesteForventetFoerMs: 1, skriv: s2.skriv, meld: s2.meld, loes: s2.loes,
        });
        expect(s2.meldt).toEqual([]);
      } finally { fejl.mockRestore(); }
    });

    it('kaster pulje-tjekket, står det på kortet — og strandede-tjekket er gjort alligevel', async () => {
      const fejl = tavs();
      try {
        const s = spioner();
        const meld = async (db, FV, a) => {
          if (a.type === 'puljeFacit') throw new Error('driftAlarmer haltede');
          s.meldt.push(a);
        };
        const kampe = { ...kampeMap(KVART), 'r16-1': { round: 16, home: 'DK', away: 'FR', kickoff: LAENGE_SIDEN } };
        const ud = await facitVagtUdenSynk(makeDb({ games: { hvm2027: HVM }, matches: { hvm2027: kampe } }), FieldValue, {
          synkedeIds: [], nowMs: NATTEN_EFTER, naesteForventetFoerMs: 1, skriv: s.skriv, meld, loes: s.loes,
        });
        expect(ud).toEqual([{ gameId: 'hvm2027', strandede: 1, fejl: null }]);
        expect(s.meldt.map((a) => a.type)).toEqual(['strandet']);
        expect(s.skrevet[0].doc.niveau).toBe('fejl');
        expect(s.skrevet[0].doc.besked).toContain('Pulje-tjekket fejlede: driftAlarmer haltede');
        expect(s.skrevet[0].doc.besked).toContain('1 kamp uden facit');
      } finally { fejl.mockRestore(); }
    });
  });
});

// BØR-FUNDET: uenigheden mellem kilden og facit i hånden stod kun i svaret
// fra "⬇️ Synk resultater nu". Sweep'et fører den nu til sit Drift-kort.
describe('meldManuelleUenige — advarsel på sweep\'ets kort', () => {
  const kort = () => statusSamler({ type: 'sweep', gameId: 'superliga2627' });
  const skrevetAf = async (st) => {
    let doc = null;
    const fang = { collection: () => ({ doc: () => ({ set: async (d) => { doc = d; } }) }) };
    await st.skriv(fang, FieldValue, { naesteForventetFoerMs: 1, nowMs: NU });
    return doc;
  };

  it('nævner hver kamp med holdnavne og kildens og håndens tal — og de to veje ud', async () => {
    const st = kort();
    st.ok('12 færdige kampe, intet manglede.');
    const n = meldManuelleUenige(st, [
      { id: 'r5-agf-ob', home: 'AGF', away: 'OB', haand: { home: 1, away: 1 }, kilde: { home: 2, away: 1 } },
      { id: 'r6-fck-bif', home: 'FC København', away: 'Brøndby IF', haand: { home: 0, away: 0 }, kilde: { home: 0, away: 1 } },
    ]);
    expect(n).toBe(2);
    const doc = await skrevetAf(st);
    expect(doc.niveau).toBe('advarsel');
    expect(doc.tal).toMatchObject({ manuelleUenige: 2 });
    expect(doc.besked).toContain('⚠ Kilden er uenig med facit i hånden om 2 kampe: '
      + 'AGF – OB (i hånden 1-1, kilden 2-1); FC København – Brøndby IF (i hånden 0-0, kilden 0-1). Synken rører dem ikke.');
    expect(doc.besked).toContain('✍️ Sæt eller ret facit i hånden');
    expect(doc.besked).toContain('↩️ Lad synken overtage igen');
    expect(doc.besked).not.toMatch(/r5-agf-ob|r6-fck-bif|\[object Object\]/);
  });

  it('ental ved én kamp', async () => {
    const st = kort();
    meldManuelleUenige(st, [{ id: 'a', home: 'AGF', away: 'OB', haand: { home: 1, away: 0 }, kilde: { home: 2, away: 0 } }]);
    expect((await skrevetAf(st)).besked).toContain('om 1 kamp: AGF – OB');
  });

  it('ingen uenige → ingen linje, og kortet forbliver grønt', async () => {
    for (const tom of [[], undefined]) {
      const st = kort();
      st.ok('12 færdige kampe, intet manglede.');
      expect(meldManuelleUenige(st, tom)).toBe(0);
      const doc = await skrevetAf(st);
      expect(doc.niveau).toBe('ok');
      expect(doc.besked).not.toMatch(/uenig/);
    }
  });
});

describe('kampOrd — Drift-kortenes tekster bøjes', () => {
  it('1 kamp, 0 og 2 kampe', () => {
    expect(kampOrd(1)).toBe('kamp');
    expect(kampOrd(0)).toBe('kampe');
    expect(kampOrd(2)).toBe('kampe');
  });
});
