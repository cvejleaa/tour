// ---------------------------------------------------------------------------
// functions-platform/pointOpdeling.js — hvor en spillers point KOMMER FRA.
//
// SPEJL af src/lib/pointOpdeling.js. De to filer skal følges ad (CLAUDE.md),
// og pariteten er testdækket i pointOpdeling.test.js.
//
// Serveren er eneste autoritet: den regner tallene og gemmer dem. Klienten
// bruger samme modul, så en spillers egen historik kan tegnes uden en
// server-tur — og så de to aldrig kan blive uenige om regnestykket.
// ---------------------------------------------------------------------------

const {
  outcomePoints, outcomeReward, roundComboBonus, round1, isOutcome, outcomeFromScore,
} = require('./superligaScoring');

/** Millisekunder fra et Firestore-Timestamp | Date | tal | ISO-streng. */
function kickoffMs(m) {
  const k = m && m.kickoff;
  if (k == null) return null;
  if (typeof k === 'number') return k;
  if (typeof k === 'string') { const n = Date.parse(k); return Number.isNaN(n) ? null : n; }
  if (typeof k.toMillis === 'function') return k.toMillis();
  if (typeof k.getTime === 'function') { const n = k.getTime(); return Number.isNaN(n) ? null : n; }
  if (k.seconds != null) return k.seconds * 1000;
  return null;
}

/** Kampens 1X2-facit: brug result-feltet, ellers udled af mål. */
function matchOutcome(m) {
  if (isOutcome(m && m.result)) return m.result;
  return outcomeFromScore(m && m.homeGoals, m && m.awayGoals);
}

// --- Spilleugen: hvilke af rundens kampe står på combi-kuponen? -------------
//
// En runde kan blive splittet, når en kamp udsættes. Runde 3 i 2026/27 spilles
// 7.-10. august, men har to kampe 2. og 3. september. Ventede combi'en på dem,
// ville rundens bonus først falde en måned efter, at alle havde glemt runden —
// og delta-pilene og Runde-Botten med den.
//
// Derfor: combi-kuponen er de kampe i runden, der ligger i SAMME UGE. De
// udsatte giver 1X2-point som altid, men står ikke på kuponen og
// (Chancen skæres derimod pr. RUNDE, ikke pr. uge — se chanceGruppeKampe.)
// tages heller ikke med i nogen anden runde.
//
// Ugen går fra TIRSDAG kl. 04.00 dansk tid. Snittet ligger i et tomt hul i
// programmet: seneste mandagskamp i sæsonen er kl. 19.00, og der spilles
// aldrig tirsdag. Alt fra tirsdag 00.00 til onsdag 19.00 giver i øvrigt samme
// gruppering — der er 66 timers slæk, så grænsen er ikke en knivsæg.
//
// Nøglen er en DATO-STRENG i dansk tid, ikke en millisekund-grænse. Så rører
// vi aldrig ved offset-regning, og sommertidsskiftet 25. oktober — som ligger
// midt i runde 12 — kan ikke ramme forkert.
const UGE_SNIT_TIME = 4;

const DK = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Copenhagen',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', hour12: false, weekday: 'short',
});

/**
 * Ugenøgle for et tidspunkt: datoen for den tirsdag, ugen begyndte, i dansk
 * tid. Null for et ulæseligt tidspunkt.
 * @param {number|null} ms
 * @returns {string|null} fx '2026-08-04'
 */
