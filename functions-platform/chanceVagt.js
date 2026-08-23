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
// TRE SPØRGSMÅL, TRE VAGTER (én vagt pr. sikkerhedsregel — CLAUDE.md):
//   HVOR MANGE   én pr. gruppe            → dedup'en i setChanceCore
//   HVORNÅR      ikke på en kamp i gang   → erKampLaast
//   HVOR STOR    aldrig over det absolutte loft → normaliserIndsats
//
// Det BANK-afhængige loft (15 % af saldoen) håndhæves ét sted og kun ét:
// afregningen (superligaScoring.clampStake). Saldoen ved skrivetidspunktet er
// ikke saldoen ved afregning, så en kopi her ville være en anden regel med
// samme navn — og en mutation af den ene ville overleve den andens tests.
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
  return { gruppe, kampe: snap.docs.map((d) => ({ id: d.id, ...d.data() })) };
}

/**
 * VAGT "HVORNÅR": er kampen gået i gang, så chancen på den er BRUGT?
 *
 * En ⚡ på en kamp, der ruller, er brugt — alt andet ville være væddemål med
 * facit i hånden. Men en UDSAT kamp blev aldrig spillet, og en spiller, der
 * ligger fast på den, kan hverken flytte eller fjerne sin chance. Derfor
 * spørger vagten, om kampen faktisk er BEGYNDT — ikke blot om et gemt
 * kickoff-tidspunkt er passeret:
 *
 *   afbrudt/udsat uden facit → ikke låst (chancen frigives)
 *   facit                    → låst
 *   kilden melder i gang     → låst
 *   kickoff passeret         → låst
 *
 * Rækkefølgen er meningsbærende: 'afbrudt' dækker BÅDE interrupted, abandoned
 * og postponed (syncProviders.LIVE_STATUS), og en udsat kamp har stadig sit
 * gamle kickoff, indtil kickoff-synken flytter det. Uden den første linje ville
 * den første udsættelse med en ⚡ på være en supportsag.
 *
 * Et ULÆSELIGT kickoff låser. Vi ved ikke, hvornår kampen begynder, og en
 * vagt, der er i tvivl, siger nej.
 */
function erKampLaast(m, nowMs) {
  if (!m) return true;
  const facit = harFacit(m);
  const status = m.live && m.live.status;
  if (status === 'afbrudt' && !facit) return false;
  if (facit) return true;
  if (status && status !== 'afbrudt') return true;
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
    const [spillerSnap, maalSnap] = await Promise.all([
      tx.get(gameRef.collection('players').doc(uid)),
      tx.get(matchesRef.doc(matchId)),
    ]);
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
