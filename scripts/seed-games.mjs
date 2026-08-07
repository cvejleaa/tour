// ---------------------------------------------------------------------------
// scripts/seed-games.mjs — Seeder games-collection'en til den samlede platform
// (tip.vejleaa.dk / projekt spil-89af9). Ét dokument pr. spil; se
// docs/samlet-platform.md. Kan køres flere gange (idempotent, merge).
//
// BRUG:
//   Mod emulator:
//     FIRESTORE_EMULATOR_HOST=localhost:8080 node scripts/seed-games.mjs
//   Mod platform-projektet:
//     GOOGLE_APPLICATION_CREDENTIALS=/sti/serviceAccount.json node scripts/seed-games.mjs
//
// Krav: firebase-admin.
// ---------------------------------------------------------------------------

const admin = (await import('firebase-admin')).default;

let app;
if (process.env.FIRESTORE_EMULATOR_HOST) {
  console.log(`Forbinder til Firestore Emulator: ${process.env.FIRESTORE_EMULATOR_HOST}`);
  app = admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'spil-89af9' });
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  const { readFileSync } = await import('fs');
  const serviceAccount = JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));
  app = admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
} else {
  app = admin.initializeApp();
}

const db = admin.firestore();
const now = admin.firestore.FieldValue.serverTimestamp();

const { GAMES } = await import('./games.mjs');

// Felter, admin styrer fra Spil-tidsplan-fanen. På et spil, der allerede
// findes, er virkeligheden i Firestore mere rigtig end listen heroppe: seedet
// ville ellers stille rulle en "Afsluttet"-markering tilbage ved næste kørsel —
// uden fejl og uden spor, fordi det skriver med merge.
const ADMIN_OWNED = ['status', 'joinable'];

async function seedGames() {
  console.log(`\nSeeder ${GAMES.length} spil i games-collection'en...`);
  const batch = db.batch();
  for (const { id, ...data } of GAMES) {
    const ref = db.collection('games').doc(id);
    const exists = (await ref.get()).exists;
    const payload = { ...data, updatedAt: now };
    if (exists) {
      for (const f of ADMIN_OWNED) delete payload[f];
    } else {
      payload.createdAt = now;
    }
    batch.set(ref, payload, { merge: true });
    console.log(exists
      ? `  • ${id} — ${data.name} (findes; status/joinable urørt)`
      : `  • ${id} — ${data.name} (ny, ${data.status})`);
  }
  await batch.commit();
  console.log('Spil seedet.');
}

seedGames()
  .then(() => { console.log('\n✅ Færdig.'); return app.delete(); })
  .then(() => process.exit(0))
  .catch((err) => { console.error('Seed-fejl:', err); process.exit(1); });
