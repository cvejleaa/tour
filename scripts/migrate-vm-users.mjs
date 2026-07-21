// ---------------------------------------------------------------------------
// scripts/migrate-vm-users.mjs — Migrér VM-spillere fra VM-projektet
// (vm2026-tip) ind i platformen (spil-89af9) og FLET dem med de brugere, vi
// allerede har. VM kører i sit eget Firebase-projekt, så den samme person har
// et ANDET uid i VM end på platformen — derfor matcher vi på E-MAIL:
//
//   • VM-bruger hvis e-mail ALLEREDE findes på platformen  → FLET (ingen ny
//     konto; VM-profilfelter merges ind i den eksisterende platform-bruger).
//   • VM-bruger hvis e-mail IKKE findes  → OPRET på platformen (bevar login:
//     federated-logins som Google følger med; kodeord bevares hvis
//     VM_HASH_CONFIG er sat, ellers markeres kontoen til "nulstil kodeord").
//
// Auth-kontiene håndteres HER via firebase-admin (listUsers/importUsers), så
// e-mail-fletningen sker ét sted. Kør ALTID med DRY_RUN=true først.
//
// Kræver to service-accounts:
//   VM_SA=/sti/vm-sa.json   SPIL_SA=/sti/spil-sa.json
//   [DRY_RUN=true] [VM_HASH_CONFIG='<Password hash parameters fra vm2026-tip>']
//   node scripts/migrate-vm-users.mjs
// Idempotent (merge). Kan køres igen.
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs';

// De GLOBALE profilfelter vi tager med fra VM (samme sæt som Tour-migreringen).
// Spil-specifikke point/placeringer migreres IKKE her.
export const VM_PROFILE_FIELDS = [
  'displayName', 'avatarEmoji', 'favoriteTeam', 'teamTheme', 'emailOptOut',
  'createdAt',
];

/**
 * Ren planlægning: afgør for hver VM-bruger om den skal FLETTES (e-mail findes
 * allerede på platformen) eller OPRETTES. Ingen I/O — nem at teste.
 * @param {Array<{uid:string, email?:string}>} vmUsers
 * @param {Map<string,string>} platformEmailToUid – lowercased email → platform-uid
 * @returns {{merge: Array, create: Array, skipped: Array}}
 */
export function planMigration(vmUsers, platformEmailToUid) {
  const merge = [];
  const create = [];
  const skipped = [];
  for (const u of vmUsers || []) {
    const email = (u.email || '').trim().toLowerCase();
    if (!email) { skipped.push({ ...u, reason: 'ingen e-mail' }); continue; }
    const existingUid = platformEmailToUid.get(email);
    if (existingUid) merge.push({ ...u, email, platformUid: existingUid });
    else create.push({ ...u, email });
  }
  return { merge, create, skipped };
}

/** Parse Firebase "Password hash parameters"-blokken → importUsers hash-option. */
export function parseHashConfig(raw) {
  if (!raw) return null;
  const pick = (k) => {
    const m = raw.match(new RegExp(`${k}["'\\s:=]+([^,"'\\s]+)`));
    return m ? m[1] : null;
  };
  const signerKey = pick('base64_signer_key');
  const saltSep = pick('base64_salt_separator');
  const rounds = Number(pick('rounds'));
  const memCost = Number(pick('mem_cost'));
  if (!signerKey || !saltSep || !Number.isFinite(rounds) || !Number.isFinite(memCost)) return null;
  return {
    algorithm: 'SCRYPT',
    key: Buffer.from(signerKey, 'base64'),
    saltSeparator: Buffer.from(saltSep, 'base64'),
    rounds,
    memoryCost: memCost,
  };
}

// Kun profil-felter der findes; undgå at skrive undefined.
function pickProfile(data, fields) {
  const out = {};
  for (const f of fields) if (data && data[f] !== undefined) out[f] = data[f];
  return out;
}

