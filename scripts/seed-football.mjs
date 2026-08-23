// ---------------------------------------------------------------------------
// scripts/seed-football.mjs — seed kampe + hold-Elo for ET fodbold-spil.
//
// Afløser scripts/seed-superliga.mjs, som var hårdkodet til superliga2627 og
// den danske holdliste. Med Premier League ved siden af skal spil, hold og
// kampprogram kunne vælges.
//
// TØR-KØRSEL ER DEFAULT. Uden --skriv skrives der intet. Seedet har ingen vej
// tilbage: står kampene i produktion og nogen har tippet, findes der ingen
// knap, og der tages ingen backup (i modsætning til rescore-bets).
//
// --kickoffs-only ER IKKE EN BEKVEMMELIGHED.
// Premier League udgiver programmet FØR TV-udvælgelsen: runde 6-38 står med
// alle ti kampe i samme standard-slot, og de bliver flyttet hen over sæsonen.
// Kickoff ER tip-deadlinen (firestore.rules). Vi skal derfor kunne rette et
// tidspunkt UDEN at røre odds — og det kunne det gamle script ikke: det skrev
// `eloHome`, `eloAway` og `odds` ubetinget med merge ved hver kørsel. En
// gen-kørsel i oktober ville have overskrevet de frosne odds på kampe, folk
// allerede havde tippet og fået point for.
//
// BRUG:
//   Tør-kørsel (skriver intet):
//     node scripts/seed-football.mjs --game pl2627-efteraar \
//       --teams src/data/premierLeagueTeams2026.js \
//       --fixtures scripts/premier-league-fixtures-2627.json --runder 1-18
//
//   Skriv:            ... --skriv
//   Kun kickoff-tider: ... --kickoffs-only --skriv
//   Kun holdlisten:   node scripts/seed-football.mjs --game superliga2627 \
//                       --teams src/data/superligaTeams2026.js --teams-only
//
// --teams-only ER HELLER IKKE EN BEKVEMMELIGHED.
// Trøjefarverne bor i `games/{id}.teams`, og kun det fulde seed kunne skrive
// dem — sammen med odds og Elo. Der fandtes altså ingen vej til at rette en
// farve midt i en sæson, og en manglende tredjefarve er ikke kosmetik:
// `badgeFor` falder tilbage på udetrøjen, så holdet tegnes i en farve, der
// clasher med hjemmeholdets. Tilstanden rører hverken kampe, odds eller
// resultater — men den AFVISER hårdt, hvis holdlisten ville ændre `elo` eller
// antallet af hold, for de to felter bærer point (se `teamsVagt`).
//
// Mod emulator: FIRESTORE_EMULATOR_HOST=localhost:8080
// Mod produktion: GOOGLE_APPLICATION_CREDENTIALS=/sti/sa.json
// ---------------------------------------------------------------------------

const admin = (await import('firebase-admin')).default;
const { readFileSync, existsSync } = await import('fs');
const { pathToFileURL } = await import('url');
const { resolve, isAbsolute } = await import('path');

// Stier opløses mod REPOETS ROD, ikke mod den mappe, man tilfældigvis står i.
// Uden det fejler `--teams src/data/…` for alle, der ikke står i roden — og
// fejlbeskeden ("Cannot find module") peger på Node, ikke på det, der er galt.
const ROD = new URL('..', import.meta.url).pathname;
const sti = (p) => (isAbsolute(p) ? p : resolve(ROD, p));
const { buildMatches } = await import('../src/lib/superligaSeed.js');
const { koerTeamsOnly } = await import('./lib/teamsOnly.mjs');
// Beslutningerne (hvad springes over, hvad ændres) bor i et testet modul.
// To udgaver af "hvornår må vi skrive odds" er to steder at lave fejlen.
const {
  parseArgs, parseRunder, iInterval, kickoffPlan, seedPlan, ukendteHold, tjekDubletter,
  kickoffMs,
} = await import('../src/lib/seedFootball.js');

// --- argumenter ------------------------------------------------------------

let args;
try {
  args = parseArgs(process.argv.slice(2));
} catch (err) {
  console.error(`\n⚠️  ${err.message}\n`);
  process.exit(1);
}
const GAME_ID = args.game;
const TEAMS_PATH = args.teams;
const FIXTURES_PATH = args.fixtures;
const KICKOFFS_ONLY = args.flags.has('kickoffs-only');
const TEAMS_ONLY = args.flags.has('teams-only');
const SKRIV = args.flags.has('skriv');
const RUNDER = args.runder || null; // fx "1-18" eller "19-38"

