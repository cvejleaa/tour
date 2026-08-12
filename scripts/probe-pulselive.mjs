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
// men uden Origin/Referer svarer sdp-API'et 403.
const SDP = 'https://sdp-prem-prod.premier-league-prod.pulselive.com/api/v2';
const FOOTBALLAPI = 'https://footballapi.pulselive.com/football';
const HEADERS = {
  Origin: 'https://www.premierleague.com',
  Referer: 'https://www.premierleague.com/',
};

const COMPETITION = Number(process.env.COMPETITION || 8); // sdp: Premier League
const SEASON = Number(process.env.SEASON || 2026);
const LEGACY_COMP = Number(process.env.LEGACY_COMP || 1); // footballapi: Premier League

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

/**
 * Find footballapi's compSeason-id for et sæsons-ÅR. Labels er ikke ens på
 * tværs af årgange ("English Premier League Season 2026/2027" vs "2025/26"),
 * så vi matcher på det FØRSTE årstal i labelen — 2-cifret normaliseres.
 * Provideren skal bruge samme opslag, så id'et aldrig hardcodes i et
 * game-dokument, der overlever sæsonskiftet.
 */
async function compSeasonFor(year) {
  const d = await hent(`${FOOTBALLAPI}/competitions/${LEGACY_COMP}/compseasons?page=0&pageSize=100`);
  const match = (d.content || []).find((c) => {
    const m = String(c.label).match(/\d{4}|\d{2}/);
    if (!m) return false;
    const y = m[0].length === 2 ? 2000 + Number(m[0]) : Number(m[0]);
    return y === year;
  });
  if (!match) throw new Error(`Ingen compSeason for ${year} i: ${(d.content || []).slice(0, 5).map((c) => c.label).join(', ')}`);
  return { id: Math.trunc(match.id), label: match.label, raw: d };
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

// --- standings (footballapi) ------------------------------------------------
const cs = await compSeasonFor(SEASON);
console.log(`\ncompSeason for ${SEASON}: id ${cs.id} ("${cs.label}")`);
const tabel = await hent(`${FOOTBALLAPI}/standings?compSeasons=${cs.id}`);
const entries = tabel.tables?.[0]?.entries || [];
console.log(`tabelrækker : ${entries.length} (gameWeek ${tabel.tables?.[0]?.gameWeek})`);
if (entries.length) {
  const e = entries[0];
  console.log(`række-felter: position=${e.position}, team.name=${e.team?.name}, overall={played:${e.overall?.played}, won:${e.overall?.won}, drawn:${e.overall?.drawn}, lost:${e.overall?.lost}, goalsFor:${e.overall?.goalsFor}, goalsAgainst:${e.overall?.goalsAgainst}, points:${e.overall?.points}}`);
}

skriv('pulselive-compseasons.json', {
  hentet: new Date().toISOString(),
  kilde: `${FOOTBALLAPI}/competitions/${LEGACY_COMP}/compseasons`,
  bemaerk: 'Labels er IKKE ens på tværs af årgange — opslaget matcher på første årstal.',
  content: (cs.raw.content || []).slice(0, 5),
});
skriv('pulselive-standings.json', {
  hentet: new Date().toISOString(),
  kilde: `${FOOTBALLAPI}/standings?compSeasons=${cs.id}`,
  bemaerk: 'Beskåret til 3 rækker — shapen, ikke sæsonen. team.name har samme navneform som sdp-kampene og spillets holdliste.',
  compSeason: { id: cs.id, label: cs.label },
  live: tabel.live,
  gameWeek: tabel.tables?.[0]?.gameWeek,
  entries: entries.slice(0, 3),
});

if (!GEM) console.log('\nTør-kørsel: intet skrevet. Kør med --gem for at skrive fixtures.');
