// ---------------------------------------------------------------------------
// functions-platform/kampDetaljer.js — HALVLEG, MÅLSCORERE OG TILSKUERTAL.
//
// Trin 2 af livescore-kilden. Trin 1 (livescoreHold.js) kunne koble vores
// kampe til deres; her hentes dét, vores egne kilder ikke bærer.
//
// ═══════════════════════════════════════════════════════════════════════════
// DEN DYRESTE REGEL I PROJEKTET: DENNE FIL SKRIVER ALDRIG FACIT.
// ═══════════════════════════════════════════════════════════════════════════
// Ikke `result`, ikke `homeGoals`, ikke `awayGoals`, ikke `kickoff`.
//
//   • `matchOutcome()` udleder facit AF MÅLENE, når `result` mangler
//     (superligaSync.js:206-217). En halvlegsstilling i `homeGoals` ville
//     afgøre runden på halvtidsresultatet.
//   • `recomputeGameMatch` (index.js:106-117) fyrer på HVER skrivning til et
//     kampdokument. Det eneste, der står mellem en berigelse og en fuld
//     rescore + recomputeSeasonElo + et Runde-Bot-opslag, er ÉN linje:
//     `if (prevResult === nextResult) return;`. Det er ikke en tilfældighed,
//     at den linje redder os — det er derfor forbudslisten findes. En senere
//     "forenkling" af den guard skal koste nogen en tanke.
//   • Tip-vinduet ER `request.time < kickoff` i firestore.rules. En flyttet
//     tid genåbner vinduet på en spillet kamp.
//
// Vagten er ÉN: `SKRIVBARE_FELTER` nedenfor. Objektet bygges af den liste og
// af intet andet, og en test muterer listen for at bevise, at et forbudt felt
// ikke kan snige sig med. Én vagt pr. sikkerhedsregel.
//
// ═══════════════════════════════════════════════════════════════════════════
// MÅL UDLEDES AF STILLINGEN, ALDRIG AF HÆNDELSESKODEN.
// ═══════════════════════════════════════════════════════════════════════════
// Første udgave af planen brugte en whitelist over `IT` (36 = mål, 63 =
// oplæg, 43 = gult), fordi det var dét, én prøvekamp viste. Målt over alle 54
// færdigspillede kampe rammer den kun 14 af 20 (PL) og 28 af 34 (SL) —
// se scripts/maal-livescore-detaljer.mjs:
//
//   IT 36      mål, i en container med oplægget som IT 63
//   IT 37, 38  mål, fladt — set med IR:"VAR"
//   IT 39      mål, fladt — uden Aid/Fn/Ln
//   IT 43, 45  kort
//   IT 62      ANNULLERET mål (IR:"VAR:disallowed_offside")
//
// En kode-whitelist fejler altså i BEGGE retninger, og den fejler TAVST: en
// ukendt kode giver bare ét mål færre. Fixturen `livescore-kampe.json`
// indeholder en 0-0-kamp (SOE-VIB, Eid 1784439), hvis eneste hændelse med en
// stilling er et ANNULLERET mål — en whitelist, der talte 62 med, ville
// opfinde et mål i en målløs kamp.
//
// I stedet: hver hændelse bærer `Sc` = stillingen EFTER den, og `Nm` = 1
// (hjemme) / 2 (ude). For et mål er `Sc[Nm-1]` holdets NYE måltal. Et
// annulleret mål bærer den UÆNDREDE stilling og falder derfor ud af sig selv.
// Reglen er selvvaliderende, som en whitelist aldrig kan være: de fundne
// numre skal danne den ubrudte kæde 1..Tr_hold. Gør de ikke det, har vi enten
// tabt et mål eller talt et med — og så skrives der INTET.
//
// Målt: kæden er komplet i 20/20 PL-kampe og 34/34 SL-kampe, alle 155 mål med
// scorernavn.
// ---------------------------------------------------------------------------

const { rensTekst } = require('./rensTekst');
const { kampNoegle } = require('./livescoreHold');

const API = 'https://prod-cdn-public-api.lsmedia1.com/v1/api/app';

/**
 * Referer KRÆVES — uden den svarer kilden ikke. Headeren er samtidig
 * påmindelsen om, hvad det her er: et browser-endpoint, ikke et API med en
 * aftale bag. Derfor også kredsløbsafbryderen længere nede.
 *
 * Funktion og ikke konstant: AbortSignal.timeout() starter uret med det
 * samme, så en delt konstant ville give alle kald ÉT fælles ur (samme fælde
 * som syncProviders.hentOpt).
 */
const hentOpt = () => ({
  headers: {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
      + 'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
    Referer: 'https://www.livescore.com/',
  },
  signal: AbortSignal.timeout(10000),
});

/**
 * DE ENESTE FELTER, DER MÅ SKRIVES. Se filhovedet.
 *
 * `detaljerSyncedAt` og de to afvisnings-felter er markeringer, ikke data —
 * de hører med, fordi filteret i syncKampDetaljerCore læser dem.
 */
const SKRIVBARE_FELTER = Object.freeze([
  'halvlegHome', 'halvlegAway', 'tilskuere', 'maal',
  'detaljerSyncedAt', 'detaljerVersion', 'detaljerAfvistAt', 'detaljerAfvistGrund',
  // Livescores kamp-id, kortlagt af sweep'et (kortlaegEids) — så efter-facit-
  // vejen og en kommende live-synk kan slå kampen op UDEN stage-kaldet på
  // 90–260 KB. Ikke en nøgle til noget hos os; kun et opslag hos dem.
  'livescoreEid',
]);

