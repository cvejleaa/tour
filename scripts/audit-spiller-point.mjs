// ---------------------------------------------------------------------------
// scripts/audit-spiller-point.mjs — HVOR KOMMER ÉN SPILLERS POINT FRA?
//
// LÆS-ONLY. Skriver ikke ét felt. Findes, fordi en spiller meldte, at han
// havde FÆRRE point i dag end i går, og de forklaringer, der kunne gives uden
// data — ligaens startrunde (#190), en tabt Chance, en afvist runde-vektor —
// alle blev afvist af ejeren. Så skal man se på tallene.
//
// Et fald i en total kan kun komme ét af fire steder fra, og scriptet spørger
// dem alle:
//
//   1. RUBRIKKERNE. players/{uid} bærer `opdeling: {p1x2, chance, combi,
//      pulje}` og `totalPoints`. Er faldet i `chance`, er det en tabt Chance;
//      er det i `combi`, er en rundebonus trukket tilbage; er det i `p1x2`,
//      har et facit ændret sig.
//   2. GENBEREGNINGEN. Scriptet regner spillerens point FORFRA af hans tips og
//      spillets kampe med serverens EGET modul (src/lib/pointOpdeling.js, som
//      er spejlet af functions-platform/pointOpdeling.js). Er det gemte tal og
//      genberegningen uenige, er players-dokumentet forældet — så flyttede
//      noget sig, uden at recalcPlayerTotal blev kørt.
//   3. COMBI-KUPONEN. Rundens bonus gives kun for de kampe, der ligger i
//      rundens EGEN uge (`rundensUge`), og først når hele kuponen er afgjort.
//      Flytter et kickoff sig — og kickoff-synken skriver netop kickoff — kan
//      en kamp falde ind i eller ud af kuponen, og bonussen ændre sig uden at
//      et eneste resultat er rørt. Derfor printes kuponen pr. runde.
//   4. LIGAENS SKALA. En liga med startrunde N regner forfra fra N, og
//      `vektorStemmer` sætter spilleren til 0 uden fejlbesked, hvis vektoren
//      ikke kan gengive totalen. Begge dele printes pr. liga.
//
// Til sidst to ting, der ikke kan ses på én spiller: en scanning for tips på
// GATEDE kampe (lagt, scoret, og holdt uden for totalen uden fejlbesked), og
// hele feltets totaler og runde-nøgler. Et hul i én vektor kan ikke tolkes
// alene — mangler runde 1 for alle, er den gatet eller uspillet.
//
// Der regnes med de SAMME moduler som fladen og serveren — ikke en kopi. En
// kopi ville kunne være enig med sig selv og uenig med spillet.
//
// BRUG (i GitHub Actions, hvor service-accounten ligger som secret):
//   Actions → "Se en spillers point (spil-89af9)" → Run workflow
// Lokalt: SPIL_SA=/sti/til/sa.json node scripts/audit-spiller-point.mjs \
//           --spil superliga2627 --spiller "Forza"
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { ligaPoint, harRundeVektor, vektorStemmer, puljenTaeller } from '../src/lib/ligaPoint.js';
import { buildRoundContext, opdelPoint, kickoffMs } from '../src/lib/pointOpdeling.js';
import { startRundeFor, gatedeKampe } from '../src/lib/startGate.js';

const saPath = process.env.SPIL_SA;
if (!saPath) {
  console.error('Mangler SPIL_SA (sti til service-account for spil-89af9).');
  process.exit(1);
}
const sa = JSON.parse(readFileSync(saPath, 'utf8'));
initializeApp({ credential: cert(sa), projectId: sa.project_id });
const db = getFirestore();

