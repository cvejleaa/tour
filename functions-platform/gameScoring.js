// ---------------------------------------------------------------------------
// functions-platform/gameScoring.js — afregning af point i den samlede platform
// (games/{gameId}/…). Spejler mønsteret fra recomputeStage: når en kamps facit
// (result) sættes, scores alle bets på kampen (1X2 + Chancen) og hver berørt
// spillers total genberegnes i games/{gameId}/players/{uid}.
//
// Saldoen kan ALDRIG gå i minus: totalen gulves ved 0 (Chancen-tab kan i teori
// summe under 0 hvis en tidligere runde faldt — men spilleren skal ikke i gæld).
// ---------------------------------------------------------------------------

const {
  scoreBet, updateElo, actualHomeFromOutcome, outcomeOdds,
  SPORT_PROFILER, sportProfil, ukendtSport, visSport, oddsParametre, eloParametre,
  championshipTeams, bundTeams, puljeScore, puljeKonfig, round1,
} = require('./superligaScoring');
// Gaten — hvor spillet begynder. Ét modul, spejlet til klienten, fordi den
// beslutning før lå fem steder i DEN HER fil alene.
const { gatedeKampe, startRundeFor, foerStart } = require('./startGate');
const { aktiveSpillere } = require('./forladSpil');
const {
  puljeKanAfregnes, rundeFacit, puljeKonfigFejl, puljeFaseFejl,
} = require('./puljeFacit');
const { meldAlarm, loesDriftAlarmer } = require('./driftlog');
// kickoffMs, matchOutcome og buildRoundContext bor i pointOpdeling, fordi
// KLIENTEN skal bruge samme runde-kontekst for at kunne kalde opdelPoint.
// Ét sted, ikke to — ellers driver serverens og fladens forestilling om
// 'hvornår er en kamp afgjort' fra hinanden.
const {
  opdelPoint, buildRoundContext, kickoffMs, matchOutcome,
} = require('./pointOpdeling');

/**
 * Firestore tager højst 500 operationer pr. batch. 400 giver luft til, at en
 * skrivning vokser med et felt eller to, uden at grænsen rykker sig.
 * Stod tidligere som tre separate lokale konstanter i samme fil.
 */
const BATCH_MAKS = 400;

/**
 * Sikkerhedsmargen foran kickoff, i millisekunder.
 *
 * `nowMs` fanges, når kaldet starter. Derefter LÆSES alle kampe, og batchen
 * committer sekunder senere. Uden margen kunne en kamp med kickoff 19:00:00
 * bestå låse-tjekket ved et klik 18:59:58 og få skrevet nye odds, EFTER at
 * tippene var låst — altså ændre pointværdien af tips, der allerede var
 * afgivet og ikke længere kunne rettes. Det er præcis dét, frysningen findes
 * for at forhindre.
 *
 * Prisen er, at en kamp i sit sidste minut før kickoff beholder lidt ældre
 * odds. Det er den rigtige vej at fejle: en pris, der er et minut gammel, er
 * bedre end en pris, der ændrer sig efter lukketid.
 */
const LAAS_MARGIN_MS = 60_000;

/**
 * Callable-lagets dryRun-regel: **kun et eksplicit `false` skriver.**
 *
 * BEMÆRK ASYMMETRIEN — den er med vilje, og den er nem at ødelægge:
 *
 *   recomputeSeasonElo(…, opts)   default = SKRIV     (maskinen kalder)
 *   dryRunFraKald(request.data)   default = TØRKØR    (et menneske kalder)
 *
 * Triggeren på facit-ændring kalder uden opts og SKAL skrive — ellers holder
 * odds tavst op med at blive opdateret. Et menneske, der trykker på en knap,
 * skal derimod se hvad der sker, før det sker (CLAUDE.md: tør-kørsel først).
 *
 * Reglen ligger her og ikke inde i callablen, fordi index.js ikke er
 * unit-testet: skrevet som `!== false` inde i handleren kunne den vendes til
 * `=== true` uden at én test sagde fra, og så ville forhåndsvisnings-knappen
 * skrive i produktionsdata ved første klik.
 * @param {object} [data] request.data fra callablen
 */
function dryRunFraKald(data) {
  return data?.dryRun !== false;
}

/**
 * Fejlen, repriceGameOdds afviser et ukendt sport med. `kode` er
 * HttpsError-koden — callablen oversætter den uden at kende teksten, så
 * beskeden bor ét sted og kan testes uden firebase-functions.
 *
 * Beskeden siger HVAD der er galt (den rå værdi), at INTET er sket, og hvad
 * admin skal gøre. "Handlingen blev afvist" lærer ingen noget.
 */
function ukendtSportFejl(gameId, vaerdi) {
  const kendte = Object.keys(SPORT_PROFILER).join(', ');
  const e = new Error(
    `Spillet "${gameId}" har sport ${visSport(vaerdi)}, som ikke er en kendt sport (kendte: ${kendte}). `
    + 'Der er IKKE omprist noget — heller ikke i tør-kørslen, for den ville vise fodboldens odds, som om de var rigtige. '
    + 'Står sport i scripts/games.mjs, så ret det dér og kør seedGames — først som tør-kørsel, så med seedGamesSkriv; skal feltet væk (fodbold), så fjern det i Firebase-konsollen — seedGames kan ikke fjerne et felt.',
  );
  e.kode = 'failed-precondition';
  return e;
}

/**
 * Oversæt en fejl fra recomputeSeasonElo til callablens fejl: en fejl med
 * `kode: 'failed-precondition'` (ukendtSportFejl) bliver en HttpsError med
 * SAMME besked, så fladen viser serverens tekst. Alt andet (Firestore-fejl,
 * programfejl) slipper uændret igennem — det er ikke admins at rette, og en
 * HttpsError med 'failed-precondition' ville påstå det.
 *
 * HttpsError gives med som argument, så modulet ikke kræver firebase-functions
 * og kan unit-testes.
 */
function tilHttpsFejl(err, HttpsError) {
  if (err && err.kode === 'failed-precondition') return new HttpsError('failed-precondition', err.message);
  return err;
}

/**
 * Ompris-knappens HELE vej ind i recomputeSeasonElo: afvisUkendtSport er sat,
 * og fejlen oversættes. Den bor her og ikke i index.js, fordi index.js ikke
 * kan unit-testes: dér var oversættelsen kun bevist som tekst, og et kald,
 * der blev flyttet UD af try'en (eller et `return` uden `await`), lod den rå
 * fejl gå forbi oversættelsen med hele suiten grøn. Fladen viste så
 * firebase's "INTERNAL" i stedet for beskeden om, hvad admin skal rette.
 */
async function omprisFraKnap(db, FieldValue, gameId, nowMs, dryRun, HttpsError) {
  try {
    return await recomputeSeasonElo(db, FieldValue, gameId, nowMs, { dryRun, afvisUkendtSport: true });
  } catch (err) {
    throw tilHttpsFejl(err, HttpsError);
  }
}

/** Er to odds-objekter ens (afrundet)? */
function oddsEqual(a, b) {
  if (!a || !b) return false;
  return a['1'] === b['1'] && a.X === b.X && a['2'] === b['2'];
}