/**
 * HVILKEN UDGAVE AF DETALJERNE STÅR PÅ KAMPEN?
 *
 * Findes, fordi et NYT FELT ellers aldrig når de kampe, der allerede er
 * hentet. Filteret nedenfor springer en kamp over, når `detaljerSyncedAt` er
 * sat, og dét er permanent — så da `selvmaal` kom til, ville de fem selvmål,
 * der allerede stod på skærmen, være forblevet umærkede resten af sæsonen.
 * Quality Control fandt det, og det er husets "korrekt er ikke komplet": en
 * evne, der udvides, skal følges hele vejen ud — også bagud.
 *
 * VALGT FREM FOR ET MIGRERINGSSCRIPT, og det er en bevidst forskel. Et script,
 * der nulstiller `detaljerSyncedAt`, ville være en SKRIVNING I
 * PRODUKTIONSDATA — tør-kørsel, ejerens godkendelse, og hele forløbet igen
 * næste gang et felt kommer til. Et versionsmærke gør sweep'et selvhelende:
 * det henter kampene igen af sig selv, 8 pr. spil pr. kørsel, og tallet går
 * mod nul. Ingen engangshandling, og næste felt koster ét ciffer.
 *
 * BUMP DEN, når `detaljerAf` begynder at skrive noget nyt eller noget andet.
 * Glemmer man det, er straffen mild og synlig: det nye felt mangler på gamle
 * kampe, præcis som nu.
 *
 *   1  halvleg, målscorere, tilskuertal
 *   2  + selvmaal pr. mål
 */
const DETALJE_VERSION = 2;

/**
 * Versionen på et kampdokument, som et TAL man kan sammenligne — eller 0.
 *
 * Kaster ALDRIG. `typeof === 'number'` og ikke `Number(v)`: konverteringen er
 * selv faren, for `Number({toString:null})` kaster, og opslaget sker i en
 * filter-krop uden for try/catch. En skraldeværdi svarer 0 og fejler dermed
 * mod GENHENTNING — den sikre retning, for kampen heler sig selv ved næste
 * kørsel i stedet for at blive sprunget over for evigt.
 *
 * `Number.isFinite` lukker også `Infinity`, som ellers ville gøre en kamp
 * permanent usynlig for enhver fremtidig feltudvidelse, uden at nogen kunne
 * se det på Drift-kortet.
 */
const versionsTal = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Felter, der aldrig må stå i en skrivning herfra — testens modpol. */
const FORBUDTE_FELTER = Object.freeze(['result', 'homeGoals', 'awayGoals', 'kickoff']);

/** Firestore: højst 500 skrivninger pr. batch. Under loftet med luft til PL's 380. */
const BATCH_LOFT = 400;

/** En kørsel, der intet gjorde. Ét sted, så kernen og sweep'et ikke kan drive. */
const TOM_KOERSEL = Object.freeze({
  manglede: 0, valgte: 0, forsoegt: 0, skrevet: 0,
  uenige: 0, uparsede: 0, utilgaengelige: 0, ukendte: 0, afbrudt: false,
});

/**
 * Hvor mange kampe hentes pr. kørsel? Loft på KVOTE, ikke på tid — budgettet
 * nedenfor er tids-vagten.
 *
 * 8 × 2 kald + ét stage-kald = 17 kald pr. spil pr. kørsel, 12 kørsler i
 * døgnet. Efterslæbet ved ibrugtagning er 54 kampe (målt 1/9-2026), altså
 * hentet på under et døgn, og en normal runde på 6-10 kampe nås i den første
 * kørsel efter runden. Efter-facit-vejen (minut-jobbet) lægger samme slags
 * kald oveni, men kun i det minut en kamp får facit: højst 17 pr. spil pr.
 * sådan et minut, og en kamp kan kun få facit én gang — så over en kampdag
 * er det ét kald-sæt pr. spillet kamp, ikke pr. minut.
 */
const DETALJE_LOFT = 8;

/**
 * Wall-clock-budget for ÉN kørsel for ÉT spil.
 *
 * Regnet ud af sweep'ets egne 300 s (index.js: SWEEP_TIMEOUT_S), ikke valgt:
 * xG tager allerede en tredjedel delt på spillene (50 s hver). Detaljerne får
 * en SJETTEDEL — halvdelen af xG's — fordi de to berigelser tilsammen ellers
 * ville lægge beslag på to tredjedele af sweep'et, og en platform-timeout kan
 * ikke fanges af try/catch: så mistede både dette OG det næste spil sin
 * alarm, sin tabel og sit driftlog-kort.
 *
 * Målt latenstid (scripts/maal-livescore-detaljer.mjs, latens-tabellen,
 * 2/9-2026, 54 færdige kampe): stage-kaldet 259 ms; incidents 132 ms median /
 * 731 ms maks; info 128 ms median / 1.240 ms maks. Budgettet binder altså
 * kun, når kilden hænger — og dér er værste tilfælde ÉT kald-sæt over
 * budgettet, fordi tjekket sidder i toppen af løkken.
 */
const DETALJE_BUDGET_MS = 25000;

/**
 * Del af sweep'ets samlede budget, kampdetaljerne må bruge PR. SPIL.
 *
 * Kalderen regner det rigtige tal med denne brøk; konstanten ovenfor er kun
 * gulvet, hvis ingen siger noget. Quality Control og Security fandt begge den
 * samme svaghed: kommentaren PÅSTOD, at 25000 var regnet ud af sweep'ets 300 s
 * ("en sjettedel, delt på to spil"), men tallet stod som en literal. Regnestykket
 * passede i dag og ville stille blive forkert ved et tredje spil — xG's budget
 * divideres med `SYNCED_GAMES.length`, dette gjorde ikke. Nu er brøken kode.
 */
const DETALJE_BUDGET_BROEK = 6;

/**
 * Hvor længe ligger en AFVIST kamp i karantæne?
 *
 * Uden karantænen er en permanent uenig kamp en giftpille: filteret er "har
 * facit OG mangler detaljer", så den hentes igen ved HVER kørsel for evigt —
 * 2 kald × 12 kørsler i døgnet — og den ligger forrest i køen, fordi den er
 * gammel. Seks sådanne kampe ville æde 75 % af loftet permanent.
 *
 * Og uenighed KAN være permanent og legitim: en afbrudt kamp, hvor vores
 * kilde har et tildelt 3-0 og livescore har den afbrudte stilling, retter sig
 * aldrig. En uge er valgt, så en forbigående uenighed (kilden nåede ikke at
 * opdatere) heler af sig selv, mens en permanent koster 2 kald om ugen.
 */
