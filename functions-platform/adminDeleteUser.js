// ---------------------------------------------------------------------------
// adminDeleteUser — KUN ejeren: slet en bruger (Auth-konto + users-profil +
// userContacts) og ryd op efter hende i alle spil. Kan ikke slette sig selv.
// Bruges bl.a. til at rydde dublet-konti op.
//
// FØR: kun players-dokumentet blev slettet. Tips blev liggende — og
// recalcPlayerTotal samler sine uid'er fra BETS og skriver players-dokumentet
// tilbage med set+mergeFields ved næste afgjorte kamp. En slettet bruger
// genopstod altså i spillet uden navn og uden profil (QC-fund, 3/9 2026).
//
// NU følger sletningen ARKIV-modellen fra forladSpil, som ejeren valgte:
//   - i hvert spil, hun er med i: kommende kampes tips slettes, låste kampes
//     tips bliver (de andres historik), hun fjernes fra ligaernes memberUids
//     (rydOpEfterSpiller — samme funktion som forladSpil);
//   - har hun INGEN tips tilbage, slettes players-dokumentet (dublet-tilfældet)
//     — OG hendes puljetip: settlePuljeBets skriver bonusPoints på players-
//     dokumentet med set+merge for HVERT puljeBets-dokument, så et efterladt
//     puljetip ville skabe dokumentet igen (QC-fund, samme klasse som bets);
//   - har hun tips på spillede kampe, bliver dokumentet som arkiv med
//     forladt: true og slettet: true — så aktiveSpillere springer hende over,
//     og genberegningen ikke kan skabe et nyt, navnløst dokument.
//   - Ejer hun en liga, afvises sletningen: ligaen skal slettes eller
//     overdrages først — også med force. Reglerne fra forladSpil.
//   - Har hun point, kræves force (så en rigtig spiller ikke fjernes ved en
//     fejl). Kun DEN fejl kan forceres — svaret bærer `kanForceres`.
//
// RÆKKEFØLGE OG GENTAGELSE: alle vagter kører først, uden at skrive. Derefter
// Auth-kontoen, så users/userContacts, så spillene. Ingen transaktion på tværs
// (Auth og Firestore kan ikke dele én). Fejler et spil midtvejs, er login og
// profil væk, men tips ligger tilbage — og kaldet kan køres IGEN: Auth
// «findes ikke» tolereres, sletninger er idempotente, og et arkiveret
// dokument arkiveres blot igen. Ejeren ser fejlen i fladen og trykker igen.
// ---------------------------------------------------------------------------

const { rydOpEfterSpiller } = require('./forladSpil');

const SLET_ERR = {
  'not-owner': ['permission-denied', 'Kun ejeren kan slette brugere.'],
  'no-uid': ['invalid-argument', 'Mangler bruger-id.'],
  self: ['failed-precondition', 'Du kan ikke slette dig selv.'],
  'has-points': ['failed-precondition', 'Brugeren har point i "%s". Bekræft med force for at slette alligevel.'],
  'owns-league': ['failed-precondition', 'Brugeren ejer en liga i "%s". Slet eller overdrag ligaen først.'],
  auth: ['internal', 'Kunne ikke slette Auth-kontoen.'],
};

/**
 * @param {object} db
 * @param {object} FieldValue
 * @param {object} p
 * @param {string} p.uid          – brugeren, der slettes
 * @param {string} p.callerUid
 * @param {string} p.callerRole   – 'owner' kræves
 * @param {boolean} p.force       – slet selv om hun har point
 * @param {(uid:string)=>Promise<void>} p.sletAuth – sletter Auth-kontoen; skal tolerere "findes ikke"
 * @param {number} [p.nowMs]
 */
async function adminDeleteUserCore(db, FieldValue, { uid, callerUid, callerRole, force = false, sletAuth, nowMs = Date.now() }) {
  if (callerRole !== 'owner') throw fejl('not-owner');
  uid = String(uid || '').trim();
  if (!uid) throw fejl('no-uid');
  if (uid === callerUid) throw fejl('self');

  const gamesSnap = await db.collection('games').get();
  // Alle vagter FØR nogen skrivning — Auth-kontoen må ikke være væk, hvis et
  // spil afviser.
  const medlemskaber = [];
  for (const g of gamesSnap.docs) {
    const p = await g.ref.collection('players').doc(uid).get();
    if (!p.exists) continue;
    const navn = g.data()?.name || g.id;
    const ejede = await g.ref.collection('leagues').where('ownerUid', '==', uid).get();
    if (ejede.size > 0) throw fejl('owns-league', navn);
    if (!force && (Number(p.data().totalPoints) || 0) > 0) throw fejl('has-points', navn, { kanForceres: true });
    medlemskaber.push({ g, navn, playerRef: p.ref });
  }

  try {
    await sletAuth(uid);
  } catch (e) {
    if (e?.code !== 'auth/user-not-found') throw fejl('auth');
  }

  const batch = db.batch();
  batch.delete(db.collection('users').doc(uid));
  batch.delete(db.collection('userContacts').doc(uid));
  await batch.commit();

  const spil = [];
  for (const { g, navn, playerRef } of medlemskaber) {
    const ryddet = await rydOpEfterSpiller(db, FieldValue, g.ref, uid, { nowMs });
    let dokument;
    if (ryddet.beholdteTips === 0) {
      // Intet at genopstå fra: væk med dokumentet, dets underdokument — og
      // puljetippet, som ellers ville skrive dokumentet tilbage ved afregning.
      await g.ref.collection('puljeBets').doc(uid).delete();
      await playerRef.collection('detalje').doc('opdeling').delete();
      await playerRef.delete();
      dokument = 'slettet';
    } else {
      await playerRef.update({ forladt: true, forladtAt: FieldValue.serverTimestamp(), slettet: true });
      dokument = 'arkiveret';
    }
    spil.push({ spil: g.id, navn, ...ryddet, dokument });
  }

  return { ok: true, uid, spil };
}

function fejl(kode, navn, details) {
  const e = new Error(kode);
  if (navn) e.navn = navn;
  if (details) e.details = details;
  return e;
}

/** Oversæt kernens fejl til [httpCode, tekst, details] — til HttpsError. */
function sletFejl(err) {
  const [httpCode, skabelon] = SLET_ERR[err.message] || ['internal', 'Kunne ikke slette brugeren.'];
  return [httpCode, skabelon.replace('%s', err.navn || ''), err.details || undefined];
}

module.exports = { adminDeleteUserCore, SLET_ERR, sletFejl };
