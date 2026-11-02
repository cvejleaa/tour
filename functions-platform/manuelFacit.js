// ---------------------------------------------------------------------------
// functions-platform/manuelFacit.js — FACIT I HÅNDEN. Nødbremsen.
//
// Kernerne bag de to callables saetFacitManuelt og frigivFacitTilSynk
// (index.js). De bor her og ikke i index.js, fordi index.js ikke kan
// unit-testes — og det her er en vej, der skriver point i produktion.
//
// HVORFOR DEN FINDES. Indtil nu var den eneste "manuelle" vej
// Firebase-konsollen: reglerne tillod det, men admin-guiden og strandede-
// alarmen henviste til en flade, der ikke fandtes. Et spil uden kilde (fx et
// håndboldspil, før provideren er i drift) havde altså slet ingen facit-vej.
//
// HVAD DEN GØR — og hvad den med vilje IKKE gør:
//   * Den skriver kun FACIT-FELTERNE (facit.js:facitFelter) + mærket
//     `resultatKilde: 'manuel'`. Point, Elo, odds og Runde-Botten klares af den
//     eksisterende trigger recomputeGameMatch (index.js), der reagerer på, at
//     `result` ændrer sig. Der er ingen parallel afregning her — tør-kørslen
//     REGNER bare, hvad triggeren vil gøre, med de samme funktioner.
//   * Tør-kørsel er standard (dryRunFraKald i callablen): et menneske skal se
//     1/X/2 før → efter og de point, der flytter sig, før det sker.
//   * Kampen skal være begyndt. Et facit på en kamp, der stadig kan tippes,
//     ville afregne tips, mens andre stadig kunne afgive deres.
//   * Mærket fredner kampen for resultat-synken (syncResultsCore springer den
//     over). Ellers ville en fejlparsende kilde vinde over nødbremsen ved
//     næste kørsel. frigivFacitTilSynk fjerner mærket igen.
// ---------------------------------------------------------------------------

const {
  facitFejl, facitFelter, erKampspil, erManuelFacit, RESULTAT_KILDE_MANUEL,
} = require('./facit');
const { erKnockout } = require('./faser');
const { scoreBet, round1 } = require('./superligaScoring');
const { buildRoundContext, combiPerRunde, kickoffMs } = require('./pointOpdeling');
const { gatedIds, spillereTriggerenGenberegner } = require('./gameScoring');
const { createHash } = require('node:crypto');

/** Fejl med en HttpsError-kode — oversættes af tilHttpsFejl i callablen. */
function fejl(kode, besked) {
  const e = new Error(besked);
  e.kode = kode;
  return e;
}
const KODER = new Set(['invalid-argument', 'not-found', 'failed-precondition']);

/**
 * Kernens fejl → callablens HttpsError med SAMME besked. Alt andet slipper
 * uændret igennem (programfejl er ikke admins at rette). HttpsError gives
 * med, så modulet kan testes uden firebase-functions.
 */
function tilHttpsFejl(err, HttpsError) {
  if (err && KODER.has(err.kode)) return new HttpsError(err.kode, err.message);
  return err;
}

// Firestore tager højst 30 værdier i en 'in'-forespørgsel.
const IN_MAKS = 30;

/** Alle bets på de givne kampe, i bidder af 30. */
async function betsPaaKampe(db, gameId, ids) {
  const col = db.collection('games').doc(gameId).collection('bets');
  const ud = [];
  for (let i = 0; i < ids.length; i += IN_MAKS) {
    const del = ids.slice(i, i + IN_MAKS);
    const snap = await col.where('matchId', 'in', del).get();
    for (const d of snap.docs) ud.push(d.data());
  }
  return ud;
}

