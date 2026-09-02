// ---------------------------------------------------------------------------
// LÆS-ONLY: kig på én eller flere kampe og spillets driftlog-kort i produktion.
//
// Findes, fordi "verificér i produktion" ellers kræver, at nogen logger ind i
// konsollen og finder dokumentet i hånden — og fordi assistenten slet ikke
// har en service-account i sit miljø. Første brug: efterprøve, at efter-
// facit-vejen (PR #204) faktisk hentede målscorere ét minut efter facit på
// AGF–FCM 2/9-2026, og ikke først ved times-sweep'et.
//
// Scriptet skriver ikke ét felt. Det printer de felter, synkerne skriver på
// kampdokumentet (facit, live, detaljer, Eid) med tidsstempler som ISO, og
// spillets driftlog-kort og åbne alarmer.
//
// Lokalt:   SA=/sti/til/sa.json node scripts/probe-kamp.mjs --spil superliga2627 --hold AGF,Midtjylland
// Workflow: .github/workflows/probe-kamp.yml (spil-89af9).
//
//   --spil   spillets id (standard superliga2627)
//   --hold   kommasepareret; en kamp tages med, når ALLE dele findes i
//            hjemme- eller udeholdets navn (uden hensyn til store/små)
//   --kamp   kamp-dokumentets id (kan gentages med komma) — i stedet for --hold
//   --dage   kun kampe med kickoff inden for så mange dage før nu (standard 3,
//            0 = ingen grænse) — så et holdnavn ikke giver hele sæsonen
// ---------------------------------------------------------------------------
import { readFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const arg = (navn, standard = '') => {
  const i = process.argv.indexOf(`--${navn}`);
  return i > -1 && process.argv[i + 1] != null ? process.argv[i + 1] : standard;
};
const spil = arg('spil', 'superliga2627');
const holdDele = arg('hold').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const kampIds = arg('kamp').split(',').map((s) => s.trim()).filter(Boolean);
const dage = Number(arg('dage', '3'));

const saPath = process.env.SA || process.env.SPIL_SA;
if (!saPath) {
  console.error('Mangler SA (sti til service-account).');
  process.exit(1);
}
const sa = JSON.parse(readFileSync(saPath, 'utf8'));
initializeApp({ credential: cert(sa), projectId: sa.project_id });
const db = getFirestore();

/** Timestamp / Date / ms → ISO, ellers værdien som den er. */
function iso(v) {
  if (v == null) return null;
  if (typeof v.toDate === 'function') return v.toDate().toISOString();
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'number' && v > 1e11) return new Date(v).toISOString();
  return v;
}
const ms = (v) => (v == null ? null : new Date(iso(v)).getTime());

/** Minutter fra a til b, med én decimal — eller null, hvis et af dem mangler. */
function minutter(a, b) {
  const x = ms(a);
  const y = ms(b);
  return Number.isFinite(x) && Number.isFinite(y) ? Math.round((y - x) / 6000) / 10 : null;
}

const FELTER = [
  'status', 'result', 'homeGoals', 'awayGoals', 'resultSyncedAt',
  'live', 'liveMaal', 'livescoreEid',
  'detaljerSyncedAt', 'detaljerVersion', 'detaljerAfvistAt', 'detaljerAfvistGrund',
  'halvlegHome', 'halvlegAway', 'tilskuere', 'maal',
];

function passer(d) {
  if (!holdDele.length) return true;
  const navne = `${d.home ?? ''} ${d.away ?? ''}`.toLowerCase();
  return holdDele.every((del) => navne.includes(del));
}

const col = db.collection('games').doc(spil).collection('matches');
let docs;
if (kampIds.length) {
  docs = (await Promise.all(kampIds.map((id) => col.doc(id).get()))).filter((s) => s.exists);
} else {
  const snap = await col.get();
  const graense = dage > 0 ? Date.now() - dage * 86_400_000 : -Infinity;
  docs = snap.docs.filter((s) => {
    const d = s.data();
    const k = ms(d.kickoff);
    return passer(d) && (Number.isFinite(k) ? k >= graense && k <= Date.now() + 86_400_000 : true);
  });
}
docs.sort((a, b) => (ms(a.data().kickoff) ?? 0) - (ms(b.data().kickoff) ?? 0));

console.log(`\n== ${spil}: ${docs.length} kamp(e) ==`);
for (const s of docs) {
  const d = s.data();
  console.log(`\n${s.id}  ${d.home} – ${d.away}  kickoff ${iso(d.kickoff)}`);
  for (const f of FELTER) {
    if (!(f in d)) continue;
    const v = d[f];
    if (f === 'maal' && Array.isArray(v)) {
      console.log(`  maal (${v.length}):`);
      for (const m of v) {
        console.log(`    ${String(m.minut).padStart(3)}'  ${m.hold === 'home' ? d.home : d.away}  ${m.scorer ?? '?'}${m.selvmaal ? ' (selvmål)' : ''}${m.oplaeg ? `  oplæg: ${m.oplaeg}` : ''}`);
      }
      continue;
    }
    const vist = v && typeof v === 'object' && typeof v.toDate !== 'function' ? JSON.stringify(v) : iso(v);
    console.log(`  ${f}: ${vist}`);
  }
  const afstand = minutter(d.resultSyncedAt, d.detaljerSyncedAt);
  if (afstand != null) console.log(`  → detaljer landede ${afstand} min efter facit`);
  else if (d.result && !d.detaljerSyncedAt) console.log('  → facit, men INGEN detaljer endnu');
}

const drift = await db.collection('driftlog').where('gameId', '==', spil).get();
console.log(`\n== driftlog for ${spil}: ${drift.size} kort ==`);
for (const s of drift.docs) {
  const d = s.data();
  console.log(`\n${s.id}  niveau=${d.niveau}  kørt ${iso(d.koertAt)}  opdateret ${iso(d.opdateretAt)}  næste før ${iso(d.naesteForventetFoer)}  kilde=${d.senesteKilde}`);
  for (const linje of String(d.besked ?? '').split('\n')) console.log(`  ${linje}`);
  if (d.tal && Object.keys(d.tal).length) console.log(`  tal: ${JSON.stringify(d.tal)}`);
}

const alarmer = await db.collection('driftAlarmer').where('gameId', '==', spil).get();
console.log(`\n== driftAlarmer for ${spil}: ${alarmer.size} ==`);
for (const s of alarmer.docs) {
  const d = s.data();
  const kopi = {};
  for (const [k, v] of Object.entries(d)) kopi[k] = iso(v);
  console.log(`  ${s.id}: ${JSON.stringify(kopi)}`);
}
