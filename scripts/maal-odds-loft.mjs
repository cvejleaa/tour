// ---------------------------------------------------------------------------
// scripts/maal-odds-loft.mjs — måler, hvad odds-loftet gør ved balancen.
//
// Loftet er en justeringsskrue på selve pointreglen, og påstandene om det har
// været forkerte før. Kommentaren i superligaScoring.js sagde, at loftet var en
// modvægt mod den modige spiller; en måling viste det modsatte. Derfor ligger
// målingen her, så tallene kan køres efter i stedet for at blive troet på.
//
// BRUG:
//   node scripts/maal-odds-loft.mjs                 # begge ligaer
//   node scripts/maal-odds-loft.mjs --liga superliga
//
// TO FÆLDER, der begge har kostet forkerte tal én gang hver:
//
// 1. `outcomeReward` tager et ODDS-OBJEKT. Sender man et tal, falder den tavst
//    tilbage på DEFAULT_POINTS (2/4/3), og alt bliver forkert uden fejlbesked.
//    Derfor regner dette script direkte på odds-tabellen.
//
// 2. To arketyper kan se forskellige ud og vælge det samme. "Mindst
//    sandsynlige udfald" er uafgjort i 97 % af Superligaens kampe, så
//    `outsider` og `uafgjort` er reelt SAMME spiller — og i et fælles felt
//    deler de én strategis sejre, så begge ser svage ud. Scriptet måler derfor
//    ét felt ad gangen med ÉN afvigende spiller.
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs';
import { outcomeProbabilities, roundComboBonus } from '../src/lib/superligaScoring.js';

const OUT = ['1', 'X', '2'];
const MIN = 1.1;
const LOFTER = [4, 5, 6, 7, 8, 9, 10, 12, Infinity];
const SÆSONER = 20000;
const FELT = 12;   // ligaen har 12 spillere
const STOEJ = 0.10; // andel kampe, hver spiller tipper tilfældigt

