// ---------------------------------------------------------------------------
// LÆS-ONLY: findes der liga-dokumenter, som den strammede regel vil FRYSE?
//
// Reglen for `leagues/{id}` og `games/{g}/leagues/{id}` forbyder nu et
// `id`-felt og kræver et streng-navn (Security-fund: et id-felt sendte
// ligaens morgenopslag til en fremmed ligas væg, og et map som navn
// hvidnede fladen for alle medlemmer). Men vagten ser på HELE det
// resulterende dokument: bærer et dokument allerede et id-felt, kan ejeren
// ikke længere omdøbe eller sætte ny kode, uden at nogen først fjerner
// feltet. Feltet HAR været skrivbart indtil nu. Derfor tælles der op FØR
// reglen rulles ud — og findes der noget, ryddes det med Admin SDK først.
//
// Scriptet skriver ikke ét felt. Det printer sti, hvilket felt der er galt,
// og ejerens uid, så oprydningen kan ske målrettet.
//
// Lokalt: SA=/sti/til/sa.json node scripts/scan-liga-felter.mjs
// Workflow: .github/workflows/scan-liga-felter.yml (begge projekter).
// ---------------------------------------------------------------------------
import { readFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { ligaFejl } from './lib/ligaFelter.mjs';

const saPath = process.env.SA;
if (!saPath) {
  console.error('Mangler SA (sti til service-account).');
  process.exit(1);
}
const sa = JSON.parse(readFileSync(saPath, 'utf8'));
initializeApp({ credential: cert(sa), projectId: sa.project_id });
const db = getFirestore();

async function scan(navn, snap) {
  let ramt = 0;
  for (const d of snap.docs) {
    const fejl = ligaFejl(d.data());
    if (!fejl.length) continue;
    ramt += 1;
    console.log(`  ${d.ref.path}  ejer=${d.data().ownerUid ?? '?'}  → ${fejl.join(', ')}`);
  }
  console.log(`${navn}: ${snap.size} dokumenter, ${ramt} ville blive frosset`);
  return ramt;
}

const top = await scan('leagues (top-niveau)', await db.collection('leagues').get());
const spil = await scan('games/*/leagues', await db.collectionGroup('leagues').get()
  .then((s) => ({ size: s.docs.filter((d) => d.ref.path.startsWith('games/')).length,
    docs: s.docs.filter((d) => d.ref.path.startsWith('games/')) })));

console.log(`\nProjekt ${sa.project_id}: ${top + spil} dokument(er) skal ryddes FØR reglen deployes.`);
process.exit(top + spil > 0 ? 2 : 0);
