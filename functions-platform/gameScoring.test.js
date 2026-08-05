import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  recomputeGameMatchCore, recomputeSeasonElo,
  computeRanks, snapshotRoundRanks, settlePuljeBets, officialTop6,
  gatedIds, recomputeAllPlayerTotals, rescoreAllBets,
} = require('./gameScoring');
// Combi-reglen har ét hjem. Testen henter den DERFRA, så en fremtidig dublet
// ikke kan snige sig ind bag en grøn suite.
const { combiBonus, buildRoundContext } = require('./pointOpdeling');

// --- Minimal in-memory fake-Firestore, kun nok til gameScoring-kernen. -------
// Understøtter: games/{g}/bets (where uid==, where matchId==), games/{g}/matches
// (.get()), games/{g}/players (.get() + .doc(uid)), spil-dok (.get()/.set()),
// batch().update/commit, runTransaction(tx.get(query)/tx.set(ref)).
function makeDb(betList, matchList = [], gameData = {}, playerSeed = {}, puljeSeed = {}) {
  const bets = betList.map((b) => ({ data: { ...b } }));
  bets.forEach((b) => { b.ref = { __bet: b }; });
  const players = { ...playerSeed }; // uid -> data (forud-seedede placeringer mv.)
  const pulje = {}; // uid -> data
  for (const [uid, d] of Object.entries(puljeSeed)) pulje[uid] = { uid, ...d };
  const game = { ...gameData };

  const preconditions = [];
  // updateTime er det, rescoreAllBets skal give videre som precondition.
  const alleBetDocs = () => bets.map((b, i) => ({
    ref: b.ref, data: () => b.data, updateTime: `t${i}`,
  }));
  const betsCollection = {
    where: (field, _op, val) => ({
      get: async () => ({
        docs: bets
          .filter((b) => b.data[field] === val)
          .map((b) => ({ ref: b.ref, data: () => b.data })),
      }),
    }),
    // rescoreAllBets henter ALLE bets på én gang — ikke pr. kamp.
    get: async () => ({ docs: alleBetDocs(), size: bets.length }),
  };
  const matchesCollection = {
    get: async () => ({ docs: matchList.map((m) => ({ id: m.id, data: () => m })) }),
  };
  const detalje = {};
  const stier = {}; // uid -> 'collection/dokument' for detalje-skrivningen
  const playersCollection = {
    // Spiller-ref'en bærer sin egen detalje-subcollection, så faken kan fange
    // BÅDE at rækkerne skrives, og at de skrives UDEN merge.
    doc: (uid) => ({
      __player: uid,
      collection: (c) => ({ doc: (d) => ({ __detalje: uid, __sti: `${c}/${d}` }) }),
    }),
    get: async () => ({
      docs: Object.keys(players).map((uid) => ({
        id: uid, ref: { __player: uid }, data: () => players[uid],
      })),
    }),
  };
  const puljeCollection = {
    doc: (uid) => ({ __pulje: uid }),
    get: async () => ({
      empty: Object.keys(pulje).length === 0,
      docs: Object.keys(pulje).map((uid) => ({
        id: uid, ref: { __pulje: uid }, data: () => pulje[uid],
      })),
    }),
  };
  const gameDoc = {
    get: async () => ({ exists: Object.keys(game).length > 0, data: () => game }),
    set: (data) => {
      for (const [k, v] of Object.entries(data)) {
        if (v && v.__arrayUnion) {
          const cur = Array.isArray(game[k]) ? game[k] : [];
          game[k] = [...new Set([...cur, ...v.__arrayUnion])];
        } else { game[k] = v; }
      }
    },
    collection: (name) => {
      if (name === 'bets') return betsCollection;
      if (name === 'matches') return matchesCollection;
      if (name === 'puljeBets') return puljeCollection;
      return playersCollection;
    },
  };
  // Faken SKAL kende forskel på set() med og uden { merge: true }. Uden det
  // kunne man tilføje merge til detalje-skrivningen, og testen for "rækken
  // forsvinder, når facit fjernes" ville blive grøn alligevel — altså ikke
  // beskytte noget.
  const applyOp = (ref, data, opts) => {
    if (ref.__bet) { Object.assign(ref.__bet.data, data); return; }
    if (ref.__player) { players[ref.__player] = { ...(players[ref.__player] || {}), ...data }; return; }
    // FULD ERSTATNING, ikke merge — spejler set() uden { merge: true }. Faken
    // skal opføre sig som Firestore her, ellers kan testene ikke se forskel på
    // "rækken er væk" og "rækken blev bare ikke skrevet igen".
    if (ref.__detalje) {
      stier[ref.__detalje] = ref.__sti;
      const cur = detalje[ref.__detalje];
      detalje[ref.__detalje] = (opts && opts.merge && cur)
        ? { ...cur, ...data, kampe: { ...(cur.kampe || {}), ...(data.kampe || {}) } }
        : data;
      return;
    }
    if (ref.__pulje) { pulje[ref.__pulje] = { ...(pulje[ref.__pulje] || {}), ...data }; }
  };
  // tx.get skal kunne læse både queries (som har .get) og player-refs.
  const txGet = async (q) => {
    if (q && q.__player) return { exists: q.__player in players, data: () => players[q.__player] || {} };
    return q.get();
  };
  const db = {
    collection: (name) => {
      if (name !== 'games') throw new Error(`uventet collection ${name}`);
      return { doc: () => gameDoc };
    },
    batch: () => ({
      _ops: [],
      update(ref, data, precondition) { this._ops.push({ ref, data, precondition }); },
      set(ref, data, opts) { this._ops.push({ ref, data, opts }); },
      async commit() {
        for (const op of this._ops) {
          if (op.precondition) preconditions.push(op.precondition);
          applyOp(op.ref, op.data, op.opts);
        }
      },
    }),
    async runTransaction(fn) {
      await fn({
        get: txGet,
        set: (ref, data, opts) => applyOp(ref, data, opts),
      });
    },
    _players: players,
    _detalje: detalje,
    _detaljeStier: stier,
    _bets: bets,
    _preconditions: preconditions,
    _game: game,
    _pulje: pulje,
  };
  return db;
}

const FieldValue = {
  serverTimestamp: () => '@ts',
  arrayUnion: (...vals) => ({ __arrayUnion: vals }),
};

