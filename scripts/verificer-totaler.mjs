// ---------------------------------------------------------------------------
// scripts/verificer-totaler.mjs — LÆS-ONLY kontrol efter en genscoring.
//
// Læser, hvad serveren FAKTISK har gemt på hver spiller, og prøver de tre ting,
// der kan gå galt uden en fejlbesked:
//
//   1. Rubrikkerne skal summe til totalen (inden for afrundingen, se
//      scripts/lib/verificerTotaler.mjs). Gør de ikke det, er opdelingen og
//      stillingen uenige — og knappen "Hvor kommer pointene fra?" lyver.
//   2. ⚡ Chancen må kun være negativ for den, der faktisk har sat point på
//      spil og tabt. Er den negativ for en spiller uden indsats, følger
//      bet-pointene ikke reglen — de er ikke bagfyldt (se docs/drift.md).
//   3. Totalen gulves ved 0, så sum < total er legitimt netop dér — det
//      tilfælde undtages, alt andet meldes.
//
// Logikken ligger i scripts/lib/verificerTotaler.mjs og er testet dér; denne
// fil læser kun Firestore og skriver tabellen. Skriver ALDRIG noget.
//
// Kører som sidste trin i .github/workflows/rescore-bets.yml: informativt ved
// tør-kørsel (viser tilstanden FØR skrivningen), blokerende efter en skrivning.
// Lokalt:  SPIL_SA=<sa.json> GAME_ID=superliga2627 node scripts/verificer-totaler.mjs
//
// Miljø:
//   SPIL_SA  – sti til service-account-JSON for spil-89af9
//   GAME_ID  – valgfrit, default superliga2627
// ---------------------------------------------------------------------------
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { vurder, tabel } from './lib/verificerTotaler.mjs';

const saPath = process.env.SPIL_SA;
if (!saPath) { console.error('Mangler SPIL_SA (sti til service-account for spil-89af9).'); process.exit(1); }
const sa = JSON.parse(readFileSync(saPath, 'utf8'));
initializeApp({ credential: cert(sa), projectId: sa.project_id });
const db = getFirestore();

const GAME_ID = process.env.GAME_ID || 'superliga2627';
const gameRef = db.collection('games').doc(GAME_ID);

const [playersSnap, betsSnap] = await Promise.all([
  gameRef.collection('players').get(),
  gameRef.collection('bets').get(),
]);
const spillere = playersSnap.docs.map((d) => ({ ...d.data(), uid: d.id }));
const bets = betsSnap.docs.map((d) => d.data());

// Visningsnavne — kun til tabellen. getAll() uden argumenter kaster, så et spil
// uden spillere springer opslaget over i stedet for at vælte kontrollen.
const navn = new Map();
if (spillere.length) {
  const brugere = await db.getAll(...spillere.map((p) => db.collection('users').doc(p.uid)));
  for (const d of brugere) if (d.exists) navn.set(d.id, d.data().displayName);
}

const v = vurder(spillere, bets);
console.log('\n' + tabel(v, navn, GAME_ID).join('\n') + '\n');
if (v.fejl) process.exit(1);
