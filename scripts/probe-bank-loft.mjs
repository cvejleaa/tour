// ---------------------------------------------------------------------------
// scripts/probe-bank-loft.mjs — LÆS-ONLY måling: hvad ville det KOSTE at lade
// afregningen håndhæve det bank-afhængige loft på Chancen?
//
// I dag håndhæves 15 %-loftet (CHANCE.CAP_FRACTION) INGEN steder på serveren:
// gameScoring kalder scoreBet(bet, result, odds) uden `bank`, og clampStake
// uden bank klipper kun til MAX_ABS. Kun browserens isValidStake gør det, og
// den kan omgås.
//
// HVILKEN BANK? Ikke spillerens NUVÆRENDE totalPoints — så ville runde 3's
// point afhænge af runde 12's resultater, og en genberegning senere gav et
// andet svar end den oprindelige. Her måles med saldoen FØR runden: summen af
// perRound for runder < R. Det er velfunderet rekursion, ikke cirkularitet, og
// det er den eneste definition, der giver samme svar hver gang.
//
// FORBEHOLD, DER SKAL LÆSES MED TALLENE: det, spilleren SÅ, da han satte
// chancen, var `playerBank(me)` — den LEVENDE totalPoints midt i runden. Den
// kan være højere end saldoen før runden (han havde allerede point i runden).
// En spiller kan altså have fulgt reglen, som fladen viste den, og alligevel
// stå til et fradrag her. Derfor skelner målingen mellem:
//   OVER BEGGE  — indsatsen var over loftet uanset hvilken bank man bruger.
//                 Her har browserens vagt været omgået, eller banken er faldet.
//   KUN FØR-RUNDEN — indsatsen var lovlig på det levende tal, men er over
//                 loftet målt før runden. Det er dem, en retroaktiv håndhævelse
//                 ville ramme urimeligt.
//
// Skriver ALDRIG noget.
//
// Miljø:
//   SPIL_SA  – sti til service-account-JSON for spil-89af9
// ---------------------------------------------------------------------------
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const require = createRequire(import.meta.url);
const { scoreBet, chanceMaxStake, CHANCE } = require('../functions-platform/superligaScoring');

const saPath = process.env.SPIL_SA;
if (!saPath) {
  console.error('Mangler SPIL_SA (sti til service-account for spil-89af9).');
  process.exit(1);
}
const sa = JSON.parse(readFileSync(saPath, 'utf8'));
initializeApp({ credential: cert(sa), projectId: sa.project_id });
const db = getFirestore();

const r1 = (n) => Math.round(n * 10) / 10;
console.log(`LÆS-ONLY måling. Loft: ${CHANCE.CAP_FRACTION * 100} % af saldoen, absolut maks ${CHANCE.MAX_ABS}.\n`);

const gamesSnap = await db.collection('games').get();

for (const game of gamesSnap.docs) {
  const [betsSnap, matchesSnap, playersSnap] = await Promise.all([
    game.ref.collection('bets').get(),
    game.ref.collection('matches').get(),
    game.ref.collection('players').get(),
  ]);
  if (betsSnap.empty) continue;

  const kampAf = new Map(matchesSnap.docs.map((d) => [d.id, d.data()]));
  const spiller = new Map(playersSnap.docs.map((d) => [d.id, d.data()]));

  /** Saldo FØR runde R: summen af perRound for alle runder < R. */
  function bankFoerRunde(uid, runde) {
    const pr = spiller.get(uid)?.perRound || {};
    let sum = 0;
    for (const [r, v] of Object.entries(pr)) {
      const n = Number(r);
      if (Number.isFinite(n) && n < runde) sum += Number(v) || 0;
    }
    return sum;
  }

  const ramte = [];
  let medChance = 0;
  for (const d of betsSnap.docs) {
    const b = d.data();
    const stake = Number(b.chanceStake) || 0;
    if (stake <= 0) continue;
    const kamp = kampAf.get(b.matchId);
    if (!kamp || kamp.round == null) continue;
    const result = kamp.result ?? null;
    if (!result) continue; // uafgjort endnu — intet at omregne
    medChance += 1;

    const bankFoer = bankFoerRunde(b.uid, Number(kamp.round));
    const loftFoer = chanceMaxStake(bankFoer);
    const bankNu = Number(spiller.get(b.uid)?.totalPoints) || 0;
    const loftNu = chanceMaxStake(bankNu);
    if (stake <= loftFoer) continue; // loftet binder ikke

    const nu = Number(b.points) || 0;
    const efter = r1(scoreBet(b, result, kamp.odds ?? null, bankFoer));
    ramte.push({
      uid: b.uid,
      navn: spiller.get(b.uid)?.displayName || b.uid,
      runde: Number(kamp.round),
      kamp: `${kamp.home ?? '?'}–${kamp.away ?? '?'}`,
      stake,
      bankFoer: r1(bankFoer),
      loftFoer,
      loftNu,
      // Var indsatsen OGSÅ over loftet på det levende tal, spilleren så?
      ogsaaOverNu: stake > loftNu,
      nu,
      efter,
      delta: r1(efter - nu),
    });
  }

  console.log(`=== ${game.id}: ${betsSnap.size} tips, ${medChance} afgjorte chancer, ${ramte.length} hvor loftet ville binde`);
  if (!ramte.length) { console.log('   (ingen)\n'); continue; }

  ramte.sort((a, b) => a.delta - b.delta);
  for (const x of ramte) {
    const mærke = x.ogsaaOverNu ? 'OVER BEGGE   ' : 'KUN FØR-RUNDEN';
    console.log(`   ${mærke} ${x.navn} · runde ${x.runde} · ${x.kamp}`);
    console.log(`      indsats ${x.stake} · saldo før runden ${x.bankFoer} → loft ${x.loftFoer} (loft på nuværende saldo: ${x.loftNu})`);
    console.log(`      point ${x.nu} → ${x.efter}  (${x.delta >= 0 ? '+' : ''}${x.delta})`);
  }

  // Pr. SPILLER, ikke kun pr. tip: det er totalen, stillingen afgøres af.
  const prSpiller = new Map();
  for (const x of ramte) {
    const cur = prSpiller.get(x.uid) || { navn: x.navn, delta: 0, antal: 0, kunFoer: 0 };
    cur.delta = r1(cur.delta + x.delta);
    cur.antal += 1;
    if (!x.ogsaaOverNu) cur.kunFoer += 1;
    prSpiller.set(x.uid, cur);
  }
  console.log('\n   PR. SPILLER:');
  for (const [uid, v] of [...prSpiller.entries()].sort((a, b) => a[1].delta - b[1].delta)) {
    const total = Number(spiller.get(uid)?.totalPoints) || 0;
    console.log(`      ${v.navn}: ${r1(total)} → ${r1(total + v.delta)}  (${v.delta >= 0 ? '+' : ''}${v.delta})`
      + ` · ${v.antal} tip, heraf ${v.kunFoer} kun ramt af før-runden-banken`);
  }
  console.log('');
}

console.log('Målingen skriver intet. Tallene er grundlaget for beslutningen, ikke beslutningen.');
