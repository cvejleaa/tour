// ---------------------------------------------------------------------------
// scripts/compute-superliga-elo.mjs — beregner Elo-startværdier for Superligaen
// 2026/27 ud fra HISTORISKE resultater (de seneste sæsoner).
//
// Kilde: api.superliga.dk/events-v2?seasonId=<id> (samme API som program/facit).
// Hent sæsonerne først (kræver proxy for udgående HTTPS), fx:
//   for S in 20962 23624 27018; do
//     curl -s "https://api.superliga.dk/events-v2?appName=dk.releaze.livecenter.spdk\
//&access_token=5b6ab6f5eb84c60031bbbd24&env=production&locale=da&seasonId=$S" \
//       -o /tmp/season_$S.json
//   done
// Seneste 3 sæsoner: 2023/24=20962, 2024/25=23624, 2025/26=27018 (ældst→nyest).
//
// BRUG: node scripts/compute-superliga-elo.mjs /tmp/season_20962.json /tmp/season_23624.json /tmp/season_27018.json
//
// Metode: alle hold starter i 1500; kampene køres kronologisk gennem
// updateElo (samme K/HFA som spillet). Mellem sæsoner trækkes ratings 25 % mod
// middel (1500), så én dominans-sæson ikke hænger ved for evigt. Slutværdien
// er startværdien for 2026/27.
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs';
import { updateElo, actualHomeFromOutcome, outcomeFromScore, ELO } from '../src/lib/superligaScoring.js';

const MEAN = 1500;
const CARRY = 0.75; // behold 75 % af afvigelsen fra middel mellem sæsoner

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Angiv sæson-JSON-filer (ældst først). Se header for curl-kommandoer.');
  process.exit(1);
}

// Kanoniser holdnavne, der staves forskelligt mellem sæsoner, til 2026/27-navnet.
const CANON = { Viborg: 'Viborg FF' };
const canon = (n) => CANON[n] || n;

const elo = new Map(); // holdnavn -> rating
const get = (n) => (elo.has(n) ? elo.get(n) : MEAN);

/**
 * Mål som TAL — uanset om API'et sender 1 eller "1".
 *
 * api.superliga.dk skifter type undervejs i historikken: sæsoner til og med
 * 2021/22 leverer score som TEKST ("0", "4"), 2022/23 og frem som tal. Det
 * gamle filter brugte `Number.isFinite(e.score.home)`, som afviser tekst — så
 * kørt på en ældre sæson smed scriptet HVER ENESTE kamp væk og beregnede Elo
 * på et tomt datasæt. Uden fejl, uden advarsel. Det kostede syv sæsoner, før
 * nogen opdagede det.
 */
const maal = (v) => {
  // null og '' SKAL afvises FØR Number(): begge giver 0, og så bliver en
  // færdigspillet kamp uden resultat til 0-0 — altså en uafgjort ud af
  // ingenting, lagt til præcis det tal DRAW_BASE er fittet mod. Rettelsen mod
  // at TABE kampe må ikke blive til en, der OPFINDER dem.
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function loadFinished(path) {
  const d = JSON.parse(readFileSync(path, 'utf8'));
  const alle = (d.events || []).filter((e) => e.statusType === 'finished');
  const brugbare = alle
    .map((e) => ({
      ...e,
      homeName: canon(e.homeName),
      awayName: canon(e.awayName),
      score: { home: maal(e.score?.home), away: maal(e.score?.away) },
    }))
    .filter((e) => e.score.home !== null && e.score.away !== null)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  // Sig det HØJT, hvis en fil taber kampe. Et tomt datasæt gav før et pænt
  // resultat, hvor alle hold stod på 1500 — og det ligner en gyldig tabel.
  if (brugbare.length < alle.length) {
    const tabt = alle.length - brugbare.length;
    console.error(`⚠️  ${path}: ${tabt} af ${alle.length} færdigspillede kampe mangler brugbart resultat.`);
  }
  if (alle.length === 0) console.error(`⚠️  ${path}: ingen færdigspillede kampe overhovedet.`);
  return brugbare;
}

let processed = 0;
files.forEach((path, seasonIdx) => {
  // Sæson-regression mod middel (undtagen første sæson).
  if (seasonIdx > 0) {
    for (const [name, r] of elo) elo.set(name, MEAN + CARRY * (r - MEAN));
  }
  const matches = loadFinished(path);
  for (const m of matches) {
    const outcome = outcomeFromScore(m.score.home, m.score.away);
    if (!outcome) continue;
    const eh = get(m.homeName);
    const ea = get(m.awayName);
    const { home, away } = updateElo(eh, ea, actualHomeFromOutcome(outcome));
    elo.set(m.homeName, home);
    elo.set(m.awayName, away);
    processed += 1;
  }
});

// Udskriv alle hold (gennemsigtighed) + de nuværende 2026/27-hold til sidst.
const ranked = [...elo.entries()].sort((a, b) => b[1] - a[1]);
console.error(`\nBeregnet ud fra ${processed} kampe over ${files.length} sæsoner:\n`);
for (const [name, r] of ranked) console.error(`  ${Math.round(r).toString().padStart(4)}  ${name}`);

// JSON til stdout: { holdnavn: afrundet-elo }
const out = {};
for (const [name, r] of ranked) out[name] = Math.round(r);
console.log(JSON.stringify(out, null, 1));

console.error(`\n(ELO-parametre: HFA=${ELO.HFA}, K=${ELO.K}, sæson-carry=${CARRY})`);
