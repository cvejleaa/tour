// ---------------------------------------------------------------------------
// Beslutningerne bag seed-football — uden Firebase, så de kan testes.
//
// Scriptet selv læser filer og skriver i databasen. Det, der kan gå galt, er
// ikke skrivningen men VALGET af hvad der skal skrives: én kamp for meget, og
// et sæt frosne odds bliver overskrevet under en spiller, der allerede har
// tippet og fået point.
// ---------------------------------------------------------------------------

// Endelsen SKAL med: modulet importeres af scripts/seed-football.mjs under bar
// Node, hvor der ikke er nogen bundler til at gætte den. Uden .js virker det i
// vitest og fejler først, når scriptet køres i en udrulning.
import { matchId } from './superligaSeed.js';

/**
 * Dokument-id'et for en kamp — SAMME regel som `buildMatch` bruger, når den
 * skriver dokumentet: `fx.id` hvis den har et, ellers runde+hold.
 *
 * Det er ikke en bekvemmelighed, men den eneste måde at genfinde kampen på.
 * Premier League-programmet har id'er fra pulselive; Superligaens
 * `superliga-fixtures.json` har INGEN. Slog vi kun op på `fx.id`, ville hvert
 * eneste opslag for Superligaen ramme `undefined` — og så ville både
 * odds-beskyttelsen i `seedPlan` og "findes den i forvejen"-tjekket i
 * `kickoffPlan` stå og se rigtige ud uden at beskytte en eneste kamp.
 */
export function docId(fx) {
  // String() er ikke pynt: `eksisterende`-map'et har STRENG-nøgler (Firestores
  // dokument-id'er). En kilde med tal-id'er ville ellers give et opslag, der
  // aldrig rammer — og en kamp, der ser ubeskyttet ny ud, i tavshed.
  if (fx?.id) return String(fx.id);
  if (fx?.round == null || !fx?.home || !fx?.away) {
    throw new Error('kampen mangler både id og runde+hold — den kan ikke genfindes');
  }
  return matchId(fx);
}

/**
 * Kickoff som millisekunder — eller null, hvis kampen ingen tid har.
 *
 * To ting afvises højlydt, fordi kickoff ER tip-deadlinen:
 *
 *  - En streng, der ikke kan læses som en dato, giver `NaN`. NaN er hverken
 *    lig null eller sig selv, så kampen ville blive skrevet med en ugyldig tid
 *    OG rapporteret som "ændret" ved hver eneste kørsel herefter.
 *  - En streng UDEN tidszone læses i maskinens egen zone. Den samme fil ville
 *    give 12:00Z på en dansk laptop og 14:00Z i CI — altså to forskellige
 *    deadlines afhængigt af hvor scriptet blev kørt.
 *
 * Kampprogrammet gensynkroniseres løbende fra API'et, så et formatskift i
 * kilden er præcis den fejl, der rammer her.
 */
export function kickoffMs(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date || typeof v === 'number') {
    const t = new Date(v).getTime();
    if (Number.isNaN(t)) throw new Error(`kickoff kunne ikke læses som en dato: ${String(v)}`);
    return t;
  }
  const s = String(v).trim();
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(s)) {
    throw new Error(`kickoff mangler tidszone: "${s}" — ellers afhænger deadlinen af, hvor scriptet køres`);
  }
  const t = new Date(s).getTime();
  if (Number.isNaN(t)) throw new Error(`kickoff kunne ikke læses som en dato: "${s}"`);
  return t;
}

/**
 * To rækker med samme dokument-id ville give to skrivninger på det samme
 * dokument — sidste vinder, uden et ord. Filen genskrives fra API'et, så den
 * dublet er ikke utænkelig.
 */
export function tjekDubletter(fixtures) {
  const set = new Set();
  const dub = new Set();
  for (const fx of fixtures || []) {
    const id = docId(fx);
    if (set.has(id)) dub.add(id);
    set.add(id);
  }
  if (dub.size) throw new Error(`kampprogrammet har dubletter: ${[...dub].sort().join(', ')}`);
}

