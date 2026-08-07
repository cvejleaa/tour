// ---------------------------------------------------------------------------
// scripts/maal-chancen.mjs — måler, hvad et odds-loft gør ved CHANCEN.
//
// HVORFOR DEN FINDES. `maal-spilbalance.mjs` måler 1X2-benet og combi'en, og
// dér ser et loft næsten harmløst ud. Chancen er en anden sag: den ganger
// indsatsen med `odds − 1`, og et loft klipper kun GEVINSTEN, aldrig
// indsatsen. Oddsene er fair, så en Chance skal give nul i forventning —
// klippes udbetalingen, betaler man for at satse. Det var den måling, der
// afgjorde, at loftet skulle fjernes helt, og den lå længe kun i en
// terminalhistorik. Nu ligger den her.
//
// OPSTILLINGEN. Tolv spillere, som alle tipper FAVORIT på 1X2 og alle bruger
// den samme combi-regel. De adskiller sig udelukkende i, hvordan de bruger
// Chancen — tre af hver strategi, så retfærdig andel er 25 %. Alt andet er
// holdt fast med vilje: så kan forskellen ikke komme fra andet end Chancen.
//
// Kolonnen "modiges snit-udbytte" er den vigtigste. Den siger, hvor mange
// point den modige i gennemsnit får UD af Chancen over en hel sæson. Er den
// negativ, koster det point at turde — og så er funktionen ikke det, den giver
// sig ud for.
//
// FÆLDERNE er de samme som i maal-spilbalance.mjs, og de har kostet forkerte
// tal før: frøet skal være fast (ellers kan to kørsler ikke sammenlignes), og
// uafgjorte sæsoner skal deles mellem lederne, ikke tælle som tab for alle.
//
// BRUG: node scripts/maal-chancen.mjs
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs';
import { outcomeProbabilities, CHANCE, roundComboBonus } from '../src/lib/superligaScoring.js';
import { PREMIER_LEAGUE_TEAMS_2026 } from '../src/data/premierLeagueTeams2026.js';

const ROD = new URL('..', import.meta.url).pathname;
const OUT = ['1', 'X', '2'];

