// ---------------------------------------------------------------------------
// scripts/combi-sammenligning.mjs — LÆS-ONLY sammenligning af combi-regler.
//
// Viser, hvad HVER spiller ville have fået i combi-bonus under den nuværende
// regel og under en foreslået ny, på de runder der allerede er afgjort.
//
// Skriver ALDRIG noget. Ingen felter røres, intet genberegnes i basen — det
// hele regnes i hukommelsen ud fra de tips og kampe, der ligger nu.
//
// Baggrunden: combi-bonussen afgør i dag halvdelen af alle sæsoner, og den
// straffer modige tip. Før vi ændrer formlen, skal vi se på de FAKTISKE
// spillere, hvad ændringen gør — ikke kun på simulerede.
//
// Miljø:
//   SPIL_SA  – sti til service-account-JSON for spil-89af9
//   GAME_ID  – valgfrit, default superliga2627
// ---------------------------------------------------------------------------
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const saPath = process.env.SPIL_SA;
if (!saPath) {
  console.error('Mangler SPIL_SA (sti til service-account for spil-89af9).');
  process.exit(1);
}
const sa = JSON.parse(readFileSync(saPath, 'utf8'));
initializeApp({ credential: cert(sa), projectId: sa.project_id });
const db = getFirestore();

const GAME_ID = process.env.GAME_ID || 'superliga2627';
// Faktoren foran kvadratroden. Den afgoer, hvor meget combi fylder — og om
// den, der fejede runden, gaar op eller ned. Kan saettes uden en ny commit,
// saa man kan proeve sig frem paa RIGTIGE tal i stedet for simulerede.
const FAKTOR = Number(process.env.FAKTOR || 2);
const LOFT = Number(process.env.LOFT || 25);

const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10;
const kickoffMs = (m) => {
  const k = m?.kickoff;
  if (k == null) return null;
  if (typeof k.toMillis === 'function') return k.toMillis();
  if (typeof k === 'number') return k;
  const t = Date.parse(k);
  return Number.isNaN(t) ? null : t;
};
const facit = (m) => {
  if (m.result != null && m.result !== '') return m.result;
  const h = Number(m.homeGoals); const a = Number(m.awayGoals);
  if (!Number.isFinite(h) || !Number.isFinite(a)) return null;
  return h > a ? '1' : (h < a ? '2' : 'X');
};
/** Udbyttet af det ramte udfald — samme opslag som outcomeReward. */
const reward = (udfald, odds) => {
  const o = odds && odds[udfald];
  const v = Number(o);
  return Number.isFinite(v) && v > 0 ? round1(v) : 0;
};

// --- de to regler ----------------------------------------------------------
/** I dag: alle ramt → loft 25, én fejl → loft 12, ellers 0. */
function nuvaerende(hitOdds, n) {
  if (n < 2) return 0;
  const fejl = n - hitOdds.length;
  if (fejl < 0 || fejl > 1) return 0;
  const produkt = hitOdds.reduce((a, b) => a * b, 1);
  return round1(Math.min(produkt, fejl === 0 ? 25 : 12));
}
/** Forslaget: FAKTOR × kvadratroden af produktet, med loft. Alle ramte tæller. */
function foreslaaet(hitOdds) {
  if (hitOdds.length < 2) return 0;
  const produkt = hitOdds.reduce((a, b) => a * b, 1);
  return round1(Math.min(FAKTOR * Math.sqrt(produkt), LOFT));
}

// --- hent data -------------------------------------------------------------
const gameRef = db.collection('games').doc(GAME_ID);
const gameSnap = await gameRef.get();
if (!gameSnap.exists) { console.error(`Spillet ${GAME_ID} findes ikke.`); process.exit(1); }
const startMs = kickoffMs({ kickoff: gameSnap.data().startAt });

const [matchesSnap, betsSnap, playersSnap] = await Promise.all([
  gameRef.collection('matches').get(),
  gameRef.collection('bets').get(),
  gameRef.collection('players').get(),
]);

const kampe = new Map();
for (const d of matchesSnap.docs) {
  const m = { id: d.id, ...d.data() };
  const ko = kickoffMs(m);
  // Kampe FØR spillets start giver ingen point og hører ikke til nogen runde.
  if (startMs != null && ko != null && ko < startMs) continue;
  kampe.set(d.id, m);
}

