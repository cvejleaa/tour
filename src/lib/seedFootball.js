// ---------------------------------------------------------------------------
// Beslutningerne bag seed-football — uden Firebase, så de kan testes.
//
// Scriptet selv læser filer og skriver i databasen. Det, der kan gå galt, er
// ikke skrivningen men VALGET af hvad der skal skrives: én kamp for meget, og
// et sæt frosne odds bliver overskrevet under en spiller, der allerede har
// tippet og fået point.
// ---------------------------------------------------------------------------

// Endelsen SKAL med: modulet importeres af scripts/seed-football.mjs under bar
// Node, hvor der ikke er nogen bundler til at gætte den. Uden .js virker det i
// vitest og fejler først, når scriptet køres i en udrulning.
import { matchId } from './superligaSeed.js';

/**
 * Dokument-id'et for en kamp — SAMME regel som `buildMatch` bruger, når den
 * skriver dokumentet: `fx.id` hvis den har et, ellers runde+hold.
 *
 * Det er ikke en bekvemmelighed, men den eneste måde at genfinde kampen på.
 * Premier League-programmet har id'er fra pulselive; Superligaens
 * `superliga-fixtures.json` har INGEN. Slog vi kun op på `fx.id`, ville hvert
 * eneste opslag for Superligaen ramme `undefined` — og så ville både
 * odds-beskyttelsen i `seedPlan` og "findes den i forvejen"-tjekket i
 * `kickoffPlan` stå og se rigtige ud uden at beskytte en eneste kamp.
 */
export function docId(fx) {
  if (fx?.id) return String(fx.id);
  if (fx?.round == null || !fx?.home || !fx?.away) {
    throw new Error('kampen mangler både id og runde+hold — den kan ikke genfindes');
  }
  return matchId(fx);
}

/**
 * "1-18" → { fra: 1, til: 18 }. Tom/udeladt → null (alle runder).
 * @throws hvis formen er forkert, eller intervallet vender bagvendt.
 */
export function parseRunder(spec) {
  if (spec == null || spec === '') return null;
  const m = /^(\d+)\s*-\s*(\d+)$/.exec(String(spec).trim());
  if (!m) throw new Error(`--runder skal være fx "1-18", ikke "${spec}"`);
  const fra = Number(m[1]);
  const til = Number(m[2]);
  if (fra > til) throw new Error(`--runder: ${fra} er større end ${til}`);
  return { fra, til };
}

/** Kampe i et runde-interval. Uden interval: alle. */
export function iInterval(fixtures, interval) {
  if (!interval) return [...(fixtures || [])];
  return (fixtures || []).filter((f) => f.round >= interval.fra && f.round <= interval.til);
}

/**
 * Hvilke kickoff-tider skal ændres?
 *
 * Tre ting springes over, og hver af dem er der en grund til:
 *  - kampen findes ikke i databasen → den skal seedes, ikke tid-rettes
 *  - kampen har et RESULTAT → tidspunktet er historie, ikke en deadline
 *  - tidspunktet er uændret → spar skrivningen
 *
 * @param {Array<{id:string, kickoff:string}>} fixtures
 * @param {Map<string, {result?:*, kickoffMs?:number|null}>} nuvaerende
 * @returns {{aendringer: Array<{id:string, fraMs:number|null, tilMs:number|null}>, sprunget:number}}
 */
export function kickoffPlan(fixtures, nuvaerende) {
  const aendringer = [];
  let sprunget = 0;
  for (const fx of fixtures || []) {
    const id = docId(fx);
    const nu = nuvaerende?.get?.(id);
    if (!nu) { sprunget += 1; continue; }
    if (nu.result) { sprunget += 1; continue; }
    const tilMs = fx.kickoff ? new Date(fx.kickoff).getTime() : null;
    const fraMs = nu.kickoffMs ?? null;
    if (tilMs === fraMs) continue;
    aendringer.push({ id, fraMs, tilMs });
  }
  return { aendringer, sprunget };
}

/**
 * Hvilke kampe skal seedes?
 *
 * En kamp, der ALLEREDE har odds, springes over. Det var fælden i det gamle
 * script: det skrev odds ubetinget med merge, så en gen-kørsel midt i sæsonen
 * ville have overskrevet de frosne odds på kampe, folk havde tippet og fået
 * point for. Skal odds genberegnes, gør `recomputeSeasonElo` det — og kun på
 * kampe, der ikke er låst endnu.
 *
 * @param {Array<{id:string}>} fixtures
 * @param {Map<string, {odds?:object}>} nuvaerende
 * @returns {{skriv: Array<object>, springOver: Array<string>}}
 */
export function seedPlan(fixtures, nuvaerende) {
  const skriv = [];
  const springOver = [];
  for (const fx of fixtures || []) {
    const id = docId(fx);
    if (nuvaerende?.get?.(id)?.odds) springOver.push(id);
    else skriv.push(fx);
  }
  return { skriv, springOver };
}

/**
 * Hold, hvis navn ikke findes i holdlisten. Dem giver `teamElo` tavst 1500,
 * så hele klubben ville få odds som et midterhold uden en eneste fejlbesked.
 * @returns {string[]} navne, sorteret og uden dubletter
 */
export function ukendteHold(fixtures, teams) {
  const kendte = new Set((teams || []).map((t) => t?.name));
  const ukendte = new Set();
  for (const f of fixtures || []) {
    if (f?.home && !kendte.has(f.home)) ukendte.add(f.home);
    if (f?.away && !kendte.has(f.away)) ukendte.add(f.away);
  }
  return [...ukendte].sort();
}