/**
 * Argumenterne fra kommandolinjen.
 *
 * DEN VIGTIGE DEL ER HVIDLISTEN. Uden den sluges et ukendt flag i tavshed, og
 * de to måder at stave galt på fejler i hver sin retning:
 *
 *   --skriv → --skrive        harmløst: der tørkøres, og man opdager det straks
 *   --kickoffs-only → --kickoff-only   FARLIGT: flaget forsvinder, og fordi
 *     --teams står med i den dokumenterede kommando, passerer argument-tjekket
 *     — så kører der et FULDT SEED med skrivning, hvor der skulle have været
 *     rettet et tidspunkt.
 *
 * Samme klasse: `--rounds 1-18` i stedet for `--runder` ville seede alle 38
 * runder ind i efterårsspillet. Derfor er et ukendt navn en fejl, ikke en
 * ignoreret detalje.
 */
export const KENDTE_ARGS = ['game', 'teams', 'fixtures', 'runder'];
export const KENDTE_FLAG = ['kickoffs-only', 'teams-only', 'skriv'];

export function parseArgs(argv) {
  const out = { flags: new Set() };
  const liste = argv || [];
  for (let i = 0; i < liste.length; i += 1) {
    const a = liste[i];
    if (!String(a).startsWith('--')) throw new Error(`forstod ikke "${a}" — argumenter skal starte med --`);
    const key = String(a).slice(2);
    const next = liste[i + 1];
    const harVaerdi = next !== undefined && !String(next).startsWith('--');

    if (KENDTE_ARGS.includes(key)) {
      // `--runder` til sidst uden værdi må ikke stille og roligt blive til et
      // flag — så ville alle runder komme med, og det er ikke det, der blev bedt om.
      if (!harVaerdi) throw new Error(`--${key} mangler en værdi`);
      out[key] = next;
      i += 1;
    } else if (KENDTE_FLAG.includes(key)) {
      if (harVaerdi) throw new Error(`--${key} tager ikke en værdi (fik "${next}")`);
      out.flags.add(key);
    } else {
      throw new Error(`ukendt argument --${key}. Kendte: ${[...KENDTE_ARGS, ...KENDTE_FLAG].map((k) => `--${k}`).join(', ')}`);
    }
  }
  return out;
}

/**
 * "1-18" → { fra: 1, til: 18 }. Tom/udeladt → null (alle runder).
 * @throws hvis formen er forkert, eller intervallet vender bagvendt.
 */
export function parseRunder(spec) {
  if (spec == null || spec === '') return null;
  const m = /^(\d+)\s*-\s*(\d+)$/.exec(String(spec).trim());
  if (!m) throw new Error(`--runder skal være fx "1-18", ikke "${spec}"`);
  const fra = Number(m[1]);
  const til = Number(m[2]);
  if (fra > til) throw new Error(`--runder: ${fra} er større end ${til}`);
  return { fra, til };
}

/** Kampe i et runde-interval. Uden interval: alle. */
export function iInterval(fixtures, interval) {
  if (!interval) return [...(fixtures || [])];
  return (fixtures || []).filter((f) => f.round >= interval.fra && f.round <= interval.til);
}

/**
 * Hvilke kickoff-tider skal ændres?
 *
 * Tre ting springes over, og hver af dem er der en grund til:
 *  - kampen findes ikke i databasen → den skal seedes, ikke tid-rettes
 *  - kampen har et RESULTAT → tidspunktet er historie, ikke en deadline
 *  - tidspunktet er uændret → spar skrivningen
 *
 * Bemærk `if (nu.result)`: en TOM streng tæller som "intet facit endnu", ikke
 * som spillet. Det er samme konvention som `superligaSync.js` bruger fire
 * steder, og en ryddet kamp skal kunne få rettet sit tidspunkt igen.
 *
 * @param {Array<{id:string, kickoff:string}>} fixtures
 * @param {Map<string, {result?:*, kickoffMs?:number|null}>} nuvaerende
 * @returns {{aendringer: Array<{id:string, fraMs:number|null, tilMs:number|null}>, sprunget:number}}
 */