// Navnet bor på users/{uid}.displayName — players-dokumentet har det ikke.
// Samme opslag som Runde-Botten bruger (gameRecap.js).
const navn = new Map();
const brugere = await db.getAll(...playersSnap.docs.map((d) => db.collection('users').doc(d.id)));
for (const d of brugere) if (d.exists) navn.set(d.id, d.data().displayName);
for (const d of playersSnap.docs) if (!navn.get(d.id)) navn.set(d.id, d.data().name || d.id);

// runder, der er HELT afgjort — det er dem, combi er udbetalt for
const runder = new Map();
for (const m of kampe.values()) {
  if (m.round == null) continue;
  if (!runder.has(m.round)) runder.set(m.round, []);
  runder.get(m.round).push(m);
}
const afgjorte = [...runder.entries()]
  .filter(([, ms]) => ms.length > 0 && ms.every((m) => facit(m) != null))
  .sort((a, b) => a[0] - b[0]);

// tips pr. spiller
const tips = new Map();
for (const d of betsSnap.docs) {
  const b = d.data();
  if (!b.uid || !b.matchId || !kampe.has(b.matchId)) continue;
  if (!tips.has(b.uid)) tips.set(b.uid, new Map());
  tips.get(b.uid).set(b.matchId, b);
}

// --- regn ------------------------------------------------------------------
const rækker = [];
for (const [uid, mine] of tips) {
  let nu = 0; let ny = 0;
  const detaljer = [];
  for (const [runde, ms] of afgjorte) {
    const tippet = ms.filter((m) => mine.get(m.id)?.pick);
    if (tippet.length !== ms.length) continue;      // tippede ikke hele runden
    const hitOdds = [];
    for (const m of ms) {
      const f = facit(m);
      if (mine.get(m.id).pick === f) hitOdds.push(reward(f, m.odds));
    }
    const a = nuvaerende(hitOdds, ms.length);
    const b = foreslaaet(hitOdds);
    nu += a; ny += b;
    detaljer.push({ runde, ramt: hitOdds.length, af: ms.length, nu: a, ny: b });
  }
  rækker.push({ uid, navn: navn.get(uid) || uid, nu: round1(nu), ny: round1(ny), detaljer });
}
rækker.sort((a, b) => b.ny - a.ny || b.nu - a.nu);

// --- udskriv ---------------------------------------------------------------
console.log(`\nCOMBI-SAMMENLIGNING · ${GAME_ID}`);
console.log(`Afgjorte runder: ${afgjorte.map(([r]) => r).join(', ') || '(ingen)'}`);
console.log('I dag = alle ramt → loft 25, én fejl → loft 12, ellers 0');
console.log(`Forslag = ${FAKTOR} × √produkt, loft ${LOFT}, alle ramte tæller\n`);
const b = (s, n) => String(s).padEnd(n);
const h = (s, n) => String(s).padStart(n);
console.log(`${b('spiller', 26)}${h('i dag', 8)}${h('forslag', 9)}${h('forskel', 9)}   detaljer`);
console.log('-'.repeat(80));
for (const r of rækker) {
  const d = round1(r.ny - r.nu);
  const detalje = r.detaljer.map((x) => `r${x.runde}: ${x.ramt}/${x.af} ${x.nu}→${x.ny}`).join('  ');
  console.log(`${b(r.navn.slice(0, 25), 26)}${h(r.nu, 8)}${h(r.ny, 9)}${h((d >= 0 ? '+' : '') + d, 9)}   ${detalje}`);
}
if (!rækker.length) console.log('(ingen spillere har tippet en hel afgjort runde endnu)');

const sum = (f) => round1(rækker.reduce((a, x) => a + f(x), 0));
console.log('-'.repeat(80));
console.log(`${b('I ALT', 26)}${h(sum((x) => x.nu), 8)}${h(sum((x) => x.ny), 9)}${h((sum((x) => x.ny - x.nu) >= 0 ? '+' : '') + sum((x) => x.ny - x.nu), 9)}`);
console.log(`\nSpillere der GÅR NED: ${rækker.filter((x) => x.ny < x.nu).length} af ${rækker.length}`);
console.log('LÆS-ONLY — der er ikke skrevet noget som helst.\n');
