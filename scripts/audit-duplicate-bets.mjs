// ---------------------------------------------------------------------------
// scripts/audit-duplicate-bets.mjs — LÆS-ONLY tjek for dublet-tips.
//
// Reglerne krævede tidligere ikke, at et tips dokument-id var uid_matchId, så
// en spiller kunne i princippet skrive flere tips på samme kamp og få point
// for dem alle. Dette script finder eventuelle dubletter i platformen
// (spil-89af9), så man kan se, om hullet nogensinde blev brugt.
//
// Skriver ALDRIG noget. Exit-kode 1 hvis der findes dubletter.
//
// Miljø:
//   SPIL_SA  – sti til service-account-JSON for spil-89af9
// ---------------------------------------------------------------------------
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const saPath = process.env.SPIL_SA;
if (!saPath) {
  console.error('Mangler SPIL_SA (sti til service-account for spil-89af9).');
  process.exit(1);
}
const sa = JSON.parse(readFileSync(saPath, 'utf8'));
initializeApp({ credential: cert(sa), projectId: sa.project_id });
const db = getFirestore();

let problems = 0;
const gamesSnap = await db.collection('games').get();

for (const game of gamesSnap.docs) {
  const betsSnap = await game.ref.collection('bets').get();
  const seen = new Map(); // "uid|matchId" -> [docId]
  let wrongId = 0;
  for (const d of betsSnap.docs) {
    const { uid, matchId } = d.data();
    if (!uid || !matchId) continue;
    if (d.id !== `${uid}_${matchId}`) wrongId += 1;
    const key = `${uid}|${matchId}`;
    if (!seen.has(key)) seen.set(key, []);
    seen.get(key).push(d.id);
  }
  const dupes = [...seen.entries()].filter(([, ids]) => ids.length > 1);
  console.log(`${game.id}: ${betsSnap.size} tips, ${wrongId} med afvigende doc-id, ${dupes.length} kampe med dublet-tip`);
  for (const [key, ids] of dupes) {
    const [uid, matchId] = key.split('|');
    console.log(`  DUBLET  spiller ${uid} · kamp ${matchId} → ${ids.join(', ')}`);
    problems += 1;
  }
}

if (problems > 0) {
  console.error(`\n${problems} dublet-tip fundet — de skal ryddes op manuelt.`);
  process.exit(1);
}
console.log('\nIngen dublet-tips fundet.');
