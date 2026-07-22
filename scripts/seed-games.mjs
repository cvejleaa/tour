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

// De spil platformen kender. status/joinable afspejler virkeligheden 20/7-2026:
// VM er afsluttet, Touren kører, Superligaen åbner 24/7. gameId'erne matcher
// migreringens data-stier (games/vm2026/…, games/tour2026/…).
const GAMES = [
  {
    id: 'vm2026',
    name: 'VM 2026', shortName: 'VM', emoji: '⚽',
    type: 'football', status: 'finished', joinable: false,
    season: '2026', order: 1,
  },
  {
    id: 'tour2026',
    name: 'Tour de France 2026', shortName: 'Tour', emoji: '🚴',
    // Kører endnu i sin egen app; forsiden linker UD hertil indtil spillet
    // migreres ind i platformen. joinable: false → intet Deltag, kun link.
    type: 'cycling', status: 'live', joinable: false,
    externalUrl: 'https://tour.vejleaa.dk',
    season: '2026', order: 2,
  },
  {
    id: 'superliga2627',
    name: 'Superligaen 2026/27', shortName: 'Superliga', emoji: '⚽',
    // Spil-specifikt logo (fodbold-mærket) — platform-logoet er neutralt.
    logo: '/logo-superliga.svg',
    type: 'football', status: 'open', joinable: true,
    season: '2026-27', order: 3,
  },
];

async function seedGames() {
  console.log(`\nSeeder ${GAMES.length} spil i games-collection'en...`);
  const batch = db.batch();
  for (const { id, ...data } of GAMES) {
    batch.set(db.collection('games').doc(id), { ...data, updatedAt: now, createdAt: now }, { merge: true });
    console.log(`  • ${id} — ${data.name} (${data.status})`);
  }
  await batch.commit();
  console.log('Spil seedet.');
}

seedGames()
  .then(() => { console.log('\n✅ Færdig.'); return app.delete(); })
  .then(() => process.exit(0))
  .catch((err) => { console.error('Seed-fejl:', err); process.exit(1); });
