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
import { outcomeProbabilities } from '../src/lib/superligaScoring.js';

const OUT = ['1', 'X', '2'];
const MIN = 1.1;
const LOFTER = [4, 5, 6, 7, 8, 9, 10, 12, Infinity];
const SÆSONER = 20000;
const FELT = 12; // ligaen har 12 spillere

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
 * De elleve andre tipper ens, men ikke identisk: hver springer 10 % af kampene
 * over og tipper tilfældigt. Uden den støj ville de have præcis samme total, og
 * den afvigende skulle kun slå ÉT tal i stedet for det bedste af elleve — så
 * ville hans andel se kunstigt høj ud.
 */
function alenevinder(P, loft, alene, flok) {
  const odds = P.map((p) => oddsFor(p, loft));
  const vAlene = P.map(alene);
  const vFlok = P.map(flok);
  let vundet = 0;
  for (let s = 0; s < SÆSONER; s += 1) {
    const flokPoint = new Array(FELT - 1).fill(0);
    let alenePoint = 0;
    for (let i = 0; i < P.length; i += 1) {
      const p = P[i];
      const r = Math.random();
      const facit = r < p['1'] ? '1' : (r < p['1'] + p.X ? 'X' : '2');
      if (vAlene[i] === facit) alenePoint += odds[i][facit];
      for (let j = 0; j < FELT - 1; j += 1) {
        const eget = Math.random() < 0.10 ? OUT[Math.floor(Math.random() * 3)] : vFlok[i];
        if (eget === facit) flokPoint[j] += odds[i][facit];
      }
    }
    if (alenePoint > Math.max(...flokPoint)) vundet += 1;
  }
  return 100 * vundet / SÆSONER;
}

const valgt = arg('liga');
for (const [nøgle, [navn, teamsFil, fixFil]] of Object.entries(LIGAER)) {
  if (valgt && valgt !== nøgle) continue;
  const teams = await import(`../${teamsFil}`).then((m) => Object.values(m).find(Array.isArray));
  const elo = Object.fromEntries(teams.map((t) => [t.name, t.elo]));
  const rå = JSON.parse(readFileSync(new URL(`../${fixFil}`, import.meta.url), 'utf8'));
  const fixtures = Array.isArray(rå) ? rå : rå.fixtures;
  const P = fixtures.map((f) => outcomeProbabilities({ eloHome: elo[f.home], eloAway: elo[f.away] }));

  console.log(`\n${navn.toUpperCase()} — ${P.length} kampe, ${teams.length} hold, felt på ${FELT}.`);
  console.log(`En retfærdig andel for én spiller er 1/${FELT} = ${(100 / FELT).toFixed(1)} %.\n`);
  console.log('  loft   outsider alene   favorit alene   kampe m. to udfald til samme pris');

  for (const loft of LOFTER) {
    // Loftet er kun et problem, når det klipper TO udfald i samme kamp ned til
    // nøjagtig samme tal — så betaler to vidt forskellige gæt det samme.
    let ens = 0;
    for (const p of P) {
      const o = oddsFor(p, loft);
      if (OUT.some((a, i) => OUT.slice(i + 1).some((b) => o[a] === o[b] && o[a] === r2(loft)))) ens += 1;
    }
    const o = alenevinder(P, loft, outsider, favorit);
    const f = alenevinder(P, loft, favorit, outsider);
    const navnLoft = loft === Infinity ? 'intet' : String(loft);
    console.log(`  ${navnLoft.padStart(5)}   ${`${o.toFixed(1)} %`.padStart(14)}   ${`${f.toFixed(1)} %`.padStart(13)}   ${String(ens).padStart(4)} af ${P.length}`);
  }
}

console.log(`
Læsevejledning: loftet er i balance, når de to midterste tal er tæt på hinanden
— ikke når de er tæt på ${(100 / FELT).toFixed(1)} %. At stå alene er en fordel i sig selv, og den
fordel gælder begge veje. Loftet kan kun gøre den skæv, ikke fjerne den.
`);
