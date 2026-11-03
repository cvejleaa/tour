// ---------------------------------------------------------------------------
// scripts/maal-haandbold.mjs — håndboldprofilen MÅLT (D4).
//
// Kører Elo kronologisk over scripts/haandbold-historik.json (VM/EM 2019-2026,
// 677 kampe, stillingen EFTER 60 MIN) og vælger K, DRAW_BASE og startstyrker
// ved log-loss over hver enkelt kamp — samme metode som fodboldens
// (scripts/maal-uafgjort.mjs). Alle tal i kommentaren ved
// SPORT_PROFILER.haandbold (src/lib/superligaScoring.js) og i
// src/data/haandboldVm2027Hold.js kommer herfra; testene i
// scripts/lib/haandboldMaaling.test.mjs og src/data/haandboldVm2027Hold.test.js
// efterprøver, at de committede tal stadig ER, hvad målingen giver.
//
// INTET NETVÆRK. Historikken er hentet og committet af
// scripts/haandbold-historik.mjs; dette script læser kun filen.
//
// BRUG:  node scripts/maal-haandbold.mjs           (≈ 40 s; to gennemløb af gitteret)
//        node scripts/maal-haandbold.mjs --json    (kun resultatet, maskinlæsbart)
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs';
import {
  maal, vedKant, score, koerElo, maaltePaa, kronologisk, skew, fitBase, baseInterval, uafgjortAndel, erKnockout,
  holdStartElo, valgteParametre, trin, GITTER, DECAY_LAAS, OPVARMNING, VAERTER, sandsynligheder,
} from './lib/haandboldMaaling.mjs';
import { ELO, ODDS, OUTCOME, SPORT_PROFILER, sportProfil } from '../src/lib/superligaScoring.js';
import { buildMatches } from '../src/lib/superligaSeed.js';
import { HAANDBOLD_VM2027_HOLD } from '../src/data/haandboldVm2027Hold.js';

const HISTORIK = JSON.parse(readFileSync(new URL('./haandbold-historik.json', import.meta.url), 'utf8'));
const PROGRAM = JSON.parse(readFileSync(new URL('./haandbold-vm2027-program.json', import.meta.url), 'utf8'));
const JSON_UD = process.argv.includes('--json');

const pct = (x, d = 1) => `${(100 * x).toFixed(d).replace('.', ',')} %`;
const tal = (x, d = 3) => x.toFixed(d).replace('.', ',');
const log = JSON_UD ? () => {} : (s = '') => console.log(s);
const linje = () => log('='.repeat(78));

// FODBOLDENS tal til sammenligning. Raten er målt af scripts/maal-uafgjort.mjs
// (13 sæsoner Superliga + 10 Premier League; kommentaren ved ELO i
// src/lib/superligaScoring.js). Konstanterne læses LEVENDE fra ELO.
const FODBOLD_UAFGJORT = { uafgjort: 1493, kampe: 6143 };

// --- 1. Grundlaget ------------------------------------------------------------
linje();
log('1. GRUNDLAGET — stillingen efter 60 min');
linje();
log('  turnering   kampe   uafgjort   rate     forlænget  straffe');
for (const t of HISTORIK.turneringer) {
  const k = HISTORIK.kampe.filter((m) => m.turnering === t);
  const a = uafgjortAndel(k);
  const fl = k.filter((m) => m.afgjort === 'forlaenget').length;
  const st = k.filter((m) => m.afgjort === 'straffe').length;
  log(`  ${t.padEnd(10)}${String(k.length).padStart(6)}${String(a.uafgjort).padStart(10)}   ${pct(a.andel).padStart(7)}${String(fl).padStart(9)}${String(st).padStart(9)}${OPVARMNING.includes(t) ? '   (opvarmning)' : ''}`);
}
const alle = uafgjortAndel(HISTORIK.kampe);
const ko = uafgjortAndel(HISTORIK.kampe.filter(erKnockout));
log(`  I ALT     ${String(alle.kampe).padStart(6)}${String(alle.uafgjort).padStart(10)}   ${pct(alle.andel).padStart(7)}`);
log(`\n  Knockout (kvart, semi, bronze, finale): ${ko.uafgjort} af ${ko.kampe} = ${pct(ko.andel)} uafgjort efter 60 min.`);
log(`  Fodbold til sammenligning: ${FODBOLD_UAFGJORT.uafgjort} af ${FODBOLD_UAFGJORT.kampe} = ${pct(FODBOLD_UAFGJORT.uafgjort / FODBOLD_UAFGJORT.kampe)} (scripts/maal-uafgjort.mjs).`);

