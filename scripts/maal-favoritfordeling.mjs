#!/usr/bin/env node
/**
 * maal-favoritfordeling.mjs — hvor mange kampe er hvert hold favorit i?
 *
 * HVORFOR DEN FINDES. `favoritTal` i holdStatistik.js skjuler bankerkortet,
 * når et hold aldrig har været favorit, og begrundelsen i koden er, at det
 * ikke er en kant men normaltilstanden for nogle hold. Den begrundelse er et
 * TAL, og huset kræver kode bag et tal, der begrunder en beslutning.
 *
 * HVAD DEN MÅLER — OG HVAD DEN IKKE MÅLER. Første udgave af dette script
 * regnede favoritten af START-ratingen for alle 18 runder og konkluderede, at
 * "Hull City er favorit i 0 kampe". Ejeren fangede fejlen: `recomputeSeasonElo`
 * opdaterer odds for FREMTIDIGE, ikke-låste kampe
 * (`functions-platform/gameScoring.js:76-79`), så ratingen flytter sig, og
 * kampene omprises undervejs. Vinder Hull sine første kampe, STIGER deres
 * rating, og så bliver de favorit. Tallet var altså en fremskrivning i en
 * verden, hvor intet ændrer sig — ikke en kendsgerning om spillet.
 *
 * Derfor måler scriptet nu TO ting:
 *
 *  1. Fordelingen ved SPILLETS BEGYNDELSE — hvem odds ville pege på, hvis
 *     ingen kamp var spillet. Den er stadig det, der begrunder vagten i
 *     `favoritTal`: et hold kan gå længe uden en eneste favoritkamp, og et
 *     bankerkort med nævner nul er så et fravær, ikke et resultat.
 *  2. Hvor hurtigt det kan vende — hvor mange sejre i træk der skal til, før
 *     spillets svageste hold selv bliver favorit. Det er svaret på ejerens
 *     indvending, og det er et tal frem for en formodning.
 *
 * Kør:  node scripts/maal-favoritfordeling.mjs [--runder 18]
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PREMIER_LEAGUE_TEAMS_2026 } from '../src/data/premierLeagueTeams2026.js';
import {
  outcomeOdds, OUTCOME, ELO, updateElo, actualHomeFromOutcome,
} from '../src/lib/superligaScoring.js';

const her = dirname(fileURLToPath(import.meta.url));
const arg = (navn, fald) => {
  const i = process.argv.indexOf(`--${navn}`);
  return i >= 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : fald;
};

// Spillet pl2627-efteraar er runde 1-18 af 38. Standard følger spillet.
const RUNDER = arg('runder', 18);

const { fixtures } = JSON.parse(
  readFileSync(join(her, 'premier-league-fixtures-2627.json'), 'utf8'),
);
const elo = Object.fromEntries(
  PREMIER_LEAGUE_TEAMS_2026.map((t) => [t.name, Number(t.elo) || ELO.START]),
);

const tael = new Map();
const sikr = (n) => {
  if (!tael.has(n)) tael.set(n, { favoritI: 0, udfordrerI: 0, xFavorit: 0 });
  return tael.get(n);
};
for (const t of PREMIER_LEAGUE_TEAMS_2026) sikr(t.name);

let ialt = 0;
for (const f of fixtures) {
  if (Number(f.round) > RUNDER) continue;
  ialt += 1;
  const odds = outcomeOdds({ eloHome: elo[f.home], eloAway: elo[f.away] });
  const par = [
    [OUTCOME.HOME, odds[OUTCOME.HOME]],
    [OUTCOME.DRAW, odds[OUTCOME.DRAW]],
    [OUTCOME.AWAY, odds[OUTCOME.AWAY]],
  ];
  const lavest = Math.min(...par.map(([, v]) => v));
  const delte = par.filter(([, v]) => v === lavest);
  // Samme regel som oddsUdfald: delt laveste odds giver INGEN favorit.
  if (delte.length !== 1) continue;
  const [favorit] = delte[0];
  if (favorit === OUTCOME.DRAW) {
    sikr(f.home).xFavorit += 1;
    sikr(f.away).xFavorit += 1;
    continue;
  }
  const favoritHold = favorit === OUTCOME.HOME ? f.home : f.away;
  const andet = favorit === OUTCOME.HOME ? f.away : f.home;
  sikr(favoritHold).favoritI += 1;
  sikr(andet).udfordrerI += 1;
}

const raekker = [...tael.entries()]
  .map(([navn, r]) => ({ navn, ...r, kampe: r.favoritI + r.udfordrerI + r.xFavorit }))
  .sort((a, b) => b.favoritI - a.favoritI);

console.log(`Premier League 2026/27, runde 1-${RUNDER} (${ialt} kampe).`);
console.log('DEL 1 — fordelingen VED SPILLETS BEGYNDELSE, altså hvis ingen '
  + 'rating flyttede sig.\n');
console.log('Hold                      favorit  udfordrer  X-favorit  kampe');
for (const r of raekker) {
  console.log(
    `${r.navn.padEnd(24)} ${String(r.favoritI).padStart(7)} `
    + `${String(r.udfordrerI).padStart(10)} ${String(r.xFavorit).padStart(10)} `
    + `${String(r.kampe).padStart(6)}`,
  );
}

const uden = raekker.filter((r) => r.favoritI === 0);
const altid = raekker.filter((r) => r.udfordrerI === 0);
console.log(`\n${uden.length} hold er favorit i INGEN kampe`
  + `${uden.length ? `: ${uden.map((r) => r.navn).join(', ')}` : ''}.`);
console.log(`${altid.length} hold er udfordrer i INGEN kampe`
  + `${altid.length ? `: ${altid.map((r) => r.navn).join(', ')}` : ''}.`);
console.log('\nDET ER VAGTENS BEGRUNDELSE: for de hold står et bankerkort '
  + 'med nævner nul, indtil ratingen flytter sig — og fra runde 1 gælder det '
  + 'ALLE hold, for ingen har spillet endnu.');

// --- DEL 2: hvor hurtigt kan det vende? -------------------------------------
//
// Ejerens indvending, gjort til et tal. Vi lader det svageste hold vinde hver
// kamp fra runde 1 og opdaterer ratingen med husets egen updateElo — præcis
// som recomputeSeasonElo gør — og finder den første runde, hvor holdet selv
// er favorit. Modstandernes rating opdateres med, så tabet trækker dem ned.
const svagest = raekker[raekker.length - 1];
const live = { ...elo };
const iRunde = new Map();
for (const f of fixtures) {
  if (Number(f.round) > RUNDER) continue;
  if (!iRunde.has(f.round)) iRunde.set(f.round, []);
  iRunde.get(f.round).push(f);
}

let foersteFavoritRunde = null;
let sejre = 0;
for (const runde of [...iRunde.keys()].sort((a, b) => a - b)) {
  for (const f of iRunde.get(runde)) {
    const deltager = f.home === svagest.navn || f.away === svagest.navn;
    if (deltager && foersteFavoritRunde === null) {
      // Er holdet favorit i DENNE kamp, med den rating det har lige nu?
      const o = outcomeOdds({ eloHome: live[f.home], eloAway: live[f.away] });
      const par = [[OUTCOME.HOME, o[OUTCOME.HOME]], [OUTCOME.DRAW, o[OUTCOME.DRAW]],
        [OUTCOME.AWAY, o[OUTCOME.AWAY]]];
      const lavest = Math.min(...par.map(([, v]) => v));
      const delte = par.filter(([, v]) => v === lavest);
      if (delte.length === 1) {
        const favoritHold = delte[0][0] === OUTCOME.HOME ? f.home
          : delte[0][0] === OUTCOME.AWAY ? f.away : null;
        if (favoritHold === svagest.navn) foersteFavoritRunde = runde;
      }
    }
    // Lad det svageste hold vinde; alle andre kampe springes over, så kun
    // holdets egen stime påvirker ratingen.
    if (!deltager) continue;
    const udfald = f.home === svagest.navn ? OUTCOME.HOME : OUTCOME.AWAY;
    const ny = updateElo(live[f.home], live[f.away], actualHomeFromOutcome(udfald));
    live[f.home] = ny.home;
    live[f.away] = ny.away;
    if (foersteFavoritRunde === null) sejre += 1;
  }
}

console.log(`\nDEL 2 — hvor hurtigt kan det vende for ${svagest.navn}, `
  + `spillets svageste hold (start-Elo ${Math.round(elo[svagest.navn])})?`);
if (foersteFavoritRunde === null) {
  console.log(`Selv med sejr i ALLE ${RUNDER} runder bliver holdet aldrig `
    + `favorit inden for spillet. Slut-Elo ville være `
    + `${Math.round(live[svagest.navn])}.`);
} else {
  console.log(`Med sejr i hver kamp er holdet favorit fra runde `
    + `${foersteFavoritRunde} — altså efter ${sejre} sejre i træk. `
    + `Ratingen er da ${Math.round(live[svagest.navn])} mod `
    + `${Math.round(elo[svagest.navn])} ved start.`);
}
console.log('Derfor er "favorit i 0 kampe" en TILSTAND, ikke en egenskab: '
  + 'vagten skjuler et kort, der er tomt lige nu, og kortet kommer af sig '
  + 'selv, når holdet har fortjent det.');
