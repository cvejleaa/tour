// ---------------------------------------------------------------------------
// scripts/toerkoersel-offline.mjs — tør-kørslen af seedGames + seed-football
// for ét nyt spil, UDEN Firestore: de samme forløb, workflowet kører
// (koerSeedGames, koerFuldtSeed, seedKampe), mod en fake database i
// hukommelsen. Skriver ALDRIG noget — heller ikke lokalt — og tæller, at det
// er sandt (sidste linje: «SKRIVNINGER I ALT: 0»).
//
// HVORFOR: et nyt spils tør-kørsel af seedKampe kan først køres mod
// produktion, når seedGames er SKREVET (seed-football afviser et spil uden
// dokument, docs/drift.md). Ejeren skal kunne se kampene, holdenes start-Elo
// og de skæveste odds, FØR spil-dokumentet skrives. Det er denne udskrift.
//
// DET ER EN ILLUSTRATION AF PRODUKTIONEN, IKKE EN LÆSNING AF DEN:
//   · scenarie «tom»: ingen spil findes.
//   · scenarie «prod-nu»: de øvrige spil i scripts/games.mjs står PRÆCIS som
//     listen (antagelse — ikke læst fra databasen), og spillet findes ikke.
//   Produktionens egen tør-kørsel (Deploy platform med seedGames, uden
//   seedGamesSkriv) er den, der viser databasens faktiske felter.
//
// BRUG:  node scripts/toerkoersel-offline.mjs [prod-nu|tom] [--game hvm2027]
// ---------------------------------------------------------------------------
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, resolve } from 'path';

const ROD = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fra = (sti) => pathToFileURL(resolve(ROD, sti)).href;

/**
 * Databasen i hukommelsen. Læser fra `docs`; hver skrivning — set, update,
 * delete, batch.commit — tælles i stedet for at ske. Udskilt, så tælleren selv
 * er bevist (en tæller, der aldrig tæller, ville melde 0 for evigt).
 */
export function fakeDb(docs = new Map()) {
  let skrivninger = 0;
  const tael = () => { skrivninger += 1; };
  const db = {
    collection: () => ({ doc: (id) => ({ id, get: async () => ({ exists: docs.has(id), data: () => docs.get(id) }), set: tael, update: tael, delete: tael }) }),
    batch: () => ({ set: tael, update: tael, delete: tael, commit: tael }),
  };
  return { db, tael, antal: () => skrivninger };
}

/**
 * Kører begge tør-kørsler for `gameId` og returnerer kampene og antallet af
 * forsøgte skrivninger (skal være 0). `log` får hver linje.
 */
