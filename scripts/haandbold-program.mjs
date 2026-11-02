// ---------------------------------------------------------------------------
// scripts/haandbold-program.mjs — VM 2027-programmet fra Wikipedia.
//
// HVAD DEN GØR: henter siden «2027 World Men's Handball Championship» (ét kald
// til MediaWiki API'et, se scripts/lib/wikiHent.mjs for etiketten) eller læser
// en gemt kopi, og bygger
//   - den indledende runde (48 kampe) i seed-football-formen:
//     {id, round, home, away, kickoff (UTC), gruppe}
//   - fasekalenderen til `game.faser` (D6 lægger den i scripts/games.mjs).
// Regler og vagter: scripts/lib/haandboldProgram.mjs.
//
// HVAD DEN IKKE GØR: skriver intet i databasen. Ingen Firebase, ingen nøgle.
// Seedet er seed-football.mjs med denne fil som --fixtures (D6, med
// tør-kørsel og ejerens ja). Hovedrunde og knockout har pladsholdere (A1,
// WQF1 …) og oprettes ikke herfra, men af D9, når holdene kendes.
//
// ROBOTS.TXT. en.wikipedia.org har `Disallow: /w/`. Den regel gælder crawlere;
// dette er ét manuelt startet kald til API'et under /w/, som Wikimedia selv
// anviser programmer til, med en beskrivende User-Agent og mindst ét sekund
// mellem kald (https://www.mediawiki.org/wiki/API:Etiquette). Security
// vurderer det (planen §13-tillæg).
//
// BRUG:
//   node scripts/haandbold-program.mjs                     # hent og vis; skriv intet
//   node scripts/haandbold-program.mjs --fil side.wikitext # læs en gemt kopi
//   node scripts/haandbold-program.mjs --skriv             # skriv programmet + fixture
//
//   --skriv skriver to filer i repoet:
//     scripts/haandbold-vm2027-program.json          (programmet og faserne)
//     scripts/testdata/wiki-vm2027.wikitext          (siden, beskåret til kampene)
//   Testen (scripts/lib/haandboldProgram.test.mjs) bygger programmet af
//   fixturen og kræver, at det er IDENTISK med JSON-filen. Ret aldrig i den
//   ene alene; kør scriptet.
//
// Bag en proxy: Node 22's fetch bruger først HTTPS_PROXY med NODE_USE_ENV_PROXY=1.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lavWikiHenter, parseScriptArgs, laesGemtSide } from './lib/wikiHent.mjs';
import { beskaarTilKampe } from './lib/wikiHandball.mjs';
import { byggProgram, programFil } from './lib/haandboldProgram.mjs';

const ROD = join(dirname(fileURLToPath(import.meta.url)), '..');
const SIDE = "2027 World Men's Handball Championship";
const UD_PROGRAM = join(ROD, 'scripts', 'haandbold-vm2027-program.json');
const UD_FIXTURE = join(ROD, 'scripts', 'testdata', 'wiki-vm2027.wikitext');

async function main() {
  const args = parseScriptArgs(process.argv.slice(2), { vaerdier: ['fil'], flag: ['skriv'] });

  let side;
  if (args.fil) {
    const sti = resolve(process.cwd(), args.fil);
    side = laesGemtSide(readFileSync(sti, 'utf8'), basename(sti));
    // En rå kopi har ingen hentetid; filens tid er det bedste, vi har — og det
    // står i kilden som det, det er.
    side.hentet ??= statSync(sti).mtime.toISOString();
    side.titel ??= SIDE;
    console.log(`Læser ${sti}`);
  } else {
    // Ingen cache: programmet hentes for at se, om det har ÆNDRET sig.
    side = await lavWikiHenter({ log: console.log, nodvej: '--fil <gemt side>' })(SIDE);
  }

  const beskaaret = beskaarTilKampe(side.wikitekst);
  const p = byggProgram(beskaaret);
  const fil = programFil(p, { titel: side.titel, revid: side.revid, hentet: side.hentet });

  console.log(`\n${fil.fixtures.length} kampe i den indledende runde · ${fil.faser.length} faser`);
  for (const f of fil.faser) {
    console.log(`  ${f.navn.padEnd(17)} runde ${String(f.fra).padStart(2)}-${String(f.til).padEnd(2)} fra ${f.start}  ${f.antalKampe} kampe${f.knockout ? ' · knockout' : ''}`);
  }
  const vis = (iso) => new Intl.DateTimeFormat('da-DK', {
    timeZone: 'Europe/Copenhagen', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
  console.log('\nKampene (dansk tid):');
  for (const k of fil.fixtures) console.log(`  R${String(k.round).padEnd(2)} ${vis(k.kickoff)}  ${k.gruppe}  ${k.home} – ${k.away}`);
  if (p.usikreTider.length) {
    console.log(`\n⚠️  ${p.usikreTider.length} kampe har et tidsVINDUE på siden, ikke ét tidspunkt:`);
    for (const l of p.usikreTider) console.log(`   ${l}`);
    console.log('   Ret dem med seed-football --kickoffs-only, når tiden ligger fast.');
  }
  if (p.advarsler.length) {
    console.log(`\n⚠️  ${p.advarsler.length} advarsler om fravalgte kampe (de er ikke med, men formen på siden har ændret sig):`);
    for (const l of p.advarsler) console.log(`   ${l}`);
  }

  if (!args.flag.has('skriv')) {
    console.log('\nTør-kørsel — intet skrevet. Kør med --skriv for at skrive programmet og fixturen.\n');
    return;
  }
  writeFileSync(UD_PROGRAM, `${JSON.stringify(fil, null, 1)}\n`);
  mkdirSync(dirname(UD_FIXTURE), { recursive: true });
  // Kildeangivelsen står i en kommentar øverst; parseren fjerner kommentarer,
  // så den ændrer ikke, hvad testen læser.
  const hoved = `<!-- Fixture til scripts/lib/haandboldProgram.test.mjs. Kilde: Wikipedia, «${fil.kilde.side}» `
    + `(${fil.kilde.url}), revision ${fil.kilde.revid ?? 'ukendt'}, hentet ${fil.kilde.hentet ?? 'ukendt'}. `
    + 'Indholdet er CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/). '
    + 'Beskåret til kampene af scripts/haandbold-program.mjs --skriv; ret aldrig i hånden. -->\n';
  writeFileSync(UD_FIXTURE, hoved + beskaaret);
  console.log(`\n✅ skrev ${UD_PROGRAM}\n✅ skrev ${UD_FIXTURE}\n`);
}

main().catch((e) => { console.error(`\n⚠️  ${e.message}\n`); process.exit(1); });
