// ---------------------------------------------------------------------------
// functions-platform/chanceVagt.js — SERVEREN håndhæver "Chancen ⚡ må bruges
// ÉN gang pr. runde".
//
// Reglen har hidtil kun stået i browseren (FootballTip.jsx). Hverken
// firestore.rules eller afregningen kendte den, og gameScoring afregner hvert
// tip for sig. Et hul i fladen — lukket 9/8-2026 — lod en spiller sætte ⚡ på
// kamp A, se den låse ved kickoff, og bagefter sætte den igen på kamp B i
// SAMME runde: den første kunne ikke fjernes, fordi reglerne afviser skrivning
// efter kickoff. Auditen (scripts/audit-double-chance.mjs) fandt sagen.
//
// Derfor ejer serveren feltet. Klienten skriver sit 1X2-valg som hidtil;
// `chanceStake` går gennem callable'en setGameChance, som kalder kernen her i
// én transaktion. Samme mønster som redeemGameLeagueCode: rules kan ikke køre
// FORESPØRGSLER — kun `get()` på et kendt dokument — og "har du allerede en
// chance et andet sted i runden?" ER en forespørgsel. Den kan kun besvares her.
//
// STATUS: alle tre trin er på plads. Klienten kalder callable'en
// (betActions.setChance), og firestore.rules afviser en direkte skrivning af
// chanceStake, chanceSatAt og chanceFlytninger. Denne fil er dermed den ENESTE
// vej til feltet — hullet er lukket, ikke kun bevogtet.
//
// UDRULNINGEN HAR EN FÆLDE, OG DEN ER OPERATØRENS, IKKE ANGRIBERENS.
// Hosting og regler ruller ud sammen (deploy-platform.yml, ONLY=
// "hosting,firestore:rules"), men DENNE FUNKTION deployes kun bag fluebenet
// `deployFunctions`, som defaulter til false og kører BAGEFTER. Køres et
// almindeligt deploy, mens funktionen ikke er live, spærrer reglerne den
// direkte vej, mens den eneste tilladte vej ikke findes: så kan Chancen
// hverken sættes, flyttes eller fjernes af nogen.
//
// Bekræft derfor, at setGameChance svarer i spil-89af9, FØR reglerne rulles
// ud — eller kør deployet med `deployFunctions` slået til.
//
// EN ÅBEN FANE FRA FØR UDRULNINGEN. Her stod, at den "stadig kan tippe 1X2".
// Det er kun halvt sandt, og halvdelen er værd at kende: den gamle klient
// sender `chanceStake: 0` med hvert 1X2-klik. Rører den et tip, den selv har
// oprettet, går 0 → 0 igennem. Men et tip oprettet af det NYE bundle har slet
// intet chanceStake-felt, og fravær → 0 ER en berørt nøgle — så dér afvises
// også selve 1X2-valget. Derfor rulles der ud uden for en aktiv tip-weekend,
// og derfor nævner klientens fejlbesked genindlæsning som mulig årsag.
//
// TRE SPØRGSMÅL, TRE VAGTER (én vagt pr. sikkerhedsregel — CLAUDE.md):
//   HVOR MANGE   én pr. gruppe            → dedup'en i setChanceCore
//   HVORNÅR      ikke på en kamp i gang   → erKampLaast
//   HVOR STOR    aldrig over det absolutte loft → normaliserIndsats
//
// OM DET BANK-AFHÆNGIGE LOFT (15 % af saldoen): det håndhæves I DAG SLET IKKE
// på serveren. gameScoring kalder scoreBet(bet, result, odds) UDEN bank
// (gameScoring.js:527 og :650), og clampStake uden bank klipper kun til
// MAX_ABS. `isValidStake` i betActions.js er browservalidering og kan omgås.
// Denne fil håndhæver derfor det loft, der FAKTISK gælder — det absolutte —
// og påstår ikke et andet. (En tidligere udgave af denne kommentar udpegede
// afregningen som vagten; den vagt findes ikke, og en forkert henvisning gør
// hullet sværere at finde næste gang.)
//
// EJERENS BESLUTNING, truffet før trin 2: loftet bliver stående som det er,
// og bank-vagten flyttes IKKE til serveren nu. Begrundelsen er, at hullet, der
// skulle lukkes, var den dobbelte Chance — ikke prissætningen. At tage bank
// med i afregningen ville genberegne hele systemet for et problem, ingen har
// haft.
//
// Konsekvensen skal stå klart, så den ikke opdages som en overraskelse:
// `chanceMaxStake` og fladens "af maks N" er fra nu af en KLIENT-vejledning,
// ikke en regel. En spiller, der omgår browseren, kan sætte op til MAX_ABS
// uanset sin saldo. Det er samme eksponering som før — afregningen klipper til
// MAX_ABS med eller uden denne fil — men den er nu det ENESTE loft, og det er
// et bevidst valg og ikke en forglemmelse.
//
// Afregningen ændres IKKE. Den må aldrig dedup'e: gjorde den det, kunne hele
// transaktionen her tømmes for indhold med grøn suite, fordi afregningen
// stiltiende ryddede op bagefter. Vagten skal være det eneste sted, den findes.
// ---------------------------------------------------------------------------

