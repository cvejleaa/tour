// ---------------------------------------------------------------------------
// scripts/backfill-player-leagues.mjs — skriv liga-medlemskabet ned på
// games/{gameId}/players/{uid}.leagueIds i platformen (spil-89af9).
//
// Feltet er dét, security rules bruger til at afgøre, hvem der må se hvad:
// stillingen viser kun spillere, man deler mindst én liga med, og efter
// kickoff kan man kun se liga-kammeraters TIPS. Derfor skrives den samme
// liste også på games/{gameId}/bets — reglen skal kunne afgøres ud fra
// dokumentet alene. Serveren holder begge dele opdateret via
// syncPlayerLeagues-triggeren; dette script laver engangs-backfill af
// eksisterende data (kør FØR de strammede regler går live).
//
// Miljø:
//   SPIL_SA  – sti til service-account-JSON for spil-89af9
//   GAME_ID  – valgfrit: kun ét spil (default: alle spil)
//   DRY_RUN  – 'true' = vis kun hvad der ville blive skrevet
// ---------------------------------------------------------------------------
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const require = createRequire(import.meta.url);
const { rebuildGamePlayerLeagues } = require('../functions-platform/playerLeagues.js');

const saPath = process.env.SPIL_SA;
if (!saPath) {
  console.error('Mangler SPIL_SA (sti til service-account for spil-89af9).');
  process.exit(1);
}
const dryRun = String(process.env.DRY_RUN || '').toLowerCase() === 'true';
const onlyGame = (process.env.GAME_ID || '').trim();

const sa = JSON.parse(readFileSync(saPath, 'utf8'));
initializeApp({ credential: cert(sa), projectId: sa.project_id });
const db = getFirestore();

const gamesSnap = await db.collection('games').get();
const gameIds = gamesSnap.docs
  .map((d) => d.id)
  .filter((id) => !onlyGame || id === onlyGame);

if (gameIds.length === 0) {
  console.error(onlyGame ? `Fandt ikke spillet "${onlyGame}".` : 'Ingen spil fundet.');
  process.exit(1);
}

for (const gameId of gameIds) {
  if (dryRun) {
    // Tør-kørsel: vis hvad hver spiller VILLE få, uden at skrive.
    const gameRef = db.collection('games').doc(gameId);
    const [leagues, players] = await Promise.all([
      gameRef.collection('leagues').get(),
      gameRef.collection('players').get(),
    ]);
    const byUid = new Map();
    for (const l of leagues.docs) {
      for (const uid of (l.data().memberUids || [])) {
        if (!byUid.has(uid)) byUid.set(uid, []);
        byUid.get(uid).push(l.id);
      }
    }
    // Tips bagfyldes også — vis hvor mange der VILLE blive rørt, ellers
    // dokumenterer tør-kørslen kun halvdelen af det, der faktisk sker.
    const bets = await gameRef.collection('bets').get();
    let betsWouldChange = 0;
    for (const b of bets.docs) {
      const want = (byUid.get(b.data().uid) || []).slice().sort();
      const have = (Array.isArray(b.data().leagueIds) ? b.data().leagueIds : []).slice().sort();
      if (want.length !== have.length || !want.every((v, i) => v === have[i])) betsWouldChange += 1;
    }
    console.log(`[tør-kørsel] ${gameId}: ${players.size} spillere, ${leagues.size} ligaer, `
      + `${bets.size} tips (${betsWouldChange} ville blive rettet)`);
    for (const p of players.docs) {
      console.log(`  ${p.id}: ${(byUid.get(p.id) || []).join(', ') || '(ingen liga)'}`);
    }
    continue;
  }
  const out = await rebuildGamePlayerLeagues(db, gameId);
  console.log(`${gameId}: gennemgik ${out.players} spillere (rettede ${out.changed}) `
    + `og ${out.bets} tips (rettede ${out.betsChanged}).`);
}

console.log('Færdig.');
