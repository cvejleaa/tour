// ---------------------------------------------------------------------------
// scripts/audit-double-chance.mjs — LÆS-ONLY tjek for DOBBELT Chancen i samme
// runde.
//
// Chancen må bruges ÉN gang pr. runde. Reglen har hidtil kun stået i browseren:
// hverken firestore.rules eller serverens afregning kender den, og
// gameScoring afregner hvert tip for sig. Et hul i fladen — lukket 9/8-2026,
// commit 7b9e1eb — kunne derfor lade en spiller sætte Chancen på kamp A, se
// den låse ved kickoff, og bagefter sætte den igen på kamp B i SAMME runde.
//
// Dette script finder, hvor mange gange det er sket, hvad det har kostet eller
// givet, og NÅR chancerne blev lagt i forhold til kampenes kickoff — så
// beslutningen om at rette data hviler på tal frem for et gæt. Rundenummeret
// læses fra kampens EGET dokument (match.round), aldrig af en dato: en udsat
// kamp beholder sin runde.
//
// ÆRLIGT FORBEHOLD OM TIDSSTEMPLET: et tip bærer kun `updatedAt`, og det er
// det SENESTE skriv — ikke nødvendigvis det øjeblik, chancen blev sat. Rettede
// spilleren sit 1X2-valg bagefter, er stemplet rykket med. Firestore gemmer
// ingen skrivehistorik, så det er den bedste kilde, der findes. Til gengæld
// giver reglerne en hård grænse, der ikke kan omgås: et tip kan ALDRIG skrives
// efter sin egen kamps kickoff (firestore.rules), så updatedAt < eget kickoff
// er garanteret. Er chance nr. 2 skrevet EFTER chance nr. 1's kamp gik i gang,
// er mekanismen bekræftet: den første var låst, da den anden blev sat.
//
// Skriver ALDRIG noget. Exit-kode 1 hvis der findes dobbelt-chancer.
//
// Miljø:
//   SPIL_SA  – sti til service-account-JSON for spil-89af9
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

/** Dansk dato-tid, så output kan sammenholdes med kampprogrammet. */
const dk = (ms) => new Date(ms).toLocaleString('da-DK', { timeZone: 'Europe/Copenhagen' });
/** Menneskelæselig varighed. */
function minutter(ms) {
  const m = Math.round(Math.abs(ms) / 60000);
  if (m < 90) return `${m} min`;
  const t = Math.floor(m / 60);
  return t < 48 ? `${t} t ${m % 60} min` : `${Math.floor(t / 24)} d ${t % 24} t`;
}

let problems = 0;
const gamesSnap = await db.collection('games').get();

for (const game of gamesSnap.docs) {
  const [betsSnap, matchesSnap, playersSnap] = await Promise.all([
    game.ref.collection('bets').get(),
    game.ref.collection('matches').get(),
    game.ref.collection('players').get(),
  ]);
  if (betsSnap.empty) continue;

  const rundeAf = new Map(matchesSnap.docs.map((d) => [d.id, d.data().round]));
  const kampNavn = new Map(matchesSnap.docs.map((d) => {
    const m = d.data();
    return [d.id, `${m.home ?? '?'}–${m.away ?? '?'}`];
  }));
  const kickoffAf = new Map(matchesSnap.docs.map((d) => {
    const k = d.data().kickoff;
    const ms = k?.toMillis?.() ?? (k == null ? null : Date.parse(k));
    return [d.id, Number.isFinite(ms) ? ms : null];
  }));
  const navnAf = new Map(playersSnap.docs.map((d) => [d.id, d.data().displayName || d.id]));

  // uid|runde → [{matchId, stake, points}]
  const brugt = new Map();
  for (const d of betsSnap.docs) {
    const b = d.data();
    const stake = Number(b.chanceStake) || 0;
    if (stake <= 0) continue;
    const runde = rundeAf.get(b.matchId);
    if (runde == null) continue; // kamp uden dokument — fanges af andre tjek
    const key = `${b.uid}|${runde}`;
    if (!brugt.has(key)) brugt.set(key, []);
    brugt.get(key).push({
      matchId: b.matchId,
      stake,
      points: Number(b.points) || 0,
      skrevetMs: b.updatedAt?.toMillis?.() ?? null,
      kickoffMs: kickoffAf.get(b.matchId) ?? null,
    });
  }

  const dobbelte = [...brugt.entries()].filter(([, liste]) => liste.length > 1);
  console.log(`${game.id}: ${betsSnap.size} tips, ${brugt.size} chancer brugt, ${dobbelte.length} runder med DOBBELT chance`);

  for (const [key, liste] of dobbelte) {
    const [uid, runde] = key.split('|');
    // Kun de kampe, der ER afregnet, har flyttet stillingen. En uafregnet
    // dobbelt-chance er stadig et problem, men har ikke kostet point endnu.
    const navn = navnAf.get(uid) || uid;
    console.log(`  DOBBELT  ${navn} (${uid}) · runde ${runde} · ${liste.length} chancer:`);
    // Sorteret efter hvornår tippet sidst blev skrevet — rækkefølgen er hele
    // pointen: blev nr. 2 lagt, EFTER nr. 1's kamp var gået i gang?
    const iOrden = [...liste].sort((a, b) => (a.skrevetMs ?? 0) - (b.skrevetMs ?? 0));
    for (const [i, c] of iOrden.entries()) {
      const ko = c.kickoffMs == null ? '?' : dk(c.kickoffMs);
      const sk = c.skrevetMs == null ? '?' : dk(c.skrevetMs);
      const foer = c.kickoffMs != null && c.skrevetMs != null
        ? `${minutter(c.kickoffMs - c.skrevetMs)} før eget kickoff`
        : 'ukendt';
      console.log(`      ${i + 1}. ${kampNavn.get(c.matchId) ?? c.matchId}`);
      console.log(`         kickoff ${ko} · sidst skrevet ${sk} (${foer})`);
      console.log(`         indsats ${c.stake}, point ${c.points}`);
    }
    // DEN AFGØRENDE LINJE: er en senere chance skrevet, efter en tidligere
    // chances kamp var låst, er mekanismen bekræftet — spilleren kunne ikke
    // fjerne den første, fordi reglerne afviser skrivning efter kickoff.
    for (let i = 1; i < iOrden.length; i += 1) {
      const nu = iOrden[i];
      const foerste = iOrden.find((c) => c.kickoffMs != null && nu.skrevetMs != null && c.kickoffMs < nu.skrevetMs);
      if (foerste) {
        console.log(`         ⇒ nr. ${i + 1} blev skrevet ${minutter(nu.skrevetMs - foerste.kickoffMs)} EFTER `
          + `"${kampNavn.get(foerste.matchId) ?? foerste.matchId}" var gået i gang — den kunne altså ikke fjernes.`);
      }
    }
    problems += 1;
  }
}

if (problems > 0) {
  console.error(`\n${problems} runder med dobbelt Chancen fundet.`);
  console.error('Rettelse af data er en EJER-beslutning (docs/drift.md) — scriptet skriver intet.');
  process.exit(1);
}
console.log('\nIngen dobbelt-chancer fundet.');