/**
 * DEN LEVENDE ELO — ren. Hvert holds rating regnet fra SEED-værdierne
 * (game.teams) gennem alle spillede kampe i kronologisk rækkefølge, med et
 * Elo-snapshot pr. HEL runde. UAFRUNDET: det er de tal, odds prises af.
 *
 * Trukket ud af recomputeSeasonElo (D9.1), så der kun er ÉN prisvej. Kernen,
 * der opretter næste fases kampe (faseKampe.js), priser af den samme Map —
 * ikke af game.eloCurrent, der gemmes AFRUNDET. Prisede den af det afrundede
 * tal, ville næste facit ompris de nye kampe med småforskelle: to udledninger
 * af samme tal.
 *
 * @param {Array<{name:string, elo:*}>} seedTeams  game.teams
 * @param {Array<object>} matches  hele kamplisten (facit afgør, hvilke tæller)
 * @param {object} profil  sportProfil(game)
 * @returns {{elo:Map<string,number>, eloHistory:Array<{round:number, elo:object}>, get:(n:string)=>number}}
 *   get(navn) giver profilens start-Elo for et navn, der ikke står i listen.
 */
function levendeElo(seedTeams, matches, profil) {
  const start = profil.elo.START;
  const elo = new Map((seedTeams || []).map((t) => [t.name, Number(t.elo) || start]));
  const get = (n) => (elo.has(n) ? elo.get(n) : start);

  // Kampe pr. runde (til Elo-historik-snapshot, når en hel runde er spillet).
  const roundTotal = new Map();
  for (const m of matches) {
    if (m.round == null) continue;
    roundTotal.set(m.round, (roundTotal.get(m.round) || 0) + 1);
  }
  const roundPlayed = new Map();
  const eloHistory = []; // [{ round, elo: {name: rating} }] efter hver HELE runde

  // Spillede kampe i kronologisk rækkefølge → opdatér Elo. Efter den kamp der
  // fuldender en runde, gemmes et Elo-snapshot for den runde.
  const played = matches
    .filter((m) => matchOutcome(m))
    .sort((a, b) => (kickoffMs(a) ?? 0) - (kickoffMs(b) ?? 0));
  for (const m of played) {
    const outcome = matchOutcome(m);
    const { home, away } = updateElo(get(m.home), get(m.away), actualHomeFromOutcome(outcome), eloParametre(profil));
    elo.set(m.home, home);
    elo.set(m.away, away);
    if (m.round != null) {
      roundPlayed.set(m.round, (roundPlayed.get(m.round) || 0) + 1);
      if (roundPlayed.get(m.round) === roundTotal.get(m.round)
        && !eloHistory.some((h) => h.round === m.round)) {
        const rowSnap = {};
        for (const [n, r] of elo) rowSnap[n] = Math.round(r);
        eloHistory.push({ round: m.round, elo: rowSnap });
      }
    }
  }
  eloHistory.sort((a, b) => a.round - b.round);
  return { elo, eloHistory, get };
}

/**
 * "Levende" Elo: genberegn hvert holds rating fra SEED-værdierne (games/{id}.teams)
 * gennem alle spillede kampe i kronologisk rækkefølge, gem aktuel Elo på spillet,
 * og opdatér odds for FREMTIDIGE, ikke-låste kampe (kickoff i fremtiden, intet
 * facit). Låste/spillede kampe beholder deres frosne odds. Genberegnes fra bunden
 * hver gang (idempotent — et rettet resultat giver korrekt Elo uden dobbelt-tælling).
 *
 * dryRun REGNER ALT IGENNEM, MEN SKRIVER INTET. Den findes, fordi funktionen
 * indtil nu kun kunne startes af en facit-ændring: en model-ændring lå død i
 * koden, indtil en tilfældig kamp blev afgjort. Skal den kunne startes med en
 * knap, skal man kunne se hvad den ville gøre FØRST — CLAUDE.md kræver
 * tør-kørsel på alt, der skriver i produktionsdata, og det her rører hver
 * eneste ikke-låst kamps pointværdi.
 *
 * @param {{dryRun?: boolean, afvisUkendtSport?: boolean}} [opts]
 *   afvisUkendtSport: kast ukendtSportFejl i stedet for at advare (knappen).
 * @returns {Promise<{updated:number, aendringer:Array}>}
 *   antal kampe med opdaterede odds + hvad der (ville) ændre sig, kamp for
 *   kamp. Et ukendt sport sætter IKKE et felt i resultatet: triggeren læser
 *   ikke resultatet, og knappen kaster i stedet. Advarslen i loggen er
 *   triggerens eneste signal.
 */
