/**
 * Rene hjælpere til fodbold-spil: grupper kampe i runder og find den runde,
 * spilleren skal se/tip'e nu. Ingen Firebase-afhængigheder (testbar).
 */
import { ugeNoegle, rundensUge } from '../../../lib/pointOpdeling.js';

/** Millisekunder fra et Firestore-Timestamp | Date | tal | ISO-streng. */
export function toMillis(t) {
  if (t == null) return null;
  if (typeof t === 'number') return t;
  if (typeof t === 'string') { const n = Date.parse(t); return Number.isNaN(n) ? null : n; }
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (t.seconds != null) return t.seconds * 1000;
  if (t instanceof Date) return t.getTime();
  return null;
}

// `afterStart(matches, startMs)` STOD HER. Den skjulte kampe med kickoff før
// spillets startdato — og kunne dermed skjule fire kampe i en runde og vise de
// to sidste, hvis runden lå spredt. Visningen og pointgivningen havde hver sin
// kopi af den regel; nu har de den samme, og den tæller runder.
// Se `fraStartRunde` i src/lib/startGate.js.

/**
 * Grupper kampe i runder. Kampe uden runde-nummer samles i runde 0.
 * @param {Array<object>} matches
 * @returns {Array<{round:number, matches:Array<object>}>} sorteret efter runde
 */
export function groupByRound(matches) {
  const byRound = new Map();
  for (const m of matches || []) {
    const r = Number.isFinite(m.round) ? m.round : 0;
    if (!byRound.has(r)) byRound.set(r, []);
    byRound.get(r).push(m);
  }
  return [...byRound.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([round, ms]) => ({
      round,
      matches: ms.slice().sort((a, b) => (toMillis(a.kickoff) ?? 0) - (toMillis(b.kickoff) ?? 0)),
    }));
}

/**
 * Hvor længe en kamp uden facit må regnes for "i gang". Kilden kan være
 * flere minutter om at levere slutresultatet, og en kamp kan i sjældne
 * tilfælde aldrig få et. Uden en øvre grænse ville ÉN manglende facit binde
 * tip-fladen til en gammel runde for evigt.
 *
 * SKAL VÆRE STØRRE END `WINDOW_MS` i functions-platform/superligaSync.js
 * (2,5 t), som er, hvor længe serveren stadig LEDER efter facit. Slap fladen
 * videre først, ville runden flytte sig, mens resultatet endnu kunne komme —
 * og så igen bagefter. I hullet mellem de to fanger `strandedMatches` kampen
 * og alarmerer, altså FØR brugeren slippes videre. Hæves WINDOW_MS, skal
 * dette tal med.
 */
export const RUNDE_SLIP_MS = 3 * 60 * 60 * 1000;

/** Har kampen fået sit facit? '' tæller IKKE — samme fælde som i matchScore. */
const erAfgjort = (m) => m?.result != null && m.result !== '';

/** Spilles kampen lige nu? Begyndt, uden facit, og ikke sluppet endnu. */
function spillesNu(m, nowMs) {
  const k = toMillis(m?.kickoff);
  if (k == null || k > nowMs) return false;
  if (erAfgjort(m)) return false;
  return nowMs - k < RUNDE_SLIP_MS;
}

