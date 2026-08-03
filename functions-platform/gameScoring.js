// ---------------------------------------------------------------------------
// functions-platform/gameScoring.js — afregning af point i den samlede platform
// (games/{gameId}/…). Spejler mønsteret fra recomputeStage: når en kamps facit
// (result) sættes, scores alle bets på kampen (1X2 + Chancen) og hver berørt
// spillers total genberegnes i games/{gameId}/players/{uid}.
//
// Saldoen kan ALDRIG gå i minus: totalen gulves ved 0 (Chancen-tab kan i teori
// summe under 0 hvis en tidligere runde faldt — men spilleren skal ikke i gæld).
// ---------------------------------------------------------------------------

const {
  scoreBet, ELO, updateElo, actualHomeFromOutcome, outcomeOdds,
  roundComboBonus, outcomeReward, championshipTeams, puljeScore,
} = require('./superligaScoring');
// kickoffMs, matchOutcome og buildRoundContext bor i pointOpdeling, fordi
// KLIENTEN skal bruge samme runde-kontekst for at kunne kalde opdelPoint.
// Ét sted, ikke to — ellers driver serverens og fladens forestilling om
// 'hvornår er en kamp afgjort' fra hinanden.
const {
  opdelPoint, buildRoundContext, kickoffMs, matchOutcome,
} = require('./pointOpdeling');

/** Er to odds-objekter ens (afrundet)? */
function oddsEqual(a, b) {
  if (!a || !b) return false;
  return a['1'] === b['1'] && a.X === b.X && a['2'] === b['2'];
}

/**
 * "Levende" Elo: genberegn hvert holds rating fra SEED-værdierne (games/{id}.teams)
 * gennem alle spillede kampe i kronologisk rækkefølge, gem aktuel Elo på spillet,
 * og opdatér odds for FREMTIDIGE, ikke-låste kampe (kickoff i fremtiden, intet
 * facit). Låste/spillede kampe beholder deres frosne odds. Genberegnes fra bunden
 * hver gang (idempotent — et rettet resultat giver korrekt Elo uden dobbelt-tælling).
 * @returns {Promise<{updated:number}>} antal kampe med opdaterede odds
 */
async function recomputeSeasonElo(db, FieldValue, gameId, nowMs) {
  const gameRef = db.collection('games').doc(gameId);
  const gameSnap = await gameRef.get();
  const seedTeams = gameSnap.exists ? gameSnap.data().teams : null;
  if (!Array.isArray(seedTeams) || seedTeams.length === 0) return { updated: 0 };

  const elo = new Map(seedTeams.map((t) => [t.name, Number(t.elo) || ELO.START]));
  const get = (n) => (elo.has(n) ? elo.get(n) : ELO.START);

  const snap = await gameRef.collection('matches').get();
  const matches = snap.docs.map((d) => ({ id: d.id, ref: d.ref, ...d.data() }));

  // Kampe pr. runde (til Elo-historik-snapshot, når en hel runde er spillet).
  const roundTotal = new Map();
  for (const m of matches) {
    if (m.round == null) continue;
    roundTotal.set(m.round, (roundTotal.get(m.round) || 0) + 1);
  }
  const roundPlayed = new Map();
  const eloHistory = []; // [{ round, elo: {name: rating} }] efter hver HELE runde

  // Spillede kampe i kronologisk rækkefølge → opdatér Elo. Efter den kamp der
  // fuldender en runde, gemmes et Elo-snapshot for den runde.
  const played = matches
    .filter((m) => matchOutcome(m))
    .sort((a, b) => (kickoffMs(a) ?? 0) - (kickoffMs(b) ?? 0));
  for (const m of played) {
    const outcome = matchOutcome(m);
    const { home, away } = updateElo(get(m.home), get(m.away), actualHomeFromOutcome(outcome));
    elo.set(m.home, home);
    elo.set(m.away, away);
    if (m.round != null) {
      roundPlayed.set(m.round, (roundPlayed.get(m.round) || 0) + 1);
      if (roundPlayed.get(m.round) === roundTotal.get(m.round)
        && !eloHistory.some((h) => h.round === m.round)) {
        const rowSnap = {};
        for (const [n, r] of elo) rowSnap[n] = Math.round(r);
        eloHistory.push({ round: m.round, elo: rowSnap });
      }
    }
  }
  eloHistory.sort((a, b) => a.round - b.round);

  // Gem aktuel Elo + rundevis historik på spillet (til Elo-tabellen).
  const eloCurrent = {};
  for (const [n, r] of elo) eloCurrent[n] = Math.round(r);
  await gameRef.set({ eloCurrent, eloHistory, eloUpdatedAt: FieldValue.serverTimestamp() }, { merge: true });

  // Friske odds på fremtidige, ikke-låste kampe — kun hvis de reelt ændrer sig.
  let batch = db.batch();
  let updated = 0;
  for (const m of matches) {
    if (matchOutcome(m)) continue;                 // spillet
    const k = kickoffMs(m);
    if (k != null && k <= nowMs) continue;         // låst (kickoff passeret)
    const odds = outcomeOdds({ eloHome: get(m.home), eloAway: get(m.away) });
    if (oddsEqual(odds, m.odds)) continue;         // uændret
    batch.update(m.ref, {
      odds, eloHome: get(m.home), eloAway: get(m.away),
      oddsUpdatedAt: FieldValue.serverTimestamp(),
    });
    updated += 1;
  }
  if (updated) await batch.commit();
  return { updated };
}