async function recomputeSeasonElo(db, FieldValue, gameId, nowMs, opts = {}) {
  const dryRun = opts.dryRun === true;
  const gameRef = db.collection('games').doc(gameId);
  const gameSnap = await gameRef.get();
  const game = gameSnap.exists ? gameSnap.data() : null;
  // SPILLETS sportsprofil — både Elo-opdateringen og de friske odds. Et spil
  // uden `sport` er fodbold, så SL og PL regnes præcis som før profilen fandtes
  // (bevist mod facit i testdata/sportprofil-golden.json).
  const profil = sportProfil(game);
  // En SAT, men ukendt sport (tastefejl som 'handbold') regnes som fodbold.
  // Hvad der så sker, afhænger af, HVEM der kalder:
  //
  //   triggeren (facit ændrede sig)  → advarer og regner videre. Serveren må
  //     ikke gå i stå midt i en sæson for en tastefejl.
  //   knappen (repriceGameOdds)      → afvisUkendtSport: kaster, FØR der er
  //     regnet eller skrevet noget — også i tør-kørslen. En tør-kørsel, der
  //     viser fodboldens odds på et håndboldspil, ligner et rigtigt svar, og
  //     det næste klik skriver dem.
  //
  // Tjekket står FØR hold-tjekket nedenfor: et spil uden hold ville ellers
  // give tavst {updated: 0}, og fladen melder så "allerede i takt".
  //
  // Den rå værdi (visSport, ikke String(...)) står i advarslen: et array
  // ['fodbold'] skal ikke kunne stå som "fodbold" i loggen, og NaN ikke som
  // "null". Ikke på
  // Drift-kortet: driftlog.meldAlarm kræver en ny alarmtype (ALARM_TYPER,
  // tripwire-testen, alarm-mailen), og den er IKKE bygget. Vagten mod en
  // tastefejl i scripts/games.mjs er games.test.mjs (et sat sport skal findes
  // i registret); et sport, der kun er sat i konsollen, ses kun i Cloud-loggen
  // og som Ompris-knappens røde besked.
  // Der er TRE skriveveje: seed-football.mjs afviser at seede et ukendt sport
  // (scripts/lib/seedKampe.mjs), repriceGameOdds afviser at ompris det
  // (omprisFraKnap), og triggeren (recomputeGameMatch) advarer kun — bevidst.
  const ukendt = ukendtSport(game);
  if (ukendt) {
    if (opts.afvisUkendtSport === true) throw ukendtSportFejl(gameId, game.sport);
    console.warn(`recomputeSeasonElo(${gameId}): ukendt sport ${visSport(game.sport)} — regnes som ${profil.sport}. Ret game.sport.`);
  }

  const seedTeams = game ? game.teams : null;
  if (!Array.isArray(seedTeams) || seedTeams.length === 0) return { updated: 0, aendringer: [] };

  const snap = await gameRef.collection('matches').get();
  const matches = snap.docs.map((d) => ({ ...d.data(), id: d.id, ref: d.ref }));
  const { elo, eloHistory, get } = levendeElo(seedTeams, matches, profil);

  // Gem aktuel Elo + rundevis historik på spillet (til Elo-tabellen).
  const eloCurrent = {};
  for (const [n, r] of elo) eloCurrent[n] = Math.round(r);
  if (!dryRun) {
    await gameRef.set({ eloCurrent, eloHistory, eloUpdatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }

  // Friske odds på fremtidige, ikke-låste kampe — kun hvis de reelt ændrer sig.
  //
  // BATCHEN SKAL DELES. Firestore tager højst 500 operationer pr. batch, og før
  // denne funktion kunne startes med en knap, var grænsen teoretisk: odds blev
  // frisket op kamp for kamp, efterhånden som resultater faldt, så der var
  // sjældent mange ændringer ad gangen. En manuel omprisning af en HEL sæson,
  // hvor ingen kampe er spillet endnu, rammer 380 kampe i Premier League på én
  // gang. Det er stadig under 500, men margenen er 120 kampe — og en liga med
  // flere hold ville vælte den tavst, midt i en skrivning.
  // ÉN dryRun-vagt, ikke to. Her stod før en `if (!dryRun)` inde i løkken OG
  // en foran den afsluttende commit. Fjernede man den inderste alene, var hele
  // suiten grøn — skrivningen reddede sig kun på den yderste. To uafhængige
  // betingelser om samme sikkerhedsregel driver fra hinanden. Nu findes
  // ændringerne først, og skrivningen er ét blok bagefter.
  let updated = 0;
  const aendringer = [];
  for (const m of matches) {
    if (matchOutcome(m)) continue;                 // spillet
    const k = kickoffMs(m);
    // FAIL CLOSED. Stod før som `k != null && k <= nowMs`, altså: en kamp UDEN
    // brugbart kickoff (manglende felt, tom streng, uparsbar tekst) blev
    // omprist. Den kan ganske vist ikke tippes — reglerne afviser et tip uden
    // kickoff — men en vagt mod at røre låste kampe skal ikke hvile på, at en
    // anden regel tilfældigvis fanger hullet. Kender vi ikke tidspunktet, ved
    // vi heller ikke, om kampen er låst.
    //
    // Number.isFinite, ikke `k == null`: kickoffMs sender et NaN-kickoff
    // uændret videre (typeof NaN === 'number'), og `NaN <= x` er falsk — så en
    // null-test alene ville lade netop den slippe igennem.
    if (!Number.isFinite(k) || k <= nowMs + LAAS_MARGIN_MS) continue;
    const odds = outcomeOdds({ eloHome: get(m.home), eloAway: get(m.away), ...oddsParametre(profil) });
    if (oddsEqual(odds, m.odds)) continue;         // uændret
    // Før/efter opsamles ALTID, ikke kun ved dryRun: den, der trykker på
    // knappen for alvor, skal kunne se bagefter hvad der faktisk skete — og
    // det er den eneste kvittering, der findes. Der er ingen oddsHistory.
    aendringer.push({
      id: m.id, ref: m.ref, round: m.round ?? null, home: m.home, away: m.away,
      kickoff: k, foer: m.odds || null, efter: odds,
      eloHome: get(m.home), eloAway: get(m.away),
    });
    updated += 1;
  }

  if (!dryRun && aendringer.length) {
    let batch = db.batch();
    let iBatch = 0;
    for (const a of aendringer) {
      batch.update(a.ref, {
        odds: a.efter, eloHome: a.eloHome, eloAway: a.eloAway,
        oddsUpdatedAt: FieldValue.serverTimestamp(),
      });
      iBatch += 1;
      if (iBatch >= BATCH_MAKS) { await batch.commit(); batch = db.batch(); iBatch = 0; }
    }
    if (iBatch > 0) await batch.commit();
  }

  // `ref` er en Firestore-reference og kan ikke serialiseres til klienten;
  // eloHome/eloAway er kun til skrivningen. Plukkes eksplicit i stedet for at
  // destrukturere dem væk — et ubrugt navn er en lint-fejl, og en @ts-ignore
  // eller en eslint-disable ville skjule den næste, der kom til.
  return {
    updated,
    aendringer: aendringer.map((a) => ({
      id: a.id, round: a.round, home: a.home, away: a.away,
      kickoff: a.kickoff, foer: a.foer, efter: a.efter,
    })),
  };
}

/**
 * Match-id'er for kampe FØR spillets startrunde. De tæller IKKE med i
 * pointgivningen — så en sæson kan starte midt i uden at tidligere runders
 * tips giver point.
 *
 * REGNESTYKKET LIGGER I `startGate`, ikke her. Det stod før som en
 * dato-sammenligning på dette sted og fem andre — og en dato kan skære en
 * runde midt over, hvorefter combi-kuponen bygges af resten. Se startGate.js.
 *
 * @param {Array<object>} matches  HELE kamplisten (bruges til at oversætte et
 *   gammelt `startAt` til en runde — en delmængde ville give et andet svar)
 * @param {object|null} game       spil-dokumentet
 * @returns {Set<string>}
 */
function gatedIds(matches, game) {
  // ANDEN PARAMETER SKIFTEDE BETYDNING: den var før `startMs` (et tal), nu er
  // det spil-dokumentet. Et overset kald med et tal ville give
  // `Number.isFinite(undefined)` → falsk og `kickoffMs({kickoff: undefined})`
  // → null, altså en gate, der falder ÅBEN — alle runder tæller, tavst. En
  // gate, der fejler åbent, skal larme.
  if (typeof game === 'number') {
    throw new TypeError('gatedIds(matches, game): anden parameter er spil-dokumentet, ikke et tidspunkt.');
  }
  return gatedeKampe(matches, startRundeFor(game, matches));
}

/**
 * Genberegn én spillers total i et spil = summen af alle vedkommendes bet-point
 * PLUS combi-runde-bonusser, gulvet ved 0. Kør i transaktion, så to kampe der
 * afgøres tæt på hinanden ikke overskriver hinandens sum.
 * @param {object|null} roundCtx – runde-kontekst (buildRoundContext); uden den gives ingen bonus.
 * @param {Set<string>|null} gated – match-id'er før spillets start; deres bets tæller ikke med.
 */
async function recalcPlayerTotal(db, FieldValue, gameId, uid, roundCtx = null, gated = null, nowMs = Date.now()) {
  const betsQ = db.collection('games').doc(gameId).collection('bets').where('uid', '==', uid);
  const playerRef = db.collection('games').doc(gameId).collection('players').doc(uid);
  // Rækkerne ligger i et UNDERDOKUMENT, ikke på spilleren selv: stillingen
  // abonnerer live på alle liga-kammeraters players-dokumenter, så en hel
  // sæsons historik dér ville følge med ned ved hver eneste pointændring.
  //
  // Læseadgangen er indtil videre KUN spillerens egen (firestore.rules).
  // Liga-klausulen tilføjes sammen med den skærm, der skal bruge den.
  const detaljeRef = playerRef.collection('detalje').doc('opdeling');
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(betsQ);
    const playerSnap = await tx.get(playerRef);
    const all = snap.docs.map((d) => d.data());
    // Kampe før spillets starttidspunkt tæller ikke med (hverken bet-point eller combi).
    const bets = gated ? all.filter((b) => !gated.has(b.matchId)) : all;
    // Pulje-bonus (mesterskabsspil-tip) afregnes ved sæsonslut og gemmes på
    // spilleren; her lægges den bare oveni den løbende total.
    const puljeBonus = Number(playerSnap.exists ? playerSnap.data().bonusPoints : 0) || 0;

    const o = opdelPoint({ bets, roundCtx, puljeBonus, nowMs });

    tx.set(playerRef, {
      totalPoints: o.total,
      roundBonus: o.combi,
      // POINT PR. RUNDE — grundlaget for, at en liga kan starte ved runde N.
      // Det står på spilleren og ikke i en samling pr. liga, fordi en spiller
      // så ville have ét dokument pr. liga: `recalcPlayerTotal` læser ALLE
      // hans bets pr. kald (~200), og en ganget scoring ville koste 43.000
      // læsninger på en kampdag ved tre ligaer. Ligaens sum lægges i stedet af
      // `ligaPoint` — samme modul på server og flade.
      perRound: o.perRunde,
      // Ét felt og ikke fire løse: rubrikkerne skrives altid sammen, så de
      // ikke kan komme til at stamme fra hver sin kørsel.
      opdeling: { p1x2: o.p1x2, chance: o.chance, combi: o.combi, pulje: o.pulje },
      // Rubrikkerne PR. RUNDE (samme nøgler som perRound) — ligaens regnskab
      // lægges af dem i fladen fra ligaens startrunde, så regnskabstabellen
      // viser de point, der TÆLLER i ligaen (ejerens fund 20/10 2026).
      opdelingPerRunde: o.opdelingPerRunde,
      updatedAt: FieldValue.serverTimestamp(),
      // mergeFields, IKKE merge:true. merge:true DEEP-merger maps: en
      // rundenøgle, der forsvinder fra den nye vektor — et facit fjernes, en
      // kamp omscores til 0 eller flytter runde — ville blive STÅENDE, og
      // ligaens total ville tavst indeholde point, spillet ikke længere har.
      // mergeFields erstatter hvert felt HELT og bevarer, at dokumentet kan
      // mangle. Samme beslutning som `kampe`-dokumentet nedenfor ("FULD
      // ERSTATNING — bevidst ingen merge").
    }, { mergeFields: ['totalPoints', 'roundBonus', 'perRound', 'opdeling', 'opdelingPerRunde', 'updatedAt'] });

    // FULD ERSTATNING — bevidst ingen merge.
    //
    // Fjerner en admin et facit igen (den sti er understøttet), forsvinder
    // kampen fra o.kampe. Med merge ville dens række blive stående for evigt,
    // og detaljen ville vise point, spilleren ikke længere har. Den fejl
    // hverken fejler eller logger; den opdages først, når nogen undrer sig
    // over, at hans egen oversigt siger noget andet end stillingen.
    const kampe = {};
    for (const b of o.kampe) {
      kampe[b.matchId] = {
        pick: b.pick ?? null,
        points: Number(b.points) || 0,
        chanceStake: Number(b.chanceStake) || 0,
      };
    }
    tx.set(detaljeRef, { uid, kampe, updatedAt: FieldValue.serverTimestamp() });
  });
}

