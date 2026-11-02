// ---------------------------------------------------------------------------
// scripts/haandbold-historik.mjs — færdige kampe fra herre-VM 2019-2025 og
// EM 2020-2026 (Wikipedia) → scripts/haandbold-historik.json, måledata til D4
// (håndboldprofilen: Elo-K, uafgjort-model, startstyrker).
//
// HVAD DEN GØR: henter hver turneringsside ÉN gang via MediaWiki API'et
// (scripts/lib/wikiHent.mjs: beskrivende User-Agent, mindst 1 s mellem kald)
// og gemmer svaret i en lokal cache-mappe. Næste kørsel læser cachen og
// sender intet kald. Reglerne for, hvad en kamp er, står i
// scripts/lib/haandboldHistorik.mjs.
//
// HVAD DEN IKKE GØR: skriver intet i databasen og intet uden --skriv. Den
// henter ALDRIG en side, der ligger i cachen — skal en side hentes igen
// (fx fordi en kamp er rettet på Wikipedia), så slet dens fil i cachen.
//
// ALT ELLER INTET. Fejler én side (hentning eller strukturvagt), skrives der
// intet. En måling på 7 af 8 turneringer, der ligner en måling på 8, er
// netop den tavse fejl, vi ikke vil have. Vil man bevidst måle på færre, så
// sig det med --turneringer, og outputtet siger det samme.
//
// ROBOTS.TXT: se scripts/haandbold-program.mjs (manuelt, lav volumen, API'et).
//
// BRUG:
//   node scripts/haandbold-historik.mjs                       # alle 8, vis; skriv intet
//   node scripts/haandbold-historik.mjs --skriv               # skriv scripts/haandbold-historik.json
//   node scripts/haandbold-historik.mjs --turneringer vm2025,em2026
//   node scripts/haandbold-historik.mjs --cache /sti/til/mappe   # standard: <tmp>/vejleaa-wiki
//
// Bag en proxy: Node 22's fetch bruger først HTTPS_PROXY med NODE_USE_ENV_PROXY=1.
// ---------------------------------------------------------------------------

import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { lavWikiHenter, parseScriptArgs } from './lib/wikiHent.mjs';
import { TURNERINGER, udtraekKampe, resume } from './lib/haandboldHistorik.mjs';
import { wikiSideUrl } from './lib/haandboldProgram.mjs';

const ROD = join(dirname(fileURLToPath(import.meta.url)), '..');
const UD = join(ROD, 'scripts', 'haandbold-historik.json');

async function main() {
  const args = parseScriptArgs(process.argv.slice(2), { vaerdier: ['turneringer', 'cache'], flag: ['skriv'] });
  let valgte = TURNERINGER;
  if (args.turneringer) {
    const ønskede = args.turneringer.split(',').map((s) => s.trim()).filter(Boolean);
    const ukendte = ønskede.filter((n) => !TURNERINGER.some((t) => t.noegle === n));
    if (ukendte.length) throw new Error(`ukendte turneringer: ${ukendte.join(', ')}. Kendte: ${TURNERINGER.map((t) => t.noegle).join(', ')}`);
    valgte = TURNERINGER.filter((t) => ønskede.includes(t.noegle));
  }
  const cacheDir = resolve(process.cwd(), args.cache || join(tmpdir(), 'vejleaa-wiki'));
  console.log(`Cache: ${cacheDir}\n`);
  const hent = lavWikiHenter({ cacheDir, log: console.log });

  const kilder = [];
  const kampe = [];
  for (const t of valgte) {
    const side = await hent(t.titel);
    const r = udtraekKampe(side.wikitekst, t.noegle);
    const res = resume(r.kampe);
    console.log(`${t.noegle}: ${res.kampe} spillede · ${res.uafgjortEfter60} uafgjort efter 60 min · `
      + `${res.forlaenget} forlænget · ${res.straffe} straffekast · ${res.maalPrKamp60} mål/kamp`
      + `${r.ikkeSpillet ? ` · ${r.ikkeSpillet} uden score` : ''}`);
    for (const a of r.afviste) console.log(`   ⚠️  AFVIST ${a.sektion} nr. ${a.nr}: ${a.grund}`);
    if (Object.keys(r.ukendteFelter).length) console.log(`   (ukendte felter, ikke resultat-lignende: ${Object.entries(r.ukendteFelter).map(([k, n]) => `${k}×${n}`).join(', ')})`);
    kilder.push({
      noegle: t.noegle,
      side: side.titel,
      url: wikiSideUrl(side.titel),
      revid: side.revid,
      hentet: side.hentet,
      licens: 'CC BY-SA 4.0',
      ...res,
      ikkeSpillet: r.ikkeSpillet,
      afviste: r.afviste,
    });
    kampe.push(...r.kampe);
  }

  const afviste = kilder.reduce((s, k) => s + k.afviste.length, 0);
  console.log(`\nI alt ${kampe.length} kampe fra ${kilder.length} turneringer${afviste ? ` · ${afviste} AFVIST (se ovenfor)` : ''}.`);
  if (!args.flag.has('skriv')) {
    console.log('Tør-kørsel — intet skrevet. Kør med --skriv for at skrive scripts/haandbold-historik.json.\n');
    return;
  }
  const fil = {
    _note: `Færdige kampe fra ${kilder.map((k) => k.noegle).join(', ')} (herrer), bygget af scripts/haandbold-historik.mjs fra Wikipedia; `
      + 'indholdet er CC BY-SA 4.0 (kilder med revision nedenfor). efter60 = stillingen efter ordinær tid (det, der tippes på); '
      + 'slut = inkl. forlængelse/straffekast; afgjort = null | forlaenget | straffe. Holdene er Wikipedias koder. '
      + 'Afviste kampe står under kilder[].afviste med grund. RET ALDRIG I HÅNDEN: kør scriptet igen.',
    turneringer: kilder.map((k) => k.noegle),
    kilder,
    kampe,
  };
  writeFileSync(UD, `${JSON.stringify(fil, null, 0).replace(/\},\{"turnering"/g, '},\n{"turnering"')}\n`);
  console.log(`✅ skrev ${UD}\n`);
}

main().catch((e) => { console.error(`\n⚠️  ${e.message}\n   Intet er skrevet.\n`); process.exit(1); });
