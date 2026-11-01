// ---------------------------------------------------------------------------
// functions-platform/ihfParse.js — IHF'S KAMPSIDER LÆST SOM DATA.
//
// Håndbold-VM 2027 har ingen API, vi kan bruge: IHF's egen side (ihf.info) er
// server-renderet Drupal, og den er kilden. Dette modul er RENT — ingen fetch,
// ingen Firestore — så hele læsningen kan bevises mod ægte sider i
// testdata/ihf-*.html (hentet af scripts/probe-ihf.mjs). Provideren, der
// henter siderne og skriver facit, er en senere delopgave og bor i
// syncProviders.js.
//
// Kun regex og strenge. En HTML-parser-pakke ville være en ny afhængighed i
// Cloud Functions for to sideformer, hvis felter alle bærer faste id'er og
// data-attributter.
//
// ═══════════════════════════════════════════════════════════════════════════
// EN TOM LISTE MÅ ALDRIG LIGNE «INTET FACIT ENDNU».
// ═══════════════════════════════════════════════════════════════════════════
// En skraber fejler typisk ved at finde INGENTING: Drupal-markuppen ændres, en
// consent- eller fejlside svarer 200, en status-kode skifter navn. Returnerede
// parseren så [] eller sprang en kamp over, ville synken læse det som «ingen
// kampe er slut endnu» — grønt Drift-kort, point der aldrig kommer. Derfor
// KASTER hver vagt nedenfor med en dansk besked, der siger hvad der blev set.
// Et kast bliver rødt på Drift-kortet og en alarm; et tavst [] bliver ingenting.
// Hver vagt har sin egen røde test i ihfParse.test.js.
//
// ═══════════════════════════════════════════════════════════════════════════
// SIDEN ER FREMMED INPUT — INGEN REGEX MÅ KUNNE HÆNGE
// ═══════════════════════════════════════════════════════════════════════════
// Et mønster som `>\s*([^<]*?)\s*<` har tre kvantorer, der alle kan tage de
// samme mellemrum. Følger slutningen ikke efter, prøver motoren hver fordeling:
// 10.000 mellemrum tog 159 s (Security, PR #240). En lille markup-ændring hos
// IHF ville have hængt synken til timeout ved hver kørsel. Reglerne her er:
//  • Ingen to kvantorer i træk, der kan matche samme tegn. Hvert `[^x]*`
//    efterfølges af netop `x` (eller et tegn, klassen udelukker). Mellemrum
//    trimmes i JS, ikke med `\s*` omkring en gruppe.
//  • Et felt findes med indexOf på sit anker og læses med et STICKY mønster
//    (flag y) lige efter ankeret — ét forsøg, ikke ét pr. tegn i siden. Et
//    «læs til slut-tag» er indexOf, ikke `[\s\S]*?`.
//  • Tag-fjernelsen er `<[^<>]*>`: en scanning stopper ved næste «<», så
//    100.000 «<» uden «>» er lineært (med `<[^>]*>` tog det 3,4 s).
// Hvert sticky mønster og indexOf i `indhold` har en tidstest i
// ihfParse.test.js med fjendtligt fyld lige efter ankeret, kørt i en
// børneproces med timeout (en hængende regex kan ikke afbrydes inde fra
// testen) — og hver af dem bliver rød, hvis flaget y byttes til g, eller
// indexOf til `[\s\S]*?`. Undtagelsen er KORT_TEKST: i et lukket resultatkort
// følger der altid et «<», så første forsøg lykkes, og y og g er her den samme
// regex (en ækvivalent mutant, ingen test kan skelne dem). Flaget står for at
// holde reglen, ikke fordi en test bærer det.
//
// ═══════════════════════════════════════════════════════════════════════════
// TING, SIDERNE VISTE, OG SOM IKKE ER HVAD DE LIGNER (målt mod fixtures)
// ═══════════════════════════════════════════════════════════════════════════
//  • 00:00 er IKKE et klokkeslæt. 2027-siderne står med «Local time 00:00 -
//    GMT 00:00», fordi tiderne ikke er lagt ind endnu. Står BEGGE som 00:00,
//    giver parseren null («ikke sat»). At en kamp uden kickoff aldrig oprettes,
//    er seed'ets ansvar — parseren skal blot sige null tydeligt.
//  • `<time datetime="2025-02-02T15:00:00Z">` er LOKAL tid med et forkert «Z».
//    Kampen startede 14:00 GMT. Klokkeslættet læses derfor fra teksten
//    «GMT 14:00», og fra datetime bruges kun datoen.
//  • Dagsidens score for en knockoutkamp er SLUTRESULTATET inkl. forlængelse
//    og straffekast (VM 2023-kvartfinalen Norge–Spanien står som 34-35, men
//    var 25-25 efter 60 minutter; VM 2021 Danmark–Egypten står som 39-38 efter
//    straffe). Feltet hedder derfor `slutScore`, ikke `score`: det må aldrig
//    læses som 60-minutters-facit. Stillingen efter 60 minutter findes KUN på
//    kampsiden, som summen af to halvlege — ejerens beslutning er, at knockout
//    tippes på den. Kampsiden siger også, HVORDAN kampen blev afgjort
//    (`afgjort`), så facitFelter har ét sted at hente det fra.
//  • Kampsidens slutscore TÆLLER straffekastene med (39:38 = 35-35 + 4-3).
//  • Knockout-kampe ligger på dagsiden FØR holdene kendes, med pladsholdere
//    som «W QF1» / «L QF2» og uden hold-link. De gives med `hjemmeId/udeId:
//    null`, så den, der opretter kampe, kan se, at holdene ikke kendes.
//  • Presidents Cup spilles på SAMME dagside som hovedrunden (VM 2025, 22/1:
//    «Main Round IV» og «President's Cup II»). Fasen er det, der skiller dem
//    (`fase: "President's Cup"`); provideren filtrerer dem fra (planen §11.4).
//  • Status-koderne, der er set: '' (ikke spillet) og 'E' (slut). En live
//    kamp har ikke kunnet observeres. En ukendt kode KASTER IKKE: den kamp
//    gives som `status: 'ukendt'` med den rå `statusKode` og uden score, og
//    resten af dagen læses som normalt. Kastede den, ville hver kampdag fejle,
//    så længe dagens sidste kamp blev spillet — og facit for de afsluttede
//    kampe vente på den. At en kamp bliver ved med at stå som ukendt, er
//    providerens alarm (med et vindue), ikke parserens.
// ---------------------------------------------------------------------------

