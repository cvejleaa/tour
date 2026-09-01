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
  const res = await fetch(`${API}/stage/soccer/${land}/${liga}/0`, OPT);
  if (!res.ok) throw new Error(`stage ${land}/${liga}: HTTP ${res.status}`);
  const d = await res.json();
  return (d.Stages || []).flatMap((s) => s.Events || []);
}

const SPIL = [
  { navn: 'Premier League', fil: 'premierLeagueTeams2026.js', land: 'england', liga: 'premier-league' },
  { navn: 'Superligaen', fil: 'superligaTeams2026.js', land: 'denmark', liga: 'superliga' },
];

/**
 * Findes de felter, hele kildeskiftet er begrundet med — eller er de en
 * påstand? Quality Control fangede, at scriptets egen indledning lovede
 * målscorere, halvleg, tilskuere og dommer, mens koden kun rørte liste-
 * endpointet. Et løfte, ingen kode efterprøver, er præcis den slags, huset
 * har en regel imod.
 *
 * Prøven tages på ÉN færdigspillet kamp pr. spil: er kampen ikke afgjort,
 * findes hverken halvleg eller tilskuertal endnu, og et "manglende" felt
 * ville sige mere om kampens tilstand end om kilden.
 */
async function proevDetaljer(kamp, navn) {
  const id = kamp.Eid;
  const hent = async (sti) => {
    const res = await fetch(`${API}/${sti}/soccer/${id}`, OPT);
    return res.ok ? res.json() : null;
  };
  const [inc, info] = await Promise.all([hent('incidents'), hent('info')]);
  console.log(`  detaljer for Eid ${id} (${kamp.T1?.[0]?.Nm} - ${kamp.T2?.[0]?.Nm}):`);

  const maal = [];
  const kort = [];
  for (const [halvleg, liste] of Object.entries(inc?.Incs || {})) {
    for (const h of liste) {
      // Et mål ligger som en ydre hændelse med scorer og oplægger i en indre
      // liste. Kortene ligger fladt. Det er kildens form, ikke vores.
      if (Array.isArray(h.Incs)) maal.push({ halvleg, min: h.Min, folk: h.Incs.map((x) => x.Pn) });
      else if (h.Pn) kort.push({ halvleg, min: h.Min, navn: h.Pn, kode: h.IT });
    }
  }
  const linjer = [
    ['halvlegsstilling', inc && inc.Trh1 != null ? `${inc.Trh1}-${inc.Trh2}` : null],
    ['slutstilling', inc && inc.Tr1 != null ? `${inc.Tr1}-${inc.Tr2}` : null],
    ['målscorere', maal.length ? maal.map((m) => `${m.min}' ${m.folk.join(' / ')}`).join(' · ') : null],
    ['kort m.m.', kort.length ? kort.map((k) => `${k.min}' ${k.navn} (IT=${k.kode})`).join(' · ') : null],
    ['tilskuertal', info?.Vsp ?? null],
    ['stadion', info?.Vnm ?? null],
    ['dommer', info?.Refs?.[0]?.Nm ?? null],
  ];
  for (const [felt, vaerdi] of linjer) {
    console.log(`    ${felt.padEnd(18)} ${vaerdi == null ? 'MANGLER' : vaerdi}`);
  }
  const mangler = linjer.filter(([, v]) => v == null).map(([f]) => f);
  if (mangler.length) console.log(`    ⚠ ${navn}: ${mangler.length} lovede felter mangler`);
  return mangler.length === 0;
}

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

    // 2. ENTYDIGHED. To kampe med samme DATO og samme holdpar ville gøre
    //    nøglen tvetydig.
    //
    //    NØGLEN BÆRER DATOEN, IKKE KLOKKESLÆTTET, og scriptet måler derfor
    //    dét. Klokkeslættet var med først, og det knækkede i produktion:
    //    FCM-Randers stod hos os til 12:00:00 og hos livescore til 12:05:00,
    //    så kampen kunne ikke kobles. At kræve, at to uafhængige kilder er
    //    enige på sekundet, er ikke en stram nøgle — det er en forkert.
    //
    //    Begge tal printes, så det kan efterprøves, at datoen ikke bare er
    //    løsere, men stadig entydig.
    const dub = (f) => {
      const n = kampe.map(f);
      return n.filter((x, i) => n.indexOf(x) !== i).length;
    };
    const medTid = dub((e) => `${e.Esd}|${(e.T1 || [])[0]?.Abr}|${(e.T2 || [])[0]?.Abr}`);
    const medDato = dub((e) => `${String(e.Esd).slice(0, 8)}|${(e.T1 || [])[0]?.Abr}|${(e.T2 || [])[0]?.Abr}`);
    console.log(`nøglen DATO+hold er ${medDato ? `TVETYDIG (${medDato} dubletter)` : 'entydig'}`
      + `  ·  til sammenligning: kickoff+hold ${medTid ? `${medTid} dubletter` : 'entydig'}`);

    // 3. KRYDSVALIDERING af tilskuertallet mod vores egen kilde sker i
    //    parityscriptet; her rapporteres blot, hvor mange der HAR tallet.
    const faerdige = kampe.filter((e) => e.Eps === 'FT');
    console.log(`færdige kampe: ${faerdige.length}`);
    // Den ÆLDSTE færdige kamp, ikke den nyeste: tilskuertallet halter et
    // døgn eller to efter slutfløjt, så en frisk kamp ville se ud som om
    // kilden manglede feltet.
    if (faerdige.length) await proevDetaljer(faerdige[0], s.navn);
    console.log('');
  }
  console.log('Otte undtagelser i alt betyder: nøglen kan IKKE være ren kode-');
  console.log('sammenligning. Der skal en oversættelsestabel til, og den skal have');
  console.log('en paritetstest, der bliver rød, hvis livescore omdøber et hold.');
}

main().catch((err) => { console.error(err); process.exit(1); });
