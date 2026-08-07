// ---------------------------------------------------------------------------
// scripts/maal-uafgjort.mjs — måler uafgjort-frekvensen mod styrkeforskel i
// begge ligaer og holder den op mod modellens DRAW_BASE/DRAW_DECAY.
//
// HVORFOR DEN FINDES. `DRAW_BASE` blev oprindeligt valgt, så modellen ramte
// Superligaens GENNEMSNITLIGE uafgjort-rate. Et gennemsnit kan ikke se, om
// kurven har rigtig form: modellen ramte snittet ved at være for høj i de
// jævnbyrdige kampe og for lav i de skæve. Denne måling grupperer efter
// styrkeforskel og fitter mod hver enkelt kamp, så begge dele afsløres.
//
// HENT DATA FØRST (~2 MB, gemmes i /tmp/fodbold-historik):
//
//   mkdir -p /tmp/fodbold-historik && cd /tmp/fodbold-historik
//
//   # Superligaen — sæson-id'er fra
//   #   https://api.superliga.dk/tournaments/46/seasons?<samme query som nedenfor>
//   Q="appName=dk.releaze.livecenter.spdk&access_token=5b6ab6f5eb84c60031bbbd24&env=production&locale=da"
//   for ID in 7677 8559 9524 10392 11488 12725 13958 15429 16387 17703 20962 23624 27018; do
//     curl -s "https://api.superliga.dk/events-v2?$Q&seasonId=$ID" -o season_$ID.json
//   done
//
//   # Premier League — pulselive, samme kilde som program og facit
//   B=https://sdp-prem-prod.premier-league-prod.pulselive.com/api/v2/matches
//   for S in 2016 2017 2018 2019 2020 2021 2022 2023 2024 2025; do
//     cur=""; : > pl_$S.ndjson
//     while :; do
//       u="$B?competition=8&season=$S&_limit=100"; [ -n "$cur" ] && u="$u&_next=$cur"
//       curl -s -H "Origin: https://www.premierleague.com" -H "Referer: https://www.premierleague.com/" "$u" -o p.json
//       node -e "JSON.parse(require('fs').readFileSync('p.json')).data.forEach(m=>console.log(JSON.stringify(m)))" >> pl_$S.ndjson
//       cur=$(node -e "console.log(JSON.parse(require('fs').readFileSync('p.json')).pagination._next||'')")
//       [ -z "$cur" ] && break
//     done
//   done
//
// BRUG: node scripts/maal-uafgjort.mjs
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs';
import { updateElo, actualHomeFromOutcome, outcomeFromScore, ELO } from '../src/lib/superligaScoring.js';

// Kolonnen "nu" SKAL læse den levende konstant. Hardkodede man 0,26 her, ville
// scriptet blive ved med at vise den gamle værdi som "nuværende" efter en
// ændring — og så måler man mod noget, der ikke er i spillet længere.
const NU_BASE = ELO.DRAW_BASE;
const NU_DECAY = ELO.DRAW_DECAY;

// Hvor de hentede sæson-filer ligger. Sæt DATA=/sti, hvis de ligger andetsteds.
const DIR = process.env.DATA || '/tmp/fodbold-historik';
const MEAN = 1500;
const CARRY = 0.75;
const CANON = { Viborg: 'Viborg FF' };

const SL = [7677, 8559, 9524, 10392, 11488, 12725, 13958, 15429, 16387, 17703, 20962, 23624, 27018];
const PL = [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];