const AFVIST_KARANTAENE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Heltal, eller null.
 *
 * `Number` må IKKE bruges: Number(null), Number('') og Number(' ') er alle 0
 * — altså et gyldigt måltal for "ved ikke". Båndet lukker begge ender.
 *
 * Kilden er inkonsekvent med sig selv: `Tr1`/`Trh1` er STRENGE ("3"), mens
 * `Vsp` er et rigtigt number (60098). Derfor to parsere, ikke én — første
 * udgave af måleharnesset genbrugte den ene og rapporterede 0 af 54 kampe med
 * tilskuertal.
 */
function heltal(v) {
  const s = String(v ?? '').trim();
  return /^\d{1,3}$/.test(s) ? Number(s) : null;
}

/** Tilskuertal. Egen parser — se heltal(). Nul tilskuere findes ikke. */
function tilskuertal(v) {
  if (typeof v === 'number') return Number.isInteger(v) && v > 0 && v < 1000000 ? v : null;
  const s = String(v ?? '').trim();
  if (!/^\d{1,7}$/.test(s)) return null;
  const n = Number(s);
  return n > 0 && n < 1000000 ? n : null;
}

/**
 * Alle hændelser i kampen, fladet ud REKURSIVT.
 *
 * DEN FØRSTE UDGAVE AF DENNE KOMMENTAR VAR FORKERT, og en mutationstest
 * afslørede det: der stod "en flad løkke taber mål", og suiten forblev grøn,
 * da rekursionen blev fjernet. Grunden er, at container-objektet SELV bærer
 * `Sc` og `Nm`, og at `maalAf` læser scorernavnet af `h.Incs` direkte — de
 * indre poster tilføjer altså intet, den ydre ikke allerede har.
 *
 * Målt bagefter (alle 54 færdigspillede kampe, 218 nestede hændelser med en
 * stilling): NUL af dem bærer et andet målnummer end deres forælder.
 * Rekursionen er dermed redundant i dag.
 *
 * Den bliver alligevel — som den sikre retning, ikke som pynt. Nestede en
 * fremtidig kildeform to mål i én container, ville en flad løkke tabe det ene
 * i STILHED, og kæde-tjekket ville så afvise hele kampen frem for at skrive
 * den forkert. Det forsvar er nu bundet af sin egen test (`kampDetaljer.test.js`:
 * "et mål nestet med sit EGET nummer tælles med"), så koden ikke står som en
 * påstand, ingen efterprøver.
 */
function fladeHaendelser(incidents) {
  const ud = [];
  const gaa = (x) => {
    if (Array.isArray(x)) { x.forEach(gaa); return; }
    if (x && typeof x === 'object') {
      ud.push(x);
      if (Array.isArray(x.Incs)) gaa(x.Incs);
    }
  };
  gaa(Object.values(incidents || {}));
  return ud;
}

/**
 * Kampens mål, udledt af stillingen. Se filhovedet for hvorfor ikke af `IT`.
 *
 * @returns {Array<{hold:'home'|'away', nr:number, minut:number,
 *                  scorer:string|null, oplaeg:string|null}>}
 */
/**
 * Hændelseskoden for et selvmål. Se maalAf og scripts/maal-selvmaal.mjs.
 * Egen konstant frem for et tal i en betingelse: tallet optræder to steder
 * (fladt mål og nestet i en container), og to løse 39-taller kan drive fra
 * hinanden.
 */
const SELVMAAL_IT = 39;

function maalAf(incidents) {
  const set = new Map(); // "hold:nr" → målet
  for (const h of fladeHaendelser(incidents)) {
    if (!Array.isArray(h.Sc) || (h.Nm !== 1 && h.Nm !== 2)) continue;
    const nr = heltal(h.Sc[h.Nm - 1]);
    const minut = heltal(h.Min);
    // nr < 1 er den uændrede stilling — dét er et annulleret mål.
    if (nr == null || nr < 1 || minut == null) continue;
    const indre = Array.isArray(h.Incs) ? h.Incs : [];
    const kand = {
      hold: h.Nm === 1 ? 'home' : 'away',
      nr,
      minut,
      // 'home'/'away' og ikke et holdNAVN: et navn i et dokument er en flade,
      // der skal med i visningsnavn-listen og kan tabe sit `vis`-felt uden at
      // en test bliver rød. En SIDE kan kortet selv slå op i sine egne hold.
      scorer: navn(indre.find((x) => x.IT === 36)?.Pn ?? h.Pn),
      oplaeg: navn(indre.find((x) => x.IT === 63)?.Pn),
      // SELVMÅL. `Nm` er det hold, der FIK målet — ikke scorerens eget — så
      // uden dette flag står en Aston Villa-spiller på kortet som "(Brighton)"
      // og læses som Brightons mand. Det er ikke forkert, men det er
      // vildledende, og kilden ved godt bedre.
      //
      // MÅLT, IKKE GÆTTET (scripts/maal-selvmaal.mjs, 1/9-2026, alle 54
      // færdigspillede kampe): kriteriet er, om scoreren står i det MODSATTE
      // holds startopstilling. IT=39 gør det i 5 af 5 opløselige tilfælde;
      // IT 36/37/38 gør det i 0 af 121. Asymmetrien er total.
      //
      // KUN 39, og det er den sikre retning: en ukendt kode bliver et
      // almindeligt mål, aldrig et selvmål. Den modsatte fejl ville hænge en
      // forkert etiket på en rigtig scorer — og dét ser en spiller straks.
      //
      // KUN DEN FLADE FORM. Her stod før også `indre.some((x) => x.IT === 39)`
      // for at fange et selvmål inde i en container. Mutationstesten fjernede
      // det og forblev grøn, og målingen forklarer hvorfor: IT=39 er FLAD i 7
      // af 7 tilfælde, nestet i 0. Det er ikke et tilfælde — container-formen
      // findes for at bære OPLÆGGET, og et selvmål har ikke et oplæg. En
      // unåelig gren er ikke ekstra sikkerhed; den er et sted, en fremtidig
      // læser tror, der er dækning.
      selvmaal: h.IT === SELVMAAL_IT,
    };
    // Containeren OG dens indre IT=36 bærer samme Sc. Behold den med et navn.
    const gl = set.get(`${kand.hold}:${nr}`);
    if (!gl || (gl.scorer == null && kand.scorer != null)) set.set(`${kand.hold}:${nr}`, kand);
  }
  return [...set.values()].sort((a, b) => a.minut - b.minut || a.nr - b.nr);
}