/** Det lukkede sæt af IHF-status-koder → vores ord. Alt andet er 'ukendt'. */
const STATUS = Object.freeze({ '': 'planlagt', E: 'slut' });

/** Kampsidens perioder: vores nøgle → IHF's element-id (uden -a/-b). */
const PERIODE_ID = Object.freeze({
  h1: 'fh-goals',
  h2: 'sh-goals',
  ot1: 'fot-1-score',
  ot2: 'fot-2-score',
  straffe: 'penalty-score',
});

/** Fejlen, alle vagter kaster — så provideren kan kende en skraber-fejl fra en netværksfejl. */
class IhfStrukturFejl extends Error {
  constructor(besked) {
    super(`IHF: ${besked}`);
    this.name = 'IhfStrukturFejl';
  }
}

function fejl(besked) {
  throw new IhfStrukturFejl(besked);
}

const ENTITETER = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };

/** Erstatningstegnet for en entitet, der ikke er et gyldigt tegn. */
const UGYLDIG = '\uFFFD';

/**
 * Et tal fra en numerisk entitet → tegnet. Over U+10FFFF (også en
 * cifferrække, der giver Infinity) og NUL giver U+FFFD: String.fromCodePoint
 * ville ellers kaste RangeError — en fejl, provideren ikke kan kende fra en
 * netværksfejl. Tallet er altid et heltal (\d+ eller hex) eller Infinity.
 * En enlig surrogat (&#xD800;) afkodes her og fanges af SURROGAT i rens —
 * ÉN vagt for surrogater, også dem, der står rå i strengen.
 */
function tegn(kode) {
  return kode > 0 && kode <= 0x10ffff ? String.fromCodePoint(kode) : UGYLDIG;
}

/** Styretegn (C0/C1) bliver til mellemrum — de samles bagefter. */
const STYRETEGN = /\p{Cc}/gu;
/** Enlige surrogater — fra en entitet eller rå i strengen — bliver U+FFFD. */
const SURROGAT = /\p{Cs}/gu;
/**
 * Usynlige formateringstegn fjernes helt — hele Unicode-kategorien Cf, ikke en
 * håndliste: U+202E vender teksten («Denmark» kan vises som et andet navn),
 * nul-bredde-tegn og bløde bindestreger (U+00AD) får to ens navne til at være
 * forskellige strenge, og tag-tegnene (U+E0020–E007F) er usynlig tekst.
 * Retningstegnene (U+061C, U+200E/F, U+202A–202E, U+2066–2069) er alle Cf;
 * testen tjekker hvert af dem, så en ændring i Unicode-tabellen ville ses.
 */
const USYNLIGE = /\p{Cf}/gu;

