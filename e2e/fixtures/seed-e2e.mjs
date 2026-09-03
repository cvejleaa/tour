// ---------------------------------------------------------------------------
// e2e/fixtures/seed-e2e.mjs — Playwrights globalSetup: seeder emulatorerne.
//
// Kører én gang før alle tests. Rydder Auth- og Firestore-emulatoren helt og
// skriver et deterministisk lille univers: to brugere (godkendt spiller og
// ejer), ét fodboldspil med fire hold, en runde med kickoff i fortiden (låst,
// med facit) og en runde med kickoff i fremtiden (kan tippes).
//
// KICKOFF BEREGNES VED SEED-TID (nu ± timer/dage), så fixturen er åben
// uanset dato. Og den skrives som Firestore-Timestamp: firestore.rules
// sammenligner `request.time < kickoff`, og et tal ville få reglen til at
// fejle lukket — tavs afvisning, ikke en fejl.
//
// KØRER ALDRIG MOD PRODUKTION. Scriptet nægter at starte, hvis
// GOOGLE_APPLICATION_CREDENTIALS er sat, og det taler kun med de emulator-
// værter, det selv sætter. GCLOUD_PROJECT sættes hårdt til emulator-projektet:
// firebase.json har singleProjectMode, og et andet projekt-id ville lægge
// data i et navnerum, appen aldrig ser — tom database uden fejl.
// ---------------------------------------------------------------------------
import admin from 'firebase-admin';
import { buildMatches } from '../../src/lib/superligaSeed.js';
import {
  PROJEKT, SPILLER, EJER, SPIL_ID, SPIL_NAVN, AABEN_RUNDE, LAAST_RUNDE,
} from './konstanter.mjs';

const TIME = 60 * 60 * 1000;
const DAG = 24 * TIME;

/** Fire opdigtede hold. Elo-tallene giver odds via buildMatches. */
const HOLD = [
  { name: 'Alfa BK', short: 'ALF', elo: 1550 },
  { name: 'Beta IF', short: 'BET', elo: 1500 },
  { name: 'Gamma FC', short: 'GAM', elo: 1480 },
  { name: 'Delta BK', short: 'DEL', elo: 1420 },
];

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

export default async function seed() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error('seed-e2e nægter at køre med GOOGLE_APPLICATION_CREDENTIALS sat — den er kun til emulatorer.');
  }
  const FIRESTORE = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8080';
  const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST || 'localhost:9099';
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
  for (const [bruger, role] of [[SPILLER, 'player'], [EJER, 'owner']]) {
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
  const kampe = buildMatches([
    { round: LAAST_RUNDE, home: 'Alfa BK', away: 'Beta IF', kickoff: Timestamp.fromMillis(nu - 7 * DAG) },
    { round: LAAST_RUNDE, home: 'Gamma FC', away: 'Delta BK', kickoff: Timestamp.fromMillis(nu - 6 * DAG) },
    { round: AABEN_RUNDE, home: 'Alfa BK', away: 'Gamma FC', kickoff: Timestamp.fromMillis(nu + 3 * TIME) },
    { round: AABEN_RUNDE, home: 'Beta IF', away: 'Delta BK', kickoff: Timestamp.fromMillis(nu + 27 * TIME) },
  ], HOLD);
  const facit = { [`r${LAAST_RUNDE}-alfabk-betaif`]: [2, 0], [`r${LAAST_RUNDE}-gammafc-deltabk`]: [1, 1] };
  const batch = db.batch();
  for (const k of kampe) {
    const [homeGoals, awayGoals] = facit[k.id] || [];
    batch.set(db.collection('games').doc(SPIL_ID).collection('matches').doc(k.id), {
      ...k,
      ...(homeGoals != null ? { homeGoals, awayGoals, status: 'finished' } : {}),
    });
  }
  // Spilleren deltager allerede — samme to felter som joinGame skriver.
  batch.set(db.collection('games').doc(SPIL_ID).collection('players').doc(SPILLER.uid), {
    uid: SPILLER.uid, joinedAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();
  await app.delete();
  console.log(`seed-e2e: ${kampe.length} kampe, 2 brugere, spil ${SPIL_ID} i ${PROJEKT}`);
}
