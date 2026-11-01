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
//    straffe). Stillingen efter 60 minutter findes KUN på kampsiden, som
//    summen af to halvlege — ejerens beslutning er, at knockout tippes på den.
//  • Kampsidens slutscore TÆLLER straffekastene med (39:38 = 35-35 + 4-3).
//  • Knockout-kampe ligger på dagsiden FØR holdene kendes, med pladsholdere
//    som «W QF1» / «L QF2» og uden hold-link. De gives med `hjemmeId/udeId:
//    null`, så den, der opretter kampe, kan se, at holdene ikke kendes.
//  • Status-koderne, der er set: '' (ikke spillet) og 'E' (slut). En live
//    kamp har ikke kunnet observeres; dens kode er ukendt og KASTER, til den
//    er set og lagt ind i STATUS med en fixture.
// ---------------------------------------------------------------------------

/** Det lukkede sæt af IHF-status-koder → vores ord. Alt andet kaster. */
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

/**
 * Tekst ud af et HTML-stykke: tags væk, entiteter afkodet, mellemrum samlet.
 * Decimale (&#39;), hex (&#x27;) og navngivne (&apos;) entiteter afkodes i ÉT
 * gennemløb, så «&#38;lt;» bliver «&lt;» og ikke dobbelt-afkodes til «<».
 */
function rens(s) {
  return String(s ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (hel, dec, hex, navn) => {
      if (dec) return String.fromCodePoint(Number(dec));
      if (hex) return String.fromCodePoint(parseInt(hex, 16));
      return ENTITETER[navn.toLowerCase()] ?? hel;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

/** «Munich / SAP Garden» → { by, hal }. Uden skråstreg er det hele hallen. */
function sted(tekst) {
  const t = rens(tekst);
  if (!t) return { by: null, hal: null };
  const i = t.indexOf(' / ');
  if (i < 0) return { by: null, hal: t };
  return { by: t.slice(0, i).trim() || null, hal: t.slice(i + 3).trim() || null };
}

/** Status-koden gennem det lukkede sæt. En ukendt kode tolkes ALDRIG som slut. */
function status(kode, hvor) {
  if (!Object.prototype.hasOwnProperty.call(STATUS, kode)) {
    fejl(`ukendt status-kode «${kode}» for ${hvor}. Kendte koder: '' (ikke spillet) og 'E' (slut). `
      + 'Kampen tolkes ikke — læg koden ind i STATUS med en fixture, når den er set.');
  }
  return STATUS[kode];
}

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

/**
 * Konkurrence-id'et i sidens kanoniske adresse — markøren for, at det
 * overhovedet ER en IHF-konkurrenceside. En consent-, fejl- eller
 * vedligeholdsside svarer også 200, men har den ikke. `slags` er 'matches'
 * (dagside) eller 'match-center' (kampside). Null, hvis markøren mangler.
 */
function konkurrenceIdAf(html, slags) {
  const kanonisk = /<link\s+rel="canonical"\s+href="([^"]*)"/i.exec(String(html ?? ''));
  if (!kanonisk) return null;
  const m = new RegExp(`/competitions/[^/]+/\\d+/[^/]+/(\\d+)/${slags}/`, 'i').exec(kanonisk[1]);
  return m ? Number(m[1]) : null;
}

function kraevSide(html, slags, navn) {
  if (typeof html !== 'string' || konkurrenceIdAf(html, slags) == null) {
    const start = rens(typeof html === 'string' ? html : '').slice(0, 80);
    fejl(`siden ligner ikke en IHF-${navn} (ingen konkurrence-markør i den kanoniske adresse) — `
      + `consent-, fejl- eller vedligeholdsside? Sidens tekst begynder: «${start}».`);
  }
}

/** Datoerne i dagsidens kalender (spilledagene, som IHF selv lister dem). */
function kalenderAf(html) {
  return [...String(html ?? '').matchAll(/href="[^"]*\/matches\/(\d{4}-\d{2}-\d{2})"\s+class="groupDate/g)]
    .map((m) => m[1]);
}

/** Et holdfelt på dagsiden: navn + IHF's hold-id (null for en pladsholder som «W QF1»). */
function holdAf(felt, side, hvor) {
  const link = /team-matches\/(\d+)"[^>]*>([\s\S]*?)<\/a>/.exec(felt);
  const navn = rens(link ? link[2] : (/<span>([\s\S]*?)<\/span>/.exec(felt) || [])[1]);
  if (!navn) fejl(`${side}holdet for ${hvor} har intet navn.`);
  return { navn, id: link ? Number(link[1]) : null };
}

/** Kamp-id'et på dagsiden — én pr. kampblok (se vagten i parseDagside). */
const KAMP_ID = /data-ihf-competitions-match-id="(\d+)"/g;

