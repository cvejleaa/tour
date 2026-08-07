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
 * band på 36 af Superligaens 132 kampe og betalte ham mindre end fair.
 *
 * RETTET: her stod, at de 4,5 point var en AKTIV modvægt, fordi den modige
 * ellers ville vinde oftest på højere spredning. Det holdt ikke ved en måling.
 * Fordelen ved at stå alene er den samme, uanset om man står alene med
 * outsidere eller med favoritter (~4× sin andel begge veje), så loftet
 * udlignede ikke noget — det straffede kun den ene af de to. Loftet er derfor
 * FJERNET helt. (Undervejs stod her, at det var hævet til 8,0; det var et
 * mellemtrin, som målingen af Chancen siden væltede.) Se kommentaren ved ODDS
 * længere nede.
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

/**
 * Standard Elo-parametre.
 *
 * DRAW_BASE gik fra 0,26 til 0,305, og DRAW_DECAY står med vilje stille.
 * Målt på 6.143 spillede kampe — 13 sæsoner af Superligaen og 10 af Premier
 * League, hvert holdpar vurderet med de ratings, de havde FØR kampen:
 *
 *     model                 forventede uafgjorte   faktiske
 *     0,260 / 0,550               1.362             1.493   (9 % for få)
 *     0,305 / 0,550               1.493             1.493   (rammer)
 *
 * Fejlen sad altså i NIVEAUET, ikke i formen. Låser man DECAY på 0,55 og
 * fitter kun BASE, fanger man næsten hele forbedringen (log-likelihood 3407,1
 * → 3384,1 mod 3383,7 for et frit fit af begge). Én parameter er nok.
 *
 * DET, DER GJORDE DEN GAMLE VÆRDI FORKERT, var kalibreringsmålet: 0,26 blev
 * valgt, så modellen ramte Superligaens GENNEMSNITLIGE uafgjort-rate. Et
 * gennemsnit kan ikke se, om kurven har rigtig form — og modellen ramte
 * gennemsnittet ved at være for høj i de jævnbyrdige kampe og for lav i de
 * skæve. Målingen her grupperer efter styrkeforskel og fitter mod hver enkelt
 * kamp, så begge dele afsløres.
 *
 * DECAY ER EFTERPRØVET og skal ikke røres uden nye tal. 95 %-intervallet over
 * alle 6.143 kampe er 0,35-0,63; 0,55 ligger midt i det. Sådan ser modellen ud
 * i de skæve kampe, hvor parameteren overhovedet kan måles — kolonnerne er
 * NUVÆRENDE model (0,305/0,55) og det forkastede forslag (0,287/0,248):
 *
 *     skew        kampe   faktisk   nu       forkastet
 *     0,5-0,6      285     16,5 %   16,8 %   21,9 %
 *     0,6-0,7      118     11,9 %   15,1 %   20,9 %
 *     0,7-1,0       26      3,8 %   13,5 %   19,9 %
 *
 * Vær ærlig om, hvad det viser: modellen ligger nu en anelse HØJT i de skæve
 * kampe (+12 % over skew 0,5, 69 forventede mod 62 faktiske), hvor den før lå
 * lavt. Det er ikke gratis, men det er inden for støjen — usikkerheden på de
 * bånd er ±4-7 procentpoint, og det øverste bånd er 26 kampe i alt. Prisen for
 * at ramme dér ville være at ramme skævt i de 5.700 andre kampe. Det forkastede
 * forslag ligger 49 % for højt i netop de samme kampe.
 *
 * (0,25 stod som forslag undervejs, fittet mod 14 bookmakerpriser. Det var
 * forkert af to grunde, som er værd at huske: Superligaen har INGEN kampe over
 * skew 0,50, så dens historik kan slet ikke måle henfaldet — og en naiv
 * de-vigning, der fordeler bookmakerens margin proportionalt over de tre
 * udfald, overdriver langskuddene systematisk. Markedet så fladt ud, fordi
 * metoden gjorde det fladt.)
 *
 * Måles med scripts/maal-uafgjort.mjs. Se docs/spilbalance.md.
 */
