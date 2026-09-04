// ---------------------------------------------------------------------------
// e2e/fixtures/seed-e2e.mjs — Playwrights globalSetup: seeder emulatorerne.
//
// Kører én gang før alle tests. Rydder Auth- og Firestore-emulatoren helt og
// skriver et deterministisk lille univers: tre brugere (godkendt spiller,
// medspiller og ejer), ét fodboldspil med fire hold, en runde med kickoff i
// fortiden (låst, med facit) og en runde med kickoff i fremtiden (kan tippes),
// samt én liga med spiller og medspiller — med point skrevet direkte på
// players-dokumenterne, som kun serveren ellers må (stillingen viser kun dem,
// man deler liga med, så uden ligaen er den tom uden fejl).
//
// KICKOFF BEREGNES VED SEED-TID (nu ± timer/dage), så fixturen er åben
// uanset dato. Og den skrives som Firestore-Timestamp: firestore.rules
// sammenligner `request.time < kickoff`, og et tal ville få reglen til at
// fejle lukket — tavs afvisning, ikke en fejl.
//
// KØRER ALDRIG MOD PRODUKTION. Scriptet nægter at starte, hvis
// GOOGLE_APPLICATION_CREDENTIALS er sat, og det taler kun med emulator-værter
// på den lokale maskine: en FIRESTORE_EMULATOR_HOST, der peger andetsteds hen,
// afvises (Security kørte en sink-server og modtog både DELETE-kaldene og
// brugeroprettelsen — over plain HTTP). GCLOUD_PROJECT sættes hårdt:
// firebase.json har singleProjectMode, og et andet projekt-id ville lægge
// data i et navnerum, appen aldrig ser — tom database uden fejl.
// ---------------------------------------------------------------------------
import admin from 'firebase-admin';
import { buildMatches } from '../../src/lib/superligaSeed.js';
import {
  PROJEKT, SPILLER, EJER, MODSPILLER, FREMMED, FORLADT, SPIL_ID, SPIL_NAVN, AABEN_RUNDE, LAAST_RUNDE, UDSAT_RUNDE,
  LIGA_ID, LIGA_NAVN, FREMMED_LIGA_ID, POINT,
  HOLD,
} from './konstanter.mjs';

const TIME = 60 * 60 * 1000;
const DAG = 24 * TIME;


/** Vent på at en emulator svarer — Java-opstarten kan tage 10-20 s i CI. */
async function ventPaa(url, navn, forsoeg = 15) {
  for (let i = 1; i <= forsoeg; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch { /* ikke oppe endnu */ }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`${navn} svarer ikke på ${url} efter ${forsoeg} forsøg`);
}

/** Kun den lokale maskine. Alt andet er ikke en emulator, vi kender. */
export function erLokalVaert(host) {
  const navn = String(host || '').replace(/^\[?(.*?)\]?:\d+$/, '$1');
  return ['localhost', '127.0.0.1', '::1'].includes(navn);
}