/**
 * Vælg den "aktive" runde ud fra tidspunktet nu. Tre spørgsmål i rækkefølge:
 *
 *  1. Er der en kamp I GANG? Så er det dén runde. Før valgte fladen på
 *     KICKOFF alene, og i samme sekund som rundens sidste kamp fløjtede i
 *     gang, var runden "helt låst" og fladen sprang videre — man sad og så
 *     kampen, trykkede opdatér, og var pludselig i næste runde. Kampen, man
 *     kiggede på, var væk fra skærmen.
 *
 *  2. Ellers: hvor ligger den NÆSTE kamp? Ikke "den tidligste runde med en
 *     kamp, der mangler". Runde 3 i 2026/27 har en udskudt kamp den 3.
 *     september, mens runde 4, 5 og 6 spilles i august — med det gamle valg
 *     stod tip-fladen på runde 3 fra 10. august til 3. september, og ingen
 *     blev ført til de tre runder, de faktisk kunne tippe i.
 *
 *  3. Ellers: den tidligste runde, der stadig mangler et facit — fx en kamp
 *     uden kickoff, som ingen dato kan udpege. En sådan kamp må gerne kunne
 *     findes, men den må ikke binde fladen, mens der er kampe med en dato.
 *
 * Falder alt igennem, er sæsonen slut, og vi viser den sidste runde.
 *
 * @param {Array<{round:number, matches:Array<object>}>} rounds
 * @param {number} nowMs
 * @returns {number|null} runde-nummeret, eller null hvis ingen runder
 */
export function activeRound(rounds, nowMs) {
  if (!rounds || rounds.length === 0) return null;

  const iGang = rounds.find(({ matches }) => matches.some((m) => spillesNu(m, nowMs)));
  if (iGang) return iGang.round;

  // EFTERSLÆBERE TRÆKKER IKKE LANDINGEN BAGUD. To udsatte runde-2-kampe, der
  // spilles onsdag og torsdag, havde ellers det tidligste fremtidige kickoff —
  // og så åbnede tip-fanen på runde 2, mens runden, alle var ved at tippe, var
  // runde 7. Brugerne troede, spillet var gået i stå.
  //
  // De er stadig SYNLIGE: fladen viser dem på den runde, hvis uge de spilles
  // i (se `efterslaebere`). Det er kun spørgsmålet "hvilken runde er den
  // næste", de holdes ude af — for dét spørgsmål handler om, hvor spillet er
  // nået til, ikke om hvornår den næste bold trilles.
  //
  // Bemærk at `spillesNu` ovenfor er UÆNDRET: en kamp, der spilles LIGE NU,
  // er værd at lande på, uanset hvilken runde den hører til.
  const efterslaeb = new Set(efterslaebere(rounds).map((e) => e.match));

  let naeste = null;
  for (const { round, matches } of rounds) {
    for (const m of matches) {
      if (efterslaeb.has(m)) continue;
      const k = toMillis(m.kickoff);
      // Uden kickoff kan kampen ikke være "den næste" — den har ingen dato at
      // sammenligne på. Den fanges af spørgsmål 3 nedenfor.
      if (k == null || k <= nowMs) continue;
      if (naeste == null || k < naeste.k) naeste = { k, round };
    }
  }
  if (naeste) return naeste.round;

  // Faldt ALT ud som efterslæb (fx en runde, der er skudt helt til hjørne),
  // så er svaret ikke "ingenting". Prøv igen uden filteret, så fladen aldrig
  // ender med at pege på ingen runde, fordi vagten var for grådig.
  for (const { round, matches } of rounds) {
    for (const m of matches) {
      const k = toMillis(m.kickoff);
      if (k == null || k <= nowMs) continue;
      if (naeste == null || k < naeste.k) naeste = { k, round };
    }
  }
  if (naeste) return naeste.round;

  const mangler = rounds.find(({ matches }) => matches.some((m) => !erAfgjort(m)));
  if (mangler) return mangler.round;

  return rounds[rounds.length - 1].round;
}

/** Er kampens deadline (kickoff) passeret? */
export function isLocked(match, nowMs) {
  const k = toMillis(match?.kickoff);
  return k != null && k <= nowMs;
}

/**
 * Slutresultatet på en kamp, eller null hvis det ikke er kendt.
 *
 * Målene skrives af resultat-synken sammen med facit (superligaSync.js), men
 * har aldrig været VIST nogen steder — kampkortet har haft en hardkodet streg,
 * hvor scoren skulle stå.
 *
 * Number.isFinite og ikke en sandhedstest: 0 er falsy, så `m.homeGoals && …`
 * ville skjule hver eneste målløse kamp. Tomme strenge tælles heller ikke som
 * mål — Number('') er 0.
 *
 * @param {{homeGoals?:*, awayGoals?:*}} match
 * @returns {{home:number, away:number}|null}
 */