const { CHANCE } = require('./superligaScoring');

/** Kickoff i ms — samme aflæsning som pointOpdeling (Timestamp/tal/streng). */
function kickoffMs(m) {
  const k = m && m.kickoff;
  if (k == null) return null;
  if (typeof k === 'number') return Number.isFinite(k) ? k : null;
  if (typeof k === 'string') { const n = Date.parse(k); return Number.isNaN(n) ? null : n; }
  if (typeof k.toMillis === 'function') return k.toMillis();
  if (typeof k.getTime === 'function') { const n = k.getTime(); return Number.isNaN(n) ? null : n; }
  if (k.seconds != null) return k.seconds * 1000;
  return null;
}

/** Har kampen facit? Enten result-feltet eller begge målscorer. */
function harFacit(m) {
  if (m && m.result != null && m.result !== '') return true;
  return !!(m && m.homeGoals != null && m.homeGoals !== ''
    && m.awayGoals != null && m.awayGoals !== '');
}

/** Kampens navn til fejlbeskeder — "Brøndby–FCK". */
function kampNavn(m) {
  return `${(m && m.home) || '?'}–${(m && m.away) || '?'}`;
}

/**
 * SNITTET. Hvilken gruppe af kampe deler ÉN chance?
 *
 * I dag: runden. Bemærk, at spillet har to forskellige opdelinger af den samme
 * runde — combi-kuponen skæres pr. UGE (pointOpdeling.js), Chancen pr. RUNDE —
 * og at en splittet runde derfor betyder, at en chance brugt i august er væk,
 * når rundens udsatte septemberkamp spilles. Skal snittet flyttes til kuponen,
 * er det DENNE funktion, der rettes, og intet andet: derfor slår den også
 * gruppens kampe op selv, så forespørgslen ikke bliver et andet sted, snittet
 * gemmer sig. Gate på begrebet, aldrig på en nabo-egenskab (jf. puljeLockRound).
 *
 * @returns {Promise<{gruppe:any, kampe:Array<object>}|null>} null hvis kampen
 *   ikke hører til en gruppe (manglende runde).
 */
async function chanceGruppeKampe(tx, matchesRef, maal) {
  const gruppe = maal && maal.round;
  if (gruppe == null || gruppe === '') return null;
  const snap = await tx.get(matchesRef.where('round', '==', gruppe));
  return { gruppe, kampe: snap.docs.map((d) => ({ ...d.data(), id: d.id })) };
}