export async function toerkoersel({ scenarie = 'prod-nu', gameId = 'hvm2027', log = () => {} } = {}) {
  if (!['prod-nu', 'tom'].includes(scenarie)) throw new Error(`Ukendt scenarie: ${scenarie} (prod-nu eller tom).`);
  const { GAMES } = await import(fra('scripts/games.mjs'));
  const { koerSeedGames } = await import(fra('scripts/lib/seedGames.mjs'));
  const { seedPayload } = await import(fra('scripts/seed-payload.mjs'));
  const { koerFuldtSeed } = await import(fra('scripts/lib/fuldtSeed.mjs'));
  const { seedKampe } = await import(fra('scripts/lib/seedKampe.mjs'));
  const { SEED_FILER } = await import(fra('scripts/seed-filer.mjs'));
  const { parseRunder, iInterval, tjekDubletter } = await import(fra('src/lib/seedFootball.js'));
  const { puljeSeedFejl } = createRequire(import.meta.url)(resolve(ROD, 'functions-platform/puljeFacit.js'));

  const post = GAMES.find((g) => g.id === gameId);
  if (!post) throw new Error(`${gameId} står ikke i scripts/games.mjs.`);
  const filer = SEED_FILER[gameId];
  if (!filer) throw new Error(`${gameId} har ingen post i scripts/seed-filer.mjs.`);

  const docs = new Map();
  if (scenarie === 'prod-nu') {
    for (const { id, ...d } of GAMES.filter((g) => g.id !== gameId)) docs.set(id, seedPayload(d, { exists: false, now: 'TS' }));
  }
  const { db, tael, antal } = fakeDb(docs);

  log(`=== seedGames, tør-kørsel (scenarie: ${scenarie}) ===`);
  await koerSeedGames({ games: GAMES, db, skriv: false, now: 'TS', puljeSeedFejl, log });

  log(`\n=== seed-football --game ${gameId}, tør-kørsel (spil-dokumentet, som seedGames ville oprette det) ===`);
  const { id, ...data } = post;
  const spilDok = seedPayload(data, { exists: false, now: 'TS' });
  const program = JSON.parse(readFileSync(resolve(ROD, filer.fixtures), 'utf8'));
  let fixtures = program.fixtures.filter((f) => f && f.home && f.away && f.round != null);
  tjekDubletter(fixtures);
  fixtures = iInterval(fixtures, parseRunder(filer.runder));
  const holdModul = await import(fra(filer.teams));
  const teams = Object.values(holdModul).find((v) => Array.isArray(v) && v.length && typeof v[0]?.name === 'string');
  log(`Filer fra scripts/seed-filer.mjs: holdliste ${filer.teams}, kampprogram ${filer.fixtures}, runde ${filer.runder}.`);
  log(`Holdliste: ${teams.length} hold. Kampe i interval: ${fixtures.length}.`);
  const spilRef = { id, get: async () => ({ exists: true, data: () => spilDok }), set: tael, update: tael };
  await koerFuldtSeed({
    gameRef: spilRef,
    matchesRef: { doc: (mid) => ({ id: mid }) },
    batch: { set: tael, update: tael, delete: tael, commit: tael },
    fixtures, eksisterende: new Map(), teams, skriv: false, serverTimestamp: 'TS',
    tilTimestamp: (ms) => new Date(ms).toISOString(), log,
  });

  // Kampene, en skrivning ville lægge ind — samme seedKampe som forløbet.
  const { matches } = await seedKampe({ gameRef: spilRef, fixtures, teams });

  log('\n=== top-10, start-Elo ===');
  [...teams].sort((a, b) => (b.elo ?? 0) - (a.elo ?? 0)).slice(0, 10)
    .forEach((t, i) => log(`${String(i + 1).padStart(2)}. ${t.name} ${t.elo}`));

  // Skævest = størst forhold mellem den dyreste og den billigste af 1 og 2.
  const skaev = (m) => Math.max(m.odds['1'], m.odds['2']) / Math.min(m.odds['1'], m.odds['2']);
  log('\n=== de fem skæveste kampe (odds 1/X/2) ===');
  [...matches].sort((a, b) => skaev(b) - skaev(a)).slice(0, 5)
    .forEach((m) => log(`${m.id} · ${m.home}–${m.away} · ${m.odds['1']}/${m.odds.X}/${m.odds['2']}`));

  log('\n=== alle kampe (id · runde · kickoff UTC · Elo · odds 1/X/2) ===');
  for (const m of matches) log(`${m.id} · R${m.round} · ${m.kickoff} · ${m.eloHome}/${m.eloAway} · ${m.odds['1']}/${m.odds.X}/${m.odds['2']}`);
  log(`\nSKRIVNINGER I ALT: ${antal()}`);
  return { skrivninger: antal(), matches };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const gi = args.indexOf('--game');
  const gameId = gi >= 0 ? args[gi + 1] : 'hvm2027';
  const rest = gi >= 0 ? args.filter((_, i) => i !== gi && i !== gi + 1) : args;
  if (rest.length > 1) { console.error(`Ukendte argumenter: ${rest.join(' ')}`); process.exit(1); }
  toerkoersel({ scenarie: rest[0] || 'prod-nu', gameId, log: (s) => console.log(s) })
    .then(({ skrivninger }) => process.exit(skrivninger === 0 ? 0 : 1))
    .catch((e) => { console.error(e.message); process.exit(1); });
}