export function kickoffPlan(fixtures, nuvaerende) {
  const aendringer = [];
  // De to grunde til at springe over tælles HVER FOR SIG. "Findes ikke" aftenen
  // før en runde betyder, at kampen aldrig blev seedet — det er en alarm, og
  // den må ikke gemme sig i samme tal som de færdigspillede.
  const mangler = [];
  let spillet = 0;
  for (const fx of fixtures || []) {
    const id = docId(fx);
    const nu = nuvaerende?.get?.(id);
    if (!nu) { mangler.push(id); continue; }
    if (nu.result) { spillet += 1; continue; }
    const tilMs = kickoffMs(fx.kickoff);
    const fraMs = nu.kickoffMs ?? null;
    if (tilMs === fraMs) continue;
    // At RYDDE en tid, der står, er ikke en tidsrettelse — det er tre ting på
    // én gang, og ingen af dem er synlige: firestore.rules sammenligner
    // request.time mod null og afviser hvert tip, `isLocked` returnerer false
    // så knapperne står åbne alligevel, og påmindelsen springer kampen over.
    // Loggen ville kun sige "→ —". En udsat kamp uden ny dato skal håndteres
    // bevidst, ikke som en bivirkning af en rutinekørsel.
    if (tilMs == null && fraMs != null) {
      throw new Error(`${id}: kampprogrammet har ingen tid, men kampen har en. Ryd den bevidst — ikke via en rutinekørsel.`);
    }
    aendringer.push({ id, fraMs, tilMs });
  }
  return { aendringer, mangler, spillet, sprunget: mangler.length + spillet };
}

/**
 * Hvilke kampe skal seedes?
 *
 * En kamp, der ALLEREDE har odds, springes over — og begrundelsen er vigtigere
 * end reglen. Odds friskes op efter hvert resultat helt frem til kickoff og
 * låses dér; det er `recomputeSeasonElo`, der ejer dem fra seedet og frem.
 * Et gen-seed ville skrive dem tilbage til Elo, som den så ud den dag,
 * programmet blev lagt ind — altså rulle sæsonens egen læring tilbage, og på
 * en spillet kamp ændre den pris, folk allerede har fået point efter.
 *
 * Det var fælden i det gamle script: det skrev odds ubetinget med merge.
 *
 * @param {Array<{id:string}>} fixtures
 * @param {Map<string, {odds?:object}>} nuvaerende
 * @returns {{skriv: Array<object>, springOver: Array<string>}}
 */
export function seedPlan(fixtures, nuvaerende) {
  const skriv = [];
  const springOver = [];
  for (const fx of fixtures || []) {
    const id = docId(fx);
    if (nuvaerende?.get?.(id)?.odds) springOver.push(id);
    else skriv.push(fx);
  }
  return { skriv, springOver };
}

/**
 * Hold, hvis navn ikke findes i holdlisten. Dem giver `teamElo` tavst 1500,
 * så hele klubben ville få odds som et midterhold uden en eneste fejlbesked.
 * @returns {string[]} navne, sorteret og uden dubletter
 */
export function ukendteHold(fixtures, teams) {
  const kendte = new Set((teams || []).map((t) => t?.name));
  const ukendte = new Set();
  for (const f of fixtures || []) {
    if (f?.home && !kendte.has(f.home)) ukendte.add(f.home);
    if (f?.away && !kendte.has(f.away)) ukendte.add(f.away);
  }
  return [...ukendte].sort();
}