// --- 2. Gitteret -------------------------------------------------------------
const R = maal(HISTORIK);
const kant = vedKant(R.elo);
log('');
linje();
log(`2. GITTERET — ${R.resultater.length} kombinationer pr. gennemløb, log-loss over ${R.obs.length} kampe (efter ${OPVARMNING.join(' + ')})`);
linje();
log(`  Gitter: K ${GITTER.k[0]}-${GITTER.k.at(-1)}, K i opvarmning ${GITTER.kOpvarmning.join('/')}, carry ${GITTER.carry.join('/')}, nyStart ${GITTER.nyStart[0]}-${GITTER.nyStart.at(-1)}, vært ${GITTER.vaert.join('/')}`);
log(`  Decay låst på ${DECAY_LAAS} (se afsnit 4).`);
for (const f of R.forloeb) {
  log(`  gennemløb ${f.runde}: K ${f.k}, K-opvarmning ${f.kOpvarmning}, carry ${f.carry}, nyStart ${f.nyStart}, vært ${f.vaert} → base ${f.base}   (log-loss ${tal(f.logLoss, 4)})`);
}
log(`  Valgt: K ${R.elo.k} · DRAW_BASE ${R.base} · DRAW_DECAY ${R.decay} (låst) · K-opvarmning ${R.elo.kOpvarmning} · carry ${R.elo.carry} · nyStart ${R.elo.nyStart} · vært ${R.elo.vaert}`);
log(kant.length ? `  ⚠️  PÅ GITTERETS KANT: ${kant.join(', ')} — udvid gitteret, før tallet bruges.` : '  Ingen parameter ligger på gitterets kant.');
if (SPORT_PROFILER.haandbold) {
  const c = valgteParametre(SPORT_PROFILER.haandbold);
  const ens = Object.keys(R.elo).every((p) => R.elo[p] === c[p])
    && SPORT_PROFILER.haandbold.elo.DRAW_BASE === R.base && SPORT_PROFILER.haandbold.elo.DRAW_DECAY === R.decay;
  log(ens ? '  De committede tal (SPORT_PROFILER.haandbold + STARTMETODE) ER målingens.'
    : `  ⚠️  De committede tal er IKKE målingens: committet ${JSON.stringify({ ...c, base: SPORT_PROFILER.haandbold.elo.DRAW_BASE, decay: SPORT_PROFILER.haandbold.elo.DRAW_DECAY })}.`);
}

// --- 3. K --------------------------------------------------------------------
log('');
linje();
log('3. K — bedste log-loss for hver K (de andre parametre optimeret), 95 %-interval');
linje();
const n = R.obs.length;
const bedsteNll = R.resultater[0].logLoss * n;
const kProfil = GITTER.k.map((k) => {
  const r = R.resultater.filter((x) => x.k === k)[0];
  return { k, logLoss: r.logLoss, brier: r.brier, dNll: r.logLoss * n - bedsteNll };
});
log('     K    log-loss   Brier    ΔNLL');
for (const r of kProfil) log(`  ${String(r.k).padStart(4)}    ${tal(r.logLoss, 4)}    ${tal(r.brier, 4)}  ${tal(r.dNll, 2).padStart(6)}${r.dNll <= 1.92 ? '   ← inden for 95 %' : ''}${r.k === ELO.K ? '   ← fodbold' : ''}`);
const kInden = kProfil.filter((r) => r.dNll <= 1.92).map((r) => r.k);
log(`  95 %-interval for K: ${kInden[0]}-${kInden.at(-1)}. Fodboldens K ${ELO.K}: ΔNLL ${tal(kProfil.find((r) => r.k === ELO.K).dNll, 1)}.`);