/**
 * Tekst ud af et HTML-stykke: tags væk, entiteter afkodet, styre- og
 * retningstegn væk, mellemrum samlet.
 * Decimale (&#39;), hex (&#x27;) og navngivne (&apos;) entiteter afkodes i ÉT
 * gennemløb, så «&#38;lt;» bliver «&lt;» og ikke dobbelt-afkodes til «<».
 * Tag-mønsteret er `<[^<>]*>` (lineært), se toppen.
 */
function rens(s) {
  return String(s ?? '')
    .replace(/<[^<>]*>/g, ' ')
    .replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (hel, dec, hex, navn) => {
      if (dec) return tegn(Number(dec));
      if (hex) return tegn(parseInt(hex, 16));
      return ENTITETER[navn.toLowerCase()] ?? hel;
    })
    .replace(STYRETEGN, ' ')
    .replace(SURROGAT, UGYLDIG)
    .replace(USYNLIGE, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Første forekomst af `anker` i `tekst` — og så det STICKY mønster `hale`
 * (flag y) læst lige efter ankeret. Ét forsøg, ikke ét pr. position i siden.
 * Null, hvis ankeret mangler, eller halen ikke passer.
 */
function efter(tekst, anker, hale, fra = 0) {
  const i = tekst.indexOf(anker, fra);
  if (i < 0) return null;
  hale.lastIndex = i + anker.length;
  return hale.exec(tekst);
}

/** Resten af et åbningstag (attributter) til og med «>». */
const TAG_REST = /[^<>]*>/y;

/**
 * Indholdet af det element, hvis åbningstag indeholder `anker`: fra tagets
 * «>» til første `slut`. Null, hvis ankeret, «>» eller `slut` mangler.
 * indexOf i stedet for `[\s\S]*?` — lineært, også når slut-tagget mangler.
 */
function indhold(tekst, anker, slut, fra = 0) {
  if (!efter(tekst, anker, TAG_REST, fra)) return null;
  const start = TAG_REST.lastIndex;
  const j = tekst.indexOf(slut, start);
  return j < 0 ? null : tekst.slice(start, j);
}

/** Hvor mange gange `anker` står i `tekst`. */
function antal(tekst, anker) {
  let n = 0;
  for (let i = tekst.indexOf(anker); i >= 0; i = tekst.indexOf(anker, i + anker.length)) n++;
  return n;
}

/** «Munich / SAP Garden» → { by, hal }. Uden skråstreg er det hele hallen. */
function sted(tekst) {
  const t = rens(tekst);
  if (!t) return { by: null, hal: null };
  const i = t.indexOf(' / ');
  if (i < 0) return { by: null, hal: t };
  return { by: t.slice(0, i).trim() || null, hal: t.slice(i + 3).trim() || null };
}

/**
 * Status-koden gennem det lukkede sæt. En ukendt kode er 'ukendt' — ALDRIG
 * slut, og den får ingen score. Den rå kode følger med som `statusKode`.
 */
function status(kode) {
  return Object.prototype.hasOwnProperty.call(STATUS, kode) ? STATUS[kode] : 'ukendt';
}

/** Den rå kode, som den kan vises på Drift-kortet: renset og afkortet. */
const visKode = (kode) => rens(kode).slice(0, 40);

const TID = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Lokal tid + GMT. Begge 00:00 betyder «ikke sat» → null, ikke midnat. */
function tider(lokal, gmt, hvor) {
  if (!TID.test(lokal) || !TID.test(gmt)) {
    fejl(`tiden for ${hvor} har et uventet format (lokal «${lokal}», GMT «${gmt}», forventet «HH:MM»).`);
  }
  if (lokal === '00:00' && gmt === '00:00') return { lokalTid: null, gmtTid: null };
  return { lokalTid: lokal, gmtTid: gmt };
}

/** «26-32» (dagside) eller «35:34» (kampside) → { h, u }. Alt andet kaster. */
function stilling(tekst, skilletegn, hvor) {
  const m = new RegExp(`^(\\d{1,3})${skilletegn}(\\d{1,3})$`).exec(tekst);
  if (!m) {
    fejl(`scoren «${tekst}» for ${hvor} har et uventet format (forventet fx «26${skilletegn}32»).`);
  }
  return { h: Number(m[1]), u: Number(m[2]) };
}

/** Sidens kanoniske adresse (href i <link rel="canonical">), eller null. */
function kanoniskAf(html) {
  const m = /<link\s+rel="canonical"\s+href="([^"]*)"/i.exec(String(html ?? ''));
  return m ? m[1] : null;
}

