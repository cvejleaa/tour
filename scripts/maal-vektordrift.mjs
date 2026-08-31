// ---------------------------------------------------------------------------
// scripts/maal-vektordrift.mjs — HVOR MEGET DRIVER EN RUNDE-VEKTOR FRA
// SPILLETS TOTAL, NÅR DET KUN ER AFRUNDING?
//
// `vektorStemmer` skal skelne to ting, der ligner hinanden:
//   1. LOVLIG DRIFT. Serveren afrunder ÉN gang på summen; vektoren afrunder
//      hver runde for sig (pointOpdeling.js). De to tal må derfor afvige.
//   2. EN MANGLENDE RUNDE. Vektoren kender ikke alle runder, og ligaens total
//      bliver for lav — den tavse fejl, vagten findes for.
//
// Slækket var først det matematiske VÆRSTE tilfælde, 0,05 pr. nøgle. Test
// Manager viste med kode, at det vokser ubegrænset: 30 runder giver et slæk på
// 1,55, og så kan en ægte manglende runde på 1 point stå og se lovlig ud.
// Værste tilfælde kræver, at HVER runde runder samme vej med maksimalt udslag
// — det er ikke det, der sker.
//
// Scriptet måler derfor den FAKTISKE drift over mange simulerede sæsoner, så
// loftet kan sættes på et tal frem for på en fornemmelse.
//
// BRUG: node scripts/maal-vektordrift.mjs
// ---------------------------------------------------------------------------

const round1 = (v) => Math.round(v * 10) / 10;

// Et bets pointtal har to decimaler (odds gange indsats). En runde er summen
// af 5-7 kampe plus en combi-bonus.
function tilfaeldigRunde(rnd) {
  const kampe = 5 + Math.floor(rnd() * 3);
  let sum = 0;
  for (let i = 0; i < kampe; i += 1) {
    // 0 ved forkert tip, ellers odds mellem 1,05 og 6,00 med to decimaler.
    sum += rnd() < 0.45 ? 0 : Math.round((1.05 + rnd() * 4.95) * 100) / 100;
  }
  if (rnd() < 0.25) sum += Math.round(rnd() * 8 * 100) / 100; // combi
  return sum;
}

// Deterministisk generator, så tallet kan efterprøves.
function mulberry32(a) {
  return function rnd() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function maal(antalRunder, forsoeg, rnd) {
  let maks = 0;
  const drift = [];
  for (let i = 0; i < forsoeg; i += 1) {
    let raa = 0;
    let sumAfAfrundede = 0;
    for (let r = 0; r < antalRunder; r += 1) {
      const v = tilfaeldigRunde(rnd);
      raa += v;
      sumAfAfrundede += round1(v);   // sådan skriver serveren perRound
    }
    // Serverens total: én afrunding på den rå sum.
    const d = Math.abs(round1(sumAfAfrundede) - round1(raa));
    drift.push(d);
    if (d > maks) maks = d;
  }
  drift.sort((a, b) => a - b);
  const p = (q) => drift[Math.floor(drift.length * q)];
  return { maks, median: p(0.5), p99: p(0.99), p999: p(0.999) };
}

const rnd = mulberry32(20260830);
const FORSOEG = 200000;
console.log(`Målt: ${new Date().toISOString()} · ${FORSOEG} sæsoner pr. længde\n`);
console.log('runder   værste-tilfælde-slæk   median   p99    p99,9   MÅLT MAKS');
console.log('------ ---------------------- -------- ------ ------- ----------');
for (const n of [1, 4, 10, 18, 30, 38]) {
  const m = maal(n, FORSOEG, rnd);
  const vaerste = 0.05 * n + 0.05;
  console.log(
    `${String(n).padStart(6)} ${vaerste.toFixed(2).padStart(22)} `
    + `${m.median.toFixed(2).padStart(8)} ${m.p99.toFixed(2).padStart(6)} `
    + `${m.p999.toFixed(2).padStart(7)} ${m.maks.toFixed(2).padStart(10)}`,
  );
}
console.log('\nVærste-tilfælde-slækket kræver, at HVER runde runder samme vej med');
console.log('maksimalt udslag. Den målte maks er, hvad der faktisk sker. Loftet i');
console.log('vektorStemmer skal ligge over den målte maks og under en runde, der');
console.log('reelt mangler — en runde er typisk 5-25 point.');