/** Fælles opslag: spil + kamp + hele kamplisten. Kaster med dansk besked. */
async function hentKamp(db, gameId, matchId) {
  if (typeof gameId !== 'string' || !gameId.trim()) throw fejl('invalid-argument', 'Mangler spil-id.');
  if (typeof matchId !== 'string' || !matchId.trim()) throw fejl('invalid-argument', 'Mangler kamp-id.');
  const gameRef = db.collection('games').doc(gameId);
  const gameSnap = await gameRef.get();
  if (!gameSnap.exists) throw fejl('not-found', `Spillet "${gameId}" findes ikke.`);
  const game = { ...gameSnap.data(), id: gameId };
  if (!erKampspil(game)) {
    throw fejl('failed-precondition', `"${game.name || gameId}" er ikke et kampspil — facit i hånden findes kun for spil med kampe og 1X2.`);
  }
  const alleSnap = await gameRef.collection('matches').get();
  const kampDoc = alleSnap.docs.find((d) => d.id === matchId);
  if (!kampDoc) throw fejl('not-found', `Kampen "${matchId}" findes ikke i "${game.name || gameId}".`);
  const alle = alleSnap.docs.map((d) => ({ ...d.data(), id: d.id }));
  return { game, kampDoc, kamp: { ...kampDoc.data(), id: matchId }, alle };
}

/**
 * Skriv på kampen, KUN hvis den er uændret siden vi læste den. Ændrede noget
 * kampen imens (fx synken), skriver vi ikke oven i noget, tør-kørslen ikke så
 * — det er præcis den forskel, en forhåndsvisning skal kunne stole på.
 */
async function opdaterUaendret(kampDoc, data) {
  try {
    await kampDoc.ref.update(data, { lastUpdateTime: kampDoc.updateTime });
  } catch (err) {
    // 9 = FAILED_PRECONDITION i gRPC-koderne, som firebase-admin kaster med.
    if (err?.code === 9 || /FAILED_PRECONDITION/i.test(String(err?.message))) {
      throw fejl('failed-precondition', 'Kampen blev ændret, mens du kiggede (fx af synken). Intet er skrevet — vis ændringen igen.');
    }
    throw err;
  }
}

