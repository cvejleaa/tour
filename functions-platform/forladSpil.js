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

function toMillis(t) {
  if (t == null) return null;
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (typeof t === 'number') return t;
  const ms = Date.parse(t);
  return Number.isFinite(ms) ? ms : null;
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

  const ligaer = await gameRef.collection('leagues').where('memberUids', 'array-contains', uid).get();
  const ejede = ligaer.docs.filter((d) => d.data()?.ownerUid === uid);
  if (ejede.length > 0) {
    const err = new Error('owns-league');
    err.ligaer = ejede.map((d) => d.data()?.name || d.id);
    throw err;
  }

  // Kommende kampes tips væk; låste kampes tips bliver (de andres historik).
  // En kamp uden kickoff kan ikke være låst — dens tip slettes.
  const [matchesSnap, betsSnap] = await Promise.all([
    gameRef.collection('matches').get(),
    gameRef.collection('bets').where('uid', '==', uid).get(),
  ]);
  const kickoff = new Map(matchesSnap.docs.map((d) => [d.id, toMillis(d.data()?.kickoff)]));
  const laast = (bet) => { const k = kickoff.get(bet.matchId); return k != null && k <= nowMs; };
  const slettes = betsSnap.docs.filter((d) => !laast(d.data() || {}));
  await sletAlle(db, slettes.map((d) => d.ref));

  for (const d of ligaer.docs) {
    await d.ref.update({ memberUids: FieldValue.arrayRemove(uid) });
  }

  // Sidst: flaget. Alt andet på dokumentet bliver stående — det er arkivet.
  await playerRef.update({ forladt: true, forladtAt: FieldValue.serverTimestamp() });

  return { slettedeTips: slettes.length, beholdteTips: betsSnap.size - slettes.length, ligaer: ligaer.size };
}

module.exports = { forladSpilCore, FORLAD_ERR, BATCH_LOFT, erForladt, aktiveSpillere };
