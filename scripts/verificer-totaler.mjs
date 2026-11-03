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
//   4. FORÆLDET (task #14): hver spiller regnes FORFRA af sine tips og
//      spillets kampe med serverens eget regnestykke og spillets startrunde-
//      gate, og `perRound` sammenlignes RUNDE FOR RUNDE med det gemte. Til
//      sidst en liste PR. RUNDE: hvem står forkert, og hvor meget combi de har
//      til gode. Det er listen, ejeren afgør en genberegning på — og den, der
//      skal stå på 0 bagefter (docs/drift.md, «Combi til gode»). Pr. runde
//      står også en færdig sætning til hver berørt ligas væg — skåret pr.
//      liga (players.leagueIds), så den kun nævner ligaens egne medlemmer.
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
//   GAME_ID  – valgfrit, default superliga2627. Én kørsel pr. spil: kør den
//              for superliga2627 og pl2627-efteraar hver for sig.
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

// Kampene og spil-dokumentet er til genberegningen forfra (FORÆLDET): runde-
// konteksten og startrunde-gaten bygges af dem, som på serveren.
// Ligaerne læses KUN for deres navne i vægsætningerne.
const [playersSnap, betsSnap, kampeSnap, gameSnap, ligaSnap] = await Promise.all([
  gameRef.collection('players').get(),
  gameRef.collection('bets').get(),
  gameRef.collection('matches').get(),
  gameRef.get(),
  gameRef.collection('leagues').get(),
]);
const spillere = playersSnap.docs.map((d) => ({ ...d.data(), uid: d.id }));
const bets = betsSnap.docs.map((d) => d.data());
const kampe = kampeSnap.docs.map((d) => ({ ...d.data(), id: d.id }));
const game = gameSnap.exists ? gameSnap.data() : null;
const ligaNavn = new Map(ligaSnap.docs.map((d) => [d.id, d.data().name || d.id]));
console.log(`Læst: ${new Date().toISOString()} · ${spillere.length} spillere, ${bets.length} bets, ${kampe.length} kampe`);

// Visningsnavne — kun til tabellen. getAll() uden argumenter kaster, så et spil
// uden spillere springer opslaget over i stedet for at vælte kontrollen.
const navn = new Map();
if (spillere.length) {
  const brugere = await db.getAll(...spillere.map((p) => db.collection('users').doc(p.uid)));
  for (const d of brugere) if (d.exists) navn.set(d.id, d.data().displayName);
}

const v = vurder(spillere, bets, { kampe, game });
console.log('\n' + tabel(v, navn, GAME_ID, ligaNavn).join('\n') + '\n');
if (v.fejl) process.exit(1);