// --- 4. Uafgjort-modellen ------------------------------------------------------
log('');
linje();
log('4. UAFGJORT — drawBase og drawDecay');
linje();
log(`  Frit fit (base + decay): base ${R.fri.base}, decay ${R.fri.decay}; 95 %-interval for decay ${R.fri.decayInterval[0]}-${R.fri.decayInterval[1]}.`);
log(`  → Decay er UMÅLELIG her (${R.obs.filter((o) => o.udfald === OUTCOME.DRAW).length} uafgjorte i ${n} kampe): intervallet rummer både 0 og fodboldens ${ELO.DRAW_DECAY}.`);
log(`    Låst på ${DECAY_LAAS} (fodboldens målte form); kun base fittes. Begrundelsen: DECAY_LAAS i scripts/lib/haandboldMaaling.mjs.`);
log('\n  decay låst på   bedste base   95 %-interval for base   NLL');
for (const d of [0, 0.25, DECAY_LAAS, 1]) {
  const b = fitBase(R.obs, d);
  const iv = baseInterval(R.obs, d);
  log(`  ${tal(d, 2).padStart(13)}   ${tal(b.base).padStart(11)}   ${tal(iv[0])}-${tal(iv[1])}${''.padStart(12)}${tal(b.l, 1)}`);
}
const baseIv = baseInterval(R.obs, DECAY_LAAS);
log(`\n  Fodboldens DRAW_BASE ${ELO.DRAW_BASE} ligger ${ELO.DRAW_BASE >= baseIv[0] && ELO.DRAW_BASE <= baseIv[1] ? 'INDEN FOR' : 'UDEN FOR'} intervallet ${tal(baseIv[0])}-${tal(baseIv[1])}.`);

log('\n  Uafgjort mod styrkeforskel (5 lige store bånd, målte kampe):');
log('  skew-bånd   kampe   faktisk   ±95 %    håndbold   fodbold-model');
const sorteret = [...R.obs].sort((a, b) => skew(a) - skew(b));
const BAAND = 5;
const pr = Math.floor(sorteret.length / BAAND);
const model = (s, base, dec) => base * Math.exp(-dec * s * 2);
for (let i = 0; i < BAAND; i += 1) {
  const d = sorteret.slice(i * pr, i === BAAND - 1 ? sorteret.length : (i + 1) * pr);
  const p = d.filter((o) => o.udfald === OUTCOME.DRAW).length / d.length;
  const se = Math.sqrt(p * (1 - p) / d.length);
  const midt = d.reduce((a, o) => a + skew(o), 0) / d.length;
  log(`  ${tal(skew(d[0]), 2)}-${tal(skew(d.at(-1)), 2)}  ${String(d.length).padStart(6)}   ${pct(p).padStart(7)}   ±${pct(1.96 * se).padStart(6)}   ${pct(model(midt, R.base, DECAY_LAAS)).padStart(7)}    ${pct(model(midt, ELO.DRAW_BASE, ELO.DRAW_DECAY)).padStart(7)}`);
}
const forv = R.obs.reduce((a, o) => a + model(skew(o), R.base, DECAY_LAAS), 0);
const fak = R.obs.filter((o) => o.udfald === OUTCOME.DRAW).length;
const forvFod = R.obs.reduce((a, o) => a + model(skew(o), ELO.DRAW_BASE, ELO.DRAW_DECAY), 0);
log(`\n  Forventede uafgjorte: håndbold ${tal(forv, 1)}, fodbold-modellen ${tal(forvFod, 1)} — faktisk ${fak}.`);
const koObs = R.obs.filter(erKnockout);
const koForv = koObs.reduce((a, o) => a + model(skew(o), R.base, DECAY_LAAS), 0);
log(`  Heraf knockout: ${koObs.filter((o) => o.udfald === OUTCOME.DRAW).length} af ${koObs.length} faktisk, ${tal(koForv, 1)} forventet.`);