/**
 * Match-id'er for kampe FØR spillets starttidspunkt (game.startAt). De tæller
 * IKKE med i pointgivningen — så en sæson kan starte midt i (fx fra runde 2)
 * uden at tidligere runders tips giver point. Uden starttidspunkt: tom mængde.
 * @param {Array<object>} matches
 * @param {number|null} startMs
 * @returns {Set<string>}
 */
function gatedIds(matches, startMs) {
  const s = new Set();
  if (startMs == null) return s;
  for (const m of matches) {
    const k = kickoffMs(m);
    if (k != null && k < startMs) s.add(m.id);
  }
  return s;
}

/**
 * Samlet combi-runde-bonus for én spillers bets. For hver runde hvor (a) alle
 * kampe er afgjort, og (b) spilleren har tippet ALLE kampe i runden: gang de
 * ramte odds sammen (loftet) hvis 0 eller 1 fejl. Ren funktion → let at teste.
 * @param {Array<{matchId:string, pick:string}>} bets
 * @param {ReturnType<buildRoundContext>|null} roundCtx
 * @returns {number}
 */
function playerRoundBonus(bets, roundCtx) {
  if (!roundCtx) return 0;
  const byRound = new Map();
  for (const b of bets) {
    const info = roundCtx.byMatch[b.matchId];
    if (!info) continue;
    if (!byRound.has(info.round)) byRound.set(info.round, []);
    byRound.get(info.round).push(b);
  }
  let bonus = 0;
  for (const [round, pbs] of byRound) {
    const rc = roundCtx.rounds[round];
    if (!rc || rc.count < 2) continue;
    if (rc.settledCount !== rc.count) continue; // runden ikke helt afgjort endnu
    if (pbs.length !== rc.count) continue;      // spilleren tippede ikke alle kampe
    const hitOdds = [];
    for (const pb of pbs) {
      const info = roundCtx.byMatch[pb.matchId];
      if (info.result && pb.pick === info.result) hitOdds.push(outcomeReward(info.result, info.odds));
    }
    bonus += roundComboBonus(hitOdds, rc.count);
  }
  return bonus;
}

/**
 * Genberegn én spillers total i et spil = summen af alle vedkommendes bet-point
 * PLUS combi-runde-bonusser, gulvet ved 0. Kør i transaktion, så to kampe der
 * afgøres tæt på hinanden ikke overskriver hinandens sum.
 * @param {object|null} roundCtx – runde-kontekst (buildRoundContext); uden den gives ingen bonus.
 * @param {Set<string>|null} gated – match-id'er før spillets start; deres bets tæller ikke med.
 */
