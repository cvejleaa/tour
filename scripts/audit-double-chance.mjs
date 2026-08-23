// ---------------------------------------------------------------------------
// scripts/audit-double-chance.mjs — LÆS-ONLY tjek for DOBBELT Chancen i samme
// runde.
//
// Chancen må bruges ÉN gang pr. runde. Reglen har hidtil kun stået i browseren:
// hverken firestore.rules eller serverens afregning kender den, og
// gameScoring afregner hvert tip for sig. Et hul i fladen — lukket 9/8-2026,
// commit 7b9e1eb — kunne derfor lade en spiller sætte Chancen på kamp A, se
// den låse ved kickoff, og bagefter sætte den igen på kamp B i SAMME runde.
//
// Dette script finder, hvor mange gange det er sket, og hvad det har kostet
// eller givet — så beslutningen om at rette data hviler på tal frem for et
// gæt. Rundenummeret læses fra kampens EGET dokument (match.round), aldrig af
// en dato: en udsat kamp beholder sin runde.
//
// Skriver ALDRIG noget. Exit-kode 1 hvis der findes dobbelt-chancer.
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
  const [betsSnap, matchesSnap, playersSnap] = await Promise.all([
    game.ref.collection('bets').get(),
    game.ref.collection('matches').get(),
    game.ref.collection('players').get(),
  ]);
  if (betsSnap.empty) continue;

  const rundeAf = new Map(matchesSnap.docs.map((d) => [d.id, d.data().round]));
  const kampNavn = new Map(matchesSnap.docs.map((d) => {
    const m = d.data();
    return [d.id, `${m.home ?? '?'}–${m.away ?? '?'}`];
  }));
  const navnAf = new Map(playersSnap.docs.map((d) => [d.id, d.data().displayName || d.id]));

  // uid|runde → [{matchId, stake, points}]
  const brugt = new Map();
  for (const d of betsSnap.docs) {
    const b = d.data();
    const stake = Number(b.chanceStake) || 0;
    if (stake <= 0) continue;
    const runde = rundeAf.get(b.matchId);
    if (runde == null) continue; // kamp uden dokument — fanges af andre tjek
    const key = `${b.uid}|${runde}`;
    if (!brugt.has(key)) brugt.set(key, []);
    brugt.get(key).push({ matchId: b.matchId, stake, points: Number(b.points) || 0 });
  }

  const dobbelte = [...brugt.entries()].filter(([, liste]) => liste.length > 1);
  console.log(`${game.id}: ${betsSnap.size} tips, ${brugt.size} chancer brugt, ${dobbelte.length} runder med DOBBELT chance`);

  for (const [key, liste] of dobbelte) {
    const [uid, runde] = key.split('|');
    // Kun de kampe, der ER afregnet, har flyttet stillingen. En uafregnet
    // dobbelt-chance er stadig et problem, men har ikke kostet point endnu.
    const navn = navnAf.get(uid) || uid;
    console.log(`  DOBBELT  ${navn} (${uid}) · runde ${runde} · ${liste.length} chancer:`);
    for (const c of liste) {
      console.log(`      ${kampNavn.get(c.matchId) ?? c.matchId} — indsats ${c.stake}, point ${c.points}`);
    }
    problems += 1;
  }
}

if (problems > 0) {
  console.error(`\n${problems} runder med dobbelt Chancen fundet.`);
  console.error('Rettelse af data er en EJER-beslutning (docs/drift.md) — scriptet skriver intet.');
  process.exit(1);
}
console.log('\nIngen dobbelt-chancer fundet.');
