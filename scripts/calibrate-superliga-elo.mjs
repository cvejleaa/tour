// ---------------------------------------------------------------------------
// scripts/calibrate-superliga-elo.mjs — kalibrér Elo-startværdier mod
// bookmakernes VINDER-odds (outright) for Superligaen 2026/27.
//
// Metode: start fra de historisk beregnede Elo (superligaTeams2026.js), simulér
// grundspillet (22 runder) mange gange med spillets egne 1X2-sandsynligheder,
// og tæl hvor ofte hvert hold ender øverst. Justér iterativt hvert holds Elo mod
// markedets (afvigningsfrie) vinder-sandsynlighed — bundhold med ~0 % titelchance
// røres knap nok, så historikken bevares dér, mens toppen trækkes mod markedet.
//
// Vinderen i Superligaen afgøres reelt i mesterskabsspillet; vi approksimerer med
// grundspillets pointleder. Det er groft for selve titlen, men fint til at
// kalibrere RELATIV holdstyrke, som er det, kamp-oddsene bygger på.
//
// BRUG: node scripts/calibrate-superliga-elo.mjs [antal_simuleringer]
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs';
import { SUPERLIGA_TEAMS_2026 } from '../src/data/superligaTeams2026.js';
import { outcomeProbabilities } from '../src/lib/superligaScoring.js';

// Bookmakernes vinder-odds (kanoniske holdnavne).
const DANSKESPIL = {
  'FC Midtjylland': 2.70, 'F.C. København': 2.40, 'AGF': 10.50, 'Brøndby IF': 8.00,
  'FC Nordsjælland': 25.0, 'Viborg FF': 100, 'OB': 125, 'Randers FC': 150,
  'Sønderjyske Fodbold': 200, 'Silkeborg IF': 350, 'AC Horsens': 750, 'Lyngby Boldklub': 1000,
};
const BETXPERT = {
  'FC Midtjylland': 2.30, 'F.C. København': 2.50, 'AGF': 10.0, 'Brøndby IF': 13.0,
  'FC Nordsjælland': 30.0, 'OB': 101, 'Viborg FF': 101, 'Randers FC': 151,
  'Sønderjyske Fodbold': 201, 'Silkeborg IF': 301, 'AC Horsens': 751, 'Lyngby Boldklub': 1001,
};

const NAMES = SUPERLIGA_TEAMS_2026.map((t) => t.name);
const N = Number(process.argv[2]) || 30000;
const ITERS = 12;
const STEP = 34;        // Elo pr. enhed log-forhold
const CLAMP_ITER = 30;  // maks. justering pr. iteration
const CLAMP_TOTAL = 160; // maks. samlet afvigelse fra historisk (bevar blend)
const CONTENDER = 0.0015; // minimum sim-sandsynlighed for at et hold justeres

// De-vig et bookmaker-sæt: 1/odds normaliseret til sum 1.
function devig(book) {
  const raw = {};
  let s = 0;
  for (const n of NAMES) { raw[n] = 1 / book[n]; s += raw[n]; }
  const p = {};
  for (const n of NAMES) p[n] = raw[n] / s;
  return p;
}

// Marked = gennemsnit af de to afvigningsfrie sæt.
const p1 = devig(DANSKESPIL);
const p2 = devig(BETXPERT);
const pMkt = {};
for (const n of NAMES) pMkt[n] = (p1[n] + p2[n]) / 2;

// Grundspillets kampe (runde 1–22).
const fixtures = JSON.parse(readFileSync('scripts/superliga-fixtures.json', 'utf8')).fixtures
  .filter((f) => f.round >= 1 && f.round <= 22);

const histMean = NAMES.reduce((a, n) => a + eloOf(n), 0) / NAMES.length;
function eloOf(name) { return SUPERLIGA_TEAMS_2026.find((t) => t.name === name).elo; }
const hist = Object.fromEntries(NAMES.map((n) => [n, eloOf(n)]));

