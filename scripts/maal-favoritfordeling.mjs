#!/usr/bin/env node
/**
 * maal-favoritfordeling.mjs — hvor mange kampe er hvert hold favorit i?
 *
 * HVORFOR DEN FINDES. `favoritTal` i holdStatistik.js skjuler bankerkortet,
 * når et hold aldrig har været favorit, og begrundelsen i koden er, at det
 * ikke er en kant men normaltilstanden for nogle hold. Den begrundelse er et
 * TAL, og huset kræver kode bag et tal, der begrunder en beslutning.
 *
 * Måler på det seedede kampprogram og de kalibrerede start-ratings — altså
 * FØR nogen kamp er spillet. Det er præcis det rigtige tidspunkt: spørgsmålet
 * er, om et hold overhovedet FÅR en favoritkamp i spillet, ikke hvordan det
 * gik. Ratingen flytter sig undervejs, så tallene er et udgangspunkt, ikke en
 * facitliste — men rækkefølgen i toppen og bunden er robust.
 *
 * Kør:  node scripts/maal-favoritfordeling.mjs [--runder 18]
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PREMIER_LEAGUE_TEAMS_2026 } from '../src/data/premierLeagueTeams2026.js';
import { outcomeOdds, OUTCOME, ELO } from '../src/lib/superligaScoring.js';

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

console.log(`Premier League 2026/27, runde 1-${RUNDER} (${ialt} kampe), `
  + 'favorit udledt af kalibreret start-Elo.\n');
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
console.log('\nDET ER POINTEN: for de hold ville et bankerkort eller et '
  + 'favoritdræber-kort stå med nævner nul hele spillet igennem.');