function ugeNoegle(ms) {
  // Ikke bare isFinite: et endeligt tal uden for JS' tidsområde (|ms| > 8,64e15)
  // får formatToParts til at KASTE. Den kaldes over alle spillets kampe, så én
  // dårlig værdi ville stoppe afregningen for hele spillet — tavst, og prøvet
  // igen i det uendelige. Fx sekunder gemt i stedet for millisekunder.
  // Null her betyder "ulæseligt kickoff", og en sådan kamp bliver INDE på
  // kuponen: hellere en combi, der venter, end en der udbetales for tidligt.
  if (!Number.isFinite(ms) || Math.abs(ms) > 8.64e15) return null;
  const dele = {};
  for (const p of DK.formatToParts(ms)) dele[p.type] = p.value;
  const ugedag = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[dele.weekday];
  if (!ugedag) return null;
  // Før snittet hører man til dagen før — så en mandagskamp kl. 19 og en
  // søndagskamp ligger i samme uge.
  const foerSnit = Number(dele.hour) < UGE_SNIT_TIME;
  const dagNr = foerSnit ? (ugedag === 1 ? 7 : ugedag - 1) : ugedag;
  // Hvor mange dage er der gået, siden ugen begyndte (tirsdag = 0)?
  const siden = (dagNr - 2 + 7) % 7;
  const d = new Date(`${dele.year}-${dele.month}-${dele.day}T12:00:00Z`);
  // Et årstal på fem cifre eller mere kan ikke skrives i den USIGNEREDE
  // ISO-form, new Date() får ind — så bliver d til Invalid Date, og
  // toISOString() nedenfor KASTER. Grænsen er ca. 2,5e14, altså langt under
  // Date-områdets 8,64e15, som vagten øverst dækker.
  //
  // Den realistiske vej hertil er ikke sekunder (harmløst små tal) men
  // MIKROsekunder: et kickoff gemt som µs bliver til år 58000 og vælter
  // afregningen for HELE spillet, tavst og gentaget i det uendelige.
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() - siden - (foerSnit ? 1 : 0));
  return d.toISOString().slice(0, 10);
}

/**
 * Hvilken uge er rundens? Den med FLEST af rundens kampe; står det lige,
 * den tidligste.
 *
 * Ikke "ugen med rundens første kamp": bliver én kamp rykket FREM til mandagen
 * før runden, ville dén ene kamp blive hele kuponen, og de fem andre falde
 * udenfor. Med "flest" er svaret 5 mod 1.
 */