// Fast frø. Uden det kan to kørsler ikke sammenlignes, og "tallene kan
// efterprøves" er ikke sandt. Standardfejlen ved 20.000 sæsoner er ~0,33
// procentpoint, så forskelle under ~1 pp skal ikke tolkes.
// mulberry32 — ikke en klassisk LCG. Den første udgave her brugte
// `(frø * 1103515245 + 12345) & 0x7fffffff`, hvis lave bit er stærkt
// korrelerede; `Math.floor(rnd() * 3)` trak netop på dem, og kontrollen
// nedenfor faldt ud på det alene.
let frø = 20260807;
function rnd() {
  frø |= 0; frø = (frø + 0x6D2B79F5) | 0;
  let t = Math.imul(frø ^ (frø >>> 15), 1 | frø);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const arg = (n) => {
  const i = process.argv.indexOf(`--${n}`);
  return i === -1 ? null : process.argv[i + 1];
};

const LIGAER = {
  superliga: ['Superligaen', 'src/data/superligaTeams2026.js', 'scripts/superliga-fixtures.json'],
  pl: ['Premier League', 'src/data/premierLeagueTeams2026.js', 'scripts/premier-league-fixtures-2627.json'],
};

const favorit = (p) => OUT.reduce((a, b) => (p[a] >= p[b] ? a : b));
const outsider = (p) => OUT.reduce((a, b) => (p[a] <= p[b] ? a : b));
const r2 = (x) => Math.round(x * 100) / 100;
const oddsFor = (p, loft) => Object.fromEntries(OUT.map((k) => [k, r2(Math.min(loft, Math.max(MIN, 1 / p[k])))]));

/**
 * Hvor ofte vinder den ENE afvigende spiller sæsonen?
 *
 * STØJEN SKAL VÆRE SYMMETRISK. Første udgave gav kun de elleve støj og lod den
 * afvigende tippe fejlfrit. Det lyder harmløst, men bedste-af-elleve-støjende
 * slår den støjfrie næsten altid: kører man to IDENTISKE arketyper mod hinanden
 * i den udgave, vinder den alene 0,2 % i stedet for de 8,3 %, han skal. Hele
 * tabellen blev altså målt mod en nul-hypotese, harnessen ikke kunne
 * reproducere. Derfor får alle tolv nu samme støj — og `--kontrol` kører netop
 * den prøve, så fejlen ikke kan snige sig ind igen.
 *
 * @param medCombi tag combi-bonussen med. Den er ~halvdelen af pointene, og
 *   loftet rører den ikke — så uden den måler man kun det ene ben.
 */
function alenevinder(P, loft, alene, flok, medCombi, runder) {
  const odds = P.map((p) => oddsFor(p, loft));
  const vAlene = P.map(alene);
  const vFlok = P.map(flok);
  let vundet = 0;

  for (let s = 0; s < SÆSONER; s += 1) {
    const point = new Array(FELT).fill(0);
    // Ramte odds pr. spiller pr. runde — combi'en regnes på dem bagefter.
    const ramt = medCombi ? point.map(() => new Map()) : null;

    for (let i = 0; i < P.length; i += 1) {
      const p = P[i];
      const r = rnd();
      const facit = r < p['1'] ? '1' : (r < p['1'] + p.X ? 'X' : '2');
      for (let j = 0; j < FELT; j += 1) {
        const grund = j === 0 ? vAlene[i] : vFlok[i];
        const eget = rnd() < STOEJ ? OUT[Math.floor(rnd() * 3)] : grund;
        if (eget !== facit) continue;
        point[j] += odds[i][facit];
        if (ramt) {
          const rd = runder[i];
          if (!ramt[j].has(rd)) ramt[j].set(rd, []);
          ramt[j].get(rd).push(odds[i][facit]);
        }
      }
    }

    if (ramt) {
      // Kuponen kræver, at man har tippet hele runden — det gør alle her.
      for (let j = 0; j < FELT; j += 1) {
        for (const [rd, o] of ramt[j]) point[j] += roundComboBonus(o, antalIRunde.get(rd));
      }
    }
    // Uafgjort DELES. Med `>` alene ville enhver deling tælle som et tab for
    // alle tolv, og så kan summen af tolv ens spillere ikke give 100 % —
    // kontrollen ville rapportere en skævhed, der ikke findes i spillet.
    const bedst = Math.max(...point);
    if (point[0] === bedst) vundet += 1 / point.filter((p) => p === bedst).length;
  }
  return 100 * vundet / SÆSONER;
}

let antalIRunde = new Map();

const valgt = arg('liga');
for (const [nøgle, [navn, teamsFil, fixFil]] of Object.entries(LIGAER)) {
  if (valgt && valgt !== nøgle) continue;
  const teams = await import(`../${teamsFil}`).then((m) => Object.values(m).find(Array.isArray));
  const elo = Object.fromEntries(teams.map((t) => [t.name, t.elo]));
  const rå = JSON.parse(readFileSync(new URL(`../${fixFil}`, import.meta.url), 'utf8'));
  const fixtures = Array.isArray(rå) ? rå : rå.fixtures;
  const P = fixtures.map((f) => outcomeProbabilities({ eloHome: elo[f.home], eloAway: elo[f.away] }));
  const runder = fixtures.map((f) => f.round);
  antalIRunde = new Map();
  for (const r of runder) antalIRunde.set(r, (antalIRunde.get(r) || 0) + 1);

  console.log(`\n${navn.toUpperCase()} — ${P.length} kampe, ${teams.length} hold, felt på ${FELT}.`);
  console.log(`En retfærdig andel for én spiller er 1/${FELT} = ${(100 / FELT).toFixed(1)} %.\n`);

  // KONTROLLEN FØRST. To identiske arketyper skal give den retfærdige andel.
  // Gør de ikke det, er harnessen skæv, og resten af tabellen måler mod en
  // baseline, den ikke selv kan ramme. Den fejl har været der én gang.
  const k1 = alenevinder(P, 8, favorit, favorit, false, runder);
  const k2 = alenevinder(P, 8, outsider, outsider, false, runder);
  const ok = Math.abs(k1 - 100 / FELT) < 1.5 && Math.abs(k2 - 100 / FELT) < 1.5;
  console.log(`  KONTROL (to ens arketyper, skal give ${(100 / FELT).toFixed(1)} %): ${k1.toFixed(1)} % / ${k2.toFixed(1)} %  ${ok ? '✓' : '❌ HARNESSEN ER SKÆV — tallene nedenfor betyder intet'}`);
  if (!ok) process.exitCode = 1;

  console.log('\n  Uden combi (kun 1X2) — loftet rammer kun dette ben:');
  console.log('  loft   outsider alene   favorit alene   kampe m. to udfald til samme pris');

  for (const loft of LOFTER) {
    // Loftet er kun et problem, når det klipper TO udfald i samme kamp ned til
    // nøjagtig samme tal — så betaler to vidt forskellige gæt det samme.
    let ens = 0;
    for (const p of P) {
      const o = oddsFor(p, loft);
      if (OUT.some((a, i) => OUT.slice(i + 1).some((b) => o[a] === o[b] && o[a] === r2(loft)))) ens += 1;
    }
    const o = alenevinder(P, loft, outsider, favorit, false, runder);
    const f = alenevinder(P, loft, favorit, outsider, false, runder);
    const navnLoft = loft === Infinity ? 'intet' : String(loft);
    console.log(`  ${navnLoft.padStart(5)}   ${`${o.toFixed(1)} %`.padStart(14)}   ${`${f.toFixed(1)} %`.padStart(13)}   ${String(ens).padStart(4)} af ${P.length}`);
  }

  // MED COMBI. Den er ~halvdelen af pointene, og loftet rører den ikke — den
  // ganger de RENE odds. Uden dette ben ser loftet ud til at udligne spillet;
  // med det står favorit-spilleren stadig markant foran, uanset loft.
  console.log('\n  Med combi-bonussen (hele pointreglen):');
  console.log('  loft   outsider alene   favorit alene');
  for (const loft of [6, 8, 12]) {
    const o = alenevinder(P, loft, outsider, favorit, true, runder);
    const f = alenevinder(P, loft, favorit, outsider, true, runder);
    console.log(`  ${String(loft).padStart(5)}   ${`${o.toFixed(1)} %`.padStart(14)}   ${`${f.toFixed(1)} %`.padStart(13)}`);
  }
}

console.log(`
Læsevejledning: loftet er i balance, når de to midterste tal er tæt på hinanden
— ikke når de er tæt på ${(100 / FELT).toFixed(1)} %. At stå alene er en fordel i sig selv, og den
fordel gælder begge veje. Loftet kan kun gøre den skæv, ikke fjerne den.
`);
