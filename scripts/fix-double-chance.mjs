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
//   SKRIV    – skal være strengen 'SKRIV' for at der skrives. Alt andet
//              (også tom) er tør-kørsel.
//   GAME_ID  – begræns til ét spil-id (tom = alle spil)
//   BACKUP   – sti til backup-filen (default bets-backup-double-chance.json)
//
// BACKUP TAGES ALTID — også ved tør-kørsel. De gamle bet-point findes ikke i
// noget andet felt, så uden den er en fortrydelse kun mulig via PITR.
// Gendannelse: scripts/rescore-bets.mjs med GENDAN=<fil>.
// ---------------------------------------------------------------------------
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import {
  findDobbelteChancer, byggRettelsesplan, hentNavne, dk, minutter,
} from './lib/doubleChance.mjs';

const require = createRequire(import.meta.url);
const { scoreBet } = require('../functions-platform/superligaScoring');
const { rescoreAllBets, gatedIds } = require('../functions-platform/gameScoring');

// F1 (Security): parametrene læses af MILJØET, ikke af argv. Workflowet
// byggede tidligere en argument-streng og lod shell'en ordsplitte den — så
// kunne ` --apply` skrives i feltet "begræns til ét spil-id", og feltet blev
// både af-begrænsningen (spil-id'et blev tomt) og skrive-knappen. Bekræftet
// mod emulator. Med env findes der ingen ordsplitning at udnytte. Samme
// mønster som scripts/rescore-bets.mjs.
//
// SKRIV skal være strengen 'SKRIV'. Et flueben er for nemt at komme til, og
// naboworkflowet for den SAMME skrivning (rescore-bets.yml) kræver det samme.
const apply = process.env.SKRIV === 'SKRIV';
const kunSpil = (process.env.GAME_ID || '').trim();
const backupSti = process.env.BACKUP || 'bets-backup-double-chance.json';

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
  ? '*** SKRIV=SKRIV: der SKRIVES i produktionsdata ***\n'
  : 'TØR-KØRSEL — der skrives intet. Sæt SKRIV=SKRIV for at rette.\n');

/**
 * Backup af hvert bets point FØR noget røres — også ved tør-kørsel.
 * De gamle tal findes ikke i noget andet felt, og uden filen er en fortrydelse
 * kun mulig via PITR. Formatet er MED VILJE det samme som
 * scripts/rescore-bets.mjs, så GENDAN=<fil> dér kan rulle denne kørsel tilbage
 * uden at der skal skrives et nyt gendannelses-værktøj.
 */
async function taBackup(gameRef, gameId) {
  const snap = await gameRef.collection('bets').get();
  const rows = snap.docs.map((d) => ({
    id: d.id,
    uid: d.data().uid ?? null,
    matchId: d.data().matchId ?? null,
    points: Number(d.data().points) || 0,
    // chanceStake er MED her, men ikke i rescore-bets' backup: det er netop
    // det felt, denne kørsel nulstiller, og uden det kan en gendannelse ikke
    // sætte chancen tilbage.
    chanceStake: Number(d.data().chanceStake) || 0,
  }));
  const fil = `${backupSti.replace(/\.json$/, '')}-${gameId}.json`;
  writeFileSync(fil, JSON.stringify({ gameId, taget: new Date().toISOString(), bets: rows }, null, 2));
  console.log(`  Backup: ${rows.length} bets skrevet til ${fil}`);
}

