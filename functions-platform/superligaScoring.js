// ---------------------------------------------------------------------------
// functions-platform/superligaScoring.js — AUTORITATIV Superliga-pointlogik (CommonJS).
// SPEJL af src/lib/superligaScoring.js — hold dem 100% identiske i opførsel!
// Cloud Functions beregner point; klienten viser kun.
//
// 1X2-point FØLGER oddsene: et ramt udfald giver kampens FROSNE odds afrundet
// til 1 decimal (fx 3.1 / 4.3 / 2.3). "Chancen": indsats på ét 1X2-valg afregnes
// til de samme frosne odds (gemt på kamp-dokumentet, ikke på tippet — så en
// klient ikke kan puste gevinsten op). Tab koster kun indsatsen.
// ---------------------------------------------------------------------------

const OUTCOME = { HOME: '1', DRAW: 'X', AWAY: '2' };
const OUTCOMES = [OUTCOME.HOME, OUTCOME.DRAW, OUTCOME.AWAY];
// Fallback-point hvis en kamp mangler frosne odds (bør ikke ske).
const DEFAULT_POINTS = {
  [OUTCOME.HOME]: 2,
  [OUTCOME.DRAW]: 4,
  [OUTCOME.AWAY]: 3,
};

function isOutcome(v) {
  return v === OUTCOME.HOME || v === OUTCOME.DRAW || v === OUTCOME.AWAY;
}

function round1(x) {
  const n = Number(x);
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : 0;
}

function outcomeReward(outcome, odds) {
  if (!isOutcome(outcome)) return 0;
  const raw = odds ? Number(odds[outcome]) : NaN;
  return Number.isFinite(raw) ? round1(raw) : DEFAULT_POINTS[outcome];
}

function outcomeFromScore(homeGoals, awayGoals) {
  if (homeGoals == null || awayGoals == null || homeGoals === '' || awayGoals === '') return null;
  const h = Number(homeGoals);
  const a = Number(awayGoals);
  if (!Number.isFinite(h) || !Number.isFinite(a)) return null;
  if (h > a) return OUTCOME.HOME;
  if (h < a) return OUTCOME.AWAY;
  return OUTCOME.DRAW;
}

const TRAEF_BONUS = 0;

/**
 * Point for ÉN ramt kamp: kampens frosne odds, plus træf-bonussen hvis den er
 * sat. Bonussen er nu **0** — se nedenfor.
 *
 * Bonussen blev indført på 1 point, fordi rene fair odds gør alle strategier
 * lige gode i forventning: er odds = 1/sandsynlighed, er ethvert tip værd
 * præcis 1 point. Tanken var, at den der oftest har ret, skulle belønnes.
 *
 * Målingen bagefter viste, at den gjorde det for hårdt. Et tip bliver værd
 * 1 + p, altså mest for den, der spiller favoritter — og bonussen er den
 * samme uanset odds, så den vejer relativt tungest på det sandsynlige.
 * Over 6.000 simulerede sæsoner på Superligaens eget program:
 *
 *     bonus  favorit-spiller  outsider-spiller
 *       0          30 %             27 %
 *       0,5        34 %             23 %
 *       1          41 %             18 %
 *
 * Sat til 0 er forventningen igen praktisk talt ens: analytisk 132,8 for
 * favorit-spilleren mod 132,1 for outsideren over en sæson — UDEN odds-loft.
 * MED det gamle loft på 6,00 var outsiderens forventning 128,3, fordi loftet
 * band på 36 af Superligaens 132 kampe og betalte ham mindre end fair.
 *
 * RETTET: her stod, at de 4,5 point var en AKTIV modvægt, fordi den modige
 * ellers ville vinde oftest på højere spredning. Det holdt ikke ved en måling.
 * Fordelen ved at stå alene er den samme, uanset om man står alene med
 * outsidere eller med favoritter (~4× sin andel begge veje), så loftet
 * udlignede ikke noget — det straffede kun den ene af de to. Loftet er derfor
 * FJERNET helt. (Undervejs stod her, at det var hævet til 8,0; det var et
 * mellemtrin, som målingen af Chancen siden væltede.)
 *
 * Konstanten bliver stående i stedet for at blive fjernet: det er en
 * justeringsskrue med en målt historik, og næste gang nogen overvejer at
 * skrue på den, skal tallene ovenfor være der.
 *
 * SKAL holdes ude af combi'en — den ganger de RENE odds. Derfor er dette en
 * egen funktion og ikke et tillæg inde i outcomeReward.
 */