const arg = (navn, fald) => {
  const i = process.argv.indexOf(`--${navn}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fald;
};
const GAME_ID = arg('spil', 'superliga2627');
const SOEG = arg('spiller', '').trim().toLowerCase();

const r1 = (n) => Math.round(n * 10) / 10;
const dkTid = (ms) => (ms == null ? '?' : new Date(ms).toISOString().slice(0, 16).replace('T', ' '));

async function main() {
  console.log(`Læst: ${new Date().toISOString()}`);
  console.log(`Spil: ${GAME_ID}`);

  const gameRef = db.collection('games').doc(GAME_ID);
  const [gameSnap, spillereSnap, kampeSnap, ligaSnap, brugereSnap] = await Promise.all([
    gameRef.get(),
    gameRef.collection('players').get(),
    gameRef.collection('matches').get(),
    gameRef.collection('leagues').get(),
    db.collection('users').get(),
  ]);

  const navne = new Map(brugereSnap.docs.map((d) => {
    const dn = d.data()?.displayName;
    return [d.id, typeof dn === 'string' && dn ? dn : ''];
  }));
  const navnAf = (uid) => navne.get(uid) || '(uden navn)';

  const alle = spillereSnap.docs.map((d) => ({ uid: d.id, ...d.data() }));
  const traef = SOEG ? alle.filter((p) => navnAf(p.uid).toLowerCase().includes(SOEG)) : alle;
  if (!traef.length) {
    console.log(`\nIngen spiller matcher "${SOEG}". Spillets deltagere:`);
    for (const p of alle) console.log(`  ${navnAf(p.uid)}  (${p.uid})`);
    return;
  }

  const kampe = kampeSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const roundCtx = buildRoundContext(kampe);
  const kampAf = new Map(kampe.map((m) => [m.id, m]));
  const ligaer = ligaSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // SPILLETS EGEN GATE. Serveren regner kun på kampe fra spillets startrunde
  // (gameScoring.js:230 gatedIds). Regnede revisionen uden den, ville en
  // spiller med tips i en gatet runde få et for højt tal her — og forskellen
  // ville blive læst som "players-dokumentet er forældet". Den fejl ville
  // pege præcis den forkerte vej.
  const game = gameSnap.exists ? gameSnap.data() : null;
  const startRunde = startRundeFor(game, kampe);
  const gated = gatedeKampe(kampe, startRunde);
  console.log(`Spillets startrunde: ${startRunde ?? 'ingen gate'}`
    + `   (game.startRound=${game?.startRound ?? '–'})`
    + `   ${gated.size} kamp(e) gatet ud`);

  for (const p of traef) {
    const per = p.perRound || null;
    const bonus = Number(p.bonusPoints) || 0;
    console.log(`\n${'='.repeat(66)}\n${navnAf(p.uid)}   (${p.uid})\n${'='.repeat(66)}`);

    // --- 1. Det GEMTE tal og dets rubrikker ---------------------------------
    const o = p.opdeling || {};
    console.log('GEMT PÅ SPILLEREN');
    console.log(`  totalPoints ............ ${p.totalPoints}`);
    console.log(`  opdeling.p1x2 .......... ${o.p1x2 ?? '–'}`);
    console.log(`  opdeling.chance ........ ${o.chance ?? '–'}`);
    console.log(`  opdeling.combi ......... ${o.combi ?? '–'}   (roundBonus: ${p.roundBonus ?? '–'})`);
    console.log(`  opdeling.pulje ......... ${o.pulje ?? '–'}   (bonusPoints: ${bonus})`);
    console.log(`  updatedAt .............. ${p.updatedAt?.toDate?.()?.toISOString() ?? '?'}`);

    // --- 2. Genberegning forfra med serverens eget modul --------------------
    const betsSnap = await gameRef.collection('bets').where('uid', '==', p.uid).get();
    const alleBets = betsSnap.docs.map((d) => d.data());
    const bets = alleBets.filter((b) => !gated.has(b.matchId));
    const nu = opdelPoint({ bets, roundCtx, puljeBonus: bonus });
    const afvig = r1(nu.total - Number(p.totalPoints));
    console.log('\nGENBEREGNET NU (samme modul som serveren, af tips + kampe)');
    console.log(`  total .................. ${nu.total}   (rå uden gulv: ${nu.raaTotal})`);
    console.log(`  p1x2 ${nu.p1x2}   chance ${nu.chance}   combi ${nu.combi}   pulje ${nu.pulje}`);
    console.log(afvig === 0
      ? '  Stemmer med det gemte tal.'
      : `  AFVIGER MED ${afvig} — players-dokumentet er forældet i forhold til tips/kampe.`);

    // --- 3. Combi-kuponen pr. runde ----------------------------------------
    // Rundens bonus kan flytte sig, uden at et resultat gør det: kuponen er de
    // kampe, der ligger i rundens EGEN uge, og kickoff-synken skriver kickoff.
    console.log('\nCOMBI-KUPONEN PR. RUNDE (kupon = kampe i rundens egen uge)');
    for (const [nr, rc] of Object.entries(roundCtx.rounds).sort((a, b) => Number(a[0]) - Number(b[0]))) {
      const udenfor = rc.count - rc.combiCount;
      const faerdig = rc.combiCount > 0 && rc.combiSettled === rc.combiCount;
      console.log(`  runde ${String(nr).padStart(2)}: kupon ${rc.combiSettled}/${rc.combiCount} afgjort`
        + `   runden i alt ${rc.settledCount}/${rc.count}`
        + `   uge ${rc.uge ?? '?'}`
        + (udenfor ? `   ${udenfor} kamp(e) UDENFOR kuponen` : '')
        + (faerdig ? '   → bonus udbetalt' : '   → bonus venter'));
    }

    // --- 3b. Tips pr. runde ------------------------------------------------
    //
    // En runde med præcis 0 point UDELADES af vektoren (`laegTil` springer
    // falsy over). Et hul i vektoren kan derfor betyde tre ting: ingen tips,
    // tips uden afgjorte kampe endnu, eller tips der samlet gav nul. De tre
    // ligner hinanden i fladen og skal skilles ad her.
    const perRundeTips = new Map();
    for (const b of alleBets) {
      const info = roundCtx.byMatch[b.matchId];
      const n = Number.isFinite(info?.round) ? info.round : 'uden';
      const r = perRundeTips.get(n) || { tips: 0, afgjort: 0, point: 0, gatet: 0 };
      r.tips += 1;
      if (gated.has(b.matchId)) r.gatet += 1;
      if (info?.result) { r.afgjort += 1; r.point += Number(b.points) || 0; }
      perRundeTips.set(n, r);
    }
    console.log('\nTIPS PR. RUNDE');
    for (const [nr, r] of [...perRundeTips].sort((a, b) => Number(a[0]) - Number(b[0]))) {
      console.log(`  runde ${String(nr).padStart(4)}: ${r.tips} tip, ${r.afgjort} afgjort,`
        + ` ${r1(r.point)} point fra tips` + (r.gatet ? `, ${r.gatet} GATET UD` : ''));
    }

    // --- 4. Vektoren og ligaerne -------------------------------------------
    console.log('\nRUNDE-VEKTOR');
    if (!harRundeVektor(per)) {
      console.log('  perRound MANGLER HELT — enhver liga med startrunde viser 0 for ham.');
    } else {
      const runder = Object.keys(per).sort((a, b) => Number(a) - Number(b));
      console.log(`  ${runder.map((r) => `r${r}=${per[r]}`).join('  ')}`);
      const sum = ligaPoint(per, null, bonus);
      const stemmer = vektorStemmer(per, p.totalPoints, bonus);
      console.log(`  vektorens sum fra runde 1: ${r1(sum)}`);
      console.log(`  gengiver den totalen? ..... ${stemmer ? 'ja' : `NEJ (forskel ${r1(sum - Number(p.totalPoints))})`}`);
      if (!stemmer) {
        console.log('    En vektor, der ikke kan gengive totalen, sætter spilleren til 0');
        console.log('    i enhver liga-visning med startrunde — uden fejlbesked.');
      }
    }

    const hans = ligaer.filter((l) => (l.memberUids || []).includes(p.uid));
    console.log(`\nLIGAER (${hans.length})`);
    for (const l of hans) {
      const sr = Number.isFinite(l.startRound) ? l.startRound : null;
      const klar = harRundeVektor(per) && vektorStemmer(per, p.totalPoints, bonus);
      console.log(`  ${String(l.name || l.id).padEnd(26)} startrunde=${String(sr ?? '–').padStart(2)}`
        + `  viser ${klar ? r1(ligaPoint(per, sr, bonus)) : '0 (IKKE KLAR)'}`
        + (puljenTaeller(sr) ? '' : '  [puljen tæller ikke med]'));
    }

    // --- 5. Chancen — den eneste mekanik, der kan trække point fra ----------
    const chancer = bets.filter((b) => Number(b.chanceStake) > 0);
    console.log(`\nCHANCEN (${chancer.length} brugt)`);
    for (const c of chancer.sort((a, b) => (kampAf.get(a.matchId)?.round ?? 0) - (kampAf.get(b.matchId)?.round ?? 0))) {
      const m = kampAf.get(c.matchId);
      console.log(`  runde ${String(m?.round ?? '?').padStart(2)}  ${m?.home || '?'}–${m?.away || '?'}`
        + `  tip ${c.pick}  facit ${m?.result ?? '–'}  indsats ${c.chanceStake}  point ${c.points ?? '–'}`
        + `  kickoff ${dkTid(kickoffMs(m))}`);
    }
    if (!chancer.length) console.log('  ingen — et fald kan ikke komme derfra.');
  }

  // --- Gatede tips --------------------------------------------------------
  //
  // Et tip på en kamp FØR spillets startrunde bliver scoret som alle andre —
  // `points` står på dokumentet — men `gatedIds` holder det ude af totalen.
  // Spilleren ser altså et tip, han har lagt, og et facit han ramte, uden at
  // det tæller. Det siger fladen ham ikke, og der findes ingen fejlbesked.
  //
  // Kigges der kun på ÉN spiller, kan det ikke ses: hans egen udskrift viser
  // bare en runde, der mangler. Derfor scannes hele spillets bets her.
  console.log(`\n${'='.repeat(66)}\nGATEDE TIPS (lagt, scoret — og holdt uden for totalen)\n${'='.repeat(66)}`);
  if (!gated.size) {
    console.log('  Spillet gater ingen kampe. Der kan ikke findes gatede tips.');
  } else {
    const alleBetsSnap = await gameRef.collection('bets').get();
    const ramt = new Map(); // uid → {antal, point, runder:Set}
    for (const d of alleBetsSnap.docs) {
      const b = d.data();
      if (!gated.has(b.matchId)) continue;
      const r = ramt.get(b.uid) || { antal: 0, point: 0, runder: new Set() };
      r.antal += 1;
      r.point += Number(b.points) || 0;
      const nr = roundCtx.byMatch[b.matchId]?.round;
      r.runder.add(Number.isFinite(nr) ? nr : '?');
      ramt.set(b.uid, r);
    }
    console.log(`  Gatede kampe: ${gated.size} (spillet tæller fra runde ${startRunde}).`);
    if (!ramt.size) {
      console.log(`  Ingen af ${alleBetsSnap.size} tips ligger på dem. Ingen mister point på gaten.`);
    } else {
      console.log(`  ${ramt.size} spiller(e) har tips på en gatet kamp:`);
      for (const [uid, r] of [...ramt].sort((a, b) => b[1].point - a[1].point)) {
        console.log(`    ${navnAf(uid).padEnd(22)} ${r.antal} tip i runde ${[...r.runder].join(',')}`
          + `  →  ${r1(r.point)} point tælles IKKE med`);
      }
    }
  }

  // --- Feltet til sammenligning ------------------------------------------
  //
  // Et hul i ÉN spillers vektor kan ikke tolkes alene. Mangler runde 1 for
  // alle, er den gatet eller uspillet; mangler den kun for ham, er det hans
  // egne tips. Derfor den korte tabel — navn, total og hvilke runder han har.
  console.log(`\n${'='.repeat(66)}\nHELE FELTET (til sammenligning)\n${'='.repeat(66)}`);
  for (const p of [...alle].sort((a, b) => (Number(b.totalPoints) || 0) - (Number(a.totalPoints) || 0))) {
    const runder = harRundeVektor(p.perRound)
      ? Object.keys(p.perRound).sort((a, b) => Number(a) - Number(b)).join(',')
      : 'INGEN VEKTOR';
    console.log(`  ${navnAf(p.uid).padEnd(22)} ${String(p.totalPoints).padStart(7)}   runder: ${runder}`);
  }
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
