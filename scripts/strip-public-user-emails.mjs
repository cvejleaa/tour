// ---------------------------------------------------------------------------
// scripts/strip-public-user-emails.mjs — fjern e-mail fra de OFFENTLIGE
// brugerprofiler i platformen (spil-89af9).
//
// users/{uid} kan alle godkendte brugere læse, så adressen hører ikke hjemme
// der — den skal kun stå i userContacts/{uid} (kun brugeren selv + admin).
// Et tidligere admin-e-mailskifte skrev feltet begge steder; dette script
// rydder op og sikrer samtidig, at adressen findes i userContacts, så intet
// går tabt.
//
// Miljø:
//   SPIL_SA  – sti til service-account-JSON for spil-89af9
//   DRY_RUN  – 'true' = vis kun hvad der ville blive ryddet
// ---------------------------------------------------------------------------
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const saPath = process.env.SPIL_SA;
if (!saPath) {
  console.error('Mangler SPIL_SA (sti til service-account for spil-89af9).');
  process.exit(1);
}
const dryRun = String(process.env.DRY_RUN || '').toLowerCase() === 'true';

const sa = JSON.parse(readFileSync(saPath, 'utf8'));
initializeApp({ credential: cert(sa), projectId: sa.project_id });
const db = getFirestore();

const usersSnap = await db.collection('users').get();
const withEmail = usersSnap.docs.filter((d) => d.data().email != null);

console.log(`${usersSnap.size} brugerprofiler, ${withEmail.length} med e-mail på den offentlige profil.`);

let movedToContacts = 0;
for (const d of withEmail) {
  const email = String(d.data().email).toLowerCase();
  const contactRef = db.collection('userContacts').doc(d.id);
  const contact = await contactRef.get();
  const missingInContacts = !contact.exists || !contact.data().email;
  console.log(`  ${d.id}: fjerner e-mail${missingInContacts ? ' (kopieres først til userContacts)' : ''}`);
  if (dryRun) continue;
  if (missingInContacts) {
    await contactRef.set({ uid: d.id, email }, { merge: true });
    movedToContacts += 1;
  }
  await d.ref.update({ email: FieldValue.delete() });
}

console.log(dryRun
  ? '[tør-kørsel] Intet skrevet.'
  : `Færdig: ryddede ${withEmail.length} profiler (${movedToContacts} fik e-mailen gemt i userContacts først).`);