function hitPoints(result, odds, bonus = TRAEF_BONUS) {
  return round1(outcomeReward(result, odds) + bonus);
}

function outcomePoints(pick, result, odds) {
  if (!isOutcome(pick) || !isOutcome(result)) return 0;
  return pick === result ? hitPoints(result, odds) : 0;
}

// Combi-bonus: 2 × kvadratroden af de ramte odds ganget sammen, med loft.
// Kaldes kun når spilleren har tippet ALLE kuponens kampe. Hver ramt kamp
// tæller — der er ikke længere et krav om højst én fejl.
//
// Kvadratroden er ikke pynt: den gamle regel STRAFFEDE mod (−1,3 point pr.
// runde for den, der tippede tre outsidere) og afgjorde sæsonvinderen i
// halvdelen af alle sæsoner, selv om den kun var 19 % af pointene.
// SPEJLET: src/lib/superligaScoring.js skal følges ad (CLAUDE.md).
const COMBI = { FAKTOR: 2, LOFT: 25 };


function roundComboBonus(hitOdds, matchCount) {
  if (!Array.isArray(hitOdds) || !Number.isFinite(matchCount) || matchCount < 2) return 0;
  // Under to ramte er der ingen kupon at gange — én ramt kamp har allerede
  // fået sine 1X2-point.
  if (hitOdds.length < 2) return 0;
  // Vagten skal stå på HVERT ODDS, ikke på produktet: to negative odds ganger
  // op til et POSITIVT produkt og ville slippe igennem en produkt-vagt. Kræver
  // at en admin skriver negative odds, men reglen skal ikke hvile på, at ingen
  // gør det. Fanger samtidig 0, NaN og manglende værdier.
  if (hitOdds.some((o) => !(Number(o) > 0))) return 0;
  const product = hitOdds.reduce((a, b) => a * Number(b), 1);
  return round1(Math.min(COMBI.FAKTOR * Math.sqrt(product), COMBI.LOFT));
}

// Chancen: samme loft som klienten (src/lib/superligaScoring.js). Serveren er
// eneste autoritet — klientens validering kan omgås, så indsatsen SKAL klippes
// her, ellers ville et forfalsket chanceStake give ubegrænset gevinst.
const CHANCE = { MIN: 1, MAX_ABS: 8, CAP_FRACTION: 0.15 };

/** Maksimal tilladt indsats givet spillerens saldo: min(loft, 15 % af saldo). */
function chanceMaxStake(bank) {
  const b = Number(bank);
  if (!Number.isFinite(b) || b <= 0) return 0;
  return Math.max(0, Math.min(CHANCE.MAX_ABS, Math.floor(b * CHANCE.CAP_FRACTION)));
}

/**
 * Klip en indsats til det tilladte: heltal, aldrig over det absolutte loft, og
 * aldrig over saldo-andelen når saldoen kendes. Ukendt saldo → kun loftet.
 * @param {number} stake
 * @param {number} [bank] spillerens point FØR runden (udelades = kun MAX_ABS)
 */
function clampStake(stake, bank) {
  const s = Math.max(0, Math.floor(Number(stake) || 0));
  if (s <= 0) return 0;
  const cap = bank == null ? CHANCE.MAX_ABS : chanceMaxStake(bank);
  return Math.min(s, cap);
}

