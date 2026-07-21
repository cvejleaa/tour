// ---------------------------------------------------------------------------
// functions-platform/gameLeagues.js — server-side "deltag i liga via kode".
//
// Ligaer (games/{gameId}/leagues) er kun læsbare for medlemmer, så en spiller
// kan ikke selv finde/tilføje sig til vilkårlige ligaer. Denne funktion slår
// ligaen op ud fra koden (Admin SDK), verificerer at kalderen er en godkendt
// deltager i spillet, og tilføjer vedkommende til memberUids.
// ---------------------------------------------------------------------------

function normalizeCode(code) {
  return String(code || '').trim().toUpperCase();
}

/**
 * Kernen (uden Cloud Functions-wrapper — testbar med injiceret db/FieldValue).
 * Kaster Error('not-approved'|'not-member'|'bad-code'|'not-found') ved fejl.
 * @returns {Promise<{leagueId:string, name:string, already:boolean}>}
 */
async function redeemLeagueCodeCore(db, FieldValue, { uid, gameId, code }) {
  const clean = normalizeCode(code);
  if (!uid) throw new Error('unauthenticated');
  if (!gameId || clean.length < 4) throw new Error('bad-code');

  // Godkendt bruger?
  const userSnap = await db.collection('users').doc(uid).get();
  if (!userSnap.exists || userSnap.data().status !== 'approved') throw new Error('not-approved');

  // Deltager i spillet?
  const playerSnap = await db.collection('games').doc(gameId).collection('players').doc(uid).get();
  if (!playerSnap.exists) throw new Error('not-member');

  // Find ligaen ud fra koden.
  const q = await db.collection('games').doc(gameId).collection('leagues')
    .where('code', '==', clean).limit(1).get();
  if (q.empty) throw new Error('not-found');

  const leagueDoc = q.docs[0];
  const data = leagueDoc.data();
  const members = Array.isArray(data.memberUids) ? data.memberUids : [];
  if (members.includes(uid)) {
    return { leagueId: leagueDoc.id, name: data.name, already: true };
  }
  await leagueDoc.ref.update({ memberUids: FieldValue.arrayUnion(uid) });
  return { leagueId: leagueDoc.id, name: data.name, already: false };
}

module.exports = { normalizeCode, redeemLeagueCodeCore };
