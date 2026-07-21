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

  // Spillede kampe i kronologisk rækkefølge → opdatér Elo.
  const played = matches
    .filter((m) => matchOutcome(m))
    .sort((a, b) => (kickoffMs(a) ?? 0) - (kickoffMs(b) ?? 0));
  for (const m of played) {
    const outcome = matchOutcome(m);
    const { home, away } = updateElo(get(m.home), get(m.away), actualHomeFromOutcome(outcome));
    elo.set(m.home, home);
    elo.set(m.away, away);
  }

  // Gem aktuel Elo på spillet (til oversigt/visning).
  const eloCurrent = {};
  for (const [n, r] of elo) eloCurrent[n] = Math.round(r);
  await gameRef.set({ eloCurrent, eloUpdatedAt: FieldValue.serverTimestamp() }, { merge: true });

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
 * Genberegn én spillers total i et spil = summen af alle vedkommendes bet-point,
 * gulvet ved 0. Kør i transaktion, så to kampe der afgøres tæt på hinanden ikke
 * overskriver hinandens sum (samme princip som recalcTourTotal).
 */
async function recalcPlayerTotal(db, FieldValue, gameId, uid) {
  const betsQ = db.collection('games').doc(gameId).collection('bets').where('uid', '==', uid);
  const playerRef = db.collection('games').doc(gameId).collection('players').doc(uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(betsQ);
    const raw = snap.docs.reduce((a, d) => a + (Number(d.data().points) || 0), 0);
    // Point følger oddsene (1 decimal) → afrund summen, så float-støj ikke giver
    // grimme totaler som 7.399999999. Gulv ved 0 (Chancen kan give negative bets).
    const totalPoints = Math.max(0, Math.round(raw * 10) / 10);
    tx.set(playerRef, {
      totalPoints,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
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

  const uids = [...changedUids];
  const CHUNK = 10;
  for (let i = 0; i < uids.length; i += CHUNK) {
    await Promise.all(uids.slice(i, i + CHUNK).map((uid) => recalcPlayerTotal(db, FieldValue, gameId, uid)));
  }
  return { rescored, players: uids.length };
}

module.exports = { recalcPlayerTotal, recomputeGameMatchCore, recomputeSeasonElo };
