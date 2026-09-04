// ---------------------------------------------------------------------------
// forladSpil — en spiller forlader et spil. ARKIV, ikke sletning.
//
// Ejerens beslutning (efter Spilførerens råd): historikken er de andres lige
// så meget som hendes. "Hvem tippede hvad" på en spillet kamp, det indbyrdes
// opgør og rundesejrene må ikke ændre sig med tilbagevirkende kraft, fordi én
// spiller går. Derfor:
//
//   - players/{uid} bliver liggende med `forladt: true` (+ tidspunkt). Point,
//     perRound, opdeling og detalje-rækker røres ikke. Kommer hun tilbage i
//     sæsonen, fjernes flaget, og hun har sin stilling igen (joinGame).
//   - Tips på kampe, der IKKE er låst endnu, slettes: hun skal ikke score
//     point fremover. Tips på låste/spillede kampe bliver stående.
//   - Hun fjernes fra alle ligaers memberUids. syncPlayerLeagues tømmer
//     leagueIds, og uden fælles liga er hun usynlig i stillingen.
//   - Puljetippet bliver stående (det er hendes sæsonforudsigelse; afregnes
//     den, lander bonussen i arkivet).
//
// Hvorfor en callable: klienten kan ikke slette bets (`allow delete: if
// false`) og ikke skrive ligaernes medlemsliste. Og genopstandelsen, som en
// SLETNING ville have givet (recalcPlayerTotal finder uid'er i BETS og
// opretter players-dokumentet med set+mergeFields), findes ikke her: dokumentet
// slettes aldrig.
//
// Serverens læsere af players (påmindelser, opsamling, rang-snapshots) skal
// springe forladte over — brug `aktiveSpillere`, så listen står ét sted.
// Ejer hun en liga i spillet, afvises udmeldelsen: ligaens ejer kan ikke
// forlade sin liga, og at slette den for de andre er ikke en bivirkning af
// et klik på Forlad. Hun sletter eller overdrager ligaen først.
// ---------------------------------------------------------------------------

const { erKampLaast } = require('./chanceVagt');

const FORLAD_ERR = {
  unauthenticated: ['unauthenticated', 'Log ind for at forlade spillet.'],
  'no-game': ['not-found', 'Spillet findes ikke.'],
  'not-member': ['failed-precondition', 'Du deltager ikke i spillet.'],
  // Samme grænse som fladen: Forlad-knappen findes kun for åbne spil.
  'not-open': ['failed-precondition', 'Spillet kan ikke forlades, når det er i gang eller afsluttet.'],
  'owns-league': ['failed-precondition', 'Du ejer en liga i spillet. Slet ligaen først, så kan du forlade spillet.'],
};

/** Firestore tillader højst 500 skrivninger pr. batch. */
const BATCH_LOFT = 400;

/** Er dette players-dokument en spiller, der har forladt spillet? */
function erForladt(data) {
  return data?.forladt === true;
}

/** Kun de spillere, der er med — til alt, der sender, tæller eller rangerer. */
function aktiveSpillere(docs) {
  return (docs || []).filter((d) => !erForladt(typeof d.data === 'function' ? d.data() : null));
}

async function sletAlle(db, refs) {
  for (let i = 0; i < refs.length; i += BATCH_LOFT) {
    const batch = db.batch();
    refs.slice(i, i + BATCH_LOFT).forEach((r) => batch.delete(r));
    await batch.commit();
  }
}

/**
 * Forlad et spil. Kaster Error med en nøgle fra FORLAD_ERR.
 * @returns {Promise<{slettedeTips:number, beholdteTips:number, ligaer:number}>}
 */
async function forladSpilCore(db, FieldValue, { uid, gameId, nowMs = Date.now() }) {
  if (!uid) throw new Error('unauthenticated');
  if (!gameId) throw new Error('no-game');
  const gameRef = db.collection('games').doc(gameId);
  const gameSnap = await gameRef.get();
  if (!gameSnap.exists) throw new Error('no-game');
  if (gameSnap.data()?.status !== 'open') throw new Error('not-open');

  const playerRef = gameRef.collection('players').doc(uid);
  const playerSnap = await playerRef.get();
  if (!playerSnap.exists || erForladt(playerSnap.data())) throw new Error('not-member');

  // Ejerskab spørges DIREKTE — ikke som et filter på medlemslisten. Reglerne
  // lader en ejer fjerne sig selv fra memberUids, og så ville hun forlade
  // spillet, mens hun stadig ejede en liga, hun ikke engang kunne læse
  // (Security kørte det i emulatoren).
  const [ligaer, ejede] = await Promise.all([
    gameRef.collection('leagues').where('memberUids', 'array-contains', uid).get(),
    gameRef.collection('leagues').where('ownerUid', '==', uid).get(),
  ]);
  if (ejede.size > 0) {
    const err = new Error('owns-league');
    err.ligaer = ejede.docs.map((d) => d.data()?.name || d.id);
    throw err;
  }

  const ryddet = await rydOpEfterSpiller(db, FieldValue, gameRef, uid, { nowMs, ligaer });

  // Sidst: flaget. Alt andet på dokumentet bliver stående — det er arkivet.
  await playerRef.update({ forladt: true, forladtAt: FieldValue.serverTimestamp() });

  return ryddet;
}

/**
 * Det, der skal ske i ét spil, når en spiller ikke længere er med — delt af
 * forladSpil (spilleren går selv) og adminDeleteUser (ejeren sletter kontoen):
 * kommende kampes tips slettes, låste kampes tips bliver (de andres historik),
 * og spilleren fjernes fra alle ligaers memberUids. Rører IKKE players-
 * dokumentet — det afgør kalderen (arkivér eller slet).
 *
 * "Låst" er Chancens delte prædikat (erKampLaast): facit, i gang, passeret
 * kickoff — og en ukendt kamp eller en uden kickoff regnes som låst, så
 * tippet BEHOLDES: et slettet tip er en frigivet Chance og et forsvundet
 * minus-point ved næste genberegning (Security-fund).
 *
 * @returns {{slettedeTips:number, beholdteTips:number, ligaer:number}}
 */
async function rydOpEfterSpiller(db, FieldValue, gameRef, uid, { nowMs = Date.now(), ligaer = null } = {}) {
  const [matchesSnap, betsSnap, ligaSnap] = await Promise.all([
    gameRef.collection('matches').get(),
    gameRef.collection('bets').where('uid', '==', uid).get(),
    ligaer ? Promise.resolve(ligaer) : gameRef.collection('leagues').where('memberUids', 'array-contains', uid).get(),
  ]);
  const kampAf = new Map(matchesSnap.docs.map((d) => [d.id, { ...d.data(), id: d.id }]));
  const slettes = betsSnap.docs.filter((d) => !erKampLaast(kampAf.get(d.data()?.matchId) || null, nowMs));
  await sletAlle(db, slettes.map((d) => d.ref));

  for (const d of ligaSnap.docs) {
    await d.ref.update({ memberUids: FieldValue.arrayRemove(uid) });
  }

  return { slettedeTips: slettes.length, beholdteTips: betsSnap.size - slettes.length, ligaer: ligaSnap.size };
}

module.exports = { forladSpilCore, rydOpEfterSpiller, FORLAD_ERR, BATCH_LOFT, erForladt, aktiveSpillere };
