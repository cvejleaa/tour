// ---------------------------------------------------------------------------
// scripts/probe-pulselive.mjs — dokumentér pulselives datashapes SOM FIXTURES.
//
// HVORFOR DEN FINDES. PL-synken (functions-platform/syncProviders.js) parser
// to API'er, vi ikke ejer: sdp-prem-prod (kampe/facit/kickoff) og det ældre
// footballapi (standings). "Et tal uden kode er en påstand" — shapen, testene
// bygger på, skal ligge i repoet som rå prøver, ikke i en terminal-historik.
// Kør scriptet igen, når API'et mistænkes for at have ændret sig, og se
// diffen på fixtures-filerne.
//
// BRUG:
//   node scripts/probe-pulselive.mjs            # print oversigt, skriv intet
//   node scripts/probe-pulselive.mjs --gem      # skriv fixtures til
//                                               # functions-platform/testdata/
//
// Prøverne beskæres (få kampe pr. tilstand, 3 tabelrækker), så diffs er til at
// læse — det er SHAPEN, der dokumenteres, ikke sæsonen.
// ---------------------------------------------------------------------------
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROD = join(dirname(fileURLToPath(import.meta.url)), '..');
const UD = join(ROD, 'functions-platform', 'testdata');
const GEM = process.argv.includes('--gem');

// Samme kilder og headere som seed-data og maal-uafgjort.mjs. Ingen nøgle —
// men uden Origin/Referer svarer sdp-API'et 403. Standings ligger på v5 af
// SAMME API — det endpoint, premierleague.com selv bruger (fra HAR-optagelsen
// docs/PL_tabel.har).
const SDP_API = 'https://sdp-prem-prod.premier-league-prod.pulselive.com/api';
const SDP = `${SDP_API}/v2`;
const HEADERS = {
  Origin: 'https://www.premierleague.com',
  Referer: 'https://www.premierleague.com/',
};

const COMPETITION = Number(process.env.COMPETITION || 8); // Premier League
const SEASON = Number(process.env.SEASON || 2026);

async function hent(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

/** Alle kampe i en sæson via _next-paginering. */
async function alleKampe(season) {
  const kampe = [];
  let next = '';
  do {
    const url = `${SDP}/matches?competition=${COMPETITION}&season=${season}&_limit=100${next ? `&_next=${next}` : ''}`;
    const side = await hent(url);
    kampe.push(...(side.data || []));
    next = side.pagination?._next || '';
  } while (next);
  return kampe;
}

function skriv(navn, data) {
  if (!GEM) return;
  mkdirSync(UD, { recursive: true });
  writeFileSync(join(UD, navn), `${JSON.stringify(data, null, 2)}\n`);
  console.log(`  → skrev ${navn}`);
}

// --- kampe: én prøve pr. observeret period-tilstand -------------------------
console.log(`\nPULSELIVE-PROBE · competition ${COMPETITION}, sæson ${SEASON}\n`);

const nu = await alleKampe(SEASON);
const perioder = new Map();
for (const m of nu) {
  if (!perioder.has(m.period)) perioder.set(m.period, []);
  if (perioder.get(m.period).length < 2) perioder.get(m.period).push(m);
}
console.log(`kampe i alt : ${nu.length}`);
console.log(`period-værdier set i sæson ${SEASON}: ${[...perioder.keys()].join(', ')}`);
console.log(`matchWeek-spænd: ${Math.min(...nu.map((m) => m.matchWeek))}–${Math.max(...nu.map((m) => m.matchWeek))}`);

// FullTime-shapen findes endnu ikke i en ny sæson — dokumentér den fra den
// forrige, samme API, samme felter. Live-tilstandene (FirstHalf/…) kan først
// observeres under en igangværende kamp; probes igen på en kampdag, og de
// lander som en NY fil, testene så kan tage i brug.
const forrige = await alleKampe(SEASON - 1);
for (const m of forrige) {
  if (!perioder.has(m.period)) perioder.set(m.period, []);
  if (perioder.get(m.period).length < 2) perioder.get(m.period).push(m);
}
console.log(`period-værdier inkl. sæson ${SEASON - 1}: ${[...perioder.keys()].join(', ')}`);

skriv('pulselive-matches.json', {
  hentet: new Date().toISOString(),
  kilde: `${SDP}/matches?competition=${COMPETITION}&season=…`,
  bemaerk: 'Én-to RÅ kampe pr. observeret period-værdi. kickoff er tidszone-løs; kickoffTimezoneString angiver zonen (Europe/London — BST om sommeren, GMT om vinteren).',
  perPeriod: Object.fromEntries(perioder),
});

// --- standings (v5 — sitets eget endpoint) ----------------------------------
const tabel = await hent(`${SDP_API}/v5/competitions/${COMPETITION}/seasons/${SEASON}/standings?live=false`);
const entries = tabel.tables?.[0]?.entries || [];
console.log(`\ntabelrækker : ${entries.length} (matchweek ${tabel.matchweek})`);
if (entries.length) {
  const e = entries[0];
  console.log(`række-felter: overall.position=${e.overall?.position}, team.name=${e.team?.name}, abbr=${e.team?.abbr}, overall={played:${e.overall?.played}, won:${e.overall?.won}, drawn:${e.overall?.drawn}, lost:${e.overall?.lost}, goalsFor:${e.overall?.goalsFor}, goalsAgainst:${e.overall?.goalsAgainst}, points:${e.overall?.points}}`);
}

skriv('pulselive-standings.json', {
  hentet: new Date().toISOString(),
  kilde: `${SDP_API}/v5/competitions/${COMPETITION}/seasons/${SEASON}/standings?live=false`,
  bemaerk: 'Beskåret til 3 rækker — shapen, ikke sæsonen. RÆKKERNE KOMMER USORTERET (alfabetisk, ikke efter position) — sorteringen er providerens ansvar. team.name har samme navneform som sdp-kampene og spillets holdliste.',
  matchweek: tabel.matchweek,
  entries: entries.slice(0, 3),
});

if (!GEM) console.log('\nTør-kørsel: intet skrevet. Kør med --gem for at skrive fixtures.');