describe('recomputeGameMatchCore', () => {
  it('scorer bets og gulver spillerens total (ingen negativ saldo)', async () => {
    // Point følger oddsene PLUS træf-bonussen på 1.
    // A: pick X rammer facit X → 3.0 (odds X) + 1 = 4 base, + chance 8@3.0 = +16 → 20.
    // Chancen afregnes til de RENE odds — bonussen ganges ikke med.
    // B: pick 1, facit X → 0, chance 5@2.0 forbi → −5 (skal gulves til 0 i total)
    const db = makeDb([
      { uid: 'A', matchId: 'm1', pick: 'X', chanceStake: 8, points: 0 },
      { uid: 'B', matchId: 'm1', pick: '1', chanceStake: 5, points: 0 },
      { uid: 'C', matchId: 'other', pick: '1', chanceStake: 0, points: 3 }, // anden kamp, urørt
    ], [{ id: 'm1', round: 1, result: 'X', odds: { 1: 2.0, X: 3.0, 2: 4.0 }, kickoff: 1 }]);
    const res = await recomputeGameMatchCore(db, FieldValue, 'g1', 'm1', {
      result: 'X', odds: { 1: 2.0, X: 3.0, 2: 4.0 },
    });
    expect(res.rescored).toBe(2);
    expect(res.players).toBe(2);
    expect(db._players.A.totalPoints).toBe(20);
    expect(db._players.B.totalPoints).toBe(0); // −5 gulvet til 0
    expect(db._players.C).toBeUndefined();     // ikke berørt
  });

  it('skriver ikke på bets hvis pointtallet er uændret', async () => {
    const db = makeDb([
      // DEFAULT_POINTS.X (4) + træf-bonus 1 — kampen har ingen odds i denne db.
      { uid: 'A', matchId: 'm1', pick: 'X', chanceStake: 0, points: 5 }, // allerede korrekt
    ]);
    const res = await recomputeGameMatchCore(db, FieldValue, 'g1', 'm1', { result: 'X' });
    expect(res.rescored).toBe(0);
  });

  // Spilleren genberegnes ALLIGEVEL. Testen stod før på det modsatte
  // (`_players` skulle være tom), og dét låste fejlen fast: combi-bonussen
  // kræver, at hele RUNDEN er spillet, ikke at spillerens egne point rykkede
  // sig. Var det rundens sidste kamp, kunne bonussen kun komme herfra.
  it('genberegner spilleren, selv om hans egne point ikke ændrede sig', async () => {
    const db = makeDb([
      { uid: 'A', matchId: 'm1', pick: 'X', chanceStake: 0, points: 5 },
    ]);
    const res = await recomputeGameMatchCore(db, FieldValue, 'g1', 'm1', { result: 'X' });
    expect(res.players).toBe(1);
    expect(db._players.A).toBeDefined();
  });

  it('skriver ikke på tips der allerede står på 0 uden facit', async () => {
    const db = makeDb([{ uid: 'A', matchId: 'm1', pick: '1', points: 0 }]);
    const res = await recomputeGameMatchCore(db, FieldValue, 'g1', 'm1', { result: null });
    expect(res.rescored).toBe(0);
  });

  it('nulstiller point når et facit FJERNES igen', async () => {
    // Admin satte et forkert resultat og fjerner det. Så skal pointene rulles
    // tilbage — ellers beholder spilleren point for en kamp uden resultat.
    const matches = [{ id: 'm1', round: 1, result: null, odds: { 1: 2.5, X: 4, 2: 4 } }];
    const db = makeDb(
      [{ uid: 'A', matchId: 'm1', pick: '1', points: 3.5 }],
      matches, {}, { A: { totalPoints: 3.5 } },
    );
    const res = await recomputeGameMatchCore(db, FieldValue, 'g1', 'm1', { result: null });
    expect(res.rescored).toBe(1);
    expect(db._bets[0].data.points).toBe(0);
    expect(db._players.A.totalPoints).toBe(0);
  });

  it('skriver rubrikkerne på spilleren', async () => {
    const matches = [{ id: 'm1', round: 1, result: 'X', odds: { 1: 2, X: 3, 2: 4 }, kickoff: 1 }];
    const db = makeDb([{ uid: 'A', matchId: 'm1', pick: 'X', chanceStake: 0, points: 0 }], matches);
    await recomputeGameMatchCore(db, FieldValue, 'g1', 'm1', {
      result: 'X', odds: { 1: 2, X: 3, 2: 4 }, round: 1,
    });
    expect(db._players.A.opdeling).toEqual({ p1x2: 4, chance: 0, combi: 0, pulje: 0 });
    expect(db._players.A.totalPoints).toBe(4);
  });

  it('skriver spillerens rækker i detalje-dokumentet', async () => {
    const matches = [{ id: 'm1', round: 1, result: 'X', odds: { 1: 2, X: 3, 2: 4 }, kickoff: 1 }];
    const db = makeDb([{ uid: 'A', matchId: 'm1', pick: 'X', chanceStake: 2, points: 0 }], matches);
    await recomputeGameMatchCore(db, FieldValue, 'g1', 'm1', {
      result: 'X', odds: { 1: 2, X: 3, 2: 4 }, round: 1,
    });
    expect(db._detalje.A.uid).toBe('A');
    // `points` SKAL påstås. Uden det kunne serveren skrive 0 på hver eneste
    // kamp, uden at noget fejlede — og det er netop det tal, hele rækken
    // findes for.
    expect(db._detalje.A.kampe.m1).toEqual({ pick: 'X', points: 8, chanceStake: 2 });
  });

  // Stien er en kontrakt mellem serveren, firestore.rules og klienten. Er den
  // ikke bundet i en test, kan collection-navnet eller dokument-id'et ændres,
  // og så peger reglen på noget, der ikke længere skrives — uden at nogen
  // test falder.
  it('skriver rækkerne på den sti, reglen beskytter', async () => {
    const matches = [{ id: 'm1', round: 1, result: 'X', odds: { 1: 2, X: 3, 2: 4 }, kickoff: 1 }];
    const db = makeDb([{ uid: 'A', matchId: 'm1', pick: 'X', chanceStake: 0, points: 0 }], matches);
    await recomputeGameMatchCore(db, FieldValue, 'g1', 'm1', {
      result: 'X', odds: { 1: 2, X: 3, 2: 4 }, round: 1,
    });
    expect(db._detaljeStier.A).toBe('detalje/opdeling');
  });

  // Detalje-dokumentet skrives med FULD ERSTATNING, ikke merge. Fjerner en
  // admin et facit igen — den sti er understøttet — skal kampen VÆK fra
  // rækkerne. Med merge ville den blive stående for evigt med sine gamle
  // point, og spillerens egen oversigt ville sige noget andet end stillingen.
  // Fejlen hverken fejler eller logger; den opdages først, når nogen undrer sig.
  it('fjerner rækken igen, når et facit FJERNES', async () => {
    const matches = [{ id: 'm1', round: 1, result: 'X', odds: { 1: 2, X: 3, 2: 4 }, kickoff: 1 }];
    const db = makeDb([{ uid: 'A', matchId: 'm1', pick: 'X', chanceStake: 0, points: 0 }], matches);
    await recomputeGameMatchCore(db, FieldValue, 'g1', 'm1', {
      result: 'X', odds: { 1: 2, X: 3, 2: 4 }, round: 1,
    });
    expect(db._detalje.A.kampe.m1).toBeDefined();

    // Admin fortryder: facit fjernes fra kampdokumentet.
    matches[0].result = null;
    await recomputeGameMatchCore(db, FieldValue, 'g1', 'm1', { result: null, round: 1 });

    expect(db._detalje.A.kampe.m1).toBeUndefined();
    expect(db._players.A.totalPoints).toBe(0);
  });

  // Kampen har facit, men er ikke begyndt (admin-tastefejl). Rækken må ikke
  // med: detalje-dokumentet læses af liga-kammerater og kommer aldrig forbi
  // kickoff-tjekket i firestore.rules, så tippet ville blive udstillet før
  // kampstart.
  it('holder en kamp, der ikke er begyndt, ude af rækkerne', async () => {
    const fremtid = Date.now() + 60 * 60_000;
    const matches = [{ id: 'm1', round: 1, result: 'X', odds: { 1: 2, X: 3, 2: 4 }, kickoff: fremtid }];
    const db = makeDb([{ uid: 'A', matchId: 'm1', pick: 'X', chanceStake: 0, points: 0 }], matches);
    await recomputeGameMatchCore(db, FieldValue, 'g1', 'm1', {
      result: 'X', odds: { 1: 2, X: 3, 2: 4 }, round: 1,
    });
    expect(db._detalje.A.kampe.m1).toBeUndefined();
    // …men pointene tæller. De to filtre er adskilte: kickoff afgør kun, hvad
    // andre må SE, aldrig hvad spilleren har fået.
    expect(db._players.A.totalPoints).toBe(4);
  });

  // REGRESSIONEN. Combi-bonussen gives også ved ÉN fejl, og den kan først
  // beregnes, når hele runden er spillet. Rammer spilleren netop rundens
  // SIDSTE kamp forkert uden at bruge Chancen, går hans point 0 → 0.
  //
  // Før samlede vi kun spillere, hvis point ÆNDREDE sig, og sprang helt fra på
  // `rescored === 0`. Så blev han aldrig genberegnet, og bonussen for hans ene
  // fejl kom aldrig — tavst, for hver enkelt kamp var jo scoret rigtigt.
  it('giver combi-bonus for én fejl, selv når spilleren missede rundens sidste kamp', async () => {
    const matches = [
      { id: 'm1', round: 1, result: '1', odds: { 1: 2.0, X: 4, 2: 4 } },
      { id: 'm2', round: 1, result: '1', odds: { 1: 3.0, X: 4, 2: 4 } },
    ];
    const db = makeDb([
      { uid: 'A', matchId: 'm1', pick: '1', chanceStake: 0, points: 3 }, // ramt (2,0+1), allerede scoret
      { uid: 'A', matchId: 'm2', pick: 'X', chanceStake: 0, points: 0 }, // MISSER — 0 før og efter
    ], matches);

    const res = await recomputeGameMatchCore(db, FieldValue, 'g1', 'm2', {
      result: '1', odds: { 1: 3.0, X: 4, 2: 4 }, round: 1,
    });

    expect(res.rescored).toBe(0);        // ingen bet-point rykkede sig
    expect(res.players).toBe(1);         // men spilleren SKAL genberegnes
    expect(db._players.A).toBeDefined();
    // Én ramt kamp er ingen kupon — combi kræver mindst to at gange sammen.
    // Pointen i testen er, at spilleren SKAL genberegnes alligevel (res.players
    // ovenfor), ikke hvad bonussen bliver.
    expect(db._players.A.roundBonus).toBe(0);
  });

  it('lægger combi-runde-bonus til når hele runden er ramt', async () => {
    // Runde 1 = to kampe. A tipper begge og rammer begge → combi = 2·√(2,0×3,0).
    // B tipper kun m1 og har dermed én ramt kamp — det er ingen kupon at gange,
    // så han får ingen bonus. Det er IKKE fordi han skulle tippe hele runden;
    // kuponkravet findes ikke længere.
    const matches = [
      { id: 'm1', round: 1, result: '1', odds: { 1: 2.0, X: 4, 2: 4 } },
      { id: 'm2', round: 1, result: 'X', odds: { 1: 2, X: 3.0, 2: 4 } },
    ];
    const db = makeDb([
      { uid: 'A', matchId: 'm1', pick: '1', chanceStake: 0, points: 3 }, // allerede scoret (2,0+1)
      { uid: 'A', matchId: 'm2', pick: 'X', chanceStake: 0, points: 0 }, // scores nu
      { uid: 'B', matchId: 'm1', pick: '1', chanceStake: 0, points: 3 },
    ], matches);
    const res = await recomputeGameMatchCore(db, FieldValue, 'g1', 'm2', {
      result: 'X', odds: { 1: 2, X: 3.0, 2: 4 }, round: 1,
    });
    expect(res.rescored).toBe(1);              // kun A's m2-bet ændrede sig
    // A: 3 (m1 = 2,0+1) + 4 (m2 = 3,0+1) + 4,9 (combi = 2·√(2,0×3,0)) = 11,9
    expect(db._players.A.totalPoints).toBe(11.9);
    expect(db._players.A.roundBonus).toBe(4.9);
    // B rørt ikke (ingen bet på m2) → ingen genberegning
    expect(db._players.B).toBeUndefined();
  });
});

