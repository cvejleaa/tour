// ---------------------------------------------------------------------------
// scripts/maal-spilbalance.mjs — måler, hvem der vinder sæsonen og hvorfor.
//
// Loftet er en justeringsskrue på selve pointreglen, og påstandene om det har
// været forkerte før. Kommentaren i superligaScoring.js sagde, at loftet var en
// modvægt mod den modige spiller; en måling viste det modsatte. Derfor ligger
// målingen her, så tallene kan køres efter i stedet for at blive troet på.
//
// BRUG:
//   node scripts/maal-spilbalance.mjs                 # begge ligaer
//   node scripts/maal-spilbalance.mjs --liga superliga
//
// FIRE FÆLDER, der hver har kostet et forkert tal én gang:
//
// 1. `outcomeReward` tager et ODDS-OBJEKT. Sender man et tal, falder den tavst
//    tilbage på DEFAULT_POINTS (2/4/3), og alt bliver forkert uden fejlbesked.
//    Derfor regner dette script direkte på odds-tabellen.
//
// 2. To arketyper kan se forskellige ud og vælge det samme. "Mindst
//    sandsynlige udfald" er uafgjort i 97 % af Superligaens kampe, så den
//    gamle `outsider` var uafgjort-spilleren under et andet navn. Nu tjekkes
//    overlappet, og scriptet nægter at rapportere over 80 %.
//
// 3. Støjen skal være symmetrisk. Gav man kun flokken støj, vandt den alene
//    0,2 % i stedet for 8,3 % — hele tabellen var målt mod en nul-hypotese,
//    harnessen ikke kunne ramme. Kontrollen kører nu FØRST.
//
// 4. Combi-bonussen er omtrent halvdelen af pointene, og loftet rører den
//    ikke. Måler man kun 1X2, ser loftet ud til at udligne spillet.
//
// Læses tabellerne: `favoritten` er den eneste, der IKKE skiller sig ud fra
// flokken, og hun skal derfor lande på 8,3 %. Gør hun ikke det, er der noget
// galt med harnessen — ikke med spillet.
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs';
import { outcomeProbabilities, roundComboBonus } from '../src/lib/superligaScoring.js';

const OUT = ['1', 'X', '2'];
const MIN = 1.1;
// Lofterne står tilbage som HISTORIK: 6 var det gamle, og kolonnerne viser,
// hvad det kostede. Der er ikke længere et loft i spillet — ODDS.MAX findes
// ikke — så 'intet' er den række, der beskriver virkeligheden.
const LOFTER = [4, 6, 8, 12, Infinity];
const SÆSONER = 8000;
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

// ---------------------------------------------------------------------------
// ARKETYPERNE — seks måder at udfylde en kupon på.
//
// Den gamle "outsider" var argmin over alle tre udfald. Det lyder som den
// modige, men det mindst sandsynlige udfald ER uafgjort i 97 % af kampene, så
// den var i praksis uafgjort-spilleren under et andet navn. Dermed målte vi to
// gange på den samme strategi og troede, vi målte to.
//
// Den ægte modige mangler i den definition: han satser på at UNDERHUNDEN
// VINDER — ikke på uafgjort. Det er netop det udfald, loftet klippede hårdest.
//
// Hver type skal svare til noget, et menneske gør. En arketype, ingen spiller
// ligner, måler ikke spillet, men modellen.
// ---------------------------------------------------------------------------
const ARKETYPER = {
  // Tipper altid det mest sandsynlige. Rammer tit, får lidt for hver.
  favoritten: (p) => OUT.reduce((a, b) => (p[a] >= p[b] ? a : b)),

  // Tipper altid, at UNDERHUNDEN vinder — aldrig uafgjort. Den ægte modige,
  // og den, der manglede: hans udfald er dem, loftet klippede hårdest.
  underhunden: (p) => (p['1'] <= p['2'] ? '1' : '2'),

  // Tipper altid uafgjort. En rigtig vane i et 1X2-spil, og den betaler højt.
  uafgjort: () => 'X',

  // Tipper altid hjemmesejr. Den mest udbredte tommelfingerregel der findes.
  hjemmebanen: () => '1',

  // Højeste odds blandt udfald, der stadig er realistiske. Tager chancer, men
  // spiller ikke lotteri — det er sådan de fleste "vovede" tips faktisk ser ud.
  vaerdijaegeren: (p) => {
    const mulige = OUT.filter((k) => p[k] >= 0.20);
    const felt = mulige.length ? mulige : OUT;
    return felt.reduce((a, b) => (p[a] <= p[b] ? a : b));
  },

  // Trækker tilfældigt vægtet efter sandsynlighederne. Modellerer den, der
  // tipper på fornemmelse uden system — og er den eneste, hvis valg IKKE er
  // ens fra sæson til sæson.
  fornemmelsen: (p) => {
    const r = rnd();
    return r < p['1'] ? '1' : (r < p['1'] + p.X ? 'X' : '2');
  },
};