// TO TILSTANDE PÅ ÉN GANG er en tavs fælde af samme slags som stavefejlen
// `--kickoff-only`: begge flag ville passere argument-tjekket, og kun den ene
// ville køre. Derfor er kombinationen en fejl, ikke en rangordning.
if (KICKOFFS_ONLY && TEAMS_ONLY) {
  console.error('\n⚠️  --kickoffs-only og --teams-only kan ikke kombineres. Kør dem hver for sig.\n');
  process.exit(1);
}

// --teams-only rører ikke kampe og har derfor intet brug for kampprogrammet.
// Kræves det alligevel, skal operatøren pege på en fil, der ikke bruges — og
// så er det ikke længere klart, hvad kørslen egentlig gør.
if (!GAME_ID || (!FIXTURES_PATH && !TEAMS_ONLY) || (!TEAMS_PATH && !KICKOFFS_ONLY)) {
  console.error(`
Mangler argumenter.

  --game      spil-id, fx pl2627-efteraar
  --fixtures  sti til kampprogram (JSON: liste eller { fixtures: [...] })
              — kan udelades ved --teams-only, som ikke rører kampe
  --teams     sti til holdliste (JS-modul der eksporterer en liste)
              — kan udelades ved --kickoffs-only, som ikke rører Elo
  --runder    valgfrit interval, fx 1-18. Uden: alle runder i filen.
  --kickoffs-only  skriv KUN kickoff. Rør aldrig odds, elo eller resultat.
  --teams-only     skriv KUN holdlisten. Rør aldrig kampe, odds eller resultat.
  --skriv     skriv i databasen. UDEN denne tørkøres der.
`);
  process.exit(1);
}

/** Kampprogrammet. Understøtter både en bar liste og { _note, fixtures }. */
function loadFixtures(path) {
  const fuld = sti(path);
  if (!existsSync(fuld)) throw new Error(`fandt ikke kampprogrammet: ${path}\n   (ledte i ${fuld})`);
  const data = JSON.parse(readFileSync(fuld, 'utf8'));
  const list = Array.isArray(data) ? data : data.fixtures;
  if (!Array.isArray(list)) throw new Error('fixtures skal være en liste (eller {fixtures:[...]}).');
  if (!Array.isArray(data) && data._note) console.log(`\nNote fra ${path}:\n  ${data._note}\n`);
  return list.filter((f) => f && f.home && f.away && f.round != null);
}

/** Holdlisten. Tager den FØRSTE eksporterede liste med navngivne hold. */
async function loadTeams(path) {
  const fuld = sti(path);
  if (!existsSync(fuld)) throw new Error(`fandt ikke holdlisten: ${path}\n   (ledte i ${fuld})`);
  const mod = await import(pathToFileURL(fuld).href);
  for (const v of Object.values(mod)) {
    if (Array.isArray(v) && v.length && typeof v[0]?.name === 'string') return v;
  }
  throw new Error(`${path} eksporterer ingen holdliste`);
}

// --- forbindelse -----------------------------------------------------------

let app;
if (process.env.FIRESTORE_EMULATOR_HOST) {
  console.log(`Emulator: ${process.env.FIRESTORE_EMULATOR_HOST}`);
  app = admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'spil-89af9' });
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  const nøgle = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  // `/sti/sa.json` er pladsholderen fra drift.md. Den slipper gennem alle
  // argument-tjek og fejler først dybt nede i Firebase-SDK'et med en besked,
  // der ikke nævner den. Sig det med det samme i stedet.
  if (!existsSync(nøgle)) {
    console.error(`\n⚠️  Fandt ingen service-account-nøgle på "${nøgle}".`);
    if (/^\/sti\//.test(nøgle)) console.error('   Det ser ud som pladsholderen fra docs/drift.md — sæt den rigtige sti ind.');
    console.error('');
    process.exit(1);
  }
  const sa = JSON.parse(readFileSync(nøgle, 'utf8'));
  app = admin.initializeApp({ credential: admin.credential.cert(sa) });
} else {
  app = admin.initializeApp();
}
const db = admin.firestore();
const { FieldValue, Timestamp } = admin.firestore;

// --- kørsel ----------------------------------------------------------------