/**
 * Afregn Chancen for ét tip. delta = korrekt ? +indsats×(odds−1) : −indsats.
 * Indsatsen klippes til loftet — se clampStake.
 * @param {{correct:boolean, stake:number, fairOdds:number, bank?:number}} o
 * @returns {{delta:number, profit:number}}
 */
function settleChance({ correct, stake, fairOdds, bank }) {
  const s = clampStake(stake, bank);
  if (s <= 0) return { delta: 0, profit: 0 };
  if (correct) {
    const profit = Math.round(s * (Number(fairOdds) - 1));
    return { delta: profit, profit };
  }
  return { delta: -s, profit: 0 };
}

/**
 * Samlet point for ét bet mod en kamps facit (1X2-point + Chancen-delta).
 * Bruger kampens frosne odds for spillerens valg. Returnerer et heltal.
 * @param {object} bet   – { pick, chanceStake }
 * @param {string} result – facit ('1'|'X'|'2')
 * @param {object} [odds] – kampens odds { '1','X','2' } (frosset)
 * @returns {number}
 */
function scoreBet(bet, result, odds, bank) {
  if (!bet || !isOutcome(bet.pick) || !isOutcome(result)) return 0;
  const base = outcomePoints(bet.pick, result, odds);
  const stake = clampStake(bet.chanceStake, bank);
  if (stake <= 0) return base;
  const o = odds && Number.isFinite(odds[bet.pick]) ? Number(odds[bet.pick]) : null;
  // Uden gyldige odds kan Chancen ikke afregnes fair → ingen gevinst/tab.
  if (o == null) return base;
  const { delta } = settleChance({ correct: bet.pick === result, stake, fairOdds: o });
  return base + delta;
}

// --- Elo-lite: sandsynligheder, odds + vedligeholdelse (spejl af src) --------

// DRAW_BASE gik 0,26 → 0,305. Modellen gav 9 % for få uafgjorte målt på 6.143
// spillede kampe (13 Superliga-sæsoner + 10 Premier League-sæsoner). Fejlen sad
// i niveauet, ikke i formen — DRAW_DECAY er efterprøvet og står stille.
const ELO = { START: 1500, HFA: 60, K: 20, DRAW_BASE: 0.305, DRAW_DECAY: 0.55 };
// INTET LOFT længere — kun et gulv. Loftet udlignede ikke, som den gamle
// kommentar påstod; det SKABTE en skævhed mod favorit-spilleren, fordi det kun
// rammer høje odds. Et loft klipper desuden kun gevinsten, aldrig
// indsatsen, så en Chance på høje odds fik negativ forventning: den modige
// tabte 27-47 point pr. sæson på at turde. Fuld begrundelse og måling i
// src/lib/superligaScoring.js.
//
// MIN er FODBOLDENS gulv. I fodbold binder det aldrig gennem outcomeOdds
// (uafgjort-modellen holder p under 0,896), men en sport med få uafgjorte kan
// nå over 0,909, og dér binder det — derfor er gulvet en profilværdi
// (profil.odds.min). Fuld begrundelse ved ODDS i src.
const ODDS = { MIN: 1.1, UGYLDIG: 100 };

function eloExpectedHome(eloHome, eloAway, hfa = ELO.HFA) {
  const dr = (Number(eloHome) + hfa) - Number(eloAway);
  return 1 / (1 + 10 ** (-dr / 400));
}

function outcomeProbabilities({
  eloHome = ELO.START, eloAway = ELO.START, hfa = ELO.HFA,
  drawBase = ELO.DRAW_BASE, drawDecay = ELO.DRAW_DECAY,
} = {}) {
  const e = eloExpectedHome(eloHome, eloAway, hfa); // med hjemmebane — til fordeling
  // Uafgjort topper ved REELT lige hold: mål skævheden UDEN hjemmebane, så
  // hjemmefordelen ikke lækker ind og trækker uafgjort-niveauet kunstigt ned.
  const eLevel = eloExpectedHome(eloHome, eloAway, 0);
  const skew = Math.abs(2 * eLevel - 1);
  const pDraw = drawBase * Math.exp(-drawDecay * skew * 2);
  const rest = 1 - pDraw;
  return { [OUTCOME.HOME]: rest * e, [OUTCOME.DRAW]: pDraw, [OUTCOME.AWAY]: rest * (1 - e) };
}