// HALEN: passer modellen også dér, hvor den er MEGET sikker? K 120 giver
// skarpe ratings og dermed odds langt over fodboldens højeste (24,39). Er de
// for skarpe, viser det sig her som flere overraskelser end forventet.
log('\n  Halen — outsiderens sandsynlighed (1 eller 2, den laveste) mod det, der skete:');
log('  outsider-p     kampe   outsider vandt: forventet  faktisk    X: forventet  faktisk');
for (const [a, b] of [[0, 0.01], [0.01, 0.03], [0.03, 0.1], [0.1, 0.25], [0.25, 0.5]]) {
  const d = R.obs.map((o) => {
    const p = sandsynligheder(o, { drawBase: R.base, drawDecay: DECAY_LAAS });
    const hjemmeFav = p[OUTCOME.HOME] >= p[OUTCOME.AWAY];
    return { pU: hjemmeFav ? p[OUTCOME.AWAY] : p[OUTCOME.HOME], pX: p[OUTCOME.DRAW], vandt: o.udfald === (hjemmeFav ? OUTCOME.AWAY : OUTCOME.HOME), x: o.udfald === OUTCOME.DRAW };
  }).filter((r) => r.pU >= a && r.pU < b);
  const eu = d.reduce((x, r) => x + r.pU, 0);
  const ex = d.reduce((x, r) => x + r.pX, 0);
  log(`  ${pct(a, 0).padStart(4)}-${pct(b, 0).padEnd(5)}  ${String(d.length).padStart(6)}   ${tal(eu, 1).padStart(22)}  ${String(d.filter((r) => r.vandt).length).padStart(7)}   ${tal(ex, 1).padStart(13)}  ${String(d.filter((r) => r.x).length).padStart(7)}`);
}

// --- 5. Værtsfordelen ----------------------------------------------------------
log('');
linje();
log('5. VÆRTSFORDELEN — målt separat; spillets HFA er 0 (neutral bane, planen B5)');
linje();
const kampe = R.kampe;
const drawModel = { drawBase: R.base, drawDecay: DECAY_LAAS };
const vProfil = trin(0, 150, 5).map((vaert) => {
  const s = score(maaltePaa(koerElo(kampe, { ...R.elo, vaert }).obs), drawModel);
  return { vaert, nll: s.logLoss * n };
});
const vMin = Math.min(...vProfil.map((v) => v.nll));
const vBedst = vProfil.find((v) => v.nll === vMin);
const vInden = vProfil.filter((v) => v.nll <= vMin + 1.92).map((v) => v.vaert);
log('  vært (Elo)   ΔNLL');
for (const v of vProfil.filter((x) => x.vaert % 25 === 0 || x.vaert === vBedst.vaert)) log(`  ${String(v.vaert).padStart(9)}   ${tal(v.nll - vMin, 2).padStart(5)}${v.vaert === vBedst.vaert ? '   ← bedste (fint gitter)' : ''}`);
const vaertKampe = R.obs.filter((o) => o.hfa !== 0).length;
log(`  Bedste værtsfordel: ${vBedst.vaert} Elo-point (fint gitter, trin 5); 95 %-interval ${vInden[0]}-${vInden.at(-1)}; ${vaertKampe} kampe med en vært.`);
log(`  Valgt i gitteret (trin 25): ${R.elo.vaert}. Det lægges i Tysklands start-Elo (eneste vært 2027); intervallet rummer 0, så tallet er svagt bestemt.`);
log(`  Værter pr. turnering: ${Object.entries(VAERTER).map(([t, v]) => `${t} ${v.join('/')}`).join(', ')}`);