describe('gatedIds (kampe før spillets start)', () => {
  it('uden startAt: tom mængde', () => {
    expect(gatedIds([{ id: 'm1', kickoff: 100 }], null).size).toBe(0);
  });
  it('markerer kun kampe med kickoff FØR start', () => {
    const g = gatedIds([{ id: 'm1', kickoff: 100 }, { id: 'm2', kickoff: 500 }, { id: 'm3', kickoff: 900 }], 500);
    expect([...g]).toEqual(['m1']); // 500 er PÅ start → tæller med
  });
});

describe('recomputeGameMatchCore — start-gate (game.startAt)', () => {
  it('scorer ikke en kamp før spillets start', async () => {
    const db = makeDb(
      [{ uid: 'A', matchId: 'm1', pick: 'X', chanceStake: 0, points: 0 }],
      [{ id: 'm1', round: 1, kickoff: 100, result: 'X', odds: { 1: 2, X: 3, 2: 4 } }],
      { startAt: 500 },
    );
    const res = await recomputeGameMatchCore(db, FieldValue, 'g1', 'm1', {
      result: 'X', odds: { 1: 2, X: 3, 2: 4 }, round: 1, kickoff: 100,
    });
    expect(res.gated).toBe(true);
    expect(res.rescored).toBe(0);
    expect(Object.keys(db._players)).toHaveLength(0);
  });

  it('udelader point fra runde FØR start i totalen', async () => {
    const matches = [
      { id: 'm1', round: 1, kickoff: 100, result: '1', odds: { 1: 5, X: 5, 2: 5 } },
      { id: 'm2', round: 2, kickoff: 900, result: 'X', odds: { 1: 2, X: 3, 2: 4 } },
    ];
    const db = makeDb([
      { uid: 'A', matchId: 'm1', pick: '1', chanceStake: 0, points: 5 }, // runde 1 → skal IKKE tælle
      { uid: 'A', matchId: 'm2', pick: 'X', chanceStake: 0, points: 0 }, // runde 2 → scores nu til 4 (3,0+1)
    ], matches, { startAt: 500 });
    const res = await recomputeGameMatchCore(db, FieldValue, 'g1', 'm2', {
      result: 'X', odds: { 1: 2, X: 3, 2: 4 }, round: 2, kickoff: 900,
    });
    expect(res.rescored).toBe(1);
    expect(db._players.A.totalPoints).toBe(4); // kun m2; m1's point gated væk
  });
});