/**
 * Standard-konkurrence-rang (1, 2, 2, 4) efter totalPoints faldende.
 * Deterministisk tie-break på uid, så snapshots er stabile på tværs af kald.
 * @param {Array<{uid:string, totalPoints?:number}>} players
 * @returns {Map<string, number>} uid → rang
 */
function computeRanks(players) {
  const sorted = [...players].sort((a, b) => (
    (Number(b.totalPoints) || 0) - (Number(a.totalPoints) || 0)
    || String(a.uid).localeCompare(String(b.uid))
  ));
  const ranks = new Map();
  let rank = 0;
  let prevPts = null;
  sorted.forEach((p, i) => {
    const pts = Number(p.totalPoints) || 0;
    if (pts !== prevPts) { rank = i + 1; prevPts = pts; }
    ranks.set(p.uid, rank);
  });
  return ranks;
}

/**
 * Snapshot placeringer ved en rundes afslutning: sæt previousRank = spillerens
 * hidtidige rang (= rang før denne runde), og rank = ny rang efter runden. Så
 * kan facit-skærmen vise bevægelse ("du overhalede X"). Kør ÉN gang pr. runde —
 * kalderen vogter via game.snapshottedRounds, så resultat-rettelser ikke skubber
 * previousRank igen. Første snapshot giver previousRank = rank (ingen bevægelse).
 * @returns {Promise<{ranked:number}>}
 */
async function snapshotRoundRanks(db, FieldValue, gameId) {
  const playersSnap = await db.collection('games').doc(gameId).collection('players').get();
  // En forladt spiller står ikke i nogen stilling — og skal ikke skubbe de andres rang.
  const players = aktiveSpillere(playersSnap.docs).map((d) => ({ ...d.data(), uid: d.id, ref: d.ref }));
  if (players.length === 0) return { ranked: 0 };
  const ranks = computeRanks(players);
  const batch = db.batch();
  for (const p of players) {
    const newRank = ranks.get(p.uid);
    const prev = Number.isFinite(p.rank) ? p.rank : newRank;
    batch.update(p.ref, { previousRank: prev, rank: newRank });
  }
  await batch.commit();
  return { ranked: players.length };
}

/**
 * Er et pulje-tip KOMPLET efter spillets konfiguration? Bruges af admin-
 * status (gamePuljeStatus): med to spørgsmål (PL) må et halvt svar aldrig
 * tælle som "har tippet" — så springer ryk-mailen netop dem over, den er til
 * for (QC-fund). Bor HER og ikke i index.js, fordi index.js ikke unit-testes.
 */
function puljeTipKomplet(bet, konfig) {
  const k = konfig || { poolSize: 6, nedSize: 0 };
  if (!Array.isArray(bet?.championship) || bet.championship.length !== k.poolSize) return false;
  if (k.nedSize > 0 && (!Array.isArray(bet?.relegation) || bet.relegation.length !== k.nedSize)) return false;
  return true;
}

/**
 * Toppen fra den OFFICIELLE stilling — kun hvis stillingen er synket helt
 * igennem sæsonen (hvert hold har spillet `expectedPlayed`). Returnerer null
 * hvis stillingen mangler/ikke er komplet (så kalderen kan bruge en beregnet
 * fallback). Generaliseret fra det hårdkodede top-6/12-hold (opgave #8).
 * @returns {string[]|null}
 */
function officielTop(standings, expectedPlayed, poolSize, antalHold) {
  if (!Array.isArray(standings) || standings.length < antalHold) return null;
  if (expectedPlayed && !standings.every((r) => Number(r.played) === expectedPlayed)) return null;
  return standings.filter((r) => Number(r.rank) >= 1 && Number(r.rank) <= poolSize && r.teamName)
    .map((r) => r.teamName);
}

/**
 * Afregn pulje-tip NÅR puljen er afgjort. For en liga-pulje er det, når hele
 * grundspillet er spillet (top-6 fra slutstillingen); for en runde-pulje, når
 * facit-fasen er HELT lagt ind (holdene i semifinalerne). Scorer hvert
 * pulje-tip, gemmer point/correct på tippet + bonusPoints på spilleren, og
 * genberegner totalerne. Self-guardet og idempotent.
 *
 * TO UDLØSERE: triggeren (recomputeGameMatchCore, ved hver facit-ændring) og
 * knappen «🎖️ Afregn puljen» under Spil-tidsplan (callablen afregnPuljeNu).
 * Knappen findes, fordi en runde-pulje afgøres af, at en fase LÆGGES IND —
 * ikke af et resultat. Rettes en fejl i fasen efter finalen, ville intet
 * ellers starte afregningen (modstander-fund R4a; CLAUDE.md: «kun kan
 * startes af en tilfældig hændelse»).
 *
 * dryRun: regn alt og skriv INTET — hverken tip, spillere eller alarm. Én
 * vagt (`if (dryRun) return`) foran alle skrivninger, så en mutation af den
 * bliver rød (CLAUDE.md: én vagt pr. sikkerhedsregel). Uden dryRun er svaret
 * præcis som før ({settled}, evt. ingenPulje) — triggeren læser det ikke.
 *
 * KAN IKKE FEJLE TAVST (runde-puljen): kan puljen ikke afgøres, fordi
 * konfigurationen er forkert (puljeKonfigFejl) eller fasens kampe er lagt
 * forkert ind (puljeFaseFejl), logges det med console.error OG meldes som
 * drift-alarm `puljeFacit` (Drift-fanen + alarm-mailen). Alarmen lukkes, når
 * puljen kan afgøres igen (meldPuljeAlarm). En fase, der ALDRIG lægges ind,
 * giver intet resultat og dermed ingen kørsel her — den fanges af
 * times-sweep'et (facitVagt.puljeVagt) fra dagen efter fasens startdag.
 * Liga-puljerne har ingen af delene — deres afregning og læsninger er uændrede.
 * @returns {Promise<{settled:number, ingenPulje?:true, dryRun?:true, kanAfregnes?:boolean,
 *   aarsag?:string|null, fejl?:string[], facit?:string[]|null, tip?:number, point?:number}>}
 */