/**
 * Hvor ens tipper to arketyper?
 *
 * DET ER EN PORT, IKKE EN OPLYSNING. Smelter to typer sammen, deler de én
 * strategis resultater, og begge ser svagere ud end de er — præcis den fejl,
 * der gjorde den gamle tabel misvisende. Scriptet nægter derfor at rapportere,
 * hvis to typer vælger det samme i over 80 % af kampene.
 */
function overlap(P) {
  const navne = Object.keys(ARKETYPER);
  const valg = Object.fromEntries(navne.map((n) => [n, P.map(ARKETYPER[n])]));
  const par = [];
  for (let i = 0; i < navne.length; i += 1) {
    for (let j = i + 1; j < navne.length; j += 1) {
      const a = navne[i]; const b = navne[j];
      const ens = P.filter((_, k) => valg[a][k] === valg[b][k]).length / P.length;
      par.push({ a, b, ens });
    }
  }
  return par.sort((x, y) => y.ens - x.ens);
}

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
  // `fornemmelsen` vælger tilfældigt og skal derfor trække PR. SÆSON, ikke én
  // gang for alle. De øvrige er faste og beregnes én gang.
  const fastAlene = alene.fast ? P.map(alene.pick) : null;
  const fastFlok = flok.fast ? P.map(flok.pick) : null;
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
        const grund = j === 0
          ? (fastAlene ? fastAlene[i] : alene.pick(p))
          : (fastFlok ? fastFlok[i] : flok.pick(p));
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

/**
 * ÉN blandet liga: alle seks arketyper spiller mod hinanden, to af hver.
 *
 * Det er det spørgsmål, folk faktisk stiller — og det eneste af de to, hvor
 * tallene SUMMER TIL 100 %. `alenevinder` måler noget andet: seks separate
 * ligaer, hver med én afviger mod elleve favorit-spillere. De tal kan ikke
 * lægges sammen, for de kommer fra hver sin simulering, og en læser, der
 * summerer dem, får 151 % og tror med rette, at noget er galt.
 *
 * De to tabeller svarer på hver sit:
 *   alenevinder → "hvor meget hjælper det at skille sig ud fra flokken?"
 *   blandetfelt → "hvem vinder, hvis vi alle spiller forskelligt?"
 */