export function matchScore(match) {
  const tal = (g) => (g == null || g === '' ? NaN : Number(g));
  const home = tal(match?.homeGoals);
  const away = tal(match?.awayGoals);
  return Number.isFinite(home) && Number.isFinite(away) ? { home, away } : null;
}

/** Hvor længe en levende stilling må stå uden en puls, før vi kalder den
 *  forældet. Fem mistede minut-kørsler — rundhåndet, fordi brugerens ur kan
 *  gå skævt af serverens. */
export const LIVE_STALE_MS = 5 * 60 * 1000;

/** Dansk tekst for halvlegen. Serveren har allerede oversat til et lukket sæt;
 *  'ukendt' giver ingen tekst, så kortet bare siger "direkte". */
const HALVLEG = {
  foerste: '1. halvleg',
  pause: 'Pause',
  anden: '2. halvleg',
  forlaenget: 'Forlænget spilletid',
  straffe: 'Straffespark',
  afbrudt: 'Afbrudt',
};

/**
 * Den LEVENDE stilling på en kamp, eller null.
 *
 * Facit slår altid live: har kampen et resultat, er den slut, uanset hvad der
 * måtte ligge tilbage i live-feltet.
 *
 * `friskAt` er spillets puls (game.liveHeartbeatAt) — tidspunktet hvor synken
 * sidst kiggede. Den bruges frem for live.at, fordi live.at kun flytter sig,
 * når stillingen ÆNDRER sig: et 0-0 i 40 minutter ville ellers se dødt ud.
 *
 * @param {object} match
 * @param {number|null} friskAt
 * @param {number} nowMs
 * @returns {{home:number, away:number, halvleg:string|null, afbrudt:boolean,
 *            forældet:boolean, setAt:number|null}|null}
 */
export function liveScore(match, friskAt, nowMs) {
  if (match?.result != null && match.result !== '') return null;
  // Forsvar i dybden: en stilling hører aldrig til på et kort, der stadig
  // tager imod tips. Skrivestien sikrer det allerede (live skrives kun på
  // kampe, hvis kickoff er passeret), men så ville et dokument, der bliver
  // forkert på anden vis, kunne vise stillingen for et åbent tip.
  if (!isLocked(match, nowMs)) return null;
  const l = match?.live;
  if (!l || !Number.isFinite(Number(l.home)) || !Number.isFinite(Number(l.away))) return null;
  // Number(null) er 0, ikke NaN — uden vagten ville en manglende puls læses
  // som 1970 og gøre enhver levende stilling "forældet". Samme fælde som
  // Number('') i matchScore ovenfor.
  const tid = (v) => (v == null || v === '' ? NaN : Number(v));
  const puls = Number.isFinite(tid(friskAt)) ? tid(friskAt) : tid(l.at);
  return {
    home: Number(l.home),
    away: Number(l.away),
    halvleg: HALVLEG[l.status] || null,
    afbrudt: l.status === 'afbrudt',
    // Kampen er fløjtet af, men facit er ikke nået frem endnu. Serveren sætter
    // 'slut' i stedet for at slette stillingen, netop for at holde det løfte,
    // der står længere nede: vi sletter aldrig tallet, vi dæmper det.
    //
    // 'slut' står MED VILJE ikke i HALVLEG. Fandtes den dér, ville et kort med
    // ukendt status falde tilbage til "DIREKTE" — og en kamp, der var slut,
    // ville igen se levende ud. Kortet skal spørge på `sluttet`, ikke gætte ud
    // fra halvlegen.
    sluttet: l.status === 'slut',
    // Forældet, ikke forsvundet: et tal med et ærligt forbehold er mere værd
    // end en streg. Vi sletter aldrig stillingen, vi dæmper den.
    forældet: Number.isFinite(puls) ? nowMs - puls > LIVE_STALE_MS : true,
    setAt: Number.isFinite(puls) ? puls : null,
  };
}