/**
 * Et spillernavn fra kilden, gjort ufarligt.
 *
 * FREMMED FRITEKST på vej ud i fladen. rensTekst fjerner kontroltegn og
 * kontekst-brydende tegn og klipper længden; den fanger også {"toString":null},
 * som er JSON-nåbart og ellers får String() til at kaste.
 *
 * Fald-tilbagen er null og IKKE rensTekst's 'Spiller': et mål uden scorernavn
 * skal vise ingenting, ikke et opdigtet navn. Målt er der ingen af dem (0 af
 * 155), men et felt, der aldrig er tomt i prøven, er ikke et felt, der aldrig
 * kan være tomt.
 */
function navn(raa) {
  if (raa == null) return null;
  const t = rensTekst(raa, { max: 40, fallback: '' });
  return t === '' ? null : t;
}

/** Danner de fundne mål den ubrudte kæde 1..facit for ét hold? */
function kaedeOk(maal, facit) {
  if (!Number.isInteger(facit) || facit < 0) return false;
  if (maal.length !== facit) return false;
  return new Set(maal.map((m) => m.nr)).size === facit
    && maal.every((m) => m.nr >= 1 && m.nr <= facit);
}

/**
 * Oversæt ét kamp-svar til de felter, der må skrives — eller til en afvisning.
 *
 * KRYDSVALIDERINGEN er hele grunden til, at vi tør skrive noget som helst.
 * To uafhængige spørgsmål med hver sin remedie, og derfor med hver sin
 * afvisningsgrund:
 *
 *   'uenig'    deres slutstilling ≠ vores facit. En DATA-hændelse: et
 *              menneske skal kigge på kampen. Kan være permanent og legitim
 *              (afbrudt kamp, tildelt resultat).
 *   'uparset'  vi kunne ikke få deres mål til at danne kæden. VORES parser er
 *              mangelfuld, eller kilden har skiftet form.
 *
 * Ét fælles tal kunne ikke sige hvilken, og de to fører til vidt forskellige
 * handlinger.
 *
 * @param {object} incidents  rå svar fra incidents/soccer/{Eid}
 * @param {object} info       rå svar fra info/soccer/{Eid}
 * @param {{homeGoals:number, awayGoals:number}} facit  VORES tal
 * @returns {{felter:object}|{afvist:'uenig'|'uparset'}}
 */
function detaljerAf(incidents, info, facit) {
  const t1 = heltal(incidents?.Tr1);
  const t2 = heltal(incidents?.Tr2);
  const vh = heltal(facit?.homeGoals);
  const va = heltal(facit?.awayGoals);
  if (t1 == null || t2 == null || vh == null || va == null) return { afvist: 'uenig' };
  if (t1 !== vh || t2 !== va) return { afvist: 'uenig' };

  const maal = maalAf(incidents?.Incs);
  if (!kaedeOk(maal.filter((m) => m.hold === 'home'), t1)
    || !kaedeOk(maal.filter((m) => m.hold === 'away'), t2)) return { afvist: 'uparset' };

  const felter = {};
  // UDELAD frem for at sætte undefined: der er ingen ignoreUndefinedProperties
  // i dette projekt, og ét undefined i en batch KASTER og river hele
  // skrivningen — alle otte kampe — med sig.
  const h1 = heltal(incidents?.Trh1);
  const h2 = heltal(incidents?.Trh2);
  // Halvlegen skal være <= slutstillingen. Et hold kan ikke score baglæns, og
  // et bånd, der ikke tjekker det, ville skrive skrald videre til fladen.
  if (h1 != null && h2 != null && h1 <= t1 && h2 <= t2) {
    felter.halvlegHome = h1;
    felter.halvlegAway = h2;
  }
  // Tilskuertallet MANGLER i 4 af 20 PL-kampe (målt). Udelad — aldrig 0.
  const tilskuere = tilskuertal(info?.Vsp);
  if (tilskuere != null) felter.tilskuere = tilskuere;
  // Tom liste er et gyldigt svar (0-0), og den skal skrives: ellers ser en
  // målløs kamp for evigt ud som "ikke hentet endnu".
  felter.maal = maal.map((m) => {
    const ud = { hold: m.hold, minut: m.minut };
    // BOOLEAN OG IKKE ET UDELADT FELT når den er falsk: `maal` er en liste af
    // ens objekter, og et felt, der kun findes på nogle af dem, tvinger hver
    // læser til at kende forskellen. Prisen er ét felt pr. mål.
    ud.selvmaal = m.selvmaal === true;
    if (m.scorer != null) ud.scorer = m.scorer;
    if (m.oplaeg != null) ud.oplaeg = m.oplaeg;
    return ud;
  });
  return { felter };
}

/**
 * Vores kamp → livescores nøgle.
 *
 * `kickoff` regnes om til livescores `Esd`-form i UTC. `/0`-endpointet er
 * ægte UTC (se livescoreHold.js: offsettet er en tidszone, ikke en version),
 * så sammenligningen skal ske dér og ingen andre steder.
 *
 * @param {{home:string, away:string, kickoff:*}} data  kampdokumentet
 * @param {Map<string,string>} kodeAfNavn  holdnavn → vores kortkode
 */
function noegleAfKamp(data, kodeAfNavn) {
  // Try'et er ikke pynt: `new Date(k)` kaster på et kickoff som
  // {"toString":null}, og firestore.rules type-tjekker ikke feltet. Samme
  // klasse som fundet i hentNoegler — bare på VORES side af hegnet.
  let ms;
  try {
    const k = data?.kickoff;
    ms = k == null ? NaN
      : (typeof k.toMillis === 'function' ? k.toMillis() : new Date(k).getTime());
  } catch { return null; }
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  const to = (n) => String(n).padStart(2, '0');
  const esd = `${d.getUTCFullYear()}${to(d.getUTCMonth() + 1)}${to(d.getUTCDate())}`
    + `${to(d.getUTCHours())}${to(d.getUTCMinutes())}${to(d.getUTCSeconds())}`;
  return kampNoegle(esd, kodeAfNavn.get(data.home), kodeAfNavn.get(data.away));
}

