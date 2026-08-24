#!/usr/bin/env node
// ---------------------------------------------------------------------------
// scripts/roller.mjs — hvilke roller skal køre på DENNE ændring?
//
// Kør den, før du starter rollerne, og klistr udskriften ind i PR-teksten.
// Så bærer PR'en selv beviset for, hvilke roller der skulle køre — og ejeren
// kan efterprøve bagefter, om de gjorde det. Beslutningen bor i
// scripts/lib/roller.mjs, hvor den er testet.
//
//   node scripts/roller.mjs                # mod origin/main
//   node scripts/roller.mjs origin/main    # mod en anden base
// ---------------------------------------------------------------------------
import { execSync } from 'child_process';
import { paakraevedeRoller, formatér } from './lib/roller.mjs';

const base = process.argv[2] || 'origin/main';
let filer = [];
try {
  const ud = execSync(`git diff --name-only ${base}...HEAD`, { encoding: 'utf8' });
  const uncommitted = execSync('git diff --name-only HEAD', { encoding: 'utf8' });
  // USPOREDE FILER SKAL MED. `git diff` kan ikke se en fil, der aldrig er
  // staged — så en helt NY fil ville ikke tælle med i sin egen vurdering.
  // Fundet ved at køre scriptet på sig selv: det overså sit eget modul.
  // Præcis "korrekt er ikke komplet": udregningen var rigtig, inputtet var
  // ufuldstændigt.
  const nye = execSync('git ls-files --others --exclude-standard', { encoding: 'utf8' });
  filer = [...new Set([
    ...ud.split('\n'), ...uncommitted.split('\n'), ...nye.split('\n'),
  ])].filter(Boolean);
} catch (err) {
  console.error(`\n⚠️  Kunne ikke læse diffen mod ${base}: ${err.message}\n`);
  process.exit(1);
}

console.log(`\nÆndrede filer mod ${base}: ${filer.length}`);
const plan = paakraevedeRoller(filer);
console.log(`\n${formatér(plan)}\n`);
// En tom diff er en FEJL, ikke et frikort — ellers ville en forkert
// base-branch tavst afmelde hele gennemgangen.
if (!filer.length) process.exit(1);
