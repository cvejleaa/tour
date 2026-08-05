'use strict';
// ---------------------------------------------------------------------------
// pointOpdateringMail.js — personlig mail om en POINTREGEL-ændring.
//
// Én mail pr. spiller med hans EGNE tal, flettet på serveren. Ejeren vælger
// modtagere og trykker send; han skal ikke skrive eller klippe noget.
//
// Rene funktioner — ingen Firestore, ingen SMTP. Det, der kan regnes forkert,
// kan derfor prøves af uden en database.
// ---------------------------------------------------------------------------

const { round1, outcomeReward } = require('./superligaScoring');

// ---------------------------------------------------------------------------
// DEN GAMLE COMBI-REGEL — FROSSEN. MÅ ALDRIG "RETTES".
//
// Gyldig indtil 5. august 2026. Den findes her udelukkende for at kunne regne
// "før"-tallet i en mail, der forklarer, hvad ændringen gjorde. Ændrer nogen
// den, ændrer de fortiden, og mailen begynder at lyve om, hvad folk havde.
//
// Reglen var: man skulle have tippet ALLE kampe i runden (kuponen fandtes
// ikke), og bonussen var de ramte odds ganget RÅT sammen — med loft 25 ved
// nul fejl, 12 ved én fejl, og nul fra to fejl og op.
// ---------------------------------------------------------------------------
function gammelCombi(hitOdds, antalKampeIRunden) {
  if (!Array.isArray(hitOdds) || !Number.isFinite(antalKampeIRunden)) return 0;
  if (antalKampeIRunden < 2) return 0;
  const fejl = antalKampeIRunden - hitOdds.length;
  if (fejl < 0 || fejl > 1) return 0;
  // Vagten står på HVERT odds, ikke på produktet: to negative odds ganger op
  // til et positivt produkt og ville slippe igennem. Ændrer intet historisk —
  // rigtige odds er altid positive — men reglen skal ikke hvile på det.
  if (hitOdds.some((o) => !(Number(o) > 0))) return 0;
  const produkt = hitOdds.reduce((a, b) => a * Number(b), 1);
  return round1(Math.min(produkt, fejl === 0 ? 25 : 12));
}

/**
 * Udled én spillers tal FØR ændringen ud fra det, der står i basen NU.
 *
 * Rescoren overskrev kun `bets.points`. Tips, frosne odds og facit er urørte,
 * og træf-bonussen er en konstant — derfor er før-tallene eksakt udledelige:
 *
 *   p1x2_før = p1x2_nu − antal træffere      (ét point pr. træffer, altid)
 *   chance   = uændret                        (afregnes til de RENE odds)
 *   pulje    = uændret                        (afregnes ved sæsonslut)
 *   combi_før = den gamle regel, runde for runde
 *
 * @param {{opdeling:object}} spiller  players/{uid} som den står nu
 * @param {Array} bets                 spillerens bets (allerede gate-filtreret)
 * @param {object} roundCtx            buildRoundContext over de tællende kampe
 */
function udledFoer(spiller, bets, roundCtx) {
  const nu = spiller.opdeling || {};
  // Træffere og gammel combi regnes i ÉN gennemgang, så de ikke kan komme til
  // at bygge på hver sin opfattelse af "afgjort".
  const perRunde = new Map();
  let traeffere = 0;
  for (const b of bets) {
    const info = roundCtx.byMatch[b.matchId];
    if (!info || !info.result) continue;
    const runde = info.round;
    if (runde == null) continue;
    if (!perRunde.has(runde)) perRunde.set(runde, { tippet: 0, hitOdds: [] });
    const r = perRunde.get(runde);
    r.tippet += 1;
    if (b.pick === info.result) {
      traeffere += 1;
      r.hitOdds.push(outcomeReward(info.result, info.odds));
    }
  }

  let combiFoer = 0;
  for (const [runde, r] of perRunde) {
    const rc = roundCtx.rounds[runde];
    if (!rc) continue;
    // Den gamle regel så på HELE runden, ikke på ugens kupon — vinduet fandtes
    // ikke dengang. `count`, ikke `combiCount`.
    if (rc.settledCount !== rc.count) continue; // runden var ikke afgjort
    if (r.tippet !== rc.count) continue;        // havde ikke tippet hele runden
    combiFoer += gammelCombi(r.hitOdds, rc.count);
  }

  const p1x2 = round1((Number(nu.p1x2) || 0) - traeffere);
  const chance = round1(Number(nu.chance) || 0);
  const combi = round1(combiFoer);
  const pulje = round1(Number(nu.pulje) || 0);
  return {
    p1x2, chance, combi, pulje, traeffere,
    total: Math.max(0, round1(p1x2 + chance + combi + pulje)),
  };
}

