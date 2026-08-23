// ---------------------------------------------------------------------------
// scripts/audit-double-chance.mjs — LÆS-ONLY tjek for DOBBELT Chancen i samme
// runde.
//
// Chancen må bruges ÉN gang pr. runde. Reglen stod indtil trin 3 kun i
// browseren: hverken firestore.rules eller serverens afregning kendte den, og
// gameScoring afregner hvert tip for sig. Et hul i fladen — lukket 9/8-2026,
// commit 7b9e1eb — kunne derfor lade en spiller sætte Chancen på kamp A, se
// den låse ved kickoff, og bagefter sætte den igen på kamp B i SAMME runde.
//
// Dette script finder, hvor mange gange det er sket, hvad det har kostet eller
// givet, og NÅR chancerne blev lagt i forhold til kampenes kickoff.
//
// Selve reglen — hvad en dobbelt-chance er, og hvilken af dem der er den
// FØRSTE — bor i scripts/lib/doubleChance.mjs og deles med
// fix-double-chance.mjs. Var den skrevet to steder, kunne auditen rapportere
// én kamp og rettelsen nulstille en anden, uden at nogen af dem blev røde.
//
// Skriver ALDRIG noget. Exit-kode 1 hvis der findes dobbelt-chancer.
//
// Miljø:
//   SPIL_SA  – sti til service-account-JSON for spil-89af9
// ---------------------------------------------------------------------------
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
  findDobbelteChancer, beviserMekanismen, hentNavne, dk, minutter,
} from './lib/doubleChance.mjs';

const saPath = process.env.SPIL_SA;
if (!saPath) {
  console.error('Mangler SPIL_SA (sti til service-account for spil-89af9).');
  process.exit(1);
}
const sa = JSON.parse(readFileSync(saPath, 'utf8'));
initializeApp({ credential: cert(sa), projectId: sa.project_id });
const db = getFirestore();

const r1 = (n) => Math.round(n * 10) / 10;
let problems = 0;
const gamesSnap = await db.collection('games').get();

for (const game of gamesSnap.docs) {
  const [betsSnap, matchesSnap] = await Promise.all([
    game.ref.collection('bets').get(),
    game.ref.collection('matches').get(),
  ]);
  if (betsSnap.empty) continue;

  const bets = betsSnap.docs.map((d) => ({ id: d.id, data: d.data() }));
  const matches = matchesSnap.docs.map((d) => ({ id: d.id, data: d.data() }));
  // Navnet bor på users/{uid}, ikke på spillets players-dokument — samme kilde
  // som Runde-Botten (gameRecap.js:323). En tidligere udgave læste det forkerte
  // sted og udskrev rå uid'er, hvor ejeren skulle kunne læse et navn.
  const navne = await hentNavne(db, bets.map((b) => b.data.uid));
  const fund = findDobbelteChancer({ bets, matches, navne });

  const brugte = bets.filter((b) => (Number(b.data.chanceStake) || 0) > 0).length;
  console.log(`${game.id}: ${bets.length} tips, ${brugte} chancer brugt, ${fund.length} runder med DOBBELT chance`);

  for (const f of fund) {
    console.log(`  DOBBELT  ${f.navn} (${f.uid}) · runde ${f.runde} · ${f.chancer.length} chancer:`);
    for (const [i, c] of f.chancer.entries()) {
      const ko = c.kickoffMs == null ? '?' : dk(c.kickoffMs);
      const lagt = c.lagtMs == null ? '?' : dk(c.lagtMs);
      const foer = c.kickoffMs != null && c.lagtMs != null
        ? `${minutter(c.kickoffMs - c.lagtMs)} før eget kickoff`
        : 'ukendt';
      console.log(`      ${i + 1}. ${c.kampNavn}`);
      console.log(`         kickoff ${ko} · lagt ${lagt} (${foer}) [kilde: ${c.lagtKilde}]`);
      console.log(`         indsats ${c.stake}, point ${r1(c.points)}`);
    }
    // DEN AFGØRENDE LINJE: er en senere chance lagt, efter en tidligere
    // chances kamp var låst, er mekanismen bekræftet — spilleren kunne ikke
    // fjerne den første, fordi reglerne afviser skrivning efter kickoff.
    const bevis = beviserMekanismen(f.chancer);
    if (bevis) {
      console.log(`         ⇒ nr. ${bevis.nr} blev lagt ${minutter(bevis.forsinkelseMs)} EFTER `
        + `"${bevis.efter.kampNavn}" var gået i gang — den kunne altså ikke fjernes.`);
    }
    problems += 1;
  }
}

if (problems > 0) {
  console.error(`\n${problems} runder med dobbelt Chancen fundet.`);
  console.error('Rettelse af data er en EJER-beslutning (docs/drift.md) — dette script skriver intet.');
  console.error('Rettelsen ligger i scripts/fix-double-chance.mjs (tør-kørsel som standard).');
  process.exit(1);
}
console.log('\nIngen dobbelt-chancer fundet.');
