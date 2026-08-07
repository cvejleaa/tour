// ---------------------------------------------------------------------------
// Superliga-scoring — ren logik (ingen Firebase). Bruges af frontend og
// spejles i Cloud Functions ved afregning. Hold identisk begge steder!
//
// Spillet: man tipper 1X2 (ikke resultat) på hver kamp i en runde, og kan
// (valgfrit) bruge "Chancen" på ÉN kamp pr. runde: sæt point på spil til
// elo-lite fair odds. Design låst med ejeren 20/7-2026:
//   - 1X2-point: point FØLGER oddsene — et ramt udfald giver kampens frosne
//     odds afrundet til 1 decimal (fx 3.1 / 4.3 / 2.3). Så en favorit-tip
//     giver få point og et overraskende udfald giver mange, i takt med oddsene.
//   - RUNDE-BONUS (combi): tipper man ALLE kampe på rundens KUPON, får man en
//     bonus = 2 × kvadratroden af de ramte odds ganget sammen, med et loft på
//     25 — som en tæmmet bookmaker-kupon. Hver ramt kamp tæller. Kuponen er
//     rundens kampe i samme uge; en udsat kamp giver point, men står udenfor.
//   - Chancen: indsats mellem MIN og MAX, hvor MAX cappes til 15 % af saldo.
//   - Gevinst = indsats × (fair odds − 1). Tab = kun indsatsen (ingen bøde).
//   - Saldoen kan aldrig gå i minus (garanteret af 15 %-cappet).
// ---------------------------------------------------------------------------

/** Kamp-udfald (1X2). '1' = hjemmesejr, 'X' = uafgjort, '2' = udesejr. */
export const OUTCOME = { HOME: '1', DRAW: 'X', AWAY: '2' };

/** Alle gyldige udfald i fast rækkefølge (til iteration/visning). */
export const OUTCOMES = [OUTCOME.HOME, OUTCOME.DRAW, OUTCOME.AWAY];

/**
 * Standard-point pr. udfald — bruges KUN som fallback, hvis en kamp mangler
 * frosne odds (bør ikke ske; odds fryses ved seeding). Normalt følger pointene
 * oddsene, se outcomeReward().
 */
export const DEFAULT_POINTS = {
  [OUTCOME.HOME]: 2,
  [OUTCOME.DRAW]: 4,
  [OUTCOME.AWAY]: 3,
};

/** Afrund et tal til 1 decimal (0 for ugyldigt). Bruges til point = odds. */
export function round1(x) {
  const n = Number(x);
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : 0;
}

/**
 * Point for et RAMT udfald = kampens frosne odds (1 decimal). Falder tilbage til
 * DEFAULT_POINTS, hvis kampen ikke har gyldige odds for udfaldet.
 * @param {string} outcome – '1'|'X'|'2'
 * @param {object} [odds]   – kampens frosne odds { '1','X','2' }
 * @returns {number}
 */
export function outcomeReward(outcome, odds) {
  if (!isOutcome(outcome)) return 0;
  const raw = odds ? Number(odds[outcome]) : NaN;
  return Number.isFinite(raw) ? round1(raw) : DEFAULT_POINTS[outcome];
}

/** Er en værdi et gyldigt 1X2-udfald? */
export function isOutcome(v) {
  return v === OUTCOME.HOME || v === OUTCOME.DRAW || v === OUTCOME.AWAY;
}

/** Udled 1X2-udfald af et resultat (mål). Returnerer null hvis ufuldstændigt. */
export function outcomeFromScore(homeGoals, awayGoals) {
  if (homeGoals == null || awayGoals == null || homeGoals === '' || awayGoals === '') return null;
  const h = Number(homeGoals);
  const a = Number(awayGoals);
  if (!Number.isFinite(h) || !Number.isFinite(a)) return null;
  if (h > a) return OUTCOME.HOME;
  if (h < a) return OUTCOME.AWAY;
  return OUTCOME.DRAW;
}

