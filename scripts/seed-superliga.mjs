// ---------------------------------------------------------------------------
// scripts/seed-superliga.mjs — seeder Superliga-kampe (med frosne odds) + hold-
// Elo til spillet games/superliga2627 på platformen (spil-89af9).
//
// Odds fryses pr. kamp ud fra holdenes Elo (elo-lite) på seedet-tidspunktet, så
// "Chancen" afregnes deterministisk. Kør igen for at opdatere (idempotent pr.
// kamp-id). Sætter IKKE facit/result — det gør resultat-synken/administrator.
//
// BRUG:
//   Mod emulator:
//     FIRESTORE_EMULATOR_HOST=localhost:8080 node scripts/seed-superliga.mjs [fixtures.json]
//   Mod platformen:
//     GOOGLE_APPLICATION_CREDENTIALS=/sti/sa.json node scripts/seed-superliga.mjs [fixtures.json]
//
// fixtures.json (default: scripts/superliga-fixtures.json) er en liste af
//   { "round": <tal>, "home": "<holdnavn>", "away": "<holdnavn>", "kickoff": "<ISO>" }
// Se scripts/superliga-fixtures.example.json for formatet. Holdnavne skal matche
// src/data/superligaTeams2026.js (ellers bruges neutral Elo).
// ---------------------------------------------------------------------------

const admin = (await import('firebase-admin')).default;
const { readFileSync } = await import('fs');
const { buildMatches } = await import('../src/lib/superligaSeed.js');
const { SUPERLIGA_TEAMS_2026 } = await import('../src/data/superligaTeams2026.js');

const GAME_ID = 'superliga2627';
const fixturesPath = process.argv[2] || 'scripts/superliga-fixtures.json';

let app;
if (process.env.FIRESTORE_EMULATOR_HOST) {
  console.log(`Forbinder til Firestore Emulator: ${process.env.FIRESTORE_EMULATOR_HOST}`);
  app = admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'spil-89af9' });
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  const serviceAccount = JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));
  app = admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
} else {
  app = admin.initializeApp();
}

const db = admin.firestore();
const { Timestamp, FieldValue } = admin.firestore;

function loadFixtures(path) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    console.error(`\n⚠️  Fandt ikke fixtures-filen: ${path}`);
    console.error('   Angiv en sti, eller kopiér scripts/superliga-fixtures.example.json');
    console.error('   til scripts/superliga-fixtures.json og indsæt det officielle program.\n');
    process.exit(1);
  }
  const data = JSON.parse(raw);
  const list = Array.isArray(data) ? data : data.fixtures;
  if (!Array.isArray(list)) throw new Error('fixtures-filen skal være en liste (eller {fixtures:[...]}).');
  // Ignorér kommentar-felter (nøgler der starter med _).
  return list.filter((f) => f && f.home && f.away && f.round != null);
}

async function run() {
  const fixtures = loadFixtures(fixturesPath);
  console.log(`\nSeeder ${fixtures.length} Superliga-kampe fra ${fixturesPath}...`);

  // Gem hold-Elo på spil-dokumentet: `teams` = SEED (fast startpunkt for den
  // levende genberegning), `eloCurrent` = aktuel Elo (starter = seed, opdateres
  // løbende af recomputeSeasonElo når resultater kommer ind).
  const eloCurrent = {};
  for (const t of SUPERLIGA_TEAMS_2026) eloCurrent[t.name] = t.elo;
  // Pulje-/bonus-deadline sættes IKKE her — den styres af admin i "Spil-tidsplan"
  // (game.puljeLockAt), så bonus-tippet kan holdes åbent forbi runde 1, indtil
  // spillerne er kommet med. Uden en deadline er bonus-tippet åbent.
  await db.collection('games').doc(GAME_ID).set({
    teams: SUPERLIGA_TEAMS_2026,
    eloCurrent,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  const matches = buildMatches(fixtures, SUPERLIGA_TEAMS_2026);
  const batch = db.batch();
  for (const m of matches) {
    const kickoff = m.kickoff ? Timestamp.fromDate(new Date(m.kickoff)) : null;
    const ref = db.collection('games').doc(GAME_ID).collection('matches').doc(m.id);
    batch.set(ref, {
      round: m.round, home: m.home, away: m.away,
      kickoff, eloHome: m.eloHome, eloAway: m.eloAway, odds: m.odds,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    console.log(`  • R${m.round}: ${m.home}–${m.away}  odds ${m.odds['1']}/${m.odds.X}/${m.odds['2']}`);
  }
  await batch.commit();
  console.log(`\n✅ ${matches.length} kampe seedet til games/${GAME_ID}/matches.`);
}

run()
  .then(() => app.delete())
  .then(() => process.exit(0))
  .catch((err) => { console.error('Seed-fejl:', err); process.exit(1); });