/**
 * VAGT "HVORNÅR": er kampen gået i gang, så chancen på den er BRUGT?
 *
 * En ⚡ på en kamp, der ruller, er brugt — alt andet ville være væddemål med
 * facit i hånden.
 *
 *   facit               → låst
 *   kilden har set den  → låst (ETHVERT live-felt, 'afbrudt' medregnet)
 *   ulæseligt kickoff   → låst (en vagt i tvivl siger nej)
 *   ellers              → låst når kickoff er passeret
 *
 * HVAD MED EN UDSAT KAMP? Den skal frigive chancen — en spiller, der ligger
 * fast på en kamp, som aldrig blev spillet, kan hverken flytte eller fjerne
 * den. Men udsættelsen viser sig IKKE i live-status. Første udgave af denne
 * vagt frigav på `live.status === 'afbrudt'`, fordi LIVE_STATUS bunter
 * interrupted/abandoned/postponed sammen under det ene ord
 * (syncProviders.js:95-98). Kilden skriver dog kun et live-felt for kampe,
 * den melder `inprogress` (syncProviders.js:173, og PL's tilsvarende filter),
 * og en udsat kamp er aldrig i gang. 'afbrudt' kan derfor KUN stå på en kamp,
 * der rullede og blev afbrudt — præcis den kamp, hvor spilleren allerede har
 * set stillingen. Grenen frigav altså det ene tilfælde, der skulle være låst,
 * og ramte aldrig det, den var skrevet for. Samme fælde som puljeLockRound:
 * et token, der bunter tilstande, er ikke evnen.
 *
 * Udsættelse viser sig i stedet ved, at kickoff-synken FLYTTER kickoff frem i
 * tiden — og så er kampen ikke længere passeret, og chancen er fri. Det følger
 * af den sidste linje alene og kræver ingen særgren. Indtil tiden flyttes, er
 * kampen låst; det er den ærlige tilstand, for da ved vi det ikke endnu.
 */
function erKampLaast(m, nowMs) {
  if (!m) return true;
  if (harFacit(m)) return true;
  if (m.live && m.live.status) return true;
  const ko = kickoffMs(m);
  if (ko == null) return true;
  return ko <= nowMs;
}

/**
 * VAGT "HVOR STOR": et helt tal, 0 (= fjern chancen) eller MIN..MAX_ABS.
 * Det bank-afhængige loft ligger i afregningen — se filens hoved.
 * @throws {Error} 'bad-stake'
 */
function normaliserIndsats(stake) {
  // Et TAL, ikke noget der kan koges til et tal. Number(null), Number('') og
  // Number([]) er alle 0 — altså "fjern chancen" — og en klient, der sendte
  // et tomt felt, ville tavst nulstille en indsats, spilleren havde sat.
  if (typeof stake !== 'number' || !Number.isInteger(stake)) throw new Error('bad-stake');
  if (stake === 0) return 0;
  if (stake < CHANCE.MIN || stake > CHANCE.MAX_ABS) throw new Error('bad-stake');
  return stake;
}

/**
 * Fejlkoderne setChanceCore kaster, oversat til HttpsError-kode + dansk
 * besked. Bor HER og ikke i index.js, så en test kan holde listen op mod de
 * throws, der faktisk findes i filen — index.js kan ikke importeres uden
 * firebase-functions, og posten ville ellers være udækket.
 *
 * `{gruppe}` og `{kamp}` udfyldes af chanceFejl. Beskeden SKAL nævne kampen:
 * "handlingen blev afvist" lærer ingen reglen, "den ligger på Brøndby–FCK, som
 * er gået i gang" lærer den på én gang.
 */
