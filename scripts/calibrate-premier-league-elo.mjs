// ---------------------------------------------------------------------------
// scripts/calibrate-premier-league-elo.mjs — kalibrér Premier Leagues
// Elo-startværdier mod bookmakernes VINDER-odds for 2026/27.
//
// HVORFOR DEN FINDES. Superligaen fik sine startværdier i to trin: beregnet
// fra historiske resultater, og derefter kalibreret mod markedet
// (calibrate-superliga-elo.mjs). Premier League fik kun clubelo. Det var ikke
// et princip, men det data, der var tilgængeligt — og forskellen betød, at
// PL-oddsene ikke var afstemt mod noget marked i toppen, hvor forskellen er
// størst og hvor spil 2's top-4-spørgsmål afgøres.
//
// HVORFOR GRUNDLAGET STADIG ER CLUBELO OG IKKE HISTORISKE PL-RESULTATER.
// Coventry har ikke spillet i Premier League siden 2001 og Hull ikke siden
// 2016/17. En beregning fra PL-resultater ville give dem præcis 1500 — altså
// et midterhold — hvilket er nøjagtig den tavse fælde, `teamElo()` har. clubelo
// dækker alle divisioner og har rigtige tal for dem.
//
// METODE (samme som Superligaen): de-vig hvert bookmakersæt hver for sig,
// gennemsnit de to, simulér sæsonen med spillets EGNE 1X2-sandsynligheder, og
// justér iterativt hvert holds Elo mod markedets sandsynlighed. Hold uden reel
// titelchance røres knap nok — markedet er kun informativt i toppen, og de
// bagerste odds (250 mod 3001 for det samme hold) er ren afrunding, ikke viden.
//
// BRUG: node scripts/calibrate-premier-league-elo.mjs [antal_simuleringer]
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs';
import { PREMIER_LEAGUE_TEAMS_2026 } from '../src/data/premierLeagueTeams2026.js';
import { outcomeProbabilities } from '../src/lib/superligaScoring.js';

// Vinder-odds aflæst 7. august 2026. NAVNENE er vores kanoniske (pulselive);
// bookmakerne skriver fx "Man Utd" og "Nottm Forest".
//
// Bemærk hvor forskellige de to er i bunden: Danske Spil sætter ALLE outsidere
// til 250, mens bet365 spreder fra 251 til 3001. Det er ikke uenighed om
// styrke — det er, at et 250'er-loft er en afrunding. Derfor rører
// kalibreringen kun hold over CONTENDER-grænsen.
const DANSKESPIL = {
  Arsenal: 2.50, 'Manchester City': 3.75, Liverpool: 6.00, 'Manchester United': 7.50,
  Chelsea: 9.00, 'Tottenham Hotspur': 21.00, 'Aston Villa': 35.00, Brighton: 150,
  'Newcastle United': 150, Bournemouth: 200, Brentford: 250, 'Coventry City': 250,
  'Crystal Palace': 250, Everton: 250, Fulham: 250, 'Ipswich Town': 250,
  'Leeds United': 250, 'Nottingham Forest': 250, Sunderland: 250, 'Hull City': 250,
};
const BET365 = {
  Arsenal: 2.50, 'Manchester City': 3.75, Liverpool: 6.00, 'Manchester United': 7.50,
  Chelsea: 9.00, 'Tottenham Hotspur': 21.00, 'Aston Villa': 34.00,
  'Newcastle United': 151.00, Brighton: 151.00, Bournemouth: 201.00, Brentford: 251.00,
  Everton: 251.00, 'Crystal Palace': 501.00, Fulham: 501.00, 'Leeds United': 501.00,
  'Nottingham Forest': 501.00, Sunderland: 751.00, 'Coventry City': 2001.00,
  'Ipswich Town': 2001.00, 'Hull City': 3001.00,
};

// clubelo-listen bruger det fulde navn; bookmakerne det korte.
const ALIAS = { Brighton: 'Brighton and Hove Albion' };
const kanonisk = (n) => ALIAS[n] || n;