/** Dansk decimaltal: 33.7 → "33,7", 25 → "25". */
function dk(x) {
  const n = round1(x);
  return String(Number.isInteger(n) ? n : n.toFixed(1)).replace('.', ',');
}

/**
 * Hvilken slags mail skal spilleren have?
 *
 * Grenene er ikke pynt. Standardteksten siger "du har fået point tilbage" —
 * den er direkte usand for den, der ikke rykkede sig, og den modsiger sit eget
 * tal hos den, hvis combi FALDT. Begge findes i virkeligheden.
 */
function vaelgGren(foer, efter) {
  if (round1(efter.total) === round1(foer.total)) return 'urort';
  if (round1(efter.combi) < round1(foer.combi)) return 'combiNed';
  if (round1(foer.combi) === 0 && round1(efter.combi) > 0) return 'franul';
  return 'op';
}

const FAELLES = `Der er lavet tre ændringer i Vejleaa Tip inden runde 3. De gælder med
tilbagevirkende kraft, så din stilling har flyttet sig.

1. DU FÅR NU ET EKSTRA POINT FOR HVER KAMP, DU RAMMER.

Før fik du præcis oddsene: ramte du en favorit til odds 1,3, gav det 1,3 point.
Nu giver det 2,3. Rammer du en overraskelse til odds 4,5, giver det 5,5.

Grunden er ikke gavmildhed, men et regnestykke. Oddsene er sat som 1 delt med
sandsynligheden, og derfor er ethvert tip i gennemsnit præcis 1 point værd —
uanset om du tipper favoritter eller vover dig ud. I det lange løb var alle
strategier altså lige gode, og sæsonen blev afgjort af held alene. Den, der
rammer flest kampe men rammer favoritter, havde kun 4 % chance for at vinde
sæsonen i vores beregninger. Med det ene ekstra point er et tip mere værd, jo
oftere du har ret.

2. COMBI-BONUSSEN GIVER POINT FOR HVER KAMP, DU RAMMER — OG DU BEHØVER IKKE
TIPPE DEM ALLE.

Før skulle du ramme alle seks kampe, eller alle på nær én, for at få noget som
helst. To fejl, og bonussen var nul. Nu tæller hver kamp, du rammer, fra to
rigtige og opefter. Bonussen er stadig oddsene ganget sammen, men dæmpet:

    Bonus = 2 x kvadratroden af (oddsene på de kampe, du ramte, ganget sammen)
    - dog højst 25 point.

Og du skal ikke længere have tippet hele runden. Har du glemt en kamp, tæller
den bare ikke med — den koster dig ikke bonussen. Før kostede ét glemt tip dig
hele rundens bonus, og det ramte typisk den, der havde mindst tid til det i
forvejen.

Der ligger en udbetalingstabel under Hjælp inde i spillet, hvis du vil se, hvad
et givent regnestykke lander på.

3. UDSATTE KAMPE VENTER VI IKKE LÆNGERE PÅ.

Runde 3 er splittet: fire kampe spilles i weekenden, to er rykket til september.
Med den gamle regel ville hele rundens combi-bonus have ventet på de to — den
ville først være faldet en måned senere, hvor ingen kunne huske runden.

Fra nu af gøres en runde op på sine egne kampe i sin egen uge. De udsatte kampe
giver point præcis som altid, når de spilles — der er ikke ét point at hente,
som du ikke får. Men de tæller ikke med i combi'en.

I runde 3 er kuponen derfor fire kampe. Du kan se det direkte på kampene inde på
Tip: der står "På kuponen" eller "Uden for kuponen" på hvert kort.`;