function blandetfelt(P, loft, medCombi, runder) {
  const navne = Object.keys(ARKETYPER);
  const odds = P.map((p) => oddsFor(p, loft));
  const pr = FELT / navne.length; // 12 / 6 = 2 spillere pr. arketype
  if (!Number.isInteger(pr)) throw new Error(`${FELT} spillere kan ikke deles på ${navne.length} arketyper`);
  const ejer = [];
  for (const n of navne) for (let k = 0; k < pr; k += 1) ejer.push(n);

  const fast = Object.fromEntries(navne.map((n) => [n, n === 'fornemmelsen' ? null : P.map(ARKETYPER[n])]));
  const vundet = Object.fromEntries(navne.map((n) => [n, 0]));

  for (let s = 0; s < SÆSONER; s += 1) {
    const point = new Array(FELT).fill(0);
    const ramt = medCombi ? point.map(() => new Map()) : null;
    for (let i = 0; i < P.length; i += 1) {
      const p = P[i];
      const r = rnd();
      const facit = r < p['1'] ? '1' : (r < p['1'] + p.X ? 'X' : '2');
      for (let j = 0; j < FELT; j += 1) {
        const f = fast[ejer[j]];
        const grund = f ? f[i] : ARKETYPER[ejer[j]](p);
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
      for (let j = 0; j < FELT; j += 1) {
        for (const [rd, o] of ramt[j]) point[j] += roundComboBonus(o, antalIRunde.get(rd));
      }
    }
    const bedst = Math.max(...point);
    const ledere = point.filter((x) => x === bedst).length;
    for (let j = 0; j < FELT; j += 1) if (point[j] === bedst) vundet[ejer[j]] += 1 / ledere;
  }
  return Object.fromEntries(navne.map((n) => [n, 100 * vundet[n] / SÆSONER]));
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

  const navne = Object.keys(ARKETYPER);
  const type = Object.fromEntries(navne.map((n) => [n, {
    pick: ARKETYPER[n], fast: n !== 'fornemmelsen',
  }]));

  // PORT 1: to arketyper må ikke være den samme strategi under to navne.
  console.log('  Hvor ofte vælger to arketyper det SAMME:');
  const par = overlap(P);
  for (const { a, b, ens } of par.slice(0, 3)) {
    console.log(`    ${a.padEnd(15)} / ${b.padEnd(15)} ${(100 * ens).toFixed(0).padStart(3)} %`);
  }
  const smeltet = par.filter((x) => x.ens > 0.80);
  if (smeltet.length) {
    console.log(`  ❌ ${smeltet.map((x) => `${x.a}+${x.b}`).join(', ')} er reelt samme spiller — tallene nedenfor deler én strategis resultater.`);
    process.exitCode = 1;
  } else {
    console.log(`    (højeste er ${(100 * par[0].ens).toFixed(0)} % — ingen af dem er den samme strategi) ✓`);
  }

  // PORT 2: to IDENTISKE arketyper skal give den retfærdige andel. Gør de
  // ikke det, måler resten af tabellen mod en baseline, harnessen ikke kan
  // ramme. Den fejl har været der én gang.
  const k1 = alenevinder(P, 8, type.favoritten, type.favoritten, false, runder);
  const k2 = alenevinder(P, 8, type.underhunden, type.underhunden, false, runder);
  const ok = Math.abs(k1 - 100 / FELT) < 1.5 && Math.abs(k2 - 100 / FELT) < 1.5;
  console.log(`\n  KONTROL (to ens arketyper, skal give ${(100 / FELT).toFixed(1)} %): ${k1.toFixed(1)} % / ${k2.toFixed(1)} %  ${ok ? '✓' : '❌ HARNESSEN ER SKÆV — tallene nedenfor betyder intet'}`);
  if (!ok) process.exitCode = 1;

  // TABEL 1: ÉN LIGA, alle seks mod hinanden. Summen ER 100 %.
  for (const medCombi of [false, true]) {
    console.log(`\n  ÉN BLANDET LIGA — to spillere pr. arketype${medCombi ? ', HELE pointreglen' : ', kun 1X2'}. Summen er 100 %.`);
    console.log('  loft   ' + navne.map((n) => n.padStart(15)).join('') + '        sum');
    for (const loft of (medCombi ? [6, 8, 12, Infinity] : LOFTER)) {
      const r = blandetfelt(P, loft, medCombi, runder);
      const sum = navne.reduce((a, n) => a + r[n], 0);
      const navnLoft = loft === Infinity ? 'intet' : String(loft);
      console.log(`  ${navnLoft.padStart(5)}   ` + navne.map((n) => `${r[n].toFixed(1)} %`.padStart(15)).join('') + `${sum.toFixed(0).padStart(10)} %`);
    }
  }

  // TABEL 2: hver arketype ALENE mod elleve favorit-spillere. SEKS SEPARATE
  // ligaer — tallene må IKKE lægges sammen, de kommer fra hver sin simulering.
  // Den svarer på et andet spørgsmål: hvor meget hjælper det at skille sig ud?
  for (const medCombi of [false, true]) {
    console.log(`\n  SEKS SEPARATE LIGAER — hver type ALENE mod elleve favorit-spillere${medCombi ? ', HELE pointreglen' : ', kun 1X2'}.`);
    console.log('  (tallene kommer fra hver sin simulering og må IKKE lægges sammen)');
    console.log('  loft   ' + navne.map((n) => n.padStart(15)).join(''));
    for (const loft of (medCombi ? [6, 8, 12, Infinity] : LOFTER)) {
      const rk = navne.map((n) => alenevinder(P, loft, type[n], type.favoritten, medCombi, runder));
      const navnLoft = loft === Infinity ? 'intet' : String(loft);
      console.log(`  ${navnLoft.padStart(5)}   ` + rk.map((v) => `${v.toFixed(1)} %`.padStart(15)).join(''));
    }
  }

  // Loftet er kun et problem, når det klipper TO udfald i samme kamp ned til
  // nøjagtig samme tal — så betaler to vidt forskellige gæt det samme.
  console.log('\n  Kampe hvor to udfald ender til NØJAGTIG samme pris:');
  const linje = [];
  for (const loft of LOFTER) {
    let ens = 0;
    for (const p of P) {
      const o = oddsFor(p, loft);
      if (OUT.some((a, i) => OUT.slice(i + 1).some((b) => o[a] === o[b] && o[a] === r2(loft)))) ens += 1;
    }
    linje.push(`loft ${loft === Infinity ? 'intet' : loft}: ${ens}`);
  }
  console.log(`    ${linje.join('  ·  ')}   (af ${P.length} kampe)`);
}

console.log(`
LÆSEVEJLEDNING

Tallene er IKKE "hvor god er strategien". De er "hvor ofte vinder én spiller
med den strategi sæsonen, når de elleve andre alle spiller favoritter".

Derfor står \`favoritten\` på ${(100 / FELT).toFixed(1)} %: hun ER flokken og har ingen fordel af at
skille sig ud. Det er kontrollen. Alle andre ligger 2-4× højere, og det er
IKKE fordi de er bedre — det er fordi deres point ikke svinger i takt med
flokkens. I et vinderen-tager-alt-spil er det at være ukorreleret en fordel i
sig selv, uanset om man er modig eller forsigtig.

Loftet skal derfor ikke aflæses som "gør det spillet retfærdigt". Det kan det
ikke. Det skal aflæses som: rammer loftet én bestemt strategi hårdere end de
andre? Ved et lavt loft gør det — det klipper kun høje odds, og det er
uafgjort- og underhund-spillerens hele indtægt. Ved 8 (Superligaen) og 12
(Premier League) er kurven flad: derfra flytter et højere loft ingenting.
`);
