import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
// Facit for sportsprofilen: skrevet af koden FØR profilen (scripts/sportprofil-golden.mjs).
import golden from './testdata/sportprofil-golden.json';
import slProgram from '../scripts/superliga-fixtures.json';
import plProgram from '../scripts/premier-league-fixtures-2627.json';
import { buildMatches } from '../src/lib/superligaSeed.js';
import { SUPERLIGA_TEAMS_2026 } from '../src/data/superligaTeams2026.js';
import { PREMIER_LEAGUE_TEAMS_2026 } from '../src/data/premierLeagueTeams2026.js';
import { goldenKampe, GOLDEN_NU_MS, makeEloDb as makeGoldenDb } from '../scripts/lib/sportprofilGolden.mjs';

const require = createRequire(import.meta.url);
const {
  recomputeGameMatchCore, recomputeSeasonElo,
  computeRanks, snapshotRoundRanks, settlePuljeBets, officielTop, puljeTipKomplet,
  gatedIds, recomputeAllPlayerTotals, rescoreAllBets, dryRunFraKald, ukendtSportFejl,
  tilHttpsFejl, omprisFraKnap, spillereTriggerenGenberegner, recalcPlayerTotal,
} = require('./gameScoring');
// Den RIGTIGE HttpsError — ikke en attrap — så oversættelsen bevises mod den
// klasse, callablen faktisk kaster.
const { HttpsError } = require('firebase-functions/v2/https');
// Combi-reglen har ét hjem. Testen henter den DERFRA, så en fremtidig dublet
// ikke kan snige sig ind bag en grøn suite.
const { combiBonus, buildRoundContext } = require('./pointOpdeling');
// Samme modul-instans, som gameScoring selv har hentet — så en prøvesport,
// der lægges i registret her, også er den, recomputeSeasonElo slår op i.
const scoring = require('./superligaScoring');

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
  // TÆLLER hentninger. Uden tælleren kunne genvejen for en gatet kamp fjernes,
  // og hver skrivning på en gatet kamp ville koste 132 læsninger for
  // Superligaen — uden at én test blev rød.
  const matchesCollection = {
    hentninger: 0,
    get: async () => {
      matchesCollection.hentninger += 1;
      return { docs: matchList.map((m) => ({ id: m.id, data: () => m })) };
    },
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
    if (ref.__player) {
      const cur = players[ref.__player] || {};
      // FAKEN SKAL SKELNE FIRESTORES TRE SKRIVE-SEMANTIKKER, ellers er QC's
      // fund (forældede rundenøgler i perRound) utestbart:
      //   merge:true    → maps DEEP-merges (en gammel nøgle overlever)
      //   mergeFields   → hvert nævnt felt erstattes HELT
      //   update        → som mergeFields over alle data-nøgler
      //   set uden opts → hele dokumentet erstattes
      if (opts && opts.merge) {
        const ud = { ...cur };
        for (const [k, v] of Object.entries(data)) {
          ud[k] = (v && typeof v === 'object' && !Array.isArray(v) && cur[k] && typeof cur[k] === 'object')
            ? { ...cur[k], ...v }
            : v;
        }
        players[ref.__player] = ud;
      } else if (opts && opts.mergeFields) {
        const ud = { ...cur };
        for (const felt of opts.mergeFields) {
          if (felt in data) ud[felt] = data[felt];
        }
        players[ref.__player] = ud;
      } else {
        players[ref.__player] = { ...data };
      }
      return;
    }
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
    if (ref.__pulje) { pulje[ref.__pulje] = { ...(pulje[ref.__pulje] || {}), ...data }; return; }
    if (ref.__alarm) { alarmer[ref.__alarm] = { ...(alarmer[ref.__alarm] || {}), ...data }; }
  };
  // tx.get skal kunne læse både queries (som har .get) og player-refs.
  const txGet = async (q) => {
    if (q && q.__player) return { exists: q.__player in players, data: () => players[q.__player] || {} };
    return q.get();
  };
  // driftAlarmer: kun nok til meldAlarm (doc.get/set med merge) og
  // loesDriftAlarmer (where(...)×3.get + batch.set med merge). Runde-puljen
  // melder og lukker alarmen `puljeFacit`; liga-puljerne rører den aldrig.
  const alarmer = {}; // id -> data
  const alarmLaesninger = { antal: 0 };
  const alarmRef = (id) => ({
    __alarm: id,
    get: async () => ({ exists: id in alarmer, data: () => alarmer[id] }),
    set: async (data) => { alarmer[id] = { ...(alarmer[id] || {}), ...data }; },
  });
  const alarmQuery = (filtre) => ({
    where: (felt, _op, val) => alarmQuery([...filtre, [felt, val]]),
    get: async () => {
      alarmLaesninger.antal += 1;
      const docs = Object.entries(alarmer)
        .filter(([, d]) => filtre.every(([f, v]) => (v === null ? d[f] == null : d[f] === v)))
        .map(([id, d]) => ({ id, ref: alarmRef(id), data: () => d }));
      return { docs, empty: docs.length === 0 };
    },
  });
  const db = {
    collection: (name) => {
      if (name === 'driftAlarmer') return { doc: (id) => alarmRef(id), where: alarmQuery([]).where };
      if (name !== 'games') throw new Error(`uventet collection ${name}`);
      return { doc: () => gameDoc };
    },
    batch: () => ({
      _ops: [],
      // update rører KUN de angivne felter — i faken udtrykt som mergeFields
      // over dem alle. Uden det ville rank-snapshotten slette spillerens total.
      update(ref, data, precondition) {
        this._ops.push({ ref, data, precondition, opts: { mergeFields: Object.keys(data) } });
      },
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
    _kampHentninger: () => matchesCollection.hentninger,
    _detalje: detalje,
    _detaljeStier: stier,
    _bets: bets,
    _preconditions: preconditions,
    _game: game,
    _pulje: pulje,
    _alarmer: alarmer,
    _alarmLaesninger: () => alarmLaesninger.antal,
  };
  return db;
}

const FieldValue = {
  serverTimestamp: () => '@ts',
  arrayUnion: (...vals) => ({ __arrayUnion: vals }),
};

// HVEM triggeren genberegner — delt med facit-prognosen (manuelFacit.js).
describe('spillereTriggerenGenberegner', () => {
  it('dem med tip på NETOP kampen — ikke resten af runden, og ikke bets uden uid', () => {
    const ud = spillereTriggerenGenberegner([
      { uid: 'a', matchId: 'm1' }, { uid: 'b', matchId: 'm2' }, { uid: 'a', matchId: 'm1' },
      { matchId: 'm1' }, { uid: 'c', matchId: 'm1' }, null,
    ], 'm1');
    expect([...ud].sort()).toEqual(['a', 'c']);
    expect(spillereTriggerenGenberegner([], 'm1').size).toBe(0);
  });
});

// KENDT HUL — DOKUMENTERER NUVÆRENDE ADFÆRD, SKAL RETTES I EN EGEN PR.
//
// Combi-bonussen har intet kuponkrav (pointOpdeling.combiPerRunde: "Har man
// glemt et tip, tæller den kamp bare ikke med"). En spiller UDEN tip på
// rundens sidste kamp får altså også combi, når runden bliver afgjort. Men
// recomputeGameMatchCore genberegner kun spillereTriggerenGenberegner(bets
// på kampen) — så hans bonus kommer først, når noget andet genberegner ham
// (et facit på en af hans egne kampe, 🔄 Genberegn point, puljeafregningen).
//
// Testen er en test af NUVÆRENDE adfærd, ikke en it.todo: den bliver RØD den
// dag, triggeren rettes, og skal da vendes bevidst (CLAUDE.md: "En test kan
// fastfryse en fejl" — her er den fastfrosset MED VILJE og med navn).
// Facit-prognosen siger det samme til admin (manuelFacit.pointPrognose: `senere`).
describe('recomputeGameMatchCore — KENDT HUL: combi til spillere uden tip på kampen', () => {
  const O = { 1: 2.0, X: 3.5, 2: 4.0 };
  const kampe = () => [
    { id: 'k1', round: 1, result: '1', homeGoals: 1, awayGoals: 0, odds: O, kickoff: 1 },
    { id: 'k2', round: 1, result: '1', homeGoals: 2, awayGoals: 0, odds: O, kickoff: 1 },
    { id: 'k3', round: 1, result: '2', homeGoals: 0, awayGoals: 1, odds: O, kickoff: 1 },
  ];
  const bets = () => [
    // d: ramte k2 og k3, INTET tip på k1 (rundens sidste kamp)
    { uid: 'd', matchId: 'k2', pick: '1', points: 2 },
    { uid: 'd', matchId: 'k3', pick: '2', points: 4 },
    // e: tippede k1 og k2
    { uid: 'e', matchId: 'k1', pick: '1', points: 0 },
    { uid: 'e', matchId: 'k2', pick: '1', points: 2 },
  ];

  it('facit på k1 genberegner e — men IKKE d, selv om d\'s combi nu er afgjort', async () => {
    const db = makeDb(bets(), kampe(), { name: 'SL' }, { d: { totalPoints: 6 } });
    const res = await recomputeGameMatchCore(db, FieldValue, 'g1', 'k1', { result: '1', odds: O, round: 1 });
    expect(res.players).toBe(1);
    expect(db._players.e.opdeling.combi).toBe(4);
    // d står med sine 6 point (2 + 4) uden combi — DET er hullet. (Runde-
    // snapshottet sætter hans rang, men regner ikke hans point om.)
    expect(db._players.d.totalPoints).toBe(6);
    expect(db._players.d.opdeling).toBeUndefined();
    expect(res.roundCompleted).toBe(1);
  });

  it('…og d\'s combi ER der, så snart noget genberegner ham (beviset for, at den mangler)', async () => {
    const db = makeDb(bets(), kampe(), { name: 'SL' }, { d: { totalPoints: 6 } });
    await recalcPlayerTotal(db, FieldValue, 'g1', 'd', buildRoundContext(kampe()), new Set());
    expect(db._players.d.opdeling.combi).toBe(5.7);
    expect(db._players.d.totalPoints).toBe(11.7);
  });
});

describe('recomputeGameMatchCore', () => {
  it('scorer bets og gulver spillerens total (ingen negativ saldo)', async () => {
    // Point følger kampens odds (træf-bonussen er 0).
    // A: pick X rammer facit X → 3.0 (odds X) base, + chance 8@3.0 = +16 → 19.
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
    expect(db._players.A.totalPoints).toBe(19);
    expect(db._players.B.totalPoints).toBe(0); // −5 gulvet til 0
    expect(db._players.C).toBeUndefined();     // ikke berørt
  });

  it('skriver ikke på bets hvis pointtallet er uændret', async () => {
    const db = makeDb([
      // DEFAULT_POINTS.X (4) — kampen har ingen odds i denne db, bonus er 0.
      { uid: 'A', matchId: 'm1', pick: 'X', chanceStake: 0, points: 4 }, // allerede korrekt
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
      { uid: 'A', matchId: 'm1', pick: 'X', chanceStake: 0, points: 4 },
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
    expect(db._players.A.opdeling).toEqual({ p1x2: 3, chance: 0, combi: 0, pulje: 0 });
    // Runde-vektoren er LIGAERNES eneste grundlag. Uden denne assertion kunne
    // `perRound` fjernes fra skrivningen med hele suiten grøn — og enhver liga
    // med startrunde ville stå som "ikke klar" for alle, tavst.
    expect(db._players.A.perRound).toEqual({ 1: 3 });
    expect(db._players.A.totalPoints).toBe(3);
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
    expect(db._detalje.A.kampe.m1).toEqual({ pick: 'X', points: 7, chanceStake: 2 });
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
    expect(db._players.A.totalPoints).toBe(3);
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
      { uid: 'A', matchId: 'm1', pick: '1', chanceStake: 0, points: 2 }, // ramt (odds 2,0), allerede scoret
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
      { uid: 'A', matchId: 'm1', pick: '1', chanceStake: 0, points: 2 }, // allerede scoret (odds 2,0)
      { uid: 'A', matchId: 'm2', pick: 'X', chanceStake: 0, points: 0 }, // scores nu
      { uid: 'B', matchId: 'm1', pick: '1', chanceStake: 0, points: 2 },
    ], matches);
    const res = await recomputeGameMatchCore(db, FieldValue, 'g1', 'm2', {
      result: 'X', odds: { 1: 2, X: 3.0, 2: 4 }, round: 1,
    });
    expect(res.rescored).toBe(1);              // kun A's m2-bet ændrede sig
    // A: 2 (m1 = odds 2,0) + 3 (m2 = odds 3,0) + 4,9 (combi = 2·√(2,0×3,0)) = 9,9
    expect(db._players.A.totalPoints).toBe(9.9);
    expect(db._players.A.roundBonus).toBe(4.9);
    // B rørt ikke (ingen bet på m2) → ingen genberegning
    expect(db._players.B).toBeUndefined();
  });
});

describe('gatedIds (kampe før spillets startrunde)', () => {
  it('uden gate: tom mængde', () => {
    expect(gatedIds([{ id: 'm1', round: 1, kickoff: 100 }], null).size).toBe(0);
    expect(gatedIds([{ id: 'm1', round: 1, kickoff: 100 }], {}).size).toBe(0);
  });

  it('gater HELE runder under startrunden', () => {
    const kampe = [
      { id: 'm1', round: 1, kickoff: 100 },
      { id: 'm2', round: 2, kickoff: 500 },
      { id: 'm3', round: 2, kickoff: 900 },
      { id: 'm4', round: 3, kickoff: 1300 },
    ];
    expect([...gatedIds(kampe, { startRound: 2 })]).toEqual(['m1']);
    expect([...gatedIds(kampe, { startRound: 3 })]).toEqual(['m1', 'm2', 'm3']);
  });

  // BÆRENDE — HELE GRUNDEN TIL, AT GATEN BLEV LAVET OM.
  //
  // Superligaens runde 3 spilles 7.-10. august bortset fra to kampe, der
  // ligger 2.-3. september — altså efter hele runde 4, 5 og 6. Formen her er
  // afskrevet derfra. Med den GAMLE dato-gate midt i spændet blev runden
  // skåret over: de to sene kampe talte, de fire tidlige gjorde ikke, og
  // combi-kuponen blev bygget af de to. `roundComboBonus` er uafhængig af
  // kuponens størrelse, så der ville blive udbetalt en helt normal
  // to-kamps-combi på en halv runde.
  it('kan ikke skære en runde over, uanset hvornår kampene ligger', () => {
    const spredt = [
      { id: 'r3a', round: 3, kickoff: 700 }, { id: 'r3b', round: 3, kickoff: 710 },
      { id: 'r3c', round: 3, kickoff: 720 }, { id: 'r3d', round: 3, kickoff: 730 },
      { id: 'r3e', round: 3, kickoff: 9000 }, { id: 'r3f', round: 3, kickoff: 9100 },
      { id: 'r4a', round: 4, kickoff: 1400 }, { id: 'r4b', round: 4, kickoff: 1410 },
    ];
    // Uanset hvilken startrunde man vælger, er runde 3 enten HELT med…
    expect([...gatedIds(spredt, { startRound: 3 })]).toEqual([]);
    // …eller HELT ude. Aldrig fire ude og to med.
    const uden3 = [...gatedIds(spredt, { startRound: 4 })];
    expect(uden3).toEqual(['r3a', 'r3b', 'r3c', 'r3d', 'r3e', 'r3f']);
    expect(uden3).toHaveLength(6);
  });

  // OVERGANGEN. Spil, der endnu ikke har fået et `startRound`, skal gate
  // præcis som før — ellers ville en udrulning lukke runde 1 op for point.
  it('falder tilbage på det gamle startAt og oversætter det til en runde', () => {
    const kampe = [
      { id: 'm1', round: 1, kickoff: 100 },
      { id: 'm2', round: 2, kickoff: 500 },
      { id: 'm3', round: 2, kickoff: 900 },
    ];
    // 500 er PÅ runde 2's første kamp → runde 2 er startrunden, runde 1 gates.
    expect([...gatedIds(kampe, { startAt: 500 })]).toEqual(['m1']);
    // Et sekund senere peger på runde 2 ENDNU, fordi runden ikke kan skæres
    // over — hele runde 2 ryger ud først ved en dato efter dens sidste kamp.
    expect([...gatedIds(kampe, { startAt: 501 })]).toEqual(['m1', 'm2', 'm3']);
  });

  it('lader startRound vinde over et gammelt startAt', () => {
    const kampe = [{ id: 'm1', round: 1, kickoff: 100 }, { id: 'm2', round: 2, kickoff: 500 }];
    expect([...gatedIds(kampe, { startAt: 500, startRound: 1 })]).toEqual([]);
  });

  // En kamp uden rundenummer gates ALDRIG. `null < 2` er sandt i JavaScript og
  // `undefined < 2` er falsk — to forskellige svar på det samme spørgsmål.
  it('rører aldrig en kamp uden rundenummer', () => {
    const kampe = [
      { id: 'ingen', kickoff: 10 }, { id: 'null', round: null, kickoff: 20 },
      { id: 'm2', round: 2, kickoff: 500 },
    ];
    expect([...gatedIds(kampe, { startRound: 5 })]).toEqual(['m2']);
  });
});

// GENVEJEN FOR EN GATET KAMP. Står `startRound` på spillet, kan spørgsmålet
// besvares af kampens eget rundenummer — uden at læse hele kamplisten. Uden
// den ville hver skrivning på en gatet kamp koste ét opslag over ALLE spillets
// kampe (132 for Superligaen), hvor den før kostede nul.
// ---------------------------------------------------------------------------
// SELVE DET NYE FELT VAR ALDRIG SAT I EN SERVER-FIXTURE.
//
// Test Manager fik alle tre server-stier til at IGNORERE `game.startRound`
// fuldstændigt — `{ ...gameSnap.data(), startRound: undefined }` — med alle 351
// tests grønne. Grunden: hver eneste gate-fixture herunder brugte
// `{ startAt: 500 }`, altså kun fald-tilbage-stien. Feltet, hele ændringen
// findes for, blev aldrig sat på et spil-dokument på serveren.
//
// Fixturerne her sætter `startRound` DIREKTE og har ingen `startAt`, så de kun
// kan bestå, hvis feltet rent faktisk læses.
// ---------------------------------------------------------------------------
describe('startRound gater på serveren — uden nogen startdato', () => {
  const KAMPE = [
    { id: 'r1a', round: 1, kickoff: 100, result: '1', odds: { 1: 2, X: 3, 2: 4 } },
    { id: 'r1b', round: 1, kickoff: 150, result: 'X', odds: { 1: 2, X: 3, 2: 4 } },
    { id: 'r2a', round: 2, kickoff: 500, result: '1', odds: { 1: 2, X: 3, 2: 4 } },
  ];
  const BETS = [
    { uid: 'A', matchId: 'r1a', pick: '1', chanceStake: 0, points: 2 },
    { uid: 'A', matchId: 'r1b', pick: 'X', chanceStake: 0, points: 3 },
    { uid: 'A', matchId: 'r2a', pick: '1', chanceStake: 0, points: 2 },
  ];

  it('trigger-stien scorer ikke en kamp i en gatet runde', async () => {
    const db = makeDb(BETS, KAMPE, { startRound: 2 });
    const res = await recomputeGameMatchCore(db, FieldValue, 'g1', 'r1a', KAMPE[0]);
    expect(res.gated).toBe(true);
    expect(res.rescored).toBe(0);
    expect(Object.keys(db._players)).toHaveLength(0);
  });

  it('trigger-stien scorer en kamp FRA startrunden', async () => {
    const db = makeDb(BETS, KAMPE, { startRound: 2 });
    const res = await recomputeGameMatchCore(db, FieldValue, 'g1', 'r2a', KAMPE[2]);
    expect(res.gated).toBeUndefined();
    // Kun runde 2's bet tæller: 2 point. Ignoreredes startRound, ville
    // runde 1's fem point komme med, og totalen blive 7.
    expect(db._players.A.totalPoints).toBe(2);
  });

  it('recomputeAllPlayerTotals holder de gatede runders point ude', async () => {
    const db = makeDb(BETS, KAMPE, { startRound: 2 }, { A: { totalPoints: 7 } });
    const ud = await recomputeAllPlayerTotals(db, FieldValue, 'g1');
    expect(ud.gatedMatches).toBe(2);
    expect(db._players.A.totalPoints).toBe(2);
  });

  it('…og tager dem MED, når startrunden er 1', async () => {
    const db = makeDb(BETS, KAMPE, { startRound: 1 }, { A: { totalPoints: 0 } });
    const ud = await recomputeAllPlayerTotals(db, FieldValue, 'g1');
    expect(ud.gatedMatches).toBe(0);
    // 2 + 3 + 2 = 7, plus combi for runde 1 (begge ramt). Det afgørende er, at
    // tallet er STØRRE end de 2, gaten ved runde 2 gav.
    expect(db._players.A.totalPoints).toBeGreaterThan(2);
  });
});

// `rescoreAllBets` skriver point i HVER spillers bets. Docblokken påstår, at
// gatede kampe "springes over, præcis som recomputeGameMatchCore gør" — men
// den påstand var utestet: gaten kunne erstattes med et tomt sæt med hele
// suiten grøn, og så ville en bagfyldning give point for runder, spillet ikke
// tæller.
// ---------------------------------------------------------------------------
// FORÆLDEDE RUNDENØGLER MÅ IKKE OVERLEVE.
//
// QC's fund: perRound blev skrevet med merge:true, som DEEP-merger maps. En
// rundenøgle, der forsvandt fra den nye vektor — et facit fjernet (en kamp
// omscoret til 0 BEHOLDER nu sin nøgle med 0) — blev stående, og ligaens total
// indeholdt tavst point,
// spillet ikke længere havde. QC målte det i miniature: spillets total 0,
// ligaens 3,5. Derfor mergeFields, og derfor denne test.
// ---------------------------------------------------------------------------
describe('recalcPlayerTotal — perRound erstattes helt', () => {
  it('fjerner en rundenøgle, der ikke længere har point bag sig', async () => {
    const KAMPE = [
      // Runde 3's kamp har MISTET sit facit (understøttet sti); runde 4 står.
      { id: 'r3', round: 3, kickoff: 100, result: null, odds: { 1: 2, X: 3, 2: 4 } },
      { id: 'r4', round: 4, kickoff: 200, result: '1', odds: { 1: 2, X: 3, 2: 4 } },
    ];
    const db = makeDb(
      [
        { uid: 'A', matchId: 'r3', pick: '1', chanceStake: 0, points: 0 },
        { uid: 'A', matchId: 'r4', pick: '1', chanceStake: 0, points: 2 },
      ],
      KAMPE,
      {},
      // Den GAMLE vektor fra dengang runde 3 havde facit.
      { A: { totalPoints: 5.5, perRound: { 3: 3.5, 4: 2 } } },
    );
    await recomputeAllPlayerTotals(db, FieldValue, 'g1');
    // Nøglen '3' skal være VÆK — ikke stå tilbage med 3,5. Med merge:true
    // ville den overleve, og en liga fra runde 3 ville tælle den med.
    expect(db._players.A.perRound['3']).toBeUndefined();
    expect(db._players.A.perRound[3]).toBeUndefined();
    expect(Number(db._players.A.perRound['4'] ?? db._players.A.perRound[4])).toBe(2);
    expect(db._players.A.totalPoints).toBe(2);
  });

  // Test Manager: ledningen mellem opdelPoint og spiller-dokumentet var ubundet.
  // opdelPoint-testene beviser, at funktionen RETURNERER en 0-nøgle — men det er
  // `players/{uid}.perRound`, fladen læser. Et filter på `perRound: o.perRunde`
  // (gameScoring.js, tx.set) kunne smide nullerne væk igen med hele
  // platform-suiten grøn, og ejerens «–» var tilbage uden at nogen test så det.
  it('en kamp omscoret til 0 BEHOLDER sin nøgle — med 0: hverken det gamle tal eller væk', async () => {
    // Facit rettet fra '1' til 'X': A's tip '1' gav 3,5 og giver nu 0. Nøglen skal
    // stå som 0 (afgjort tip, ramte forbi) — ikke som 3,5 (mergeFields erstatter
    // hele feltet) og ikke fjernet (så ville fladen vise «–» i stedet for «0»).
    const KAMPE = [
      { id: 'r3', round: 3, kickoff: 100, result: 'X', odds: { 1: 2, X: 3, 2: 4 } },
      { id: 'r4', round: 4, kickoff: 200, result: '1', odds: { 1: 2, X: 3, 2: 4 } },
    ];
    const db = makeDb(
      [
        { uid: 'A', matchId: 'r3', pick: '1', chanceStake: 0, points: 0 },
        { uid: 'A', matchId: 'r4', pick: '1', chanceStake: 0, points: 2 },
      ],
      KAMPE,
      {},
      { A: { totalPoints: 5.5, perRound: { 3: 3.5, 4: 2 } } },
    );
    await recomputeAllPlayerTotals(db, FieldValue, 'g1');
    expect(db._players.A.perRound).toEqual({ 3: 0, 4: 2 });
    expect(db._players.A.totalPoints).toBe(2);
  });

  // opdelingPerRunde skrives SAMMEN med perRound og erstattes helt (mergeFields):
  // en forsvundet rundenøgle i den ene skal også forsvinde i den anden, ellers
  // viser ligaens regnskab rubrikker for en runde, vektoren ikke længere har.
  it('opdelingPerRunde skrives med PRÆCIS perRounds nøgler — og en forsvundet nøgle forsvinder også dér', async () => {
    const KAMPE = [
      { id: 'r3', round: 3, kickoff: 100, result: null, odds: { 1: 2, X: 3, 2: 4 } },
      { id: 'r4', round: 4, kickoff: 200, result: '1', odds: { 1: 2, X: 3, 2: 4 } },
    ];
    const db = makeDb(
      [
        { uid: 'A', matchId: 'r3', pick: '1', chanceStake: 0, points: 0 },
        { uid: 'A', matchId: 'r4', pick: '1', chanceStake: 0, points: 2 },
      ],
      KAMPE,
      {},
      // Den GAMLE vektor OG det gamle rubrikkort fra dengang runde 3 havde facit.
      { A: {
        totalPoints: 5.5, perRound: { 3: 3.5, 4: 2 },
        opdelingPerRunde: { 3: { p1x2: 3.5, chance: 0, combi: 0 }, 4: { p1x2: 2, chance: 0, combi: 0 } },
      } },
    );
    await recomputeAllPlayerTotals(db, FieldValue, 'g1');
    expect(Object.keys(db._players.A.opdelingPerRunde)).toEqual(Object.keys(db._players.A.perRound));
    expect(db._players.A.opdelingPerRunde['3']).toBeUndefined();
    expect(db._players.A.opdelingPerRunde['4']).toEqual({ p1x2: 2, chance: 0, combi: 0 });
  });
});

describe('rescoreAllBets — gaten', () => {
  const KAMPE = [
    { id: 'r1a', round: 1, kickoff: 100, result: '1', odds: { 1: 2, X: 3, 2: 4 } },
    { id: 'r2a', round: 2, kickoff: 500, result: '1', odds: { 1: 2, X: 3, 2: 4 } },
  ];
  const BETS = [
    { uid: 'A', matchId: 'r1a', pick: '1', chanceStake: 0, points: 0 },
    { uid: 'A', matchId: 'r2a', pick: '1', chanceStake: 0, points: 0 },
  ];

  it('skriver ikke point på en kamp i en gatet runde', async () => {
    const db = makeDb(BETS, KAMPE, { startRound: 2 });
    await rescoreAllBets(db, FieldValue, 'g1', { dryRun: false });
    const r1 = db._bets.find((b) => b.data.matchId === 'r1a');
    const r2 = db._bets.find((b) => b.data.matchId === 'r2a');
    expect(r1.data.points).toBe(0);
    expect(r2.data.points).toBeGreaterThan(0);
  });
});

describe('recomputeGameMatchCore — læser ikke kamplisten unødigt', () => {
  const KAMPE = [
    { id: 'm1', round: 1, kickoff: 100, result: 'X', odds: { 1: 2, X: 3, 2: 4 } },
    { id: 'm2', round: 2, kickoff: 500, result: null, odds: { 1: 2, X: 3, 2: 4 } },
  ];

  it('springer kamplisten over, når startRound gater kampen', async () => {
    const db = makeDb([{ uid: 'A', matchId: 'm1', pick: 'X', chanceStake: 0, points: 0 }],
      KAMPE, { startRound: 2 });
    const res = await recomputeGameMatchCore(db, FieldValue, 'g1', 'm1', KAMPE[0]);
    expect(res.gated).toBe(true);
    expect(db._kampHentninger()).toBe(0);
  });

  // …men det GAMLE startAt kan ikke oversættes til en runde ud fra én kamp,
  // så dér SKAL listen hentes. Genvejen må ikke snige sig ind dér.
  it('henter kamplisten, når gaten kun er en gammel dato', async () => {
    const db = makeDb([{ uid: 'A', matchId: 'm1', pick: 'X', chanceStake: 0, points: 0 }],
      KAMPE, { startAt: 500 });
    const res = await recomputeGameMatchCore(db, FieldValue, 'g1', 'm1', KAMPE[0]);
    expect(res.gated).toBe(true);
    expect(db._kampHentninger()).toBeGreaterThan(0);
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
    expect(db._players.A.totalPoints).toBe(3); // kun m2; m1's point gated væk
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
  // odds X = 3 → 3 point. De gemte 4 er fra den gamle regel, hvor hver ramt
  // kamp gav +1 oveni. Genberegningen skal trække dem NED igen.
  const kampe = [{ id: 'm1', round: 1, result: 'X', odds: { 1: 2, X: 3, 2: 4 }, kickoff: 1 }];

  it('tør-kørsel skriver INTET, men siger hvad der ville ske', async () => {
    const db = makeDb([{ uid: 'A', matchId: 'm1', pick: 'X', chanceStake: 0, points: 4 }], kampe);
    const res = await rescoreAllBets(db, FieldValue, 'g1', { dryRun: true });
    expect(res.dryRun).toBe(true);
    expect(res.aendrede).toBe(1);
    expect(res.delta).toBe(-1);
    expect(res.eksempler[0]).toMatchObject({ uid: 'A', foer: 4, efter: 3 });
    // Intet skrevet — hverken på bettet eller på spilleren.
    expect(db._bets[0].data.points).toBe(4);
    expect(db._players.A).toBeUndefined();
  });

  // Default SKAL være tør. Kaldes den uden argument fra en admin-knap, må den
  // ikke nå at skrive noget.
  it('tørkører som default, når dryRun udelades', async () => {
    const db = makeDb([{ uid: 'A', matchId: 'm1', pick: 'X', chanceStake: 0, points: 4 }], kampe);
    const res = await rescoreAllBets(db, FieldValue, 'g1');
    expect(res.dryRun).toBe(true);
    expect(db._bets[0].data.points).toBe(4);
  });

  it('skriver de nye point OG genberegner totalen, når dryRun er falsk', async () => {
    const db = makeDb([{ uid: 'A', matchId: 'm1', pick: 'X', chanceStake: 0, points: 4 }], kampe,
      {}, { A: { totalPoints: 4 } });
    const res = await rescoreAllBets(db, FieldValue, 'g1', { dryRun: false });
    expect(res.dryRun).toBe(false);
    expect(res.aendrede).toBe(1);
    expect(db._bets[0].data.points).toBe(3);
    // Totalen SKAL med i samme kald — ellers står stillingen på det gamle tal,
    // indtil noget andet tilfældigvis udløser en genberegning.
    expect(db._players.A.totalPoints).toBe(3);
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
      { uid: 'A', matchId: 'm1', pick: 'X', chanceStake: 0, points: 4 }, // gammel regel (3+1)
      { uid: 'A', matchId: 'm2', pick: '1', chanceStake: 0, points: 3 }, // gammel regel (2+1)
    ], flere, {}, { A: { totalPoints: 7 } });
    await rescoreAllBets(db, FieldValue, 'g1', { dryRun: false });
    expect(db._players.A.opdeling.chance).toBe(0);
    expect(db._players.A.opdeling.p1x2).toBe(5); // 3 + 2, uden bonus
  });

  // Uden preconditionen skriver rescoren sin foraeldede vaerdi ovenpaa, hvis
  // noget roerte kampen mellem laesning og commit — fx en admin, der fjerner et
  // facit midt i koerslen. Fake'en kan ikke simulere konflikten, men den kan
  // bevise, at preconditionen faktisk sendes med.
  it('skriver med lastUpdateTime som precondition', async () => {
    const db = makeDb([{ uid: 'A', matchId: 'm1', pick: 'X', chanceStake: 0, points: 4 }], kampe,
      {}, { A: { totalPoints: 4 } });
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

  // BEGGE RETNINGER. Efter at bonussen gik ned, skulle intet bet længere OP —
  // og så kunne `if (foer <= pts) continue` overleve. rescoreAllBets bruges
  // også, når en admin retter odds eller et facit, hvor point kan gå begge
  // veje, så asymmetrien lukkes her.
  it('skriver også de bets, der skal OP', async () => {
    const db = makeDb([{ uid: 'A', matchId: 'm1', pick: 'X', chanceStake: 0, points: 1 }], kampe,
      {}, { A: { totalPoints: 1 } });
    const res = await rescoreAllBets(db, FieldValue, 'g1', { dryRun: false });
    expect(res.aendrede).toBe(1);
    expect(res.delta).toBe(2);
    expect(db._bets[0].data.points).toBe(3);
  });

  it('springer de bets over, der allerede står rigtigt', async () => {
    // 3 = odds X. Står tippet allerede på den nye regels værdi, er der intet
    // at skrive — og en gentagen bagfyldning må ikke røre databasen.
    const db = makeDb([{ uid: 'A', matchId: 'm1', pick: 'X', chanceStake: 0, points: 3 }], kampe,
      {}, { A: { totalPoints: 3 } });
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
  it('en forladt spiller rangeres ikke — og skubber ikke de andre ned', async () => {
    // F har flest point, men har forladt spillet: A skal være nr. 1, ikke nr. 2.
    const db = makeDb([], [], {}, {
      F: { totalPoints: 99, forladt: true },
      A: { totalPoints: 10 },
      B: { totalPoints: 5 },
    });
    const res = await snapshotRoundRanks(db, FieldValue, 'g1');
    expect(res.ranked).toBe(2);
    expect(db._players.A).toMatchObject({ rank: 1 });
    expect(db._players.B).toMatchObject({ rank: 2 });
    expect(db._players.F.rank).toBeUndefined();
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
  // Et spil MED pulje. Fixturerne sendte før et tomt spil-dokument, og
  // afregningen kiggede aldrig på feltet — så testene beviste, at puljen blev
  // afregnet i et spil, der slet ikke havde en.
  const PULJE_SPIL = { pulje: { poolSize: 6 } };

  // 3 hold spillet færdigt: A > B > C. top-6 (slice) = [A, B, C].
  const matches = [
    { id: 'm1', home: 'A', away: 'B', homeGoals: 2, awayGoals: 0 },
    { id: 'm2', home: 'A', away: 'C', homeGoals: 1, awayGoals: 0 },
    { id: 'm3', home: 'B', away: 'C', homeGoals: 3, awayGoals: 1 },
  ];
  // PORTEN. Uden den var FLADEN eneste vagt — og fladen er ikke en vagt.
  // Sætter en admin `puljeLockAt` på et spil uden pulje (feltet blev vist for
  // alle fodboldspil), accepterer firestore.rules puljetips, og de blev
  // afregnet her mod en top-6 af Premier Leagues tabel. Bonuspoint i en liga,
  // der ikke har en pulje, én tastefejl væk.
  it('afregner IKKE i et spil uden pulje — heller ikke hvis der ligger tips', async () => {
    const db = makeDb([], matches, {}, { P1: {} }, { P1: { championship: ['A', 'B', 'C'] } });
    const res = await settlePuljeBets(db, FieldValue, 'g1', matches);
    expect(res.settled).toBe(0);
    expect(res.ingenPulje).toBe(true);
    // Tippet står urørt — hverken point eller correct er skrevet …
    expect(db._pulje.P1.points).toBeUndefined();
    expect(db._pulje.P1.correct).toBeUndefined();
    // … og spilleren har ingen bonuspoint fået.
    expect(db._players.P1?.bonusPoints).toBeUndefined();
  });

  // Et spil, der slet ikke findes, må heller ikke afregne.
  it('afregner ikke, når spil-dokumentet mangler', async () => {
    const db = makeDb([], matches, {}, { P1: {} }, { P1: { championship: ['A'] } });
    const res = await settlePuljeBets(db, FieldValue, 'g1', matches);
    expect(res.settled).toBe(0);
  });

  it('scorer pulje-tip og lægger bonusPoints i spillerens total', async () => {
    const db = makeDb([], matches, PULJE_SPIL, { P1: {}, P2: {} }, {
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
      { ...PULJE_SPIL, startAt: 500 },
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
    ], roundMatches, PULJE_SPIL, { P1: {} }, { P1: { championship: ['A'] } });

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
    const db = makeDb([], dummy, { ...PULJE_SPIL, standings }, { P1: {}, P2: {} }, {
      P1: { championship: ['A', 'B', 'C', 'D', 'E', 'F'] }, // alle 6 rigtige → 34
      P2: { championship: ['A', 'B', 'C', 'D', 'E', 'X'] }, // 5 rigtige → 20
    });
    await settlePuljeBets(db, FieldValue, 'g1', dummy);
    expect(db._pulje.P1).toMatchObject({ correct: 6, points: 34 });
    expect(db._pulje.P2).toMatchObject({ correct: 5, points: 20 });
    // SL-formen må ALDRIG få bund-felter på — dokumentet har ingen nedSize.
    expect(db._pulje.P1.nedPoints).toBeUndefined();
    expect(db._pulje.P1.nedCorrect).toBeUndefined();
  });

  // TM-fund: kampePrRunde udledes af HOLDLISTEN (teams.length/2). Mutationen
  // "tilbage til hårdkodet 6" overlevede, fordi de andre officiel-tests har 12
  // hold (12/2=6, sammenfald) ELLER en komplet stilling (hvor expectedPlayed=null
  // fra en forkert formel bare deaktiverer gaten uden at ændre resultatet).
  // Fælden lukkes med 4 hold + en UFULDSTÆNDIG-følsom formel:
  //   6 kampe (enkeltturnering, hvert hold spiller 3).
  //   Rigtig kode: kampePrRunde = 4/2 = 2 → expectedPlayed = 6/2 = 3, matcher
  //     standings' played=3 → officiel stilling GODKENDES og bruges.
  //   Mutant (=6): expectedPlayed = 6/6 = 1 → 1 !== 3 → officielTop → null →
  //     fallback til de faktiske kampe, som har en ANDEN top.
  // standings-top og egne-kampe-top er med vilje MODSATTE, så resultatet skiller.
  it('4-holds-spil: expectedPlayed udledes af holdlisten, ikke af hårdkodet 6', async () => {
    // Egne kampe: C vinder alt, D næst — så leagueTable-top-2 = [C, D].
    const kampe = [
      { id: 'k1', home: 'C', away: 'A', homeGoals: 1, awayGoals: 0 },
      { id: 'k2', home: 'C', away: 'B', homeGoals: 1, awayGoals: 0 },
      { id: 'k3', home: 'C', away: 'D', homeGoals: 1, awayGoals: 0 },
      { id: 'k4', home: 'D', away: 'A', homeGoals: 1, awayGoals: 0 },
      { id: 'k5', home: 'D', away: 'B', homeGoals: 1, awayGoals: 0 },
      { id: 'k6', home: 'A', away: 'B', homeGoals: 1, awayGoals: 0 },
    ];
    // Officiel stilling: MODSAT — top-2 = [A, B]. Alle på played=3.
    const standings = [
      { rank: 1, teamName: 'A', played: 3 }, { rank: 2, teamName: 'B', played: 3 },
      { rank: 3, teamName: 'C', played: 3 }, { rank: 4, teamName: 'D', played: 3 },
    ];
    const db = makeDb([], kampe, {
      teams: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }],
      standings, pulje: { poolSize: 2 }, // officiel facit-kilde (default)
    }, { P1: {} }, { P1: { championship: ['A', 'B'] } }); // tipper OFFICIEL top
    await settlePuljeBets(db, FieldValue, 'g1', kampe);
    // Rigtig kode bruger den officielle top [A,B] → 2 rigtige.
    // Mutanten (=6) falder tilbage på egne kampe [C,D] → 0 rigtige.
    expect(db._pulje.P1).toMatchObject({ correct: 2 });
  });

  // --- PL-formen (#8): top + bund, facit af spillets EGNE kampe --------------
  // 4 hold, alle indbyrdes kampe spillet: A 9p, B 6p, C 3p, D 0p.
  // Konfiguration: top 2, bund 1, 4 point pr. hold, 10 i perfekt-bonus.
  const PL_HOLD = [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }];
  const PL_SPIL = {
    teams: PL_HOLD,
    pulje: { poolSize: 2, nedSize: 1, perTeam: 4, perfectBonus: 10, facitKilde: 'egneKampe', tabelDeling: false },
  };
  const plKampe = [
    { id: 'p1', home: 'A', away: 'B', homeGoals: 1, awayGoals: 0 },
    { id: 'p2', home: 'A', away: 'C', homeGoals: 2, awayGoals: 0 },
    { id: 'p3', home: 'A', away: 'D', homeGoals: 3, awayGoals: 0 },
    { id: 'p4', home: 'B', away: 'C', homeGoals: 1, awayGoals: 0 },
    { id: 'p5', home: 'B', away: 'D', homeGoals: 2, awayGoals: 0 },
    { id: 'p6', home: 'C', away: 'D', homeGoals: 1, awayGoals: 0 },
  ];

  it('PL-formen: scorer top OG bund hver for sig, og bonusPoints er summen', async () => {
    const db = makeDb([], plKampe, PL_SPIL, { P1: {}, P2: {} }, {
      P1: { championship: ['A', 'B'], relegation: ['D'] }, // 2/2 + bonus = 18; bund 1/1 + bonus = 14
      P2: { championship: ['A', 'C'], relegation: ['C'] }, // 1 rigtig = 4; bund 0 = 0
    });
    const res = await settlePuljeBets(db, FieldValue, 'g1', plKampe);
    expect(res.settled).toBe(2);
    expect(db._pulje.P1).toMatchObject({ correct: 2, points: 18, nedCorrect: 1, nedPoints: 14 });
    expect(db._pulje.P2).toMatchObject({ correct: 1, points: 4, nedCorrect: 0, nedPoints: 0 });
    expect(db._players.P1.bonusPoints).toBe(32); // 18 + 14 — facit-kortet splitter, summen bor her
    expect(db._players.P2.bonusPoints).toBe(4);

    // Idempotens: samme tal ved gen-afregning (rettet facit → ny kørsel).
    await settlePuljeBets(db, FieldValue, 'g1', plKampe);
    expect(db._pulje.P1).toMatchObject({ correct: 2, points: 18, nedCorrect: 1, nedPoints: 14 });
    expect(db._players.P1.bonusPoints).toBe(32);
  });

  // QC-fund: 'egneKampe' må ALDRIG falde tilbage på standings. Et halvsæson-
  // spil (PL-efterår) kan i foråret stå med en KOMPLET officiel stilling i en
  // anden rækkefølge — en genafregning måtte ikke tavst overskrive december-
  // resultatet. Båndet her: standings siger det OMVENDTE af egne kampe.
  it("'egneKampe' rører aldrig standings — selv en komplet officiel stilling ignoreres", async () => {
    const omvendt = ['D', 'C', 'B', 'A'].map((name, i) => ({ rank: i + 1, teamName: name, played: 3 }));
    const db = makeDb([], plKampe, { ...PL_SPIL, standings: omvendt }, { P1: {} }, {
      P1: { championship: ['A', 'B'], relegation: ['D'] },
    });
    await settlePuljeBets(db, FieldValue, 'g1', plKampe);
    // Efter egne kampe er A/B toppen og D bunden — standings ville sige det modsatte.
    expect(db._pulje.P1).toMatchObject({ correct: 2, points: 18, nedCorrect: 1, nedPoints: 14 });
  });

  // --- Runde-puljen (semifinalisterne, håndbold-VM): facit = holdene i en fase -
  //
  // Det gamle kriterium "alle kampe har mål" er FORKERT her i begge retninger:
  // efter kvartfinalerne har alle oprettede kampe mål, før semifinalerne er
  // lagt ind — og så ville puljen blive afregnet mod en TABEL over turneringen.
  const SF_FASER = [
    { navn: 'Kvartfinaler', bestemt: 'Kvartfinalerne', fra: 1, til: 2, start: '2027-01-27', knockout: true, antalKampe: 4 },
    { navn: 'Semifinaler', bestemt: 'Semifinalerne', fra: 3, til: 3, start: '2027-01-29', knockout: true, antalKampe: 2 },
  ];
  const SF_SPIL = { faser: SF_FASER, pulje: { poolSize: 4, facitKilde: 'runde', facitFase: 'Semifinaler' } };
  const kv = (id, round, home, away, hg, ag) => ({ id, round, home, away, homeGoals: hg, awayGoals: ag });
  // Kvartfinalerne: DK, FR, SE og HR vinder. NO taber men scorer flest mål,
  // så en beregnet tabel ville sætte NO i toppen — og det må den aldrig.
  const KVART = [
    kv('q1', 1, 'DK', 'NO', 31, 30), kv('q2', 1, 'FR', 'ES', 25, 20),
    kv('q3', 2, 'SE', 'DE', 27, 26), kv('q4', 2, 'HR', 'NO', 24, 40),
  ];
  const SEMI = [kv('s1', 3, 'DK', 'FR', null, null), kv('s2', 3, 'SE', 'HR', null, null)];

  it("'runde': afregner IKKE efter kvartfinalerne, selv om hver kamp har mål", async () => {
    const db = makeDb([], KVART, SF_SPIL, { P1: {} }, { P1: { championship: ['DK', 'FR', 'SE', 'HR'] } });
    const res = await settlePuljeBets(db, FieldValue, 'g1', KVART);
    expect(res.settled).toBe(0);
    expect(db._pulje.P1.points).toBeUndefined();
    expect(db._players.P1?.bonusPoints).toBeUndefined();
  });

  it("'runde': afregner, så snart semifinalerne er lagt ind — før de er spillet", async () => {
    const alle = [...KVART, ...SEMI];
    const db = makeDb([], alle, SF_SPIL, { P1: {}, P2: {} }, {
      P1: { championship: ['DK', 'FR', 'SE', 'HR'] }, // 4 × 4 + 10 = 26
      P2: { championship: ['DK', 'NO', 'ES', 'DE'] }, // 1 × 4 = 4 — NO stod øverst i en tabel
    });
    const res = await settlePuljeBets(db, FieldValue, 'g1', alle);
    expect(res.settled).toBe(2);
    expect(db._pulje.P1).toMatchObject({ correct: 4, points: 26 });
    expect(db._pulje.P2).toMatchObject({ correct: 1, points: 4 });
    expect(db._players.P1.bonusPoints).toBe(26);
    // Ingen bund-felter på en runde-pulje.
    expect(db._pulje.P1.nedPoints).toBeUndefined();
  });

  it("'runde': en HALV semifinale-dag afregner intet", async () => {
    const alle = [...KVART, SEMI[0]];
    const db = makeDb([], alle, SF_SPIL, { P1: {} }, { P1: { championship: ['DK', 'FR', 'SE', 'HR'] } });
    expect((await settlePuljeBets(db, FieldValue, 'g1', alle)).settled).toBe(0);
    expect(db._pulje.P1.points).toBeUndefined();
  });

  it("'runde': et semifinalehold, der mangler, afregner intet", async () => {
    const alle = [...KVART, SEMI[0], { ...SEMI[1], away: '' }];
    const db = makeDb([], alle, SF_SPIL, { P1: {} }, { P1: { championship: ['DK', 'FR', 'SE', 'HR'] } });
    expect((await settlePuljeBets(db, FieldValue, 'g1', alle)).settled).toBe(0);
  });

  it("'runde': en fase, kalenderen ikke kender, afregner aldrig — og siger det i loggen", async () => {
    const alle = [...KVART, ...SEMI];
    const spil = { ...SF_SPIL, pulje: { ...SF_SPIL.pulje, facitFase: 'Ottendedele' } };
    const db = makeDb([], alle, spil, { P1: {} }, { P1: { championship: ['DK', 'FR', 'SE', 'HR'] } });
    const fejl = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect((await settlePuljeBets(db, FieldValue, 'g1', alle)).settled).toBe(0);
      expect(fejl).toHaveBeenCalledWith(expect.stringContaining('fasen «Ottendedele» findes ikke i kalenderen'));
    } finally {
      fejl.mockRestore();
    }
  });

  // Liga-puljen må IKKE begynde at bruge fase-kriteriet. Et SL-spil med en
  // (fejlagtig) kalender og "semifinaler" i runde 3 afregnes stadig først,
  // når ALLE kampe har mål.
  it('liga-puljen afregner stadig først, når alle kampe har mål — også med en kalender', async () => {
    const alle = [...KVART, ...SEMI];
    const db = makeDb([], alle, { faser: SF_FASER, pulje: { poolSize: 4 } }, { P1: {} }, { P1: { championship: ['DK'] } });
    expect((await settlePuljeBets(db, FieldValue, 'g1', alle)).settled).toBe(0);
  });

  // --- Tør-kørsel og alarm (modstander-fund R4) ------------------------------
  // Knappen «🎖️ Afregn puljen» (afregnPuljeNu) kalder settlePuljeBets med
  // dryRun først. Tør-kørslen regner ALT og skriver INTET.
  const SEMI_START = Date.parse('2027-01-29T12:00:00Z');
  const EFTER_SEMI = Date.parse('2027-01-31T12:00:00Z');
  const TO_TIP = {
    P1: { championship: ['DK', 'FR', 'SE', 'HR'] }, // 26
    P2: { championship: ['DK', 'NO', 'ES', 'DE'] }, // 4
  };

  it('tør-kørsel: regner facit og point — og skriver hverken tip, spillere eller alarm', async () => {
    const alle = [...KVART, ...SEMI];
    const db = makeDb([], alle, SF_SPIL, { P1: {}, P2: {} }, TO_TIP);
    const res = await settlePuljeBets(db, FieldValue, 'g1', alle, { dryRun: true, nowMs: SEMI_START });
    expect(res).toEqual({
      settled: 0, dryRun: true, kanAfregnes: true, aarsag: null, fejl: [],
      facit: ['DK', 'FR', 'SE', 'HR'], tip: 2, point: 30,
    });
    expect(db._pulje.P1.points).toBeUndefined();
    expect(db._players.P1.bonusPoints).toBeUndefined();
    expect(db._alarmer).toEqual({});
    expect(db._alarmLaesninger()).toBe(0);
  });

  it('tør-kørsel uden facit: siger hvorfor — og melder INGEN alarm', async () => {
    const dublet = [...KVART, SEMI[0], { ...SEMI[1], home: 'DK' }];
    const db = makeDb([], dublet, SF_SPIL, { P1: {} }, { P1: TO_TIP.P1 });
    const fejl = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const res = await settlePuljeBets(db, FieldValue, 'g1', dublet, { dryRun: true, nowMs: SEMI_START });
      expect(res).toEqual({
        settled: 0, dryRun: true, kanAfregnes: false, aarsag: 'DK står i to kampe i «Semifinaler»',
        fejl: ['DK står i to kampe i «Semifinaler»'], facit: null, tip: 0, point: 0,
      });
      expect(db._alarmer).toEqual({});
    } finally { fejl.mockRestore(); }
    // Ingen fejl, bare ikke lagt ind endnu: årsagen siger det med fasens ord.
    const db2 = makeDb([], KVART, SF_SPIL, { P1: {} }, { P1: TO_TIP.P1 });
    expect((await settlePuljeBets(db2, FieldValue, 'g1', KVART, { dryRun: true, nowMs: SEMI_START })).aarsag)
      .toBe('semifinalerne er ikke lagt ind endnu');
  });

  it('fasen lagt forkert ind: console.error OG drift-alarmen puljeFacit — der lukkes, når den er rettet', async () => {
    const dublet = [...KVART, SEMI[0], { ...SEMI[1], home: 'DK' }];
    const db = makeDb([], dublet, { ...SF_SPIL, name: 'Håndbold-VM 2027' }, { P1: {} }, { P1: TO_TIP.P1 });
    const fejl = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(await settlePuljeBets(db, FieldValue, 'g1', dublet, { nowMs: SEMI_START })).toEqual({ settled: 0 });
      expect(fejl).toHaveBeenCalledWith(expect.stringContaining('DK står i to kampe i «Semifinaler»'));
    } finally { fejl.mockRestore(); }
    const alarm = db._alarmer.g1_puljeFacit;
    expect(alarm).toMatchObject({ type: 'puljeFacit', gameId: 'g1', titel: 'Puljen kan ikke afgøres', loestAt: null });
    expect(alarm.besked).toContain('«Håndbold-VM 2027» kan ikke afregnes: DK står i to kampe i «Semifinaler»');
    expect(alarm.besked).toContain('🎖️ Afregn puljen under Spil-tidsplan');
    expect(db._pulje.P1.points).toBeUndefined();

    // Rettet: samme db, nu med de rigtige kampe → afregnet, og alarmen lukket.
    const rigtige = [...KVART, ...SEMI];
    expect(await settlePuljeBets(db, FieldValue, 'g1', rigtige, { nowMs: SEMI_START })).toEqual({ settled: 1 });
    expect(db._pulje.P1).toMatchObject({ correct: 4, points: 26 });
    expect(db._alarmer.g1_puljeFacit.loestAt).toBe(SEMI_START);
  });

  it('semifinalerne mangler efter deres startdag: alarm — før startdagen: ingen', async () => {
    const fejl = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const foer = makeDb([], KVART, SF_SPIL, { P1: {} }, { P1: TO_TIP.P1 });
      await settlePuljeBets(foer, FieldValue, 'g1', KVART, { nowMs: SEMI_START });
      expect(foer._alarmer).toEqual({});
      expect(fejl).not.toHaveBeenCalled();
      const efter = makeDb([], KVART, SF_SPIL, { P1: {} }, { P1: TO_TIP.P1 });
      await settlePuljeBets(efter, FieldValue, 'g1', KVART, { nowMs: EFTER_SEMI });
      expect(efter._alarmer.g1_puljeFacit.besked).toContain('kun 0 af 2 kampe er lagt ind');
    } finally { fejl.mockRestore(); }
  });

  it('konfigurationsfejlen (ukendt fase) melder også alarmen', async () => {
    const alle = [...KVART, ...SEMI];
    const spil = { ...SF_SPIL, pulje: { ...SF_SPIL.pulje, facitFase: 'Ottendedele' } };
    const db = makeDb([], alle, spil, { P1: {} }, { P1: TO_TIP.P1 });
    const fejl = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await settlePuljeBets(db, FieldValue, 'g1', alle, { nowMs: SEMI_START });
    } finally { fejl.mockRestore(); }
    expect(db._alarmer.g1_puljeFacit.besked).toContain('fasen «Ottendedele» findes ikke i kalenderen');
  });

  // ALARMEN LUKKER KUN, NÅR PULJEN KAN AFGØRES. Sletter admin dublet-
  // semifinalen, er fasen bare «ikke lagt ind endnu» — ingen fejl, men heller
  // intet facit. Lukkede alarmen dér, stod Drift-fanen grøn over en pulje,
  // der stadig ikke kan afregnes (TM-fund: `rundePulje && plan.kan` →
  // `rundePulje` overlevede).
  it('alarmen lukkes IKKE, mens puljen stadig ikke kan afgøres (dublet → slettet → før startdagen)', async () => {
    const FOER_SEMI = Date.parse('2027-01-28T12:00:00Z');
    const dublet = [...KVART, SEMI[0], { ...SEMI[1], home: 'DK' }];
    const db = makeDb([], dublet, SF_SPIL, { P1: {} }, { P1: TO_TIP.P1 });
    const fejl = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await settlePuljeBets(db, FieldValue, 'g1', dublet, { nowMs: FOER_SEMI });
      expect(db._alarmer.g1_puljeFacit.loestAt).toBeNull();
      // Dubletten slettet: KVART alene, før semifinalernes startdag.
      expect(await settlePuljeBets(db, FieldValue, 'g1', KVART, { nowMs: FOER_SEMI })).toEqual({ settled: 0 });
    } finally { fejl.mockRestore(); }
    expect(db._alarmer.g1_puljeFacit.loestAt).toBeNull();
    expect(db._pulje.P1.points).toBeUndefined();
  });

  // «uanset om der er tip» (kommentaren i settlePuljeBets) — bevist. Uden den
  // ville en alarm i et spil, hvor ingen nåede at tippe, stå for evigt.
  it('alarmen lukkes, når puljen kan afgøres — også uden ét eneste pulje-tip', async () => {
    const dublet = [...KVART, SEMI[0], { ...SEMI[1], home: 'DK' }];
    const db = makeDb([], dublet, SF_SPIL, {}, {});
    const fejl = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await settlePuljeBets(db, FieldValue, 'g1', dublet, { nowMs: SEMI_START });
    } finally { fejl.mockRestore(); }
    expect(db._alarmer.g1_puljeFacit.loestAt).toBeNull();
    expect(await settlePuljeBets(db, FieldValue, 'g1', [...KVART, ...SEMI], { nowMs: EFTER_SEMI })).toEqual({ settled: 0 });
    expect(db._alarmer.g1_puljeFacit.loestAt).toBe(EFTER_SEMI);
  });

  // QC-fund (klient bør 1): badgen under Spil-tidsplan siger «bliver aldrig
  // afregnet, før det er rettet» ved ENHVER puljeKonfigFejl — også forkert
  // poolSize og et bundspørgsmål, hvor fasens kampe ser rigtige ud. Serveren
  // afregnede før alligevel. Nu afgør en konfigurationsfejl intet, og alarmen
  // siger hvorfor.
  it('en konfigurationsfejl afregner intet — selv med fasen rigtigt lagt ind — og melder alarmen', async () => {
    const alle = [...KVART, ...SEMI];
    for (const [pulje, tekst] of [
      [{ ...SF_SPIL.pulje, poolSize: 6 }, 'puljen beder om 6 hold, men «Semifinaler» har 4 (2 kampe)'],
      [{ ...SF_SPIL.pulje, nedSize: 2 }, 'en runde-pulje har intet bundspørgsmål (nedSize skal være 0)'],
    ]) {
      const spil = { ...SF_SPIL, pulje };
      const toer = makeDb([], alle, spil, { P1: {} }, { P1: TO_TIP.P1 });
      const db = makeDb([], alle, spil, { P1: {} }, { P1: TO_TIP.P1 });
      const fejl = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        expect(await settlePuljeBets(toer, FieldValue, 'g1', alle, { dryRun: true, nowMs: SEMI_START })).toEqual({
          settled: 0, dryRun: true, kanAfregnes: false, aarsag: tekst, fejl: [tekst], facit: null, tip: 0, point: 0,
        });
        expect(await settlePuljeBets(db, FieldValue, 'g1', alle, { nowMs: SEMI_START })).toEqual({ settled: 0 });
      } finally { fejl.mockRestore(); }
      expect(db._pulje.P1.points, tekst).toBeUndefined();
      expect(db._players.P1?.bonusPoints, tekst).toBeUndefined();
      expect(db._alarmer.g1_puljeFacit.besked, tekst).toContain(tekst);
    }
  });

  // AFREGNINGEN AFHÆNGER IKKE AF ALARMEN (QC-bemærkning). Kaster Firestore i
  // driftAlarmer, skal pulje-tippene stadig afregnes — og en alarm, der ikke
  // kan meldes, må ikke vælte triggeren.
  it('kaster alarmen, afregnes puljen alligevel — og fejlen står i konsollen', async () => {
    const kaster = (db) => {
      const orig = db.collection;
      db.collection = (navn) => {
        if (navn === 'driftAlarmer') throw new Error('Firestore haltede');
        return orig(navn);
      };
      return db;
    };
    const fejl = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      // Kan afgøres → lukke-kaldet kaster.
      const db = kaster(makeDb([], [...KVART, ...SEMI], SF_SPIL, { P1: {} }, { P1: TO_TIP.P1 }));
      expect(await settlePuljeBets(db, FieldValue, 'g1', [...KVART, ...SEMI], { nowMs: SEMI_START })).toEqual({ settled: 1 });
      expect(db._pulje.P1).toMatchObject({ correct: 4, points: 26 });
      expect(db._players.P1.bonusPoints).toBe(26);
      expect(fejl).toHaveBeenCalledWith(expect.stringContaining('puljeFacit-alarmen kunne ikke skrives'), 'Firestore haltede');
      // En fejl → melde-kaldet kaster: intet at afregne, men ingen undtagelse.
      const dublet = [...KVART, SEMI[0], { ...SEMI[1], home: 'DK' }];
      const db2 = kaster(makeDb([], dublet, SF_SPIL, { P1: {} }, { P1: TO_TIP.P1 }));
      await expect(settlePuljeBets(db2, FieldValue, 'g1', dublet, { nowMs: SEMI_START })).resolves.toEqual({ settled: 0 });
    } finally { fejl.mockRestore(); }
  });

  // UDEN PULJE-TIP (TM-fund): svaret er {settled:0} — IKKE ingenPulje, der
  // betyder «spillet har ingen pulje» — og tør-kørslen siger, at ingen har
  // tippet. Gælder både en liga-pulje, en runde-pulje og et spil uden pulje.
  it('ingen pulje-tip: settled 0 uden ingenPulje, og årsagen siges i tør-kørslen', async () => {
    const SL = { pulje: { poolSize: 2 }, teams: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }] };
    const spillede = [kv('m1', 1, 'A', 'B', 2, 0), kv('m2', 1, 'C', 'D', 1, 0)];
    for (const [navn, spil, kampe] of [
      ['liga-pulje', SL, spillede],
      ['spil uden pulje', { teams: SL.teams }, spillede],
      ['runde-pulje', SF_SPIL, [...KVART, ...SEMI]],
    ]) {
      const toer = makeDb([], kampe, spil, {}, {});
      expect(await settlePuljeBets(toer, FieldValue, 'g1', kampe, { dryRun: true, nowMs: SEMI_START }), navn).toEqual({
        settled: 0, dryRun: true, kanAfregnes: true, aarsag: 'ingen har afgivet et pulje-tip', fejl: [],
        facit: null, tip: 0, point: 0,
      });
      const db = makeDb([], kampe, spil, {}, {});
      expect(await settlePuljeBets(db, FieldValue, 'g1', kampe, { nowMs: SEMI_START }), navn).toEqual({ settled: 0 });
    }
  });

  // LIGA-PULJERNE ER UÆNDREDE: samme svar som før (toEqual, ikke toMatchObject),
  // og driftAlarmer læses eller skrives ALDRIG — heller ikke ved afregning.
  it('liga-puljen: samme svar som før og ingen alarm-læsninger', async () => {
    const SL = { pulje: { poolSize: 2 }, teams: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }] };
    const spillede = [
      kv('m1', 1, 'A', 'B', 2, 0), kv('m2', 1, 'C', 'D', 1, 0),
    ];
    const uspillet = [...spillede, kv('m3', 2, 'A', 'C', null, null)];
    const db1 = makeDb([], uspillet, SL, { P1: {} }, { P1: { championship: ['A', 'C'] } });
    expect(await settlePuljeBets(db1, FieldValue, 'g1', uspillet)).toEqual({ settled: 0 });
    const db2 = makeDb([], spillede, SL, { P1: {} }, { P1: { championship: ['A', 'C'] } });
    expect(await settlePuljeBets(db2, FieldValue, 'g1', spillede)).toEqual({ settled: 1 });
    const db3 = makeDb([], spillede, { teams: SL.teams }, { P1: {} }, { P1: { championship: ['A', 'C'] } });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      expect(await settlePuljeBets(db3, FieldValue, 'g1', spillede)).toEqual({ settled: 0, ingenPulje: true });
    } finally { log.mockRestore(); }
    for (const db of [db1, db2, db3]) {
      expect(db._alarmLaesninger()).toBe(0);
      expect(db._alarmer).toEqual({});
    }
  });

  it('liga-puljen kan tørkøres: point regnes, intet skrives', async () => {
    const SL = { pulje: { poolSize: 2 }, teams: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }] };
    const spillede = [kv('m1', 1, 'A', 'B', 2, 0), kv('m2', 1, 'C', 'D', 1, 0)];
    const db = makeDb([], spillede, SL, { P1: {} }, { P1: { championship: ['A', 'C'] } });
    const res = await settlePuljeBets(db, FieldValue, 'g1', spillede, { dryRun: true });
    expect(res).toMatchObject({ settled: 0, dryRun: true, kanAfregnes: true, tip: 1 });
    expect(res.point).toBeGreaterThan(0);
    expect(db._pulje.P1.points).toBeUndefined();
  });
});