/**
 * Point for ét 1X2-tip mod facit. Et ramt udfald giver kampens frosne odds
 * (1 decimal); forkert giver 0. Odds trådes ind fra kamp-dokumentet.
 * @param {string} pick   – spillerens tip ('1'|'X'|'2')
 * @param {string} result – facit ('1'|'X'|'2')
 * @param {object} [odds] – kampens frosne odds { '1','X','2' }
 * @returns {number} point (0 hvis forkert eller ugyldigt)
 */
export const TRAEF_BONUS = 0;

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
 * band på 36 af Superligaens 132 kampe og betalte ham mindre end fair. Loftet
 * er siden hævet til 8,0, og så binder det på ingen af dem.
 *
 * RETTET: her stod, at de 4,5 point var en AKTIV modvægt, fordi den modige
 * ellers ville vinde oftest på højere spredning. Det holdt ikke ved en måling.
 * Fordelen ved at stå alene er den samme, uanset om man står alene med
 * outsidere eller med favoritter (~4× sin andel begge veje), så loftet
 * udlignede ikke noget — det straffede kun den ene af de to. Loftet er derfor
 * hævet til 8,0, hvor det binder på nul udfald i Superligaens program. Se
 * kommentaren ved ODDS længere nede.
 *
 * Konstanten bliver stående i stedet for at blive fjernet: det er en
 * justeringsskrue med en målt historik, og næste gang nogen overvejer at
 * skrue på den, skal tallene ovenfor være der.
 *
 * SKAL holdes ude af combi'en — den ganger de RENE odds. Derfor er dette en
 * egen funktion og ikke et tillæg inde i outcomeReward.
 */
export function hitPoints(result, odds, bonus = TRAEF_BONUS) {
  return round1(outcomeReward(result, odds) + bonus);
}

export function outcomePoints(pick, result, odds) {
  if (!isOutcome(pick) || !isOutcome(result)) return 0;
  return pick === result ? hitPoints(result, odds) : 0;
}

// --- Runde-bonus (combi/kupon) -----------------------------------------------

/**
 * Combi-bonussen: 2 × kvadratroden af de ramte odds ganget sammen, med et
 * loft på 25. FAKTOR afgør, hvor meget bonussen fylder i spillet (ved 2 er
 * den ca. en tredjedel af pointene); LOFT holder en enkelt vanvittig runde
 * fra at afgøre sæsonen.
 * SPEJLET: den anden superligaScoring.js skal følges ad (CLAUDE.md).
 */
export const COMBI = { FAKTOR: 2, LOFT: 25 };


/**
 * Combi-bonus for én spillers kupon: **2 × kvadratroden af de ramte odds
 * ganget sammen**, med et loft på 25.
 *
 * FORUDSÆTTER at spilleren har tippet ALLE kuponens kampe (kaldes kun så).
 * `hitOdds` er de (1-decimals) odds for de kampe, han RAMTE.
 *
 * HVORFOR KVADRATRODEN. Den gamle regel gav de ramte odds ganget rå, med loft
 * 25 ved nul fejl og 12 ved én, og nul ved to. Den havde to problemer, som
 * 20.000 simulerede sæsoner gjorde tydelige:
 *
 *  1. Den STRAFFEDE mod. Den, der tippede tre outsidere pr. runde, tabte 1,3
 *     point i forventning mod den, der kun tog favoritter — fordi kravet om
 *     "højst én fejl" gør bonussen til en funktion af sandsynlighed, og modige
 *     tip sænker sandsynligheden hurtigere, end oddsene stiger.
 *  2. Den afgjorde sæsonvinderen i HALVDELEN af alle sæsoner, selv om den kun
 *     var 19 % af pointene. En fejlfri runde gav 25 = fire normale runders
 *     1X2-point, og den faldt 0,4 gange pr. sæson. Et lotteri.
 *
 * Med kvadratroden tæller hver ramt kamp med, så modet betaler sig (+0,3 i
 * stedet for −1,3), medianen går fra 0 til 5,3 — combi bliver noget, man
 * mærker hver uge i stedet for én gang om året — og andelen af sæsoner, der
 * afgøres af bonussen, falder fra 51 % til 16 %.
 *
 * Loftet på 25 binder stadig i toppen, men først et godt stykke over det, en
 * ren favorit-runde giver (2·√86 ≈ 18,5). Så en modig fejlfri runde er stadig
 * mere værd end en forsigtig.
 *
 * @param {number[]} hitOdds  odds for de RAMTE kampe
 * @param {number} matchCount antal kampe PÅ KUPONEN (ikke i runden)
 * @returns {number} bonus (1 decimal)
 */