/** Kastes ved 429/403 — kredsløbsafbryderen. Se syncKampDetaljerCore. */
class KildenLukkerOs extends Error {
  constructor(status) {
    super(`livescore svarede ${status} — kørslen afbrudt`);
    this.status = status;
  }
}

async function hentJson(sti, fetchFn) {
  const res = await fetchFn(`${API}/${sti}`, hentOpt());
  // 429/403 er ikke "denne kamp fejlede" — det er kilden, der lukker os ude.
  // Cloud Functions egresser gennem DELT NAT, så bliver vi rate-limited,
  // rammer det nabo-synken (api.superliga.dk, pulselive), som intet har med
  // livescore at gøre. Derfor stopper vi med at banke på, med det samme.
  if (res.status === 429 || res.status === 403) throw new KildenLukkerOs(res.status);
  return res.ok ? res.json() : null;
}

/**
 * Hele sæsonens kampe hos livescore, som nøgle → Eid.
 *
 * HVER POST VALIDERES FOR SIG. Security Reviewer viste med en kørt PoC, at ét
 * event blandt 380 med `Eid: {"toString":null}` fik `String()` til at kaste
 * ud af hele `syncKampDetaljerCore` — og så fik spillet ALDRIG detaljer, i
 * nogen kørsel. Den indre try omkring `detaljerAf` dækkede kun ét kampsvar.
 * Det er husets kendte fælde ("validér pr. POST, ikke pr. felt") i en ny
 * forklædning: den lå her i LISTEN, ikke i kampen.
 */
async function hentNoegler(livescore, fetchFn) {
  const d = await hentJson(`stage/soccer/${livescore.land}/${livescore.liga}/0`, fetchFn);
  const ud = new Map();
  for (const stage of d?.Stages || []) {
    for (const e of stage.Events || []) {
      try {
        const eid = String(e?.Eid ?? '');
        // Eid whitelistes FØR den nogensinde går i en URL.
        if (!/^\d{1,12}$/.test(eid)) continue;
        const n = kampNoegle(e?.Esd, e?.T1?.[0]?.Abr, e?.T2?.[0]?.Abr);
        // Første vinder. En dublet-nøgle er målt til ikke at findes (380 og
        // 132 kampe, nul dubletter), og hvis den opstår, er det sikrere at
        // holde fast i én kamp end at lade den sidste overskrive.
        if (n && !ud.has(n)) ud.set(n, eid);
      } catch {
        // Én uduelig post koster én kamp, ikke hele sæsonen.
        continue;
      }
    }
  }
  return ud;
}

/** Et Eid, vi tør sætte i en URL: cifre, højst tolv. Samme bånd som hentNoegler. */
function gyldigEid(v) {
  return typeof v === 'string' && /^\d{1,12}$/.test(v);
}

/**
 * Kampens livescore-id: det cachede `livescoreEid` først, ellers opslag via
 * nøglen i stage-listen. Ét sted for begge veje, så kernen og kortlægningen
 * ikke kan drive fra hinanden.
 */
function eidForKamp(data, kodeAfNavn, noegler) {
  if (gyldigEid(data?.livescoreEid)) return data.livescoreEid;
  if (!noegler) return null;
  const n = noegleAfKamp(data, kodeAfNavn);
  return n ? (noegler.get(n) || null) : null;
}

/**
 * Kortlæg vores kampe til livescores Eid og gem det på kampdokumentet.
 *
 * Findes, fordi stage-kaldet er det dyreste, vi laver mod en kilde uden
 * aftale: 90 KB for Superligaen, ~260 KB for Premier League. Sweep'et laver
 * det 12 gange i døgnet; efter-facit-vejen og en kommende live-synk (opgave
 * #78) ville ellers lave det op til ~150 gange i døgnet på en kampdag. Med
 * id'et på dokumentet koster et kampopslag to kald — ingen liste.
 *
 * Kortlægger ALLE kampe uden `livescoreEid`, også uspillede: stage-listen
 * bærer Eid for hele sæsonen (målt 2/9-2026, 132 SL-kampe, 0 uden Eid), og
 * et id ændrer sig ikke, fordi kampen bliver spillet. Ét stage-kald pr.
 * kørsel, og listen gives tilbage, så kalderen kan sende den videre til
 * syncKampDetaljerCore i samme kørsel.
 *
 * Skriver KUN `livescoreEid` — gennem samme frosne feltliste som resten.
 * Ingen versionsbump: filteret er "mangler id", ikke `detaljerSyncedAt`.
 *
 * @param {object} opts  gameId, livescore, only ({id,data}[]), fetchFn, noegler?
 * @returns {Promise<{manglede:number, skrevet:number, ukendte:number, noegler:Map|null}>}
 */
async function kortlaegEids(db, FieldValue, opts = {}) {
  const tom = { manglede: 0, skrevet: 0, ukendte: 0, noegler: null };
  const livescore = opts.livescore;
  if (!livescore?.land || !livescore?.liga) return tom;
  const fetchFn = opts.fetchFn || fetch;
  const mangler = (opts.only || []).filter((m) => !gyldigEid(m?.data?.livescoreEid));
  if (!mangler.length) return { ...tom, noegler: opts.noegler instanceof Map ? opts.noegler : null };

  const gameRef = db.collection('games').doc(opts.gameId);
  const gameSnap = await gameRef.get();
  const teams = gameSnap.exists ? gameSnap.data().teams : null;
  if (!Array.isArray(teams) || !teams.length) return { ...tom, manglede: mangler.length };
  const kodeAfNavn = new Map(teams.map((t) => [t.name, t.short]));

  const noegler = opts.noegler instanceof Map ? opts.noegler : await hentNoegler(livescore, fetchFn);
  const ud = { manglede: mangler.length, skrevet: 0, ukendte: 0, noegler };
  if (noegler.size === 0) return ud;

  // Første kørsel efter udrulning skriver HELE sæsonen: 132 kampe for
  // Superligaen, 380 for Premier League. Firestore tager 500 ops pr. batch,
  // og klienten tæller ikke selv efter — serveren afviser, og så var ingen
  // skrevet. Derfor deles der op, før nogen liga når loftet.
  const matchesCol = gameRef.collection('matches');
  let batch = db.batch();
  let iBatch = 0;
  for (const m of mangler) {
    const n = noegleAfKamp(m.data, kodeAfNavn);
    const eid = n ? noegler.get(n) : null;
    if (!eid) { ud.ukendte += 1; continue; }
    // Plukket af den frosne liste — ikke et frit objekt. Skulle et andet felt
    // en dag følge med her, skal det først stå på listen.
    const skriv = {};
    if (SKRIVBARE_FELTER.includes('livescoreEid')) skriv.livescoreEid = eid;
    batch.update(matchesCol.doc(m.id), skriv);
    ud.skrevet += 1;
    iBatch += 1;
    if (iBatch === BATCH_LOFT) {
      await batch.commit();
      batch = db.batch();
      iBatch = 0;
    }
  }
  if (iBatch) await batch.commit();
  return ud;
}

