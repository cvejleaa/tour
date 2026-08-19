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

/**
 * Hvem mangler at svare på ligaens ÅBNE spørgsmål? (opgave #38)
 *
 * REN kerne — alle beslutninger her, så de kan mutationstestes:
 * - "Åbent" kopierer SKRIVEREGLEN i firestore.rules (kan der stadig svares?):
 *   facit == null && (deadline == null || nu < deadline). IKKE lqSettled og
 *   IKKE settledQuestionIds — de tre definitioner var allerede uenige, og
 *   listes nogen som "mangler" på et spørgsmål, de er låst ude af, er det en
 *   falsk anklage (QC-fund på planen).
 * - besvaret afgøres af DOKUMENT-EKSISTENS på de deterministiske id'er
 *   `${qId}_${uid}` for ligaens NUVÆRENDE medlemmer. Derfor kan et tidligere
 *   medlems svar aldrig tælle med ("5 af 4"-fælden), og der er ingen
 *   id-parsing, der kan pege på den forkerte (spilfører-fælden) — begge
 *   umulige pr. konstruktion, ikke pr. disciplin.
 * - Svar-DATA optræder ingen steder: kernen modtager kun eksistens-sæt.
 *
 * Sortering: nærmeste deadline først; uden deadline sidst ("ingen hastighed").
 */
function byggSpoergsmaalStatus({ spoergsmaal, memberUids, harSvaret, brugere, nowMs }) {
  const aabne = (spoergsmaal || [])
    .filter((q) => q.facit == null && (q.deadline == null || nowMs < q.deadline))
    .sort((a, b) => (a.deadline ?? Infinity) - (b.deadline ?? Infinity));
  return aabne.map((q) => {
    const svaret = harSvaret.get(q.id) || new Set();
    const mangler = memberUids
      .filter((uid) => !svaret.has(uid))
      .map((uid) => ({ uid, navn: (brugere.get(uid) || {}).displayName || 'Spiller' }))
      .sort((a, b) => a.navn.localeCompare(b.navn, 'da'));
    return {
      id: q.id,
      label: typeof q.label === 'string' ? q.label.slice(0, 120) : '',
      deadline: q.deadline ?? null,
      besvaret: memberUids.length - mangler.length,
      ialt: memberUids.length,
      mangler,
    };
  });
}

/**
 * Tynd læser: adgang er LIGA-MEDLEM (eller global admin — afgøres i callablen).
 * questionAnswers læses som RENE EKSISTENS-TJEK via db.getAll på de
 * deterministiske id'er — .data() kaldes aldrig på et svar, så svar-feltet
 * forlader aldrig databasen. Callablen findes, fordi questionAnswers som det
 * ENESTE sted i spillet ingen isGlobalAdmin-læsegren har (firestore.rules):
 * hverken ejer eller admin kan læse åbne svar fra browseren — og sådan skal
 * det blive ved med at være. "Forenkl" den aldrig til en klient-query.
 */
async function hentSpoergsmaalStatus(db, { gameId, leagueId, nowMs = Date.now() }) {
  const leagueRef = db.collection('games').doc(gameId).collection('leagues').doc(leagueId);
  const [leagueSnap, qSnap] = await Promise.all([
    leagueRef.get(),
    leagueRef.collection('questions').get(),
  ]);
  if (!leagueSnap.exists) return null;
  const memberUids = (leagueSnap.data().memberUids || []).filter((u) => typeof u === 'string');
  const spoergsmaal = qSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const aabne = spoergsmaal.filter((q) => q.facit == null && (q.deadline == null || nowMs < q.deadline));
  const harSvaret = new Map();
  if (aabne.length && memberUids.length) {
    const refs = [];
    for (const q of aabne) {
      for (const uid of memberUids) refs.push(leagueRef.collection('questionAnswers').doc(`${q.id}_${uid}`));
    }
    const snaps = await db.getAll(...refs, { fieldMask: [] });
    let i = 0;
    for (const q of aabne) {
      const sæt = new Set();
      for (const uid of memberUids) {
        if (snaps[i].exists) sæt.add(uid);
        i += 1;
      }
      harSvaret.set(q.id, sæt);
    }
  }

  const userDocs = memberUids.length
    ? await db.getAll(...memberUids.map((uid) => db.collection('users').doc(uid)))
    : [];
  const brugere = new Map(userDocs.filter((d) => d.exists).map((d) => [d.id, d.data()]));

  return {
    leagueName: leagueSnap.data().name || leagueId,
    memberUids,
    spoergsmaal: byggSpoergsmaalStatus({ spoergsmaal, memberUids, harSvaret, brugere, nowMs }),
  };
}

module.exports = {
  normalizeCode, redeemLeagueCodeCore, LEAGUE_ERR,
  byggSpoergsmaalStatus, hentSpoergsmaalStatus,
};