describe('puljeTipKomplet', () => {
  const SL = { poolSize: 6, nedSize: 0 };
  const PL = { poolSize: 4, nedSize: 3 };
  const seks = ['A', 'B', 'C', 'D', 'E', 'F'];

  it('SL: 6 hold er komplet — 5 er ikke, og null-konfig antager SL-form', () => {
    expect(puljeTipKomplet({ championship: seks }, SL)).toBe(true);
    expect(puljeTipKomplet({ championship: seks.slice(0, 5) }, SL)).toBe(false);
    expect(puljeTipKomplet({ championship: seks }, null)).toBe(true);
  });

  it('PL: halvt svar (kun toppen) er IKKE komplet — QC-fundet ryk-mailen skulle ramme', () => {
    expect(puljeTipKomplet({ championship: seks.slice(0, 4) }, PL)).toBe(false);
    expect(puljeTipKomplet({ championship: seks.slice(0, 4), relegation: ['X', 'Y', 'Z'] }, PL)).toBe(true);
    expect(puljeTipKomplet({ championship: seks.slice(0, 4), relegation: ['X'] }, PL)).toBe(false);
    expect(puljeTipKomplet(null, PL)).toBe(false);
  });
});

describe('officielTop', () => {
  const std = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']
    .map((name, i) => ({ rank: i + 1, teamName: name, played: 22 }));
  it('tager rank 1–6 fra den officielle stilling', () => {
    expect(officielTop(std, 22, 6, 12)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
  });
  it('returnerer null hvis stillingen ikke er helt spillet igennem', () => {
    expect(officielTop(std, 30, 6, 12)).toBeNull(); // forventer 30 spillede, har 22
  });
  it('returnerer null uden en fuld 12-holds stilling', () => {
    expect(officielTop(null, 22, 6, 12)).toBeNull();
    expect(officielTop(std.slice(0, 5), 22, 6, 12)).toBeNull();
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

// dryRun-reglen for KNAP-kald. Den er trukket ud af index.js netop for at
// kunne stå her: index.js har ingen tests, så skrevet som `!== false` inde i
// handleren kunne den vendes til `=== true` med hele suiten grøn — og så ville
// forhåndsvisnings-knappen skrive i produktionsdata ved første klik.
describe('dryRunFraKald (hvad en KNAP gør som standard)', () => {
  it('tørkører som standard — også ved tom eller manglende data', () => {
    expect(dryRunFraKald(undefined)).toBe(true);
    expect(dryRunFraKald(null)).toBe(true);
    expect(dryRunFraKald({})).toBe(true);
    expect(dryRunFraKald({ gameId: 'sl' })).toBe(true);
  });

  it('skriver KUN ved et eksplicit false', () => {
    expect(dryRunFraKald({ dryRun: false })).toBe(false);
  });

  // Alt andet end et rigtigt `false` skal tørkøre. Et felt, der kommer skævt
  // gennem callable-laget (streng i stedet for boolean), må ikke blive til en
  // skrivning, admin ikke bad om.
  it('behandler alt andet som tør-kørsel', () => {
    for (const v of ['false', 0, '', null, undefined, 'nej', NaN]) {
      expect(dryRunFraKald({ dryRun: v }), String(v)).toBe(true);
    }
  });
});

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
    expect(res).toEqual({ updated: 0, aendringer: [] });
  });

  // --- dryRun ---------------------------------------------------------------
  //
  // Knappen i Spil-tidsplan viser tør-kørslen FØRST, og hele værdien af den
  // står og falder med, at den ikke skriver. En dryRun, der alligevel skrev,
  // ville se ud som en forhåndsvisning og være en udførelse.
  it('dryRun rører HVERKEN odds, Elo eller historik', async () => {
    const db = makeEloDb({ teams }, [
      { id: 'm1', home: 'A', away: 'B', kickoff: past, result: '1' },
      { id: 'm2', home: 'A', away: 'B', kickoff: future, odds: { 1: 9, X: 9, 2: 9 } },
    ]);
    const res = await recomputeSeasonElo(db, FieldValue, 'g1', 2_000_000_000_000, { dryRun: true });
    // Den RAPPORTERER ændringen …
    expect(res.updated).toBe(1);
    expect(res.aendringer).toHaveLength(1);
    expect(res.aendringer[0].id).toBe('m2');
    expect(res.aendringer[0].foer).toEqual({ 1: 9, X: 9, 2: 9 });
    expect(res.aendringer[0].efter['1']).not.toBe(9);
    // … men skriver ingenting. Hverken på kampen …
    expect(db._matches.find((m) => m.data.id === 'm2').data.odds).toEqual({ 1: 9, X: 9, 2: 9 });
    // … eller på spil-dokumentet. eloCurrent er dét, Elo-tabellen viser, og en
    // tør-kørsel må ikke flytte den.
    expect(db._game.eloCurrent).toBeUndefined();
    expect(db._game.eloHistory).toBeUndefined();
  });

  it('uden dryRun skriver den — samme kald, modsat resultat', async () => {
    const db = makeEloDb({ teams }, [
      { id: 'm1', home: 'A', away: 'B', kickoff: past, result: '1' },
      { id: 'm2', home: 'A', away: 'B', kickoff: future, odds: { 1: 9, X: 9, 2: 9 } },
    ]);
    const res = await recomputeSeasonElo(db, FieldValue, 'g1', 2_000_000_000_000, { dryRun: false });
    expect(res.updated).toBe(1);
    expect(db._matches.find((m) => m.data.id === 'm2').data.odds['1']).not.toBe(9);
    expect(db._game.eloCurrent).toBeDefined();
  });

  // Standardværdien afgør, hvad et kald UDEN flag gør. Triggeren kalder uden
  // opts, og den SKAL skrive — ellers holder odds op med at blive opdateret,
  // uden at nogen test siger fra.
  it('skriver som standard, når opts helt udelades', async () => {
    const db = makeEloDb({ teams }, [
      { id: 'm1', home: 'A', away: 'B', kickoff: past, result: '1' },
      { id: 'm2', home: 'A', away: 'B', kickoff: future, odds: { 1: 9, X: 9, 2: 9 } },
    ]);
    await recomputeSeasonElo(db, FieldValue, 'g1', 2_000_000_000_000);
    expect(db._matches.find((m) => m.data.id === 'm2').data.odds['1']).not.toBe(9);
    expect(db._game.eloCurrent).toBeDefined();
  });

  // Kun et EKSPLICIT true tørkører. Ellers ville `{ dryRun: 'nej' }` eller et
  // felt, der kom forkert gennem callable-laget, tavst gøre skrivningen til en
  // forhåndsvisning — og admin ville tro, ændringen var landet.
  it('tørkører kun ved eksplicit true', async () => {
    for (const flag of [false, 'true', 1, null, undefined]) {
      const db = makeEloDb({ teams }, [
        { id: 'm1', home: 'A', away: 'B', kickoff: past, result: '1' },
        { id: 'm2', home: 'A', away: 'B', kickoff: future, odds: { 1: 9, X: 9, 2: 9 } },
      ]);
      await recomputeSeasonElo(db, FieldValue, 'g1', 2_000_000_000_000, { dryRun: flag });
      expect(db._matches.find((m) => m.data.id === 'm2').data.odds['1'], String(flag)).not.toBe(9);
    }
  });

  // oddsEqual-vagten. Uden den lister tør-kørslen HVER ikke-låst kamp (120 i
  // Superligaen, 380 i PL), `updated` bliver antallet af ÅBNE kampe i stedet
  // for antallet af ÆNDRINGER — og det tal er det eneste, admin bedømmer på,
  // både i knappen og i bekræftelsesdialogen. Fanges kun af en anden kørsel:
  // intet fixture havde en kamp, hvis odds allerede VAR korrekte.
  it('anden kørsel finder intet at ændre — idempotent', async () => {
    const db = makeEloDb({ teams }, [
      { id: 'm1', home: 'A', away: 'B', kickoff: past, result: '1' },
      { id: 'm2', home: 'A', away: 'B', kickoff: future, odds: { 1: 9, X: 9, 2: 9 } },
    ]);
    const foerste = await recomputeSeasonElo(db, FieldValue, 'g1', 2_000_000_000_000, { dryRun: false });
    expect(foerste.updated).toBe(1);
    const anden = await recomputeSeasonElo(db, FieldValue, 'g1', 2_000_000_000_000, { dryRun: true });
    expect(anden.updated).toBe(0);
    expect(anden.aendringer).toEqual([]);
  });

  // Kickoff-filteret skal fejle LUKKET. Stod før som `k != null && k <= nowMs`,
  // så en kamp uden brugbart kickoff blev omprist. Kender vi ikke tidspunktet,
  // ved vi heller ikke, om kampen er låst.
  it('rører ikke en kamp uden brugbart kickoff', async () => {
    for (const kickoff of [undefined, null, '', 'i morgen kl. 19', NaN]) {
      const db = makeEloDb({ teams }, [
        { id: 'm1', home: 'A', away: 'B', kickoff: past, result: '1' },
        { id: 'ukendt', home: 'A', away: 'B', kickoff, odds: { 1: 9, X: 9, 2: 9 } },
      ]);
      const res = await recomputeSeasonElo(db, FieldValue, 'g1', 2_000_000_000_000, { dryRun: false });
      expect(res.updated, String(kickoff)).toBe(0);
      expect(db._matches.find((m) => m.data.id === 'ukendt').data.odds).toEqual({ 1: 9, X: 9, 2: 9 });
    }
  });

  // KAPLØBET. nowMs fanges ved kaldets start; kampene læses derefter, og
  // batchen committer sekunder senere. Uden margen kunne et klik 18:59:58
  // skrive nye odds på en kamp med kickoff 19:00:00 — altså ændre værdien af
  // tips, der allerede var låst og ikke længere kunne rettes.
  it('holder en margen foran kickoff, så en kamp lige før start ikke omprises', async () => {
    const nu = 2_000_000_000_000;
    const db = makeEloDb({ teams }, [
      { id: 'm1', home: 'A', away: 'B', kickoff: past, result: '1' },
      { id: 'straks', home: 'A', away: 'B', kickoff: nu + 2_000, odds: { 1: 9, X: 9, 2: 9 } },
      { id: 'senere', home: 'A', away: 'B', kickoff: nu + 3_600_000, odds: { 1: 9, X: 9, 2: 9 } },
    ]);
    const res = await recomputeSeasonElo(db, FieldValue, 'g1', nu, { dryRun: false });
    expect(res.aendringer.map((a) => a.id)).toEqual(['senere']);
    expect(db._matches.find((m) => m.data.id === 'straks').data.odds).toEqual({ 1: 9, X: 9, 2: 9 });
  });

  // Forhåndsvisningens kontrakt. Tør-kørslens hele værdi er, at et menneske
  // SER ændringen — så felterne skal faktisk være der og være rigtige.
  it('rapporterer runde, holdnavne, kickoff og FØR-odds', async () => {
    const nu = 2_000_000_000_000;
    const db = makeEloDb({ teams }, [
      { id: 'm1', home: 'A', away: 'B', kickoff: past, result: '1' },
      { id: 'm2', round: 7, home: 'A', away: 'B', kickoff: nu + 3_600_000, odds: { 1: 9, X: 9, 2: 9 } },
    ]);
    const res = await recomputeSeasonElo(db, FieldValue, 'g1', nu, { dryRun: true });
    expect(res.aendringer[0]).toMatchObject({
      id: 'm2', round: 7, home: 'A', away: 'B', kickoff: nu + 3_600_000, foer: { 1: 9, X: 9, 2: 9 },
    });
    // Firestore-referencen må IKKE med ud — den kan ikke serialiseres.
    expect(res.aendringer[0].ref).toBeUndefined();
  });

  // Låsningen må IKKE kunne omgås af knappen. Det er hele grunden til at fryse
  // odds: din pointværdi må ikke ændre sig, efter kampen er gået i gang.
  it('rører ikke låste kampe, heller ikke ved manuel omprisning', async () => {
    const db = makeEloDb({ teams }, [
      { id: 'm1', home: 'A', away: 'B', kickoff: past, result: '1' },
      { id: 'laast', home: 'B', away: 'A', kickoff: past, odds: { 1: 9, X: 9, 2: 9 } },
      { id: 'aaben', home: 'A', away: 'B', kickoff: future, odds: { 1: 9, X: 9, 2: 9 } },
    ]);
    const res = await recomputeSeasonElo(db, FieldValue, 'g1', 2_000_000_000_000, { dryRun: false });
    expect(res.updated).toBe(1);
    expect(res.aendringer.map((a) => a.id)).toEqual(['aaben']);
    expect(db._matches.find((m) => m.data.id === 'laast').data.odds).toEqual({ 1: 9, X: 9, 2: 9 });
  });

  // Firestore tager højst 500 operationer pr. batch. Før knappen fandtes, blev
  // odds frisket op få ad gangen, efterhånden som resultater faldt — nu kan en
  // hel sæson omprises på ét klik. En liga med mange kampe ville vælte den
  // tavst, midt i en skrivning.
  it('deler skrivningen i flere batches over 400 kampe', async () => {
    const mange = [{ id: 'spillet', home: 'A', away: 'B', kickoff: past, result: '1' }];
    for (let i = 0; i < 950; i += 1) {
      mange.push({ id: `f${i}`, home: 'A', away: 'B', kickoff: future, odds: { 1: 9, X: 9, 2: 9 } });
    }
    const db = makeEloDb({ teams }, mange);
    const commits = [];
    const rigtigBatch = db.batch;
    db.batch = () => { const b = rigtigBatch(); commits.push(b); return b; };
    const res = await recomputeSeasonElo(db, FieldValue, 'g1', 2_000_000_000_000, { dryRun: false });
    expect(res.updated).toBe(950);
    // Ingen enkelt batch må overskride grænsen …
    for (const b of commits) expect(b._ops.length).toBeLessThanOrEqual(400);
    // … og alle 950 skal være skrevet, ikke bare de første 400.
    expect(commits.reduce((s, b) => s + b._ops.length, 0)).toBe(950);
    expect(db._matches.filter((m) => m.data.odds?.['1'] === 9)).toHaveLength(0);
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

// --- Sportsprofilen i recomputeSeasonElo --------------------------------------
//
// To ting, og de bevises hver for sig:
//   1. SL og PL er BYTE-IDENTISKE med koden før profilen — facit i
//      testdata/sportprofil-golden.json blev skrevet af den gamle kode
//      (scripts/sportprofil-golden.mjs), på hele programmet.
//   2. Funktionen bruger SPILLETS profil, både til Elo-opdateringen og de
//      friske odds. Kun en profil med andre tal end fodboldens kan vise det:
//      med fodbold alene er en glemt profil usynlig.
describe('recomputeSeasonElo bruger spillets sportsprofil', () => {
  const LIGAER = {
    sl: { fixtures: slProgram.fixtures || slProgram, teams: SUPERLIGA_TEAMS_2026 },
    pl: { fixtures: plProgram.fixtures || plProgram, teams: PREMIER_LEAGUE_TEAMS_2026 },
  };

  for (const [liga, { fixtures, teams: holdliste }] of Object.entries(LIGAER)) {
    it(`${liga}: Elo og omprisning er uændrede — uanset hvordan "fodbold" nås`, async () => {
      expect(Object.keys(golden[liga].ompris).length).toBeGreaterThan(50); // facit er ikke tomt
      for (const ekstra of [{}, { sport: 'fodbold' }, { sport: 'curling' }, { sport: '__proto__' }]) {
        const db = makeGoldenDb({ teams: holdliste, ...ekstra }, goldenKampe(buildMatches(fixtures, holdliste)));
        const res = await recomputeSeasonElo(db, FieldValue, liga, GOLDEN_NU_MS, { dryRun: false });
        const ompris = Object.fromEntries(res.aendringer.map((a) => [a.id, [a.efter['1'], a.efter.X, a.efter['2']]]));
        const historik = Object.fromEntries(db._game.eloHistory.map((h) => [String(h.round), h.elo]));
        const hvad = JSON.stringify(ekstra);
        expect(db._game.eloCurrent, hvad).toEqual(golden[liga].eloCurrent);
        expect(historik, hvad).toEqual(golden[liga].eloHistory);
        expect(ompris, hvad).toEqual(golden[liga].ompris);
      }
    });
  }

  // Et SAT, men ukendt sport (tastefejl) regnes som fodbold — serveren må ikke
  // gå i stå i drift — men det må ikke være TAVST. Advarslen skal bære spil-id
  // og den RÅ værdi, så den kan findes i Cloud-loggen.
  //
  // Prøvet med en tastefejl, et tal og et array: med 'handbold' alene var
  // mutanten "kun strenge advarer" (`typeof game.sport === 'string' &&`) grøn.
  // Arrayet ['fodbold'] skal stå som ["fodbold"] — med String(...) stod det
  // som "fodbold" i loggen, altså som den sport, det netop IKKE er. NaN og
  // Infinity skal stå som sig selv: JSON.stringify gav "null" for begge.
  //
  // Resultatet bærer INTET ukendtSport-felt. Det fandtes, men intet i
  // produktion læste det: triggeren kasserer resultatet, og knappen kaster,
  // før der er et resultat. Advarslen er triggerens signal.
  it('et ukendt sport kaster ikke, regnes som fodbold — og advarer med spil-id og RÅ værdi', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { fixtures, teams: holdliste } = LIGAER.sl;
      for (const [sport, vist] of [
        ['handbold', 'sport "handbold" —'], [123, 'sport 123 —'], [['fodbold'], 'sport ["fodbold"] —'],
        [NaN, 'sport NaN —'], [Infinity, 'sport Infinity —'],
      ]) {
        warn.mockClear();
        const db = makeGoldenDb({ teams: holdliste, sport }, goldenKampe(buildMatches(fixtures, holdliste)));
        const res = await recomputeSeasonElo(db, FieldValue, 'vm-haandbold', GOLDEN_NU_MS, { dryRun: true });
        const hvad = String(sport);
        expect(Object.keys(res).sort(), hvad).toEqual(['aendringer', 'updated']);
        expect(res.updated, hvad).toBeGreaterThan(0); // regnet videre som fodbold
        expect(warn, hvad).toHaveBeenCalledTimes(1);
        const linje = String(warn.mock.calls[0][0]);
        expect(linje, hvad).toContain('vm-haandbold');
        expect(linje, hvad).toContain(vist);
        expect(linje, hvad).not.toContain('sport null');
        expect(linje, hvad).toMatch(/ukendt sport/);
        expect(linje, hvad).toMatch(/regnes som fodbold/);
      }
      // Arrayet må ALDRIG stå som en kendt sport i loggen.
      warn.mockClear();
      const dbA = makeGoldenDb({ teams: holdliste, sport: ['fodbold'] }, goldenKampe(buildMatches(fixtures, holdliste)));
      await recomputeSeasonElo(dbA, FieldValue, 'x', GOLDEN_NU_MS, { dryRun: true });
      expect(String(warn.mock.calls[0][0])).not.toMatch(/sport "fodbold"/);

      // Manglende felt og en kendt sport advarer IKKE — ellers ville SL og PL
      // skrive en advarsel ved hvert eneste resultat, og så læser ingen den.
      // Og resultatet har så INGEN ukendtSport-nøgle.
      warn.mockClear();
      for (const ekstra of [{}, { sport: 'fodbold' }, { sport: null }]) {
        const db2 = makeGoldenDb({ teams: holdliste, ...ekstra }, goldenKampe(buildMatches(fixtures, holdliste)));
        const res2 = await recomputeSeasonElo(db2, FieldValue, 'sl', GOLDEN_NU_MS, { dryRun: true });
        expect(Object.keys(res2).sort(), JSON.stringify(ekstra)).toEqual(['aendringer', 'updated']);
      }
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  // KNAPPEN (repriceGameOdds) afviser — også i tør-kørslen. Før returnerede
  // callablen {...out, dryRun} uden et ord: tør-kørslen viste fodboldens odds
  // på et håndboldspil, som om de var rigtige, og dryRun:false skrev dem.
  describe('afvisUkendtSport (knappens vej)', () => {
    const { fixtures, teams: holdliste } = LIGAER.sl;
    const nytDb = (ekstra) => makeGoldenDb({ teams: holdliste, ...ekstra }, goldenKampe(buildMatches(fixtures, holdliste)));

    for (const dryRun of [true, false]) {
      it(`kaster failed-precondition, FØR der er regnet eller skrevet noget (dryRun: ${dryRun})`, async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
          for (const sport of ['handbold', '', 123, ['fodbold']]) {
            const db = nytDb({ sport });
            const foerKampe = JSON.stringify(db._matches.map((m) => m.data));
            let fejl = null;
            try {
              await recomputeSeasonElo(db, FieldValue, 'vm-haandbold', GOLDEN_NU_MS, { dryRun, afvisUkendtSport: true });
            } catch (e) { fejl = e; }
            const hvad = JSON.stringify(sport);
            expect(fejl, hvad).toBeInstanceOf(Error);
            expect(fejl.kode, hvad).toBe('failed-precondition');
            expect(fejl.message, hvad).toBe(ukendtSportFejl('vm-haandbold', sport).message);
            // Intet skrevet: hverken Elo på spillet eller odds på kampene.
            expect(db._game.eloCurrent, hvad).toBeUndefined();
            expect(db._game.eloHistory, hvad).toBeUndefined();
            expect(JSON.stringify(db._matches.map((m) => m.data)), hvad).toBe(foerKampe);
          }
          // Den kaster i stedet for at advare — ikke begge dele.
          expect(warn).not.toHaveBeenCalled();
        } finally {
          warn.mockRestore();
        }
      });
    }

    // Tjekket står FØR hold-tjekket: et spil uden hold gav ellers tavst
    // {updated: 0}, og fladen meldte "allerede i takt med modellen".
    it('afviser også et spil uden hold — ikke et tavst {updated: 0}', async () => {
      const db = makeGoldenDb({ teams: [], sport: 'handbold' }, []);
      await expect(recomputeSeasonElo(db, FieldValue, 'g', GOLDEN_NU_MS, { dryRun: true, afvisUkendtSport: true }))
        .rejects.toMatchObject({ kode: 'failed-precondition' });
      // … og triggerens vej på samme spil siger det i loggen (ikke i resultatet).
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        await expect(recomputeSeasonElo(db, FieldValue, 'g', GOLDEN_NU_MS, { dryRun: true }))
          .resolves.toEqual({ updated: 0, aendringer: [] });
        expect(warn).toHaveBeenCalledTimes(1);
      } finally {
        warn.mockRestore();
      }
    });

    it('en kendt sport og et manglende felt afvises IKKE — svaret er det samme som uden flaget', async () => {
      for (const ekstra of [{}, { sport: 'fodbold' }, { sport: null }]) {
        const med = await recomputeSeasonElo(nytDb(ekstra), FieldValue, 'sl', GOLDEN_NU_MS, { dryRun: true, afvisUkendtSport: true });
        const uden = await recomputeSeasonElo(nytDb(ekstra), FieldValue, 'sl', GOLDEN_NU_MS, { dryRun: true });
        expect(med, JSON.stringify(ekstra)).toEqual(uden);
        expect(med.updated).toBeGreaterThan(50);
      }
    });

    it('kun et eksplicit true afviser — et truthy ikke-boolean gør ikke', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const res = await recomputeSeasonElo(nytDb({ sport: 'handbold' }), FieldValue, 'g', GOLDEN_NU_MS, { dryRun: true, afvisUkendtSport: 'ja' });
        expect(res.updated).toBeGreaterThan(50); // regnet videre, ikke afvist
        expect(warn).toHaveBeenCalledTimes(1); // advaret som triggeren
      } finally {
        warn.mockRestore();
      }
    });
  });

  it('ukendtSportFejl: dansk besked med spil-id, RÅ værdi, de kendte sporter og at INTET er sket', () => {
    const e = ukendtSportFejl('vm-haandbold', ['fodbold']);
    expect(e).toBeInstanceOf(Error);
    expect(e.kode).toBe('failed-precondition');
    expect(e.message).toContain('Spillet "vm-haandbold"');
    expect(e.message).toContain('sport ["fodbold"]');
    expect(e.message).not.toContain('sport "fodbold"');
    expect(e.message).toContain('(kendte: fodbold, haandbold)');
    expect(e.message).toMatch(/IKKE omprist noget — heller ikke i tør-kørslen/);
    expect(e.message).toMatch(/ret det dér og kør seedGames; skal feltet væk \(fodbold\), så fjern det i Firebase-konsollen/);
    expect(ukendtSportFejl('g', 123).message).toContain('sport 123,');
    expect(ukendtSportFejl('g', '').message).toContain('sport "",');
    // JSON.stringify(NaN) og (Infinity) er "null" — et sat felt må ikke stå
    // som det, det IKKE er.
    for (const [v, vist] of [[NaN, 'sport NaN,'], [Infinity, 'sport Infinity,'], [-Infinity, 'sport -Infinity,']]) {
      expect(ukendtSportFejl('g', v).message, vist).toContain(vist);
      expect(ukendtSportFejl('g', v).message, vist).not.toContain('sport null');
    }
  });

  // En hardkodet liste ville også kunne give "kendte: fodbold, haandbold".
  // Listen skal komme af REGISTRET — så en prøvesport skal stå med.
  it('ukendtSportFejl: de kendte sporter læses af registret — en prøvesport står med', () => {
    scoring.SPORT_PROFILER.proeve = { sport: 'proeve', elo: { START: 1000, HFA: 0, K: 40, DRAW_BASE: 0.05, DRAW_DECAY: 0.2 }, odds: { min: 1.01 } };
    try {
      expect(ukendtSportFejl('g', 'handbold').message).toContain('(kendte: fodbold, haandbold, proeve)');
    } finally {
      delete scoring.SPORT_PROFILER.proeve;
    }
    expect(ukendtSportFejl('g', 'handbold').message).toContain('(kendte: fodbold, haandbold)');
  });

  // Knappens HELE vej: kaldet og oversættelsen. Før stod de i index.js og var
  // kun bevist som tekst — flyttedes kaldet UD af try'en (eller skrevet som
  // `return` uden `await`), gik den rå fejl forbi oversættelsen, og fladen
  // viste firebase's "INTERNAL" med hele suiten grøn.
  describe('omprisFraKnap (Ompris-knappens vej)', () => {
    const { fixtures, teams: holdliste } = LIGAER.sl;
    const nytDb = (ekstra) => makeGoldenDb({ teams: holdliste, ...ekstra }, goldenKampe(buildMatches(fixtures, holdliste)));

    for (const dryRun of [true, false]) {
      it(`et ukendt sport bliver en HttpsError med serverens besked — og intet skrives (dryRun: ${dryRun})`, async () => {
        const db = nytDb({ sport: 'handbold' });
        const foerKampe = JSON.stringify(db._matches.map((m) => m.data));
        let fejl = null;
        try {
          await omprisFraKnap(db, FieldValue, 'vm-haandbold', GOLDEN_NU_MS, dryRun, HttpsError);
        } catch (e) { fejl = e; }
        expect(fejl).toBeInstanceOf(HttpsError);
        expect(fejl.code).toBe('failed-precondition');
        expect(fejl.message).toBe(ukendtSportFejl('vm-haandbold', 'handbold').message);
        expect(db._game.eloCurrent).toBeUndefined();
        expect(JSON.stringify(db._matches.map((m) => m.data))).toBe(foerKampe);
      });
    }

    // D4: håndbold er MÅLT og dermed kendt. Før blev et håndboldspil afvist af
    // knappen (ukendt sport); nu skal det omprises med HÅNDBOLDENS tal —
    // K 120, HFA 0, base 0,157, gulv 1,01 — og ikke med fodboldens.
    it('håndbold (målt i D4) afvises ikke længere — og omprises med håndboldprofilen', async () => {
      const db = nytDb({ sport: 'haandbold' });
      const svar = await omprisFraKnap(db, FieldValue, 'hvm2027', GOLDEN_NU_MS, false, HttpsError);
      const hb = scoring.SPORT_PROFILER.haandbold;
      expect(svar.updated).toBeGreaterThan(50);
      const kampe = new Map(db._matches.map((m) => [m.data.id, m.data]));
      for (const a of svar.aendringer) {
        const m = kampe.get(a.id);
        expect(m.odds, a.id).toEqual(a.efter);
        expect(a.efter, a.id).toEqual(scoring.outcomeOdds({ eloHome: m.eloHome, eloAway: m.eloAway, ...scoring.oddsParametre(hb) }));
        // Odds-loftet 25 (håndboldens profilværdi) gælder også Ompris.
        expect(Math.max(...Object.values(a.efter)), a.id).toBeLessThanOrEqual(25);
      }
      expect(scoring.oddsParametre(hb).oddsMax).toBe(25);
      // Den levende Elo er regnet med K 120 og uden hjemmebane: samme facit,
      // andre ratings end fodboldens.
      expect(db._game.eloCurrent).not.toEqual(golden.sl.eloCurrent);
      const fodbold = nytDb({});
      await recomputeSeasonElo(fodbold, FieldValue, 'sl', GOLDEN_NU_MS, { dryRun: false });
      expect(fodbold._game.eloCurrent).toEqual(golden.sl.eloCurrent);
    });

    it('en kendt sport giver præcis recomputeSeasonElo-svaret — og dryRun sendes igennem', async () => {
      const tor = nytDb({});
      const svar = await omprisFraKnap(tor, FieldValue, 'sl', GOLDEN_NU_MS, true, HttpsError);
      expect(svar).toEqual(await recomputeSeasonElo(nytDb({}), FieldValue, 'sl', GOLDEN_NU_MS, { dryRun: true }));
      expect(svar.updated).toBeGreaterThan(50);
      expect(tor._game.eloCurrent).toBeUndefined(); // tør-kørsel: intet skrevet
      const vaad = nytDb({});
      await omprisFraKnap(vaad, FieldValue, 'sl', GOLDEN_NU_MS, false, HttpsError);
      expect(vaad._game.eloCurrent).toEqual(golden.sl.eloCurrent); // rigtig kørsel: skrevet
    });

    // nowMs afgør, hvilke kampe der er LÅSTE — og en låst kamps odds må aldrig
    // ompriser (point afregnes af de frosne odds). GOLDEN_NU_MS ligger før
    // første kickoff, så ingen kamp er låst: omprisFraKnap kunne glemme nowMs
    // (eller sende 0) uden at nogen anden test blev rød. Mutant: `nowMs` → `0`
    // i omprisFraKnaps kald overlevede alle 238+146 tests (Test Manager, PR #240).
    it('nowMs sendes igennem: låste kampe ompriser IKKE (kampene før "nu" røres ikke)', async () => {
      // "Nu" = den 21. ikke-spillede kamps kickoff: de 21 første er låste, resten ikke.
      // (Spillede kampe ompriser aldrig, så et "nu" blandt de spillede ville intet vise.)
      const ikkeSpillede = nytDb({})._matches.map((m) => m.data).filter((m) => !m.result).sort((a, b) => a.kickoff - b.kickoff);
      const SENERE = ikkeSpillede[20].kickoff;
      const tidligt = await omprisFraKnap(nytDb({}), FieldValue, 'sl', GOLDEN_NU_MS, true, HttpsError);
      const db = nytDb({});
      const sent = await omprisFraKnap(db, FieldValue, 'sl', SENERE, true, HttpsError);
      // Fixturet har noget at arbejde på: der ER låste kampe 60 dage inde …
      expect(tidligt.updated).toBeGreaterThan(50);
      expect(db._matches.filter((m) => m.data.kickoff <= SENERE).length).toBeGreaterThan(0);
      // … og de er ikke med i omprisningen.
      expect(sent.updated).toBeLessThan(tidligt.updated);
      expect(sent).toEqual(await recomputeSeasonElo(nytDb({}), FieldValue, 'sl', SENERE, { dryRun: true }));
      const laaste = new Set(ikkeSpillede.filter((m) => m.kickoff <= SENERE).map((m) => m.id));
      expect(laaste.size).toBeGreaterThanOrEqual(21); // ens kickoff kan give flere
      for (const a of sent.aendringer) expect(laaste.has(a.id), a.id).toBe(false);
    });

    it('en anden fejl (fx Firestore) slipper UÆNDRET igennem — den er ikke admins at rette', async () => {
      const boom = new Error('DEADLINE_EXCEEDED');
      const db = { collection: () => ({ doc: () => ({ get: async () => { throw boom; } }) }) };
      await expect(omprisFraKnap(db, FieldValue, 'sl', GOLDEN_NU_MS, true, HttpsError)).rejects.toBe(boom);
    });
  });

  it('tilHttpsFejl: kun kode failed-precondition oversættes — alt andet er samme objekt', () => {
    const e = ukendtSportFejl('g', 'handbold');
    const h = tilHttpsFejl(e, HttpsError);
    expect(h).toBeInstanceOf(HttpsError);
    expect(h.code).toBe('failed-precondition');
    expect(h.message).toBe(e.message);
    for (const andet of [new Error('x'), Object.assign(new Error('y'), { kode: 'not-found' }), null, undefined]) {
      expect(tilHttpsFejl(andet, HttpsError)).toBe(andet);
    }
  });

  // index.js kan ikke importeres uden firebase-functions, så LEDNINGEN
  // bevogtes som tekst (samme mønster som postbud.test.js): knappen skal sætte
  // flaget og oversætte fejlen til HttpsError — triggeren må IKKE sætte det.
  describe('index.js: knappen afviser, triggeren advarer', () => {
    const kilde = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'index.js'), 'utf8')
      .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    const knap = kilde.split('exports.repriceGameOdds')[1].split('exports.')[0];
    const trigger = kilde.split('exports.recomputeGameMatch')[1].split('exports.')[0];

    // Kaldet og oversættelsen er unit-testet i omprisFraKnap. Her bevises kun,
    // at knappen GÅR den vej — med den rigtige HttpsError og spillets dryRun —
    // og at der ikke findes en vej uden om.
    it('repriceGameOdds går gennem omprisFraKnap — og ingen anden vej til recomputeSeasonElo', () => {
      expect(knap).toMatch(/const out = await omprisFraKnap\(db, FieldValue, gameId, Date\.now\(\), dryRun, HttpsError\);/);
      expect(knap.match(/omprisFraKnap\(/g)).toHaveLength(1);
      expect(knap).not.toMatch(/recomputeSeasonElo/);
      // En egen try/catch her ville kunne sluge eller omdøbe omprisFraKnaps fejl.
      expect(knap).not.toMatch(/\btry\b|\bcatch\b/);
      // Navnet skal være gameScorings — ikke en lokal kopi i index.js.
      expect(kilde).toMatch(/dryRunFraKald, omprisFraKnap,[\s\S]*?\} = require\('\.\/gameScoring'\);/);
      expect(kilde).not.toMatch(/function omprisFraKnap|const omprisFraKnap\s*=/);
    });

    // afregnPuljeNu: samme ledning som de andre knapper. Fem mutationer
    // overlevede, før den stod her (TM-fund): requireAdmin fjernet, en inline
    // `!== false` vendt til `=== true` (tør-kørsels-knappen SKREV), dryRun
    // ikke sendt videre, dryRun ikke i svaret (fladen sagde «tørkørte og skrev
    // INTET» om en skrivning) og timeoutSeconds fjernet.
    it('afregnPuljeNu: requireAdmin før kernen, dryRunFraKald, dryRun videresendt og i svaret, timeoutSeconds', () => {
      const afregn = kilde.split('exports.afregnPuljeNu')[1].split('exports.')[0];
      // 120 s — samme som klientens kald (adminActions.callAfregnPuljeNu).
      expect(afregn).toMatch(/^ = onCall\(\{ region: REGION, timeoutSeconds: 120 \}, async \(request\) => \{/);
      const admin = afregn.indexOf('await requireAdmin(db, request);');
      const kerne = afregn.indexOf('await settlePuljeBets(');
      expect(admin).toBeGreaterThan(-1);
      expect(kerne).toBeGreaterThan(admin);
      expect(afregn).toMatch(/const dryRun = dryRunFraKald\(request\.data\);/);
      // Ingen egen kopi af reglen ved siden af husets.
      expect(afregn).not.toMatch(/!==\s*false|===\s*true|dryRun\s*\|\|/);
      expect(afregn).toMatch(/const res = await settlePuljeBets\(db, FieldValue, gameId, matches, \{ dryRun \}\);/);
      expect(afregn.match(/settlePuljeBets\(/g)).toHaveLength(1);
      expect(afregn).toMatch(/return \{ \.\.\.res, dryRun \};/);
      expect(afregn.match(/return /g)).toHaveLength(1);
    });

    it('triggeren kalder UDEN flaget — en tastefejl må ikke stoppe afregningen', () => {
      expect(trigger).toMatch(/await recomputeSeasonElo\(db, FieldValue, gameId, Date\.now\(\)\);/);
      expect(trigger).not.toMatch(/afvisUkendtSport/);
    });
  });

  it('et spil, der ikke findes, giver intet at gøre — og kaster ikke', async () => {
    // spil-dokumentet læses nu som `game` og slås op til profilen; et id uden
    // dokument skal stadig give 0 ændringer, ikke en TypeError.
    const db = {
      collection: () => ({ doc: () => ({ get: async () => ({ exists: false, data: () => undefined }) }) }),
    };
    await expect(recomputeSeasonElo(db, FieldValue, 'findes-ikke', GOLDEN_NU_MS))
      .resolves.toEqual({ updated: 0, aendringer: [] });
  });

  describe('med en prøvesport på spillet', () => {
    // Prøvesporten: hvert tal er et andet end fodboldens (se
    // src/test/proeveSport.js — serveren har sit eget register, så den
    // lægges ind her).
    const PROEVE = {
      sport: 'proeve',
      elo: { START: 1000, HFA: 0, K: 40, DRAW_BASE: 0.05, DRAW_DECAY: 0.2 },
      // Loftet 20 (fodbold: null, håndbold: 25) — så de levende odds beviser,
      // at recomputeSeasonElo sender SPILLETS loft videre.
      odds: { min: 1.01, max: 20 },
    };
    // Skrevet HELT ud, ikke via oddsParametre — så en fejl i oversættelsen
    // også bliver rød her.
    const ARGS = { hfa: 0, drawBase: 0.05, drawDecay: 0.2, oddsMin: 1.01, oddsMax: 20 };
    beforeAll(() => { scoring.SPORT_PROFILER.proeve = PROEVE; });
    afterAll(() => { delete scoring.SPORT_PROFILER.proeve; });

    const past = 1_000;
    const future = 5_000_000_000_000;
    const kampe = () => [
      { id: 'm1', round: 1, home: 'A', away: 'B', kickoff: past, result: '1' },
      { id: 'm2', round: 2, home: 'A', away: 'B', kickoff: future },
      { id: 'm3', round: 2, home: 'A', away: 'C', kickoff: future }, // C findes ikke i holdlisten
      { id: 'm4', round: 3, home: 'A', away: 'D', kickoff: future }, // D står uden elo
      { id: 'm5', round: 3, home: 'C', away: 'A', kickoff: future }, // UDE-favorit: m3 spejlet
    ];
    const hold = [{ name: 'A', elo: 1500 }, { name: 'B', elo: 1500 }, { name: 'D' }];
    const kamp = (db, id) => db._matches.find((m) => m.data.id === id).data;

    it('Elo opdateres med profilens K og hjemmebane', async () => {
      const db = makeGoldenDb({ teams: hold, sport: 'proeve' }, kampe());
      await recomputeSeasonElo(db, FieldValue, 'g1', 2_000_000_000_000);
      // Neutral bane: lige hold er ventet 50/50, så sejren giver præcis K/2 = 20.
      // Fodbold: hjemmeholdet var ventet at vinde → +8 (1508/1492).
      expect(db._game.eloCurrent).toEqual({ A: 1520, B: 1480, D: 1000 });
    });

    it('de friske odds prises med profilens model og gulv', async () => {
      const db = makeGoldenDb({ teams: hold, sport: 'proeve' }, kampe());
      await recomputeSeasonElo(db, FieldValue, 'g1', 2_000_000_000_000);
      expect(kamp(db, 'm2').odds).toEqual(scoring.outcomeOdds({ eloHome: 1520, eloAway: 1480, ...ARGS }));
      expect(kamp(db, 'm2').odds).toEqual({ 1: 1.88, X: 20, 2: 2.37 }); // X fair 20,94 — klippet til loftet
      // A (1520) mod et hold på 1000: p(1) = 0,919 → fair 1,088. Gulvet 1,01
      // lader det stå (1,09); fodboldens 1,1 ville have hævet det.
      // LOFTET 20 klipper X (fair 28,72) og 2 (fair 21,71) — uden det stod de
      // her; fodbold ville ikke klippe.
      expect(kamp(db, 'm3').odds).toEqual({ 1: 1.09, X: 20, 2: 20 });
      // Spejlet på neutral bane: nu er A UDE-favorit, og '2' har sit eget
      // fairOdds-kald, der også skal have profilens gulv (fodbold: 1,1) — og
      // '1' sit eget loft.
      expect(kamp(db, 'm5').odds).toEqual({ 1: 20, X: 20, 2: 1.09 });
    });

    it('kun en STRENG finder prøvesporten', () => {
      // Uden typeof-vagten gjorde hasOwnProperty ['proeve'] til nøglen
      // 'proeve'. Kun synligt, mens en anden sport end fodbold er registreret.
      expect(scoring.sportProfil({ sport: 'proeve' })).toBe(PROEVE);
      for (const sport of [['proeve'], { toString: () => 'proeve' }]) {
        expect(scoring.sportProfil({ sport }), String(sport)).toBe(scoring.SPORT_PROFILER.fodbold);
      }
    });

    it('et ukendt hold og et hold uden elo får SPORTENS neutrale rating', async () => {
      const db = makeGoldenDb({ teams: hold, sport: 'proeve' }, kampe());
      await recomputeSeasonElo(db, FieldValue, 'g1', 2_000_000_000_000);
      expect(kamp(db, 'm3').eloAway).toBe(1000); // ukendt: get() falder til START
      expect(kamp(db, 'm4').eloAway).toBe(1000); // uden elo: seed-kortet falder til START
      expect(kamp(db, 'm4').odds).toEqual(kamp(db, 'm3').odds);
    });

    it('samme kampe uden sport giver fodboldens tal — som altid', async () => {
      const db = makeGoldenDb({ teams: hold }, kampe());
      await recomputeSeasonElo(db, FieldValue, 'g1', 2_000_000_000_000);
      expect(db._game.eloCurrent).toEqual({ A: 1508, B: 1492, D: 1500 });
      expect(kamp(db, 'm3').eloAway).toBe(1500);
    });
  });
});