const NAMES = PREMIER_LEAGUE_TEAMS_2026.map((t) => t.name);
const N = Number(process.argv[2]) || 30000;
const ITERS = 12;
const STEP = 34;         // Elo pr. enhed log-forhold
const CLAMP_ITER = 30;   // maks. justering pr. iteration
const CLAMP_TOTAL = 160; // maks. samlet afvigelse fra clubelo (bevar blend)
const CONTENDER = 0.005; // markedet er kun informativt i toppen
const ENIGHED = 3;       // de to bøger må højst være en faktor 3 fra hinanden

/** Sanity: et bookmakersæt skal dække præcis holdlisten. Et stavet navn ville
 *  ellers falde ud i tavshed og give hele markedet en skæv normalisering. */
function tjekDaekning(navn, book) {
  const b = Object.fromEntries(Object.entries(book).map(([k, v]) => [kanonisk(k), v]));
  const mangler = NAMES.filter((n) => !(n in b));
  const ekstra = Object.keys(b).filter((n) => !NAMES.includes(n));
  if (mangler.length || ekstra.length) {
    throw new Error(`${navn}: mangler [${mangler}] — ukendte [${ekstra}]`);
  }
  return b;
}

/** De-vig: 1/odds normaliseret til sum 1. */
function devig(book) {
  const raw = {};
  let s = 0;
  for (const n of NAMES) { raw[n] = 1 / book[n]; s += raw[n]; }
  const p = {};
  for (const n of NAMES) p[n] = raw[n] / s;
  return { p, overround: s };
}

const ds = tjekDaekning('Danske Spil', DANSKESPIL);
const b3 = tjekDaekning('bet365', BET365);
const d1 = devig(ds);
const d2 = devig(b3);
const pMkt = {};
for (const n of NAMES) pMkt[n] = (d1.p[n] + d2.p[n]) / 2;

/**
 * Hvilke hold må markedet flytte?
 *
 * TO PORTE, og den anden er den, der virkelig betyder noget. Danske Spil giver
 * ALLE outsidere 250 — et gulv, ikke en vurdering — mens bet365 spreder fra
 * 251 til 3001. Gennemsnittet af de to er derfor et tal uden indhold i bunden,
 * og med kun én port trak det Hull +160, Ipswich +138 og Coventry +118 op mod
 * midterfeltet. Det er stik imod grunden til, at vi bruger clubelo: de tre
 * oprykkere er netop dem, ingen anden kilde har et rigtigt tal for.
 *
 * Derfor bruges markedet kun, hvor de to bøger faktisk er ENIGE. Faktor 3
 * skiller rent: Hull 12×, Coventry og Ipswich 8×, Sunderland 3,0× ryger ud;
 * alle reelle kandidater ligger på 1×.
 */
const kalibreres = new Set();
for (const n of NAMES) {
  const forhold = Math.max(d1.p[n] / d2.p[n], d2.p[n] / d1.p[n]);
  if (pMkt[n] >= CONTENDER && forhold <= ENIGHED) kalibreres.add(n);
}
console.error(`\nKalibreres mod markedet (${kalibreres.size} hold): ${[...kalibreres].join(', ')}`);
console.error(`Beholder clubelo: ${NAMES.filter((n) => !kalibreres.has(n)).join(', ')}`);

const fixtures = JSON.parse(readFileSync(new URL('./premier-league-fixtures-2627.json', import.meta.url), 'utf8')).fixtures;

const hist = Object.fromEntries(PREMIER_LEAGUE_TEAMS_2026.map((t) => [t.name, t.elo]));
const histMean = NAMES.reduce((a, n) => a + hist[n], 0) / NAMES.length;
const idx = Object.fromEntries(NAMES.map((n, i) => [n, i]));
const games = fixtures.map((f) => [idx[f.home], idx[f.away]]);

