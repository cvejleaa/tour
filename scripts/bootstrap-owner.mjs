// ---------------------------------------------------------------------------
// scripts/bootstrap-owner.mjs — Gør en bruger til ejer (owner + approved).
//
// Platformen (spil-89af9) deployer i første omgang KUN hosting + firestore
// (ingen Cloud Functions), så der er ingen server-trigger til at genkende
// owner-emailen. Dette script sætter rollen manuelt: det slår brugeren op på
// e-mail i Firebase Auth og sætter role='owner' + status='approved' på
// users/{uid}. Brugeren skal have logget ind MINDST ÉN gang først (så
// users/{uid} findes). Idempotent.
//
// BRUG (kræver Admin-legitimation):
//   GOOGLE_APPLICATION_CREDENTIALS=/sti/sa.json \
//     OWNER_EMAIL=cvejleaa@gmail.com node scripts/bootstrap-owner.mjs
//   (mod emulator: FIRESTORE_EMULATOR_HOST=localhost:8080 … med FIREBASE_AUTH_EMULATOR_HOST)
// ---------------------------------------------------------------------------

const admin = (await import('firebase-admin')).default;

const email = (process.env.OWNER_EMAIL || 'cvejleaa@gmail.com').toLowerCase();

let app;
if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  const { readFileSync } = await import('fs');
  const sa = JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));
  app = admin.initializeApp({ credential: admin.credential.cert(sa) });
} else {
  app = admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'spil-89af9' });
}

const auth = admin.auth();
const db = admin.firestore();

try {
  const userRecord = await auth.getUserByEmail(email);
  const uid = userRecord.uid;
  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();
  if (!snap.exists) {
    console.error(`❌ users/${uid} findes ikke endnu. Log ind på sitet med ${email} FØRST, og kør så scriptet igen.`);
    process.exit(2);
  }
  await ref.set(
    { role: 'owner', status: 'approved', approvedAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true },
  );
  // Sørg for at kontakt-e-mailen findes (privat), så admin-flows virker.
  await db.collection('userContacts').doc(uid).set({ uid, email }, { merge: true });
  console.log(`✅ ${email} (${uid}) er nu owner + approved.`);
  await app.delete();
  process.exit(0);
} catch (err) {
  if (err?.code === 'auth/user-not-found') {
    console.error(`❌ Ingen Auth-bruger med e-mail ${email}. Opret/login på sitet først.`);
    process.exit(2);
  }
  console.error('Bootstrap-fejl:', err);
  process.exit(1);
}
