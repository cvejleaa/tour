// ---------------------------------------------------------------------------
// functions-platform/facit.js — HVAD ET FACIT ER. Én kontrakt for alle veje.
//
// SPEJL af src/lib/facit.js. De to filer skal følges ad (CLAUDE.md), og
// pariteten er testdækket i facit.test.js.
//
// Et facit-dokument kan skrives af tre veje: resultat-synken
// (superligaSync.syncResultsCore), facit i hånden (manuelFacit.js) og senere
// håndbold-provideren. Før stod "hvad er et facit" som en literal inde i
// synken, og en anden vej måtte gætte formen. Gættede den forkert — fx
// glemte `status` eller skrev mål som tekst — så kampkortet, afregningen og
// Runde-Botten hver sin ting om den samme kamp. Derfor står formen ét sted.
//
// KNOCKOUT (ejerens beslutning §11.1): der tippes på stillingen efter
// ORDINÆR TID (60 minutter i håndbold), og X er muligt. `result`, `homeGoals`
// og `awayGoals` er derfor ALTID stillingen efter ordinær tid — det er dem,
// point, Elo og odds regnes af. Et slutresultat efter forlængelse eller
// straffekast står SEPARAT i `slut: {home, away, afgjort}` og flytter intet
// point. Sættet af afgørelser er lukket (AFGJORT), så 'forlaenget' ikke
// bliver den næste magiske streng.
//
// To funktioner med hver sin rolle:
//   facitFejl(input, {knockout})  STRENG validering → dansk fejltekst | null.
//                                 Bruges af fladen (live i dialogen) og af
//                                 serveren, før et menneskes facit skrives.
//   facitFelter(input)            FORMEN → felterne til dokumentet | null.
//                                 Lempelig på mål (som synken altid har
//                                 været), men et `slut` kommer kun med, når
//                                 det hænger sammen med stillingen.
// ---------------------------------------------------------------------------

const { outcomeFromScore } = require('./superligaScoring');

/** Mærket på en kamp, hvis facit er sat i hånden. Synken rører den så ikke. */
const RESULTAT_KILDE_MANUEL = 'manuel';

/** Det lukkede sæt af måder, en knockout-kamp kan afgøres på efter ordinær tid. */
const AFGJORT = Object.freeze(['forlaenget', 'straffe']);
const AFGJORT_NAVN = Object.freeze({
  forlaenget: 'efter forlænget spilletid',
  straffe: 'efter straffekast',
});

// Et loft, så en tastefejl som 300 ikke bliver et facit. Håndbold ender
// sjældent over 45 mål pr. hold; fodbold aldrig over 15.
const MAKS_MAAL = 99;

/** Er spillet et kampspil (kampe/hold/runder/1X2)? Typen, ikke sporten. */
function erKampspil(game) {
  return game?.type === 'football';
}

/**
 * Skal spillets kampe have facit — og dermed vogtes af strandede-alarmen?
 * Kampspil, der er åbne eller i gang. Et afsluttet spil vogtes ikke længere:
 * dets stilling er gjort op, og en alarm, ingen kan handle på, lærer ejeren
 * at ignorere fladen.
 *
 * Samme form som forventerPaamindelser (paamindelsesGate.js) — og med vilje
 * IKKE gated på sync.provider: et spil uden kilde har MEST brug for vagten,
 * for der er ingen synk, der kan redde en glemt kamp.
 */
function forventerFacit(game) {
  return erKampspil(game) && (game?.status === 'open' || game?.status === 'live');
}

function erMaal(v) {
  return Number.isInteger(v) && v >= 0 && v <= MAKS_MAAL;
}

/**
 * STRENG validering af et facit, et menneske (eller en ny kilde) vil skrive.
 *
 * @param {{home:number, away:number, slut?:{home:number, away:number, afgjort:string}|null}} input
 *   home/away = mål efter ORDINÆR tid.
 * @param {{knockout?:boolean}} [opts]
 * @returns {string|null} dansk fejltekst, eller null når facit er gyldigt
 */