export function roundComboBonus(hitOdds, matchCount) {
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

// --- Elo-lite: sandsynligheder + fair odds -----------------------------------

/** Standard Elo-parametre for Superligaen. */
export const ELO = {
  START: 1500,      // rating for et nyt/ukendt hold
  HFA: 60,          // hjemmebane-fordel i Elo-point (~0.09 forventning)
  K: 20,            // opdateringshastighed pr. kamp
  DRAW_BASE: 0.26,  // uafgjort-sandsynlighed når holdene er LIGE stærke (~Superligaens rate)
  DRAW_DECAY: 0.55, // hvor hurtigt uafgjort-chancen falder med styrkeforskel
};

/**
 * Forventet hjemme-score (0..1) i ren Elo (uden uafgjort-split).
 * Højere = hjemmeholdet er favorit.
 */
export function eloExpectedHome(eloHome, eloAway, hfa = ELO.HFA) {
  const dr = (Number(eloHome) + hfa) - Number(eloAway);
  return 1 / (1 + 10 ** (-dr / 400));
}

/**
 * 1X2-sandsynligheder ud fra Elo-ratings (elo-lite).
 * Uafgjort modelleres størst når holdene er lige, og falder med styrkeforskel;
 * resten fordeles på hjemme/ude efter Elo-forventningen. Summen er altid 1.
 * @returns {{'1':number,'X':number,'2':number}}
 */
export function outcomeProbabilities({
  eloHome = ELO.START,
  eloAway = ELO.START,
  hfa = ELO.HFA,
  drawBase = ELO.DRAW_BASE,
  drawDecay = ELO.DRAW_DECAY,
} = {}) {
  const e = eloExpectedHome(eloHome, eloAway, hfa); // med hjemmebane — til fordeling af hjemme/ude
  // Uafgjort skal toppe når holdene er REELT lige stærke, ikke når hjemmebanen
  // er "brugt op". Derfor måles skævheden på forventningen UDEN hjemmebane, så
  // hjemmefordelen ikke lækker ind og trækker uafgjort-niveauet kunstigt ned.
  const eLevel = eloExpectedHome(eloHome, eloAway, 0);
  const skew = Math.abs(2 * eLevel - 1); // 0 ved lige hold, 1 ved totalt ensidigt
  const pDraw = drawBase * Math.exp(-drawDecay * skew * 2);
  const rest = 1 - pDraw;
  return {
    [OUTCOME.HOME]: rest * e,
    [OUTCOME.DRAW]: pDraw,
    [OUTCOME.AWAY]: rest * (1 - e),
  };
}

/**
 * Grænser for odds, så en enkelt kamp ikke bliver ekstrem.
 *
 * MAX gik fra 6,0 til 8,0, og begrundelsen er en MÅLT rettelse af det, der
 * stod her før. Den gamle tekst sagde, at loftet var en "aktiv modvægt", fordi
 * den modige ellers ville vinde for ofte i et vinderen-tager-alt-spil. Første
 * halvdel passer: i et felt på 12, hvor én spiller tipper outsidere og elleve
 * tipper favoritter, vinder outsideren ~33 % uden loft — fire gange sin
 * retfærdige andel på 8,3 %.
 *
 * Men vendes feltet om — elleve outsider-spillere og ÉN favorit-spiller —
 * vinder favoritten 34 %. Præcis det samme. Effekten er altså ikke spredning;
 * den er, at man er den eneste, hvis point ikke er korreleret med de andres.
 * Hvem der end står alene, vinder ~4× sin andel, uanset strategi.
 *
 * Og så udligner loftet ikke — det SKABER en skævhed, fordi det kun rammer
 * høje odds, og høje odds er outsiderens hele indtægt:
 *
 *     Superligaen        outsider alene   favorit alene
 *       loft 6, kun 1X2      28 %             38 %
 *       loft 8, kun 1X2      33 %             34 %
 *       loft 6, HELE reglen  20 %             48 %
 *       loft 8, HELE reglen  22 %             45 %
 *
 * LÆS BEGGE RÆKKEPAR. På 1X2-benet udligner 8 præcis, som det skal. Men med
 * combi-bonussen — som er omtrent halvdelen af pointene og ganger de RENE
 * odds, så loftet slet ikke rører den — står favorit-spilleren stadig dobbelt
 * så godt. Hævelsen fjerner altså den straf, loftet lagde på outsideren; den
 * gør IKKE spillet balanceret. Det er en åben opgave for sig, og den ligger i
 * combi'en, ikke i loftet.
 *
 * (Første måling udelod combi og konkluderede "de to er næsten lige". Det var
 * forkert, og det er derfor scriptet nu regner begge ben.)
 *
 * Loftet binder samtidig på nul udfald i Superligaens program (højeste fair
 * odds er 7,80), så det er reelt kun et værn mod et ekstremt hold-mismatch.
 * Margenen er dog kun ~6 Elo-point, og produktionen ompriser fremtidige kampe
 * fra LIVE-Elo, så det kan holde op med at være sandt i løbet af sæsonen.
 *
 * Premier League har et meget bredere felt og skal have et HØJERE loft — ved 8
 * ville 26 kampe stadig have to udfald til nøjagtig samme pris. Loftet bør
 * derfor gøres pr. spil, når PL seedes; se opgaven om odds-loftet.
 *
 * Måles med scripts/maal-odds-loft.mjs; hele billedet — seks arketyper, begge
 * ligaer, med og uden combi — står i docs/spilbalance.md. Ændres MAX, skal
 * balancen måles igen, og dokumentet opdateres. Det er ikke oprydning.
 */
export const ODDS = { MIN: 1.1, MAX: 8.0 };

/**
 * Fair (EV-neutral) decimal-odds for en sandsynlighed, klippet til [MIN,MAX].
 * Afrundes til 2 decimaler. p ≤ 0 giver MAX.
 */
export function fairOdds(p) {
  const prob = Number(p);
  if (!Number.isFinite(prob) || prob <= 0) return ODDS.MAX;
  const raw = 1 / prob;
  const clamped = Math.min(ODDS.MAX, Math.max(ODDS.MIN, raw));
  return Math.round(clamped * 100) / 100;
}

/** Fair odds for hvert 1X2-udfald ud fra Elo-ratings. */
export function outcomeOdds(eloArgs) {
  const p = outcomeProbabilities(eloArgs);
  return {
    [OUTCOME.HOME]: fairOdds(p[OUTCOME.HOME]),
    [OUTCOME.DRAW]: fairOdds(p[OUTCOME.DRAW]),
    [OUTCOME.AWAY]: fairOdds(p[OUTCOME.AWAY]),
  };
}

// --- Chancen: indsats-grænser + afregning ------------------------------------

/** Chancen-parametre. Cap er bevidst kun 15 % af saldoen (kan aldrig gå i minus). */
export const CHANCE = {
  MIN: 1,             // mindste indsats
  MAX_ABS: 8,         // absolut loft uanset saldo (holder Chancen som krydderi, ikke vind-knap)
  CAP_FRACTION: 0.15, // maks. andel af saldoen (taktisk krydderi, ikke lotteri)
};

/**
 * Maksimal tilladt indsats givet spillerens nuværende saldo (point).
 * = min(absolut loft, 15 % af saldoen), rundet ned. 0 hvis for lav saldo.
 */
export function chanceMaxStake(bank) {
  const b = Number(bank);
  if (!Number.isFinite(b) || b <= 0) return 0;
  const byFraction = Math.floor(b * CHANCE.CAP_FRACTION);
  return Math.max(0, Math.min(CHANCE.MAX_ABS, byFraction));
}

/** Kan spilleren overhovedet bruge Chancen (har råd til mindste indsats)? */
export function canUseChance(bank) {
  return chanceMaxStake(bank) >= CHANCE.MIN;
}

/** Er en indsats gyldig for saldoen? (heltal, MIN ≤ stake ≤ maxStake). */
export function isValidStake(stake, bank) {
  const s = Number(stake);
  if (!Number.isInteger(s)) return false;
  return s >= CHANCE.MIN && s <= chanceMaxStake(bank);
}

/**
 * Afregn Chancen for ÉN kamp. Ren funktion — kaldes server-side ved facit.
 * Point-ændringen lægges oven i de normale 1X2-point for runden.
 * @param {{correct:boolean, stake:number, fairOdds:number}} o
 * @returns {{delta:number, profit:number}} delta = korrekt ? +profit : −indsats
 */
export function settleChance({ correct, stake, fairOdds: odds }) {
  const s = Math.max(0, Math.floor(Number(stake) || 0));
  if (s <= 0) return { delta: 0, profit: 0 };
  if (correct) {
    const profit = Math.round(s * (Number(odds) - 1));
    return { delta: profit, profit };
  }
  return { delta: -s, profit: 0 };
}

// --- Elo-vedligeholdelse (til sæson-beregning) -------------------------------

/**
 * Opdater to holds Elo-ratings efter en kamp. actualHome ∈ {1, 0.5, 0}.
 * Returnerer nye ratings; muterer ikke input.
 * @returns {{home:number, away:number}}
 */
export function updateElo(eloHome, eloAway, actualHome, { hfa = ELO.HFA, k = ELO.K } = {}) {
  const expH = eloExpectedHome(eloHome, eloAway, hfa);
  const home = Number(eloHome) + k * (actualHome - expH);
  const away = Number(eloAway) + k * ((1 - actualHome) - (1 - expH));
  return { home, away };
}

/** actualHome-værdi (1/0.5/0) ud fra et 1X2-udfald. */
export function actualHomeFromOutcome(outcome) {
  if (outcome === OUTCOME.HOME) return 1;
  if (outcome === OUTCOME.AWAY) return 0;
  return 0.5;
}

// --- Pulje-tip: grundspillets slutstilling → mesterskabs-/nedrykningsspil -----

/** Pulje-tip-parametre. Superligaen deler efter grundspillet i 6 + 6. */
export const PULJE = {
  POOL_SIZE: 6,        // hold i hver pulje (mesterskab / nedrykning)
  PER_TEAM: 4,         // point pr. korrekt mesterskabs-hold
  PERFECT_BONUS: 10,   // ekstra hvis alle 6 er rigtige
};

/**
 * Beregn grundspillets stilling ud fra spillede kampe (3-1-0). Kun kampe med
 * gyldige mål tælles med. Sorteres: point ↓, målforskel ↓, scorede mål ↓, navn ↑.
 * @param {Array<{home:string, away:string, homeGoals:*, awayGoals:*}>} matches
 * @returns {Array<{name:string, played:number, points:number, gf:number, ga:number, gd:number}>}
 */
export function leagueTable(matches) {
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
  rows.sort((x, y) => (y.points - x.points)
    || (y.gd - x.gd)
    || (y.gf - x.gf)
    || x.name.localeCompare(y.name, 'da'));
  return rows;
}

/** De øverste POOL_SIZE hold (mesterskabsspillet) ud fra slutstillingen. */
export function championshipTeams(matches, poolSize = PULJE.POOL_SIZE) {
  return leagueTable(matches).slice(0, poolSize).map((r) => r.name);
}

/**
 * Scor et pulje-tip: hvor mange af spillerens POOL_SIZE mesterskabs-valg endte i
 * top-6. Point = korrekte × PER_TEAM (+ PERFECT_BONUS hvis alle rigtige).
 * @param {string[]} championshipPick  – spillerens valgte mesterskabs-hold
 * @param {string[]|Set<string>} actualTop6
 * @returns {{correct:number, points:number}}
 */
export function puljeScore(championshipPick, actualTop6) {
  const top = actualTop6 instanceof Set ? actualTop6 : new Set(actualTop6 || []);
  const picks = Array.isArray(championshipPick) ? [...new Set(championshipPick)] : [];
  const correct = picks.filter((t) => top.has(t)).length;
  const perfect = correct === PULJE.POOL_SIZE && picks.length === PULJE.POOL_SIZE;
  const points = correct * PULJE.PER_TEAM + (perfect ? PULJE.PERFECT_BONUS : 0);
  return { correct, points };
}

