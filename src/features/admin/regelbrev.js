// ---------------------------------------------------------------------------
// Regelbrevet — én udmelding om pointreglen, til at indsætte i Send mail.
//
// ENGANGS-FUNKTION. Teksten handler om tre navngivne ændringer i august 2026.
// Når brevet er sendt, skal denne fil og knappen i BroadcastTab fjernes igen.
// Det er lektien fra sidste gang (#112): en admin-mail-funktion, der ikke kan
// nås fra fladen, er dødt maskineri, og teksten forældes, uden at nogen
// opdager det.
//
// TALLENE SKRIVES IKKE AF — de udledes af konstanterne i superligaScoring.js.
// Det er ikke pedanteri. Vi undskylder i netop dette brev for at have sendt to
// forskellige forklaringer på den samme regel ud på to dage. Et brev med
// håndskrevne tal kan sige noget andet end koden, og så ville vi gøre det igen.
// Ændres TRAEF_BONUS eller ODDS.MAX, ændrer brevet sig med — eller testen
// fejler.
// ---------------------------------------------------------------------------

import { TRAEF_BONUS, ODDS } from '../../lib/superligaScoring';
import { fmtDec } from '../../lib/daNum';

/** Tidslinjen, som den faktisk var. Ikke "to gange i dag". */
export const TIDSLINJE = {
  bonusIndfoert: 'onsdag den 5. august om formiddagen',
  foersteMail: 'onsdag eftermiddag',
  bonusRullet: 'torsdag den 6. august sidst på eftermiddagen',
  loftHaevet: 'i dag',
};

/** Hvad bagfyldningen faktisk gjorde — verificeret i kørsel 31134849406. */
export const BAGFYLDNING = { bets: 48, spillere: 12, prBet: -1 };

/**
 * Sætningen om, hvad et træf giver NU. Eksporteret, fordi den skal kunne
 * efterprøves alene: brevet forklarer også den GAMLE regel ("odds plus én"),
 * og en test på hele teksten kan ikke skelne en beskrivelse af fortiden fra et
 * løfte om nutiden. Det fandt testen selv.
 */
export const NUVAERENDE_REGEL = TRAEF_BONUS === 0
  ? 'Rammer du en kamp, får du kampens odds i point. Hverken mere eller mindre.'
  : `Rammer du en kamp, får du kampens odds plus ${fmtDec(TRAEF_BONUS)} i point.`;

export const REGELBREV_EMNE = 'Undskyld rodet — her er de endelige regler før runde 3';

export const REGELBREV_TEKST = `Kære alle

Jeg skylder jer en undskyldning. I har fået to forskellige forklaringer på pointreglen på to dage, og den ene af dem var min regnefejl. Her er hvad der skete, hvad der gælder nu, og hvad der er rettet i jeres point.

HVAD DER SKETE

${TIDSLINJE.bonusIndfoert.charAt(0).toUpperCase() + TIDSLINJE.bonusIndfoert.slice(1)} lagde jeg en ændring ud: man fik +1 point oveni oddsene for at ramme en kamp. ${TIDSLINJE.foersteMail.charAt(0).toUpperCase() + TIDSLINJE.foersteMail.slice(1)} skrev jeg ud om den.

Tanken var, at det skulle gøre spillet mere ligeligt. Det gjorde det modsatte. Med +1 er et tip værd sine odds plus én, og den ene ekstra betyder relativt mest, når oddsene er lave — altså når man tipper favoritten. Jeg havde regnet på det, men jeg havde regnet forkert. Da jeg regnede efter, sagde tallene det stik modsatte af det, jeg havde troet.

${TIDSLINJE.bonusRullet.charAt(0).toUpperCase() + TIDSLINJE.bonusRullet.slice(1)} rullede jeg det tilbage.

HVAD DER GÆLDER NU

${NUVAERENDE_REGEL}

  • Odds 1,45 på en favorit giver 1,45 point.
  • Odds 4,80 på en outsider giver 4,80 point.
  • Rammer du ikke, får du 0.

Det er hele 1X2-reglen. Ingen bonus for at ramme, ingen tillæg.

Combi-bonussen er uændret. Den ganger de rene odds på de kampe, du rammer i samme runde, og den har aldrig indeholdt den +1, der nu er væk.

Chancen er uændret. Samme indsatsgrænser, samme afregning.

ÉN TING MERE, OG SÅ ER DER RO

Da jeg regnede efter, opdagede jeg noget andet. Der har hele tiden været et loft over, hvor mange point ét udfald kan give. Det stod på ${fmtDec(6)}, og det ramte kun de høje odds — altså kun jer, der tipper outsidere. Det gjorde spillet skævt til fordel for den forsigtige, og det var ikke meningen.

Loftet er ${TIDSLINJE.loftHaevet} hævet til ${fmtDec(ODDS.MAX)}. Med det tal rammer det ingen kampe i denne sæsons program overhovedet — det er nu kun et værn mod en helt ekstrem kamp. Til gengæld er der ikke længere kampe, hvor to forskellige gæt betaler præcis det samme.

Det gælder fra runde 3. Runde 1 og 2 er ikke rørt.

JERES POINT ER RETTET

Jeg har rettet de tips, der nåede at blive scoret efter den forkerte regel. Det var ${BAGFYLDNING.bets} tips fordelt på alle ${BAGFYLDNING.spillere} spillere, og hvert enkelt af dem gik præcis ${Math.abs(BAGFYLDNING.prBet)} point ned — altså den +1, der aldrig skulle have været der.

Det betyder, at nogle af jer står med lidt færre point end i onsdags. Det er ikke en ny fejl; det er rettelsen. Den indbyrdes rækkefølge er stort set uændret, fordi alle mistede det samme pr. ramt kamp — den, der havde ramt flest, mistede mest.

Der blev taget backup, før noget blev rørt.

HVAD JEG TAGER MED MIG

Jeg skulle have regnet efter, før jeg lagde ændringen ud — ikke bagefter. Og jeg skulle have skrevet ud én gang med det rigtige frem for to gange med hver sin version. Undskyld for forvirringen.

Runde 3 starter i aften kl. 19, og den kører på de regler, der står her.

God fornøjelse`;

/** Emne + tekst samlet, så knappen i Send mail kun har ét sted at hente fra. */
export const REGELBREV = { emne: REGELBREV_EMNE, tekst: REGELBREV_TEKST };