/**
 * Hent og skriv kampdetaljer for FÆRDIGE kampe, der mangler dem.
 *
 * KØRES FRA SWEEP'ET (bagfyldningen) — og fra minut-synken KUN for de kampe,
 * der netop fik facit i samme kørsel, via `efterFacitDetaljer` nedenfor.
 * xG-kontrakten (syncProviders.js) gælder stadig: en fremmed kilde må ikke
 * kunne standse facit-synken. Efter-facit-vejen overholder den ved at være
 * BUNDET (kun de netop afgjorte kampe, typisk 1–3), SJÆLDEN (kun det minut
 * facit lander) og SIDST i kørslen, efter driftlog og puls-vagt, med eget
 * budget — se index.js. Før den fandtes, gik der op til 59 minutter fra
 * facit til målscorere, fordi sweep'et kører 25 minutter over timen. Det er
 * den mest sete tilstand på kortet: folk kigger lige efter slutfløjt
 * (Quality Control-fund på planen for live-mål).
 *
 * Funktionen er OGSÅ bagfyldningen. Der findes ikke et separat script: en
 * kamp fra i august mangler detaljer på præcis samme måde som en fra i aftes.
 * Ingen tør-kørsel er nødvendig, fordi ingen af de skrevne felter kan udløse
 * point, Elo eller Runde-Bot — se forbudslisten i filhovedet.
 *
 * @returns {Promise<{manglede:number, valgte:number, forsoegt:number,
 *                    skrevet:number, uenige:number, uparsede:number,
 *                    ukendte:number, afbrudt:boolean}>}
 *   `manglede` er hele efterslæbet FØR kørslen — det er dét, driftlog-kortet
 *   viser, og det skal gå mod 0. `valgte` er dem, loftet slap igennem: uden
 *   det tal kan sweep'et ikke skelne "ingen kamp kunne kobles" (kortlægningen
 *   er død) fra "efterslæbet er større end loftet" (helt normalt).

 */
