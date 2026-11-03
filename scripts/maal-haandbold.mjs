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
// BRUG:  node scripts/maal-haandbold.mjs           (≈ 1 min; tre gennemløb af gitteret)
//        node scripts/maal-haandbold.mjs --json    (kun resultatet, maskinlæsbart)
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs';
import {
  maal, vedKant, score, koerElo, maaltePaa, kronologisk, skew, fitBase, baseInterval, uafgjortAndel, erKnockout,
  holdStartElo, valgteParametre, trin, GITTER, DECAY_LAAS, OPVARMNING, VAERTER, sandsynligheder,
  erfaringVedStart, flestKampePrTurnering, median, VAERT_2027,
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
const flest = flestKampePrTurnering(HISTORIK);
log(`  Flest kampe for ét hold i én turnering: ${Object.entries(flest).map(([t, v]) => `${t} ${v}`).join(', ')}.`);

// 1b. Hvad opvarmningen giver: kampe bag sig, da målingen begynder.
const erf = erfaringVedStart(HISTORIK);
const tynd = erf.filter((e) => e.kampe < 7);
log(`\n  1b. Opvarmningen (${OPVARMNING.join(' + ')}): ${erf.length} hold spiller i de målte turneringer OG var med i opvarmningen.`);
log(`      ${erf.length - tynd.length} har mindst 7 kampe bag sig; ${tynd.length} har færre: ${tynd.map((e) => `${e.kode} ${e.kampe}`).join(', ')}.`);

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
log(kant.length ? `  ⚠️  PÅ GITTERETS KANT: ${kant.join(', ')} — udvid gitteret, før tallet bruges.` : '  Ingen parameter ligger på gitterets kant — bortset fra de naturlige grænser (carry 1, vært 0), se næste linje.');
{
  // carry = 1 er gitterets øverste værdi. Er 1 et ægte minimum, eller bare loftet?
  const nllC = (carry) => score(maaltePaa(koerElo(R.kampe, { ...R.elo, carry }).obs), { drawBase: R.base, drawDecay: DECAY_LAAS }).logLoss * R.obs.length;
  if (R.elo.carry === 1) log(`  carry = 1 er gitterets øverste værdi; carry 1,05 er ΔNLL ${tal(nllC(1.05) - nllC(1), 2)} dårligere, så 1 er et ægte minimum.`);
}
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
log(`3. K — bedste log-loss for hver K (start-parametrene optimeret, base fast på ${R.base}), 95 %-interval`);
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
{
  // Samme, men med base OGSÅ genfittet for fodboldens K (decay låst): er
  // tabet et udslag af, at base er fittet på K 120?
  const r20 = R.resultater.filter((x) => x.k === ELO.K)[0];
  const obs20 = maaltePaa(koerElo(R.kampe, r20).obs);
  const b20 = fitBase(obs20, DECAY_LAAS).base;
  const ll20 = score(obs20, { drawBase: b20, drawDecay: DECAY_LAAS }).logLoss * n;
  log(`  Med base genfittet for K ${ELO.K} (base ${tal(b20)}): ΔNLL ${tal(ll20 - bedsteNll, 1)} — stadig langt over 1,92.`);
}

// 3b. K pr. turneringstype. Ratingerne regnes over ALLE kampe; kun scoringen
// deles op. Base genfittes pr. delmængde; startparametrene står fast.
log('\n  3b. K målt på VM og EM hver for sig (startparametre som valgt, base genfittet pr. delmængde):');
log(`      delmængde   kampe   bedste K   95 %-interval   bedste base   K ${R.elo.k} koster`);
const kTyper = {};
for (const [navn, filt] of [['kun VM', (o) => o.turnering.startsWith('vm')], ['kun EM', (o) => o.turnering.startsWith('em')]]) {
  const prof = GITTER.k.map((k) => {
    const obs = maaltePaa(koerElo(R.kampe, { ...R.elo, k }).obs).filter(filt);
    const b = fitBase(obs, DECAY_LAAS);
    const ll = score(obs, { drawBase: b.base, drawDecay: DECAY_LAAS }).logLoss * obs.length;
    return { k, l: ll, base: b.base, n: obs.length };
  });
  const min = Math.min(...prof.map((x) => x.l));
  const bedst = prof.find((x) => x.l === min);
  const inden = prof.filter((x) => x.l - min <= 1.92).map((x) => x.k);
  const valgt = prof.find((x) => x.k === R.elo.k);
  kTyper[navn] = { kampe: bedst.n, k: bedst.k, interval: [inden[0], inden.at(-1)], base: bedst.base, valgtKoster: valgt.l - min };
  log(`      ${navn.padEnd(10)}${String(bedst.n).padStart(7)}${String(bedst.k).padStart(11)}   ${`${inden[0]}-${inden.at(-1)}${inden.at(-1) === GITTER.k.at(-1) ? '+' : ''}`.padStart(13)}   ${tal(bedst.base).padStart(11)}   ${tal(valgt.l - min, 2).padStart(8)}`);
}
log('      (3-vejs NLL med decay låst; base genfittet for hver K. «+»: intervallet når gitterets top. VM 2027 er et VM.)');

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
const obsK20 = maaltePaa(koerElo(R.kampe, { ...R.elo, k: ELO.K }).obs);
const forvFodK20 = obsK20.reduce((a, o) => a + model(skew(o), ELO.DRAW_BASE, ELO.DRAW_DECAY), 0);
log(`\n  Forventede uafgjorte: håndbold ${tal(forv, 1)} — faktisk ${fak}.`);
log(`  Fodboldens uafgjort-model (base ${ELO.DRAW_BASE}, decay ${ELO.DRAW_DECAY}) på håndboldens ratings (K ${R.elo.k}): ${tal(forvFod, 1)}; på ratings med fodboldens K ${ELO.K}: ${tal(forvFodK20, 1)}.`);
const koObs = R.obs.filter(erKnockout);
const koForv = koObs.reduce((a, o) => a + model(skew(o), R.base, DECAY_LAAS), 0);
log(`  Heraf knockout: ${koObs.filter((o) => o.udfald === OUTCOME.DRAW).length} af ${koObs.length} faktisk, ${tal(koForv, 1)} forventet.`);

// HALEN: passer modellen også dér, hvor den er MEGET sikker? K 120 giver
// skarpe ratings og dermed odds langt over fodboldens højeste (24,39). Er de
// for skarpe, viser det sig her som flere overraskelser end forventet.
log('\n  Halen — outsiderens sandsynlighed (1 eller 2, den laveste) mod det, der skete:');
log('  outsider-p     kampe   outsider vandt: forventet  faktisk    X: forventet  faktisk');
// [0; 0,03) står både delt og samlet: summen af to AFRUNDEDE spande er ikke
// den samlede forventning (0,1 + 0,8 ≠ 0,81).
for (const [a, b] of [[0, 0.01], [0.01, 0.03], [0, 0.03], [0.03, 0.1], [0.1, 0.25], [0.25, 0.5]]) {
  const d = R.obs.map((o) => {
    const p = sandsynligheder(o, { drawBase: R.base, drawDecay: DECAY_LAAS });
    const hjemmeFav = p[OUTCOME.HOME] >= p[OUTCOME.AWAY];
    return { pU: hjemmeFav ? p[OUTCOME.AWAY] : p[OUTCOME.HOME], pX: p[OUTCOME.DRAW], vandt: o.udfald === (hjemmeFav ? OUTCOME.AWAY : OUTCOME.HOME), x: o.udfald === OUTCOME.DRAW };
  }).filter((r) => r.pU >= a && r.pU < b);
  const eu = d.reduce((x, r) => x + r.pU, 0);
  const ex = d.reduce((x, r) => x + r.pX, 0);
  log(`  ${pct(a, 0).padStart(4)}-${pct(b, 0).padEnd(5)}  ${String(d.length).padStart(6)}   ${tal(eu, 2).padStart(22)}  ${String(d.filter((r) => r.vandt).length).padStart(7)}   ${tal(ex, 1).padStart(13)}  ${String(d.filter((r) => r.x).length).padStart(7)}${a === 0 && b === 0.03 ? '   (de to ovenfor samlet)' : ''}`);
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
const vNul = vProfil.find((v) => v.vaert === 0).nll - vProfil.find((v) => v.vaert === R.elo.vaert).nll;
log(`  Valgt i gitteret (trin 25): ${R.elo.vaert}. Vært 0 koster kun ΔNLL ${tal(vNul, 2)} mod ${R.elo.vaert} (grænsen er 1,92): data kan IKKE skelne de to.`);
log(`  Til historikken bruges punktestimatet (som for K). At lægge +${R.elo.vaert} oven i Tysklands 2027-rating er et VALG (planen B5) — priserne med og uden står i afsnit 8b.`);
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

// 7a. Usikkerheden på nyStart — den rating, Tyrkiet får (de andre parametre fast).
{
  const nyProfil = trin(900, 1500, 25).map((nyStart) => ({
    nyStart, nll: score(maaltePaa(koerElo(kampe, { ...R.elo, nyStart }).obs), drawModel).logLoss * n,
  }));
  const min = Math.min(...nyProfil.map((x) => x.nll));
  const inden = nyProfil.filter((x) => x.nll - min <= 1.92).map((x) => x.nyStart);
  const nyeHold = new Set();
  const set = new Set();
  for (const m of R.kampe) {
    for (const h of [m.hjemme, m.ude]) {
      if (!set.has(h) && m.turnering !== R.kampe[0].turnering) nyeHold.add(h);
      set.add(h);
    }
  }
  log('');
  log(`  7a. nyStart (hold uden historik — i 2027 kun Tyrkiet): bedste ${nyProfil.find((x) => x.nll === min).nyStart} på trin 25, 95 %-interval ${inden[0]}-${inden.at(-1)} (andre parametre fast).`);
  log(`      Grundlaget er de ${nyeHold.size} hold, der dukker op første gang efter ${R.kampe[0].turnering}.`);
}

// 7c. EM 2026-FINALEN mangler (transkluderet fra en anden side, ikke hentet —
// kilder[].afviste). Finalisterne er semifinalevinderne i historikken; selve
// udfaldet står IKKE i data. Elo bruger kun udfaldet efter 60 min (1/½/0),
// ikke scoren, så der er præcis tre muligheder — her er hver af dem.
const finaleScenarier = (() => {
  const semi = HISTORIK.kampe.filter((m) => m.turnering === 'em2026' && /Semi-?finals$/.test(m.sektion || ''));
  const vinder = (m) => (m.slut.h > m.slut.u ? m.hjemme : m.ude);
  if (semi.length !== 2) { log(`\n  7c. EM 2026-finalen: ${semi.length} semifinaler i historikken — kan ikke udlede finalisterne.`); return null; }
  const [a, b] = semi.map(vinder);
  const sidste = HISTORIK.kampe.filter((m) => m.turnering === 'em2026').map((m) => m.dato).sort().at(-1);
  log('');
  log(`  7c. EM 2026-finalen ${a}–${b} mangler i historikken. Udfaldet står ikke i data; Elo bruger kun 1/X/2 efter 60 min, så:`);
  const ud = [];
  for (const [navn, h, u] of [[`${a} vinder`, 1, 0], ['uafgjort efter 60 min', 1, 1], [`${b} vinder`, 0, 1]]) {
    const ekstra = { ...HISTORIK, kampe: [...HISTORIK.kampe, { turnering: 'em2026', dato: sidste, tid: '23:59', sektion: 'Knockout stage › Final', hjemme: a, ude: b, efter60: { h, u }, slut: { h, u }, afgjort: null }] };
    const r = holdStartElo(ekstra, HAANDBOLD_VM2027_HOLD, R.elo);
    const ra = r.find((x) => x.kode === a);
    const rb = r.find((x) => x.kode === b);
    ud.push({ navn, [a]: ra.elo, [b]: rb.elo, hold: r });
  }
  const nu = holdStartElo(HISTORIK, HAANDBOLD_VM2027_HOLD, R.elo);
  const nuA = nu.find((x) => x.kode === a).elo;
  const nuB = nu.find((x) => x.kode === b).elo;
  log(`      uden finalen (holdfilen):   ${a} ${nuA}   ${b} ${nuB}`);
  for (const sc of ud) log(`      ${sc.navn.padEnd(27)} ${a} ${sc[a]} (${sc[a] - nuA >= 0 ? '+' : ''}${sc[a] - nuA})   ${b} ${sc[b]} (${sc[b] - nuB >= 0 ? '+' : ''}${sc[b] - nuB})`);
  log('      (start-Elo som holdfilen skriver den, inkl. en eventuel værtsfordel; priserne står i afsnit 8b)');
  return { a, b, nuA, nuB, ud };
})();

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
  const xMedian = median(xs);
  log(`\n  X-odds: laveste ${tal(xs[0], 2)}, median ${tal(xMedian, 2)}, højeste ${tal(xs.at(-1), 2)}; ${over10} af 48 over 10.`);
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
  log(`  Forventet antal af de ${lange.length} langskud, der går ind i den indledende runde: ${tal(forventLange, 3)}.`);
  // Et loft på Chancen ved 25 (fodboldens højeste nogensinde, afrundet): hvad udelukker det?
  const over25 = udfald.filter((x) => x.o > 25);
  log(`  Et loft ved 25 udelukker ${over25.length} udfald (${lange.length - over25.length} ligger mellem 24,39 og 25: ${lange.filter((x) => x.o <= 25).map((x) => `${x.m.home}–${x.m.away} «${x.u}» ${tal(x.o, 2)}`).join(', ') || '—'}); højeste X er ${tal(xs.at(-1), 2)}.`);

  // Tæt knockout: X for de hold, der realistisk mødes (top-8 indbyrdes).
  const top8 = hold.slice(0, 8);
  const par = [];
  for (let i = 0; i < top8.length; i += 1) for (let j = i + 1; j < top8.length; j += 1) {
    const p = sandsynligheder({ eloHjemme: top8[i].elo, eloUde: top8[j].elo, hfa: 0 }, { drawBase: profil.elo.DRAW_BASE, drawDecay: profil.elo.DRAW_DECAY });
    par.push({ a: top8[i].navn, b: top8[j].navn, x: Math.round(100 / p.X) / 100 });
  }
  const parX = par.map((p) => p.x).sort((a, b) => a - b);
  log(`\n  Knockout mellem to af top-8 (${par.length} par): X-odds ${tal(parX[0], 2)}-${tal(parX.at(-1), 2)}, median ${tal(median(parX), 2)}; over 10: ${parX.filter((x) => x > 10).length}.`);
  const parSorteret = [...par].sort((a, b) => a.x - b.x);
  log(`  Alle 28: ${parSorteret.map((q) => `${q.a}–${q.b} ${tal(q.x, 2)}`).join(' · ')}`);
  const skew10 = Math.log(profil.elo.DRAW_BASE * 10) / (2 * profil.elo.DRAW_DECAY);
  // skew = |2·E − 1| med E = 1/(1 + 10^(−d/400)) → d = 400·log10((1 + skew)/(1 − skew)).
  log(`  Lige hold: X ${tal(1 / profil.elo.DRAW_BASE, 2)}. Grænsen X = 10 nås ved skew ${tal(skew10, 2)}, dvs. en Elo-forskel på ${tal(400 * Math.log10((1 + skew10) / (1 - skew10)), 1)}.`);

  // Historiske knockout-kampe prissat, som modellen så dem FØR kampen.
  const histKo = R.obs.filter(erKnockout).map((o) => Math.round(100 / sandsynligheder(o, { ...drawModel, medVaert: false }).X) / 100).sort((a, b) => a - b);
  log(`  De ${histKo.length} målte knockout-kampe (VM 2021-EM 2026), som modellen så dem: X-odds median ${tal(median(histKo), 2)}, over 10: ${histKo.filter((x) => x > 10).length}.`);

  // 8b. FØLSOMHED: de to valg, ejeren skal se priserne for — værtsfordelen
  // (+vært i Tysklands start-Elo, afsnit 5) og den manglende EM-finale (7c).
  // Samme buildMatches og profil; kun holdenes elo byttes.
  const pris = (holdListe, home, away, u) => {
    const m = buildMatches(PROGRAM.fixtures, holdListe, sportProfil({ sport: 'haandbold' })).find((x) => x.home === home && x.away === away);
    return m ? m.odds[u] : null;
  };
  const prisPar = (holdListe, a, b) => {
    const p = sandsynligheder({ eloHjemme: holdListe.find((t) => t.name === a).elo, eloUde: holdListe.find((t) => t.name === b).elo, hfa: 0 }, { drawBase: profil.elo.DRAW_BASE, drawDecay: profil.elo.DRAW_DECAY });
    return Math.round(100 / p.X) / 100;
  };
  const vaertNavne = HAANDBOLD_VM2027_HOLD.filter((t) => VAERT_2027.includes(t.hbKode)).map((t) => t.name);
  const udenVaert = HAANDBOLD_VM2027_HOLD.map((t) => (VAERT_2027.includes(t.hbKode) ? { ...t, elo: t.elo - R.elo.vaert } : t));
  const tjek = [['Uruguay', 'Tyskland', '1'], ['Tyskland', 'Serbien', '2'], ['Angola', 'Danmark', '1'], ['Tyskland', 'Tunesien', '2']];
  log('');
  log(`  8b. Følsomhed — samme kampe med (i) ${vaertNavne.join('/')} UDEN +${R.elo.vaert} som vært, (ii) EM 2026-finalen lagt til:`);
  const kol = [['holdfilen', HAANDBOLD_VM2027_HOLD], [`uden +${R.elo.vaert}`, udenVaert]];
  if (finaleScenarier) {
    for (const sc of finaleScenarier.ud) {
      kol.push([sc.navn, HAANDBOLD_VM2027_HOLD.map((t) => ({ ...t, elo: sc.hold.find((x) => x.kode === t.hbKode).elo }))]);
    }
  }
  log(`      ${'kamp'.padEnd(26)}${kol.map(([k]) => k.padStart(22)).join('')}`);
  const foelsomhed = [];
  for (const [h, a, u] of tjek) {
    const v = kol.map(([, l]) => pris(l, h, a, u));
    foelsomhed.push({ kamp: `${h}–${a}`, udfald: u, odds: Object.fromEntries(kol.map(([k], i) => [k, v[i]])) });
    log(`      ${`${h}–${a} «${u}»`.padEnd(26)}${v.map((x) => (x == null ? '—' : tal(x, 2)).padStart(22)).join('')}`);
  }
  for (const [a, b] of [['Danmark', 'Tyskland'], ['Tyskland', 'Kroatien']]) {
    const v = kol.map(([, l]) => prisPar(l, a, b));
    foelsomhed.push({ kamp: `${a}–${b} (knockout)`, udfald: 'X', odds: Object.fromEntries(kol.map(([k], i) => [k, v[i]])) });
    log(`      ${`${a}–${b} «X» (KO)`.padEnd(26)}${v.map((x) => tal(x, 2).padStart(22)).join('')}`);
  }

  oddsUd = {
    top5: top5.map((m) => ({ home: m.home, away: m.away, eloHome: m.eloHome, eloAway: m.eloAway, odds: m.odds })),
    xOdds: { min: xs[0], median: xMedian, max: xs.at(-1), over10 },
    knockoutTop8: { min: parX[0], median: median(parX), max: parX.at(-1), over10: parX.filter((x) => x > 10).length },
    historiskKnockout: { n: histKo.length, median: median(histKo), over10: histKo.filter((x) => x > 10).length },
    loft25Udelukker: over25.length,
    foelsomhed,
    laveste: minFav,
    langskud: { over2439: lange.length, over100: udfald.filter((x) => x.o > 100).length, hoejest: { home: hoejest.m.home, away: hoejest.m.away, udfald: hoejest.u, odds: hoejest.o }, forventetInd: forventLange },
  };
}

if (JSON_UD) {
  console.log(JSON.stringify({
    valgt: { ...R.elo, base: R.base, decay: R.decay }, kant, fri: { base: R.fri.base, decay: R.fri.decay, interval: R.fri.decayInterval },
    kInterval: [kInden[0], kInden.at(-1)], baseInterval: baseIv, vaert: { bedst: vBedst.vaert, interval: [vInden[0], vInden.at(-1)] },
    uafgjort: { alle, knockout: ko, fodbold: FODBOLD_UAFGJORT },
    kPrType: kTyper, opvarmning: { hold: erf.length, under7: tynd }, flestKampe: flest,
    finale: finaleScenarier && { a: finaleScenarier.a, b: finaleScenarier.b, uden: [finaleScenarier.nuA, finaleScenarier.nuB], scenarier: finaleScenarier.ud.map((sc) => Object.fromEntries(Object.entries(sc).filter(([k]) => k !== 'hold'))) },
    hold: hold.map(({ kode, navn, elo, kampe: k, sidst, harHistorik }) => ({ kode, navn, elo, kampe: k, sidst, harHistorik })),
    odds: oddsUd,
  }, null, 1));
}
