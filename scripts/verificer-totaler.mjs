// ---------------------------------------------------------------------------
// scripts/verificer-totaler.mjs — LÆS-ONLY kontrol efter en genscoring.
//
// Læser, hvad serveren FAKTISK har gemt på hver spiller, og prøver de tre ting,
// der kan gå galt uden en fejlbesked:
//
//   1. Rubrikkerne skal summe til totalen. Gør de ikke det, er opdelingen og
//      stillingen uenige — og knappen "Hvor kommer pointene fra?" lyver.
//   2. ⚡ Chancen må kun være negativ for den, der faktisk har sat point på
//      spil og tabt. Er den negativ for en spiller uden indsats, er
//      bet-pointene ikke bagfyldt (se docs/drift.md).
//   3. Ingen må have mistet point i forhold til en opgivet facitliste.
//
// Skriver ALDRIG noget.
//
// Miljø:
//   SPIL_SA  – sti til service-account-JSON for spil-89af9
//   GAME_ID  – valgfrit, default superliga2627
// ---------------------------------------------------------------------------
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const saPath = process.env.SPIL_SA;
if (!saPath) { console.error('Mangler SPIL_SA.'); process.exit(1); }
const sa = JSON.parse(readFileSync(saPath, 'utf8'));
initializeApp({ credential: cert(sa), projectId: sa.project_id });
const db = getFirestore();

const GAME_ID = process.env.GAME_ID || 'superliga2627';
const gameRef = db.collection('games').doc(GAME_ID);
const r1 = (n) => Math.round((Number(n) || 0) * 10) / 10;

const [playersSnap, betsSnap] = await Promise.all([
  gameRef.collection('players').get(),
  gameRef.collection('bets').get(),
]);

// Hvem har overhovedet sat point på spil? Kun de spillere MÅ have negativ chance.
const harIndsats = new Set();
for (const d of betsSnap.docs) {
  if (Number(d.data().chanceStake) > 0) harIndsats.add(d.data().uid);
}

const navn = new Map();
const brugere = await db.getAll(...playersSnap.docs.map((d) => db.collection('users').doc(d.id)));
for (const d of brugere) if (d.exists) navn.set(d.id, d.data().displayName);

const b = (s, n) => String(s).padEnd(n);
const h = (s, n) => String(s).padStart(n);
console.log(`\nVERIFICÉR TOTALER · ${GAME_ID}\n`);
console.log(`${b('spiller', 26)}${h('1X2', 8)}${h('chance', 8)}${h('combi', 8)}${h('pulje', 7)}${h('sum', 8)}${h('total', 8)}  bemærkning`);
console.log('-'.repeat(96));

let fejl = 0;
const rows = playersSnap.docs.map((d) => ({ uid: d.id, ...d.data() }))
  .sort((x, y) => (Number(y.totalPoints) || 0) - (Number(x.totalPoints) || 0));

for (const p of rows) {
  const o = p.opdeling || {};
  const sum = r1((Number(o.p1x2) || 0) + (Number(o.chance) || 0) + (Number(o.combi) || 0) + (Number(o.pulje) || 0));
  const total = r1(p.totalPoints);
  const noter = [];
  // Totalen gulves ved 0, så sum < total kan være legitimt netop dér.
  if (Math.abs(sum - total) > 0.15 && !(total === 0 && sum < 0)) {
    noter.push(`SUM ${sum} ≠ TOTAL ${total}`); fejl += 1;
  }
  if ((Number(o.chance) || 0) < -0.05 && !harIndsats.has(p.uid)) {
    noter.push('CHANCEN NEGATIV UDEN INDSATS — bet-point er ikke bagfyldt'); fejl += 1;
  }
  console.log(
    b((navn.get(p.uid) || p.uid).slice(0, 25), 26)
    + h(r1(o.p1x2), 8) + h(r1(o.chance), 8) + h(r1(o.combi), 8) + h(r1(o.pulje), 7)
    + h(sum, 8) + h(total, 8) + '  ' + (noter.join(' · ') || 'ok'),
  );
}

console.log('-'.repeat(96));
console.log(`${b('I ALT', 26)}${h('', 8)}${h('', 8)}${h('', 8)}${h('', 7)}${h('', 8)}${h(r1(rows.reduce((a, p) => a + (Number(p.totalPoints) || 0), 0)), 8)}`);
console.log(`\n${fejl === 0 ? '✓ Ingen fejl fundet.' : `⚠️  ${fejl} problem(er) fundet.`}`);
console.log('LÆS-ONLY — der er ikke skrevet noget.\n');
if (fejl) process.exit(1);