// Bagfyldningen af bet-point. Den skriver i hver eneste spillers point, så den
// skal være bevist — ikke bare grøn.
// Porten foran rang-snapshottet OG Runde-Botten. Uden den fyrer botten efter
// rundens FØRSTE afgjorte kamp, og snapshottet — som er ÉNGANGS og
// uigenkaldeligt — tages på en halv runde.
describe('snapshot-porten: hele KUPONEN skal være afgjort', () => {
  const ug = (iso) => Date.parse(iso);
  // Runde 3 som den ser ud: fire kampe i ugen, to udsat til september.
  const runde3 = (facit) => [
    { id: 'a', round: 3, result: facit.a ?? null, odds: { 1: 2, X: 4, 2: 4 }, kickoff: ug('2026-08-07T17:00:00Z') },
    { id: 'b', round: 3, result: facit.b ?? null, odds: { 1: 2, X: 3, 2: 4 }, kickoff: ug('2026-08-07T19:00:00Z') },
    { id: 'c', round: 3, result: facit.c ?? null, odds: { 1: 2, X: 4, 2: 3 }, kickoff: ug('2026-08-09T15:00:00Z') },
    { id: 'd', round: 3, result: facit.d ?? null, odds: { 1: 2, X: 4, 2: 4 }, kickoff: ug('2026-08-09T17:45:00Z') },
    { id: 'e', round: 3, result: null, odds: { 1: 2, X: 4, 2: 4 }, kickoff: ug('2026-09-02T17:00:00Z') },
    { id: 'f', round: 3, result: null, odds: { 1: 2, X: 4, 2: 4 }, kickoff: ug('2026-09-03T17:00:00Z') },
  ];
  const bets = () => ['a', 'b', 'c', 'd'].map((id) => ({ uid: 'A', matchId: id, pick: '1', chanceStake: 0, points: 0 }));

  it('snapshotter IKKE efter rundens første facit', async () => {
    const kampe = runde3({ a: '1' });
    const db = makeDb(bets(), kampe);
    const res = await recomputeGameMatchCore(db, FieldValue, 'g1', 'a', {
      result: '1', odds: { 1: 2, X: 4, 2: 4 }, round: 3, kickoff: ug('2026-08-07T17:00:00Z'),
    });
    expect(res.roundCompleted).toBeNull();
    expect(db._game.snapshottedRounds).toBeUndefined();
  });

  // …og den venter IKKE på de to udsatte. Gjorde den det, ville runde 3's
  // facit, delta-pile og botopslag først falde 3. september.
  it('snapshotter når ugens fire er afgjort — uden at vente på de udsatte', async () => {
    const kampe = runde3({ a: '1', b: '1', c: '1', d: '1' });
    const db = makeDb(bets(), kampe);
    const res = await recomputeGameMatchCore(db, FieldValue, 'g1', 'd', {
      result: '1', odds: { 1: 2, X: 4, 2: 4 }, round: 3, kickoff: ug('2026-08-09T17:45:00Z'),
    });
    expect(res.roundCompleted).toBe(3);
    expect(db._game.snapshottedRounds).toContain(3);
  });

  it('snapshotter kun ÉN gang pr. runde', async () => {
    const kampe = runde3({ a: '1', b: '1', c: '1', d: '1' });
    const db = makeDb(bets(), kampe, { snapshottedRounds: [3] });
    const res = await recomputeGameMatchCore(db, FieldValue, 'g1', 'd', {
      result: '1', odds: { 1: 2, X: 4, 2: 4 }, round: 3, kickoff: ug('2026-08-09T17:45:00Z'),
    });
    expect(res.roundCompleted).toBeNull();
  });
});

