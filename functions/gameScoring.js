// ---------------------------------------------------------------------------
// functions/gameScoring.js — afregning af point i den samlede platform
// (games/{gameId}/…). Spejler mønsteret fra recomputeStage: når en kamps facit
// (result) sættes, scores alle bets på kampen (1X2 + Chancen) og hver berørt
// spillers total genberegnes i games/{gameId}/players/{uid}.
//
// Saldoen kan ALDRIG gå i minus: totalen gulves ved 0 (Chancen-tab kan i teori
// summe under 0 hvis en tidligere runde faldt — men spilleren skal ikke i gæld).
// ---------------------------------------------------------------------------

const { scoreBet } = require('./superligaScoring');

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
    const totalPoints = Math.max(0, raw);
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

module.exports = { recalcPlayerTotal, recomputeGameMatchCore };