// Forbered kampe som indeks-par for fart.
const idx = Object.fromEntries(NAMES.map((n, i) => [n, i]));
const games = fixtures.map((f) => [idx[f.home], idx[f.away]]);

// Simulér N sæsoner med givne ratings → vinder-sandsynlighed pr. hold.
function simulate(elo) {
  const wins = new Array(NAMES.length).fill(0);
  // Forbered 1X2-sandsynligheder pr. kamp (afhænger kun af elo).
  const probs = games.map(([h, a]) => {
    const p = outcomeProbabilities({ eloHome: elo[h], eloAway: elo[a] });
    return [p['1'], p['1'] + p.X]; // tærskler: <p1 = hjemme, <p1+pX = uafgjort, ellers ude
  });
  const pts = new Array(NAMES.length);
  for (let s = 0; s < N; s++) {
    pts.fill(0);
    for (let g = 0; g < games.length; g++) {
      const [h, a] = games[g];
      const r = Math.random();
      const [t1, t2] = probs[g];
      if (r < t1) pts[h] += 3;
      else if (r < t2) { pts[h] += 1; pts[a] += 1; }
      else pts[a] += 3;
    }
    // Vinder = flest point (tilfældig tiebreak).
    let best = 0;
    let ties = 1;
    for (let i = 1; i < pts.length; i++) {
      if (pts[i] > pts[best]) { best = i; ties = 1; }
      else if (pts[i] === pts[best]) { ties++; if (Math.random() < 1 / ties) best = i; }
    }
    wins[best]++;
  }
  return wins.map((w) => w / N);
}

// Kalibrér: nudge Elo mod markedet, gentag.
const elo = NAMES.map((n) => hist[n]);
for (let it = 0; it < ITERS; it++) {
  const pSim = simulate(elo);
  for (let i = 0; i < NAMES.length; i++) {
    const ps = pSim[i];
    const pm = pMkt[NAMES[i]];
    if (ps < CONTENDER || pm <= 0) continue; // ikke titelkandidat → bevar historik
    let adj = STEP * Math.log(pm / ps);
    adj = Math.max(-CLAMP_ITER, Math.min(CLAMP_ITER, adj));
    elo[i] += adj;
  }
  // Bevar det historiske niveau (kun forskelle betyder noget for kamp-odds).
  const mean = elo.reduce((a, b) => a + b, 0) / elo.length;
  for (let i = 0; i < elo.length; i++) elo[i] += histMean - mean;
  // Hold blend: begræns samlet afvigelse fra historisk.
  for (let i = 0; i < elo.length; i++) {
    const d = elo[i] - hist[NAMES[i]];
    if (d > CLAMP_TOTAL) elo[i] = hist[NAMES[i]] + CLAMP_TOTAL;
    if (d < -CLAMP_TOTAL) elo[i] = hist[NAMES[i]] - CLAMP_TOTAL;
  }
}

const pFinal = simulate(elo);
const out = {};
const rows = NAMES.map((n, i) => ({
  name: n, elo: Math.round(elo[i]), hist: hist[n],
  mkt: (pMkt[n] * 100), sim: (pFinal[i] * 100),
})).sort((a, b) => b.elo - a.elo);

console.error(`\nKalibreret mod marked (${N} simuleringer/iteration, ${ITERS} iterationer):\n`);
console.error(`${'Hold'.padEnd(22)}${'Elo'.padStart(5)}${'(hist)'.padStart(8)}   ${'marked%'.padStart(8)}${'sim%'.padStart(8)}`);
console.error('-'.repeat(60));
for (const r of rows) {
  console.error(`${r.name.padEnd(22)}${String(r.elo).padStart(5)}${('' + r.hist).padStart(8)}   ${r.mkt.toFixed(1).padStart(8)}${r.sim.toFixed(1).padStart(8)}`);
  out[r.name] = r.elo;
}
console.log(JSON.stringify(out, null, 1));
