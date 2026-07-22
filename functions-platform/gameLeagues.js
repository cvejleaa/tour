// ---------------------------------------------------------------------------
// functions-platform/gameLeagues.js — server-side "deltag i liga via kode".
//
// Ligaer (games/{gameId}/leagues) er kun læsbare for medlemmer, så en spiller
// kan ikke selv finde/tilføje sig til vilkårlige ligaer. Denne funktion slår
// ligaen op ud fra koden (Admin SDK) og tilføjer kalderen til memberUids.
//
// En liga-kode ER en invitation (deles bevidst af ejeren). Derfor virker den
// som ét-kliks tilmelding: en godkendt bruger tilføjes direkte, og en endnu
// ikke-godkendt / ikke-deltagende bruger bliver AUTO-godkendt og AUTO-tilmeldt
// spillet, før de føjes til ligaen. Kræver dog en eksisterende brugerprofil
// (oprettes ved registrering) — findes den ikke, kastes 'no-user'.
// ---------------------------------------------------------------------------

function normalizeCode(code) {
  return String(code || '').trim().toUpperCase();
}

/**
 * Kernen (uden Cloud Functions-wrapper — testbar med injiceret db/FieldValue).
 * Kaster Error('unauthenticated'|'bad-code'|'no-user'|'not-found') ved fejl.
 * @returns {Promise<{leagueId:string, name:string, already:boolean}>}
 */
async function redeemLeagueCodeCore(db, FieldValue, { uid, gameId, code }) {
  const clean = normalizeCode(code);
  if (!uid) throw new Error('unauthenticated');
  if (!gameId || clean.length < 4) throw new Error('bad-code');

  // Brugerprofilen skal findes (oprettes ved registrering).
  const userRef = db.collection('users').doc(uid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) throw new Error('no-user');

  // Slå ligaen op FØRST — en ugyldig kode må aldrig auto-godkende nogen.
  const q = await db.collection('games').doc(gameId).collection('leagues')
    .where('code', '==', clean).limit(1).get();
  if (q.empty) throw new Error('not-found');

  // Invitation → auto-godkend brugeren, hvis de ikke allerede er det.
  if (userSnap.data().status !== 'approved') {
    await userRef.update({ status: 'approved' });
  }
  // Invitation → auto-tilmeld spillet, hvis de ikke allerede er deltager.
  const playerRef = db.collection('games').doc(gameId).collection('players').doc(uid);
  const playerSnap = await playerRef.get();
  if (!playerSnap.exists) {
    await playerRef.set({ uid, joinedAt: FieldValue.serverTimestamp() });
  }

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
