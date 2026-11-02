// ---------------------------------------------------------------------------
// STRANDEDE-ALARMEN for alle aktive kampspil (facitVagt.js).
//
// Før dækkede alarmen kun SYNCED_GAMES — et kampspil uden kilde kunne have en
// kamp, der aldrig fik facit, uden en lyd. Testene binder delingen (et spil
// vogtes af PRÆCIS én vej), teksten (uden synk nævnes synk-knappen ikke),
// kortet (en kørsel uden kort er tavs) og lukningen af et afsluttet spils kort.
// ---------------------------------------------------------------------------
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { meldStrandede, spilUdenSynk, facitVagtUdenSynk } = require('./facitVagt');

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
    expect(s.skrevet[0].doc.besked).toMatch(/1 kampe uden facit.*sæt facit i hånden/);
  });

  it('grønt kort, når intet mangler', async () => {
    const s = spioner();
    await facitVagtUdenSynk(makeDb({ games, matches: { hvm2027: { 'r1-2': matches.hvm2027['r1-2'] } } }), FieldValue, {
      synkedeIds: ['superliga2627'], nowMs: NU, naesteForventetFoerMs: 1, skriv: s.skriv, meld: s.meld, loes: s.loes,
    });
    expect(s.skrevet[0].doc.niveau).toBe('ok');
    expect(s.skrevet[0].doc.besked).toMatch(/1 kampe gennemgået — ingen mangler facit/);
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