describe('rescoreAllBets — genscoring efter en REGELÆNDRING', () => {
  // odds X = 3 → 3 + træf-bonus 1 = 4. De gemte 3 er fra den gamle regel.
  const kampe = [{ id: 'm1', round: 1, result: 'X', odds: { 1: 2, X: 3, 2: 4 }, kickoff: 1 }];

  it('tør-kørsel skriver INTET, men siger hvad der ville ske', async () => {
    const db = makeDb([{ uid: 'A', matchId: 'm1', pick: 'X', chanceStake: 0, points: 3 }], kampe);
    const res = await rescoreAllBets(db, FieldValue, 'g1', { dryRun: true });
    expect(res.dryRun).toBe(true);
    expect(res.aendrede).toBe(1);
    expect(res.delta).toBe(1);
    expect(res.eksempler[0]).toMatchObject({ uid: 'A', foer: 3, efter: 4 });
    // Intet skrevet — hverken på bettet eller på spilleren.
    expect(db._bets[0].data.points).toBe(3);
    expect(db._players.A).toBeUndefined();
  });

  // Default SKAL være tør. Kaldes den uden argument fra en admin-knap, må den
  // ikke nå at skrive noget.
  it('tørkører som default, når dryRun udelades', async () => {
    const db = makeDb([{ uid: 'A', matchId: 'm1', pick: 'X', chanceStake: 0, points: 3 }], kampe);
    const res = await rescoreAllBets(db, FieldValue, 'g1');
    expect(res.dryRun).toBe(true);
    expect(db._bets[0].data.points).toBe(3);
  });

  it('skriver de nye point OG genberegner totalen, når dryRun er falsk', async () => {
    const db = makeDb([{ uid: 'A', matchId: 'm1', pick: 'X', chanceStake: 0, points: 3 }], kampe,
      {}, { A: { totalPoints: 3 } });
    const res = await rescoreAllBets(db, FieldValue, 'g1', { dryRun: false });
    expect(res.dryRun).toBe(false);
    expect(res.aendrede).toBe(1);
    expect(db._bets[0].data.points).toBe(4);
    // Totalen SKAL med i samme kald — ellers står stillingen på det gamle tal,
    // indtil noget andet tilfældigvis udløser en genberegning.
    expect(db._players.A.totalPoints).toBe(4);
    // …og rubrikken må ikke gå i minus. Det var hele grunden til bagfyldningen.
    expect(db._players.A.opdeling.chance).toBe(0);
  });

  // Uden bagfyldningen udledes chance som (gemte point − 1X2-point), og en
  // spiller uden Chancen ville se −1 pr. træffer.
  it('efterlader ikke Chancen i minus for en spiller, der aldrig har brugt den', async () => {
    const flere = [
      { id: 'm1', round: 1, result: 'X', odds: { 1: 2, X: 3, 2: 4 }, kickoff: 1 },
      { id: 'm2', round: 1, result: '1', odds: { 1: 2, X: 4, 2: 4 }, kickoff: 1 },
    ];
    const db = makeDb([
      { uid: 'A', matchId: 'm1', pick: 'X', chanceStake: 0, points: 3 }, // gammel regel
      { uid: 'A', matchId: 'm2', pick: '1', chanceStake: 0, points: 2 }, // gammel regel
    ], flere, {}, { A: { totalPoints: 5 } });
    await rescoreAllBets(db, FieldValue, 'g1', { dryRun: false });
    expect(db._players.A.opdeling.chance).toBe(0);
    expect(db._players.A.opdeling.p1x2).toBe(7); // (3+1) + (2+1)
  });

  // Uden preconditionen skriver rescoren sin foraeldede vaerdi ovenpaa, hvis
  // noget roerte kampen mellem laesning og commit — fx en admin, der fjerner et
  // facit midt i koerslen. Fake'en kan ikke simulere konflikten, men den kan
  // bevise, at preconditionen faktisk sendes med.
  it('skriver med lastUpdateTime som precondition', async () => {
    const db = makeDb([{ uid: 'A', matchId: 'm1', pick: 'X', chanceStake: 0, points: 3 }], kampe,
      {}, { A: { totalPoints: 3 } });
    await rescoreAllBets(db, FieldValue, 'g1', { dryRun: false });
    expect(db._preconditions).toHaveLength(1);
    expect(db._preconditions[0]).toEqual({ lastUpdateTime: 't0' });
  });

  it('rører ikke bets på en kamp før spillets start', async () => {
    const db = makeDb(
      [{ uid: 'A', matchId: 'm1', pick: 'X', chanceStake: 0, points: 3 }],
      [{ id: 'm1', round: 1, result: 'X', odds: { 1: 2, X: 3, 2: 4 }, kickoff: 100 }],
      { startAt: 500 },
    );
    const res = await rescoreAllBets(db, FieldValue, 'g1', { dryRun: false });
    expect(res.aendrede).toBe(0);
    expect(db._bets[0].data.points).toBe(3);
  });

  // Et bet uden kampdokument har intet facit at scores mod. At nulstille det
  // ville tage point fra spilleren, uden at nogen kunne se hvorfor.
  it('rører ikke et bet, hvis kamp er slettet', async () => {
    const db = makeDb([{ uid: 'A', matchId: 'vaek', pick: 'X', chanceStake: 0, points: 9 }], kampe);
    const res = await rescoreAllBets(db, FieldValue, 'g1', { dryRun: false });
    expect(res.aendrede).toBe(0);
    expect(db._bets[0].data.points).toBe(9);
  });

  it('springer de bets over, der allerede står rigtigt', async () => {
    const db = makeDb([{ uid: 'A', matchId: 'm1', pick: 'X', chanceStake: 0, points: 4 }], kampe,
      {}, { A: { totalPoints: 4 } });
    const res = await rescoreAllBets(db, FieldValue, 'g1', { dryRun: false });
    expect(res.aendrede).toBe(0);
  });
});

describe('recomputeAllPlayerTotals — genberegn med gate', () => {
  it('fjerner point før start for ALLE spillere', async () => {
    const matches = [
      { id: 'm1', round: 1, kickoff: 100, result: '1', odds: { 1: 5, X: 4, 2: 4 } },
      { id: 'm2', round: 2, kickoff: 900, result: 'X', odds: { 1: 2, X: 3, 2: 4 } },
    ];
    const db = makeDb([
      { uid: 'A', matchId: 'm1', pick: '1', points: 5 },
      { uid: 'A', matchId: 'm2', pick: 'X', points: 3 },
      { uid: 'B', matchId: 'm1', pick: '1', points: 5 },
    ], matches, { startAt: 500 }, { A: { totalPoints: 8 }, B: { totalPoints: 5 } });
    const res = await recomputeAllPlayerTotals(db, FieldValue, 'g1');
    expect(res).toEqual({ players: 2, gatedMatches: 1 });
    expect(db._players.A.totalPoints).toBe(3); // kun m2
    expect(db._players.B.totalPoints).toBe(0); // kun m1 (gated)
  });
});

describe('buildRoundContext — kampe uden rundenummer', () => {
  // Opslaget rummer nu ALLE kampe, også dem uden runde, fordi pointopdelingen
  // bruger det til at afgøre, om en kamps point tæller. Men rundetællingen SKAL
  // springe dem over: uden `if (round == null) continue` samles de i én
  // pseudo-runde, og combi-bonussen udbetales for kampe, der intet har med
  // hinanden at gøre. To facit-kampe uden runde gav 9 point ud af ingenting.
  const uden = [
    { id: 'm1', result: '1', odds: { 1: 3.0, X: 4, 2: 4 } },
    { id: 'm2', result: 'X', odds: { 1: 4, X: 3.0, 2: 4 } },
  ];

  it('tager kampen med i opslaget, så dens point ikke forsvinder', () => {
    const ctx = buildRoundContext(uden);
    expect(ctx.byMatch.m1).toBeDefined();
    expect(ctx.byMatch.m1.result).toBe('1');
  });

  it('tæller dem ALDRIG som en runde — ingen combi ud af ingenting', () => {
    const ctx = buildRoundContext(uden);
    expect(Object.keys(ctx.rounds)).toHaveLength(0);
    const bets = [{ matchId: 'm1', pick: '1' }, { matchId: 'm2', pick: 'X' }];
    expect(combiBonus(bets, ctx)).toBe(0);
  });
});