// Gulvet er ODDS.MIN, medmindre sportsprofilen giver et andet (profil.odds.min).
function fairOdds(p, min = ODDS.MIN) {
  const prob = Number(p);
  if (!Number.isFinite(prob) || prob <= 0) return ODDS.UGYLDIG;
  const clamped = Math.max(min, 1 / prob);
  return Math.round(clamped * 100) / 100;
}

// Samme felter som outcomeProbabilities + oddsMin — dvs. oddsParametre(profil).
function outcomeOdds(eloArgs) {
  const p = outcomeProbabilities(eloArgs);
  const min = eloArgs ? eloArgs.oddsMin : undefined;
  return {
    [OUTCOME.HOME]: fairOdds(p[OUTCOME.HOME], min),
    [OUTCOME.DRAW]: fairOdds(p[OUTCOME.DRAW], min),
    [OUTCOME.AWAY]: fairOdds(p[OUTCOME.AWAY], min),
  };
}

// --- Sportsprofil (spejl af src): tallene, der hører til SPORTEN -------------
// Fuld begrundelse i src/lib/superligaScoring.js. Kort: et spil uden `sport`
// er fodbold, fodbold bygges AF ELO/ODDS (intet skrevet af), profilerne er
// frosset, registret er ikke (testene lægger en prøvesport ind), og der er
// endnu ingen håndboldprofil — dens tal skal måles først.
const STANDARD_SPORT = 'fodbold';

function frys(o) {
  for (const v of Object.values(o)) if (v && typeof v === 'object') frys(v);
  return Object.freeze(o);
}

const SPORT_PROFILER = {
  fodbold: frys({
    sport: 'fodbold',
    elo: { ...ELO },
    odds: { min: ODDS.MIN },
  }),
};

function sportProfil(game) {
  const sport = game ? game.sport : undefined;
  return erRegistreret(sport) ? SPORT_PROFILER[sport] : SPORT_PROFILER[STANDARD_SPORT];
}

// ÉN vagt for "kendt sport" — sportProfil og ukendtSport kan ikke blive uenige.
function erRegistreret(sport) {
  return typeof sport === 'string' && Object.prototype.hasOwnProperty.call(SPORT_PROFILER, sport);
}

// game.sport er SAT, men ukendt (tastefejl som 'handbold'). Mangler feltet, er
// det fodbold med vilje. Der er TRE skriveveje, og de behandler det forskelligt
// med vilje: det fulde seed (seedKampe) og Ompris-knappen (repriceGameOdds)
// afviser, mens triggeren på facit-ændring (recomputeGameMatch →
// recomputeSeasonElo) kun advarer og regner videre som fodbold — driften må
// ikke gå i stå midt i en sæson for en tastefejl.
function ukendtSport(game) {
  const sport = game ? game.sport : undefined;
  return sport != null && !erRegistreret(sport);
}