const CHANCE_ERR = {
  unauthenticated: ['unauthenticated', 'Log ind for at bruge Chancen.'],
  // Samme ordlyd som gameLeagues' dørmand — en afvist bruger skal få det
  // samme svar, uanset hvilken vej hen prøver.
  rejected: ['permission-denied', 'Din adgang er afvist. Kontakt en administrator.'],
  'not-approved': ['permission-denied', 'Din bruger er ikke godkendt.'],
  'bad-input': ['invalid-argument', 'Mangler spil- eller kamp-id.'],
  'bad-stake': ['invalid-argument', `Indsatsen skal være 0 eller mellem ${CHANCE.MIN} og ${CHANCE.MAX_ABS} point.`],
  'not-member': ['permission-denied', 'Du deltager ikke i dette spil.'],
  'no-match': ['not-found', 'Kampen findes ikke i spillet.'],
  'no-group': ['failed-precondition', 'Kampen hører ikke til en runde endnu.'],
  'kamp-laast': ['failed-precondition', 'Kampen er gået i gang — Chancen kan ikke ændres på den.'],
  'intet-tip': ['failed-precondition', 'Vælg 1, X eller 2 først — Chancen lægges oven på dit tip.'],
  'chance-laast': ['failed-precondition', 'Du har allerede brugt ⚡ i runde {gruppe} — den ligger på {kamp}, som er gået i gang.'],
};

/**
 * Oversæt en fejl fra kernen til [HttpsError-kode, dansk besked].
 * @param {Error} err  — `err.detaljer` udfylder {pladsholdere} i beskeden.
 */
function chanceFejl(err) {
  const [kode, skabelon] = CHANCE_ERR[err && err.message] || ['internal', 'Chancen kunne ikke sættes.'];
  const d = (err && err.detaljer) || {};
  return [kode, skabelon.replace(/\{(\w+)\}/g, (_, n) => (d[n] == null ? '?' : String(d[n])))];
}

function fejl(kode, detaljer) {
  const e = new Error(kode);
  if (detaljer) e.detaljer = detaljer;
  return e;
}

/**
 * Sæt (eller fjern, med stake 0) Chancen på én kamp — hele reglen i én
 * transaktion. Ren for firebase-imports: db/FieldValue injiceres, så kernen
 * kan testes uden emulator.
 *
 * Rækkefølgen er ikke til forhandling: Firestore kræver ALLE læsninger før
 * første skrivning, og transaktionen er dét, der gør dedup'en sikker mod to
 * samtidige klik på hver sin kamp.
 *
 * @returns {Promise<{ok:true, gruppe:any, indsats:number, matchId:string,
 *                    flyttetFra:string[]}>}
 * @throws {Error} en nøgle fra CHANCE_ERR
 */
