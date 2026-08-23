// ---------------------------------------------------------------------------
// scripts/fix-double-chance.mjs — RET en historisk dobbelt-Chancen.
//
// Chancen må bruges ÉN gang pr. runde. Reglen stod indtil trin 3 kun i
// browseren, og et hul i fladen (lukket 9/8-2026) lod en spiller sætte ⚡ på
// kamp A, se den låse ved kickoff, og bagefter sætte den igen på kamp B i
// samme runde. Auditen fandt ét tilfælde i hele platformen.
//
// BESLUTNINGEN, DER ER TRUFFET: behold den FØRST lagte chance, fjern de
// senere. Ikke af nostalgi — den senere blev sat med mere information, fordi
// den første kamp allerede var i gang og ikke kunne fjernes. At beholde den
// sene ville belønne netop den informationsfordel, reglen findes for at fjerne.
// Rækkefølgen bestemmes af lagtTidspunkt() i scripts/lib/doubleChance.mjs, som
// auditen bruger til det SAMME svar — reglen findes ét sted.
//
// TØR-KØRSEL ER STANDARD. Uden --apply skrives INTET; scriptet udskriver, hvad
// der ville ske, og med hvilke tal. Kvitteringen er den udskrift.
//
// SÅDAN REGNES DE NYE POINT: med scoreBet fra functions-platform —
// nøjagtig den funktion, afregningen selv kalder (gameScoring.js:650). Der er
// ingen kopi af pointreglen i dette script. Ved --apply skrives chanceStake:0
// først, og derefter kalder scriptet rescoreAllBets, som genscorer HVERT tip
// mod sin kamps facit og lægger spillernes totaler sammen forfra i samme kald.
//
// HVAD DEN IKKE RØRER: snapshotRoundRanks. Den er vogtet af
// game.snapshottedRounds (gameScoring.js:561) og kører ikke igen for en runde,
// der er gjort op. Den LEVENDE stilling retter sig selv (den regnes af
// totalPoints), men rundens historiske delta-pile fortæller fortsat den gamle
// historie. Det er med vilje: tvang man et nyt snapshot igennem, ville de
// FØLGENDE runders bevægelser blive målt fra et forkert udgangspunkt.
//
// Miljø:
//   SPIL_SA  – sti til service-account-JSON for spil-89af9
// Flag:
//   --apply  – skriv rigtigt (uden dette: tør-kørsel)
//   --game=  – begræns til ét spil-id (uden dette: alle spil)
// ---------------------------------------------------------------------------
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import {
  findDobbelteChancer, beviserMekanismen, hentNavne, dk, minutter,
} from './lib/doubleChance.mjs';

const require = createRequire(import.meta.url);
const { scoreBet } = require('../functions-platform/superligaScoring');
const { rescoreAllBets } = require('../functions-platform/gameScoring');

const apply = process.argv.includes('--apply');
const kunSpil = (process.argv.find((a) => a.startsWith('--game=')) || '').slice(7);

const saPath = process.env.SPIL_SA;
if (!saPath) {
  console.error('Mangler SPIL_SA (sti til service-account for spil-89af9).');
  process.exit(1);
}
const sa = JSON.parse(readFileSync(saPath, 'utf8'));
initializeApp({ credential: cert(sa), projectId: sa.project_id });
const db = getFirestore();

const r1 = (n) => Math.round(n * 10) / 10;
console.log(apply
  ? '*** --apply: der SKRIVES i produktionsdata ***\n'
  : 'TØR-KØRSEL — der skrives intet. Kør med --apply for at rette.\n');

let rettelser = 0;
const gamesSnap = await db.collection('games').get();

