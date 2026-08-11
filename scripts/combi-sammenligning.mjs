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
// SPILLETS EGNE REGLER, ikke harnessets kopier. `kickoffMs` og start-gaten lå
// før som lokale genskrivninger her — og en kopi kan drive fra originalen uden
// at nogen opdager det.
import { gatedeKampe, startRundeFor } from '../src/lib/startGate.js';

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
/**
 * Forslaget: FAKTOR × kvadratroden af produktet, med loft. Alle ramte tæller,
 * og der er INTET kuponkrav — en glemt kamp tæller bare ikke med.
 */
function foreslaaet(hitOdds) {
  if (hitOdds.length < 2) return 0;
  const produkt = hitOdds.reduce((a, b) => a * b, 1);
  return round1(Math.min(FAKTOR * Math.sqrt(produkt), LOFT));
}
/** Træf-bonus pr. ramt kamp i forslaget (0 = som i dag). */
const TRAEF = Number(process.env.TRAEF ?? 0);

// --- hent data -------------------------------------------------------------
const gameRef = db.collection('games').doc(GAME_ID);
const gameSnap = await gameRef.get();
if (!gameSnap.exists) { console.error(`Spillet ${GAME_ID} findes ikke.`); process.exit(1); }
const [matchesSnap, betsSnap, playersSnap] = await Promise.all([
  gameRef.collection('matches').get(),
  gameRef.collection('bets').get(),
  gameRef.collection('players').get(),
]);

// SAMME GATE SOM SPILLET, ikke en kopi. Harnesset havde sin egen
// dato-sammenligning — den tiende af slagsen — og et harness, der analyserer et
// andet kampsæt end spillet bruger, måler noget andet end det, det påstår.
// Netop dette harness har afgjort combi- og odds-ændringer.
const alleKampe = matchesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
const gatede = gatedeKampe(alleKampe, startRundeFor(gameSnap.data(), alleKampe));

const kampe = new Map();
for (const m of alleKampe) {
  if (gatede.has(m.id)) continue;
  kampe.set(m.id, m);
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
  let nuC = 0; let nyC = 0; let nu1 = 0; let ny1 = 0;
  const detaljer = [];
  for (const [runde, ms] of afgjorte) {
    const tippet = ms.filter((m) => mine.get(m.id)?.pick);
    // Ramte odds — kun for de kampe, spilleren FAKTISK tippede.
    const hitOdds = [];
    for (const m of tippet) {
      const f = facit(m);
      if (mine.get(m.id).pick === f) hitOdds.push(reward(f, m.odds));
    }
    // 1X2: i dag oddsene, i forslaget oddsene + træf-bonus pr. ramt kamp.
    const sum1x2 = round1(hitOdds.reduce((a, b) => a + b, 0));
    nu1 += sum1x2;
    ny1 += round1(sum1x2 + TRAEF * hitOdds.length);
    // Combi: den GAMLE regel krævede hele runden tippet. Den nye gør ikke.
    const a = tippet.length === ms.length ? nuvaerende(hitOdds, ms.length) : 0;
    const b = foreslaaet(hitOdds);
    nuC += a; nyC += b;
    if (tippet.length) {
      detaljer.push({
        runde, ramt: hitOdds.length, tippet: tippet.length, af: ms.length, nu: a, ny: b,
      });
    }
  }
  rækker.push({
    uid,
    navn: navn.get(uid) || uid,
    nu: round1(nu1 + nuC),
    ny: round1(ny1 + nyC),
    nuC: round1(nuC),
    nyC: round1(nyC),
    nu1: round1(nu1),
    ny1: round1(ny1),
    detaljer,
  });
}
rækker.sort((a, b) => b.ny - a.ny || b.nu - a.nu);

// --- udskriv ---------------------------------------------------------------
console.log(`\nCOMBI-SAMMENLIGNING · ${GAME_ID}`);
console.log(`Afgjorte runder: ${afgjorte.map(([r]) => r).join(', ') || '(ingen)'}`);
console.log('I DAG    = 1X2 (odds) + combi: alle ramt → loft 25, én fejl → 12, ellers 0');
console.log('           …og combi kræver, at man tippede HELE runden.');
console.log(`FORSLAG  = 1X2 (odds + ${TRAEF} pr. ramt) + combi: ${FAKTOR} × √produkt, loft ${LOFT}`);
console.log('           …intet kuponkrav — en glemt kamp tæller bare ikke med.\n');
const b = (s, n) => String(s).padEnd(n);
const h = (s, n) => String(s).padStart(n);
console.log(`${b('spiller', 26)}${h('1X2 nu', 8)}${h('1X2 ny', 8)}${h('combi nu', 9)}${h('combi ny', 9)}${h('I ALT nu', 9)}${h('I ALT ny', 9)}${h('forskel', 9)}`);
console.log('-'.repeat(88));
for (const r of rækker) {
  const d = round1(r.ny - r.nu);
  console.log(`${b(r.navn.slice(0, 25), 26)}${h(r.nu1, 8)}${h(r.ny1, 8)}${h(r.nuC, 9)}${h(r.nyC, 9)}${h(r.nu, 9)}${h(r.ny, 9)}${h((d >= 0 ? '+' : '') + d, 9)}`);
}
console.log('');
for (const r of rækker) {
  const detalje = r.detaljer
    .map((x) => `r${x.runde}: ${x.ramt} ramt af ${x.tippet} tippet (runden har ${x.af}) · combi ${x.nu}→${x.ny}`)
    .join('\n' + ' '.repeat(28));
  console.log(`${b(r.navn.slice(0, 25), 26)}  ${detalje || '(ingen tips i en afgjort runde)'}`);
}
if (!rækker.length) console.log('(ingen spillere har tippet i en afgjort runde endnu)');

const sum = (f) => round1(rækker.reduce((a, x) => a + f(x), 0));
console.log('-'.repeat(88));
console.log(`${b('I ALT', 26)}${h(sum((x) => x.nu1), 8)}${h(sum((x) => x.ny1), 8)}${h(sum((x) => x.nuC), 9)}${h(sum((x) => x.nyC), 9)}${h(sum((x) => x.nu), 9)}${h(sum((x) => x.ny), 9)}${h((sum((x) => x.ny - x.nu) >= 0 ? '+' : '') + sum((x) => x.ny - x.nu), 9)}`);
console.log(`\nSpillere der GÅR NED: ${rækker.filter((x) => x.ny < x.nu).length} af ${rækker.length}`);
console.log('LÆS-ONLY — der er ikke skrevet noget som helst.\n');