/**
 * Konkurrence-id'et i sidens kanoniske adresse — markøren for, at det
 * overhovedet ER en IHF-konkurrenceside. En consent-, fejl- eller
 * vedligeholdsside svarer også 200, men har den ikke. `slags` er 'matches'
 * (dagside) eller 'match-center' (kampside). Null, hvis markøren mangler.
 */
function konkurrenceIdAf(html, slags) {
  const kanonisk = kanoniskAf(html);
  if (kanonisk == null) return null;
  const m = new RegExp(`/competitions/[^/]+/\\d+/[^/]+/(\\d+)/${slags}/`, 'i').exec(kanonisk);
  return m ? Number(m[1]) : null;
}

/** Kamp-id'et som SIDSTE led i kampsidens kanoniske adresse (…/match-center/{id}). Null ellers. */
function kampIdAf(html) {
  const kanonisk = kanoniskAf(html);
  const m = kanonisk == null ? null : /\/match-center\/(\d+)\/?$/.exec(kanonisk);
  return m ? Number(m[1]) : null;
}

/** Fejlsidens citat læses kun af sidens begyndelse — en hel fremmed side renses aldrig. */
const CITAT_KILDE = 4096;

function kraevSide(html, slags, navn) {
  if (typeof html !== 'string' || konkurrenceIdAf(html, slags) == null) {
    const start = rens(typeof html === 'string' ? html.slice(0, CITAT_KILDE) : '').slice(0, 80);
    fejl(`siden ligner ikke en IHF-${navn} (ingen konkurrence-markør i den kanoniske adresse) — `
      + `consent-, fejl- eller vedligeholdsside? Sidens tekst begynder: «${start}».`);
  }
}

/** Datoerne i dagsidens kalender (spilledagene, som IHF selv lister dem). */
function kalenderAf(html) {
  return [...String(html ?? '').matchAll(/href="[^"]*\/matches\/(\d{4}-\d{2}-\d{2})"\s+class="groupDate/g)]
    .map((m) => m[1]);
}

const HOLD_LINK = /(\d+)"[^<>]*>/y;

/** Et holdfelt på dagsiden: navn + IHF's hold-id (null for en pladsholder som «W QF1»). */
function holdAf(felt, side, hvor) {
  let navnHtml;
  let id = null;
  if (felt.includes('team-matches/')) {
    // Et hold-link, der ikke kan læses, er en ændret markup — ikke en pladsholder.
    const link = efter(felt, 'team-matches/', HOLD_LINK);
    const slut = link ? felt.indexOf('</a>', HOLD_LINK.lastIndex) : -1;
    if (slut < 0) fejl(`${side}holdets link for ${hvor} kan ikke læses (team-matches/{id}">…</a>).`);
    id = Number(link[1]);
    navnHtml = felt.slice(HOLD_LINK.lastIndex, slut);
  } else {
    const i = felt.indexOf('<span>');
    const j = i < 0 ? -1 : felt.indexOf('</span>', i);
    navnHtml = j < 0 ? '' : felt.slice(i + 6, j);
  }
  const navn = rens(navnHtml);
  if (!navn) fejl(`${side}holdet for ${hvor} har intet navn.`);
  return { navn, id };
}

/** Kamp-id'et på dagsiden — én pr. kampblok (se vagten i parseDagside). */
const KAMP_ID = /data-ihf-competitions-match-id="(\d+)"/g;