// mulberry32 med fast frø. En klassisk LCG duer ikke: dens lave bit er stærkt
// korrelerede, og det er netop dem, et udtræk af tre udfald trækker på.
let frø = 20260807;
const rnd = () => {
  frø |= 0; frø = (frø + 0x6D2B79F5) | 0;
  let t = Math.imul(frø ^ (frø >>> 15), 1 | frø);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const elo = Object.fromEntries(PREMIER_LEAGUE_TEAMS_2026.map((t) => [t.name, t.elo]));
const fx = JSON.parse(readFileSync(`${ROD}scripts/premier-league-fixtures-2627.json`, 'utf8')).fixtures;
const runder = [...new Set(fx.map((m) => m.round))].sort((a, b) => a - b);

// Strategierne. `kampe` er alle 3 × rundens kampe kandidat-udfald.
const STRAT = {
  ingen: null,
  sikker: (kampe) => kampe.reduce((a, b) => (a.p >= b.p ? a : b)),   // højeste chance
  moderat: (kampe) => {
    const k = kampe.filter((x) => x.o >= 3 && x.o <= 6);
    return (k.length ? k : kampe).reduce((a, b) => (a.o >= b.o ? a : b));
  },
  modig: (kampe) => kampe.reduce((a, b) => (a.o >= b.o ? a : b)),    // højeste odds
};
const navne = Object.keys(STRAT);
const FELT = 12;
const PR = FELT / navne.length;

function sim(loft, sæsoner) {
  const klip = (o) => Math.min(loft, Math.max(1.1, o));
  const P = fx.map((m) => outcomeProbabilities({ eloHome: elo[m.home], eloAway: elo[m.away] }));
  const odds = P.map((p) => Object.fromEntries(OUT.map((k) => [k, Math.round(klip(1 / p[k]) * 100) / 100])));
  const fav = P.map((p) => OUT.reduce((a, b) => (p[a] >= p[b] ? a : b)));
  const ejer = [];
  for (const n of navne) for (let i = 0; i < PR; i += 1) ejer.push(n);
  const vundet = Object.fromEntries(navne.map((n) => [n, 0]));
  const chanceAndel = Object.fromEntries(navne.map((n) => [n, 0]));

  for (let s = 0; s < sæsoner; s += 1) {
    const point = new Array(FELT).fill(0);
    const fraChance = new Array(FELT).fill(0);
    for (const rd of runder) {
      const idx = fx.map((m, i) => (m.round === rd ? i : -1)).filter((i) => i >= 0);
      // Facit trækkes fra modellens EGNE sandsynligheder. Det er pointen: er
      // oddsene fair, skal enhver strategi give nul i forventning, og alt hvad
      // målingen så finder, kommer fra pointreglen — ikke fra et bedre gæt.
      const facit = idx.map((i) => {
        const p = P[i]; const r = rnd();
        return r < p['1'] ? '1' : (r < p['1'] + p.X ? 'X' : '2');
      });
      for (let j = 0; j < FELT; j += 1) {
        const ramt = [];
        idx.forEach((i, k) => {
          if (fav[i] === facit[k]) { point[j] += odds[i][facit[k]]; ramt.push(odds[i][facit[k]]); }
        });
        point[j] += roundComboBonus(ramt, idx.length);
      }
      // Chancen: én kamp pr. runde, indsats = min(8, 15 % af saldo).
      for (let j = 0; j < FELT; j += 1) {
        const st = STRAT[ejer[j]];
        if (!st) continue;
        const maks = Math.min(CHANCE.MAX_ABS, Math.floor(CHANCE.CAP_FRACTION * point[j]));
        if (maks < CHANCE.MIN) continue;
        const kandidater = idx.flatMap((i, k) => OUT.map((u) => ({ i, k, u, o: odds[i][u], p: P[i][u] })));
        const valg = st(kandidater);
        const d = facit[valg.k] === valg.u ? maks * (valg.o - 1) : -maks;
        point[j] += d; fraChance[j] += d;
      }
    }
    // Uafgjort deles mellem lederne. Talte man dem som tab for alle, kunne
    // søjlerne ikke summe til 100 % — den fejl har kostet et forkert tal før.
    const bedst = Math.max(...point);
    const led = point.filter((x) => x === bedst).length;
    for (let j = 0; j < FELT; j += 1) if (point[j] === bedst) vundet[ejer[j]] += 1 / led;
    for (let j = 0; j < FELT; j += 1) chanceAndel[ejer[j]] += fraChance[j];
  }
  return {
    vundet: Object.fromEntries(navne.map((n) => [n, 100 * vundet[n] / sæsoner])),
    snitChance: Object.fromEntries(navne.map((n) => [n, chanceAndel[n] / (sæsoner * PR)])),
  };
}

const SÆSONER = 3000;
console.log(`PREMIER LEAGUE — ${FELT} spillere, alle favorit på 1X2, ${PR} pr. Chancen-strategi.`);
console.log(`Retfærdig andel: ${(100 / navne.length).toFixed(0)} % pr. strategi. ${SÆSONER} sæsoner.\n`);
console.log('  loft        ingen      sikker     moderat       modig   |  modiges snit-udbytte af Chancen');
for (const loft of [6, 8, 12, 25, Infinity]) {
  const r = sim(loft, SÆSONER);
  console.log(`  ${String(loft === Infinity ? 'intet' : loft).padStart(5)}   ${
    navne.map((n) => `${r.vundet[n].toFixed(1)} %`.padStart(11)).join('')
  }   |  ${r.snitChance.modig.toFixed(0).padStart(5)} point`);
}
console.log('\n  Negativt udbytte = loftet gør det dyrt at turde. Oddsene er fair,');
console.log('  så tallet SKAL være omkring nul, hvis Chancen er en ærlig funktion.');