function facitFejl({ home, away, slut = null } = {}, { knockout = false } = {}) {
  if (!erMaal(home) || !erMaal(away)) {
    return `Mål efter ordinær tid skal være hele tal fra 0 til ${MAKS_MAAL}.`;
  }
  const uafgjort = home === away;
  if (slut == null) {
    if (knockout && uafgjort) {
      return 'Uafgjort efter ordinær tid i en knockout-kamp: angiv også slutresultatet efter forlængelse/straffekast, og hvordan kampen blev afgjort.';
    }
    return null;
  }
  if (!knockout) {
    return 'Kampen er ikke en knockout-kamp, så den har intet slutresultat efter forlængelse eller straffekast.';
  }
  if (!uafgjort) {
    return 'Kampen blev afgjort i ordinær tid, så der er intet slutresultat efter forlængelse/straffekast.';
  }
  if (!erMaal(slut.home) || !erMaal(slut.away)) {
    return `Slutresultatet skal være hele tal fra 0 til ${MAKS_MAAL}.`;
  }
  if (!AFGJORT.includes(slut.afgjort)) {
    return 'Vælg, hvordan kampen blev afgjort: forlænget spilletid eller straffekast.';
  }
  if (slut.home === slut.away) return 'Slutresultatet skal have en vinder.';
  if (slut.home < home || slut.away < away) {
    return 'Slutresultatet kan ikke have færre mål end stillingen efter ordinær tid.';
  }
  return null;
}

/**
 * Felterne, et facit skriver på kamp-dokumentet. KUN de felter, der ER
 * facit — tidsstempler og oprydning (live, liveMaal) lægger hver vej selv på,
 * fordi de bruger FieldValue, som modulet ikke må kende (det er spejlet til
 * klienten).
 *
 * Lempelig på målene med vilje: resultat-synken har altid skrevet kildens
 * mål, som de kom, og Superligaen og Premier League skal opføre sig præcis
 * som før. Et `slut` kommer derimod kun med, når det hænger sammen med
 * stillingen (uafgjort efter ordinær tid, en vinder, ikke færre mål) — ellers
 * er HELE facit ugyldigt (null), for en kamp med et slutresultat, der modsiger
 * sin egen stilling, er værre end en kamp uden facit.
 *
 * @returns {{result:string, homeGoals:*, awayGoals:*, status:'finished',
 *            slut?:{home:number, away:number, afgjort:string}}|null}
 */
function facitFelter({ home, away, slut = null } = {}) {
  const result = outcomeFromScore(home, away);
  if (!result) return null;
  const ud = { result, homeGoals: home, awayGoals: away, status: 'finished' };
  if (slut != null) {
    if (facitFejl({ home, away, slut }, { knockout: true }) != null) return null;
    ud.slut = { home: slut.home, away: slut.away, afgjort: slut.afgjort };
  }
  return ud;
}

/** Er kampens facit sat i hånden (og dermed fredet for synken)? */
function erManuelFacit(kamp) {
  return kamp?.resultatKilde === RESULTAT_KILDE_MANUEL;
}

/**
 * Én kamp, hvor kilden er UENIG med facit i hånden, som tekst: holdnavne og
 * BEGGE stillinger ("AGF – OB (i hånden 1-1, kilden 2-1)"). Bruges af
 * "⬇️ Synk resultater nu" i fladen og af sweep'ets Drift-kort på serveren, så
 * de to siger det samme om den samme kamp. Et id står kun, når holdnavnene
 * mangler.
 *
 * @param {{id:string, home?:string|null, away?:string|null,
 *          haand?:{home:*, away:*}, kilde?:{home:*, away:*}}} u
 * @returns {string}
 */
function uenigTekst(u) {
  const navn = u?.home && u?.away ? `${u.home} – ${u.away}` : String(u?.id ?? '?');
  const st = (x) => (x && x.home != null && x.away != null ? `${x.home}-${x.away}` : '—');
  return `${navn} (i hånden ${st(u?.haand)}, kilden ${st(u?.kilde)})`;
}

module.exports = {
  RESULTAT_KILDE_MANUEL, AFGJORT, AFGJORT_NAVN, MAKS_MAAL,
  erKampspil, forventerFacit, facitFejl, facitFelter, erManuelFacit, uenigTekst,
};