const HALE = (appUrl, gameId) => `Den nye stilling er her:
${appUrl}/spil/${gameId}?fane=stilling

En sidste ting: pilene op og ned efter runde 3 måler mod placeringerne fra runde
2, som blev sat efter de gamle regler. En pil dér kan derfor lige så godt skyldes
omregningen som selve runden. Fra runde 4 er de retvisende igen.

Skriv endelig, hvis noget ser forkert ud.`;

/** Den personlige del — ét afsnit, valgt efter hvad der faktisk skete. */
function personligBlok(gren, foer, efter) {
  const chance = round1(efter.chance);
  const chanceLinje = chance !== 0
    ? `\nDertil dine ${dk(chance)} point fra Chancen, så stillingen viser ${dk(efter.total + 0)}.`
    : '';
  if (gren === 'urort') {
    return `For dig flytter regnestykket sig ikke: du har ikke ramt nogen kampe endnu, så
der er hverken point pr. kamp eller combi at regne om. Der er ikke taget noget
fra dig, og der er derfor heller ikke noget at give tilbage.

Til gengæld er ændringen især lavet med dig i tankerne. Før skulle man tippe HELE
runden for overhovedet at være med i combi-bonussen, og glemte man én kamp,
mistede man det hele. Det krav er væk. Nu tæller hver kamp, du tipper og rammer,
for sig — og i runde 3 er kuponen kun fire kampe.`;
  }
  if (gren === 'combiNed') {
    return `Du ramte alt, hvad der var at ramme — og du er den eneste, der gjorde det.

Din combi går NED, fra ${dk(foer.combi)} til ${dk(efter.combi)}. Det skal siges lige ud. Da en fejlfri
runde gav 25, svarede den til fire almindelige runders point, og så var det dén
runde, der afgjorde sæsonen — ikke de tyve andre. Det er præcis det, vi har
villet til livs.

Men dine point pr. kamp går samtidig fra ${dk(foer.p1x2)} til ${dk(efter.p1x2)}, fordi hver træffer nu
giver et point ekstra. Samlet går du fra ${dk(foer.total)} til ${dk(efter.total)} — altså op, ikke ned.${chanceLinje}`;
  }
  if (gren === 'franul') {
    return `Du ramte ${foer.traeffere} kampe og fik NUL i combi, fordi du havde mere end én fejl. Nu
får du ${dk(efter.combi)}. Dine point pr. kamp går fra ${dk(foer.p1x2)} til ${dk(efter.p1x2)}.

Samlet fra ${dk(foer.total)} til ${dk(efter.total)}.${chanceLinje}

To fejl slettede før alt, hvad du havde ramt, uanset hvor svære de andre var.
Nu tæller de.`;
  }
  return `Du ramte ${foer.traeffere} kampe. Dine point pr. kamp går fra ${dk(foer.p1x2)} til ${dk(efter.p1x2)}, og din
combi fra ${dk(foer.combi)} til ${dk(efter.combi)}.

Samlet fra ${dk(foer.total)} til ${dk(efter.total)}.${chanceLinje}

De ${dk(efter.combi)} kommer af, at du havde de rigtige odds med: bonussen belønner nu hvad du
ramte, ikke bare at du ramte nok.`;
}

/**
 * Byg én spillers færdige mail.
 * @returns {{emne:string, tekst:string, gren:string, foer:object, efter:object}}
 */
function byggMail({ navn, foer, efter, appUrl, gameId }) {
  const gren = vaelgGren(foer, efter);
  const emne = gren === 'urort'
    ? 'Vi har lavet pointene om — sådan ser din stilling ud nu'
    : 'Vi har lavet pointene om — og du har fået point tilbage';
  const tekst = `Hej ${navn}\n\n${FAELLES}\n\nHVAD DET BETYDER FOR DIG\n\n`
    + `${personligBlok(gren, foer, efter)}\n\n${HALE(appUrl, gameId)}`;
  return { emne, tekst, gren, foer, efter };
}

module.exports = { gammelCombi, udledFoer, vaelgGren, byggMail, dk };