// --- 6. Profilerne side om side ---------------------------------------------
log('');
linje();
log('6. HÅNDBOLDPROFILEN MOD FODBOLDENS TAL — samme kampe, samme metode');
linje();
const varianter = [
  ['håndbold (valgt)', R.elo.k, R.base, DECAY_LAAS],
  ['fodboldens K', ELO.K, R.base, DECAY_LAAS],
  ['fodboldens uafgjort', R.elo.k, ELO.DRAW_BASE, ELO.DRAW_DECAY],
  ['fodbold (K, base, decay)', ELO.K, ELO.DRAW_BASE, ELO.DRAW_DECAY],
];
log('  variant                     K     base    decay   log-loss   Brier');
for (const [navn, k, b, d] of varianter) {
  const s = score(maaltePaa(koerElo(kampe, { ...R.elo, k }).obs), { drawBase: b, drawDecay: d });
  log(`  ${navn.padEnd(26)}${String(k).padStart(4)}   ${tal(b)}   ${tal(d, 2)}    ${tal(s.logLoss, 4)}    ${tal(s.brier, 4)}`);
}
// En model uden Elo: samme uafgjort-rate i alle kampe, resten delt ligeligt.
const flad = R.obs.reduce((a, o) => a - Math.log(o.udfald === OUTCOME.DRAW ? alle.andel : (1 - alle.andel) / 2), 0) / n;
log(`  ${'uden Elo (flad rate)'.padEnd(26)}   —   ${tal(alle.andel)}      —    ${tal(flad, 4)}`);

// --- 7. Startstyrkerne ---------------------------------------------------------
log('');
linje();
log('7. STARTSTYRKER 2027 — Elo efter alle 677 kampe, med de valgte parametre');
linje();
const hold = holdStartElo(HISTORIK, HAANDBOLD_VM2027_HOLD, R.elo).sort((a, b) => b.elo - a.elo);
log('   #  kode  hold              elo   kampe  sidst     note');
hold.forEach((h, i) => {
  const note = !h.harHistorik ? `ingen historik → nyStart ${R.elo.nyStart}` : h.vaert ? `inkl. værtsfordel +${h.vaert}` : '';
  log(`  ${String(i + 1).padStart(2)}  ${h.kode}   ${h.navn.padEnd(16)}${String(h.elo).padStart(5)}  ${String(h.kampe).padStart(5)}  ${h.sidst.padEnd(8)}  ${note}`);
});

// --- 7b. Det fælles koreanske hold ------------------------------------------
// ELO_SAMME er tom med vilje (scripts/lib/haandboldMaaling.mjs). Her er
// målingen bag: samme parametre, med og uden COR → KOR.
log('');
log('  7b. COR (det fælles koreanske hold, VM 2019) som eget hold eller som KOR?');
{
  const uden = maaltePaa(koerElo(kronologisk(HISTORIK, new Map()), R.elo).obs);
  const med = maaltePaa(koerElo(kronologisk(HISTORIK, new Map([['COR', 'KOR']])), R.elo).obs);
  const lu = score(uden, drawModel).logLoss * n;
  const lm = score(med, drawModel).logLoss * n;
  const ru = koerElo(kronologisk(HISTORIK, new Map()), R.elo).ratings;
  const rm = koerElo(kronologisk(HISTORIK, new Map([['COR', 'KOR']])), R.elo).ratings;
  const flyt = HAANDBOLD_VM2027_HOLD.filter((t) => ru.has(t.hbKode))
    .map((t) => ({ kode: t.hbKode, d: Math.round(rm.get(t.hbKode)) - Math.round(ru.get(t.hbKode)) }))
    .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))[0];
  log(`      eget hold: NLL ${tal(lu, 2)}   kædet til KOR: NLL ${tal(lm, 2)}   (forskel ${tal(lm - lu, 2)}; positiv = kædningen er dårligere)`);
  log(`      største flytning af en 2027-rating ved kædning: ${flyt.kode} ${flyt.d > 0 ? '+' : ''}${flyt.d}.`);
}