async function settlePuljeBets(db, FieldValue, gameId, matches, { dryRun = false, nowMs = Date.now() } = {}) {
  // HVORNÅR puljen er afgjort, afhænger af dens facit-kilde — og den står på
  // spillet. Derfor læses spillet FØRST. Før stod "alle kampe har mål" her
  // som eneste vagt, og det er forkert for en runde-pulje i BEGGE retninger:
  // efter kvartfinalerne har alle oprettede kampe mål, før semifinalerne er
  // lagt ind (for tidligt — og facit ville blive en tabel over hele
  // turneringen), og når de er lagt ind, mangler de mål til efter finalen.
  // Prædikatet er DELT med fladen (puljeFacit.puljeKanAfregnes), så PuljeTip
  // ikke kan vise et facit, serveren ikke afregner — eller omvendt.
  const gameRef = db.collection('games').doc(gameId);
  const gameSnap = await gameRef.get();
  const spil = gameSnap.exists ? gameSnap.data() : null;
  const konfig = puljeKonfig(spil);
  const rundePulje = konfig?.facitKilde === 'runde';
  const plan = await planPuljeAfregning(gameRef, gameId, spil, konfig, matches, nowMs);
  if (plan.fejl.length) {
    console.error(`settlePuljeBets(${gameId}): puljen kan ikke afgøres — ${plan.fejl.join('; ')}`);
  }
  if (plan.ingenPulje) {
    console.log(`settlePuljeBets(${gameId}): spillet har ingen pulje — ${plan.antalTip} tip afregnes IKKE.`);
  }

  // DEN ENE VAGT. Alt under denne linje skriver.
  if (dryRun) {
    return {
      settled: 0,
      dryRun: true,
      kanAfregnes: plan.kan,
      aarsag: plan.aarsag,
      fejl: plan.fejl,
      facit: plan.top ? [...plan.top] : null,
      tip: plan.tip.length,
      point: plan.tip.reduce((sum, t) => sum + t.bonus, 0),
    };
  }

  // AFREGNINGEN AFHÆNGER IKKE AF ALARMEN. Kaster Firestore i driftAlarmer,
  // skal pulje-tippene stadig afregnes — alarmen er et signal om puljen, ikke
  // en forudsætning for den. Konsollen er bagstopperen, og den næste kørsel
  // (triggeren eller times-sweep'ets facitVagt) melder alarmen igen.
  if (rundePulje) {
    try {
      await meldPuljeAlarm(db, FieldValue, { gameId, spil, tilstand: { kan: plan.kan, fejl: plan.fejl }, nowMs });
    } catch (err) {
      console.error(`settlePuljeBets(${gameId}): puljeFacit-alarmen kunne ikke skrives (afregningen fortsætter):`, err?.message || err);
    }
  }
  if (!plan.kan) return { settled: 0 };
  if (plan.ingenPulje) return { settled: 0, ingenPulje: true };
  if (!plan.tip.length) return { settled: 0 };

  const batch = db.batch();
  for (const t of plan.tip) {
    batch.update(t.ref, t.felter);
    const playerRef = db.collection('games').doc(gameId).collection('players').doc(t.uid);
    batch.set(playerRef, { bonusPoints: t.bonus }, { merge: true });
  }
  await batch.commit();

  // VIGTIGT: send runde-konteksten med. Uden den giver combiBonus 0, og
  // spillerne ville miste hele deres opsparede combi-bonus i samme øjeblik
  // puljen blev afregnet — altså præcis ved sæsonafslutningen.
  const roundCtx = buildRoundContext(matches);
  const uids = plan.tip.map((t) => t.uid);
  const CHUNK = 10;
  for (let i = 0; i < uids.length; i += CHUNK) {
    await Promise.all(uids.slice(i, i + CHUNK)
      .map((uid) => recalcPlayerTotal(db, FieldValue, gameId, uid, roundCtx, plan.gated)));
  }
  return { settled: uids.length };
}

/**
 * Runde-puljens tilstand: kan den afgøres — og hvis ikke, hvad er GALT?
 * null for alle andre puljer (og et spil uden pulje): de har ingen alarm.
 *
 * Tom `fejl` med `kan: false` er «ikke lagt ind endnu» — normalt, før fasens
 * startdag. Én funktion for begge udløsere af alarmen: afregningen
 * (settlePuljeBets, ved et facit eller knappen) og times-sweep'et
 * (facitVagt.puljeVagt, der fanger den UDEBLEVNE fase — den kommer der
 * intet resultat af, og så ville afregningen aldrig se den).
 * @returns {{kan:boolean, fejl:string[]}|null}
 */
function rundePuljeTilstand(spil, matches, nowMs) {
  const konfig = puljeKonfig(spil);
  if (konfig?.facitKilde !== 'runde') return null;
  const kan = puljeKanAfregnes(konfig, spil, matches);
  return {
    kan,
    fejl: kan ? [] : [...puljeKonfigFejl(spil), puljeFaseFejl(spil, matches, nowMs)].filter(Boolean),
  };
}

/**
 * Meld eller luk alarmen `puljeFacit` ud fra tilstanden — og kun sådan:
 *   fejl          → meld (Drift-fanen + alarm-mailen)
 *   kan afgøres   → luk, uanset om nogen har tippet
 *   ellers        → intet: «ikke lagt ind endnu» lukker IKKE en åben alarm.
 *                   Sletter admin en dublet-semifinale, er puljen stadig ikke
 *                   afgjort, og alarmen skal stå, til den er.
 * Kaster videre — kalderen bestemmer, hvad en fejlet alarm koster.
 * @returns {Promise<'meldt'|'loest'|null>}
 */
async function meldPuljeAlarm(db, FieldValue, {
  gameId, spil, tilstand, nowMs = Date.now(), meld = meldAlarm, loes = loesDriftAlarmer,
}) {
  if (!tilstand) return null;
  if (tilstand.fejl.length) {
    await meld(db, FieldValue, {
      type: 'puljeFacit', gameId, nowMs,
      besked: `Pulje-tippene i «${spil?.name || gameId}» kan ikke afregnes: ${tilstand.fejl.join('; ')}. `
        + 'Ret fasens kampe (eller pulje/faser i scripts/games.mjs), og tryk så 🎖️ Afregn puljen under Spil-tidsplan.',
    });
    return 'meldt';
  }
  if (tilstand.kan) {
    await loes(db, FieldValue, { type: 'puljeFacit', gameId, aktuelleKampIds: [], nowMs });
    return 'loest';
  }
  return null;
}