export const ELO = {
  START: 1500,       // rating for et nyt/ukendt hold
  HFA: 60,           // hjemmebane-fordel i Elo-point (~0.09 forventning)
  K: 20,             // opdateringshastighed pr. kamp
  DRAW_BASE: 0.305,  // uafgjort-sandsynlighed når holdene er LIGE stærke
  DRAW_DECAY: 0.55,  // hvor hurtigt uafgjort-chancen falder med styrkeforskel
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
 * Grænser for odds. Der er ikke længere et LOFT — kun et gulv.
 *
 * MAX var 6,0, blev foreslået hævet til 8,0, og er nu fjernet. Begrundelsen er
 * målt, og den er skarpere end de to tidligere forsøg:
 *
 * ET LOFT KLIPPER KUN GEVINSTEN, aldrig indsatsen. Oddsene er fair, så en
 * Chance har forventning nul — men klippes udbetalingen, bliver forventningen
 * NEGATIV. Den, der satser modigt, spiller altså til dårligere end fair pris.
 * Målt over 3.000 sæsoner af Premier League med tolv spillere, tre pr.
 * Chancen-strategi (retfærdig andel 25 %):
 *
 *     loft    ingen   sikker  moderat   modig   modiges udbytte af Chancen
 *      6      27,6 %  41,5 %   15,5 %   15,5 %      −34 point pr. sæson
 *      8      11,7 %  26,5 %   39,1 %   22,7 %      −47 point
 *     12       9,3 %  27,0 %   33,3 %   30,3 %      −27 point
 *    intet     8,6 %  24,8 %   30,6 %   36,1 %       −2 point
 *
 * Ved loft 6 vandt den, der SLET IKKE brugte Chancen, oftere (27,6 %) end den,
 * der brugte den modigt (15,5 %). Loftet gjorde altså funktionen uklog at
 * bruge — det stik modsatte af, hvad den er til for.
 *
 * Dertil et fund, der ikke kræver simulering: loftet klippede 46 udfald i
 * Superligaen og 197 i Premier League ned til nøjagtig 6,00 — i 10 henholdsvis
 * 62 kampe stod TO udfald til samme pris. Kortet viste altså samme pris for et
 * udfald med 17 % chance og et med 4 %, så den, der ville satse modigt, valgte
 * i blinde og ramte systematisk det dårligste.
 * (RETTET: her stod "46 udfald i Premier League". 46 er SUPERLIGAENS tal; PL's
 * er over fire gange så stort. Begge er målt under den GAMLE uafgjort-model,
 * altså det, spillerne faktisk så.)
 *
 * HER STOD OGSÅ "uden loft kan to udfald aldrig betale ens". Det er FORKERT,
 * og det er værd at forstå hvorfor. Er udeholdet præcis HFA (60 point)
 * stærkere end hjemmeholdet, er de to hold reelt lige, og så er p1 og p2
 * MATEMATISK identiske — ikke et afrundingssammenfald. Superligaen har intet
 * par med præcis 60 points forskel; Premier League har ét (Brentford 1503 mod
 * Aston Villa 1563 → 1 og 2 begge 2,68), og det spilles to gange. Loftet var
 * problemet, fordi det ramte 46 + 197 udfald; HFA-sammenfaldet rammer to
 * kampe i to ligaer og er en egenskab ved modellen, ikke en fejl. Lov derfor
 * ikke spillerne, at det aldrig sker.
 *
 * PRISEN, som er bevidst valgt: højeste odds i Premier League er 24,39
 * (Arsenal–Hull ude), så én Chance kan give op til 187 point. Det sker 4,1 % af
 * gangene, og de øvrige 95,9 % koster indsatsen. Simuleringen siger, at det
 * ikke gør sæsonen til et lotteri — den modige vinder 36 %, ikke 80 %.
 *
 * En tidligere idé om at skalere INDSATSEN med oddsene blev forkastet: med
 * heltalsindsatser og et gevinstloft på 40 ville odds 6,00 give maks 40 point
 * og odds 24,39 kun 23,4. Langskuddet ville altså blive dårligere end den
 * sikre kamp — det modsatte af hensigten.
 *
 * MIN bliver stående: et udfald skal betale mere end indsatsen tilbage. Vær
 * dog klar over, at det er et VÆRN, ikke en aktiv grænse: efter DRAW_BASE gik
 * til 0,305, er den højeste sandsynlighed modellen overhovedet kan give
 * 0,8958 — altså laveste odds 1,116. Gulvet kan derfor aldrig binde gennem
 * outcomeOdds, som er den eneste vej i produktion. Det binder kun, hvis nogen
 * kalder fairOdds direkte med en sandsynlighed over 0,909.
 *
 * Måles med scripts/maal-chancen.mjs (tabellen ovenfor) og
 * scripts/maal-spilbalance.mjs (1X2 og combi). Se docs/spilbalance.md.
 */
export const ODDS = {
  MIN: 1.1,
  // Kun for et udfald, modellen har givet sandsynligheden 0 eller noget
  // ugyldigt. Det kan ikke ske med rigtige Elo-tal, men scoringen må ikke
  // returnere Infinity, hvis det alligevel sker.
  UGYLDIG: 100,
};

/**
 * Fair (EV-neutral) decimal-odds for en sandsynlighed. Kun et GULV (MIN) —
 * intet loft. Afrundes til 2 decimaler. p ≤ 0 eller ugyldigt giver UGYLDIG.
 */
export function fairOdds(p) {
  const prob = Number(p);
  // Et umuligt eller ugyldigt udfald har ingen fair pris. Før faldt det
  // tilbage på loftet; nu findes der ikke et. UGYLDIG er derfor et bevidst
  // valgt tal, ikke en grænse for rigtige odds — modellen giver aldrig p ≤ 0.
  if (!Number.isFinite(prob) || prob <= 0) return ODDS.UGYLDIG;
  const raw = Math.max(ODDS.MIN, 1 / prob);
  return Math.round(raw * 100) / 100;
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