async function setChanceCore(db, FieldValue, { uid, gameId, matchId, stake, nowMs = Date.now() }) {
  if (!uid) throw fejl('unauthenticated');
  if (!gameId || !matchId) throw fejl('bad-input');
  const indsats = normaliserIndsats(stake);

  const gameRef = db.collection('games').doc(gameId);
  const matchesRef = gameRef.collection('matches');
  const betsRef = gameRef.collection('bets');

  return db.runTransaction(async (tx) => {
    // --- LÆSNINGER ---------------------------------------------------------
    // Deltagelse tjekkes EKSPLICIT. At tippet skal findes (intet-tip nedenfor)
    // ville i praksis også afvise en ikke-deltager, men det er en nabo-egenskab,
    // ikke en vagt: den knækker tavst, hvis tip-kravet nogensinde lempes.
    const [brugerSnap, spillerSnap, maalSnap] = await Promise.all([
      tx.get(db.collection('users').doc(uid)),
      tx.get(gameRef.collection('players').doc(uid)),
      tx.get(matchesRef.doc(matchId)),
    ]);
    // GODKENDELSE er sin egen vagt. Admin SDK omgår firestore.rules
    // fuldstændigt, så reglernes isApproved() beskytter INTET herinde — og et
    // players-dokument overlever, at en bruger bliver afvist (setUserStatus
    // rører kun users). Uden denne linje kunne en bortvist spiller blive ved
    // med at sætte ⚡ fra devtools, mens reglerne spærrede hen ude fra selve
    // 1X2-valget. Bemærk `!== 'approved'` og ikke `=== 'rejected'`: et
    // MANGLENDE brugerdokument slap også igennem.
    const status = brugerSnap.exists ? brugerSnap.data().status : null;
    if (status === 'rejected') throw fejl('rejected');
    if (status !== 'approved') throw fejl('not-approved');
    if (!spillerSnap.exists) throw fejl('not-member');
    if (!maalSnap.exists) throw fejl('no-match');

    const maal = maalSnap.data();
    if (erKampLaast(maal, nowMs)) throw fejl('kamp-laast');

    const g = await chanceGruppeKampe(tx, matchesRef, maal);
    if (!g) throw fejl('no-group');
    const kampAf = new Map(g.kampe.map((k) => [k.id, k]));

    // Mine tips på gruppens kampe. Doc-id'et er uid_matchId, så det er
    // opslag — ikke en forespørgsel, der skulle indekseres pr. spiller.
    const maalBetId = `${uid}_${matchId}`;
    const betRefs = g.kampe.map((k) => betsRef.doc(`${uid}_${k.id}`));
    const betSnaps = betRefs.length ? await tx.getAll(...betRefs) : [];

    const maalBet = betSnaps.find((s) => s.id === maalBetId);
    if (!maalBet || !maalBet.exists) throw fejl('intet-tip');

    // --- VAGT "HVOR MANGE": én chance pr. gruppe ---------------------------
    // En åben chance et andet sted i gruppen flyttes (nulstilles). Er dens kamp
    // LÅST, er chancen brugt, og den nye afvises — det er præcis det hul, hele
    // filen findes for.
    const flyttetFra = [];
    for (const s of betSnaps) {
      if (!s.exists || s.id === maalBetId) continue;
      const b = s.data();
      if (!(Number(b.chanceStake) > 0)) continue;
      const k = kampAf.get(b.matchId);
      if (erKampLaast(k, nowMs)) {
        throw fejl('chance-laast', { gruppe: g.gruppe, kamp: kampNavn(k) });
      }
      flyttetFra.push(s.ref);
    }

    // --- SKRIVNINGER -------------------------------------------------------
    for (const ref of flyttetFra) {
      tx.set(ref, { chanceStake: 0, chanceSatAt: null, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    const nu = maalBet.data();
    // Samme indsats, samme kamp, intet at flytte = intet skete. Uden denne
    // vagt talte et gentaget klik chanceFlytninger op og rykkede chanceSatAt,
    // så revisionsfeltet blev støj og et klik-loop blev til skrivninger.
    if (flyttetFra.length === 0 && (Number(nu.chanceStake) || 0) === indsats) {
      return { ok: true, gruppe: g.gruppe, indsats, matchId, flyttetFra: [], uaendret: true };
    }
    // chanceSatAt er tidspunktet, chancen faktisk blev LAGT — ikke `updatedAt`,
    // som rykker med hver rettelse af 1X2-valget. Auditen kunne kun gætte på
    // rækkefølgen af to chancer; herefter kan den læse den.
    // chanceFlytninger tælles PR. TIP; summen over gruppens tips er antallet af
    // gange, chancen blev lagt i runden — foder til Runde-Botten, ingen ny UI.
    const flytninger = Number(nu.chanceFlytninger) || 0;
    tx.set(maalBet.ref, {
      chanceStake: indsats,
      chanceSatAt: indsats > 0 ? nowMs : null,
      chanceFlytninger: indsats > 0 ? flytninger + 1 : flytninger,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return {
      ok: true,
      gruppe: g.gruppe,
      indsats,
      matchId,
      flyttetFra: flyttetFra.map((r) => r.id),
      uaendret: false,
    };
  });
}

module.exports = {
  setChanceCore,
  chanceGruppeKampe,
  erKampLaast,
  normaliserIndsats,
  harFacit,
  kickoffMs,
  kampNavn,
  chanceFejl,
  CHANCE_ERR,
};