// --- Sportens ORD: hvad tingene hedder, uafhængigt af Elo-tallene ----------
//
// EN EGEN DEL, IKKE ET FELT PÅ PROFILEN. Ordene for håndbold er besluttet af
// ejeren (§11.2: "Dagens konge"), men håndboldens Elo-tal er ikke målt endnu
// (delopgave 4). Lå ordene på profilen, krævede de en håndboldprofil — og en
// håndboldprofil med fodboldens tal ville gøre 'haandbold' til en KENDT sport
// for ukendtSport, så seed og Ompris prissatte med umålte tal uden at sige fra.
// Lå de på fodboldprofilen alene, fik et håndboldspil tavst fodboldens ord.
// Derfor sit eget register, slået op på spillets egen `sport`: ordene kan
// komme før tallene, og tallene kan ændres uden at røre ordene.
//
// Flader spørger sportOrd(game).rundeKonge — aldrig `sport === 'haandbold'`.
// Ukendt eller manglende sport giver fodboldens ord (som sportProfil).
// Formen (samme nøgler i hver sport) er testet over hele registret.
const SPORT_ORD = {
  fodbold: frys({
    sport: 'fodbold',
    rundeKonge: 'Rundekongen',
    rundeSejr: 'rundesejr',
    rundeSejre: 'rundesejre',
    ordinaerTid: '90 min',
    emoji: '⚽',
  }),
  haandbold: frys({
    sport: 'håndbold',
    rundeKonge: 'Dagens konge',
    rundeSejr: 'dagssejr',
    rundeSejre: 'dagssejre',
    ordinaerTid: '60 min',
    emoji: '🤾',
  }),
};

/** Spillets ord. Samme prototype-vagt som sportProfil. */
function sportOrd(game) {
  const sport = game ? game.sport : undefined;
  return typeof sport === 'string' && Object.prototype.hasOwnProperty.call(SPORT_ORD, sport)
    ? SPORT_ORD[sport]
    : SPORT_ORD[STANDARD_SPORT];
}

// --- Sportens EVNER (spejl af src) -------------------------------------------
// Fuld begrundelse i src/lib/superligaScoring.js. Kort: en evne som "spilles
// der på hjemmebane" er et faktum om sporten, ikke et målt tal, så den bor i
// sit eget register og kan komme før håndboldprofilen. harHjemmebane kræver
// JA fra både evnen og modellen (HFA > 0).
const SPORT_EVNER = {
  fodbold: frys({ hjemmebane: true }),
  haandbold: frys({ hjemmebane: false }),
};

function sportEvner(game) {
  const sport = game ? game.sport : undefined;
  return typeof sport === 'string' && Object.prototype.hasOwnProperty.call(SPORT_EVNER, sport)
    ? SPORT_EVNER[sport]
    : SPORT_EVNER[STANDARD_SPORT];
}

function harHjemmebane(game) {
  return sportEvner(game).hjemmebane === true && sportProfil(game).elo.HFA > 0;
}

// Den RÅ sport-værdi, som den skal stå i en fejl eller en advarsel. Tal vises
// med String: JSON.stringify(NaN) og JSON.stringify(Infinity) giver "null", og
// "sport null" er netop det, et sat felt IKKE er. Alt andet med JSON.stringify,
// så et array ['fodbold'] står som ["fodbold"] og ikke som en kendt sport.
// Spejlet i src/lib/superligaScoring.js.
function visSport(vaerdi) {
  return typeof vaerdi === 'number' ? String(vaerdi) : JSON.stringify(vaerdi);
}

// Kaster for et gulv, der ikke er et endeligt tal over 1: outcomeOdds faldt
// ellers tavst tilbage (manglende → 1,1, null → intet gulv, NaN → NaN-odds).
// Profilerne er kode — en forkert profil er en programfejl.
function oddsParametre(profil = sportProfil()) {
  const min = profil.odds ? profil.odds.min : undefined;
  if (!(Number.isFinite(min) && min > 1)) {
    throw new Error(`Sportsprofilen "${profil.sport}" har intet gyldigt odds-gulv (odds.min = ${String(min)}).`);
  }
  return {
    hfa: profil.elo.HFA,
    drawBase: profil.elo.DRAW_BASE,
    drawDecay: profil.elo.DRAW_DECAY,
    oddsMin: min,
  };
}

function eloParametre(profil = sportProfil()) {
  return { hfa: profil.elo.HFA, k: profil.elo.K };
}