/**
 * Hvad ville en holdliste-opdatering ÆNDRE?
 *
 * HVORFOR DEN FINDES. `games/{id}.teams` skrives i dag kun af `fuldtSeed`, som
 * i samme åndedrag skriver `eloCurrent` og alle kampe uden frosne odds. Derfor
 * er der ingen vej til at rette en trøjefarve midt i en sæson — og en manglende
 * farve er ikke en skønhedsfejl: `badgeFor` falder tilbage
 * `thirdColor || awayColor || color`, så mangler tredjefarven, bliver tredje
 * lig med ude, og `matchBadges` sammenligner en værdi med sig selv. Udetrøjen
 * bliver stående, uanset hvor meget den clasher.
 *
 * DEN SAMMENLIGNER I DYBDEN. `troejer` er et nested felt (sekundærfarve,
 * mønster, ærme), og en flad sammenligning ville melde "uændret" om et hold,
 * der havde skiftet fra striber til skråbånd.
 *
 * DE FORSVUNDNE ER DET FARLIGE TAL. `teams` er et ARRAY, og en skrivning
 * erstatter det helt — også med `{ merge: true }`. Et hold, der står i
 * produktionen men ikke i filen, forsvinder altså sporløst, og hver kamp med
 * det hold mister både farve, kortkode og stadion. Derfor tælles de for sig og
 * ikke som "en ændring" blandt de andre.
 *
 * `elo` OG ANTALLET AF HOLD BÆRER POINT. Her stod først, at `elo` er
 * "Start"-kolonnen i Elo-tabellen. Det er sandt og alt for lille:
 *
 *   - `teams[].elo` er SEED for hele den levende Elo. `recomputeSeasonElo`
 *     bygger sin startrating af feltet (`gameScoring.js:102`) og skriver
 *     derfra både `eloHistory`, `eloCurrent` OG nye odds på hver ulåst kamp.
 *     Ændres ét tal, sker der ingenting i sekundet — og så omskriver næste
 *     facit sæsonens historik og prisen på alle resterende kampe.
 *   - `teams.length` afgør pulje-afregningen: antal hold → kampe pr. runde →
 *     `expectedPlayed` → om den officielle tabel overhovedet godtages
 *     (`gameScoring.js:422-425`).
 *
 * Derfor er de to ikke bare linjer i en liste — `teamsVagt` nedenfor afviser
 * dem hårdt. En udskrift, man kan overse, er ikke en vagt.
 *
 * `eloCurrent` er derimod det UFARLIGE felt: der findes ingen læser af det i
 * hele repoet, kun skrivere. Elo-tabellen bygger på `teams[].elo` +
 * `eloHistory`. Den advarsel, der lå lige for, pegede altså på det felt, der
 * ikke gør noget.
 *
 * @param {Array<object>} nye         holdlisten fra filen
 * @param {Array<object>} nuvaerende  games/{id}.teams som den står nu
 * @returns {{aendringer: Array<{name:string, felt:string, fra:*, til:*}>,
 *           tilfoejede: string[], forsvundne: string[], uaendrede: number,
 *           omrokeret: boolean, dubletter: string[]}}
 */
export function teamsPlan(nye, nuvaerende) {
  const foer = new Map((nuvaerende || []).map((t) => [t?.name, t]));
  const aendringer = [];
  const tilfoejede = [];
  let uaendrede = 0;

  for (const t of nye || []) {
    const gammel = foer.get(t?.name);
    if (!gammel) { tilfoejede.push(t?.name); continue; }
    // Feltnavnene tages fra BEGGE sider. Kun fra den nye ville et felt, der er
    // fjernet fra filen, se ud som om det aldrig havde været der — og det er
    // netop en fjernet farve, der giver den tavse fallback ovenfor.
    const felter = [...new Set([...Object.keys(gammel), ...Object.keys(t || {})])].sort();
    let rørt = false;
    for (const f of felter) {
      if (f === 'name') continue;
      if (ensVaerdi(gammel[f], t[f])) continue;
      aendringer.push({ name: t.name, felt: f, fra: gammel[f], til: t[f] });
      rørt = true;
    }
    if (!rørt) uaendrede += 1;
  }

  const iFilen = new Set((nye || []).map((t) => t?.name));
  const forsvundne = [...foer.keys()].filter((n) => !iFilen.has(n)).sort();

  // DUBLETTER i filen. Både `foer` og `iFilen` er opslag på NAVN, så to rækker
  // med samme navn ser ud som ét hold: hverken `tilfoejede` eller `forsvundne`
  // fanger dem. Listen ville alligevel blive skrevet én række længere — og
  // `teams.length` bærer pulje-afregningen. Samme klasse fejl som
  // `tjekDubletter` findes for i kampprogrammet.
  const set = new Set();
  const dubletter = [...new Set(
    (nye || []).map((t) => t?.name).filter((n) => (set.has(n) ? true : (set.add(n), false))),
  )].sort();

  // RÆKKEFØLGEN er brugersynlig og kan ikke ses i en navne-diff. `PuljeTip`
  // tegner pulje-gitteret med `teams.map` i ARRAY-orden (alle andre flader
  // sorterer selv), så en omrokering flytter holdknapperne for alle — uden at
  // et eneste felt har ændret sig. Sammenlignes kun på fælles hold: er der
  // kommet nogen til eller er nogen faldet fra, er rækkefølgen trivielt en
  // anden, og det er de tal, der skal fortælle det.
  const faelles = (l) => (l || []).map((t) => t?.name).filter((n) => foer.has(n) && iFilen.has(n));
  const foerOrden = faelles(nuvaerende);
  const efterOrden = faelles(nye);
  // Længde-leddet er IKKE overflødigt: `faelles` filtrerer på navn, så to
  // rækker med samme navn i den ene liste gør længderne ulige. Uden leddet
  // ville `some` sammenligne forskudte lister og melde en omrokering, der
  // ikke findes — oven i den dublet, vagten allerede afviser.
  const omrokeret = foerOrden.length === efterOrden.length
    && foerOrden.some((n, i) => n !== efterOrden[i]);

  return {
    aendringer, tilfoejede, forsvundne, uaendrede, omrokeret, dubletter,
  };
}