export default async function seed() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error('seed-e2e nægter at køre med GOOGLE_APPLICATION_CREDENTIALS sat — den er kun til emulatorer.');
  }
  const FIRESTORE = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8080';
  const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST || 'localhost:9099';
  for (const [navn, host] of [['FIRESTORE_EMULATOR_HOST', FIRESTORE], ['FIREBASE_AUTH_EMULATOR_HOST', AUTH]]) {
    if (!erLokalVaert(host)) throw new Error(`seed-e2e: ${navn}=${host} er ikke en lokal vært — nægter at rydde og seede der.`);
  }
  process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE;
  process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH;
  process.env.GCLOUD_PROJECT = PROJEKT;
  // firebase-admin leder ellers efter GCE-metadata og advarer, når den ikke findes.
  process.env.METADATA_SERVER_DETECTION ||= 'none';

  await ventPaa(`http://${FIRESTORE}/`, 'Firestore-emulatoren');
  await ventPaa(`http://${AUTH}/`, 'Auth-emulatoren');

  // Ryd alt fra sidste kørsel — begge emulatorer har et REST-endpoint til det.
  for (const url of [
    `http://${AUTH}/emulator/v1/projects/${PROJEKT}/accounts`,
    `http://${FIRESTORE}/emulator/v1/projects/${PROJEKT}/databases/(default)/documents`,
  ]) {
    const res = await fetch(url, { method: 'DELETE' });
    if (!res.ok) throw new Error(`Kunne ikke rydde ${url}: ${res.status}`);
  }

  const app = admin.apps.length ? admin.app() : admin.initializeApp({ projectId: PROJEKT });
  const auth = admin.auth();
  const db = admin.firestore();
  const { Timestamp, FieldValue } = admin.firestore;
  const nu = Date.now();

  // Brugere: Auth-konto + offentlig profil + privat kontakt — samme tre
  // dokumenter, som signup (useAuthActions.js) og bootstrap-owner.mjs skriver.
  for (const [bruger, role] of [[SPILLER, 'player'], [MODSPILLER, 'player'], [FREMMED, 'player'], [FORLADT, 'player'], [EJER, 'owner']]) {
    await auth.createUser({
      uid: bruger.uid, email: bruger.email, password: bruger.password,
      displayName: bruger.displayName, emailVerified: true,
    });
    await db.collection('users').doc(bruger.uid).set({
      displayName: bruger.displayName, role, status: 'approved',
      createdAt: FieldValue.serverTimestamp(), approvedAt: FieldValue.serverTimestamp(),
    });
    await db.collection('userContacts').doc(bruger.uid).set({ uid: bruger.uid, email: bruger.email });
  }

  // Spillet. Ingen startRound/startAt: så gater startRundeFor intet.
  await db.collection('games').doc(SPIL_ID).set({
    name: SPIL_NAVN, shortName: 'E2E', emoji: '🧪',
    type: 'football', status: 'open', joinable: true,
    season: '2026-27', order: 99, teams: HOLD,
  });

  // Kampe: låst runde (facit) og åben runde. Kickoff relativt til nu.
  //
  // Runde 18 er den med en UDSAT kamp: to spillede for to uger siden og én
  // om 1½ time — i runde 20's uge, og FØR runde 20's egne. Det er ejerens
  // fejl fra 3/9 (#213): tælleren så kun rundens egne kampe. To uger, ikke én:
  // ugen løber tirsdag→mandag, og med nu−7d/nu−6d kunne én af de spillede
  // lande i samme uge som den udsatte, alt efter ugedag — så var den ikke
  // lånt. Med 13–14 dage kan det ikke ske.
  const kampe = buildMatches([
    { round: UDSAT_RUNDE, home: 'Alfa BK', away: 'Delta BK', kickoff: Timestamp.fromMillis(nu - 14 * DAG) },
    { round: UDSAT_RUNDE, home: 'Beta IF', away: 'Gamma FC', kickoff: Timestamp.fromMillis(nu - 13 * DAG) },
    { round: UDSAT_RUNDE, home: 'Delta BK', away: 'Beta IF', kickoff: Timestamp.fromMillis(nu + 1.5 * TIME) },
    { round: LAAST_RUNDE, home: 'Alfa BK', away: 'Beta IF', kickoff: Timestamp.fromMillis(nu - 7 * DAG) },
    { round: LAAST_RUNDE, home: 'Gamma FC', away: 'Delta BK', kickoff: Timestamp.fromMillis(nu - 6 * DAG) },
    { round: AABEN_RUNDE, home: 'Alfa BK', away: 'Gamma FC', kickoff: Timestamp.fromMillis(nu + 3 * TIME) },
    { round: AABEN_RUNDE, home: 'Beta IF', away: 'Delta BK', kickoff: Timestamp.fromMillis(nu + 27 * TIME) },
  ], HOLD);
  const facit = {
    [`r${UDSAT_RUNDE}-alfabk-deltabk`]: [1, 0], [`r${UDSAT_RUNDE}-betaif-gammafc`]: [2, 2],
    [`r${LAAST_RUNDE}-alfabk-betaif`]: [2, 0], [`r${LAAST_RUNDE}-gammafc-deltabk`]: [1, 1],
  };
  const batch = db.batch();
  for (const k of kampe) {
    const [homeGoals, awayGoals] = facit[k.id] || [];
    batch.set(db.collection('games').doc(SPIL_ID).collection('matches').doc(k.id), {
      ...k,
      ...(homeGoals != null ? { homeGoals, awayGoals, status: 'finished' } : {}),
    });
  }
  // Spiller og medspiller deltager allerede (uid + joinedAt som joinGame
  // skriver) og deler én liga. leagueIds og totalPoints er serverens felter —
  // reglerne afviser dem fra klienten, så de kan kun komme fra et seed.
  // Den fremmede deltager i spillet, men i sin egen liga. Uden hende ville
  // stillingens test være grøn med filteret fjernet: alt, reglen tillader, er
  // så også alt, der findes. Hun er det dokument, reglen skal afvise.
  const spil = db.collection('games').doc(SPIL_ID);
  for (const [b, liga] of [[SPILLER, LIGA_ID], [MODSPILLER, LIGA_ID], [FREMMED, FREMMED_LIGA_ID]]) {
    batch.set(spil.collection('players').doc(b.uid), {
      uid: b.uid, joinedAt: FieldValue.serverTimestamp(),
      leagueIds: [liga], totalPoints: POINT[b.uid],
    });
  }
  // Den forladte: dokumentet er et arkiv (forladSpil) — point bliver stående,
  // forladt: true, ingen ligaer. Reglerne lader hende selv fjerne flaget
  // ("Vend tilbage"); fladen viser hende kortet under Åbne spil.
  batch.set(spil.collection('players').doc(FORLADT.uid), {
    uid: FORLADT.uid, joinedAt: Timestamp.fromMillis(nu - 30 * DAG),
    leagueIds: [], totalPoints: 3, forladt: true, forladtAt: Timestamp.fromMillis(nu - 3 * DAG),
  });
  // Samme felter som createLeague skriver, plus det andet medlem.
  batch.set(spil.collection('leagues').doc(LIGA_ID), {
    name: LIGA_NAVN, ownerUid: SPILLER.uid, memberUids: [SPILLER.uid, MODSPILLER.uid],
    code: 'E2E-KODE', createdAt: FieldValue.serverTimestamp(),
  });
  batch.set(spil.collection('leagues').doc(FREMMED_LIGA_ID), {
    name: 'De andre', ownerUid: FREMMED.uid, memberUids: [FREMMED.uid],
    code: 'E2E-ANDRE', createdAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();
  await app.delete();
  console.log(`seed-e2e: ${kampe.length} kampe, 4 brugere, 2 ligaer, spil ${SPIL_ID} i ${PROJEKT}`);
}