/** Deterministisk tekst af en værdi (nøgler sorteret) — grundlaget for aftrykket. */
function stabil(v) {
  if (v === undefined || v === null) return 'null';
  if (Array.isArray(v)) return `[${v.map(stabil).join(',')}]`;
  if (typeof v === 'object') {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stabil(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

/**
 * AFTRYKKET af det, tør-kørslen byggede sin konklusion på: kampens facit og
 * mærke (før-kolonnen), odds (pointene), runde og kickoff (gaten og combien).
 *
 * Det sendes med fra tør-kørslen til skrive-kaldet. Låsen i opdaterUaendret
 * beskytter kun INDEN FOR ét kald; mellem tør-kørslen og "Skriv facit" kan der
 * gå minutter, hvor synken eller en anden admin har skrevet på kampen. Uden
 * aftrykket skrev man oven i noget, ingen havde set.
 *
 * Med vilje IKKE dokumentets updateTime: en kamp, der stadig spilles, får en
 * live-skrivning hvert minut, og så kunne ingen nå at trykke "Skriv facit".
 * Aftrykket skifter kun, når noget, tør-kørslen viste, har skiftet.
 */
function kampAftryk(kamp) {
  const grundlag = stabil({
    ...facitAf(kamp),
    odds: kamp.odds ?? null,
    round: Number.isFinite(kamp.round) ? kamp.round : null,
    kickoff: kickoffMs(kamp),
  });
  return createHash('sha256').update(grundlag).digest('hex').slice(0, 32);
}

/** Kampen, som fladen skal vise den — holdnavne og tid, aldrig kun id'et. */
function kampVisning(kamp) {
  return {
    id: kamp.id,
    home: kamp.home ?? null,
    away: kamp.away ?? null,
    round: Number.isFinite(kamp.round) ? kamp.round : null,
    kickoff: kickoffMs(kamp),
  };
}

/** Facit-delen af et kampdokument, som før/efter-tabellen viser den. */
function facitAf(kamp) {
  return {
    result: kamp.result ?? null,
    homeGoals: kamp.homeGoals ?? null,
    awayGoals: kamp.awayGoals ?? null,
    slut: kamp.slut ?? null,
    resultatKilde: kamp.resultatKilde ?? null,
  };
}

function sammeSlut(a, b) {
  if (a == null || b == null) return a == null && b == null;
  return a.home === b.home && a.away === b.away && a.afgjort === b.afgjort;
}

/**
 * Hvad triggeren recomputeGameMatch VIL gøre, når facit skrives — regnet med
 * præcis de samme funktioner (scoreBet, buildRoundContext, combiPerRunde,
 * gatedIds), så tør-kørslen ikke kan sige noget andet end afregningen.
 *
 *   * Triggeren kører KUN, når `result` (1X2) ændrer sig. Rettes kun målene
 *     (2-1 → 3-1), flytter intet point — og det siger tør-kørslen.
 *   * En kamp før spillets start (gatet) scores aldrig.
 *   * Point (1X2, Chancen OG combi) tælles KUN for de spillere, triggeren
 *     faktisk genberegner — samme udvælgelse, samme funktion
 *     (gameScoring.spillereTriggerenGenberegner): dem med tip på DENNE kamp.
 *   * Combi-bonussen kan også flytte sig for spillere UDEN tip på kampen (der
 *     er intet kuponkrav). Dem genberegner triggeren IKKE — et kendt hul, der
 *     rettes i en egen PR. De står for sig i `senere`, så fladen kan sige det
 *     ærligt i stedet for at love point, der ikke kommer nu.
 *   * Runde-Botten poster, når runden netop bliver HELT afgjort, og den ikke
 *     er gjort op før (snapshottedRounds).
 * Totalens gulv ved 0 er IKKE regnet med: det binder kun for en spiller med
 * negativ saldo, og tallet her er summen af bevægelserne, ikke stillingen.
 */
async function pointPrognose(db, { game, kamp, alle, felter }) {
  const udfaldSkifter = (kamp.result ?? null) !== felter.result;
  const gated = gatedIds(alle, game);
  const gatet = gated.has(kamp.id);
  const runde = Number.isFinite(kamp.round) ? kamp.round : null;
  const tom = {
    udfaldSkifter, gatet, eloFlytter: udfaldSkifter, botPoster: false,
    point: { tips: 0, aendredeTips: 0, spillere: 0, iAlt: 0, combi: 0 },
    senere: { spillere: 0, combi: 0 },
  };
  if (!udfaldSkifter) return tom;
  // INGEN egen vagt for en gatet kamp: gaten er hele runder (startGate.js),
  // så en gatet kamp falder ud af `taelles` og bets-filteret nedenfor og giver
  // 0 af sig selv — præcis som i afregningen. En ekstra `|| gatet` her var
  // en anden vagt om samme regel og kunne fjernes med grøn suite (fundet ved
  // mutation); ÉN vagt pr. regel, så en mutation af den bliver rød.

  const taelles = alle.filter((m) => !gated.has(m.id));
  const efterKampe = taelles.map((m) => (m.id === kamp.id ? { ...m, ...felter } : m));
  const ctxFoer = buildRoundContext(taelles);
  const ctxEfter = buildRoundContext(efterKampe);

  const ids = runde == null ? [kamp.id] : taelles.filter((m) => m.round === runde).map((m) => m.id);
  // Kun ikke-gatede kampe er med i `ids` (taelles), så bets på en gatet kamp
  // hentes slet ikke — ét filter, ikke to.
  const bets = await betsPaaKampe(db, game.id, ids);

  const perUid = new Map();
  const tilfoej = (uid, d) => perUid.set(uid, round1((perUid.get(uid) || 0) + d));
  // Dem, triggeren genberegner. KUN deres bevægelser kommer på stillingen nu.
  const berorte = spillereTriggerenGenberegner(bets, kamp.id);
  let tips = 0;
  let aendredeTips = 0;
  for (const b of bets) {
    if (b.matchId !== kamp.id) continue;
    tips += 1;
    // FØR er det GEMTE tal — det er dét, triggeren sammenligner med og
    // skriver over, og dét, totalen er lagt sammen af.
    const foer = Number(b.points) || 0;
    const efter = scoreBet(b, felter.result, kamp.odds || null);
    if (foer !== efter) aendredeTips += 1;
    if (b.uid) tilfoej(b.uid, efter - foer);
  }
  let combi = 0;
  // Combi for spillere UDEN tip på kampen: regnes, men tælles for sig.
  const senere = { spillere: 0, combi: 0 };
  if (runde != null) {
    const perSpiller = new Map();
    for (const b of bets) {
      if (!b.uid) continue;
      if (!perSpiller.has(b.uid)) perSpiller.set(b.uid, []);
      perSpiller.get(b.uid).push(b);
    }
    for (const [uid, liste] of perSpiller) {
      const c0 = combiPerRunde(liste, ctxFoer).get(runde) || 0;
      const c1 = combiPerRunde(liste, ctxEfter).get(runde) || 0;
      if (c1 === c0) continue;
      if (berorte.has(uid)) {
        combi = round1(combi + (c1 - c0));
        tilfoej(uid, c1 - c0);
      } else {
        senere.spillere += 1;
        senere.combi = round1(senere.combi + (c1 - c0));
      }
    }
  }
  let iAlt = 0;
  let spillere = 0;
  for (const d of perUid.values()) {
    if (d !== 0) spillere += 1;
    iAlt = round1(iAlt + d);
  }

  let botPoster = false;
  const rc = runde == null ? null : ctxEfter.rounds[runde];
  if (rc && rc.combiCount > 0 && rc.combiSettled === rc.combiCount) {
    const gjort = Array.isArray(game.snapshottedRounds) ? game.snapshottedRounds : [];
    botPoster = !gjort.includes(runde);
  }
  return {
    udfaldSkifter, gatet, eloFlytter: true, botPoster,
    point: { tips, aendredeTips, spillere, iAlt, combi },
    senere,
  };
}

/**
 * Sæt eller ret facit på én kamp.
 *
 * @param {{gameId:string, matchId:string, homeGoals:number, awayGoals:number,
 *          slut?:{home:number, away:number, afgjort:string}|null,
 *          uid?:string|null, nowMs?:number, dryRun?:boolean, aftryk?:string}} args
 *   homeGoals/awayGoals = mål efter ORDINÆR tid (det, der tippes på).
 *   dryRun: default SAND — kun et eksplicit false skriver.
 *   aftryk: tør-kørslens `aftryk` (kampAftryk). KRÆVET for at skrive; passer
 *   det ikke med kampen nu, afvises skrivningen (failed-precondition).
 */
async function saetFacitCore(db, FieldValue, {
  gameId, matchId, homeGoals, awayGoals, slut = null, uid = null, nowMs = Date.now(), dryRun = true,
  aftryk = null,
} = {}) {
  const { game, kampDoc, kamp, alle } = await hentKamp(db, gameId, matchId);

  const ko = kickoffMs(kamp);
  if (ko == null) {
    throw fejl('failed-precondition', 'Kampen har intet læseligt kickoff. Ret kickoff først — uden det kan ingen se, om kampen er spillet, og reglerne lader heller ingen tippe den.');
  }
  if (ko > nowMs) {
    throw fejl('failed-precondition', 'Kampen er ikke begyndt endnu, og tips kan stadig afgives. Et facit nu ville afregne nogle tips, mens andre stadig kunne ændres.');
  }

  // Knockout udledes af runden via fasekalenderen — samme svar som fladen
  // (ManuelFacit.jsx). En UGYLDIG kalender giver ingen knockout (som alle
  // andre flader falder den tilbage til ligaen), og admin ser formfejlen
  // under Spil-tidsplan.
  const knockout = erKnockout(game, kamp.round);
  const input = { home: homeGoals, away: awayGoals, slut: slut ?? null };
  const tekst = facitFejl(input, { knockout });
  if (tekst) throw fejl('invalid-argument', tekst);
  // ÉN vagt for et ugyldigt facit: facitFejl ovenfor. En ekstra `if
  // (!felter) throw` her kunne aldrig nås (facitFelter giver kun null for
  // input, facitFejl allerede afviser) og kunne derfor fjernes med grøn suite
  // — fundet ved mutation. Blev de to funktioner en dag uenige, kaster
  // `felter.result` nedenfor, FØR noget er skrevet.
  const felter = facitFelter(input);

  const foer = facitAf(kamp);
  const efter = {
    result: felter.result,
    homeGoals: felter.homeGoals,
    awayGoals: felter.awayGoals,
    slut: felter.slut ?? null,
    resultatKilde: RESULTAT_KILDE_MANUEL,
  };
  const ingenAendring = foer.result === efter.result
    && foer.homeGoals === efter.homeGoals
    && foer.awayGoals === efter.awayGoals
    && sammeSlut(foer.slut, efter.slut)
    && erManuelFacit(kamp);

  const nuAftryk = kampAftryk(kamp);
  if (!dryRun && aftryk !== nuAftryk) {
    throw fejl('failed-precondition', typeof aftryk === 'string' && aftryk
      ? 'Kampen er ændret siden tør-kørslen — kør tør-kørslen igen. Intet er skrevet.'
      : 'Facit skrives kun efter en tør-kørsel — tryk "Vis hvad der ændrer sig" først. Intet er skrevet.');
  }

  const prognose = await pointPrognose(db, { game, kamp, alle, felter });

  let skrevet = false;
  if (!dryRun && !ingenAendring) {
    const data = {
      ...felter,
      resultatKilde: RESULTAT_KILDE_MANUEL,
      facitSatAf: uid,
      facitSatAt: FieldValue.serverTimestamp(),
      // Facit slår live — samme oprydning som synken laver.
      live: FieldValue.delete(),
      liveMaal: FieldValue.delete(),
    };
    // Rettes en knockout-kamp til et facit i ordinær tid, skal det gamle
    // slutresultat væk — ellers stod "35-34 e.f." på en kamp, der endte 30-28.
    if (!felter.slut) data.slut = FieldValue.delete();
    await opdaterUaendret(kampDoc, data);
    skrevet = true;
  }

  return {
    dryRun, skrevet, ingenAendring, knockout,
    kamp: kampVisning(kamp), foer, efter,
    // Sendes tilbage med "Skriv facit" — se kampAftryk.
    aftryk: nuAftryk,
    ...prognose,
  };
}

/**
 * Giv kampen tilbage til resultat-synken: fjern mærket (og hvem/hvornår).
 * Facit bliver stående — synken overskriver det ved næste kørsel, hvis kilden
 * siger noget andet, og så afregner triggeren som altid.
 */
async function frigivFacitCore(db, FieldValue, { gameId, matchId, dryRun = true } = {}) {
  const { kampDoc, kamp } = await hentKamp(db, gameId, matchId);
  const varManuel = erManuelFacit(kamp);
  let frigivet = false;
  if (varManuel && !dryRun) {
    await opdaterUaendret(kampDoc, {
      resultatKilde: FieldValue.delete(),
      facitSatAf: FieldValue.delete(),
      facitSatAt: FieldValue.delete(),
    });
    frigivet = true;
  }
  return { dryRun, varManuel, frigivet, kamp: kampVisning(kamp), facit: facitAf(kamp) };
}

module.exports = {
  saetFacitCore, frigivFacitCore, tilHttpsFejl, pointPrognose, kampAftryk,
};