/**
 * EFTERSLÆBERE: kampe, der ikke spilles i deres egen rundes uge.
 *
 * Begrebet er IKKE nyt — det er husets kupon-regel, brugt to steder til.
 * `rundensUge` (pointOpdeling.js) afgør allerede, hvilke kampe der står på
 * combi-kuponen, netop for at en bonus ikke skal vente på en kamp, der
 * spilles en måned senere. Samme skel svarer på de to spørgsmål, denne
 * funktion findes for:
 *
 *   1. Hvilken runde er den NÆSTE?  → efterslæbere tæller ikke med.
 *   2. Hvor skal en udsat kamp VISES? → på den runde, hvis uge den spilles i.
 *
 * At skrive en femte udgave af "hvad er en runde" var det, filens egen
 * kommentar advarede imod, så den ligger her og kalder den eksisterende.
 *
 * POINT FLYTTER SIG IKKE. En efterslæber giver point i sin EGEN runde, præcis
 * som før — det er kun visningen og landings-runden, der ændrer sig. Ville man
 * flytte point med, ændrede man en igangværende rundes combi-kupon bagud i
 * tiden, og det er en helt anden beslutning.
 *
 * @param {Array<{round:number, matches:Array<object>}>} rounds
 * @returns {Array<{match:object, fraRunde:number, uge:string}>}
 */
export function efterslaebere(rounds) {
  const ud = [];
  for (const { round, matches } of rounds || []) {
    // Rundens egen uge er den med FLEST af dens kampe. En runde, der er
    // flyttet i sin helhed, flytter derfor sin uge med sig og får ingen
    // efterslæbere — det er kun de kampe, der bliver TILBAGE, der er det.
    const uge = rundensUge(matches || []);
    if (uge == null) continue;
    for (const m of matches || []) {
      const u = ugeNoegle(toMillis(m.kickoff));
      // Et ULÆSELIGT kickoff er ikke en efterslæber. Samme retning som
      // kuponens: den kamp bliver, hvor den er, frem for at blive flyttet
      // til en runde, vi ikke kan vide er den rigtige.
      if (u == null || u === uge) continue;
      ud.push({ match: m, fraRunde: round, uge: u });
    }
  }
  return ud;
}

/**
 * De efterslæbere, der spilles i en bestemt rundes uge — altså dem, der skal
 * vises PÅ den runde, selv om de giver point i en anden.
 *
 * @param {Array<{round:number, matches:Array<object>}>} rounds
 * @param {number} rundeNr  runden, der vises
 * @returns {Array<{match:object, fraRunde:number, uge:string}>}
 */
export function efterslaebPaaRunde(rounds, rundeNr) {
  const runde = (rounds || []).find((r) => r.round === rundeNr);
  if (!runde) return [];
  const uge = rundensUge(runde.matches || []);
  if (uge == null) return [];
  // KUN ÉN BETINGELSE, og det er efterprøvet. Her stod før et ekstra
  // `e.fraRunde !== rundeNr` med kommentaren "ellers ville en runde vise sin
  // egen udsatte kamp to gange". Mutationstesten fjernede det og forblev
  // grøn — med god grund: en efterslæber fra runde R har pr. definition en
  // ANDEN uge end R's egen, så `e.uge === uge` kan aldrig være sand for den.
  // Vagten var unåelig, og en unåelig vagt er ikke en ekstra sikkerhed; den er
  // et sted, en fremtidig læser tror, der er dækning (CLAUDE.md: én vagt pr.
  // regel — to betyder, at den inderste kan fjernes med grøn suite).
  return efterslaebere(rounds).filter((e) => e.uge === uge);
}