async function run() {
  // --teams-only går FØR kampprogrammet læses. Den rører ikke en eneste kamp,
  // og krævede den alligevel en fixtures-fil, ville en tastefejl i en sti
  // kunne vælte en kørsel, der ikke skulle bruge filen til noget.
  if (TEAMS_ONLY) return teamsOnly(db.collection('games').doc(GAME_ID));

  const interval = parseRunder(RUNDER);
  let fixtures = loadFixtures(FIXTURES_PATH);
  tjekDubletter(fixtures);
  fixtures = iInterval(fixtures, interval);
  if (interval) console.log(`Runde ${interval.fra}-${interval.til}: ${fixtures.length} kampe.`);
  if (!fixtures.length) throw new Error('Ingen kampe at seede — tjek --fixtures og --runder.');

  const gameRef = db.collection('games').doc(GAME_ID);
  const matchesRef = gameRef.collection('matches');

  // Hvad står der ALLEREDE? Bruges til at lade spillede kampe være og til at
  // vise, hvad en kørsel faktisk ville ændre.
  const eksisterende = new Map();
  const snap = await matchesRef.get();
  for (const d of snap.docs) eksisterende.set(d.id, d.data());
  console.log(`games/${GAME_ID}/matches har ${eksisterende.size} kampe i forvejen.`);

  if (KICKOFFS_ONLY) return kickoffsOnly(fixtures, matchesRef, eksisterende);
  return fuldtSeed(fixtures, gameRef, matchesRef, eksisterende);
}

/**
 * Opdatér KUN kickoff. Rører hverken odds, elo eller resultat — og lader en
 * kamp med facit helt være: dens tidspunkt er historie, ikke en deadline.
 */