let rettelser = 0;
let afvigelser = 0;
let afvist = 0;
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
  await taBackup(game.ref, game.id);
  let iDetteSpil = 0;

  // Spillernes nuværende totaler — så før/efter kan vises, ikke bare deltaet.
  const totalFoer = new Map();
  for (const f of fund) {
    const p = await game.ref.collection('players').doc(f.uid).get();
    totalFoer.set(f.uid, Number(p.exists ? p.data().totalPoints : 0) || 0);
  }

  // Gatede kampe springes over af rescoreAllBets. Planen skal vide det, ellers
  // ville tørkørslen love et point, --apply aldrig skriver.
  const gatede = new Set(gatedIds(
    matches.map((m) => ({ id: m.id, ...m.data })),
    game.exists ? game.data() : null,
  ));

  const pickAf = new Map(bets.map((b) => [b.id, b.data.pick]));
  const plan = byggRettelsesplan({ fund, pickAf, totalFoer, gatede, scoreBet });

  for (const a of plan.advarsler) console.log(`  ⚠ ${a}`);

  for (const r of plan.rettelser) {
    console.log(`\n  ${r.navn} · runde ${r.runde}`);
    console.log(`    BEHOLDES  ${r.beholdes.kampNavn} · indsats ${r.beholdes.stake} · point ${r1(r.beholdes.points)}`);
    if (r.beholdes.lagtMs != null) {
      console.log(`              lagt ${dk(r.beholdes.lagtMs)} (kilde: ${r.beholdes.lagtKilde})`);
    }

    if (r.afvist) {
      console.log('    AFVIST    rækkefølgen kan ikke bevises af kickoff-tiderne — kun af et');
      console.log('              tidsstempel, spilleren selv kan skrive indtil trin 3 er live.');
      console.log('              Denne runde rettes IKKE. Afgør den i hånden.');
      afvist += 1;
      continue;
    }
    console.log(`    BEVIS     chance nr. ${r.bevis.nr} blev lagt ${minutter(r.bevis.forsinkelseMs)} EFTER`);
    console.log(`              "${r.bevis.efter.kampNavn}" var gået i gang — den kunne ikke fjernes.`);

    for (const c of r.fjernes) {
      console.log(`    FJERNES   ${c.kampNavn} · indsats ${c.stake}`);
      console.log(`              point ${r1(c.points)} → ${c.nyPoint == null ? '?' : c.nyPoint}  (${c.delta >= 0 ? '+' : ''}${c.delta})`);
      if (apply) {
        await game.ref.collection('bets').doc(c.betId)
          .set({ chanceStake: 0, chanceSatAt: null, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
      rettelser += 1;
      iDetteSpil += 1;
    }
  }

  // Totalen udskrives PR. SPILLER og ikke pr. runde: har samme spiller
  // dobbelt-chance i to runder, er slutstillingen summen af begge, og en
  // linje pr. runde ville vise to tal, hvoraf ingen er den endelige.
  console.log('');
  for (const [uid, t] of plan.totaler) {
    const navn = navne.get(uid) || uid;
    console.log(`  TOTAL     ${navn}: ${r1(t.foer)} → ${r1(t.efter)}  (${t.delta >= 0 ? '+' : ''}${r1(t.delta)})`);
  }

  // F2+F4 (Security): ÉN vagt om skrivningen. rescoreAllBets kaldes ÉT sted
  // med `dryRun: !apply` — ikke inde i en anden `if (apply)`. To vagter om
  // samme skrivning betød, at den inderste kunne fjernes, mens udskriften
  // stadig sagde "TØR-KØRSEL — der skrives intet". Bekræftet ved mutation.
  //
  // Som bivirkning bliver tørkørslen ægte: den kører den samme kaldsvej og
  // kan vise tallet FØR skrivningen i stedet for at advare bagefter.
  console.log(apply
    ? '\n  Genscorer alle tips og lægger totalerne sammen forfra…'
    : '\n  Forhåndsviser genscoringen (tør-kørsel)…');
  const res = await rescoreAllBets(db, FieldValue, game.id, { dryRun: !apply });

  // TRIPWIRE, samme mønster som bagfyldningens forventetPrBet. I TØR-kørsel er
  // chancerne endnu ikke rørt, så svaret SKAL være 0: alt andet er pointdrift
  // fra en ubeslægtet grund, som en --apply ville feje med ind i rettelsen.
  // I APPLY-kørsel skal tallet være netop de chancer, vi fjernede.
  const forventet = apply ? iDetteSpil : 0;
  if (res.aendrede !== forventet) {
    console.log(`\n  ⚠ STOP: rescoreAllBets ${apply ? 'ændrede' : 'ville ændre'} ${res.aendrede} tip(s), forventet ${forventet}.`);
    console.log(`    Samlet delta ${r1(res.delta)}. Forskellen er IKKE fra dobbelt-chancen.`);
    console.log('    Find årsagen først (docs/drift.md, "To slags genberegning").');
    for (const e of res.eksempler || []) {
      console.log(`      ${e.matchId} · ${e.uid}: ${r1(e.foer)} → ${r1(e.efter)}`);
    }
    afvigelser += 1;
  } else if (!apply) {
    console.log(`  ✓ Ingen anden pointdrift i ${game.id} — rettelsen ville kun ramme chancerne.`);
  } else {
    console.log(`  ✓ ${res.aendrede} tip(s) genscoret, samlet delta ${r1(res.delta)}, ${res.players} spillere.`);
  }
}

if (afvist) {
  console.log(`\n${afvist} runde(r) blev AFVIST, fordi rækkefølgen ikke kunne bevises af kickoff-tiderne.`);
}
if (afvigelser) {
  console.error(`\n${afvigelser} spil havde uventet pointdrift — se STOP ovenfor. Intet er meldt ud.`);
  process.exit(1);
}
if (!rettelser) {
  console.log('\nIngen dobbelt-chancer at rette.');
} else if (apply) {
  console.log(`\n${rettelser} chance(r) fjernet og point genberegnet.`);
  console.log('HUSK: rundens historiske delta-pile er IKKE rettet (snapshotRoundRanks er vogtet).');
  console.log('HUSK: er der allerede postet et Runde-Bot-opslag for runden, bærer det de GAMLE');
  console.log('      tal. Det er en statisk besked, ikke en levende visning — ret den i hånden');
  console.log('      efter oprindeligTekst/rettetAt-mønsteret i docs/drift.md.');
  console.log('HUSK: spilleren og ligaen skal have besked — en stille rettelse er værre end ingen.');
} else {
  console.log(`\n${rettelser} chance(r) VILLE blive fjernet. Kør igen med SKRIV=SKRIV for at gøre det.`);
}
