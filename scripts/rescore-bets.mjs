// ---------------------------------------------------------------------------
// scripts/rescore-bets.mjs — genscor alle bets efter en ÆNDRING AF POINTREGLEN.
//
// Kun nødvendig, når selve reglen i superligaScoring.js har ændret sig.
// `bets/{id}.points` skrives ellers KUN af recomputeGameMatchCore, som kun
// kaldes når en kamps facit ændrer sig — så en regelændring efterlader hvert
// eksisterende bet med sit gamle tal. Se docs/drift.md.
//
// Kører den ÆGTE rescoreAllBets fra functions-platform, ikke en kopi. En kopi
// ville være en anden udgave af reglen, og så ville tør-kørslen love noget
// andet, end produktionen gør.
//
// TRE TILSTANDE:
//   (default)        tør-kørsel — skriver INTET, men gemmer en fuld backup
//   DRY_RUN=false    skriver — gemmer backup FØRST
//   GENDAN=<fil>     skriver backup'en tilbage, bet for bet
//
// Backup'en er ikke pynt. De gamle bet-point findes ikke i noget andet felt og
// ingen historik; uden filen her er en fortrydelse umulig uden PITR.
//
// Miljø:
//   SPIL_SA   – sti til service-account-JSON for spil-89af9
//   GAME_ID   – valgfrit, default superliga2627
//   DRY_RUN   – 'false' skriver. Alt andet (og udeladt) tørkører.
//   BACKUP    – sti til backup-filen (default ./bets-backup-<gameId>.json)
//   GENDAN    – sti til en backup, der skal skrives TILBAGE
// ---------------------------------------------------------------------------
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const require = createRequire(import.meta.url);
const { rescoreAllBets } = require('../functions-platform/gameScoring.js');

const saPath = process.env.SPIL_SA;
if (!saPath) {
  console.error('Mangler SPIL_SA (sti til service-account for spil-89af9).');
  process.exit(1);
}
const sa = JSON.parse(readFileSync(saPath, 'utf8'));
initializeApp({ credential: cert(sa), projectId: sa.project_id });
const db = getFirestore();

const GAME_ID = process.env.GAME_ID || 'superliga2627';
// Kun et EKSPLICIT 'false' skriver. Fejler lukket: en tastefejl tørkører.
const DRY_RUN = process.env.DRY_RUN !== 'false';
const BACKUP = process.env.BACKUP || `bets-backup-${GAME_ID}.json`;
const GENDAN = process.env.GENDAN || '';

const gameRef = db.collection('games').doc(GAME_ID);

/** Læs hvert bets nuværende point — dét, en skrivning ville overskrive. */
async function taBackup() {
  const snap = await gameRef.collection('bets').get();
  const rows = snap.docs.map((d) => ({
    id: d.id, uid: d.data().uid ?? null, matchId: d.data().matchId ?? null,
    points: Number(d.data().points) || 0,
  }));
  const fil = { gameId: GAME_ID, taget: new Date().toISOString(), bets: rows };
  writeFileSync(BACKUP, JSON.stringify(fil, null, 2));
  console.log(`Backup: ${rows.length} bets skrevet til ${BACKUP}`);
  return rows;
}

if (GENDAN) {
  // --- GENDAN -------------------------------------------------------------
  const fil = JSON.parse(readFileSync(GENDAN, 'utf8'));
  if (fil.gameId !== GAME_ID) {
    console.error(`Backup'en er for ${fil.gameId}, ikke ${GAME_ID}. Stopper.`);
    process.exit(1);
  }
  console.log(`GENDANNER ${fil.bets.length} bets fra ${GENDAN} (taget ${fil.taget})`);
  let batch = db.batch(); let ops = 0; let rørt = 0;
  const batches = [batch];
  for (const b of fil.bets) {
    batch.update(gameRef.collection('bets').doc(b.id), { points: b.points });
    rørt += 1;
    if (++ops >= 400) { batch = db.batch(); batches.push(batch); ops = 0; }
  }
  for (const x of batches) await x.commit();
  console.log(`${rørt} bets skrevet tilbage. Genberegner totaler…`);
  // Totalerne SKAL med — ellers står stillingen på de nye tal med gamle bets.
  const { recomputeAllPlayerTotals } = require('../functions-platform/gameScoring.js');
  const r = await recomputeAllPlayerTotals(db, FieldValue, GAME_ID);
  console.log(`Færdig. ${r.players} spillere genberegnet.`);
  process.exit(0);
}

// --- TØR-KØRSEL / SKRIVNING ------------------------------------------------
console.log(`\nRESCORE-BETS · ${GAME_ID}`);
console.log(DRY_RUN ? 'TØR-KØRSEL — der skrives intet.\n' : '!! SKRIVER I PRODUKTIONSDATA !!\n');

// Backup tages ALTID — også ved tør-kørsel. Så har man "før"-tilstanden liggende,
// uanset hvilken vej man ender med at gå.
await taBackup();

const res = await rescoreAllBets(db, FieldValue, GAME_ID, { dryRun: DRY_RUN });

console.log('');
console.log(`  bets i alt      : ${res.bets}`);
console.log(`  ændrede         : ${res.aendrede}`);
console.log(`  samlet forskel  : ${res.delta >= 0 ? '+' : ''}${res.delta}`);
if (res.players != null) console.log(`  spillere        : ${res.players}`);
console.log('');
if (res.eksempler?.length) {
  console.log('  eksempler:');
  for (const e of res.eksempler) {
    console.log(`    ${e.uid} · ${e.matchId}: ${e.foer} → ${e.efter}`);
  }
  console.log('');
}

// TRIPWIREN. Ved en ren træf-bonus-ændring flytter hvert ændret bet sig præcis
// +1 — combi-formlen rører ikke bets.points, og Chancen afregnes uændret til de
// rene odds. Er de to tal ikke ens, har noget ANDET flyttet sig, og så skal en
// skrivning ikke ske, før man ved hvad.
const forventet = res.aendrede;
if (Math.abs(res.delta - forventet) > 0.05) {
  console.log(`  ⚠️  delta (${res.delta}) er IKKE lig antal ændrede (${forventet}).`);
  console.log('     Ved en ren træf-bonus skal hvert ændret bet flytte sig præcis +1.');
  console.log('     Undersøg det, før du skriver.\n');
} else {
  console.log(`  ✓ delta = antal ændrede (${forventet}) — hvert bet flyttede sig præcis +1.\n`);
}

if (DRY_RUN) {
  console.log('Der er IKKE skrevet noget. Kør igen med dryRun = false for at skrive.\n');
} else {
  console.log(`Skrevet. Backup af den gamle tilstand ligger i ${BACKUP} —`);
  console.log('gem den, hvis noget skal fortrydes.\n');
}