async function kickoffsOnly(fixtures, matchesRef, eksisterende) {
  const nuvaerende = new Map(
    [...eksisterende].map(([id, d]) => [id, { result: d.result, kickoffMs: d.kickoff?.toMillis?.() ?? null }]),
  );
  const { aendringer, mangler, spillet } = kickoffPlan(fixtures, nuvaerende);

  // DANSK TID med mærke. Den, der kl. 23 sammenligner med det officielle
  // program, skal ikke selv lægge to timer til på hver eneste linje.
  const vis = (ms) => (ms == null ? '—' : `${new Intl.DateTimeFormat('da-DK', {
    timeZone: 'Europe/Copenhagen', dateStyle: 'short', timeStyle: 'short',
  }).format(new Date(ms))}`);
  // ALLE ændringer vises. Tør-kørslens eneste formål er, at de kan læses
  // igennem — et loft på 8 ville bede operatøren tro på resten.
  const linjer = aendringer.map((a) => `  ${a.id}: ${vis(a.fraMs)} → ${vis(a.tilMs)}`);
  const aendrede = aendringer.length;

  const batch = db.batch();
  if (SKRIV) {
    for (const a of aendringer) {
      batch.update(matchesRef.doc(a.id), {
        kickoff: a.tilMs == null ? null : Timestamp.fromMillis(a.tilMs),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  }

  console.log(`\nKUN KICKOFF — odds, elo og resultater røres ikke.`);
  console.log(`  kampe i filen    : ${fixtures.length}`);
  console.log(`  allerede spillet : ${spillet} (tidspunktet er historie)`);
  console.log(`  IKKE SEEDET      : ${mangler.length}`);
  console.log(`  ændrede tider    : ${aendrede}  (tider vist i dansk tid)`);
  if (mangler.length) {
    // Det her er ikke en detalje. En kamp, der ikke er seedet aftenen før en
    // runde, får ingen deadline og kan ikke tippes.
    console.log(`\n⚠️  ${mangler.length} kampe i filen findes IKKE i spillet — de er aldrig blevet seedet:`);
    console.log(`   ${mangler.slice(0, 20).join(', ')}${mangler.length > 20 ? ` … (+${mangler.length - 20})` : ''}`);
  }
  if (linjer.length) console.log(`\n  ændringer:\n${linjer.join('\n')}`);

  if (!SKRIV) { console.log('\nTør-kørsel — der er IKKE skrevet noget. Kør igen med --skriv.\n'); return; }
  if (aendrede) await batch.commit();
  console.log(`\n✅ ${aendrede} kickoff-tider opdateret i games/${GAME_ID}.\n`);
}

/**
 * Opdatér KUN holdlisten på spillet.
 *
 * FORLØBET LIGGER I `scripts/lib/teamsOnly.mjs`, ikke her. Grunden er
 * konkret: `teamsVagt` var grundigt unit-testet, og alligevel kunne linjen,
 * der KALDER den, slettes herfra med hele suiten grøn — den ene linje, der
 * bærer forskellen mellem at advare og at afvise. Nu kan forløbet køres med
 * en fake Firestore, og en test tæller skrivningerne.
 *
 * Her bliver kun det, der kræver rigtige filer og en rigtig database.
 */
async function teamsOnly(gameRef) {
  const teams = await loadTeams(TEAMS_PATH);
  console.log(`Holdliste: ${teams.length} hold fra ${TEAMS_PATH}.`);
  await koerTeamsOnly({
    gameRef,
    teams,
    skriv: SKRIV,
    serverTimestamp: FieldValue.serverTimestamp(),
    log: (s) => console.log(s),
  });
}

/** Fuldt seed: hold-Elo på spillet + kampe med FROSNE odds. */
async function fuldtSeed(fixtures, gameRef, matchesRef, eksisterende) {
  const teams = await loadTeams(TEAMS_PATH);
  console.log(`Holdliste: ${teams.length} hold fra ${TEAMS_PATH}.`);

  // En kamp, der ALLEREDE har odds, må ikke få dem skrevet om — det var den
  // fælde, det gamle script havde. Seedes et program igen (fx fordi to runder
  // mangler), skal de eksisterende kampes odds stå urørt.
  const plan = seedPlan(fixtures, eksisterende);
  const medOdds = plan.springOver.length;
  if (medOdds) {
    console.log(`\n⚠️  ${medOdds} af kampene har allerede frosne odds. De springes over.`);
    console.log('   Skal odds genberegnes, sker det af recomputeSeasonElo på ULÅSTE kampe.');
  }

  // Den TAVSE fælde: teamElo giver 1500 for et navn, den ikke kender.
  const ukendte = ukendteHold(fixtures, teams);
  if (ukendte.length) {
    console.log(`\n⚠️  ${ukendte.length} holdnavne i kampprogrammet findes IKKE i holdlisten:`);
    console.log(`   ${ukendte.join(', ')}`);
    console.log('   De ville få neutral Elo (1500) uden en eneste fejlbesked.');
    if (SKRIV) throw new Error('Ukendte holdnavne — ret holdlisten eller kampprogrammet først.');
  }
  const matches = buildMatches(plan.skriv, teams);

  const eloCurrent = {};
  for (const t of teams) eloCurrent[t.name] = t.elo;

  let nye = 0;
  const batch = db.batch();
  for (const m of matches) {
    if (SKRIV) {
      batch.set(matchesRef.doc(m.id), {
        round: m.round,
        home: m.home,
        away: m.away,
        // kickoffMs — IKKE new Date(). Det fulde seed SKABER deadlines, så en
        // tidszone-løs streng her ville give tre forskellige tip-deadliner
        // afhængigt af, hvor scriptet blev kørt (UTC, dansk laptop, CI).
        kickoff: kickoffMs(m.kickoff) == null ? null : Timestamp.fromMillis(kickoffMs(m.kickoff)),
        eloHome: m.eloHome,
        eloAway: m.eloAway,
        odds: m.odds,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    nye += 1;
  }

  console.log(`\n  kampe i filen : ${fixtures.length}`);
  console.log(`  springes over : ${medOdds} (har allerede odds)`);
  console.log(`  skrives       : ${nye}`);
  const p = matches[0];
  if (p) console.log(`\n  eksempel: R${p.round} ${p.home}–${p.away}  odds ${p.odds['1']}/${p.odds.X}/${p.odds['2']}`);

  if (!SKRIV) { console.log('\nTør-kørsel — der er IKKE skrevet noget. Kør igen med --skriv.\n'); return; }

  // Pulje-/bonus-deadline sættes IKKE her — den styres af admin i
  // "Spil-tidsplan" (game.puljeLockAt).
  await gameRef.set({ teams, eloCurrent, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  if (nye) await batch.commit();
  console.log(`\n✅ ${nye} kampe seedet til games/${GAME_ID}/matches.\n`);
}

run()
  .then(() => app.delete())
  .then(() => process.exit(0))
  .catch((err) => { console.error('Seed-fejl:', err.message); process.exit(1); });
