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
  // Dørmanden for svar-status (#38) bruger samme tabel — én oversættelse pr. kode.
  'not-approved': ['permission-denied', 'Din bruger er ikke godkendt.'],
  'not-member': ['permission-denied', 'Kun ligaens medlemmer kan se svar-status.'],
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
 *   se erAabent nedenfor. IKKE lqSettled og
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

// Åbent = kan der stadig SVARES? Kopierer skrivereglen PRÆCIST: i rules fejler
// et opslag på en MANGLENDE nøgle lukket (deny), så kun facit === null — nøglen
// sat til null, som createLeagueQuestion altid skriver — er åbent. `== null`
// regnede en udeladt nøgle som åben og listede folk som "mangler" på et
// spørgsmål, INGEN kunne svare på (Security-fund, emulator-bekræftet). Én
// definition, begge kaldesteder — så en mutation af den bliver rød ét sted.
function erAabent(q, nowMs) {
  return q.facit === null
    && (q.deadline === null || (typeof q.deadline === 'number' && nowMs < q.deadline));
}

/**
 * Dørmanden for svar-status — REN, så beslutningen kan mutationstestes
 * (Security-fund: en BORTVIST spiller beholdt adgang, fordi callablen kun
 * krævede login + medlemskab; rules kræver isApproved() på hver eneste
 * leagues-gren, og serveren må ikke være mere gavmild end browseren).
 * Approved-tjekket kommer FØR eksistens-svaret: en ikke-godkendt bruger må
 * heller ikke kunne sondere, OM et liga-id findes. Kaster LEAGUE_ERR-nøgler.
 */
function tjekSvarStatusAdgang({ uid, bruger, memberUids, ligaFindes }) {
  if (!bruger || bruger.status !== 'approved') throw new Error('not-approved');
  if (!ligaFindes) return; // not-found afgøres af kalderen — men først efter approved
  const admin = bruger.role === 'owner' || bruger.role === 'globalAdmin';
  if (!admin && !memberUids.includes(uid)) throw new Error('not-member');
}

function byggSpoergsmaalStatus({ spoergsmaal, memberUids, harSvaret, brugere, nowMs }) {
  const aabne = (spoergsmaal || [])
    .filter((q) => erAabent(q, nowMs))
    .sort((a, b) => (a.deadline ?? Infinity) - (b.deadline ?? Infinity));
  return aabne.map((q) => {
    const svaret = harSvaret.get(q.id) || new Set();
    const mangler = memberUids
      .filter((uid) => !svaret.has(uid))
      .map((uid) => {
        const dn = (brugere.get(uid) || {}).displayName;
        // users-reglen type-tjekker ikke displayName, så et tal eller objekt må
        // ikke kunne vælte kortet for hele ligaen (localeCompare ville kaste).
        return { uid, navn: (typeof dn === 'string' && dn.trim() ? dn : 'Spiller').slice(0, 60) };
      })
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
 * Tynd læser: adgangen afgøres HER (tjekSvarStatusAdgang), før noget dyrt
 * læses — callablen oversætter kun fejlkoderne til HttpsError via LEAGUE_ERR.
 * questionAnswers læses som RENE EKSISTENS-TJEK via db.getAll på de
 * deterministiske id'er — .data() kaldes aldrig på et svar, så svar-feltet
 * forlader aldrig databasen. Callablen findes, fordi questionAnswers som det
 * ENESTE sted i spillet ingen isGlobalAdmin-læsegren har (firestore.rules):
 * hverken ejer eller admin kan læse åbne svar fra browseren — og sådan skal
 * det blive ved med at være. "Forenkl" den aldrig til en klient-query.
 */
async function hentSpoergsmaalStatus(db, { gameId, leagueId, uid, nowMs = Date.now() }) {
  const leagueRef = db.collection('games').doc(gameId).collection('leagues').doc(leagueId);
  // Adgangen afgøres FØR de dyre læsninger (Security-fund: en afvist kalder
  // kostede før op mod tusindvis af svar-opslag pr. kald — uden App Check kan
  // det brænde kvoten af i en løkke; nu koster en afvisning 2 læsninger).
  const [leagueSnap, callerSnap] = await Promise.all([
    leagueRef.get(),
    db.collection('users').doc(uid).get(),
  ]);
  const memberUids = leagueSnap.exists
    ? (leagueSnap.data().memberUids || []).filter((u) => typeof u === 'string')
    : [];
  tjekSvarStatusAdgang({
    uid,
    bruger: callerSnap.exists ? callerSnap.data() : null,
    memberUids,
    ligaFindes: leagueSnap.exists,
  });
  if (!leagueSnap.exists) return null;

  const qSnap = await leagueRef.collection('questions').get();
  const spoergsmaal = qSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const aabne = spoergsmaal.filter((q) => erAabent(q, nowMs));
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
  byggSpoergsmaalStatus, hentSpoergsmaalStatus, tjekSvarStatusAdgang,
};
