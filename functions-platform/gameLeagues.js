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
 * Fejlkoderne redeemLeagueCodeCore kaster, oversat til HttpsError-kode +
 * dansk besked. Bor HER og ikke i index.js, så en test kan holde listen op
 * mod de throws, der faktisk findes i filen: index.js kan ikke importeres
 * uden firebase-functions, og posten ville ellers være udækket.
 */
const LEAGUE_ERR = {
  unauthenticated: ['unauthenticated', 'Log ind for at deltage.'],
  'bad-code': ['invalid-argument', 'Indtast en gyldig kode.'],
  'no-user': ['failed-precondition', 'Opret en bruger først, så tilmelder vi dig ligaen.'],
  'not-found': ['not-found', 'Ingen liga fundet med den kode.'],
  // Samme ordlyd som Tour-udgaven (functions/invites.js), så en afvist bruger
  // får det samme svar uanset hvilken app hen står i.
  rejected: ['permission-denied', 'Din adgang er afvist. Kontakt en administrator.'],
};

/**
 * Kernen (uden Cloud Functions-wrapper — testbar med injiceret db/FieldValue).
 * Kaster Error med en af nøglerne i LEAGUE_ERR ved fejl.
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

  // En AFVIST bruger må ikke kunne gen-godkende sig selv via en liga-kode —
  // ellers omgås moderering fuldstændigt. Koden behøver ikke være hemmelig for
  // den bortviste: de var selv medlem, da de blev smidt ud. Tour-udgaven har
  // haft dette værn hele tiden (functions/invites.js); platformen manglede det.
  //
  // Tjekkes FØR liga-opslaget, så en afvist bruger ikke kan bruge funktionen
  // til at afgøre, om en kode findes.
  if (userSnap.data().status === 'rejected') throw new Error('rejected');

  // Slå ligaen op — en ugyldig kode må aldrig auto-godkende nogen.
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

module.exports = { normalizeCode, redeemLeagueCodeCore, LEAGUE_ERR };
