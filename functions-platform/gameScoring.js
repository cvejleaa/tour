// ---------------------------------------------------------------------------
// functions/gameScoring.js — afregning af point i den samlede platform
// (games/{gameId}/…). Spejler mønsteret fra recomputeStage: når en kamps facit
// (result) sættes, scores alle bets på kampen (1X2 + Chancen) og hver berørt
// spillers total genberegnes i games/{gameId}/players/{uid}.
//
// Saldoen kan ALDRIG gå i minus: totalen gulves ved 0 (Chancen-tab kan i teori
// summe under 0 hvis en tidligere runde faldt — men spilleren skal ikke i gæld).
// ---------------------------------------------------------------------------

const {
  scoreBet, ELO, updateElo, actualHomeFromOutcome, outcomeFromScore, outcomeOdds, isOutcome,
  roundComboBonus, outcomeReward, championshipTeams, puljeScore,
} = require('./superligaScoring');

/** Millisekunder fra et Firestore-Timestamp | tal | ISO-streng. */
function kickoffMs(m) {
  const k = m?.kickoff;
  if (k == null) return null;
  if (typeof k === 'number') return k;
  if (typeof k === 'string') { const n = Date.parse(k); return Number.isNaN(n) ? null : n; }
  if (typeof k.toMillis === 'function') return k.toMillis();
  if (k.seconds != null) return k.seconds * 1000;
  return null;
}

/** Kampens 1X2-facit: brug result-feltet, ellers udled af mål. */
function matchOutcome(m) {
  if (isOutcome(m?.result)) return m.result;
  return outcomeFromScore(m?.homeGoals, m?.awayGoals);
}

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
 * Byg en runde-kontekst ud fra alle kampe i spillet: opslag pr. kamp-id
 * (runde, facit-udfald, frosne odds) + pr. runde (antal kampe + antal afgjorte).
 * Bruges til combi-runde-bonussen, som kræver at hele runden er spillet.
 */
function buildRoundContext(matches) {
  const byMatch = {};
  const rounds = {};
  for (const m of matches) {
    const round = m.round;
    if (round == null) continue;
    const result = matchOutcome(m); // '1'|'X'|'2'|null
    byMatch[m.id] = { round, result, odds: m.odds || null };
    if (!rounds[round]) rounds[round] = { count: 0, settledCount: 0 };
    rounds[round].count += 1;
    if (result) rounds[round].settledCount += 1;
  }
  return { byMatch, rounds };
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
 */
async function recalcPlayerTotal(db, FieldValue, gameId, uid, roundCtx = null) {
  const betsQ = db.collection('games').doc(gameId).collection('bets').where('uid', '==', uid);
  const playerRef = db.collection('games').doc(gameId).collection('players').doc(uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(betsQ);
    const playerSnap = await tx.get(playerRef);
    const bets = snap.docs.map((d) => d.data());
    const raw = bets.reduce((a, b) => a + (Number(b.points) || 0), 0);
    const bonus = playerRoundBonus(bets, roundCtx);
    // Pulje-bonus (mesterskabsspil-tip) afregnes ved sæsonslut og gemmes på
    // spilleren; her lægges den bare oveni den løbende total.
    const puljeBonus = Number(playerSnap.exists ? playerSnap.data().bonusPoints : 0) || 0;
    // Point følger oddsene (1 decimal) → afrund summen, så float-støj ikke giver
    // grimme totaler som 7.399999999. Gulv ved 0 (Chancen kan give negative bets).
    const totalPoints = Math.max(0, Math.round((raw + bonus + puljeBonus) * 10) / 10);
    tx.set(playerRef, {
      totalPoints,
      roundBonus: Math.round(bonus * 10) / 10,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
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

  const CHUNK = 10;
  for (let i = 0; i < uids.length; i += CHUNK) {
    await Promise.all(uids.slice(i, i + CHUNK).map((uid) => recalcPlayerTotal(db, FieldValue, gameId, uid)));
  }
  return { settled: uids.length };
}

/**
 * Kernen bag recomputeGameMatch (uden Cloud Functions-wrapper, så den kan
 * unit-testes). Scorer alle bets på en kamp og genberegner berørte spillere.
 * @returns {Promise<{rescored:number, players:number}>}
 */
async function recomputeGameMatchCore(db, FieldValue, gameId, matchId, matchData) {
  const result = matchData?.result;
  if (!result) return { rescored: 0, players: 0 };
  const odds = matchData.odds || null;

  const betsSnap = await db
    .collection('games').doc(gameId).collection('bets')
    .where('matchId', '==', matchId).get();

  const BATCH_SIZE = 400;
  let batch = db.batch();
  let ops = 0;
  const batches = [batch];
  const bump = () => { if (++ops >= BATCH_SIZE) { batch = db.batch(); batches.push(batch); ops = 0; } };

  const changedUids = new Set();
  let rescored = 0;
  for (const d of betsSnap.docs) {
    const pts = scoreBet(d.data(), result, odds);
    if (Number(d.data().points) === pts) continue; // uændret → rør ikke
    batch.update(d.ref, { points: pts });
    bump();
    rescored += 1;
    if (d.data().uid) changedUids.add(d.data().uid);
  }
  if (rescored === 0) return { rescored: 0, players: 0 }; // intet ændret
  for (const b of batches) await b.commit();

  // Runde-kontekst til combi-bonussen: hentes kun når vi faktisk skal genberegne.
  const matchesSnap = await db.collection('games').doc(gameId).collection('matches').get();
  const allMatches = matchesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const roundCtx = buildRoundContext(allMatches);

  const uids = [...changedUids];
  const CHUNK = 10;
  for (let i = 0; i < uids.length; i += CHUNK) {
    await Promise.all(uids.slice(i, i + CHUNK).map((uid) => recalcPlayerTotal(db, FieldValue, gameId, uid, roundCtx)));
  }

  // Placerings-snapshot: når denne kamps runde netop er blevet HELT afgjort,
  // gem hver spillers rang (én gang pr. runde) → facit-skærmens "du overhalede X".
  const round = roundCtx.byMatch[matchId]?.round;
  const rc = round != null ? roundCtx.rounds[round] : null;
  if (rc && rc.settledCount === rc.count) {
    const gameRef = db.collection('games').doc(gameId);
    const gsnap = await gameRef.get();
    const done = (gsnap.exists && Array.isArray(gsnap.data().snapshottedRounds))
      ? gsnap.data().snapshottedRounds : [];
    if (!done.includes(round)) {
      await snapshotRoundRanks(db, FieldValue, gameId);
      await gameRef.set({ snapshottedRounds: FieldValue.arrayUnion(round) }, { merge: true });
    }
  }

  // Pulje-tip: afregn mesterskabsspil-tippene når HELE grundspillet er spillet
  // (self-guardet + idempotent — rescores hvis et resultat senere rettes).
  await settlePuljeBets(db, FieldValue, gameId, allMatches);

  return { rescored, players: uids.length };
}

module.exports = {
  recalcPlayerTotal, recomputeGameMatchCore, recomputeSeasonElo,
  buildRoundContext, playerRoundBonus, computeRanks, snapshotRoundRanks,
  settlePuljeBets, officialTop6,
};
