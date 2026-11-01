// ---------------------------------------------------------------------------
// scripts/probe-ihf.mjs — IHF's sider (ihf.info) SOM FIXTURES.
//
// HVORFOR DEN FINDES. Håndbold-VM 2027 læses af HTML-sider, vi ikke ejer
// (functions-platform/ihfParse.js). «Et tal uden kode er en påstand» — de
// sider, parserens tests bygger på, skal ligge i repoet som rå prøver og kunne
// hentes igen af ét script, ikke af en terminal-historik. Kør scriptet, når
// markuppen mistænkes for at have ændret sig, og se diffen på fixtures-filerne
// — og FØR turneringen, når kickoff-tiderne står på 2027-siderne (planen §6).
//
// BRUG:
//   node scripts/probe-ihf.mjs            # hent, parse og print oversigt; skriv intet
//   node scripts/probe-ihf.mjs --gem      # skriv siderne til functions-platform/testdata/
//
// LÆS-ONLY mod IHF: kun GET. Skriver kun lokale filer, og kun med --gem.
// Siderne gemmes RÅ (ikke beskåret): det er markuppen, der dokumenteres, og en
// beskæring ville skjule netop den ændring, scriptet skal vise.
//
// Hver side køres gennem parseren, inden den gemmes. Kaster parseren, gemmes
// siden IKKE — en fejlside må ikke afløse en ægte fixture i stilhed. Siden
// lægges i stedet i systemets tmp-mappe (med --gem), så den kan læses uden at
// havne i repoet.
//
// Bag en proxy: Node 22's fetch bruger først HTTPS_PROXY med
// NODE_USE_ENV_PROXY=1.
// ---------------------------------------------------------------------------
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseDagside, parseKampside } = require('../functions-platform/ihfParse');

const ROD = join(dirname(fileURLToPath(import.meta.url)), '..');
const UD = join(ROD, 'functions-platform', 'testdata');
const GEM = process.argv.includes('--gem');

const IHF = 'https://www.ihf.info/competitions/men/308';
const VM2027 = `${IHF}/30th-ihf-mens-handball-world-championship-2027-germany/263667`;
const VM2025 = `${IHF}/29th-ihf-mens-world-championship-2025/177649`;
const VM2023 = `${IHF}/28th-ihf-mens-world-championship-2023-polandsweden/101253`;
const VM2021 = `${IHF}/27th-ihf-mens-world-championship-2021-egypt/22415`;

// Hvad hver fixture DÆKKER — samme liste står i toppen af ihfParse.test.js.
const SIDER = [
  { fil: 'ihf-dag-2027-01-13.html', slags: 'dag', url: `${VM2027}/matches/2027-01-13`, daekker: "VM 2027 dag 1: status '', «VS», tider 00:00" },
  { fil: 'ihf-dag-2027-01-29.html', slags: 'dag', url: `${VM2027}/matches/2027-01-29`, daekker: 'VM 2027 semifinaledag: pladsholdere «W QF1»' },
  { fil: 'ihf-dag-2025-02-02.html', slags: 'dag', url: `${VM2025}/matches/2025-02-02`, daekker: 'VM 2025 finaledag: finale 26-32, bronze 35-34' },
  { fil: 'ihf-dag-2023-01-25.html', slags: 'dag', url: `${VM2023}/matches/2023-01-25`, daekker: 'VM 2023 kvartfinaler: dagsidens score er inkl. forlængelse' },
  { fil: 'ihf-dag-2025-01-22.html', slags: 'dag', url: `${VM2025}/matches/2025-01-22`, daekker: "VM 2025 hovedrunde «Main Round IV» og «President's Cup II» samme dag" },
  { fil: 'ihf-kamp-2025-202123.html', slags: 'kamp', url: `${VM2025}/match-center/202123`, daekker: 'bronzekampen 2025: perioder uden forlængelse' },
  { fil: 'ihf-kamp-2023-119085.html', slags: 'kamp', url: `${VM2023}/match-center/119085`, daekker: 'Norge–Spanien 2023: to forlængelser' },
  { fil: 'ihf-kamp-2021-26809.html', slags: 'kamp', url: `${VM2021}/match-center/26809`, daekker: 'Danmark–Egypten 2021: straffekast' },
  { fil: 'ihf-kamp-2027-307515.html', slags: 'kamp', url: `${VM2027}/match-center/307515`, daekker: 'VM 2027, ikke spillet: 0:0 og 00:00' },
];

async function hent(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'tip.vejleaa.dk probe (læs-only)' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.text();
}

function skriv(navn, html) {
  if (!GEM) return;
  mkdirSync(UD, { recursive: true });
  writeFileSync(join(UD, navn), html);
  console.log(`  → skrev ${navn}`);
}

const vis = (s) => (s ? `${s.h}-${s.u}` : '—');

console.log(`\nIHF-PROBE · ${SIDER.length} sider\n`);
let fejl = 0;
for (const side of SIDER) {
  console.log(`${side.fil} — ${side.daekker}`);
  let html;
  try {
    html = await hent(side.url);
  } catch (e) {
    fejl++;
    console.log(`  ✗ hentning: ${e.message}`);
    continue;
  }
  try {
    if (side.slags === 'dag') {
      const kampe = parseDagside(html);
      for (const k of kampe) {
        const tid = k.gmtTid ? `${k.gmtTid} GMT` : 'tid ikke sat';
        const hold = `${k.hjemme}${k.hjemmeId == null ? ' (pladsholder)' : ''} – ${k.ude}${k.udeId == null ? ' (pladsholder)' : ''}`;
        const st = k.status === 'ukendt' ? `ukendt (kode «${k.statusKode}»)` : k.status;
        console.log(`  ${k.ihfId}  ${k.fase}${k.gruppe ? ` · ${k.gruppe}` : ''}  ${hold}  ${st} ${vis(k.slutScore)}  ${tid}`);
      }
    } else {
      // Kampsiden bindes til det id, der blev bedt om (adressens sidste led).
      const k = parseKampside(html, { ihfId: Number(side.url.split('/').pop()) });
      const p = k.perioder;
      const forloeb = p ? `h1 ${vis(p.h1)} h2 ${vis(p.h2)} ot1 ${vis(p.ot1)} ot2 ${vis(p.ot2)} straffe ${vis(p.straffe)}` : 'ingen perioder';
      console.log(`  ${k.ihfId}  ${k.hjemme} – ${k.ude}  ${k.status}  slut ${vis(k.slut)}  efter 60 ${vis(k.efter60)}  `
        + `afgjort ${k.afgjort ?? '—'}  (${forloeb})`);
    }
    skriv(side.fil, html);
  } catch (e) {
    fejl++;
    console.log(`  ✗ parseren afviste siden: ${e.message}`);
    if (GEM) {
      const sti = join(tmpdir(), side.fil.replace(/\.html$/, '.afvist.html'));
      writeFileSync(sti, html);
      console.log(`  → den afviste side ligger i ${sti}`);
    }
  }
}

if (!GEM) console.log('\nTør-kørsel: intet skrevet. Kør med --gem for at skrive fixtures.');
if (fejl) {
  console.log(`\n${fejl} side(r) kunne ikke hentes eller parses — se ✗ ovenfor.`);
  process.exitCode = 1;
}