describe('buildRoundContext + combiBonus', () => {
  const matches = [
    { id: 'r1-a', round: 1, result: '1', odds: { 1: 2.0, X: 4, 2: 4 } },
    { id: 'r1-b', round: 1, result: 'X', odds: { 1: 2, X: 3.0, 2: 4 } },
    { id: 'r1-c', round: 1, result: '2', odds: { 1: 2, X: 4, 2: 2.5 } }, // ikke afgjort endnu nedenfor
  ];
  it('bygger opslag pr. kamp og pr. runde', () => {
    const ctx = buildRoundContext(matches);
    // count/settledCount er RUNDENS kampe; combiCount/combiSettled er
    // KUPONENS. De er ens her, fordi alle tre kampe ligger i samme uge.
    expect(ctx.rounds[1]).toMatchObject({
      count: 3, settledCount: 3, combiCount: 3, combiSettled: 3,
    });
    expect(ctx.byMatch['r1-b'].result).toBe('X');
  });
  it('kræver at hele kuponen er afgjort — men IKKE at man tippede den', () => {
    const ctx = buildRoundContext(matches);
    // Tippede kun 2 af 3 og ramte begge → bonus af DE TO. Der er intet
    // kuponkrav: en glemt kamp tæller ikke med, men udelukker heller ikke.
    expect(combiBonus([
      { matchId: 'r1-a', pick: '1' }, { matchId: 'r1-b', pick: 'X' },
    ], ctx)).toBe(4.9); // 2·√(2,0×3,0)
    // Tippede alle 3, ramte alle → 2·√(2,0×3,0×2,5)
    expect(combiBonus([
      { matchId: 'r1-a', pick: '1' }, { matchId: 'r1-b', pick: 'X' }, { matchId: 'r1-c', pick: '2' },
    ], ctx)).toBe(7.7);
  });
  it('tæller kun ét bet pr. kamp, selv om der ligger to', () => {
    const ctx = buildRoundContext(matches);
    // Dubletten må ikke gange oddsene ind to gange. uid_matchId i
    // firestore.rules forhindrer den, men combi skal ikke hvile på det alene.
    expect(combiBonus([
      { matchId: 'r1-a', pick: '1' }, { matchId: 'r1-a', pick: '1' },
      { matchId: 'r1-b', pick: 'X' },
    ], ctx)).toBe(4.9);
  });
  it('giver 0 ved kun én ramt — der er ingen kupon at gange', () => {
    const ctx = buildRoundContext(matches);
    expect(combiBonus([
      { matchId: 'r1-a', pick: '1' }, { matchId: 'r1-b', pick: '1' },
    ], ctx)).toBe(0);
  });
  it('giver ingen bonus når en kamp i runden mangler facit', () => {
    const partial = [
      { id: 'r1-a', round: 1, result: '1', odds: { 1: 2, X: 4, 2: 4 } },
      { id: 'r1-b', round: 1, result: null, odds: { 1: 2, X: 3, 2: 4 } },
    ];
    const ctx = buildRoundContext(partial);
    expect(ctx.rounds[1].settledCount).toBe(1);
    expect(combiBonus([
      { matchId: 'r1-a', pick: '1' }, { matchId: 'r1-b', pick: 'X' },
    ], ctx)).toBe(0);
  });
  it('uden roundCtx gives 0', () => {
    expect(combiBonus([{ matchId: 'x', pick: '1' }], null)).toBe(0);
  });
});

describe('computeRanks', () => {
  it('standard-konkurrence-rang (1,2,2,4) efter point', () => {
    const r = computeRanks([
      { uid: 'a', totalPoints: 12 }, { uid: 'b', totalPoints: 8 },
      { uid: 'c', totalPoints: 8 }, { uid: 'd', totalPoints: 5 },
    ]);
    expect(r.get('a')).toBe(1);
    expect(r.get('b')).toBe(2);
    expect(r.get('c')).toBe(2); // delt 2.-plads
    expect(r.get('d')).toBe(4); // springer 3 over
  });
  it('deterministisk tie-break på uid ved lige point', () => {
    const r1 = computeRanks([{ uid: 'z', totalPoints: 5 }, { uid: 'a', totalPoints: 5 }]);
    const r2 = computeRanks([{ uid: 'a', totalPoints: 5 }, { uid: 'z', totalPoints: 5 }]);
    expect(r1.get('a')).toBe(r2.get('a')); // samme rang uanset input-orden
  });
});

describe('snapshotRoundRanks', () => {
  it('sætter previousRank = hidtidig rank, rank = ny rang', async () => {
    // Før: A var nr. 1, B nr. 2 (gemt rank). Nu har B overhalet A på point.
    const db = makeDb([], [], {}, {
      A: { totalPoints: 10, rank: 1 },
      B: { totalPoints: 20, rank: 2 },
    });
    const res = await snapshotRoundRanks(db, FieldValue, 'g1');
    expect(res.ranked).toBe(2);
    expect(db._players.B.rank).toBe(1);           // B nu nr. 1
    expect(db._players.B.previousRank).toBe(2);   // B var nr. 2
    expect(db._players.A.rank).toBe(2);           // A nu nr. 2
    expect(db._players.A.previousRank).toBe(1);   // A var nr. 1 → rankDelta -1 (faldt)
  });
  it('første snapshot: previousRank = rank (ingen bevægelse)', async () => {
    const db = makeDb([], [], {}, { A: { totalPoints: 10 }, B: { totalPoints: 5 } });
    await snapshotRoundRanks(db, FieldValue, 'g1');
    expect(db._players.A).toMatchObject({ rank: 1, previousRank: 1 });
    expect(db._players.B).toMatchObject({ rank: 2, previousRank: 2 });
  });
});