/** Simulér N sæsoner → mesterskabs-sandsynlighed pr. hold. */
function simulate(elo) {
  const wins = new Array(NAMES.length).fill(0);
  const probs = games.map(([h, a]) => {
    const p = outcomeProbabilities({ eloHome: elo[h], eloAway: elo[a] });
    return [p['1'], p['1'] + p.X];
  });
  const pts = new Array(NAMES.length);
  for (let s = 0; s < N; s += 1) {
    pts.fill(0);
    for (let g = 0; g < games.length; g += 1) {
      const [h, a] = games[g];
      const r = Math.random();
      const [t1, t2] = probs[g];
      if (r < t1) pts[h] += 3;
      else if (r < t2) { pts[h] += 1; pts[a] += 1; }
      else pts[a] += 3;
    }
    let best = 0;
    let ties = 1;
    for (let i = 1; i < pts.length; i += 1) {
      if (pts[i] > pts[best]) { best = i; ties = 1; }
      else if (pts[i] === pts[best]) { ties += 1; if (Math.random() < 1 / ties) best = i; }
    }
    wins[best] += 1;
  }
  return wins.map((w) => w / N);
}

const elo = NAMES.map((n) => hist[n]);
for (let it = 0; it < ITERS; it += 1) {
  const pSim = simulate(elo);
  for (let i = 0; i < NAMES.length; i += 1) {
    // Porten går på MARKEDETS tal, ikke simuleringens. Superliga-udgaven
    // spærrer på `pSim`, og dér gjorde det ikke noget: historik og marked var
    // enige om, hvem der var med i toppen. Her er de det ikke. clubelo har
    // Tottenham som nr. 16 (1458), mens BEGGE bookmakere sætter dem til 21,00
    // — altså sjettefavorit. Med porten på simuleringen ville de starte under
    // grænsen og aldrig komme over den: uændrede, for evigt, netop fordi de
    // var undervurderede. Det er markedets vurdering, vi kalibrerer MOD.
    if (!kalibreres.has(NAMES[i])) continue;
    // Gulv på simuleringen, så log() ikke eksploderer på et hold med nul
    // sejre i stikprøven. Uden det bliver justeringen styret af stikprøvestøj.
    const ps = Math.max(pSim[i], 1 / N);
    let adj = STEP * Math.log(pMkt[NAMES[i]] / ps);
    adj = Math.max(-CLAMP_ITER, Math.min(CLAMP_ITER, adj));
    elo[i] += adj;
  }
  // Bevar niveauet — kun forskelle betyder noget for kamp-odds.
  const mean = elo.reduce((a, b) => a + b, 0) / elo.length;
  for (let i = 0; i < elo.length; i += 1) elo[i] += histMean - mean;
  for (let i = 0; i < elo.length; i += 1) {
    const d = elo[i] - hist[NAMES[i]];
    if (d > CLAMP_TOTAL) elo[i] = hist[NAMES[i]] + CLAMP_TOTAL;
    if (d < -CLAMP_TOTAL) elo[i] = hist[NAMES[i]] - CLAMP_TOTAL;
  }
}

const pFinal = simulate(elo);
const out = {};
const rows = NAMES.map((n, i) => ({
  name: n, elo: Math.round(elo[i]), hist: hist[n],
  mkt: pMkt[n] * 100, sim: pFinal[i] * 100,
})).sort((a, b) => b.elo - a.elo);

console.error(`\nOverround: Danske Spil ${((d1.overround - 1) * 100).toFixed(1)} %, bet365 ${((d2.overround - 1) * 100).toFixed(1)} %`);
console.error(`Kalibreret mod marked (${N} simuleringer/iteration, ${ITERS} iterationer):\n`);
console.error(`${'Hold'.padEnd(26)}${'Elo'.padStart(5)}${'(clubelo)'.padStart(11)}${'Δ'.padStart(6)}   ${'marked%'.padStart(8)}${'sim%'.padStart(8)}`);
console.error('-'.repeat(70));
for (const r of rows) {
  const d = r.elo - r.hist;
  console.error(`${r.name.padEnd(26)}${String(r.elo).padStart(5)}${String(r.hist).padStart(11)}${(d > 0 ? `+${d}` : String(d)).padStart(6)}   ${r.mkt.toFixed(1).padStart(8)}${r.sim.toFixed(1).padStart(8)}`);
  out[r.name] = r.elo;
}
console.log(JSON.stringify(out, null, 1));