async function syncKampDetaljerCore(db, FieldValue, opts = {}) {
  const tom = { ...TOM_KOERSEL };
  const livescore = opts.livescore;
  // Et spil uden livescore-konfiguration har ikke evnen. Ikke en fejl.
  if (!livescore?.land || !livescore?.liga) return tom;

  const gameId = opts.gameId;
  const fetchFn = opts.fetchFn || fetch;
  // TO UR, med vilje. `nu` er, hvor gammelt DATA er (karantænen), og skal
  // kunne injiceres, så en test ikke afhænger af kalenderen. `klokke` er
  // FORLØBET TID under kørslen (budgettet) og må aldrig komme fra samme
  // kilde: gjorde den det, ville en test, der satte `nowMs` til en fast dato,
  // bruge hele budgettet op i første gennemløb — hvilket er nøjagtig, hvad
  // den gjorde, indtil testen afslørede det.
  const nu = Number.isFinite(opts.nowMs) ? opts.nowMs : Date.now();
  const klokke = typeof opts.klokke === 'function' ? opts.klokke : Date.now;

  const alle = opts.only || [];
  // Kampe med facit, som mangler detaljer — og som ikke ligger i karantæne
  // efter en afvisning. Uden karantænen er en permanent uenig kamp en
  // giftpille, der æder loftet ved hver eneste kørsel.
  const mangler = alle.filter((m) => {
    const d = m.data || {};
    if (!d.result) return false;
    // Hentet FØR i en NYERE eller ens udgave? Så er der intet at gøre.
    // Uden versions-leddet var svaret permanent, og et nyt felt kunne aldrig
    // nå en kamp, der allerede var hentet.
    //
    // `versionsTal` og ikke `Number()`: Number({toString:null}) KASTER, og
    // kastet ligger i denne filter-krop uden for al try/catch — så ét forgiftet
    // kampdokument ville dræbe HELE spillets detalje-synk i hver eneste
    // kørsel. Security Reviewer viste det med en kørt PoC: 1 giftig blandt 19
    // sunde gav 0 skrevet. Feltet er admin-skrivbart (firestore.rules har
    // ingen felt-liste på kampe), så vejen dertil er et fejlbehæftet script,
    // ikke en spiller — men det er nøjagtig samme klasse som `Eid`-fælden,
    // filen allerede forsvarer sig mod i hentNoegler.
    if (d.detaljerSyncedAt && versionsTal(d.detaljerVersion) >= DETALJE_VERSION) return false;
    const a = d.detaljerAfvistAt;
    if (!a) return true;
    const ms = typeof a.toMillis === 'function' ? a.toMillis() : new Date(a).getTime();
    // Et ULÆSELIGT afvisnings-tidsstempel skal IKKE give evig karantæne —
    // så ville et skraldefelt gøre kampen usynlig for evigt. Prøv igen.
    if (!Number.isFinite(ms)) return true;
    return nu - ms >= AFVIST_KARANTAENE_MS;
  });
  if (!mangler.length) return tom;

  // Holdnavn → vores kortkode, læst af spillets EGEN holdliste. Serveren har
  // den allerede (games/{id}.teams, seedet af seed-football.mjs), så der
  // kommer ingen ny datakilde ind ad bagdøren.
  const gameRef = db.collection('games').doc(gameId);
  const gameSnap = await gameRef.get();
  const teams = gameSnap.exists ? gameSnap.data().teams : null;
  if (!Array.isArray(teams) || !teams.length) return { ...tom, manglede: mangler.length };
  const kodeAfNavn = new Map(teams.map((t) => [t.name, t.short]));

  const loft = Number.isInteger(opts.loft) && opts.loft > 0 ? opts.loft : DETALJE_LOFT;
  const budgetMs = Number.isFinite(Number(opts.budgetMs)) && Number(opts.budgetMs) > 0
    ? Number(opts.budgetMs) : DETALJE_BUDGET_MS;
  const udloeb = klokke() + budgetMs;
  const valgte = mangler.slice(0, loft);

  const ud = { ...tom, manglede: mangler.length, valgte: valgte.length };
  const batch = db.batch();
  const matchesCol = gameRef.collection('matches');
  // Tælles for sig og ikke udledt af de andre tal: en kørsel, hvor ALLE
  // afvisninger kom af at kilden var nede, lægger intet i batchen, og
  // `commit()` på en tom batch er et unødigt kald. Tælleren er dermed
  // vagten om skrivningen, ikke en sum af tre andre tal, der kan drive.
  let iBatch = 0;
  // Stage-listen (90 KB SL / ~260 KB PL) hentes KUN, når en af de valgte
  // kampe mangler sit cachede `livescoreEid` — og kalderen kan give listen
  // med (sweep'et har den fra kortlaegEids), så den aldrig hentes to gange i
  // samme kørsel. Med cachen fuld koster efter-facit-vejen to kald pr. kamp,
  // intet stage-kald.
  let noegler = opts.noegler instanceof Map ? opts.noegler : null;
  const manglerEid = valgte.some((m) => !gyldigEid(m.data?.livescoreEid));
  try {
    if (manglerEid) {
      if (!noegler) {
        // Budget-tjek FØR stage-kaldet. Det kan koste sine fulde 10 sekunder,
        // og lå det uden for budgettet, var budgettet ikke et loft på kørslen,
        // men på løkken. Security regnede værste tilfælde ud: uden dette tjek
        // er det stage-kald + budget + ét kald-sæt.
        if (klokke() >= udloeb) return ud;
        noegler = await hentNoegler(livescore, fetchFn);
      }
      // Kilden svarede, men uden kampe — OGSÅ når listen kom udefra. Et 5xx
      // på sweep'ets stage-kald giver kortlægningen en tom liste, og gik den
      // igennem her, blev hver kamp uden cachet id "ukendt", og sweep'et
      // fyrede detaljerKobling ("kortlægningen er død") under et helt
      // almindeligt udfald. Tjekket stod før KUN i den gren, der selv
      // hentede listen.
      if (noegler.size === 0) return ud;
    }

    for (const m of valgte) {
      // Budget-tjekket i TOPPEN af løkken. Kernen kan ikke afbryde et await,
      // og en Promise.race ville lade kaldet løbe videre i baggrunden og
      // stadig holde funktionen i live.
      if (klokke() >= udloeb) break;
      const eid = eidForKamp(m.data, kodeAfNavn, noegler);
      if (!eid) { ud.ukendte += 1; continue; }
      ud.forsoegt += 1;
      // De to kald er uafhængige — parallelt. Målt 128 ms median for parret.
      const [incidents, info] = await Promise.all([
        hentJson(`incidents/soccer/${eid}`, fetchFn),
        hentJson(`info/soccer/${eid}`, fetchFn),
      ]);
      // KILDEN SVAREDE IKKE (5xx, netværk) er ikke det samme som "vi kunne
      // ikke parse deres svar", og det er ikke pedanteri: `uparsede` udløser
      // alarmen "kilden har sandsynligvis skiftet form — se kampDetaljer.js".
      // Security Reviewer viste med en kørt PoC, at en HTTP 500 ramte præcis
      // den gren, så en times nedetid hos livescore ville sende ejeren på
      // kodejagt. En alarm, der måler en proxy for symptomet, er husets egen
      // regel om gates i ny forklædning.
      if (!incidents) { ud.utilgaengelige += 1; continue; }

      // Hele posten valideres i ÉT try: {"toString":null} er JSON-nåbart og
      // får String() til at kaste. Én giftig post må ikke vælte partiet.
      let svar;
      try {
        svar = detaljerAf(incidents, info, m.data);
      } catch {
        svar = { afvist: 'uparset' };
      }

      if (svar.afvist) {
        if (svar.afvist === 'uenig') ud.uenige += 1; else ud.uparsede += 1;
        batch.update(matchesCol.doc(m.id), {
          detaljerAfvistAt: FieldValue.serverTimestamp(),
          detaljerAfvistGrund: svar.afvist,
        });
        iBatch += 1;
        continue;
      }
      // update og ikke set(merge): set ville OPRETTE et kampdokument, hvis en
      // nøgle nogensinde pegede forkert. Og felterne plukkes af den frosne
      // liste, så et forbudt felt ikke kan følge med.
      const skriv = {
        detaljerSyncedAt: FieldValue.serverTimestamp(),
        detaljerVersion: DETALJE_VERSION,
      };
      for (const felt of SKRIVBARE_FELTER) {
        if (Object.hasOwn(svar.felter, felt)) skriv[felt] = svar.felter[felt];
      }
      // En tidligere afvisning ryddes, når kampen endelig gik igennem.
      if (m.data.detaljerAfvistAt) {
        skriv.detaljerAfvistAt = FieldValue.delete();
        skriv.detaljerAfvistGrund = FieldValue.delete();
      }
      batch.update(matchesCol.doc(m.id), skriv);
      iBatch += 1;
      ud.skrevet += 1;
    }
  } catch (err) {
    if (!(err instanceof KildenLukkerOs)) throw err;
    // Kredsløbet er brudt. Det, der ALLEREDE ligger i batchen, skrives
    // stadig — de kampe er hentet og validerede, og at kaste dem væk ville
    // gøre en rate-limit til datatab oveni.
    ud.afbrudt = true;
  }
  // Batchen committes, OGSÅ når kredsløbet blev brudt undervejs: de kampe,
  // der allerede er hentet og validerede, er ikke blevet mindre rigtige af,
  // at den næste fik 429. At kaste dem væk ville gøre en rate-limit til
  // datatab oveni.
  if (iBatch > 0) await batch.commit();
  return ud;
}

