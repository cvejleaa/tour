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
  // Admin-medlemsstyringen (#61) deler tabellen — én oversættelse pr. kode.
  'not-admin': ['permission-denied', 'Kun en administrator kan ændre liga-medlemmer.'],
  'no-game': ['not-found', 'Spillet findes ikke.'],
  'no-league': ['not-found', 'Ligaen findes ikke i dette spil.'],
  'no-target': ['not-found', 'Brugeren findes ikke.'],
  'owner-locked': ['failed-precondition', 'Ligaens ejer kan ikke fjernes. Slet ligaen i stedet.'],
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

/**
 * Må denne bruger STYRE liga-medlemmer? Én beslutning ét sted.
 *
 * Bevidst SNÆVRERE end tjekSvarStatusAdgang: dér må et medlem se sin egen
 * ligas svar-status, men her er der ingen medlems-gren. Medlemskab afgør, hvem
 * der ser hvis tips, og en tilføjelse afslører hele tip-historikken begge veje
 * (se firestore.rules-kommentaren ved leagueIds-spejlingen). Derfor: kun
 * globalAdmin og owner, læst af users/{uid}.role — samme kilde som
 * isGlobalAdmin() i reglerne. Klientens fane-gate er kosmetik; DEN HER er
 * autoriteten.
 */