function parseKampBlok(blok, ihfId) {
  const hvor = `kamp ${ihfId}`;

  const kode = /data-ihf-competitions-match-status="([^"]*)"/.exec(blok);
  if (!kode) fejl(`${hvor} mangler sin status.`);
  const st = status(kode[1], hvor);

  const gruppeFelt = /class="groupName[^"]*">([\s\S]*?)<\/div>/.exec(blok);
  if (!gruppeFelt) fejl(`${hvor} mangler fase/gruppe.`);
  const [faseTekst, gruppeTekst] = gruppeFelt[1].split(/<br\s*\/?>/i);
  const fase = rens(faseTekst);
  if (!fase) fejl(`${hvor} har en tom fase.`);

  const arena = /class="arena[^"]*">([\s\S]*?)<\/p>/.exec(blok);

  const hold = [...blok.matchAll(/<div class="country[^"]*">([\s\S]*?)<\/div>/g)];
  if (hold.length !== 2) fejl(`${hvor} har ${hold.length} holdfelter, ikke 2.`);
  const hjemme = holdAf(hold[0][1], 'hjemme', hvor);
  const ude = holdAf(hold[1][1], 'ude', hvor);

  const scoreFelt = new RegExp(`id="ihf-competitions-score-${ihfId}"[^>]*>([^<]*)<`).exec(blok);
  if (!scoreFelt) fejl(`${hvor} mangler sit score-felt.`);
  const scoreTekst = rens(scoreFelt[1]);
  let score = null;
  if (st === 'slut') {
    score = stilling(scoreTekst, '-', hvor);
  } else if (scoreTekst !== 'VS') {
    fejl(`${hvor} er ikke spillet, men score-feltet viser «${scoreTekst}» (forventet «VS»).`);
  }

  const tid = /Local time\s*<time[^>]*datetime="(\d{4}-\d{2}-\d{2})[^"]*"[^>]*>\s*([^<]*?)\s*<\/time>\s*-\s*GMT\s*([0-9:]+)/.exec(blok);
  if (!tid) fejl(`${hvor} mangler sin tid («Local time … - GMT …»).`);

  return {
    ihfId,
    fase,
    gruppe: rens(gruppeTekst) || null,
    ...sted(arena && arena[1]),
    hjemme: hjemme.navn,
    hjemmeId: hjemme.id,
    ude: ude.navn,
    udeId: ude.id,
    status: st,
    score,
    dato: tid[1],
    ...tider(tid[2], tid[3], hvor),
  };
}