/**
 * Hvor alvorlig er en kampdetalje-kørsel? ÉN regel, ét sted.
 *
 * LAA FØR INLINE I SWEEP-HANDLEREN i index.js, og dét var fejlen: en
 * `onSchedule`-krop kan ikke unit-testes, saa klassifikationen var udaekket —
 * og den var forkert. `ukendte` (kampe, der ikke kan kobles til kilden) blev
 * ikke naevnt i advarsels-betingelsen, saa en koersel med 33 skrevne og 1
 * ukoblet gav GROENT Drift-kort, mens den manuelle knap for samme taeller
 * sagde roedt. Praecis den situation opstod i produktion.
 *
 * Det er husets "korrekt er ikke komplet": evnen blev udvidet paa knappen og
 * ikke fulgt hele vejen ud i den anden flade, der laeser samme tal.
 *
 * REMEDIERNE, som niveauet skal spejle:
 *   uenige         et menneske skal se paa kampen        → advarsel
 *   uparsede       VORES parsning er mangelfuld          → advarsel
 *   utilgaengelige kilden var nede; retter sig selv      → advarsel
 *   ukendte        koblingen er droevet; retter sig ALDRIG selv → advarsel
 *
 * Alle fire er ADVARSLER, ikke fejl: et roedt kort, der ikke kan lukkes,
 * laerer ejeren at ignorere fladen. De totale udfald (alt afvist / intet
 * koblet) haandteres af egne grene med alarm i index.js.
 *
 * @param {{uenige?:number, uparsede?:number, utilgaengelige?:number, ukendte?:number}} d
 * @returns {'ok'|'advarsel'}
 */
function detaljeNiveau(d) {
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return n(d?.uenige) || n(d?.uparsede) || n(d?.utilgaengelige) || n(d?.ukendte)
    ? 'advarsel' : 'ok';
}

/**
 * Detaljer for de kampe, der NETOP fik facit — kaldt af minut-synken.
 *
 * Genlæser dokumenterne først: listen `venter`, minut-synken arbejder på, er
 * hentet FØR facit blev skrevet, så dens `data` mangler `result`/målene — og
 * det er netop dem, `detaljerAf` krydsvaliderer imod. Én læsning pr. kamp,
 * kun for de 1–3 kampe, der lige er afgjort.
 *
 * Loftet er listen selv (aldrig over `DETALJE_LOFT`): der er intet efterslæb
 * at fordele, kun dét, der lige skete. Alt andet — kredsløbsafbryder,
 * karantæne, forbudsliste, versionsmærke — er `syncKampDetaljerCore`s.
 *
 * @param {object} opts  gameId, livescore, rettede (kamp-id'er), budgetMs,
 *                       fetchFn/nowMs/klokke som i syncKampDetaljerCore
 */
async function efterFacitDetaljer(db, FieldValue, opts = {}) {
  const ids = Array.isArray(opts.rettede) ? opts.rettede.filter(Boolean) : [];
  if (!ids.length || !opts.livescore?.land) return null;
  const col = db.collection('games').doc(opts.gameId).collection('matches');
  const only = [];
  for (const id of ids) {
    const snap = await col.doc(id).get();
    // Ingen egen vagt på "findes ikke": et manglende dokument bliver et tomt
    // objekt, og kernens filter (`!d.result`) sorterer det fra. En `exists`-
    // vagt her var en ækvivalent mutation væk — to vagter for én regel.
    only.push({ id, data: (typeof snap?.data === 'function' && snap.data()) || {} });
  }
  return syncKampDetaljerCore(db, FieldValue, {
    ...opts, only, loft: Math.min(only.length, DETALJE_LOFT),
  });
}

/**
 * Sweep'ets kampdetalje-kørsel: Eid-kortlægning af HELE kamplisten først (ét
 * stage-kald), derefter detaljerne med den samme liste — og ÉN vagt om
 * kredsløbsafbryderen for begge kald.
 *
 * Findes, fordi kortlægningen før lå som et separat kald i index.js' sweep-
 * handler, hvor et 429/403 blev kastet FORBI kernens afbrudt-gren til den
 * generiske fejl-linje: samme kilde, samme rate-limit, samme delte NAT — men
 * ingen detaljerLukket-alarm. To kald mod samme fejlkilde, håndteret
 * forskelligt alt efter hvilket der ramte loftet først, og det nye kald var
 * det, der kørte FØRST. Quality Controls fund. Husets regel er én vagt pr.
 * sikkerhedsregel, og en onSchedule-krop kan ikke unit-testes, så vagten bor
 * her, hvor den kan.
 *
 * Bliver vi lukket ude allerede under kortlægningen, køres kernen IKKE: den
 * ville blot ramme samme loft igen, og aftalen med afbryderen er at stoppe.
 * Fejler kortlægningen af en ANDEN grund, henter kernen listen selv — som
 * før.
 *
 * @returns kernens tal + `eid: {manglede, skrevet, ukendte}` fra kortlægningen
 *          (null, hvis den fejlede)
 */
async function sweepKampDetaljer(db, FieldValue, opts = {}) {
  let noegler = null;
  let eid = null;
  try {
    const k = await kortlaegEids(db, FieldValue, opts);
    noegler = k.noegler;
    eid = { manglede: k.manglede, skrevet: k.skrevet, ukendte: k.ukendte };
  } catch (err) {
    if (err instanceof KildenLukkerOs) return { ...TOM_KOERSEL, afbrudt: true, eid };
    console.warn(`Eid-kortlægning ${opts.gameId} fejlede (kernen henter selv):`, err?.message || err);
  }
  const d = await syncKampDetaljerCore(db, FieldValue, { ...opts, noegler });
  return { ...d, eid };
}

module.exports = {
  detaljeNiveau,
  efterFacitDetaljer,
  kortlaegEids, gyldigEid, navn, sweepKampDetaljer,
  SELVMAAL_IT,
  DETALJE_VERSION,
  syncKampDetaljerCore,
  DETALJE_BUDGET_BROEK,
  detaljerAf, maalAf, kaedeOk, noegleAfKamp, heltal, tilskuertal, fladeHaendelser,
  hentNoegler, KildenLukkerOs,
  SKRIVBARE_FELTER, FORBUDTE_FELTER,
  DETALJE_LOFT, DETALJE_BUDGET_MS, AFVIST_KARANTAENE_MS, API,
};