function updateElo(eloHome, eloAway, actualHome, { hfa = ELO.HFA, k = ELO.K } = {}) {
  const expH = eloExpectedHome(eloHome, eloAway, hfa);
  const home = Number(eloHome) + k * (actualHome - expH);
  const away = Number(eloAway) + k * ((1 - actualHome) - (1 - expH));
  return { home, away };
}

function actualHomeFromOutcome(outcome) {
  if (outcome === OUTCOME.HOME) return 1;
  if (outcome === OUTCOME.AWAY) return 0;
  return 0.5;
}

// --- Pulje-tip (spejl af src): slutstilling + pulje-score ---------------------
const PULJE = { POOL_SIZE: 6, PER_TEAM: 4, PERFECT_BONUS: 10 };

function leagueTable(matches) {
  const table = new Map();
  const row = (name) => {
    if (!table.has(name)) table.set(name, { name, played: 0, points: 0, gf: 0, ga: 0, gd: 0 });
    return table.get(name);
  };
  const goalOf = (g) => (g == null || g === '' ? NaN : Number(g));
  for (const m of matches || []) {
    const hg = goalOf(m.homeGoals);
    const ag = goalOf(m.awayGoals);
    if (!m.home || !m.away || !Number.isFinite(hg) || !Number.isFinite(ag)) continue;
    const h = row(m.home);
    const a = row(m.away);
    h.played += 1; a.played += 1;
    h.gf += hg; h.ga += ag; a.gf += ag; a.ga += hg;
    if (hg > ag) h.points += 3;
    else if (hg < ag) a.points += 3;
    else { h.points += 1; a.points += 1; }
  }
  const rows = [...table.values()];
  for (const r of rows) r.gd = r.gf - r.ga;
  rows.sort((x, y) => (y.points - x.points) || (y.gd - x.gd) || (y.gf - x.gf)
    || x.name.localeCompare(y.name, 'da'));
  return rows;
}

function championshipTeams(matches, poolSize = PULJE.POOL_SIZE) {
  return leagueTable(matches).slice(0, poolSize).map((r) => r.name);
}

function puljeScore(picks, facitSaet, { antal = PULJE.POOL_SIZE, perTeam = PULJE.PER_TEAM, perfectBonus = PULJE.PERFECT_BONUS } = {}) {
  const top = facitSaet instanceof Set ? facitSaet : new Set(facitSaet || []);
  const valgte = Array.isArray(picks) ? [...new Set(picks)] : [];
  const correct = valgte.filter((t) => top.has(t)).length;
  const perfect = correct === antal && valgte.length === antal;
  const points = correct * perTeam + (perfect ? perfectBonus : 0);
  return { correct, points };
}

/** De nederste n hold ud fra slutstillingen (bundspørgsmålet, fx PL's bund 3). */
function bundTeams(matches, n) {
  const rows = leagueTable(matches);
  return rows.slice(Math.max(0, rows.length - n)).map((r) => r.name);
}

/**
 * Normalisér spillets pulje-konfiguration. Superligaens LITERALE dokument er
 * `{ poolSize: 6 }` — alle defaults herunder er valgt, så netop dét dokument
 * giver præcis dagens adfærd (6/4/10, officiel facitkilde, delt tabel, ingen
 * bund-pulje). null når spillet ingen pulje har.
 *
 * Nøglerne er FLADE (på nær labels), fordi firestore.rules skal kunne læse
 * tallene med .get('pulje', {}).get('poolSize', 0).
 */