async function main() {
  const DRY_RUN = process.env.DRY_RUN === 'true';
  const vmSaPath = process.env.VM_SA;
  const spilSaPath = process.env.SPIL_SA;
  if (!vmSaPath || !spilSaPath) {
    console.error('❌ Sæt VM_SA og SPIL_SA til service-account-JSON-stier (vm2026-tip / spil-89af9).');
    process.exit(1);
  }

  const admin = (await import('firebase-admin')).default;
  const vmApp = admin.initializeApp(
    { credential: admin.credential.cert(JSON.parse(readFileSync(vmSaPath, 'utf8'))) }, 'vm',
  );
  const spilApp = admin.initializeApp(
    { credential: admin.credential.cert(JSON.parse(readFileSync(spilSaPath, 'utf8'))) }, 'spil',
  );
  const vmAuth = vmApp.auth();
  const spilAuth = spilApp.auth();
  const vmDb = vmApp.firestore();
  const spilDb = spilApp.firestore();
  const hashOption = parseHashConfig(process.env.VM_HASH_CONFIG);

  console.log(`\n${DRY_RUN ? '[DRY-RUN] ' : ''}Migrerer VM-brugere: vm2026-tip → spil-89af9 (flet på e-mail)\n`);

  // 1) Alle auth-brugere fra begge projekter.
  const listAll = async (auth) => {
    const users = [];
    let pageToken;
    do {
      const res = await auth.listUsers(1000, pageToken);
      users.push(...res.users);
      pageToken = res.pageToken;
    } while (pageToken);
    return users;
  };
  const [vmUsers, platformUsers] = await Promise.all([listAll(vmAuth), listAll(spilAuth)]);
  console.log(`  VM-konti: ${vmUsers.length} · platform-konti: ${platformUsers.length}`);

  const platformEmailToUid = new Map();
  for (const u of platformUsers) if (u.email) platformEmailToUid.set(u.email.toLowerCase(), u.uid);

  // 2) Planlæg fletning vs. oprettelse.
  const { merge, create, skipped } = planMigration(
    vmUsers.map((u) => ({ uid: u.uid, email: u.email, raw: u })),
    platformEmailToUid,
  );
  console.log(`  → flettes (e-mail findes): ${merge.length}`);
  console.log(`  → oprettes (ny e-mail):    ${create.length}`);
  if (skipped.length) console.log(`  → sprunget over:           ${skipped.length} (ingen e-mail)`);

  // 3) Opret nye konti (bevar login). Uden hash-config kan kodeord ikke bevares.
  const importRecords = [];
  let needReset = 0;
  for (const c of create) {
    const src = c.raw;
    const providerData = (src.providerData || [])
      .filter((p) => p.providerId && p.providerId !== 'password')
      .map((p) => ({ uid: p.uid, providerId: p.providerId, email: p.email, displayName: p.displayName, photoURL: p.photoURL }));
    const rec = {
      uid: src.uid, email: src.email, emailVerified: !!src.emailVerified,
      displayName: src.displayName, photoURL: src.photoURL,
      ...(providerData.length ? { providerData } : {}),
    };
    if (hashOption && src.passwordHash) {
      rec.passwordHash = Buffer.from(src.passwordHash, 'base64');
      if (src.passwordSalt) rec.passwordSalt = Buffer.from(src.passwordSalt, 'base64');
    } else if (!providerData.length) {
      needReset += 1; // ingen federated-login og intet bevaret kodeord
    }
    importRecords.push(rec);
  }
  if (needReset) {
    console.log(`  ⚠️  ${needReset} nye konti har hverken federated-login eller bevaret kodeord — de skal nulstille kodeord (eller sæt VM_HASH_CONFIG).`);
  }
  if (!DRY_RUN && importRecords.length) {
    const res = await spilAuth.importUsers(importRecords, hashOption ? { hash: hashOption } : undefined);
    console.log(`  Auth-import: ${res.successCount} oprettet, ${res.failureCount} fejl.`);
    for (const e of res.errors || []) console.log(`    · fejl idx ${e.index}: ${e.error?.message}`);
  }

  // 4) Kopiér VM Firestore-profiler ind — flettede til deres PLATFORM-uid, nye til VM-uid.
  const uidTarget = new Map(); // vm-uid → mål-uid på platformen
  for (const m of merge) uidTarget.set(m.uid, m.platformUid);
  for (const c of create) uidTarget.set(c.uid, c.uid);

  let vmProfiles = new Map();
  try {
    const snap = await vmDb.collection('users').get();
    for (const d of snap.docs) vmProfiles.set(d.id, d.data());
    console.log(`  VM users-profiler fundet: ${vmProfiles.size}`);
  } catch (err) {
    console.log(`  (kunne ikke læse VM 'users'-collection: ${err.message} — springer profil-kopi over)`);
  }

  let written = 0;
  let batch = spilDb.batch();
  let n = 0;
  for (const [vmUid, targetUid] of uidTarget) {
    const data = vmProfiles.get(vmUid);
    if (!data) continue;
    const profile = pickProfile(data, VM_PROFILE_FIELDS);
    if (Object.keys(profile).length === 0) continue;
    if (!DRY_RUN) {
      // merge:true — vi overskriver ALDRIG eksisterende platform-felter blindt;
      // profil-felterne er kosmetik og udfyldes kun hvis de mangler nyttigt.
      batch.set(spilDb.collection('users').doc(targetUid), profile, { merge: true });
      if (++n >= 400) { await batch.commit(); batch = spilDb.batch(); n = 0; }
    }
    written += 1;
  }
  if (!DRY_RUN && n > 0) await batch.commit();
  console.log(`  ${DRY_RUN ? 'ville skrive' : 'skrev'} ${written} profiler.`);

  // 5) userContacts (privat e-mail → uid) for de nye/flettede.
  let contactsWritten = 0;
  batch = spilDb.batch();
  n = 0;
  for (const u of [...merge, ...create]) {
    const targetUid = uidTarget.get(u.uid);
    if (!u.email || !targetUid) continue;
    if (!DRY_RUN) {
      batch.set(spilDb.collection('userContacts').doc(targetUid), { uid: targetUid, email: u.email }, { merge: true });
      if (++n >= 400) { await batch.commit(); batch = spilDb.batch(); n = 0; }
    }
    contactsWritten += 1;
  }
  if (!DRY_RUN && n > 0) await batch.commit();
  console.log(`  ${DRY_RUN ? 'ville skrive' : 'skrev'} ${contactsWritten} userContacts.`);

  console.log(`\n✅ ${DRY_RUN ? 'Dry-run færdig (intet skrevet).' : 'VM-migrering færdig.'}`);
  await Promise.all([vmApp.delete(), spilApp.delete()]);
}

// Kør kun når filen udføres direkte (ikke ved import i tests).
if (process.argv[1] && process.argv[1].endsWith('migrate-vm-users.mjs')) {
  main().then(() => process.exit(0)).catch((err) => { console.error('Migrerings-fejl:', err); process.exit(1); });
}