async function recalcPlayerTotal(db, FieldValue, gameId, uid, roundCtx = null, gated = null, nowMs = Date.now()) {
  const betsQ = db.collection('games').doc(gameId).collection('bets').where('uid', '==', uid);
  const playerRef = db.collection('games').doc(gameId).collection('players').doc(uid);
  // Rækkerne ligger i et UNDERDOKUMENT, ikke på spilleren selv: stillingen
  // abonnerer live på alle liga-kammeraters players-dokumenter, så en hel
  // sæsons historik dér ville følge med ned ved hver eneste pointændring.
  //
  // Læseadgangen er indtil videre KUN spillerens egen (firestore.rules).
  // Liga-klausulen tilføjes sammen med den skærm, der skal bruge den.
  const detaljeRef = playerRef.collection('detalje').doc('opdeling');
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(betsQ);
    const playerSnap = await tx.get(playerRef);
    const all = snap.docs.map((d) => d.data());
    // Kampe før spillets starttidspunkt tæller ikke med (hverken bet-point eller combi).
    const bets = gated ? all.filter((b) => !gated.has(b.matchId)) : all;
    // Pulje-bonus (mesterskabsspil-tip) afregnes ved sæsonslut og gemmes på
    // spilleren; her lægges den bare oveni den løbende total.
    const puljeBonus = Number(playerSnap.exists ? playerSnap.data().bonusPoints : 0) || 0;

    const o = opdelPoint({ bets, roundCtx, puljeBonus, nowMs });

    tx.set(playerRef, {
      totalPoints: o.total,
      roundBonus: o.combi,
      // Ét felt og ikke fire løse: rubrikkerne skrives altid sammen, så de
      // ikke kan komme til at stamme fra hver sin kørsel.
      opdeling: { p1x2: o.p1x2, chance: o.chance, combi: o.combi, pulje: o.pulje },
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    // FULD ERSTATNING — bevidst ingen merge.
    //
    // Fjerner en admin et facit igen (den sti er understøttet), forsvinder
    // kampen fra o.kampe. Med merge ville dens række blive stående for evigt,
    // og detaljen ville vise point, spilleren ikke længere har. Den fejl
    // hverken fejler eller logger; den opdages først, når nogen undrer sig
    // over, at hans egen oversigt siger noget andet end stillingen.
    const kampe = {};
    for (const b of o.kampe) {
      kampe[b.matchId] = {
        pick: b.pick ?? null,
        points: Number(b.points) || 0,
        chanceStake: Number(b.chanceStake) || 0,
      };
    }
    tx.set(detaljeRef, { uid, kampe, updatedAt: FieldValue.serverTimestamp() });
  });
}

/**
 * Standard-konkurrence-rang (1, 2, 2, 4) efter totalPoints faldende.
 * Deterministisk tie-break på uid, så snapshots er stabile på tværs af kald.
 * @param {Array<{uid:string, totalPoints?:number}>} players
 * @returns {Map<string, number>} uid → rang
 */
function computeRanks(players) {
  const sorted = [...players].sort((a, b) => (
    (Number(b.totalPoints) || 0) - (Number(a.totalPoints) || 0)
    || String(a.uid).localeCompare(String(b.uid))
  ));
  const ranks = new Map();
  let rank = 0;
  let prevPts = null;
  sorted.forEach((p, i) => {
    const pts = Number(p.totalPoints) || 0;
    if (pts !== prevPts) { rank = i + 1; prevPts = pts; }
    ranks.set(p.uid, rank);
  });
  return ranks;
}

/**
 * Snapshot placeringer ved en rundes afslutning: sæt previousRank = spillerens
 * hidtidige rang (= rang før denne runde), og rank = ny rang efter runden. Så
 * kan facit-skærmen vise bevægelse ("du overhalede X"). Kør ÉN gang pr. runde —
 * kalderen vogter via game.snapshottedRounds, så resultat-rettelser ikke skubber
 * previousRank igen. Første snapshot giver previousRank = rank (ingen bevægelse).
 * @returns {Promise<{ranked:number}>}
 */
async function snapshotRoundRanks(db, FieldValue, gameId) {
  const playersSnap = await db.collection('games').doc(gameId).collection('players').get();
  const players = playersSnap.docs.map((d) => ({ uid: d.id, ref: d.ref, ...d.data() }));
  if (players.length === 0) return { ranked: 0 };
  const ranks = computeRanks(players);
  const batch = db.batch();
  for (const p of players) {
    const newRank = ranks.get(p.uid);
    const prev = Number.isFinite(p.rank) ? p.rank : newRank;
    batch.update(p.ref, { previousRank: prev, rank: newRank });
  }
  await batch.commit();
  return { ranked: players.length };
}

/**
 * Top-6 (mesterskabsspil) fra den OFFICIELLE stilling — kun hvis stillingen er
 * synket helt igennem grundspillet (hvert hold har spillet `expectedPlayed`).
 * Returnerer null hvis stillingen mangler/ikke er komplet (så kalderen kan bruge
 * en beregnet fallback).
 * @returns {string[]|null}
 */
function officialTop6(standings, expectedPlayed) {
  if (!Array.isArray(standings) || standings.length < 12) return null;
  if (expectedPlayed && !standings.every((r) => Number(r.played) === expectedPlayed)) return null;
  return standings.filter((r) => Number(r.rank) >= 1 && Number(r.rank) <= 6 && r.teamName)
    .map((r) => r.teamName);
}

/**
 * Afregn pulje-tip (mesterskabsspil-forudsigelse) NÅR hele grundspillet er
 * spillet. Beregner top-6 fra slutstillingen, scorer hvert pulje-tip, gemmer
 * point/correct på tippet + bonusPoints på spilleren, og genberegner totalerne.
 * Self-guardet (gør intet før alle kampe har mål) og idempotent.
 * @returns {Promise<{settled:number}>}
 */
