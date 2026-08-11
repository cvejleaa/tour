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
  scoreBet, ELO, updateElo, actualHomeFromOutcome, outcomeOdds,
  championshipTeams, puljeScore, round1,
} = require('./superligaScoring');
// Gaten — hvor spillet begynder. Ét modul, spejlet til klienten, fordi den
// beslutning før lå fem steder i DEN HER fil alene.
const { gatedeKampe, startRundeFor, foerStart } = require('./startGate');
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

/** Er to odds-objekter ens (afrundet)? */
function oddsEqual(a, b) {
  if (!a || !b) return false;
  return a['1'] === b['1'] && a.X === b.X && a['2'] === b['2'];
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
 * @param {{dryRun?: boolean}} [opts]
 * @returns {Promise<{updated:number, aendringer:Array}>} antal kampe med
 *   opdaterede odds + hvad der (ville) ændre sig, kamp for kamp
 */
async function recomputeSeasonElo(db, FieldValue, gameId, nowMs, opts = {}) {
  const dryRun = opts.dryRun === true;
  const gameRef = db.collection('games').doc(gameId);
  const gameSnap = await gameRef.get();
  const seedTeams = gameSnap.exists ? gameSnap.data().teams : null;
  if (!Array.isArray(seedTeams) || seedTeams.length === 0) return { updated: 0, aendringer: [] };

  const elo = new Map(seedTeams.map((t) => [t.name, Number(t.elo) || ELO.START]));
  const get = (n) => (elo.has(n) ? elo.get(n) : ELO.START);

  const snap = await gameRef.collection('matches').get();
  const matches = snap.docs.map((d) => ({ id: d.id, ref: d.ref, ...d.data() }));

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
    const { home, away } = updateElo(get(m.home), get(m.away), actualHomeFromOutcome(outcome));
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
    const odds = outcomeOdds({ eloHome: get(m.home), eloAway: get(m.away) });
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
      // Ét felt og ikke fire løse: rubrikkerne skrives altid sammen, så de
      // ikke kan komme til at stamme fra hver sin kørsel.
      opdeling: { p1x2: o.p1x2, chance: o.chance, combi: o.combi, pulje: o.pulje },
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

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
  const players = playersSnap.docs.map((d) => ({ uid: d.id, ref: d.ref, ...d.data() }));
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
 * Top-6 (mesterskabsspil) fra den OFFICIELLE stilling — kun hvis stillingen er
 * synket helt igennem grundspillet (hvert hold har spillet `expectedPlayed`).
 * Returnerer null hvis stillingen mangler/ikke er komplet (så kalderen kan bruge
 * en beregnet fallback).
 * @returns {string[]|null}
 */
function officialTop6(standings, expectedPlayed) {
  if (!Array.isArray(standings) || standings.length < 12) return null;
  if (expectedPlayed && !standings.every((r) => Number(r.played) === expectedPlayed)) return null;
  return standings.filter((r) => Number(r.rank) >= 1 && Number(r.rank) <= 6 && r.teamName)
    .map((r) => r.teamName);
}

/**
 * Afregn pulje-tip (mesterskabsspil-forudsigelse) NÅR hele grundspillet er
 * spillet. Beregner top-6 fra slutstillingen, scorer hvert pulje-tip, gemmer
 * point/correct på tippet + bonusPoints på spilleren, og genberegner totalerne.
 * Self-guardet (gør intet før alle kampe har mål) og idempotent.
 * @returns {Promise<{settled:number}>}
 */
async function settlePuljeBets(db, FieldValue, gameId, matches) {
  const goalOf = (g) => (g == null || g === '' ? NaN : Number(g));
  const complete = matches.length > 0 && matches.every(
    (m) => Number.isFinite(goalOf(m.homeGoals)) && Number.isFinite(goalOf(m.awayGoals)),
  );
  if (!complete) return { settled: 0 };

  const gameRef = db.collection('games').doc(gameId);
  const puljeSnap = await gameRef.collection('puljeBets').get();
  if (puljeSnap.empty) return { settled: 0 };

  // SPILLET SKAL HAVE EN PULJE. Puljen er et tip om, hvem der ender i
  // mesterskabsspillet, og det findes kun i ligaer, der HAR et mesterskabsspil.
  //
  // Uden denne port var fladen eneste vagt — og fladen er ikke en vagt.
  // Sætter en admin `puljeLockAt` på et spil uden pulje (feltet vises i
  // Spil-tidsplan), accepterer firestore.rules puljetips, og de blev afregnet
  // her mod en top-6 af Premier Leagues tabel. Bonuspoint i en liga uden
  // pulje, én tastefejl væk. CLAUDE.md: serveren er eneste autoritet.
  const gameSnap = await gameRef.get();
  if (!gameSnap.exists || !gameSnap.data().pulje) {
    console.log(`settlePuljeBets(${gameId}): spillet har ingen pulje — ${puljeSnap.size} tip afregnes IKKE.`);
    return { settled: 0, ingenPulje: true };
  }
  // Top-6 fra den OFFICIELLE stilling (autoritativ); beregnet tabel kun som
  // fallback, hvis stillingen ikke er synket helt igennem grundspillet.
  const standings = gameSnap.data().standings;
  const gated = gatedIds(matches, gameSnap.data());
  const expectedPlayed = matches.length % 6 === 0 ? matches.length / 6 : null;
  const top6 = new Set(officialTop6(standings, expectedPlayed) || championshipTeams(matches));
  const batch = db.batch();
  const uids = [];
  for (const d of puljeSnap.docs) {
    const { correct, points } = puljeScore(d.data().championship, top6);
    batch.update(d.ref, { correct, points });
    const playerRef = db.collection('games').doc(gameId).collection('players').doc(d.id);
    batch.set(playerRef, { bonusPoints: points }, { merge: true });
    uids.push(d.id);
  }
  await batch.commit();

  // VIGTIGT: send runde-konteksten med. Uden den giver combiBonus 0, og
  // spillerne ville miste hele deres opsparede combi-bonus i samme øjeblik
  // puljen blev afregnet — altså præcis ved sæsonafslutningen.
  const roundCtx = buildRoundContext(matches);
  const CHUNK = 10;
  for (let i = 0; i < uids.length; i += CHUNK) {
    await Promise.all(uids.slice(i, i + CHUNK)
      .map((uid) => recalcPlayerTotal(db, FieldValue, gameId, uid, roundCtx, gated)));
  }
  return { settled: uids.length };
}

/**
 * Kernen bag recomputeGameMatch (uden Cloud Functions-wrapper, så den kan
 * unit-testes). Scorer alle bets på en kamp og genberegner berørte spillere.
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
  const allMatches = alleSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const gated = gatedIds(allMatches, game);
  if (gated.has(matchId)) return { rescored: 0, players: 0, gated: true };

  const betsSnap = await db
    .collection('games').doc(gameId).collection('bets')
    .where('matchId', '==', matchId).get();

  let batch = db.batch();
  let ops = 0;
  const batches = [batch];
  const bump = () => { if (++ops >= BATCH_MAKS) { batch = db.batch(); batches.push(batch); ops = 0; } };

  // ALLE, der har tippet på kampen — ikke kun dem, hvis point ændrede sig.
  //
  // Rammer en spiller forkert uden at bruge Chancen, går hans point 0 → 0.
  // Samlede vi kun de ændrede, blev han aldrig genberegnet — og var det
  // rundens SIDSTE kamp, fik han derfor aldrig sin combi-bonus for én fejl.
  // Bonussen kræver, at hele runden er spillet, så den kunne kun komme fra
  // netop denne genberegning. Fejlen var tavs: totalen var jo "rigtig" set fra
  // hver enkelt kamp.
  const berorteUids = new Set();
  let rescored = 0;
  for (const d of betsSnap.docs) {
    const bet = d.data();
    if (bet.uid) berorteUids.add(bet.uid);
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

  // Runde-kontekst til combi-bonussen. Kampe før spillets start udelukkes fra
  // både konteksten og totalen — listen og gaten er hentet øverst.
  const roundCtx = buildRoundContext(allMatches.filter((m) => !gated.has(m.id)));

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

  // Pulje-tip: afregn mesterskabsspil-tippene når HELE grundspillet er spillet
  // (self-guardet + idempotent — rescores hvis et resultat senere rettes).
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
  const allMatches = matchesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
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
  const allMatches = matchesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
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
  recalcPlayerTotal, recomputeGameMatchCore, recomputeSeasonElo, rescoreAllBets,
  dryRunFraKald,
  computeRanks, snapshotRoundRanks,
  settlePuljeBets, officialTop6, gatedIds, recomputeAllPlayerTotals,
};
