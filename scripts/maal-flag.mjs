#!/usr/bin/env node
// ---------------------------------------------------------------------------
// scripts/maal-flag.mjs — MÅLINGEN bag landeflagene. Et tal uden kode er en
// påstand (CLAUDE.md), og flagplanens tal stod indtil nu kun i en plan.
//
//   node scripts/maal-flag.mjs                 bytes pr. flag (råt og gzip)
//   node scripts/maal-flag.mjs --dist dist     + tæl efter et `vite build`
//
// Afsnit 1 måler de 32 flag, holdfilen peger på (src/data/haandboldVm2027Hold.js,
// `iso2`), i node_modules/flag-icons/flags/4x3: hvor tunge de er, og hvor mange
// der ligger under Vites inline-grænse (4096 B) — dem, assetsInlineLimit
// (scripts/lib/assetsInline.mjs) holder ude af hovedbundtet.
//
// Afsnit 2 (med --dist) tæller i buildet: hvor mange flag-filer der ligger
// under assets/ (forventet: 32), og hvor mange data:image/svg+xml der står i
// JS-filerne (forventet: 0). Kør det for begge builds (Tour og platform).
// Exit-koden er 1, hvis buildet afviger, så det kan bruges som tjek.
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { HAANDBOLD_VM2027_HOLD } from '../src/data/haandboldVm2027Hold.js';
import { LANDEFLAG_KODER } from '../src/features/games/football/landeflagKoder.js';

const ROD = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FLAG_DIR = path.join(ROD, 'node_modules', 'flag-icons', 'flags', '4x3');
const INLINE_GRAENSE = 4096; // Vite 5.4 DEFAULT_ASSETS_INLINE_LIMIT

const fmt = (n) => n.toLocaleString('da-DK');

// ── Afsnit 1: flagene selv ──────────────────────────────────────────────
const raekker = HAANDBOLD_VM2027_HOLD.map((t) => {
  const buf = fs.readFileSync(path.join(FLAG_DIR, `${t.iso2}.svg`));
  return { navn: t.name, iso2: t.iso2, raa: buf.length, gzip: zlib.gzipSync(buf, { level: 9 }).length };
}).sort((a, b) => b.raa - a.raa);

console.log('Afsnit 1 — de 32 flag (flag-icons/flags/4x3), tungeste først\n');
console.log('  iso2  hold              råt (B)    gzip (B)');
for (const r of raekker) {
  console.log(`  ${r.iso2.padEnd(4)}  ${r.navn.padEnd(16)} ${fmt(r.raa).padStart(9)}  ${fmt(r.gzip).padStart(9)}`);
}
const sumRaa = raekker.reduce((s, r) => s + r.raa, 0);
const sumGzip = raekker.reduce((s, r) => s + r.gzip, 0);
const underGraense = raekker.filter((r) => r.raa < INLINE_GRAENSE).length;
console.log(`\n  i alt: ${fmt(sumRaa)} B råt, ${fmt(sumGzip)} B gzip (hver fil for sig)`);
console.log(`  under Vites inline-grænse (${INLINE_GRAENSE} B): ${underGraense} af ${raekker.length}`);

const iso = new Set(HAANDBOLD_VM2027_HOLD.map((t) => t.iso2));
const bundt = new Set(LANDEFLAG_KODER);
const ens = iso.size === bundt.size && [...iso].every((k) => bundt.has(k));
console.log(`  holdfilens iso2 = bundtets koder: ${ens ? 'ja' : 'NEJ'}`);

// ── Afsnit 2: buildet ───────────────────────────────────────────────────
const i = process.argv.indexOf('--dist');
if (i > 0) {
  const dist = path.resolve(process.argv[i + 1] || 'dist');
  const assets = path.join(dist, 'assets');
  const filer = fs.readdirSync(assets);
  const flagFiler = filer.filter((f) => /^[a-z]{2}-[A-Za-z0-9_-]+\.svg$/.test(f)
    && bundt.has(f.slice(0, 2)));
  const js = filer.filter((f) => f.endsWith('.js'));
  let dataUri = 0;
  for (const f of js) {
    const m = fs.readFileSync(path.join(assets, f), 'utf8').match(/data:image\/svg\+xml/g);
    dataUri += m ? m.length : 0;
  }
  console.log(`\nAfsnit 2 — buildet i ${path.relative(ROD, dist) || dist}`);
  console.log(`  flag-filer under assets/       : ${flagFiler.length} (forventet ${bundt.size})`);
  console.log(`  data:image/svg+xml i JS-filerne: ${dataUri} (forventet 0)`);
  const licens = fs.existsSync(path.join(dist, 'licenser.txt'));
  console.log(`  licenser.txt med i buildet     : ${licens ? 'ja' : 'NEJ'}`);
  if (flagFiler.length !== bundt.size || dataUri !== 0 || !licens) process.exitCode = 1;
}
if (!ens) process.exitCode = 1;