async function settlePuljeBets(db, FieldValue, gameId, matches) {
  const goalOf = (g) => (g == null || g === '' ? NaN : Number(g));
  const complete = matches.length > 0 && matches.every(
    (m) => Number.isFinite(goalOf(m.homeGoals)) && Number.isFinite(goalOf(m.awayGoals)),
  );
  if (!complete) return { settled: 0 };

  const gameRef = db.collection('games').doc(gameId);
  const puljeSnap = await gameRef.collection('puljeBets').get();
  if (puljeSnap.empty) return { settled: 0 };

  // Top-6 fra den OFFICIELLE stilling (autoritativ); beregnet tabel kun som
  // fallback, hvis stillingen ikke er synket helt igennem grundspillet.
  const gameSnap = await gameRef.get();
  const standings = gameSnap.exists ? gameSnap.data().standings : null;
  const startMs = gameSnap.exists ? kickoffMs({ kickoff: gameSnap.data().startAt }) : null;
  const gated = gatedIds(matches, startMs);
  const expectedPlayed = matches.length % 6 === 0 ? matches.length / 6 : null;
  const top6 = new Set(officialTop6(standings, expectedPlayed) || championshipTeams(matches));
  const batch = db.batch();
  const uids = [];
  for (const d of puljeSnap.docs) {
    const { correct, points } = puljeScore(d.data().championship, top6);
    batch.update(d.ref, { correct, points });
    const playerRef = db.collection('games').doc(gameId).collection('players').doc(d.id);
    batch.set(playerRef, { bonusPoints: points }, { merge: true });
    uids.push(d.id);
  }
  await batch.commit();

  // VIGTIGT: send runde-konteksten med. Uden den giver playerRoundBonus 0, og
  // spillerne ville miste hele deres opsparede combi-bonus i samme øjeblik
  // puljen blev afregnet — altså præcis ved sæsonafslutningen.
  const roundCtx = buildRoundContext(matches);
  const CHUNK = 10;
  for (let i = 0; i < uids.length; i += CHUNK) {
    await Promise.all(uids.slice(i, i + CHUNK)
      .map((uid) => recalcPlayerTotal(db, FieldValue, gameId, uid, roundCtx, gated)));
  }
  return { settled: uids.length };
}

/**
 * Kernen bag recomputeGameMatch (uden Cloud Functions-wrapper, så den kan
 * unit-testes). Scorer alle bets på en kamp og genberegner berørte spillere.
 * @returns {Promise<{rescored:number, players:number}>}
 */