describe('recomputeGameMatchCore — placerings-snapshot ved rundeafslutning', () => {
  it('snapshotter ranks når sidste kamp i runden afgøres (én gang)', async () => {
    // Runde 1 = to kampe. m1 allerede afgjort; m2 afgøres nu → runden komplet.
    const matches = [
      { id: 'm1', round: 1, result: '1', odds: { 1: 2.0, X: 4, 2: 4 } },
      { id: 'm2', round: 1, result: 'X', odds: { 1: 2, X: 3.0, 2: 4 } },
    ];
    const db = makeDb([
      { uid: 'A', matchId: 'm1', pick: '1', chanceStake: 0, points: 2 },
      { uid: 'A', matchId: 'm2', pick: 'X', chanceStake: 0, points: 0 },
      { uid: 'B', matchId: 'm2', pick: '1', chanceStake: 0, points: 0 },
    ], matches, {}, { A: {}, B: {} });
    await recomputeGameMatchCore(db, FieldValue, 'g1', 'm2', {
      result: 'X', odds: { 1: 2, X: 3.0, 2: 4 }, round: 1,
    });
    // A ramte begge (+combi) → foran B; ranks snapshottet, runden markeret.
    expect(db._players.A.rank).toBe(1);
    expect(db._game.snapshottedRounds).toEqual([1]);
  });

  it('snapshotter IKKE igen for en allerede-snapshottet runde (resultat-rettelse)', async () => {
    const matches = [
      { id: 'm1', round: 1, result: '1', odds: { 1: 2.0, X: 4, 2: 4 } },
      { id: 'm2', round: 1, result: 'X', odds: { 1: 2, X: 3.0, 2: 4 } },
    ];
    // Runde 1 er allerede snapshottet; A's m2-bet har et forkert gemt pointtal,
    // så en genberegning rescorer (og recalc kører) — men snapshot skal springes over.
    const db = makeDb([
      { uid: 'A', matchId: 'm2', pick: 'X', chanceStake: 0, points: 99 },
    ], matches, { snapshottedRounds: [1] }, { A: { rank: 7, previousRank: 7 } });
    const res = await recomputeGameMatchCore(db, FieldValue, 'g1', 'm2', {
      result: 'X', odds: { 1: 2, X: 3.0, 2: 4 }, round: 1,
    });
    expect(res.rescored).toBe(1);           // pointtallet blev rettet
    expect(db._players.A.rank).toBe(7);     // rank urørt → snapshot kørte ikke igen
    expect(db._players.A.previousRank).toBe(7);
  });
});

describe('settlePuljeBets', () => {
  // 3 hold spillet færdigt: A > B > C. top-6 (slice) = [A, B, C].
  const matches = [
    { id: 'm1', home: 'A', away: 'B', homeGoals: 2, awayGoals: 0 },
    { id: 'm2', home: 'A', away: 'C', homeGoals: 1, awayGoals: 0 },
    { id: 'm3', home: 'B', away: 'C', homeGoals: 3, awayGoals: 1 },
  ];
  it('scorer pulje-tip og lægger bonusPoints i spillerens total', async () => {
    const db = makeDb([], matches, {}, { P1: {}, P2: {} }, {
      P1: { championship: ['A', 'B', 'C'] }, // alle 3 i top → 3×4 = 12
      P2: { championship: ['A', 'X', 'Y'] }, // 1 rigtig → 4
    });
    const res = await settlePuljeBets(db, FieldValue, 'g1', matches);
    expect(res.settled).toBe(2);
    expect(db._pulje.P1).toMatchObject({ correct: 3, points: 12 });
    expect(db._pulje.P2).toMatchObject({ correct: 1, points: 4 });
    expect(db._players.P1).toMatchObject({ bonusPoints: 12, totalPoints: 12 });
    expect(db._players.P2).toMatchObject({ bonusPoints: 4, totalPoints: 4 });
  });
  // START-GATEN ER KUN DÆKKET HER. settlePuljeBets bygger runde-konteksten
  // over ALLE kampe og sender `gated` med separat, så bet-filteret i
  // recalcPlayerTotal er den eneste spærring på denne sti. Alle andre
  // gate-tests går gennem recomputeGameMatchCore, hvor konteksten allerede er
  // renset og filteret derfor redundant — så uden denne test kunne filteret
  // fjernes helt, og kampe fra før spillets start ville både give point og
  // havne i rækkerne, som liga-kammerater må læse.
  it('holder kampe før spillets start ude af BÅDE totalen og rækkerne', async () => {
    // homeGoals/awayGoals SKAL med: settlePuljeBets er self-guardet og gør
    // ingenting, før hver eneste kamp har mål.
    const foerStart = {
      id: 'g0', round: 1, kickoff: 100, result: '1', homeGoals: 2, awayGoals: 0,
      home: 'A', away: 'B', odds: { 1: 5, X: 4, 2: 4 },
    };
    const efterStart = {
      id: 'g1m', round: 2, kickoff: 900, result: '1', homeGoals: 1, awayGoals: 0,
      home: 'A', away: 'C', odds: { 1: 2, X: 4, 2: 4 },
    };
    const db = makeDb(
      [
        { uid: 'P1', matchId: 'g0', pick: '1', points: 5 },   // før start — må ikke tælle
        { uid: 'P1', matchId: 'g1m', pick: '1', points: 2 },  // efter start
      ],
      [foerStart, efterStart],
      { startAt: 500 },
      { P1: {} },
      { P1: { championship: ['A', 'B', 'C'] } },
    );
    await settlePuljeBets(db, FieldValue, 'g1', [foerStart, efterStart]);

    // 2 point fra kampen efter start + puljebonussen. De 5 fra før start må ikke med.
    expect(db._players.P1.totalPoints).toBe(2 + db._players.P1.bonusPoints);
    expect(db._detalje.P1.kampe.g0).toBeUndefined();
    expect(db._detalje.P1.kampe.g1m).toBeDefined();
  });

  it('bevarer combi-bonussen når puljen afregnes', async () => {
    // To kampe i runde 1, begge ramt → combi = 2,0 × 3,0 = 6. Plus 3 råpoint.
    // Puljen giver 4. Uden runde-konteksten ville combi'en blive nulstillet.
    const roundMatches = [
      { id: 'm1', round: 1, home: 'A', away: 'B', homeGoals: 2, awayGoals: 0, result: '1', odds: { 1: 2, X: 3, 2: 4 } },
      { id: 'm2', round: 1, home: 'A', away: 'C', homeGoals: 1, awayGoals: 0, result: '1', odds: { 1: 3, X: 3, 2: 4 } },
      { id: 'm3', round: 2, home: 'B', away: 'C', homeGoals: 3, awayGoals: 1, result: '1', odds: { 1: 2, X: 3, 2: 4 } },
    ];
    const db = makeDb([
      { uid: 'P1', matchId: 'm1', pick: '1', points: 2 },
      { uid: 'P1', matchId: 'm2', pick: '1', points: 3 },
    ], roundMatches, {}, { P1: {} }, { P1: { championship: ['A'] } });

    const res = await settlePuljeBets(db, FieldValue, 'g1', roundMatches);
    expect(res.settled).toBe(1);
    // 5 råpoint + 4,9 combi (2·√6) + 4 pulje = 13,9 (uden fix: 9).
    expect(db._players.P1.bonusPoints).toBe(4);
    expect(db._players.P1.roundBonus).toBe(4.9);
    expect(db._players.P1.totalPoints).toBe(13.9);
  });

  it('gør intet før grundspillet er helt spillet', async () => {
    const partial = [...matches.slice(0, 2), { id: 'm3', home: 'B', away: 'C', homeGoals: null, awayGoals: null }];
    const db = makeDb([], partial, {}, { P1: {} }, { P1: { championship: ['A', 'B', 'C'] } });
    const res = await settlePuljeBets(db, FieldValue, 'g1', partial);
    expect(res.settled).toBe(0);
    expect(db._pulje.P1.points).toBeUndefined();
  });

  it('bruger den OFFICIELLE stilling til top-6 (ikke beregnet tabel)', async () => {
    // Dummy-kamp mellem Y/Z (så en beregnet tabel ville give top = [Y,Z]).
    // Den officielle stilling siger derimod at A–F er top-6.
    const standings = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']
      .map((name, i) => ({ rank: i + 1, teamName: name, played: 1 }));
    const dummy = [{ id: 'm1', home: 'Y', away: 'Z', homeGoals: 1, awayGoals: 0 }];
    const db = makeDb([], dummy, { standings }, { P1: {}, P2: {} }, {
      P1: { championship: ['A', 'B', 'C', 'D', 'E', 'F'] }, // alle 6 rigtige → 34
      P2: { championship: ['A', 'B', 'C', 'D', 'E', 'X'] }, // 5 rigtige → 20
    });
    await settlePuljeBets(db, FieldValue, 'g1', dummy);
    expect(db._pulje.P1).toMatchObject({ correct: 6, points: 34 });
    expect(db._pulje.P2).toMatchObject({ correct: 5, points: 20 });
  });
});