for (const game of gamesSnap.docs) {
  if (kunSpil && game.id !== kunSpil) continue;
  const [betsSnap, matchesSnap] = await Promise.all([
    game.ref.collection('bets').get(),
    game.ref.collection('matches').get(),
  ]);
  if (betsSnap.empty) continue;

  const bets = betsSnap.docs.map((d) => ({ id: d.id, data: d.data() }));
  const matches = matchesSnap.docs.map((d) => ({ id: d.id, data: d.data() }));
  const navne = await hentNavne(db, bets.map((b) => b.data.uid));
  const fund = findDobbelteChancer({ bets, matches, navne });

  console.log(`${game.id}: ${bets.length} tips · ${fund.length} runder med dobbelt chance`);
  if (!fund.length) continue;

  // Spillernes nuværende totaler — så før/efter kan vises, ikke bare deltaet.
  const totalFoer = new Map();
  for (const f of fund) {
    const p = await game.ref.collection('players').doc(f.uid).get();
    totalFoer.set(f.uid, Number(p.exists ? p.data().totalPoints : 0) || 0);
  }

  for (const f of fund) {
    const [beholdes, ...fjernes] = f.chancer;
    console.log(`\n  ${f.navn} · runde ${f.runde}`);
    console.log(`    BEHOLDES  ${beholdes.kampNavn} · indsats ${beholdes.stake} · point ${r1(beholdes.points)}`);
    if (beholdes.lagtMs != null) {
      console.log(`              lagt ${dk(beholdes.lagtMs)} (kilde: ${beholdes.lagtKilde})`);
    }

    const bevis = beviserMekanismen(f.chancer);
    if (bevis) {
      console.log(`    BEVIS     chance nr. ${bevis.nr} blev lagt ${minutter(bevis.forsinkelseMs)} EFTER`);
      console.log(`              "${bevis.efter.kampNavn}" var gået i gang — den kunne ikke fjernes.`);
    } else {
      // Uden beviset hviler rækkefølgen på et tidsstempel alene. Sig det højt.
      console.log('    ADVARSEL  rækkefølgen kan ikke bevises af kickoff-tiderne — kun af tidsstemplet.');
    }

    let deltaSum = 0;
    for (const c of fjernes) {
      // Samme funktion som afregningen bruger. Ingen kopi af pointreglen her.
      const efter = scoreBet({ pick: bets.find((b) => b.id === c.betId).data.pick, chanceStake: 0 }, c.result, c.odds);
      const delta = r1(efter - c.points);
      deltaSum = r1(deltaSum + delta);
      console.log(`    FJERNES   ${c.kampNavn} · indsats ${c.stake}`);
      console.log(`              point ${r1(c.points)} → ${r1(efter)}  (${delta >= 0 ? '+' : ''}${delta})`);
      if (apply) {
        await db.collection('games').doc(game.id).collection('bets').doc(c.betId)
          .set({ chanceStake: 0, chanceSatAt: null, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
      rettelser += 1;
    }
    const foer = totalFoer.get(f.uid);
    console.log(`    TOTAL     ${r1(foer)} → ${r1(foer + deltaSum)}  (${deltaSum >= 0 ? '+' : ''}${deltaSum})`);
  }

  if (apply) {
    console.log('\n  Genscorer alle tips og lægger totalerne sammen forfra…');
    const res = await rescoreAllBets(db, FieldValue, game.id, { dryRun: false });
    console.log(`  rescoreAllBets: ${res.aendrede} tips ændret, samlet delta ${r1(res.delta)}, ${res.players} spillere.`);
  }
}

if (!rettelser) {
  console.log('\nIngen dobbelt-chancer at rette.');
} else if (apply) {
  console.log(`\n${rettelser} chance(r) fjernet og point genberegnet.`);
  console.log('HUSK: rundens historiske delta-pile er IKKE rettet (snapshotRoundRanks er vogtet).');
  console.log('HUSK: spilleren og ligaen skal have besked — en stille rettelse er værre end ingen.');
} else {
  console.log(`\n${rettelser} chance(r) VILLE blive fjernet. Kør igen med --apply for at gøre det.`);
}