const tal = (v) => {
  // null og '' SKAL afvises FØR Number(): begge giver 0, og så bliver en
  // færdigspillet kamp uden resultat til 0-0 — altså en uafgjort ud af
  // ingenting, lagt til præcis det tal DRAW_BASE er fittet mod. Rettelsen mod
  // at TABE kampe må ikke blive til en, der OPFINDER dem.
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function sæsonSL(id) {
  const d = JSON.parse(readFileSync(`${DIR}/season_${id}.json`, 'utf8'));
  return (d.events || [])
    .filter((e) => e.statusType === 'finished')
    .map((e) => ({
      home: CANON[e.homeName] || e.homeName,
      away: CANON[e.awayName] || e.awayName,
      hg: tal(e.score?.home), ag: tal(e.score?.away), t: e.startDate,
    }))
    .filter((m) => m.hg !== null && m.ag !== null)
    .sort((a, b) => a.t.localeCompare(b.t));
}

function sæsonPL(s) {
  return readFileSync(`${DIR}/pl_${s}.ndjson`, 'utf8').trim().split('\n')
    .map((l) => JSON.parse(l))
    .filter((m) => m.period === 'FullTime')
    .map((m) => ({
      home: m.homeTeam?.name, away: m.awayTeam?.name,
      hg: tal(m.homeTeam?.score), ag: tal(m.awayTeam?.score), t: m.kickoff,
    }))
    .filter((m) => m.hg !== null && m.ag !== null && m.home && m.away)
    .sort((a, b) => a.t.localeCompare(b.t));
}

function kør(navn, sæsoner, hent, opvarmning) {
  const elo = new Map();
  const get = (n) => (elo.has(n) ? elo.get(n) : MEAN);
  const obs = [];
  // Pr. sæson, så tallene kan efterprøves uden at hente 2 MB ned igen. Uden
  // dem er "6.143 kampe, 1.493 uafgjorte" bare et tal, nogen har skrevet.
  const pr_sæson = [];
  let n = 0;
  sæsoner.forEach((s, i) => {
    if (i > 0) for (const [k, r] of elo) elo.set(k, MEAN + CARRY * (r - MEAN));
    const før = obs.length;
    let ialt = 0;
    for (const m of hent(s)) {
      const udfald = outcomeFromScore(m.hg, m.ag);
      if (!udfald) continue;
      const eh = get(m.home); const ea = get(m.away);
      n += 1; ialt += 1;
      if (n > opvarmning) {
        const eLevel = 1 / (1 + 10 ** (-(eh - ea) / 400));
        obs.push({ skew: Math.abs(2 * eLevel - 1), uafgjort: udfald === 'X', dElo: Math.abs(eh - ea) });
      }
      const r = updateElo(eh, ea, actualHomeFromOutcome(udfald));
      elo.set(m.home, r.home); elo.set(m.away, r.away);
    }
    const brugt = obs.slice(før);
    pr_sæson.push({ s, ialt, brugt: brugt.length, uafgjort: brugt.filter((o) => o.uafgjort).length });
  });
  return { navn, obs, n, pr_sæson };
}

const model = (skew, base, dec) => base * Math.exp(-dec * skew * 2);

function rapport({ navn, obs, n }) {
  console.log(`\n${'='.repeat(72)}\n${navn} — ${n} kampe, ${obs.length} brugt`);
  console.log(`Uafgjort i alt: ${(100 * obs.filter((o) => o.uafgjort).length / obs.length).toFixed(1)} %   ·   højeste skew ${Math.max(...obs.map((o) => o.skew)).toFixed(2)}   ·   kampe over skew 0,5: ${obs.filter((o) => o.skew > 0.5).length}\n`);

  const sorteret = [...obs].sort((a, b) => a.skew - b.skew);
  const BÅND = 10;
  const pr = Math.floor(sorteret.length / BÅND);
  console.log('  skew-bånd      Δelo   kampe   FAKTISK    ±95 %    nu  forkastet');
  for (let i = 0; i < BÅND; i += 1) {
    const d = sorteret.slice(i * pr, i === BÅND - 1 ? sorteret.length : (i + 1) * pr);
    const p = d.filter((o) => o.uafgjort).length / d.length;
    const se = Math.sqrt(p * (1 - p) / d.length);
    const midt = d.reduce((a, o) => a + o.skew, 0) / d.length;
    const dM = d.reduce((a, o) => a + o.dElo, 0) / d.length;
    console.log(`  ${d[0].skew.toFixed(2)}-${d[d.length - 1].skew.toFixed(2)}   ${Math.round(dM).toString().padStart(4)}   ${String(d.length).padStart(5)}   ${(100 * p).toFixed(1).padStart(6)} %  ±${(100 * 1.96 * se).toFixed(1).padStart(4)}    ${(100 * model(midt, NU_BASE, NU_DECAY)).toFixed(1).padStart(5)} %    ${(100 * model(midt, 0.287, 0.248)).toFixed(1).padStart(5)} %`);
  }

  const nll = (base, dec, d = obs) => {
    let s = 0;
    for (const o of d) {
      const p = Math.min(0.9999, Math.max(0.0001, model(o.skew, base, dec)));
      s -= o.uafgjort ? Math.log(p) : Math.log(1 - p);
    }
    return s;
  };
  let best = null;
  for (let dec = 0; dec <= 1.5; dec += 0.005) {
    for (let base = 0.20; base <= 0.40; base += 0.002) {
      const l = nll(base, dec);
      if (!best || l < best.l) best = { l, dec, base };
    }
  }
  const grænse = best.l + 1.92;
  let lav = null; let hoej = null;
  for (let dec = 0; dec <= 1.5; dec += 0.005) {
    let b = null;
    for (let base = 0.20; base <= 0.40; base += 0.002) { const l = nll(base, dec); if (b === null || l < b) b = l; }
    if (b <= grænse) { if (lav === null) lav = dec; hoej = dec; }
  }
  console.log(`\n  Bedste fit: drawBase ${best.base.toFixed(3)}  drawDecay ${best.dec.toFixed(3)}`);
  console.log(`  95 %-interval for decay: ${lav.toFixed(2)} – ${hoej.toFixed(2)}   ·   0,55 inden for? ${0.55 >= lav && 0.55 <= hoej ? 'JA' : 'NEJ'}   ·   0,25? ${0.248 >= lav && 0.248 <= hoej ? 'JA' : 'NEJ'}`);

  const faktisk = obs.filter((o) => o.uafgjort).length;
  console.log('\n  Forventede uafgjorte mod faktiske:');
  for (const [nv, b, d] of [[`nu (${NU_BASE} / ${NU_DECAY})`, NU_BASE, NU_DECAY], ['forkastet (0,287/0,248)', 0.287, 0.248], ['egen bedste', best.base, best.dec]]) {
    const f = obs.reduce((a, o) => a + model(o.skew, b, d), 0);
    console.log(`    ${nv.padEnd(20)} ${f.toFixed(0).padStart(4)} mod ${faktisk}   (${f > faktisk ? '+' : ''}${(100 * (f - faktisk) / faktisk).toFixed(0)} %)`);
  }
  return { obs, best };
}

const kSL = kør('SUPERLIGAEN (13 sæsoner)', SL, sæsonSL, 200);
const kPL = kør('PREMIER LEAGUE (10 sæsoner)', PL, sæsonPL, 200);
const rSL = rapport(kSL);
const rPL = rapport(kPL);

// GRUNDLAGET, sæson for sæson. Skrives af til docs/data/uafgjort-grundlag.md,
// så 6.143 og 1.493 kan efterprøves uden at hente rådata ned igen.
console.log(`\n${'='.repeat(72)}\nGRUNDLAG PR. SÆSON (opvarmning = de første 200 kampe, som Elo skal bruge)\n`);
console.log('  liga         sæson   færdigspillet   brugt   uafgjort   rate');
for (const [liga, k] of [['Superligaen', kSL], ['Premier League', kPL]]) {
  for (const r of k.pr_sæson) {
    const rate = r.brugt ? `${(100 * r.uafgjort / r.brugt).toFixed(1)} %` : '—';
    console.log(`  ${liga.padEnd(15)}${String(r.s).padStart(6)}${String(r.ialt).padStart(14)}${String(r.brugt).padStart(9)}${String(r.uafgjort).padStart(10)}${rate.padStart(9)}`);
  }
  const b = k.pr_sæson.reduce((a, r) => a + r.brugt, 0);
  const u = k.pr_sæson.reduce((a, r) => a + r.uafgjort, 0);
  console.log(`  ${'I ALT'.padEnd(15)}${''.padStart(6)}${String(k.n).padStart(14)}${String(b).padStart(9)}${String(u).padStart(10)}${`${(100 * u / b).toFixed(1)} %`.padStart(9)}\n`);
}

// De skæve kampe — dem markedet og modellen var uenige om.
console.log(`\n${'='.repeat(72)}\nDE SKÆVE KAMPE (skew > 0,50) — begge ligaer samlet\n`);
const skæve = [...rSL.obs, ...rPL.obs].filter((o) => o.skew > 0.5);
for (const [fra, til] of [[0.5, 0.6], [0.6, 0.7], [0.7, 1.0]]) {
  const d = skæve.filter((o) => o.skew >= fra && o.skew < til);
  if (!d.length) continue;
  const p = d.filter((o) => o.uafgjort).length / d.length;
  const se = Math.sqrt(p * (1 - p) / d.length);
  const midt = d.reduce((a, o) => a + o.skew, 0) / d.length;
  console.log(`  skew ${fra.toFixed(1)}-${til.toFixed(1)}: ${String(d.length).padStart(4)} kampe   faktisk ${(100 * p).toFixed(1).padStart(5)} % ±${(100 * 1.96 * se).toFixed(1)}   ·  forkastet ${(100 * model(midt, 0.287, 0.248)).toFixed(1)} %   ·  nu ${(100 * model(midt, NU_BASE, NU_DECAY)).toFixed(1)} %`);
}

// Samlet fit på begge ligaer.
const alle = [...rSL.obs, ...rPL.obs];
const nll = (base, dec) => {
  let s = 0;
  for (const o of alle) {
    const p = Math.min(0.9999, Math.max(0.0001, model(o.skew, base, dec)));
    s -= o.uafgjort ? Math.log(p) : Math.log(1 - p);
  }
  return s;
};
let best = null;
for (let dec = 0; dec <= 1.5; dec += 0.005) {
  for (let base = 0.20; base <= 0.40; base += 0.002) { const l = nll(base, dec); if (!best || l < best.l) best = { l, dec, base }; }
}
let lav = null; let hoej = null;
for (let dec = 0; dec <= 1.5; dec += 0.005) {
  let b = null;
  for (let base = 0.20; base <= 0.40; base += 0.002) { const l = nll(base, dec); if (b === null || l < b) b = l; }
  if (b <= best.l + 1.92) { if (lav === null) lav = dec; hoej = dec; }
}
console.log(`\n  SAMLET (${alle.length} kampe): drawBase ${best.base.toFixed(3)}  drawDecay ${best.dec.toFixed(3)}   95 %: ${lav.toFixed(2)} – ${hoej.toFixed(2)}`);

// Er det DECAY eller BASE, der er galt? Fit kun base, med decay låst.
console.log('\n  Hvis vi kun retter ÉN parameter:');
for (const dec of [0.55, 0.49, 0.45]) {
  let b = null;
  for (let base = 0.20; base <= 0.40; base += 0.001) {
    const l = nll(base, dec); if (!b || l < b.l) b = { l, base };
  }
  const forv = alle.reduce((a, o) => a + model(o.skew, b.base, dec), 0);
  const fak = alle.filter((o) => o.uafgjort).length;
  console.log(`    decay låst på ${dec.toFixed(2)} → bedste base ${b.base.toFixed(3)}   forventet ${forv.toFixed(0)} mod ${fak}  (${forv > fak ? '+' : ''}${(100 * (forv - fak) / fak).toFixed(1)} %)   nll ${b.l.toFixed(1)}`);
}
console.log(`    fri fit (base+decay)                      nll ${best.l.toFixed(1)}`);
const nuNll = nll(NU_BASE, NU_DECAY);
console.log(`    NUVÆRENDE (fra ELO)                       nll ${nuNll.toFixed(1)}`);

// Hvor godt passer hver model i de skæve kampe, hvor det betyder mest?
// Antallet TÆLLES. Det stod hardkodet som "429 kampe" og ville lyve stille,
// første gang der kom en sæson mere med.
const sk = alle.filter((o) => o.skew > 0.5);
console.log(`\n  Kontrol i de skæve kampe (skew > 0,5, ${sk.length} kampe):`);
const fakSk = sk.filter((o) => o.uafgjort).length;
for (const [nv, b, d] of [[`nu (${NU_BASE} / ${NU_DECAY})`, NU_BASE, NU_DECAY], ['fri fit', best.base, best.dec], ['forkastet forslag (0,287/0,248)', 0.287, 0.248]]) {
  const f = sk.reduce((a, o) => a + model(o.skew, b, d), 0);
  console.log(`    ${nv.padEnd(36)} forventet ${f.toFixed(0).padStart(3)} mod ${fakSk}  (${f > fakSk ? '+' : ''}${(100 * (f - fakSk) / fakSk).toFixed(0)} %)`);
}