const ATTR = /([^"]*)"/y;
const SCORE_FELT = /[^<>]*>([^<]*)</y;
// «Local time <time datetime="…">15:30</time>\n - GMT 14:30». Hver kvantor
// efterfølges af et tegn, den ikke selv kan tage (se toppen).
const DAG_TID = /\s*(<time\b[^<>]*>)([^<]*)<\/time>\s*-\s*GMT\s*([0-9:]+)/y;

function parseKampBlok(blok, ihfId) {
  const hvor = `kamp ${ihfId}`;

  // Status står på kampblokkens EGET åbningstag (<div class="matchDetails" …>).
  const aabning = blok.slice(0, blok.indexOf('>') + 1);
  const kode = efter(aabning, 'data-ihf-competitions-match-status="', ATTR);
  if (!kode) fejl(`${hvor} mangler sin status.`);
  const st = status(kode[1]);

  const gruppeFelt = indhold(blok, 'class="groupName', '</div>');
  if (gruppeFelt == null) fejl(`${hvor} mangler fase/gruppe.`);
  const [faseTekst, gruppeTekst] = gruppeFelt.split(/<br\s*\/?>/i);
  const fase = rens(faseTekst);
  if (!fase) fejl(`${hvor} har en tom fase.`);

  const arena = indhold(blok, 'class="arena', '</p>');

  const holdFelter = blok.split('<div class="country').slice(1).map((del, n) => {
    const felt = indhold(del, '', '</div>');
    if (felt == null) fejl(`${hvor}: holdfelt ${n + 1} lukkes ikke (</div> mangler).`);
    return felt;
  });
  if (holdFelter.length !== 2) fejl(`${hvor} har ${holdFelter.length} holdfelter, ikke 2.`);
  const hjemme = holdAf(holdFelter[0], 'hjemme', hvor);
  const ude = holdAf(holdFelter[1], 'ude', hvor);

  const scoreFelt = efter(blok, `id="ihf-competitions-score-${ihfId}"`, SCORE_FELT);
  if (!scoreFelt) fejl(`${hvor} mangler sit score-felt.`);
  const scoreTekst = rens(scoreFelt[1]);
  let slutScore = null;
  if (st === 'slut') {
    slutScore = stilling(scoreTekst, '-', hvor);
  } else if (st === 'planlagt' && scoreTekst !== 'VS') {
    fejl(`${hvor} er ikke spillet, men score-feltet viser «${scoreTekst}» (forventet «VS»).`);
  }
  // 'ukendt': score-feltet skal findes (struktur), men tolkes ikke.

  const tid = efter(blok, 'Local time', DAG_TID);
  const dato = tid && /\bdatetime="(\d{4}-\d{2}-\d{2})/.exec(tid[1]);
  if (!tid || !dato) fejl(`${hvor} mangler sin tid («Local time … - GMT …»).`);

  return {
    ihfId,
    fase,
    gruppe: rens(gruppeTekst) || null,
    ...sted(arena),
    hjemme: hjemme.navn,
    hjemmeId: hjemme.id,
    ude: ude.navn,
    udeId: ude.id,
    status: st,
    statusKode: visKode(kode[1]),
    slutScore,
    dato: dato[1],
    ...tider(tid[2].trim(), tid[3], hvor),
  };
}

/**
 * En dagside (…/{konkurrence}/matches/YYYY-MM-DD) → dagens kampe.
 *
 * [{ ihfId, fase, gruppe, by, hal, hjemme, hjemmeId, ude, udeId, status,
 *    statusKode, slutScore, dato, lokalTid, gmtTid }]
 *
 *  - status: 'planlagt' | 'slut' | 'ukendt'. statusKode: IHF's rå kode.
 *  - slutScore: { h, u } ved slut, ellers null (også ved 'ukendt'). For en
 *    knockoutkamp er det slutresultatet INKL. forlængelse og straffe — ALDRIG
 *    60-minutters-facit (det findes kun på kampsiden som `efter60`).
 *  - fase: «Main Round», «President's Cup», «Quarter finals» …; gruppe:
 *    «Group A», «Main Round IV», «President's Cup II» eller null (knockout).
 *  - hjemmeId/udeId: null = pladsholder.
 *  - lokalTid/gmtTid: «HH:MM» eller null (begge stod som 00:00 = ikke sat).
 *  - dato: datoen fra sidens <time datetime> (dens klokkeslæt er lokal tid med
 *    et forkert «Z» og bruges ikke).
 *
 * Kaster IhfStrukturFejl i stedet for at returnere [] eller springe en kamp over.
 */
function parseDagside(html) {
  kraevSide(html, 'matches', 'dagside');
  const [foer, ...blokke] = html.split(/<div class="matchDetails"/);
  if (blokke.length === 0) {
    const kalender = kalenderAf(html);
    if (kalender.length) {
      fejl(`dagsiden har ${kalender.length} spilledage i kalenderen (${kalender[0]} … ${kalender[kalender.length - 1]}), `
        + 'men 0 kampe — markuppen er sandsynligvis ændret. En tom dag tolkes ikke som «intet facit endnu».');
    }
    fejl('dagsiden mangler både kalender og kampmarkører (data-ihf-competitions-match-id).');
  }
  // ÉN vagt for kamp-id'erne (CLAUDE.md, «Én vagt pr. sikkerhedsregel»): før
  // første kampblok står ingen, og hver kampblok har præcis ét. Den fanger både
  // en blok uden id, en blok med to (to kampe slået sammen) og et id uden for
  // en blok — også når de udligner hinanden i en optælling.
  const ider = [foer, ...blokke].map((del) => [...del.matchAll(KAMP_ID)].map((m) => Number(m[1])));
  const skaev = ider.findIndex((liste, i) => liste.length !== (i === 0 ? 0 : 1));
  if (skaev >= 0) {
    const iAlt = ider.reduce((n, liste) => n + liste.length, 0);
    const hvor = skaev === 0
      ? `før første kampblok står ${ider[0].length}`
      : `kampblok ${skaev} har ${ider[skaev].length}`;
    fejl(`dagsiden har ${iAlt} kamp-id'er og ${blokke.length} kampblokke, men hver kampblok skal have præcis ét `
      + `(${hvor}) — markuppen er ændret.`);
  }
  // To blokke med samme id: hvilken af dem er kampen? Ingen af dem tolkes.
  const set = new Set();
  for (const [id] of ider.slice(1)) {
    if (set.has(id)) fejl(`dagsiden har kamp ${id} i to kampblokke — det er uklart, hvilken der er kampen.`);
    set.add(id);
  }
  // Hver kampblok er sit EGET <div class="matchDetails">-element, ikke «til
  // næste blok»: ellers ville dagens sidste blok strække sig til sidens ende og
  // kunne låne en fase, en hal eller et score-felt fra en sidebar efter kampene.
  return blokke.map((blok, i) => {
    const ihfId = ider[i + 1][0];
    const element = divElement(`<div class="matchDetails"${blok}`, 0);
    if (element == null) fejl(`kamp ${ihfId}: kampblokken (<div class="matchDetails">) lukkes aldrig.`);
    return parseKampBlok(element, ihfId);
  });
}

/** Hvor en HTML-kommentar eller et <script> slutter: indekset efter den. -1, hvis den aldrig lukkes. */
const SCRIPT_SLUT = /<\/script\b/gi;
function forbi(html, aabner, fra) {
  if (aabner === '<!--') {
    const j = html.indexOf('-->', fra);
    return j < 0 ? -1 : j + 3;
  }
  SCRIPT_SLUT.lastIndex = fra;
  return SCRIPT_SLUT.exec(html) ? SCRIPT_SLUT.lastIndex : -1;
}

/**
 * Det element, der STARTER ved `start` (et «<div»), til og med sit eget
 * </div> — fundet ved at tælle <div og </div>. Et «<div» i en HTML-kommentar
 * eller et <script> er tekst, ikke et element, og springes over: ellers ville
 * «<!-- <div class="gammel"> -->» flytte slutgrænsen ud over en nabo-widget,
 * og «<!-- </div> -->» lukke kortet før dets felter. Null, hvis elementet —
 * eller en kommentar eller et script i det — aldrig lukkes.
 */
function divElement(html, start) {
  const re = /<(\/?)div\b|<!--|<script\b/gi;
  re.lastIndex = start;
  let dybde = 0;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    if (m[1] === undefined) { // «<!--» eller «<script» — gruppen deltog ikke
      const j = forbi(html, m[0].toLowerCase(), re.lastIndex);
      if (j < 0) return null;
      re.lastIndex = j;
      continue;
    }
    dybde += m[1] ? -1 : 1;
    if (dybde === 0) {
      const slut = html.indexOf('>', re.lastIndex);
      return slut < 0 ? null : html.slice(start, slut + 1);
    }
  }
  return null;
}

/**
 * Det sticky mønster `hale` efter ankerets ENESTE forekomst i resultatkortet.
 * Står ankeret to gange, er det uklart, hvilket felt der er kampens — så kastes der.
 * Null, hvis ankeret mangler (kalderen siger, hvad der mangler).
 */
function ietKort(kort, anker, hale, hvor) {
  return eneste(kort, anker, hvor) < 0 ? null : efter(kort, anker, hale);
}

/** Indekset for ankerets ENESTE forekomst i resultatkortet; -1, hvis det mangler. To eller flere kaster. */
function eneste(kort, anker, hvor) {
  const n = antal(kort, anker);
  if (n > 1) fejl(`${hvor}: «${anker}» står ${n} gange i resultatkortet — præcis én forventes.`);
  return kort.indexOf(anker);
}

const MARKOER = 'data-ihf-competitions-match-results-match-id="';
const KORT_TEKST = /([^<]*)</y;
const KORT_GMT = /([^<]*)<small>\s*GMT/y;
const KORT_ARENA = /\s*<span>([^<]*)<\/span>/y;
const PERIODE_FELT = /[^<>]*>([^<]*)</y;

/** Én periode på kampsiden → { h, u }. Mangler den eller er den ikke et tal, kastes der. */
function periode(kort, noegle, hvor) {
  const sider = ['a', 'b'].map((s) => {
    const m = ietKort(kort, `id="${PERIODE_ID[noegle]}-${s}"`, PERIODE_FELT, hvor);
    const tal = m && m[1].trim();
    if (!m || !/^\d{1,3}$/.test(tal)) {
      fejl(`perioden ${noegle} (${PERIODE_ID[noegle]}-${s}) for ${hvor} mangler eller har et uventet format`
        + `${m ? ` («${tal}»)` : ''}.`);
    }
    return Number(tal);
  });
  return { h: sider[0], u: sider[1] };
}

const plus = (...p) => ({ h: p.reduce((s, x) => s + x.h, 0), u: p.reduce((s, x) => s + x.u, 0) });
const lige = (s) => s.h === s.u;
const nul = (s) => s.h === 0 && s.u === 0;
const vis = (s) => `${s.h}-${s.u}`;

/**
 * Vagten om stillingen efter 60 minutter. Den er summen af de to halvlege —
 * det er definitionen — men den skal HÆNGE SAMMEN med resten: forlængelse
 * spilles kun ved uafgjort efter 60, 2. forlængelse kun ved uafgjort efter
 * 1. forlængelse, og straffekast kun ved uafgjort efter forlængelsen. Er der
 * spillet en periode fra en stilling, der ikke var lige, er perioderne læst
 * forkert, og så må knockout-facit (= efter60) ikke bruges.
 */
function tjekEfter60(p, efter60, hvor) {
  const forlaenget = !nul(p.ot1) || !nul(p.ot2);
  if ((forlaenget || !nul(p.straffe)) && !lige(efter60)) {
    fejl(`${hvor}: der er spillet forlængelse/straffekast, men halvlegene giver ${vis(efter60)} efter 60 minutter `
      + '— ikke uafgjort. Halvlegene er læst forkert; facit efter 60 minutter bruges ikke.');
  }
  if (!nul(p.ot2) && !lige(plus(efter60, p.ot1))) {
    fejl(`${hvor}: der er spillet 2. forlængelse, men stillingen efter 1. forlængelse er `
      + `${vis(plus(efter60, p.ot1))} — ikke uafgjort.`);
  }
  if (!nul(p.straffe) && !lige(plus(efter60, p.ot1, p.ot2))) {
    fejl(`${hvor}: der er spillet straffekast, men stillingen efter forlængelsen er `
      + `${vis(plus(efter60, p.ot1, p.ot2))} — ikke uafgjort.`);
  }
}

/** Hvordan kampen blev afgjort, afledt af perioderne (ÉT sted — facitFelter henter det her). */
function afgjortAf(p) {
  if (!nul(p.straffe)) return 'straffe';
  if (!nul(p.ot1) || !nul(p.ot2)) return 'forlaenget';
  return 'ordinaer';
}

/**
 * En kampside (…/{konkurrence}/match-center/{id}) → kampens forløb.
 *
 *   parseKampside(html, { ihfId })   — ihfId er det kamp-id, der blev bedt om.
 *
 * { ihfId, status, statusKode, hjemme, ude, lokalTid, gmtTid, by, hal,
 *   slut:{h,u}, perioder:{h1,h2,ot1,ot2,straffe}, efter60:{h,u}, afgjort }
 *
 *  - slut: slutscoren INKL. forlængelse og straffekast (35:34, 39:38).
 *  - efter60: h1 + h2 — knockout-facit efter ejerens beslutning.
 *  - afgjort: 'ordinaer' | 'forlaenget' | 'straffe' (af perioderne).
 *  - En ikke-spillet kamp (status 'planlagt', scoren står som 0:0) og en kamp
 *    med ukendt status giver slut, perioder, efter60 og afgjort = null.
 *
 * Siden skal være kampen, der blev bedt om: præcis én kampmarkør, og dens id
 * = id'et i den kanoniske adresse = `ihfId`. Status, tider, hold, resultat og
 * perioder læses KUN i kampmarkørens eget element (resultatkortet), og hvert
 * felt skal stå der præcis én gang — en nabo-widget kan ikke låne kampen sit
 * resultat.
 *
 * Kaster IhfStrukturFejl, hvis noget af det ikke holder, hvis perioderne ikke
 * summerer til slutscoren, eller hvis en periode er spillet fra en stilling,
 * der ikke var lige.
 */
function parseKampside(html, { ihfId: forventet } = {}) {
  if (!Number.isSafeInteger(forventet) || forventet <= 0) {
    throw new TypeError('parseKampside kræver det kamp-id, der blev bedt om: parseKampside(html, { ihfId }).');
  }
  kraevSide(html, 'match-center', 'kampside');

  const markoerer = antal(html, MARKOER);
  if (markoerer === 0) fejl('kampsiden mangler sin kampmarkør (data-ihf-competitions-match-results-match-id).');
  if (markoerer > 1) {
    fejl(`kampsiden har ${markoerer} kampmarkører (data-ihf-competitions-match-results-match-id) — præcis én forventes.`);
  }
  const id = efter(html, MARKOER, /(\d+)"/y);
  if (!id) fejl('kampsidens kampmarkør har intet tal-id.');
  const ihfId = Number(id[1]);

  const adressensId = kampIdAf(html);
  if (adressensId !== forventet) {
    fejl(`kampsiden er ikke kamp ${forventet}: den kanoniske adresse siger ${adressensId ?? 'intet kamp-id'} `
      + '— omdirigering eller forkert side.');
  }
  if (ihfId !== adressensId) {
    fejl(`kampsidens markør siger kamp ${ihfId}, men den kanoniske adresse siger ${adressensId}.`);
  }
  const hvor = `kamp ${ihfId}`;

  // Resultatkortet = elementet, hvis åbningstag bærer markøren.
  const mi = html.indexOf(MARKOER);
  const tagStart = html.lastIndexOf('<', mi);
  const tagSlut = html.indexOf('>', mi);
  const aabning = tagSlut < 0 ? '' : html.slice(tagStart, tagSlut + 1);
  if (!/^<div\b/i.test(aabning)) fejl(`${hvor}: kampmarkøren står ikke på et <div> (resultatkortet).`);
  const kort = divElement(html, tagStart);
  if (kort == null) fejl(`${hvor}: resultatkortet (kampmarkørens <div>) lukkes aldrig.`);

  const kode = efter(aabning, 'data-ihf-competitions-match-results-match-status="', ATTR);
  if (!kode) fejl(`${hvor} mangler sin status.`);
  const st = status(kode[1]);

  const lokal = ietKort(kort, 'class="time time-local">', KORT_TEKST, hvor);
  const gmt = ietKort(kort, 'class="time time-gmt">', KORT_GMT, hvor);
  if (!lokal || !gmt) fejl(`${hvor} mangler sin lokale tid eller GMT-tid.`);
  const pEfterGmt = kort.indexOf('</p>', KORT_GMT.lastIndex);
  const arena = pEfterGmt < 0 ? null : efter(kort, '</p>', KORT_ARENA, pEfterGmt);

  // Holdene læses KUN i resultatkortets krop: andre «country»-felter på siden
  // (fx en nabokamp) må ikke blive til kampens hold.
  const krop = eneste(kort, 'resultCardBody', hvor);
  if (krop < 0) fejl(`${hvor} mangler sit resultatkort (resultCardBody) — holdene kan ikke læses.`);
  const hold = [...kort.slice(krop).matchAll(/<div class="country[^"<>]*">\s*(?:<img[^<>]*>\s*)?<span>([^<]*)<\/span>/g)]
    .slice(0, 2).map((m) => rens(m[1]));
  if (hold.length < 2 || hold.some((navn) => !navn)) {
    fejl(`${hvor}: resultatkortet har ikke to holdnavne (fandt ${JSON.stringify(hold)}).`);
  }

  const resultat = ietKort(kort, 'id="result-a-b">', KORT_TEKST, hvor);
  if (!resultat) fejl(`${hvor} mangler sin slutscore (result-a-b).`);
  const resultatTekst = resultat[1].trim();

  const faelles = {
    ihfId,
    status: st,
    statusKode: visKode(kode[1]),
    hjemme: hold[0],
    ude: hold[1],
    ...tider(lokal[1].trim(), gmt[1].trim(), hvor),
    ...sted(arena && arena[1]),
  };
  const intet = { slut: null, perioder: null, efter60: null, afgjort: null };

  if (st === 'ukendt') return { ...faelles, ...intet };
  if (st === 'planlagt') {
    if (resultatTekst !== '0:0') {
      fejl(`${hvor} er ikke spillet, men slutscoren viser «${resultatTekst}» (forventet «0:0»).`);
    }
    return { ...faelles, ...intet };
  }

  const slut = stilling(resultatTekst, ':', hvor);
  const perioder = {};
  for (const noegle of Object.keys(PERIODE_ID)) perioder[noegle] = periode(kort, noegle, hvor);

  const sum = plus(...Object.values(perioder));
  if (sum.h !== slut.h || sum.u !== slut.u) {
    fejl(`${hvor}: perioderne summerer til ${vis(sum)}, men slutscoren er ${vis(slut)}. `
      + 'Mindst ét tal er læst forkert; kampens facit bruges ikke.');
  }

  const efter60 = plus(perioder.h1, perioder.h2);
  tjekEfter60(perioder, efter60, hvor);

  return { ...faelles, slut, perioder, efter60, afgjort: afgjortAf(perioder) };
}

module.exports = {
  STATUS,
  PERIODE_ID,
  IhfStrukturFejl,
  parseDagside,
  parseKampside,
  konkurrenceIdAf,
  kampIdAf,
  kalenderAf,
};