function rundensUge(kampe) {
  const antal = new Map();
  for (const m of kampe) {
    const u = ugeNoegle(kickoffMs(m));
    if (u == null) continue;
    antal.set(u, (antal.get(u) || 0) + 1);
  }
  let bedst = null;
  for (const [uge, n] of [...antal.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (bedst == null || n > bedst.n) bedst = { uge, n };
  }
  return bedst ? bedst.uge : null;
}

/**
 * Runde-kontekst: opslag pr. kamp-id (runde, facit, frosne odds, kickoff) plus
 * pr. runde (antal kampe + antal afgjorte).
 *
 * Bor HER og ikke i gameScoring, fordi klienten skal bruge nøjagtig samme form
 * for at kunne kalde opdelPoint. Byggede fladen sin egen, ville der være en
 * TREDJE rundetælling i appen — og modulet blev netop lavet for at fjerne den
 * anden.
 */
function buildRoundContext(matches) {
  const byMatch = {};
  const rounds = {};
  // Rundens uge skal kendes, FØR kampene mærkes — den afgøres af hele runden
  // under ét (ugen med flest kampe), ikke af den enkelte kamp.
  const perRunde = new Map();
  for (const m of matches || []) {
    if (m.round == null) continue;
    if (!perRunde.has(m.round)) perRunde.set(m.round, []);
    perRunde.get(m.round).push(m);
  }
  const ugePerRunde = new Map();
  for (const [runde, kampe] of perRunde) ugePerRunde.set(runde, rundensUge(kampe));

  for (const m of matches || []) {
    const round = m.round;
    const result = matchOutcome(m); // '1'|'X'|'2'|null
    const ko = kickoffMs(m);
    // Står kampen på rundens combi-kupon?
    //
    // En kamp uden læseligt kickoff bliver INDE. Den kan ikke placeres i en
    // uge, og at smide den ud ville udbetale bonussen på en ufuldstændig
    // kupon. Hellere en combi, der venter, end en combi, der er udbetalt for
    // tidligt. Kan runden slet ikke placeres — ingen af dens kampe har en dato
    // — er hele runden kuponen, altså præcis som før denne regel fandtes.
    const uge = ugeNoegle(ko);
    const rundeUge = round == null ? null : ugePerRunde.get(round);
    const iVindue = round != null && (rundeUge == null || uge == null || uge === rundeUge);
    // ALLE kampe med i byMatch — også dem uden runde. Opslaget bruges også til
    // pointopdelingen, og en kamp uden rundenummer ville ellers stille miste
    // sine point i totalen.
    byMatch[m.id] = { round, result, odds: m.odds || null, kickoff: ko, uge, iVindue };
    if (round == null) continue;
    if (!rounds[round]) {
      rounds[round] = {
        count: 0, settledCount: 0, combiCount: 0, combiSettled: 0, uge: rundeUge,
      };
    }
    rounds[round].count += 1;
    if (result) rounds[round].settledCount += 1;
    // combiCount/combiSettled tæller KUN kuponens kampe. count/settledCount
    // bliver stående: de siger noget andet — hvor mange kampe runden har i alt
    // — og bruges til at vise "4 af 6 kampe" på skærmen.
    if (iVindue) {
      rounds[round].combiCount += 1;
      if (result) rounds[round].combiSettled += 1;
    }
  }
  return { byMatch, rounds };
}

/**
 * Tæller kampens point med i TOTALEN? Kun ét krav: kampen skal være afgjort.
 *
 * Bevidst uden kickoff-tjek — det bor i maaVises() nedenfor. Blandede vi de to,
 * ville kickoff gate totalen, og et forkert gemt tidspunkt kunne fjerne point
 * fra stillingen.
 */
function taeller(info) {
  return !!(info && info.result);
}

/**
 * Må kampens RÆKKE vises for andre? Strengere end taeller().
 *
 * De to filtre er med vilje adskilt. Blander man dem, gater kickoff også
 * TOTALEN — og så forsvinder point fra stillingen, hvis vores gemte kickoff er
 * forkert. Det sker: ligaen flytter en kamp, facit kommer fra API'et uanset
 * hvad vi har gemt, og lander det før vores kickoff, taber alle tippere deres
 * point for den kamp. Tavst, indtil en anden kamp tilfældigvis genberegner dem.
 *
 * Her er kravet derimod nødvendigt og skal være STRENGT: rækkerne havner i et
 * dokument, som liga-kammerater KOMMER til at måtte læse (klausulen tilføjes
 * sammen med skærmen), og som aldrig kommer forbi kickoff-tjekket i
 * firestore.rules. Et ulæseligt kickoff må derfor betyde "vis ikke", ikke "vis
 * alligevel" — ellers ville et tip blive udstillet før kampstart i samme
 * øjeblik, adgangen udvides.
 */
function maaVises(info, nowMs) {
  if (!taeller(info)) return false;
  return Number.isFinite(info.kickoff) && info.kickoff <= nowMs;
}

/**
 * Combi-bonus for én spillers bets. Gives kun når hele KUPONEN er spillet, og
 * spilleren har tippet alle kampe på den. Hver ramt kamp tæller med i
 * produktet; de forkerte tæller hverken for eller imod.
 *
 * @param {Array<{matchId:string, pick:string}>} bets
 * @param {{byMatch:object, rounds:object}|null} roundCtx
 */
function combiBonus(bets, roundCtx) {
  let sum = 0;
  for (const b of combiPerRunde(bets, roundCtx).values()) sum += b;
  return sum;
}

/**
 * Combi-bonussen SPLITTET PR. RUNDE. Samme regnestykke som `combiBonus` — den
 * er nu bare summen af den her.
 *
 * Findes, fordi en liga kan starte ved en anden runde end spillet: dens total
 * er summen af runderne fra dens egen startrunde og frem, og combi hører til
 * den runde, den blev vundet i. Uden opdelingen kunne en liga, der starter ved
 * runde 20, arve en combi fra runde 3.
 *
 * @returns {Map<number, number>} runde → bonus
 */
function combiPerRunde(bets, roundCtx) {
  const ud = new Map();
  if (!roundCtx) return ud;
  const byRound = new Map();
  for (const b of bets) {
    const info = roundCtx.byMatch[b.matchId];
    if (!info) continue;
    // Kun kuponens kampe. Uden dette ville den, der tippede ALLE seks i en
    // splittet runde, have 6 tips mod en kupon på 4 — og miste hele bonussen,
    // mens den, der kun tippede de fire, fik den. Stik imod meningen.
    if (!info.iVindue) continue;
    if (!byRound.has(info.round)) byRound.set(info.round, []);
    byRound.get(info.round).push(b);
  }
  for (const [round, pbs] of byRound) {
    const rc = roundCtx.rounds[round];
    if (!rc || rc.combiCount < 2) continue;
    // KUPONENS kampe, ikke rundens: en udsat kamp venter vi ikke på, og den
    // tæller ikke med i "tippede du dem alle".
    if (rc.combiSettled !== rc.combiCount) continue;
    // INTET kuponkrav. Har man glemt et tip, tæller den kamp bare ikke med i
    // produktet — den udelukker ikke. Kravet kostede den glemsomme HELE
    // rundens bonus (−58 % mod −19 % nu), og det ramte netop den, der havde
    // mindst med spillet at gøre i forvejen.
    const hitOdds = [];
    // Ét bet pr. kamp. uid_matchId-bindingen i firestore.rules forhindrer
    // dubletter i dag, men uden antalskravet er der ikke længere noget, der
    // fanger dem her: to bets på samme kamp ville gange oddsene ind to gange.
    const set = new Set();
    for (const pb of pbs) {
      if (set.has(pb.matchId)) continue;
      set.add(pb.matchId);
      const info = roundCtx.byMatch[pb.matchId];
      // Combi ganger de RENE odds — uden træf-bonussen. Ellers ville det ene
      // point blive lagt til og ganget med, og bonussen sagde noget andet end
      // oddsene på skærmen.
      if (info.result && pb.pick === info.result) hitOdds.push(outcomeReward(info.result, info.odds));
    }
    const b = roundComboBonus(hitOdds, rc.combiCount);
    if (b) ud.set(round, (ud.get(round) || 0) + b);
  }
  return ud;
}

/**
 * Nøglen i `perRunde` OG `opdelingPerRunde` for en kamp: rundenummeret som
 * streng, ellers 'uden'. ÉT udtryk for begge vektorer, så de aldrig kan nøgles
 * forskelligt — ligaPoint tæller 'uden' med i alle ligaer.
 */
function rundeNoegle(info) {
  const r = info?.round;
  return Number.isFinite(r) ? String(r) : 'uden';
}

/**
 * Så meget må rubrikkerne afvige fra rundens tal, før resten er mere end
 * afrunding: tre rubrikker afrundet hver for sig (3 × 0,05) plus rundens egen
 * afrunding (0,05). Større rest = point fra kampe, opdelingen ikke kunne læse
 * (slettet kamp, kamp uden facit) — den står åben, præcis som på spil-niveau.
 */
const REST_AFRUNDING = 0.2;

/**
 * Rubrikkerne pr. runde-nøgle — SAMME nøgler som perRunde, afrundet så de
 * summer PRÆCIS til rundens tal, hvor resten er ren afrunding.
 *
 * Hvorfor resten lægges i p1x2 frem for at tolerere den: ligaPoint summerer de
 * afrundede rundetal, og rubrikker afrundet hver for sig driver ±0,1 pr. runde.
 * Over en sæson på 30+ runder ville summen af ligaens rubrikker afvige mere
 * end fladens tærskel (0,25) fra ligaens total — og stjernen «delene summer
 * ikke» ville stå på rækker uden grund. Bundet af 30-runders-fixturet i testen.
 * Gulv lægges ALDRIG her: det lægges én gang, på summen, i ligaPoint.
 */
function rubrikkerPerRunde(perRunde, rubrikker) {
  const ud = {};
  for (const k of Object.keys(perRunde)) {
    const r = rubrikker[k] || { p1x2: 0, chance: 0, combi: 0 };
    let p1x2 = round1(r.p1x2) || 0;
    const chance = round1(r.chance) || 0;
    const combi = round1(r.combi) || 0;
    const rest = round1(perRunde[k] - (p1x2 + chance + combi)) || 0;
    if (Math.abs(rest) <= REST_AFRUNDING) p1x2 = round1(p1x2 + rest) || 0;
    ud[k] = { p1x2, chance, combi };
  }
  return ud;
}

/**
 * Del en spillers point op i de fire kilder, spillet har.
 *
 * `bets` skal ALLEREDE være renset for gatede kampe (runder før spillets start) —
 * samme kontrakt som recalcPlayerTotal har i dag. Filteret for "afgjort og
 * begyndt" bor derimod HER, så de to flader ikke kan blive uenige om, hvilke
 * kampe der tæller.
 *
 * Chancen UDLEDES som (gemte point − 1X2-point). Den må aldrig genberegnes:
 * scoreBet kaldes UDEN bank-loft, så clampStake klipper anderledes, og en
 * genberegning ville give et andet tal end det, der står på tippet.
 *
 * @returns {{p1x2:number, chance:number, combi:number, pulje:number,
 *            total:number, kampe:Array}}
 */
function opdelPoint({ bets = [], roundCtx = null, puljeBonus = 0, nowMs = Date.now() } = {}) {
  const byMatch = (roundCtx && roundCtx.byMatch) || {};
  const afgjorte = []; // kendt og afgjort → kan deles op i rubrikker
  const kampe = [];    // må vises for andre
  let p1x2 = 0;
  let chance = 0;
  // Summen af ALLE bet-point — præcis som recalcPlayerTotal regnede før.
  //
  // Totalen må IKKE afhænge af, om runde-konteksten er komplet. Regnede vi den
  // ud af rubrikkerne, ville en ufuldstændig kamplæsning — eller et slettet
  // kampdokument — nulstille spillerens stilling, tavst. Rubrikkerne er
  // best-effort; totalen er stillingen.
  let raw = 0;
  // RUBRIKKER PR. RUNDE — samme nøgler som perRunde, så en liga med startrunde
  // kan vise sit regnskab kolonne for kolonne (ejerens fund 20/10 2026: nr. 2
  // stod med flest point i regnskabet, fordi det viste hele spillet). Puljen
  // er ikke med: den er spil-niveau (bonusPoints) og lægges på af ligaPoint.
  const rubrikker = {};
  const rubrikFor = (noegle) => {
    if (!rubrikker[noegle]) rubrikker[noegle] = { p1x2: 0, chance: 0, combi: 0 };
    return rubrikker[noegle];
  };

  for (const b of bets) {
    raw += Number(b.points) || 0;
    const info = byMatch[b.matchId];
    if (!taeller(info)) continue;
    const tip = outcomePoints(b.pick, info.result, info.odds);
    p1x2 += tip;
    chance += (Number(b.points) || 0) - tip;
    const rk = rubrikFor(rundeNoegle(info));
    rk.p1x2 += tip;
    rk.chance += (Number(b.points) || 0) - tip;
    afgjorte.push(b);
    if (maaVises(info, nowMs)) kampe.push(b);
  }

  // Combi regnes på ALLE afgjorte kampe, ikke kun de synlige. Ellers ville en
  // kamp med et ulæseligt kickoff koste spilleren hans rundebonus.
  const combi = combiBonus(afgjorte, roundCtx);
  const pulje = Number(puljeBonus) || 0;

  // POINT PR. RUNDE — grundlaget for, at en liga kan starte ved runde N.
  //
  // Hver værdi er rundens rå bet-point PLUS rundens combi. Puljen står
  // udenfor: den tippes før sæsonen og har sin egen regel (se ligaPoint.js).
  //
  // KAMPE UDEN RUNDENUMMER kommer under `uden` og tæller ALTID med, uanset
  // hvilken runde en liga starter ved. Det er samme beslutning som gatens:
  // `foerStart` rører aldrig en kamp uden runde, for `null < n` og
  // `undefined < n` svarer ikke ens, og en kamp må ikke miste sine point på
  // en tvetydighed.
  //
  // ET AFGJORT TIP MED 0 POINT SKRIVER NØGLEN MED 0. Før sprang `laegTil` alle
  // nul-værdier over, så den, der ramte hele runden forbi, fik ingen nøgle og
  // kunne ikke skelnes fra den, der aldrig tippede — og rundestillingen satte
  // ham nederst, under en tabt Chance (ejerens fund 12/10 2026). Grænsen er
  // AFGJORT (kampen har facit), ikke «tippet»: et uafgjort tip giver stadig
  // ingen nøgle, for ellers blev en kommende runde «rundens» dage før kickoff,
  // og nøglen ville afsløre, at man har tippet, før tips er synlige. Betydning
  // for ALLE læsere: et tal (også 0) = mindst ét afgjort tip i runden; ingen
  // nøgle = ingen afgjorte tips endnu. Combi-bidraget er uændret.
  const perRunde = {};
  const laegTil = (noegle, v, afgjort = false) => {
    if (!v && !afgjort) return;
    perRunde[noegle] = (perRunde[noegle] || 0) + v;
  };
  for (const b of bets) {
    const info = byMatch[b.matchId];
    laegTil(rundeNoegle(info), Number(b.points) || 0, taeller(info));
  }
  for (const [r, v] of combiPerRunde(afgjorte, roundCtx)) {
    laegTil(String(r), v);
    rubrikFor(String(r)).combi += v;
  }
  for (const k of Object.keys(perRunde)) perRunde[k] = round1(perRunde[k]);
  const opdelingPerRunde = rubrikkerPerRunde(perRunde, rubrikker);


  // Totalen afrundes ÉN gang og gulves ÉN gang — nøjagtig som recalcPlayerTotal.
  // Rubrikkerne afrundes hver for sig, fordi de skal vises. De to ting kan
  // derfor afvige nogle tiendedele; totalen er den autoritative.
  return {
    p1x2: round1(p1x2),
    chance: round1(chance),
    combi: round1(combi),
    pulje: round1(pulje),
    perRunde,
    // Rubrikker pr. runde — ligaens regnskab lægges af dem i fladen (ligaOpdeling).
    opdelingPerRunde,
    // raw, ikke p1x2 + chance: identisk med den gamle formel i
    // recalcPlayerTotal, så stillingen ikke kan flytte sig af denne ændring.
    total: Math.max(0, round1(raw + combi + pulje)),
    // Samme sum UDEN gulvet. Fladen har brug for begge tal: gulvet kan gøre
    // forskellen mellem rubrikkerne og totalen enorm — 11 + (−44,8) + 8,5 giver
    // en total på 0 — og uden det rå tal kan skærmen ikke forklare, hvorfor de
    // fire tal ikke summer til det femte. Saldoen går aldrig i minus, men det
    // skal siges, ikke skjules.
    raaTotal: round1(raw + combi + pulje),
    kampe,
  };
}

/**
 * Pulje-deadline UDLEDT af en runde: det tidligste kickoff blandt kampene i
 * `round`. En pulje, der lukker "før runde N", følger dermed de FAKTISKE
 * kamptider (opdateret af kickoff-synken), ikke en fast dato en
 * landsholdspause kan ramme forbi. Returnerer null, hvis runden endnu ikke
 * har nogen kamp med et gyldigt kickoff — så kalderen kan lade en tidligere
 * udledt deadline stå.
 * @param {Array<{round:*, kickoff:*}>} matches
 * @param {number} round
 * @returns {number|null} ms
 */
function puljeLockFraRunde(matches, round) {
  if (round == null) return null;
  const kickoffs = (matches || [])
    .filter((m) => m && m.round === round)
    .map((m) => kickoffMs(m))
    .filter((ms) => Number.isFinite(ms));
  return kickoffs.length ? Math.min(...kickoffs) : null;
}

module.exports = {
  opdelPoint, combiBonus, combiPerRunde, buildRoundContext, kickoffMs, matchOutcome,
  ugeNoegle, rundensUge, puljeLockFraRunde, rubrikkerPerRunde, REST_AFRUNDING,
};