// --- 8. Oddsene på de 48 kampe ---------------------------------------------
// Prissat med SAMME kode som seedet (buildMatches i src/lib/superligaSeed.js,
// kaldt af scripts/lib/seedKampe.mjs) og håndboldprofilen fra registret — ikke
// med tallene ovenfor. Er profilen ikke committet endnu, siger scriptet det.
log('');
linje();
log('8. ODDS PÅ DE 48 KAMPE I DEN INDLEDENDE RUNDE (buildMatches + SPORT_PROFILER.haandbold)');
linje();
const profil = SPORT_PROFILER.haandbold;
let oddsUd = null;
if (!profil) {
  log('  Håndboldprofilen findes ikke i SPORT_PROFILER endnu — ingen odds.');
} else {
  const holdMedElo = HAANDBOLD_VM2027_HOLD;
  const kampe48 = buildMatches(PROGRAM.fixtures, holdMedElo, sportProfil({ sport: 'haandbold' }));
  const skaev = (m) => Math.min(m.odds['1'], m.odds['2']);
  const top5 = [...kampe48].sort((a, b) => skaev(a) - skaev(b)).slice(0, 5);
  log('  De fem skæveste (laveste favorit-odds):');
  for (const m of top5) log(`    ${m.home.padEnd(15)} – ${m.away.padEnd(15)} ${String(m.eloHome).padStart(5)}-${String(m.eloAway).padEnd(5)}  1 ${tal(m.odds['1'], 2).padStart(6)}  X ${tal(m.odds.X, 2).padStart(6)}  2 ${tal(m.odds['2'], 2).padStart(6)}`);
  const xs = kampe48.map((m) => m.odds.X).sort((a, b) => a - b);
  const over10 = xs.filter((x) => x > 10).length;
  const median = (xs[23] + xs[24]) / 2;
  log(`\n  X-odds: laveste ${tal(xs[0], 2)}, median ${tal(median, 2)}, højeste ${tal(xs.at(-1), 2)}; ${over10} af 48 over 10.`);
  log('  Fordeling:  ≤ 8   8-10   10-12   12-15   15-20   > 20');
  const spand = [[0, 8], [8, 10], [10, 12], [12, 15], [15, 20], [20, Infinity]];
  log(`             ${spand.map(([a, b]) => String(xs.filter((x) => x > a && x <= b).length).padStart(a === 0 ? 3 : 6)).join(' ')}`);
  const minFav = Math.min(...kampe48.map(skaev));
  const gulvBinder = kampe48.flatMap((m) => Object.values(m.odds)).filter((o) => o === profil.odds.min).length;
  log(`  Laveste odds af alle: ${tal(minFav, 2)} — gulvet ${profil.odds.min} binder i ${gulvBinder} udfald (fodboldens gulv ${ODDS.MIN} ville ${minFav < ODDS.MIN ? 'BINDE' : 'ikke binde'}).`);

  // LANGSKUDDENE: odds har intet loft (ODDS i superligaScoring.js), og point
  // følger odds. Fodboldens højeste odds er 24,39 (Premier League).
  const udfald = kampe48.flatMap((m) => ['1', 'X', '2'].map((u) => ({ m, u, o: m.odds[u] })));
  const lange = udfald.filter((x) => x.o > 24.39);
  const forventLange = lange.reduce((a, x) => a + 1 / x.o, 0);
  const hoejest = [...udfald].sort((a, b) => b.o - a.o)[0];
  log(`\n  Langskud: ${lange.length} udfald har odds over fodboldens højeste (24,39); ${udfald.filter((x) => x.o > 100).length} over 100.`);
  log(`  Højeste: ${hoejest.m.home}–${hoejest.m.away} «${hoejest.u}» ${tal(hoejest.o, 2)} → et ramt tip giver ${tal(Math.round(hoejest.o * 10) / 10, 1)} point, en Chance på 8 giver ${Math.round(8 * (hoejest.o - 1))}.`);
  log(`  Forventet antal af de ${lange.length} langskud, der går ind i den indledende runde: ${tal(forventLange, 2)}.`);

  // Tæt knockout: X for de hold, der realistisk mødes (top-8 indbyrdes).
  const top8 = hold.slice(0, 8);
  const par = [];
  for (let i = 0; i < top8.length; i += 1) for (let j = i + 1; j < top8.length; j += 1) {
    const p = sandsynligheder({ eloHjemme: top8[i].elo, eloUde: top8[j].elo, hfa: 0 }, { drawBase: profil.elo.DRAW_BASE, drawDecay: profil.elo.DRAW_DECAY });
    par.push({ a: top8[i].navn, b: top8[j].navn, x: Math.round(100 / p.X) / 100 });
  }
  const parX = par.map((p) => p.x).sort((a, b) => a - b);
  log(`\n  Knockout mellem to af top-8 (${par.length} par): X-odds ${tal(parX[0], 2)}-${tal(parX.at(-1), 2)}, median ${tal(parX[Math.floor(parX.length / 2)], 2)}; over 10: ${parX.filter((x) => x > 10).length}.`);
  const parSorteret = [...par].sort((a, b) => a.x - b.x);
  log(`  Alle 28: ${parSorteret.map((q) => `${q.a}–${q.b} ${tal(q.x, 2)}`).join(' · ')}`);
  log(`  Lige hold: X ${tal(1 / profil.elo.DRAW_BASE, 2)}. Grænsen X = 10 nås ved skew ${tal(Math.log(profil.elo.DRAW_BASE * 10) / (2 * profil.elo.DRAW_DECAY), 2)}.`);

  // Historiske knockout-kampe prissat, som modellen så dem FØR kampen.
  const histKo = R.obs.filter(erKnockout).map((o) => Math.round(100 / sandsynligheder(o, { ...drawModel, medVaert: false }).X) / 100).sort((a, b) => a - b);
  log(`  De ${histKo.length} målte knockout-kampe (VM 2021-EM 2026), som modellen så dem: X-odds median ${tal(histKo[Math.floor(histKo.length / 2)], 2)}, over 10: ${histKo.filter((x) => x > 10).length}.`);

  oddsUd = {
    top5: top5.map((m) => ({ home: m.home, away: m.away, eloHome: m.eloHome, eloAway: m.eloAway, odds: m.odds })),
    xOdds: { min: xs[0], median, max: xs.at(-1), over10 },
    knockoutTop8: { min: parX[0], median: parX[Math.floor(parX.length / 2)], max: parX.at(-1), over10: parX.filter((x) => x > 10).length },
    historiskKnockout: { n: histKo.length, median: histKo[Math.floor(histKo.length / 2)], over10: histKo.filter((x) => x > 10).length },
    laveste: minFav,
    langskud: { over2439: lange.length, over100: udfald.filter((x) => x.o > 100).length, hoejest: { home: hoejest.m.home, away: hoejest.m.away, udfald: hoejest.u, odds: hoejest.o }, forventetInd: forventLange },
  };
}

if (JSON_UD) {
  console.log(JSON.stringify({
    valgt: { ...R.elo, base: R.base, decay: R.decay }, kant, fri: { base: R.fri.base, decay: R.fri.decay, interval: R.fri.decayInterval },
    kInterval: [kInden[0], kInden.at(-1)], baseInterval: baseIv, vaert: { bedst: vBedst.vaert, interval: [vInden[0], vInden.at(-1)] },
    uafgjort: { alle, knockout: ko, fodbold: FODBOLD_UAFGJORT },
    hold: hold.map(({ kode, navn, elo, kampe: k, sidst, harHistorik }) => ({ kode, navn, elo, kampe: k, sidst, harHistorik })),
    odds: oddsUd,
  }, null, 1));
}
