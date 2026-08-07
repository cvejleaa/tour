// ---------------------------------------------------------------------------
// Regelbrevet — én udmelding om pointreglen, til at indsætte i Send mail.
//
// ENGANGS-FUNKTION. Teksten handler om tre navngivne ændringer i august 2026.
// Når brevet er sendt, skal denne fil og knappen i BroadcastTab fjernes igen.
// Det er lektien fra sidste gang (#112): en admin-mail-funktion, der ikke kan
// nås fra fladen, er dødt maskineri, og teksten forældes, uden at nogen
// opdager det.
//
// REGLERNE udledes af konstanterne i superligaScoring.js — ikke af hukommelsen.
// Det er ikke pedanteri. Vi undskylder i netop dette brev for at have sendt to
// forskellige forklaringer på den samme regel ud på to dage. Et brev med
// håndskrevne regler kan sige noget andet end koden, og så ville vi gøre det
// igen. Ændres TRAEF_BONUS, ændrer brevet sig med — eller testen fejler.
//
// MEN VÆR ÆRLIG OM GRÆNSEN: de MÅLTE tal (34 point, 46 udfald, "3,3 i stedet
// for 3,9") er håndskrevne og kan ikke udledes af en konstant — de kommer fra
// scripts/maal-chancen.mjs og scripts/maal-uafgjort.mjs. Ændres modellen, skal
// de køres igen. Her stod før, at INTET blev skrevet af; det var for stærkt
// sagt og inviterede til falsk tryghed.
//
// TIMING: brevet gælder fra RUNDE 4. Runde 3's kupon blev spillet under det
// gamle loft, og oddsene skrives først om, når rundens sidste resultat lander
// (recomputeSeasonElo kaldes kun ved facit-ændring). Send derfor først brevet,
// når du har set en kamp med odds over 6,00 på skærmen — ellers lover det
// noget, spillerne ikke kan se.
// ---------------------------------------------------------------------------

import { TRAEF_BONUS } from '../../lib/superligaScoring';
import { fmtDec } from '../../lib/daNum';

/** Tidslinjen, som den faktisk var. Ikke "to gange i dag". */
export const TIDSLINJE = {
  bonusIndfoert: 'onsdag den 5. august om formiddagen',
  foersteMail: 'onsdag eftermiddag',
  bonusRullet: 'torsdag den 6. august sidst på eftermiddagen',
  loftFjernet: 'efter runde 3',
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

export const REGELBREV_EMNE = 'Undskyld rodet — her er de endelige regler, og de gælder fra runde 4';

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

Chancens REGLER er uændrede. Samme indsatsgrænser, samme afregning. Men den kan give mere end før — se nedenfor.

ÉN TING MERE, OG SÅ ER DER RO

Da jeg regnede efter, faldt to andre ting ud. Begge har været der fra begyndelsen, og begge trak i samme retning: mod den forsigtige.

LOFTET ER VÆK. Der har hele tiden været et loft på ${fmtDec(6)} over, hvor mange point ét udfald kan give. Det ramte kun de høje odds — altså kun jer, der tipper outsidere. Værst var det for Chancen: loftet skar gevinsten, men aldrig indsatsen, så et modigt bud var i praksis et tab. Jeg har regnet på 3.000 sæsoner, og den, der brugte Chancen modigt, tabte i snit 34 point om året på det. Den, der slet ikke brugte den, klarede sig bedre. Sådan var det ikke tænkt.

Nu er der intet loft. Rammer du et udfald til odds 8, får du 8 point. Loftet klippede 46 udfald i denne sæsons program, og i 10 af de 132 kampe stod TO udfald til nøjagtig samme pris — blandt andet FCK–Lyngby, hvor både uafgjort og udesejr var sat til 6,00. Det sker ikke mere.

Det betyder også, at Chancen kan give mere: en fuld indsats på 8 point til odds 8,01 giver 56 point i stedet for de 40, loftet tillod. Risikoen er den samme — rammer du ikke, koster det indsatsen.

UAFGJORT VAR FORKERT PRISSAT. Modellen regnede for få uafgjorte, og fejlen voksede jo mere forskellige holdene var. Jeg har målt den mod 6.143 spillede kampe fra 13 sæsoner i Superligaen og 10 i Premier League. Den er rettet nu.

Det betyder, at uafgjort bliver lidt billigere end før — omkring 3,3 i stedet for 3,9 i en jævnbyrdig kamp — mens hjemme- og udesejr bliver lidt dyrere. Det er den ærlige pris; den gamle var det ikke.

HVORNÅR DET GÆLDER FRA

Begge dele gælder fra RUNDE 4. Runde 3's kupon — Sønderjyske–Viborg, Randers–Lyngby, Horsens–Brøndby og Silkeborg–OB — blev spillet under de gamle odds, og de er ikke rørt. Ingen point er ændret bagud.

To kampe kræver en særlig bemærkning: AGF–FCM den 2. september og FCK–FCN den 3. september hører til runde 3, men spilles først om en måned. De er altså ikke spillet endnu, og derfor får de de nye priser. Har du allerede tippet dem, er uafgjort blevet lidt billigere og hjemme/ude lidt dyrere. De er ikke med på runde 3's combi-kupon, så kuponen er upåvirket.

Og for en god ordens skyld: det retter ikke alt. Combi-bonussen belønner stadig den, der rammer mange kampe, mere end den, der rammer få og svære. Det er en anden diskussion, og jeg tager den ikke nu.

JERES POINT ER RETTET

Jeg har rettet de tips, der nåede at blive scoret efter den forkerte regel. Det var ${BAGFYLDNING.bets} tips fordelt på alle ${BAGFYLDNING.spillere} spillere, og hvert enkelt af dem gik præcis ${Math.abs(BAGFYLDNING.prBet)} point ned — altså den +1, der aldrig skulle have været der.

Det betyder, at nogle af jer står med lidt færre point end i onsdags. Det er ikke en ny fejl; det er rettelsen. Den indbyrdes rækkefølge er stort set uændret, fordi alle mistede det samme pr. ramt kamp — den, der havde ramt flest, mistede mest.

Der blev taget backup, før noget blev rørt.

HVAD JEG TAGER MED MIG

Jeg skulle have regnet efter, før jeg lagde ændringen ud — ikke bagefter. Og jeg skulle have skrevet ud én gang med det rigtige frem for to gange med hver sin version. Undskyld for forvirringen.

Runde 4 er den første, der kører fuldt på reglerne her. Runde 3 er afsluttet på de gamle.

God fornøjelse`;

/** Emne + tekst samlet, så knappen i Send mail kun har ét sted at hente fra. */
export const REGELBREV = { emne: REGELBREV_EMNE, tekst: REGELBREV_TEKST };
