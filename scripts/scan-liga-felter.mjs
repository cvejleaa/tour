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
// Siden #234 scannes også liga-spørgsmål, svar og væg-beskeder for ældre
// gift (map som svar, 'abc' som deadline, ekstra felter på en besked), som
// reglerne nu afviser ved skrivning. Klienten tåler dem — men et spørgsmål
// med ugyldig deadline er muret inde og kan kun ryddes med Admin SDK.
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
import { ligaFejl, spoergsmaalFejl, svarFejl, beskedFejl } from './lib/ligaFelter.mjs';

const saPath = process.env.SA;
if (!saPath) {
  console.error('Mangler SA (sti til service-account).');
  process.exit(1);
}
const sa = JSON.parse(readFileSync(saPath, 'utf8'));
initializeApp({ credential: cert(sa), projectId: sa.project_id });
const db = getFirestore();

async function scan(navn, snap, vagt = ligaFejl, hvad = 'ville blive frosset') {
  let ramt = 0;
  for (const d of snap.docs) {
    const fejl = vagt(d.data());
    if (!fejl.length) continue;
    ramt += 1;
    const ejer = d.data().ownerUid ?? d.data().uid ?? '?';
    console.log(`  ${d.ref.path}  ejer=${ejer}  → ${fejl.join(', ')}`);
  }
  console.log(`${navn}: ${snap.size} dokumenter, ${ramt} ${hvad}`);
  return ramt;
}

/** Kun dokumenter under games/ — collectionGroup ser også top-niveau-samlinger med samme navn. */
async function underSpil(gruppe) {
  const s = await db.collectionGroup(gruppe).get();
  const docs = s.docs.filter((d) => d.ref.path.startsWith('games/'));
  return { size: docs.length, docs };
}

const top = await scan('leagues (top-niveau)', await db.collection('leagues').get());
const spil = await scan('games/*/leagues', await underSpil('leagues'));

// #234: spørgsmål, svar og væg-beskeder, som reglen nu afviser ved skrivning —
// ældre gift tåles af klienten, men et spørgsmål med ugyldig deadline er muret
// inde og kan kun ryddes med Admin SDK. Læs-only, som alt andet her.
const spoergsmaal = await scan('games/*/leagues/*/questions', await underSpil('questions'), spoergsmaalFejl, 'er forgiftede');
const svar = await scan('games/*/leagues/*/questionAnswers', await underSpil('questionAnswers'), svarFejl, 'er forgiftede');
const beskeder = await scan('games/*/leagues/*/messages', await underSpil('messages'), beskedFejl, 'er forgiftede');

const ialt = top + spil + spoergsmaal + svar + beskeder;
console.log(`\nProjekt ${sa.project_id}: ${top + spil} liga-dokument(er) skal ryddes FØR reglen deployes; `
  + `${spoergsmaal + svar + beskeder} forgiftet/forgiftede spørgsmål, svar eller beskeder (ryd med Admin SDK — klienten tåler dem).`);
process.exit(ialt > 0 ? 2 : 0);