/**
 * REGN afregningen uden at skrive noget. Læser kun pulje-tippene, og kun når
 * puljen kan afgøres — som før: et liga-spil uden komplet sæson betaler ikke
 * en ekstra læsning pr. resultat.
 * @returns {Promise<{kan:boolean, fejl:string[], aarsag:string|null, ingenPulje:boolean,
 *   antalTip:number, top:Set<string>|null, gated:Set<string>|null,
 *   tip:Array<{uid:string, ref:object, felter:object, bonus:number}>}>}
 */
async function planPuljeAfregning(gameRef, gameId, spil, konfig, matches, nowMs) {
  // Kun en runde-pulje kan være "lagt forkert ind"; en liga-pulje venter
  // bare på sin sidste kamp. Samme tilstand som alarmen (rundePuljeTilstand).
  const runde = rundePuljeTilstand(spil, matches, nowMs);
  const ud = {
    kan: runde ? runde.kan : puljeKanAfregnes(konfig, spil, matches), fejl: runde ? runde.fejl : [], aarsag: null,
    ingenPulje: false, antalTip: 0, top: null, gated: null, tip: [],
  };
  if (!ud.kan) {
    ud.aarsag = ud.fejl.length ? ud.fejl.join('; ')
      : konfig?.facitKilde === 'runde' ? `${konfig.labels.top} er ikke lagt ind endnu`
        : 'ikke alle kampe har et resultat endnu';
    return ud;
  }

  const puljeSnap = await gameRef.collection('puljeBets').get();
  if (puljeSnap.empty) { ud.aarsag = 'ingen har afgivet et pulje-tip'; return ud; }
  ud.antalTip = puljeSnap.size;

  // SPILLET SKAL HAVE EN PULJE. Puljen er et tip om, hvem der ender i
  // mesterskabsspillet, og det findes kun i ligaer, der HAR et mesterskabsspil.
  //
  // Uden denne port var fladen eneste vagt — og fladen er ikke en vagt.
  // Sætter en admin `puljeLockAt` på et spil uden pulje (feltet vises i
  // Spil-tidsplan), accepterer firestore.rules puljetips, og de blev afregnet
  // her mod en top-6 af Premier Leagues tabel. Bonuspoint i en liga uden
  // pulje, én tastefejl væk. CLAUDE.md: serveren er eneste autoritet.
  if (!konfig) {
    ud.ingenPulje = true;
    ud.aarsag = 'spillet har ingen pulje';
    return ud;
  }
  ud.gated = gatedIds(matches, spil);
  // Kampe pr. runde = antal hold / 2. Formlen var før hårdkodet til 6 (12
  // hold): for PL's 20 hold gav den 30 forventede kampe pr. hold i stedet for
  // 18, så den officielle stilling ALDRIG blev godkendt, og fallbacken bar
  // afregningen ved et held (QC-fund). Udledes nu af spillets egen holdliste.
  const antalHold = Array.isArray(spil.teams) && spil.teams.length >= 2
    ? spil.teams.length : 12;
  const kampePrRunde = antalHold / 2;
  const expectedPlayed = matches.length % kampePrRunde === 0 ? matches.length / kampePrRunde : null;

  // Facit-kilden er et EKSPLICIT valg (QC-fund — heldet ovenfor må ikke være
  // valget): 'officiel' (SL) bruger standings med beregnet fallback;
  // 'egneKampe' (PL-efterår) beregner ALTID af spillets egne kampe og rører
  // aldrig standings — et halvsæson-spil må ikke kunne genafregnes mod
  // forårets officielle tabel og tavst overskrive december-resultatet.
  // 'runde' (semifinalisterne): holdene i facit-fasens kampe — samme
  // funktion, som prædikatet ovenfor har godkendt, og som fladen viser.
  let topListe;
  if (konfig.facitKilde === 'runde') topListe = rundeFacit(konfig, spil, matches);
  else if (konfig.facitKilde === 'egneKampe') topListe = championshipTeams(matches, konfig.poolSize);
  else {
    topListe = officielTop(spil.standings, expectedPlayed, konfig.poolSize, antalHold)
      || championshipTeams(matches, konfig.poolSize);
  }
  ud.top = new Set(topListe);
  const bund = konfig.nedSize > 0 ? new Set(bundTeams(matches, konfig.nedSize)) : null;

  const valg = { antal: konfig.poolSize, perTeam: konfig.perTeam, perfectBonus: konfig.perfectBonus };
  for (const d of puljeSnap.docs) {
    const { correct, points } = puljeScore(d.data().championship, ud.top, valg);
    // Bundspørgsmålet skrives KUN når spillet har et — SL-dokumenter får
    // ingen nye felter. Facit-kortet i fladen viser de to spørgsmål hver for
    // sig, så bonusPoints-summen har en forklaring (QC-krav).
    const ned = bund
      ? puljeScore(d.data().relegation, bund, { ...valg, antal: konfig.nedSize })
      : null;
    ud.tip.push({
      uid: d.id,
      ref: d.ref,
      felter: ned
        ? { correct, points, nedCorrect: ned.correct, nedPoints: ned.points }
        : { correct, points },
      bonus: points + (ned ? ned.points : 0),
    });
  }
  return ud;
}

// Firestore tager højst 30 værdier i en 'in'-forespørgsel.
const IN_MAKS = 30;

/**
 * Alle bets på de givne kampe, i bidder af IN_MAKS. Returnerer DOKUMENTERNE
 * (med `ref`), fordi triggeren skal kunne skrive de genscorede point tilbage;
 * prognosen tager bare `.data()`.
 *
 * Bor her og ikke i manuelFacit.js, fordi manuelFacit allerede kræver
 * gameScoring — den omvendte import ville være en cirkel.
 * @returns {Promise<Array<{ref:object, data:() => object}>>}
 */
async function betsPaaKampe(db, gameId, ids) {
  const col = db.collection('games').doc(gameId).collection('bets');
  const ud = [];
  for (let i = 0; i < ids.length; i += IN_MAKS) {
    const del = ids.slice(i, i + IN_MAKS);
    const snap = await col.where('matchId', 'in', del).get();
    for (const d of snap.docs) ud.push(d);
  }
  return ud;
}

/**
 * HVILKE KAMPES bets triggeren læser, når en kamps facit ændrer sig: ALLE
 * kampe i kampens RUNDE (som roundCtx kender dem — gatede kampe er ikke med).
 * En kamp uden runde, eller en kamp roundCtx ikke kender, giver kun sig selv.
 *
 * Det er HELE reglen for, hvem der genberegnes — ÉN vagt.
 * spillereTriggerenGenberegner tager bare uid'erne af det, der blev læst.
 *
 * HVORFOR RUNDEN. Combi-bonussen har intet kuponkrav
 * (pointOpdeling.combiPerRunde), så en spiller UDEN tip på rundens sidste
 * kamp får også sin combi, når kuponen bliver afgjort — og mister den igen,
 * hvis facit fjernes. Læste vi kun kampens egne bets, blev han aldrig
 * genberegnet: bonussen lå død, til noget andet tilfældigt genberegnede ham,
 * og rundens rang-snapshot blev taget af hans forældede total (task #14,
 * «KENDT HUL», rettet 11/2026).
 *
 * Hvorfor RUNDEN og ikke kun KUPONEN (iVindue): at afgrænse til kuponen ville
 * kode kupon-reglen en gang til, og en kupon kan blive komplet ved en
 * kickoff-flytning, der ikke starter nogen trigger — så kommer den udsatte
 * kamps eget facit og skal genberegne hele runden. En spiller med tip kun på
 * en udsat kamp genberegnes unødigt, men recalc er idempotent.
 *
 * Hvorfor ikke ALLE spillere: combi kræver tip i runden. Uden tip i runden
 * kan totalen ikke flytte sig af denne kamp.
 *
 * Delt med facit-prognosen (manuelFacit.pointPrognose), så tør-kørslen ikke
 * kan love point til nogen, triggeren aldrig rører.
 *
 * KASTER uden runde-kontekst. Et glemt argument ville ellers falde tilbage
 * til «kun kampens egne bets» — det gamle hul, tavst.
 *
 * @param {{byMatch:object}} roundCtx  buildRoundContext af de ikke-gatede kampe
 * @param {string} matchId
 * @returns {string[]}
 */