/**
 * En dagside (…/{konkurrence}/matches/YYYY-MM-DD) → dagens kampe.
 *
 * [{ ihfId, fase, gruppe, by, hal, hjemme, hjemmeId, ude, udeId, status,
 *    score, dato, lokalTid, gmtTid }]
 *
 *  - status: 'planlagt' | 'slut' (STATUS). score: { h, u } ved slut, ellers null.
 *    For en knockoutkamp er det slutresultatet INKL. forlængelse og straffe.
 *  - gruppe: «Group A» eller null (knockout). hjemmeId/udeId: null = pladsholder.
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
  return blokke.map((blok, i) => parseKampBlok(blok, ider[i + 1][0]));
}

/** Én periode på kampsiden → { h, u }. Mangler den eller er den ikke et tal, kastes der. */
function periode(html, noegle, hvor) {
  const sider = ['a', 'b'].map((s) => {
    const m = new RegExp(`id="${PERIODE_ID[noegle]}-${s}"[^>]*>\\s*([^<]*?)\\s*<`).exec(html);
    if (!m || !/^\d{1,3}$/.test(m[1])) {
      fejl(`perioden ${noegle} (${PERIODE_ID[noegle]}-${s}) for ${hvor} mangler eller har et uventet format`
        + `${m ? ` («${m[1]}»)` : ''}.`);
    }
    return Number(m[1]);
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
 * spilles kun ved uafgjort efter 60, og straffekast kun ved uafgjort efter
 * forlængelsen. Er der spillet forlængelse fra en stilling, der ikke var lige,
 * er halvlegene læst forkert, og så må knockout-facit (= efter60) ikke bruges.
 */
function tjekEfter60(p, efter60, hvor) {
  const forlaenget = !nul(p.ot1) || !nul(p.ot2);
  if ((forlaenget || !nul(p.straffe)) && !lige(efter60)) {
    fejl(`${hvor}: der er spillet forlængelse/straffekast, men halvlegene giver ${vis(efter60)} efter 60 minutter `
      + '— ikke uafgjort. Halvlegene er læst forkert; facit efter 60 minutter bruges ikke.');
  }
  if (!nul(p.straffe) && !lige(plus(efter60, p.ot1, p.ot2))) {
    fejl(`${hvor}: der er spillet straffekast, men stillingen efter forlængelsen er `
      + `${vis(plus(efter60, p.ot1, p.ot2))} — ikke uafgjort.`);
  }
}

/**
 * En kampside (…/{konkurrence}/match-center/{id}) → kampens forløb.
 *
 * { ihfId, status, hjemme, ude, slut:{h,u}, perioder:{h1,h2,ot1,ot2,straffe},
 *   efter60:{h,u}, lokalTid, gmtTid, by, hal }
 *
 *  - slut: slutscoren INKL. forlængelse og straffekast (35:34, 39:38).
 *  - efter60: h1 + h2 — knockout-facit efter ejerens beslutning.
 *  - En ikke-spillet kamp (status 'planlagt', scoren står som 0:0) giver
 *    slut, perioder og efter60 = null.
 *
 * Kaster IhfStrukturFejl, hvis perioderne ikke summerer til slutscoren, eller
 * hvis forlængelse/straffe er spillet fra en stilling, der ikke var lige.
 */
function parseKampside(html) {
  kraevSide(html, 'match-center', 'kampside');
  const id = /data-ihf-competitions-match-results-match-id="(\d+)"/.exec(html);
  if (!id) fejl('kampsiden mangler sin kampmarkør (data-ihf-competitions-match-results-match-id).');
  const ihfId = Number(id[1]);
  const hvor = `kamp ${ihfId}`;

  const kode = /data-ihf-competitions-match-results-match-status="([^"]*)"/.exec(html);
  if (!kode) fejl(`${hvor} mangler sin status.`);
  const st = status(kode[1], hvor);

  const lokal = /class="time time-local">\s*([^<]*?)\s*</.exec(html);
  const gmt = /class="time time-gmt">\s*([^<]*?)\s*<small>\s*GMT/.exec(html);
  if (!lokal || !gmt) fejl(`${hvor} mangler sin lokale tid eller GMT-tid.`);
  const arena = /class="time time-gmt">[\s\S]*?<\/p>\s*<span>([^<]*)<\/span>/.exec(html);

  // Holdene læses KUN i resultatkortet: andre «country»-felter på siden (fx en
  // nabokamp) må ikke blive til kampens hold. Mangler kortet, ville indexOf give
  // -1 og slice(-1) sidste tegn — og så hold = null uden et ord. Derfor kastes der.
  const kortStart = html.indexOf('resultCardBody');
  if (kortStart < 0) fejl(`${hvor} mangler sit resultatkort (resultCardBody) — holdene kan ikke læses.`);
  const hold = [...html.slice(kortStart).matchAll(/<div class="country[^"]*">\s*(?:<img[^>]*>\s*)?<span>([^<]*)<\/span>/g)]
    .slice(0, 2).map((m) => rens(m[1]));
  if (hold.length < 2 || hold.some((navn) => !navn)) {
    fejl(`${hvor}: resultatkortet har ikke to holdnavne (fandt ${JSON.stringify(hold)}).`);
  }

  const resultat = /id="result-a-b">\s*([^<]*?)\s*</.exec(html);
  if (!resultat) fejl(`${hvor} mangler sin slutscore (result-a-b).`);

  const faelles = {
    ihfId,
    status: st,
    hjemme: hold[0],
    ude: hold[1],
    ...tider(lokal[1], gmt[1], hvor),
    ...sted(arena && arena[1]),
  };

  if (st === 'planlagt') {
    if (resultat[1] !== '0:0') {
      fejl(`${hvor} er ikke spillet, men slutscoren viser «${resultat[1]}» (forventet «0:0»).`);
    }
    return { ...faelles, slut: null, perioder: null, efter60: null };
  }

  const slut = stilling(resultat[1], ':', hvor);
  const perioder = {};
  for (const noegle of Object.keys(PERIODE_ID)) perioder[noegle] = periode(html, noegle, hvor);

  const sum = plus(...Object.values(perioder));
  if (sum.h !== slut.h || sum.u !== slut.u) {
    fejl(`${hvor}: perioderne summerer til ${vis(sum)}, men slutscoren er ${vis(slut)}. `
      + 'Mindst ét tal er læst forkert; kampens facit bruges ikke.');
  }

  const efter60 = plus(perioder.h1, perioder.h2);
  tjekEfter60(perioder, efter60, hvor);

  return { ...faelles, slut, perioder, efter60 };
}

module.exports = {
  STATUS,
  PERIODE_ID,
  IhfStrukturFejl,
  parseDagside,
  parseKampside,
  konkurrenceIdAf,
  kalenderAf,
};