async function recomputeGameMatchCore(db, FieldValue, gameId, matchId, matchData) {
  // Facit kan også være FJERNET igen (admin rettede en fejl). Så skal pointene
  // rulles tilbage: scoreBet giver 0 uden gyldigt facit, og totalerne
  // genberegnes nedenfor. Uden det ville spillerne beholde point for en kamp,
  // der ikke længere har et resultat.
  const result = matchData?.result || null;
  const odds = matchData?.odds || null;

  // Spillets starttidspunkt (game.startAt): kampe før det tæller ikke med. Er
  // DENNE kamp før start, scorer vi den slet ikke.
  const gameRef = db.collection('games').doc(gameId);
  const gameSnap = await gameRef.get();
  const startMs = gameSnap.exists ? kickoffMs({ kickoff: gameSnap.data().startAt }) : null;
  if (startMs != null) {
    const thisKickoff = kickoffMs(matchData);
    if (thisKickoff != null && thisKickoff < startMs) return { rescored: 0, players: 0, gated: true };
  }

  const betsSnap = await db
    .collection('games').doc(gameId).collection('bets')
    .where('matchId', '==', matchId).get();

  const BATCH_SIZE = 400;
  let batch = db.batch();
  let ops = 0;
  const batches = [batch];
  const bump = () => { if (++ops >= BATCH_SIZE) { batch = db.batch(); batches.push(batch); ops = 0; } };

  // ALLE, der har tippet på kampen — ikke kun dem, hvis point ændrede sig.
  //
  // Rammer en spiller forkert uden at bruge Chancen, går hans point 0 → 0.
  // Samlede vi kun de ændrede, blev han aldrig genberegnet — og var det
  // rundens SIDSTE kamp, fik han derfor aldrig sin combi-bonus for én fejl.
  // Bonussen kræver, at hele runden er spillet, så den kunne kun komme fra
  // netop denne genberegning. Fejlen var tavs: totalen var jo "rigtig" set fra
  // hver enkelt kamp.
  const berorteUids = new Set();
  let rescored = 0;
  for (const d of betsSnap.docs) {
    const bet = d.data();
    if (bet.uid) berorteUids.add(bet.uid);
    const pts = scoreBet(bet, result, odds);
    if (Number(bet.points) === pts) continue; // uændret → spar skrivningen
    batch.update(d.ref, { points: pts });
    bump();
    rescored += 1;
  }
  // Ingen tidlig exit på rescored === 0. Ud over combi-bonussen hang både
  // runde-snapshottet og puljeafregningen nedenfor på den: ramte HELE feltet
  // forkert på en kamp, blev runden aldrig snapshottet, og Runde-Botten fyrede
  // aldrig. Triggeren (index.js) returnerer allerede, når facit er uændret, så
  // vi kommer kun herned, når der faktisk er sket noget.
  if (rescored) for (const b of batches) await b.commit();

  // Runde-kontekst til combi-bonussen: hentes kun når vi faktisk skal genberegne.
  const matchesSnap = await db.collection('games').doc(gameId).collection('matches').get();
  const allMatches = matchesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  // Kampe før spillets start udelukkes fra både combi-kontekst og totalen.
  const gated = gatedIds(allMatches, startMs);
  const roundCtx = buildRoundContext(allMatches.filter((m) => !gated.has(m.id)));

  const uids = [...berorteUids];
  const CHUNK = 10;
  for (let i = 0; i < uids.length; i += CHUNK) {
    await Promise.all(uids.slice(i, i + CHUNK).map((uid) => recalcPlayerTotal(db, FieldValue, gameId, uid, roundCtx, gated)));
  }

  // Placerings-snapshot: når denne kamps runde netop er blevet HELT afgjort,
  // gem hver spillers rang (én gang pr. runde) → facit-skærmens "du overhalede X".
  const round = roundCtx.byMatch[matchId]?.round;
  const rc = round != null ? roundCtx.rounds[round] : null;
  let roundCompleted = null; // sat første gang en runde bliver HELT afgjort
  if (rc && rc.settledCount === rc.count) {
    const gRef = db.collection('games').doc(gameId);
    const gsnap = await gRef.get();
    const done = (gsnap.exists && Array.isArray(gsnap.data().snapshottedRounds))
      ? gsnap.data().snapshottedRounds : [];
    if (!done.includes(round)) {
      await snapshotRoundRanks(db, FieldValue, gameId);
      await gRef.set({ snapshottedRounds: FieldValue.arrayUnion(round) }, { merge: true });
      roundCompleted = round; // → Runde-Botten (index.js) poster opslaget
    }
  }

  // Pulje-tip: afregn mesterskabsspil-tippene når HELE grundspillet er spillet
  // (self-guardet + idempotent — rescores hvis et resultat senere rettes).
  await settlePuljeBets(db, FieldValue, gameId, allMatches);

  return { rescored, players: uids.length, roundCompleted };
}

/**
 * Genberegn ALLE spilleres totaler i et spil med den aktuelle gate (game.startAt).
 * Bruges når admin lige har sat/ændret starttidspunktet, så tidligere runders
 * point fjernes fra stillingen med det samme (triggeren rører kun berørte
 * spillere, når en kamp skrives). Ren aggregering — ændrer ikke bet-point.
 * @returns {Promise<{players:number, gatedMatches:number}>}
 */
async function recomputeAllPlayerTotals(db, FieldValue, gameId) {
  const gameRef = db.collection('games').doc(gameId);
  const [gameSnap, matchesSnap, playersSnap] = await Promise.all([
    gameRef.get(),
    gameRef.collection('matches').get(),
    gameRef.collection('players').get(),
  ]);
  const allMatches = matchesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const startMs = gameSnap.exists ? kickoffMs({ kickoff: gameSnap.data().startAt }) : null;
  const gated = gatedIds(allMatches, startMs);
  const roundCtx = buildRoundContext(allMatches.filter((m) => !gated.has(m.id)));
  const uids = playersSnap.docs.map((d) => d.id);
  const CHUNK = 10;
  for (let i = 0; i < uids.length; i += CHUNK) {
    await Promise.all(uids.slice(i, i + CHUNK).map((uid) => recalcPlayerTotal(db, FieldValue, gameId, uid, roundCtx, gated)));
  }
  return { players: uids.length, gatedMatches: gated.size };
}

module.exports = {
  recalcPlayerTotal, recomputeGameMatchCore, recomputeSeasonElo,
  buildRoundContext, playerRoundBonus, computeRanks, snapshotRoundRanks,
  settlePuljeBets, officialTop6, gatedIds, recomputeAllPlayerTotals,
};