function tjekMedlemsstyringAdgang(bruger) {
  if (!bruger || bruger.status !== 'approved') throw new Error('not-approved');
  if (bruger.role !== 'owner' && bruger.role !== 'globalAdmin') throw new Error('not-admin');
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

/**
 * LÆSE-vejen: alle ligaer i ét spil, med medlemmernes navne — til admin.
 *
 * HVORFOR DEN SKAL VÆRE EN CALLABLE. `firestore.rules:952` tillader kun at
 * læse en spil-liga, hvis man selv står i memberUids. Der er INGEN
 * admin-gren, modsat top-niveau `leagues` (linje 344) — og det er præcis
 * derfor Tour-adminfanen virker, mens en tilsvarende klient-query her ville
 * give permission-denied for en admin, der ikke selv er medlem. Reglen åbnes
 * ikke; læsningen flyttes til serveren.
 *
 * Returnerer OGSÅ spillets deltagere, så fladen kan tilbyde dem i vælgeren
 * uden et ekstra kald — og så "hvem kan tilføjes" er ét svar fra én kilde.
 */
async function hentLigaMedlemmer(db, { uid, gameId }) {
  if (!uid) throw new Error('unauthenticated');
  if (!gameId) throw new Error('bad-code');
  const brugerSnap = await db.collection('users').doc(uid).get();
  tjekMedlemsstyringAdgang(brugerSnap.exists ? brugerSnap.data() : null);

  const gameSnap = await db.collection('games').doc(gameId).get();
  if (!gameSnap.exists) throw new Error('no-game');

  const [ligaSnap, spillerSnap] = await Promise.all([
    db.collection('games').doc(gameId).collection('leagues').get(),
    db.collection('games').doc(gameId).collection('players').get(),
  ]);

  // Navne til alle, der optræder — både medlemmer og mulige tilføjelser.
  const uids = new Set();
  for (const d of ligaSnap.docs) for (const u of (d.data().memberUids || [])) uids.add(u);
  for (const d of spillerSnap.docs) uids.add(d.id);
  const navne = new Map();
  for (const del of [...uids]) {
    const u = await db.collection('users').doc(del).get();
    const dn = u.exists ? u.data()?.displayName : null;
    navne.set(del, (typeof dn === 'string' && dn.trim() ? dn : 'Spiller').slice(0, 60));
  }
  const navnFor = (u) => ({ uid: u, navn: navne.get(u) || 'Spiller' });

  return {
    // `code` udelades med vilje: en admin skal kunne styre medlemmer uden at
    // få ligaens invitationskode udleveret i en API-svar-krop.
    ligaer: ligaSnap.docs.map((d) => {
      const data = d.data();
      const members = Array.isArray(data.memberUids) ? data.memberUids : [];
      return {
        id: d.id,
        navn: String(data.name || '').slice(0, 80),
        ownerUid: data.ownerUid || null,
        medlemmer: members.map(navnFor),
      };
    }).sort((a, b) => a.navn.localeCompare(b.navn, 'da')),
    deltagere: spillerSnap.docs.map((d) => navnFor(d.id))
      .sort((a, b) => a.navn.localeCompare(b.navn, 'da')),
  };
}

/**
 * SKRIVE-vejen: meld en spiller ind i eller ud af en liga i et spil.
 *
 * ARBEJDET ER KUN ÉN arrayUnion/arrayRemove. `syncPlayerLeagues`
 * (index.js, onDocumentWritten på games/{gameId}/leagues/{leagueId}) spejler
 * selv ændringen ned i players/{uid}.leagueIds OG i leagueIds på alle
 * spillerens bets. Skriv ALDRIG de felter her: to skrivepunkter om samme
 * sandhed betyder, at den sidste vinder, og at en fejl i den ene er usynlig.
 *
 * SPILLEREN OPRETTES, HVIS HAN MANGLER — samme adfærd som
 * redeemLeagueCodeCore. Det er ikke bekvemmelighed: `applyMembershipDelta`
 * SPRINGER TAVST OVER en uid uden players-dokument, og så ville brugeren stå
 * i memberUids uden leagueIds — han kunne læse ligaen og væggen, men ville
 * ikke optræde i stillingen og dele ingen tips. Første udkast af denne
 * funktion afviste i stedet, men det modsagde husets eget svar: en
 * liga-invitation ER en invitation til spillet.
 *
 * EJEREN KAN IKKE FJERNES. deleteLeague findes til at nedlægge en liga; en
 * ejerløs liga er en tilstand, ingen flade kan rette.
 */
async function saetLigaMedlemCore(db, FieldValue, { uid, gameId, leagueId, maalUid, medlem }) {
  if (!uid) throw new Error('unauthenticated');
  if (!gameId || !leagueId || !maalUid) throw new Error('bad-code');
  const brugerSnap = await db.collection('users').doc(uid).get();
  tjekMedlemsstyringAdgang(brugerSnap.exists ? brugerSnap.data() : null);

  const maalSnap = await db.collection('users').doc(maalUid).get();
  if (!maalSnap.exists) throw new Error('no-target');
  // En afvist bruger lukkes ikke ind ad bagdøren — samme værn som
  // redeemLeagueCodeCore har mod den bortviste.
  if (maalSnap.data().status === 'rejected') throw new Error('rejected');

  const ligaRef = db.collection('games').doc(gameId).collection('leagues').doc(leagueId);
  const ligaSnap = await ligaRef.get();
  if (!ligaSnap.exists) throw new Error('no-league');
  const data = ligaSnap.data();
  const members = Array.isArray(data.memberUids) ? data.memberUids : [];

  if (!medlem) {
    if (data.ownerUid === maalUid) throw new Error('owner-locked');
    if (!members.includes(maalUid)) return { aendret: false, medlem: false };
    await ligaRef.update({ memberUids: FieldValue.arrayRemove(maalUid) });
    return { aendret: true, medlem: false };
  }

  if (members.includes(maalUid)) return { aendret: false, medlem: true };
  if (maalSnap.data().status !== 'approved') {
    await db.collection('users').doc(maalUid).update({ status: 'approved' });
  }
  const playerRef = db.collection('games').doc(gameId).collection('players').doc(maalUid);
  if (!(await playerRef.get()).exists) {
    await playerRef.set({ uid: maalUid, joinedAt: FieldValue.serverTimestamp() });
  }
  await ligaRef.update({ memberUids: FieldValue.arrayUnion(maalUid) });
  return { aendret: true, medlem: true };
}

module.exports = {
  normalizeCode, redeemLeagueCodeCore, LEAGUE_ERR,
  byggSpoergsmaalStatus, hentSpoergsmaalStatus, tjekSvarStatusAdgang,
  tjekMedlemsstyringAdgang, hentLigaMedlemmer, saetLigaMedlemCore,
};
