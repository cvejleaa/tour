// ---------------------------------------------------------------------------
// scripts/haandbold-gruppeorakel.mjs — IHF's færdige gruppetabeller (VM 2021,
// 2023, 2025) → scripts/testdata/ihf-gruppestillinger.json, oraklet for
// gruppeStilling (src/lib/grupper.js; testen src/lib/grupper.orakel.test.js).
//
// HVAD DEN GØR: læser GEMTE sider (rå wikitekst, én fil pr. VM, navngivet
// efter turneringen: vm2021.wikitext …) og den committede
// scripts/haandbold-historik.json. Regler: scripts/lib/haandboldGruppeOrakel.mjs.
// Siderne er de samme filer, historikken er bygget af (--filer-vejen i
// scripts/haandbold-historik.mjs), så tabeller og kampe stammer fra samme
// revision. Kilden får filens sha256, så det kan efterprøves.
//
// HVAD DEN IKKE GØR: henter intet, skriver intet i databasen, og skriver ikke
// uden --skriv. Den ændrer ALDRIG haandbold-historik.json (Elo-målingens
// grundlag skal være byte-uændret).
//
// BRUG:
//   node scripts/haandbold-gruppeorakel.mjs /sti/vm2021.wikitext /sti/vm2023.wikitext /sti/vm2025.wikitext
//   node scripts/haandbold-gruppeorakel.mjs … --skriv            # skriv JSON-filen
//   node scripts/haandbold-gruppeorakel.mjs … --skriv --ud /tmp/x.json
//
// Indholdet er CC BY-SA 4.0 (Wikipedia), som historikken.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseScriptArgs } from './lib/wikiHent.mjs';
import { byggOrakel } from './lib/haandboldGruppeOrakel.mjs';
import { TURNERINGER } from './lib/haandboldHistorik.mjs';
import { wikiSideUrl } from './lib/haandboldProgram.mjs';

const ROD = join(dirname(fileURLToPath(import.meta.url)), '..');
const UD = join(ROD, 'scripts', 'testdata', 'ihf-gruppestillinger.json');
const HISTORIK = join(ROD, 'scripts', 'haandbold-historik.json');

function main() {
  // Siderne er positionsargumenter; resten går gennem husets parser.
  const argv = process.argv.slice(2);
  const filer = [];
  const flagArgs = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--ud') { flagArgs.push(argv[i], argv[i + 1]); i += 1; } else if (argv[i].startsWith('--')) flagArgs.push(argv[i]);
    else filer.push(argv[i]);
  }
  const args = parseScriptArgs(flagArgs, { vaerdier: ['ud'], flag: ['skriv'] });
  if (!filer.length) throw new Error('Giv siderne som argumenter: vm2021.wikitext vm2023.wikitext vm2025.wikitext');
  const historik = JSON.parse(readFileSync(HISTORIK, 'utf8'));
  const sider = filer.map((f) => {
    const sti = resolve(process.cwd(), f);
    const turnering = basename(sti).replace(/\.wikitext$/, '');
    const t = TURNERINGER.find((x) => x.noegle === turnering);
    if (!t) throw new Error(`«${basename(sti)}» hedder ikke som en turnering i historikken (vm2021.wikitext …).`);
    const raa = readFileSync(sti);
    return {
      turnering,
      wikitekst: raa.toString('utf8'),
      kilde: {
        noegle: turnering, side: t.titel, url: wikiSideUrl(t.titel), fil: basename(sti),
        sha256: createHash('sha256').update(raa).digest('hex'), hentet: statSync(sti).mtime.toISOString(),
        licens: 'CC BY-SA 4.0',
      },
    };
  });
  const { tabeller, udeladt, kilder } = byggOrakel(sider, historik.kampe);
  const ud = {
    _note: 'IHF\'s slutrækkefølge (team_order) og tabeltal for hver FÆRDIG tabel i den indledende runde og hovedrunden, '
      + 'kun VM. Holdkoderne er historikkens (scripts/haandbold-historik.json). Tabeller, hvis tal ikke kan regnes af '
      + 'historikkens kampe (aflyste kampe), står under udeladt med grunden. Bygget af scripts/haandbold-gruppeorakel.mjs; '
      + 'RET ALDRIG I HÅNDEN.',
    kilder,
    tabeller,
    udeladt,
  };
  console.log(`${tabeller.length} tabeller (${tabeller.filter((t) => t.fase === 'indledende').length} indledende, `
    + `${tabeller.filter((t) => t.fase === 'hoved').length} hovedrunde), ${udeladt.length} udeladt:`);
  for (const u of udeladt) console.log(`  - ${u.turnering} ${u.sektion}: ${u.grund}`);
  if (args.flag.has('skriv')) {
    const sti = args.ud ? resolve(process.cwd(), args.ud) : UD;
    writeFileSync(sti, `${JSON.stringify(ud, null, 2)}\n`);
    console.log(`Skrevet: ${sti}`);
  } else {
    console.log('(tør-kørsel — intet skrevet; brug --skriv)');
  }
}

try {
  main();
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
