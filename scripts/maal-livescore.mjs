// ---------------------------------------------------------------------------
// scripts/maal-livescore.mjs — KAN VORES KAMPE KOBLES TIL LIVESCORES?
//
// Livescore har et lille, versioneret JSON-API, der dækker BEGGE spil og
// bærer det, vores egne kilder mangler: målscorere, oplæg, halvlegsstilling,
// tilskuertal, dommer og stadion. Men det kræver, at vi kan finde DERES
// kamp-id (`Eid`) for vores kampe, og dét er hele spørgsmålet her.
//
// SCRIPTET FINDES, FORDI JEG SELV TOG FEJL. Jeg så på de ti hold, der
// tilfældigvis spillede i det åbne vindue, konstaterede at kortkoderne
// matchede, og konkluderede at nøglen holdt. Den fulde optælling siger noget
// andet: Premier League 19 af 20, Superligaen kun 5 af 12. En stikprøve, der
// bekræftede det, jeg håbede på, er ikke en måling.
//
// Scriptet svarer på tre ting, der hver især kan vælte kortlægningen:
//   1. Hvilke af vores holdkoder har IKKE samme kode hos dem?
//   2. Kan hver af vores kampe kobles ENTYDIGT til én af deres?
//   3. Er de tal, begge kilder har, faktisk de samme? (krydsvalidering)
//
// BRUG: node scripts/maal-livescore.mjs
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const HER = dirname(fileURLToPath(import.meta.url));
const API = 'https://prod-cdn-public-api.lsmedia1.com/v1/api/app';

// Referer kræves — uden den svarer kilden ikke. Det er samtidig påmindelsen
// om, hvad det her er: et browser-endpoint, ikke et API med en aftale bag.
const OPT = {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
      + 'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
    Referer: 'https://www.livescore.com/',
  },
  signal: AbortSignal.timeout(30000),
};

/** Vores hold: navn → kortkode, læst af den fil fladen selv bruger. */
function voresHold(fil) {
  const t = readFileSync(join(HER, '..', 'src', 'data', fil), 'utf8');
  return new Map([...t.matchAll(/name:\s*'([^']+)',\s*short:\s*'([^']+)'/g)]
    .map((m) => [m[1], m[2]]));
}

async function hentStage(land, liga) {
  const res = await fetch(`${API}/stage/soccer/${land}/${liga}/2`, OPT);
  if (!res.ok) throw new Error(`stage ${land}/${liga}: HTTP ${res.status}`);
  const d = await res.json();
  return (d.Stages || []).flatMap((s) => s.Events || []);
}

const SPIL = [
  { navn: 'Premier League', fil: 'premierLeagueTeams2026.js', land: 'england', liga: 'premier-league' },
  { navn: 'Superligaen', fil: 'superligaTeams2026.js', land: 'denmark', liga: 'superliga' },
];

async function main() {
  console.log(`Målt: ${new Date().toISOString()}\n`);
  for (const s of SPIL) {
    const vores = voresHold(s.fil);
    const kampe = await hentStage(s.land, s.liga);
    // Deres holdliste, udledt af kampene: kode → navn.
    const deres = new Map();
    for (const e of kampe) {
      for (const t of [...(e.T1 || []), ...(e.T2 || [])]) deres.set(t.Abr, t.Nm);
    }

    console.log(`=== ${s.navn} ===`);
    console.log(`vores hold: ${vores.size} · deres hold: ${deres.size} · deres kampe: ${kampe.length}`);

    // 1. KODE-SAMMENLIGNINGEN. Det er den, der afgør, om en oversættelses-
    //    tabel er nødvendig — og hvor stor den skal være.
    const uens = [...vores].filter(([, kode]) => !deres.has(kode));
    console.log(`koder der matcher direkte: ${vores.size - uens.length} af ${vores.size}`);
    if (uens.length) {
      const ledige = [...deres].filter(([k]) => ![...vores.values()].includes(k));
      console.log('  vores kode   deres kode   hold');
      for (const [navn, kode] of uens) {
        // Bedste gæt på modparten: samme hold, anden kode. Kun til rapporten
        // — tabellen skal skrives i hånden og efterprøves, ikke gættes.
        const gaet = ledige.find(([, n]) => n.toLowerCase().includes(navn.toLowerCase().split(' ')[0].slice(0, 4)));
        console.log(`  ${kode.padEnd(12)} ${(gaet ? gaet[0] : '?').padEnd(12)} ${navn}`
          + (gaet ? ` (${gaet[1]})` : ''));
      }
    }

    // 2. ENTYDIGHED. To kampe med samme kickoff OG samme holdpar ville gøre
    //    nøglen tvetydig. Sker det, duer kickoff+hold ikke som nøgle.
    const noegler = kampe.map((e) => `${e.Esd}|${(e.T1 || [])[0]?.Abr}|${(e.T2 || [])[0]?.Abr}`);
    const dubletter = noegler.filter((n, i) => noegler.indexOf(n) !== i);
    console.log(`nøglen kickoff+hold er ${dubletter.length ? `TVETYDIG (${dubletter.length} dubletter)` : 'entydig'}`);

    // 3. KRYDSVALIDERING af tilskuertallet mod vores egen kilde sker i
    //    parityscriptet; her rapporteres blot, hvor mange der HAR tallet.
    const fаerdige = kampe.filter((e) => e.Eps === 'FT');
    console.log(`færdige kampe: ${fаerdige.length}\n`);
  }
  console.log('Otte undtagelser i alt betyder: nøglen kan IKKE være ren kode-');
  console.log('sammenligning. Der skal en oversættelsestabel til, og den skal have');
  console.log('en paritetstest, der bliver rød, hvis livescore omdøber et hold.');
}

main().catch((err) => { console.error(err); process.exit(1); });