function kampeTriggerenLaeser(roundCtx, matchId) {
  if (!roundCtx || typeof roundCtx.byMatch !== 'object' || roundCtx.byMatch === null) {
    throw new TypeError('kampeTriggerenLaeser(roundCtx, matchId): mangler runde-konteksten — uden den genberegnes kun kampens egne tippere (combi-hullet).');
  }
  const runde = roundCtx.byMatch[matchId]?.round;
  if (runde == null) return [matchId];
  return Object.keys(roundCtx.byMatch).filter((id) => roundCtx.byMatch[id].round === runde);
}

/**
 * HVEM triggeren genberegner: uid'erne af de bets, kampeTriggerenLaeser fik
 * læst. Ingen egen regel — afgrænsningen til runden bor ÉT sted
 * (kampeTriggerenLaeser), så den ikke kan snævres tavst ind her.
 *
 * @param {Array<{uid?:string}>} bets
 * @returns {Set<string>}
 */
function spillereTriggerenGenberegner(bets) {
  const ud = new Set();
  for (const b of bets || []) if (b && b.uid) ud.add(b.uid);
  return ud;
}

/**
 * Kernen bag recomputeGameMatch (uden Cloud Functions-wrapper, så den kan
 * unit-testes). Scorer alle bets på en kamp og genberegner ALLE med tip i
 * kampens runde (kampeTriggerenLaeser) — ikke kun dem med tip på kampen.
 * @returns {Promise<{rescored:number, players:number}>}
 */
async function recomputeGameMatchCore(db, FieldValue, gameId, matchId, matchData) {
  // Facit kan også være FJERNET igen (admin rettede en fejl). Så skal pointene
  // rulles tilbage: scoreBet giver 0 uden gyldigt facit, og totalerne
  // genberegnes nedenfor. Uden det ville spillerne beholde point for en kamp,
  // der ikke længere har et resultat.
  const result = matchData?.result || null;
  const odds = matchData?.odds || null;

  // Spillets startrunde: kampe før den tæller ikke med. Er DENNE kamp før
  // start, scorer vi den slet ikke.
  //
  // GENVEJEN ER IKKE PYNT. Står `startRound` på spillet, kan spørgsmålet
  // besvares af kampens eget rundenummer, og så slipper vi for at læse hele
  // kamplisten. Uden den ville hver skrivning på en GATET kamp koste 132
  // læsninger for Superligaen, hvor den før kostede nul — en regression, jeg
  // selv indførte ved at flytte hentningen op. Kun det gamle `startAt` kræver
  // listen, fordi en dato ikke kan oversættes til en runde ud fra én kamp.
  const gameRef = db.collection('games').doc(gameId);
  const gameSnap = await gameRef.get();
  const game = gameSnap.exists ? gameSnap.data() : null;
  if (Number.isFinite(game?.startRound) && foerStart(matchData, game.startRound)) {
    return { rescored: 0, players: 0, gated: true };
  }

  const alleSnap = await gameRef.collection('matches').get();
  const allMatches = alleSnap.docs.map((d) => ({ ...d.data(), id: d.id }));
  const gated = gatedIds(allMatches, game);
  if (gated.has(matchId)) return { rescored: 0, players: 0, gated: true };

  // Runde-kontekst til combi-bonussen OG til udvælgelsen nedenfor. Kampe før
  // spillets start udelukkes fra både konteksten og totalen — listen og gaten
  // er hentet øverst. Bygges af kampenes facit, ikke af bet-point, så den kan
  // bygges før genscoringen.
  const roundCtx = buildRoundContext(allMatches.filter((m) => !gated.has(m.id)));

  // Bets på HELE RUNDENS kampe (én 'in'-forespørgsel pr. 30 kampe), ikke kun
  // på denne — se kampeTriggerenLaeser.
  const betDocs = await betsPaaKampe(db, gameId, kampeTriggerenLaeser(roundCtx, matchId));

  let batch = db.batch();
  let ops = 0;
  const batches = [batch];
  const bump = () => { if (++ops >= BATCH_MAKS) { batch = db.batch(); batches.push(batch); ops = 0; } };

  // ALLE med tip i rundens kampe — ikke kun dem, hvis point ændrede sig, og
  // ikke kun dem med tip på netop denne kamp.
  //
  // Rammer en spiller forkert uden at bruge Chancen, går hans point 0 → 0.
  // Samlede vi kun de ændrede, blev han aldrig genberegnet — og var det
  // rundens SIDSTE kamp, fik han derfor aldrig sin combi-bonus for én fejl.
  // Det samme gælder den, der slet ikke tippede kampen: combi har intet
  // kuponkrav, så hans bonus afgøres også af denne kamps facit. Fejlen var
  // tavs begge gange: totalen var jo "rigtig" set fra hver enkelt kamp.
  // Udvælgelsen er delt med facit-prognosen — se kampeTriggerenLaeser.
  const berorteUids = spillereTriggerenGenberegner(betDocs.map((d) => d.data()));
  let rescored = 0;
  for (const d of betDocs) {
    const bet = d.data();
    // KUN denne kamps bets scores med dens facit. Rundens andre bets er læst
    // for at finde spillerne, ikke for at blive scoret om — en anden regel end
    // udvælgelsen. Uden den fik de denne kamps facit.
    if (bet.matchId !== matchId) continue;
    const pts = scoreBet(bet, result, odds);
    if (Number(bet.points) === pts) continue; // uændret → spar skrivningen
    batch.update(d.ref, { points: pts });
    bump();
    rescored += 1;
  }
  // Ingen tidlig exit på rescored === 0. Ud over combi-bonussen hang både
  // runde-snapshottet og puljeafregningen nedenfor på den: ramte HELE feltet
  // forkert på en kamp, blev runden aldrig snapshottet, og Runde-Botten fyrede
  // aldrig. Triggeren (index.js) returnerer allerede, når facit er uændret, så
  // vi kommer kun herned, når der faktisk er sket noget.
  if (rescored) for (const b of batches) await b.commit();

  // Totalerne genberegnes FØR snapshottet nedenfor, så rundens rang bygger på
  // friske totaler — også for den, der ikke tippede kampen.
  const uids = [...berorteUids];
  const CHUNK = 10;
  for (let i = 0; i < uids.length; i += CHUNK) {
    await Promise.all(uids.slice(i, i + CHUNK).map((uid) => recalcPlayerTotal(db, FieldValue, gameId, uid, roundCtx, gated)));
  }

  // Placerings-snapshot: når denne kamps runde netop er blevet HELT afgjort,
  // gem hver spillers rang (én gang pr. runde) → facit-skærmens "du overhalede X".
  const round = roundCtx.byMatch[matchId]?.round;
  const rc = round != null ? roundCtx.rounds[round] : null;
  let roundCompleted = null; // sat første gang en runde bliver HELT afgjort
  // KUPONENS kampe, ikke rundens. En runde med en udsat kamp gøres op, når
  // ugens kampe er afgjort — ellers ville snapshottet og Runde-Botten hænge en
  // måned og først fyre, når alle havde glemt runden.
  if (rc && rc.combiCount > 0 && rc.combiSettled === rc.combiCount) {
    const gRef = db.collection('games').doc(gameId);
    const gsnap = await gRef.get();
    const done = (gsnap.exists && Array.isArray(gsnap.data().snapshottedRounds))
      ? gsnap.data().snapshottedRounds : [];
    if (!done.includes(round)) {
      await snapshotRoundRanks(db, FieldValue, gameId);
      await gRef.set({ snapshottedRounds: FieldValue.arrayUnion(round) }, { merge: true });
      roundCompleted = round; // → Runde-Botten (index.js) poster opslaget
    }
  }

  // Pulje-tip: afregn, når puljen er afgjort — for en liga-pulje, når HELE
  // grundspillet er spillet; for en runde-pulje, når facit-fasen er lagt ind
  // (puljeFacit.puljeKanAfregnes). Self-guardet + idempotent — rescores, hvis
  // et resultat senere rettes.
  await settlePuljeBets(db, FieldValue, gameId, allMatches);

  return { rescored, players: uids.length, roundCompleted };
}

