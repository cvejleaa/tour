// ---------------------------------------------------------------------------
// scripts/seed-games.mjs — Seeder games-collection'en til den samlede platform
// (tip.vejleaa.dk / projekt spil-89af9). Ét dokument pr. spil; se
// docs/samlet-platform.md. Kan køres flere gange (idempotent, merge).
//
// TØR-KØRSEL ER DEFAULT. Uden --skriv skrives der intet: kørslen viser pr.
// spil, om dokumentet oprettes eller hvilke felter der ændres (fra → til),
// hvilke admin-ejede felter der bevares, og hvilke felter i databasen listen
// ikke nævner (merge fjerner aldrig et felt). Forløbet bor i
// scripts/lib/seedGames.mjs, hvor det er testet.
//
// BRUG:
//   Mod emulator:
//     FIRESTORE_EMULATOR_HOST=localhost:8080 node scripts/seed-games.mjs [--skriv]
//   Mod platform-projektet (læs tør-kørslen, FØR du skriver):
//     GOOGLE_APPLICATION_CREDENTIALS=/sti/serviceAccount.json node scripts/seed-games.mjs
//     GOOGLE_APPLICATION_CREDENTIALS=/sti/serviceAccount.json node scripts/seed-games.mjs --skriv
//
// Krav: firebase-admin.
// ---------------------------------------------------------------------------

// Argumenterne FØR forbindelsen: en tastefejl (`--write`, `--skriv=true`)
// må ikke give en tør-kørsel, operatøren tror var en skrivning — og slet ikke
// omvendt. Kun --skriv kendes.
const argv = process.argv.slice(2);
const ukendte = argv.filter((a) => a !== '--skriv');
if (ukendte.length) {
  console.error(`\n⚠️  Ukendt argument: ${ukendte.join(' ')}. Kun --skriv kendes (uden det tørkøres der).\n`);
  process.exit(1);
}
const SKRIV = argv.includes('--skriv');

const admin = (await import('firebase-admin')).default;

let app;
if (process.env.FIRESTORE_EMULATOR_HOST) {
  console.log(`Forbinder til Firestore Emulator: ${process.env.FIRESTORE_EMULATOR_HOST}`);
  app = admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'spil-89af9' });
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  const { readFileSync } = await import('fs');
  const serviceAccount = JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));
  app = admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
} else {
  app = admin.initializeApp();
}

const db = admin.firestore();
const now = admin.firestore.FieldValue.serverTimestamp();

const { GAMES } = await import('./games.mjs');
// Forløbet — plan, tør-kørsel og skrivning — bor i et testet modul. Hvad seedet
// MÅ skrive på et spil (og hvilke felter admin ejer), afgøres af
// scripts/seed-payload.mjs.
const { koerSeedGames } = await import('./lib/seedGames.mjs');
// En runde-pulje, der aldrig kan afgøres, opdages ellers først ved
// semifinalerne — og seedet skriver med merge, så den første kørsel er den
// eneste gode chance for at få felterne rigtige. Samme vagt som
// scripts/games.test.mjs. Hentet fra SERVER-spejlet (CommonJS):
// src/lib/puljeFacit.js importerer uden filendelse og kan ikke indlæses af
// node uden vite — og de to ender er bundet byte for byte
// (functions-platform/puljeFacit.test.js). koerSeedGames afviser HELE
// kørslen, før noget læses eller skrives, hvis én post har en fejl.
const { createRequire } = await import('module');
const { puljeSeedFejl } = createRequire(import.meta.url)('../functions-platform/puljeFacit.js');

koerSeedGames({
  games: GAMES, db, skriv: SKRIV, now, puljeSeedFejl, log: (s) => console.log(s),
})
  .then(() => { console.log(SKRIV ? '\n✅ Færdig.' : '\n✅ Færdig (tør-kørsel — intet skrevet).'); return app.delete(); })
  .then(() => process.exit(0))
  .catch((err) => { console.error('Seed-fejl:', err); process.exit(1); });