describe('officialTop6', () => {
  const std = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']
    .map((name, i) => ({ rank: i + 1, teamName: name, played: 22 }));
  it('tager rank 1–6 fra den officielle stilling', () => {
    expect(officialTop6(std, 22)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
  });
  it('returnerer null hvis stillingen ikke er helt spillet igennem', () => {
    expect(officialTop6(std, 30)).toBeNull(); // forventer 30 spillede, har 22
  });
  it('returnerer null uden en fuld 12-holds stilling', () => {
    expect(officialTop6(null)).toBeNull();
    expect(officialTop6(std.slice(0, 5))).toBeNull();
  });
});

// --- Fake-Firestore for recomputeSeasonElo (spil-dok + kampe) ----------------
function makeEloDb(gameData, matchList) {
  const game = { ...gameData };
  const matches = matchList.map((m) => ({ data: { ...m } }));
  matches.forEach((m) => { m.ref = { __match: m }; });
  const gameRef = {
    async get() { return { exists: true, data: () => game }; },
    set(data) { Object.assign(game, data); },
    collection() {
      return { async get() { return { docs: matches.map((m) => ({ id: m.data.id, ref: m.ref, data: () => m.data })) }; } };
    },
  };
  return {
    _game: game,
    _matches: matches,
    collection: () => ({ doc: () => gameRef }),
    batch: () => ({
      _ops: [],
      update(ref, data) { this._ops.push({ ref, data }); },
      async commit() { for (const op of this._ops) Object.assign(op.ref.__match.data, op.data); },
    }),
  };
}

describe('recomputeSeasonElo (levende Elo)', () => {
  const teams = [{ name: 'A', elo: 1500 }, { name: 'B', elo: 1500 }];
  const future = 5_000_000_000_000; // langt ude i fremtiden
  const past = 1_000;

  it('opdaterer Elo efter spillet kamp og friske odds på fremtidig kamp', async () => {
    const db = makeEloDb({ teams }, [
      { id: 'm1', home: 'A', away: 'B', kickoff: past, result: '1' },        // A vandt
      { id: 'm2', home: 'A', away: 'B', kickoff: future, odds: { 1: 9, X: 9, 2: 9 } }, // fremtidig
    ]);
    const res = await recomputeSeasonElo(db, FieldValue, 'g1', 2_000_000_000_000);
    // A's rating steg over B's.
    expect(db._game.eloCurrent.A).toBeGreaterThan(db._game.eloCurrent.B);
    // Den fremtidige kamps odds blev opdateret (var urealistiske 9/9/9).
    expect(res.updated).toBe(1);
    const m2 = db._matches.find((m) => m.data.id === 'm2').data;
    expect(m2.odds['1']).not.toBe(9);
    expect(m2.eloHome).toBeGreaterThan(m2.eloAway);
  });

  it('rører ikke låste (allerede spillede/kickoff-passerede) kampe', async () => {
    const db = makeEloDb({ teams }, [
      { id: 'm1', home: 'A', away: 'B', kickoff: past, result: '1' },
      { id: 'm2', home: 'B', away: 'A', kickoff: past, odds: { 1: 9, X: 9, 2: 9 } }, // kickoff passeret → låst
    ]);
    const res = await recomputeSeasonElo(db, FieldValue, 'g1', 2_000_000_000_000);
    expect(res.updated).toBe(0);
    const m2 = db._matches.find((m) => m.data.id === 'm2').data;
    expect(m2.odds['1']).toBe(9); // uændret
  });

  it('gør intet uden seed-hold', async () => {
    const db = makeEloDb({}, [{ id: 'm1', home: 'A', away: 'B', kickoff: future }]);
    const res = await recomputeSeasonElo(db, FieldValue, 'g1', 1_000_000);
    expect(res).toEqual({ updated: 0 });
  });

  it('gemmer Elo-historik pr. HELT spillet runde', async () => {
    const db = makeEloDb({ teams }, [
      // Runde 1 = én kamp, spillet → giver et historik-snapshot.
      { id: 'r1', round: 1, home: 'A', away: 'B', kickoff: past, result: '1' },
      // Runde 2 = to kampe, kun den ene spillet → INTET snapshot for runde 2.
      { id: 'r2a', round: 2, home: 'A', away: 'B', kickoff: past + 1, result: 'X' },
      { id: 'r2b', round: 2, home: 'B', away: 'A', kickoff: future },
    ]);
    await recomputeSeasonElo(db, FieldValue, 'g1', 2_000_000_000_000);
    expect(Array.isArray(db._game.eloHistory)).toBe(true);
    expect(db._game.eloHistory.map((h) => h.round)).toEqual([1]); // kun runde 1 komplet
    expect(db._game.eloHistory[0].elo.A).toBeGreaterThan(db._game.eloHistory[0].elo.B);
  });
});