/**
 * MÅ planen skrives?
 *
 * Skrivningen er ikke kosmetisk, uanset at anledningen er en trøjefarve.
 * To felter på `teams` bærer point, og begge kan flytte sig uden at nogen
 * ser det i sekundet:
 *
 *   - `elo` — seed for `recomputeSeasonElo` (`gameScoring.js:102`). Ændres
 *     tallet, omskriver næste facit sæsonens Elo-historik OG prisen på hver
 *     ulåst kamp.
 *   - antallet af hold — `teams.length` afgør, om den officielle tabel
 *     godtages ved pulje-afregningen (`gameScoring.js:422-425`).
 *
 * Derfor er de en HÅRD AFVISNING og ikke en linje i en logbog. En udskrift,
 * operatøren kan overse, er ikke en vagt — og her ville prisen være point,
 * der flytter sig uger senere, hvor ingen længere forbinder de to ting.
 *
 * Vagten ligger ÉT sted, så en mutation af den bliver rød: scriptet spørger
 * her og skriver ikke selv reglen af.
 *
 * @param {ReturnType<typeof teamsPlan>} plan
 * @returns {{ok:boolean, grunde:string[]}} grunde er færdige danske sætninger
 */
export function teamsVagt(plan) {
  const grunde = [];
  const eloRørt = (plan?.aendringer || []).filter((a) => a.felt === 'elo');
  if (eloRørt.length) {
    const liste = eloRørt.map((a) => `${a.name} ${a.fra} → ${a.til}`).join(', ');
    grunde.push(
      `${eloRørt.length} hold får ændret elo (${liste}). Feltet er seed for den `
      + 'levende Elo: næste facit ville omskrive sæsonens Elo-historik og prisen '
      + 'på hver ulåst kamp. Skal Elo ændres, hører det til et fuldt seed.',
    );
  }
  if (plan?.tilfoejede?.length) {
    grunde.push(
      `${plan.tilfoejede.length} hold kommer til (${plan.tilfoejede.join(', ')}). `
      + 'Antallet af hold afgør, om den officielle tabel godtages ved '
      + 'pulje-afregningen. Skal holdlisten vokse, hører det til et fuldt seed.',
    );
  }
  if (plan?.dubletter?.length) {
    grunde.push(
      `${plan.dubletter.length} holdnavn står to gange i filen (${plan.dubletter.join(', ')}). `
      + 'Listen ville blive skrevet længere, end der er hold — og antallet bærer '
      + 'pulje-afregningen.',
    );
  }
  if (plan?.forsvundne?.length) {
    grunde.push(
      `${plan.forsvundne.length} hold forsvinder (${plan.forsvundne.join(', ')}). `
      + '`teams` er et array og erstattes helt — holdene ville miste farve, '
      + 'kortkode og stadion, og antallet bærer pulje-afregningen.',
    );
  }
  return { ok: grunde.length === 0, grunde };
}

/**
 * Er to feltværdier ens? Sammenligner nested objekter i dybden.
 *
 * `undefined` og et fravær er det samme — Firestore gemmer ikke et felt, der
 * ikke findes, så et hold uden `troejer` kommer tilbage uden nøglen, mens
 * filen kan have skrevet `troejer: undefined`. Uden den regel ville hver
 * eneste kørsel melde en ændring, der ikke findes.
 */
function ensVaerdi(a, b) {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  const ka = Object.keys(a).filter((k) => a[k] !== undefined).sort();
  const kb = Object.keys(b).filter((k) => b[k] !== undefined).sort();
  if (ka.length !== kb.length || ka.some((k, i) => k !== kb[i])) return false;
  return ka.every((k) => ensVaerdi(a[k], b[k]));
}
