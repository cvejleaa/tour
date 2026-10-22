// ---------------------------------------------------------------------------
// LÆS-ONLY: findes der liga-dokumenter, som den strammede regel har FROSSET?
//
// Reglen for `leagues/{id}` og `games/{g}/leagues/{id}` forbyder nu et
// `id`-felt og kræver et streng-navn (Security-fund: et id-felt sendte
// ligaens morgenopslag til en fremmed ligas væg, og et map som navn
// hvidnede fladen for alle medlemmer). Men vagten ser på HELE det
// resulterende dokument: bærer et dokument et id-felt, kan ejeren ikke
// længere omdøbe eller sætte ny kode, før nogen fjerner feltet. Reglen er
// udrullet (#203, 2/9 2026), så et fund her ER frosset — fjern feltet i
// Firebase-konsollen. Scanningen blev skrevet til at tælle op FØR
// udrulningen; nu er den eftersynet, der viser, om noget står tilbage.
//
// Siden #234 scannes også liga-spørgsmål, svar og væg-beskeder for ældre
// gift (map som svar, 'abc' som deadline, ekstra felter på en besked), som
// reglerne nu afviser ved skrivning. Klienten tåler dem — men et spørgsmål
// med ugyldig deadline eller points er MURET INDE: fladen kan ikke rette
// feltet, kun Firebase-konsollen kan (se ligaFelter.mjs).
//
// INGEN SKRIVNING HER — men oprydningen bagefter ER en skrivning i
// produktionsdata, og den sker i konsollen, med ejerens ja.
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

// Dokumenter læst i alt. En forkert sti eller et forkert filter giver ikke en
// fejl, men 0 dokumenter og exit 0 — en grøn kørsel, der intet så (Release
// Manager). Derfor en advarsel, når HELE projektet læste ingenting.
let laest = 0;

async function scan(navn, snap, vagt = ligaFejl, hvad = 'er frosset') {
  laest += snap.size;
  let ramt = 0;
  for (const d of snap.docs) {
    const fejl = vagt(d.data());
    if (!fejl.length) continue;
    ramt += 1;
    const ejer = d.data().ownerUid ?? d.data().createdBy ?? d.data().uid ?? '?';
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
// ældre gift tåles af klienten, men et spørgsmål med ugyldig deadline eller
// points er muret inde og kan kun rettes i konsollen. Læs-only, som alt andet her.
const spoergsmaal = await scan('games/*/leagues/*/questions', await underSpil('questions'), spoergsmaalFejl, 'er forgiftede');
const svar = await scan('games/*/leagues/*/questionAnswers', await underSpil('questionAnswers'), svarFejl, 'er forgiftede');
const beskeder = await scan('games/*/leagues/*/messages', await underSpil('messages'), beskedFejl, 'er forgiftede');

const gift = spoergsmaal + svar + beskeder;
console.log(`\nProjekt ${sa.project_id}:`);
console.log(`  Ligaer: ${top + spil} dokument(er) er frosset af id-/navne-reglen (udrullet) — fjern feltet i Firebase-konsollen.`);
console.log(`  Spørgsmål/svar/beskeder: ${gift} dokument(er), som reglerne (#234, udrullet) allerede afviser ved skrivning. `
  + 'Klienten tåler dem; linjer mærket MURET INDE kan kun rettes i Firebase-konsollen (ret feltet på stien) — '
  + 'de bliver stående i hver scanning, til feltet er rettet.');
if (laest === 0) {
  console.log(`::warning::Scanningen læste 0 dokumenter i ${sa.project_id} — forkert projekt, sti eller filter? `
    + 'En grøn kørsel uden et eneste dokument har ikke kigget.');
}
process.exit(top + spil + gift > 0 ? 2 : 0);
