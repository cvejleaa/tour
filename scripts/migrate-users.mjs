// ---------------------------------------------------------------------------
// scripts/migrate-users.mjs — Kopiér GLOBALE brugerprofiler fra Tour-projektet
// (tour-85928) til platformen (spil-89af9), så eksisterende spillere kan logge
// ind på tip.vejleaa.dk. KUN den globale profil migreres (displayName, rolle,
// status, kontakt-e-mail, kosmetik). Tour-SPILDATA (point/tips) hører til under
// games/tour2026/… og migreres separat efter Touren.
//
// Auth-KONTIENE (kodeord) migreres af workflowen via firebase auth:export/import
// — dette script tager kun Firestore-profilerne (users + userContacts).
//
// Kræver TO service-accounts:
//   TOUR_SA=/sti/tour-sa.json   SPIL_SA=/sti/spil-sa.json
//   [DRY_RUN=true] node scripts/migrate-users.mjs
// Idempotent (merge). Kan køres igen for at re-synkronisere.
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs';

const admin = (await import('firebase-admin')).default;

const DRY_RUN = process.env.DRY_RUN === 'true';
const tourSaPath = process.env.TOUR_SA;
const spilSaPath = process.env.SPIL_SA;
if (!tourSaPath || !spilSaPath) {
  console.error('❌ Sæt TOUR_SA og SPIL_SA til service-account-JSON-stier.');
  process.exit(1);
}

const tourApp = admin.initializeApp(
  { credential: admin.credential.cert(JSON.parse(readFileSync(tourSaPath, 'utf8'))) },
  'tour',
);
const spilApp = admin.initializeApp(
  { credential: admin.credential.cert(JSON.parse(readFileSync(spilSaPath, 'utf8'))) },
  'spil',
);
const tourDb = tourApp.firestore();
const spilDb = spilApp.firestore();

// Felter der udgør den GLOBALE profil (følger med til platformen). Alt andet
// (totalPoints, stagePoints, bonusPoints, seasons, previousRank, points, email)
// er enten spil-specifikt eller privat/andetsteds og kopieres IKKE her.
const PROFILE_FIELDS = [
  'displayName', 'role', 'status', 'createdAt', 'approvedAt', 'approvedViaInvite',
  'avatarEmoji', 'favoriteTeam', 'teamTheme', 'emailOptOut',
];

function pickProfile(data) {
  const out = {};
  for (const f of PROFILE_FIELDS) if (data[f] !== undefined) out[f] = data[f];
  return out;
}

async function migrate() {
  console.log(`\n${DRY_RUN ? '[DRY-RUN] ' : ''}Migrerer brugerprofiler tour-85928 → spil-89af9\n`);

  // --- users -----------------------------------------------------------------
  const usersSnap = await tourDb.collection('users').get();
  console.log(`Fandt ${usersSnap.size} brugere i tour-85928.`);
  let uWritten = 0;
  let batch = spilDb.batch();
  let n = 0;
  for (const d of usersSnap.docs) {
    const profile = pickProfile(d.data());
    if (!DRY_RUN) {
      batch.set(spilDb.collection('users').doc(d.id), profile, { merge: true });
      if (++n >= 400) { await batch.commit(); batch = spilDb.batch(); n = 0; }
    }
    uWritten += 1;
  }
  if (!DRY_RUN && n > 0) await batch.commit();
  console.log(`  ${DRY_RUN ? 'ville skrive' : 'skrev'} ${uWritten} users-profiler.`);

  // --- userContacts (privat e-mail) -----------------------------------------
  const contactsSnap = await tourDb.collection('userContacts').get();
  console.log(`Fandt ${contactsSnap.size} userContacts i tour-85928.`);
  let cWritten = 0;
  batch = spilDb.batch();
  n = 0;
  for (const d of contactsSnap.docs) {
    const data = d.data();
    const contact = { uid: data.uid || d.id, email: (data.email || '').toLowerCase() };
    if (!DRY_RUN && contact.email) {
      batch.set(spilDb.collection('userContacts').doc(d.id), contact, { merge: true });
      if (++n >= 400) { await batch.commit(); batch = spilDb.batch(); n = 0; }
    }
    if (contact.email) cWritten += 1;
  }
  if (!DRY_RUN && n > 0) await batch.commit();
  console.log(`  ${DRY_RUN ? 'ville skrive' : 'skrev'} ${cWritten} userContacts.`);

  console.log(`\n✅ ${DRY_RUN ? 'Dry-run færdig (intet skrevet).' : 'Profil-migrering færdig.'}`);
}

migrate()
  .then(() => Promise.all([tourApp.delete(), spilApp.delete()]))
  .then(() => process.exit(0))
  .catch((err) => { console.error('Migrerings-fejl:', err); process.exit(1); });