/**
 * Genberegn ALLE spilleres totaler i et spil med den aktuelle gate (startrunden).
 * Bruges når admin lige har sat/ændret starttidspunktet, så tidligere runders
 * point fjernes fra stillingen med det samme (triggeren rører kun berørte
 * spillere, når en kamp skrives). Ren aggregering — ændrer ikke bet-point.
 * @returns {Promise<{players:number, gatedMatches:number}>}
 */
async function recomputeAllPlayerTotals(db, FieldValue, gameId) {
  const gameRef = db.collection('games').doc(gameId);
  const [gameSnap, matchesSnap, playersSnap] = await Promise.all([
    gameRef.get(),
    gameRef.collection('matches').get(),
    gameRef.collection('players').get(),
  ]);
  const allMatches = matchesSnap.docs.map((d) => ({ ...d.data(), id: d.id }));
  const gated = gatedIds(allMatches, gameSnap.exists ? gameSnap.data() : null);
  const roundCtx = buildRoundContext(allMatches.filter((m) => !gated.has(m.id)));
  const uids = playersSnap.docs.map((d) => d.id);
  const CHUNK = 10;
  for (let i = 0; i < uids.length; i += CHUNK) {
    await Promise.all(uids.slice(i, i + CHUNK).map((uid) => recalcPlayerTotal(db, FieldValue, gameId, uid, roundCtx, gated)));
  }
  return { players: uids.length, gatedMatches: gated.size };
}

/**
 * Genscorer ALLE bets mod deres kamps facit — og genberegner derefter totalerne.
 *
 * Findes, fordi `bets/{id}.points` kun skrives af recomputeGameMatchCore, som
 * kun kaldes når en kamps `result` ÆNDRER sig. Ændrer vi selve pointreglen —
 * som med træf-bonussen i august 2026 — bliver hvert eksisterende bet stående
 * med sit gamle tal, og recomputeAllPlayerTotals hjælper ikke: den aggregerer
 * kun, den scorer ikke om.
 *
 * Uden den ville skærmene modsige hinanden UDEN en fejlbesked: Tip-fladen
 * regner "Ramt +X" live af den nye regel, mens Mine tips viser det gemte tal,
 * og `chance` — som udledes som (gemte point − 1X2-point) — ville gå i minus
 * med ét point pr. træffer. En spiller, der aldrig har brugt Chancen, ville se
 * "⚡ Chancen: −10,0".
 *
 * Gatede kampe (før startrunden) springes over, præcis som
 * recomputeGameMatchCore gør — de scores aldrig, og deres point tæller ikke.
 *
 * @param {boolean} [dryRun=true] TÆL hvad der ville ændre sig, skriv INTET.
 *   Default er tør-kørsel med vilje: den her rører hver eneste spillers point.
 * @returns {{bets:number, aendrede:number, delta:number, dryRun:boolean,
 *            eksempler:Array, players?:number}}
 */
async function rescoreAllBets(db, FieldValue, gameId, { dryRun = true } = {}) {
  const gameRef = db.collection('games').doc(gameId);
  const [gameSnap, matchesSnap, betsSnap] = await Promise.all([
    gameRef.get(),
    gameRef.collection('matches').get(),
    gameRef.collection('bets').get(),
  ]);
  const allMatches = matchesSnap.docs.map((d) => ({ ...d.data(), id: d.id }));
  const gated = gatedIds(allMatches, gameSnap.exists ? gameSnap.data() : null);
  const byId = new Map(allMatches.map((m) => [m.id, m]));

  let batch = db.batch();
  let ops = 0;
  const batches = [batch];
  const bump = () => { if (++ops >= BATCH_MAKS) { batch = db.batch(); batches.push(batch); ops = 0; } };

  let aendrede = 0;
  let delta = 0;
  const eksempler = [];
  for (const d of betsSnap.docs) {
    const bet = d.data();
    const m = byId.get(bet.matchId);
    // Ukendt kamp: rør den ikke. Et bet uden kampdokument har ingen facit at
    // scores mod, og at nulstille det ville tage point fra spilleren.
    if (!m || gated.has(bet.matchId)) continue;
    const pts = scoreBet(bet, m.result || null, m.odds || null);
    const foer = Number(bet.points) || 0;
    if (foer === pts) continue;
    aendrede += 1;
    delta = round1(delta + (pts - foer));
    if (eksempler.length < 5) eksempler.push({ matchId: bet.matchId, uid: bet.uid, foer, efter: pts });
    // lastUpdateTime er ikke pynt: uden den læser vi bettet, regner, og skriver
    // vores forældede tal ovenpå, hvis noget rørte kampen imens. Konkret set i
    // emulatoren: fjernes et facit midt i kørslen, beholder spilleren sine
    // point for den kamp — og tallet bliver stående, til noget andet rører den.
    // Preconditionen fejler HELE batchen ved konflikt; det er den rigtige
    // reaktion, for kørslen er idempotent og kan bare gentages.
    if (!dryRun) { batch.update(d.ref, { points: pts }, { lastUpdateTime: d.updateTime }); bump(); }
  }
  if (dryRun) {
    return { bets: betsSnap.size, aendrede, delta, dryRun: true, eksempler };
  }
  if (aendrede) for (const b of batches) await b.commit();
  // Totalerne SKAL med i samme kald. Kørte man kun genscoringen, ville
  // players.totalPoints stå på den gamle sum, indtil noget andet tilfældigvis
  // udløste en genberegning — og stillingen ville være forkert imens.
  const { players } = await recomputeAllPlayerTotals(db, FieldValue, gameId);
  return { bets: betsSnap.size, aendrede, delta, dryRun: false, eksempler, players };
}

module.exports = {
  levendeElo, LAAS_MARGIN_MS, oddsEqual,
  recalcPlayerTotal, recomputeGameMatchCore, recomputeSeasonElo, rescoreAllBets,
  dryRunFraKald, ukendtSportFejl, tilHttpsFejl, omprisFraKnap,
  computeRanks, snapshotRoundRanks,
  settlePuljeBets, rundePuljeTilstand, meldPuljeAlarm, officielTop, puljeTipKomplet, gatedIds, recomputeAllPlayerTotals,
  spillereTriggerenGenberegner, kampeTriggerenLaeser, betsPaaKampe, IN_MAKS,
};