function puljeKonfig(game) {
  const p = game && game.pulje;
  if (!p) return null;
  const tal = (v, fallback) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : fallback);
  const labels = (p.labels && typeof p.labels === 'object') ? p.labels : {};
  // 'officiel': facit fra game.standings (Superligaen — grundspillet slutter
  // med den officielle tabel). 'egneKampe': facit BEREGNES af spillets egne
  // kampe og rører ALDRIG standings — et halvsæson-spil (PL-efterår) må
  // ikke kunne genafregnes mod forårets officielle tabel (QC-fund).
  // 'runde': facit er HOLDENE i en fase af turneringen (`facitFase`, slået op
  // i game.faser) — "hvem når semifinalerne?". Hvornår den er afgjort, står i
  // puljeFacit.js (ét prædikat for server og flade). Alt andet er 'officiel'.
  const facitKilde = p.facitKilde === 'egneKampe' || p.facitKilde === 'runde' ? p.facitKilde : 'officiel';
  const runde = facitKilde === 'runde';
  // Fasens NAVN i kalenderen ('Semifinaler'). Kun en runde-pulje har en; for
  // alle andre er den null, så SL og PL får præcis de tal, de altid har fået.
  const facitFase = runde && typeof p.facitFase === 'string' && p.facitFase.trim() ? p.facitFase.trim() : null;
  // ORDENE KOMMER FRA KALENDEREN, ikke fra en kopi i labels: fasens bestemte
  // form ('Semifinalerne') er skrevet ét sted, og omdøbes fasen, følger
  // teksterne med. Står fasen ikke i kalenderen, bruges navnet — og
  // puljeKonfigFejl melder fejlen under Spil-tidsplan.
  const fase = facitFase && Array.isArray(game.faser)
    ? game.faser.find((f) => f && f.navn === facitFase) : null;
  const bestemt = fase && typeof fase.bestemt === 'string' && fase.bestemt.trim() ? fase.bestemt.trim() : facitFase;
  const faseOrd = bestemt ? bestemt.toLowerCase() : null;
  return {
    poolSize: tal(p.poolSize, PULJE.POOL_SIZE),
    // 0 = intet bundspørgsmål (Superligaen). En runde-pulje har aldrig et:
    // der er ingen "bund" i en udslagsfase at afgøre det på.
    nedSize: runde ? 0 : tal(p.nedSize, 0),
    perTeam: tal(p.perTeam, PULJE.PER_TEAM),
    perfectBonus: Number.isFinite(Number(p.perfectBonus)) && Number(p.perfectBonus) >= 0
      ? Number(p.perfectBonus) : PULJE.PERFECT_BONUS,
    facitKilde,
    facitFase,
    // Deler tabellen sig i mesterskabs-/nedrykningsspil (SL), eller er den
    // flad (PL)? Puljen på PL må ikke flippe Tabel-fanen (QC-fund). En
    // turnering deler aldrig sin tabel efter puljen.
    tabelDeling: p.tabelDeling === undefined ? !runde : !!p.tabelDeling,
    labels: {
      overskrift: typeof labels.overskrift === 'string' ? labels.overskrift : '🏆 Pulje-tip',
      top: typeof labels.top === 'string' ? labels.top : (runde ? faseOrd || 'næste fase' : 'mesterskabsspillet'),
      ned: typeof labels.ned === 'string' ? labels.ned : 'nedrykningsspillet',
      facit: typeof labels.facit === 'string' ? labels.facit
        : (runde ? `holdene i ${faseOrd || 'fasen'}` : 'grundspillets slutstilling'),
    },
  };
}

module.exports = {
  PULJE, leagueTable, championshipTeams, puljeScore, bundTeams, puljeKonfig,
  OUTCOME, OUTCOMES, DEFAULT_POINTS, COMBI, ELO, ODDS, CHANCE,
  isOutcome, outcomeFromScore, round1, outcomeReward, outcomePoints, roundComboBonus,
  hitPoints, TRAEF_BONUS,
  settleChance, scoreBet, chanceMaxStake, clampStake,
  eloExpectedHome, outcomeProbabilities, fairOdds, outcomeOdds,
  updateElo, actualHomeFromOutcome,
  STANDARD_SPORT, SPORT_PROFILER, sportProfil, ukendtSport, visSport, oddsParametre, eloParametre,
  SPORT_ORD, sportOrd, SPORT_EVNER, sportEvner, harHjemmebane,
};
