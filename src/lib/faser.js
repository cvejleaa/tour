// src/lib/faser.js — TURNERINGENS FASEKALENDER: hvad en runde hedder, hvor
// mange der er, og om der kommer flere.
//
// SPEJLET FIL: functions-platform/faser.js skal følges ad (CLAUDE.md), og
// pariteten er testdækket i functions-platform/faser.test.js.
//
// HVORFOR EN KALENDER. I en liga er "runde 7" et ord, alle forstår, og den
// sidste OPRETTEDE runde er også sæsonens sidste. I en turnering er ingen af
// delene sandt: "runde" er et fase-ord i dansk håndbold (hovedrunden), og
// kampene til en fase findes først, når holdene kendes. Tælleren sagde derfor
// "Runde 6 af 6" efter den indledende runde, og Runde-Botten læste en manglende
// næste runde som "sæsonen er slut" (QC, blokerende fund 1-2).
//
// `game.faser` er ÉN kilde for fire spørgsmål, der før havde hver sit gæt:
//   (a) hvad en dag hedder        → rundeEtiket  ("Indledende runde · dag 2")
//   (b) hvor mange dage der er    → dagTaeller   ("Dag 7 af 17")
//   (c) at en fase kommer, selv om dens kampe ikke findes endnu
//                                 → ventendeRunde, naesteKalenderRunde, naesteFase
//   (d) om en runde er knockout   → erKnockout
// En kamp får INTET fase- eller knockout-felt: det udledes af `round`.
//
// FORMEN (seedes fra scripts/games.mjs):
//   faser: [{ navn, bestemt?, fra, til, start, knockout?, antalKampe? }, …]
//     navn       'Hovedrunde'   — ubestemt form, står i etiketten
//     bestemt    'Hovedrunden'  — bestemt form til sætninger ("… lægges ind").
//                Dansk bøjning kan ikke udledes ('Kvartfinaler' → 'Kvartfinalerne'),
//                så den skrives; mangler den, bruges navn.
//     fra, til   runde-numre (= spilledage). Første fase starter i 1, og hver
//                fase starter dagen efter, den forrige sluttede — ingen huller,
//                intet overlap. Ellers passer "Dag 7 af 17" ikke.
//     start      'YYYY-MM-DD', fasens første spilledag (dansk dato). Den eneste
//                dato, kalenderen kender: dagene inden i en fase ligger ikke
//                fast (hviledage), så en kamps dato kommer fra dens kickoff.
//                Men de ligger ikke TÆTTERE end én runde pr. dag (se
//                formkontrollen), så næste fase kan tidligst starte forrige
//                fases start + dens antal dage.
//     knockout   true for udslagsfaser.
//     antalKampe forventet antal kampe i fasen (til D9 og puljen).
//
// UDEN `faser` (Superligaen, Premier League) — eller med en kalender, der ikke
// består formkontrollen — giver hver funktion PRÆCIS dagens tekst ("Runde N",
// "Runde N af M"). En halvt skrevet kalender må ikke give halvt rigtige tal;
// så hellere de gamle. Gaten er evnen `harFaseKalender`, ikke sporten.

const FASE_NOEGLER = ['navn', 'bestemt', 'fra', 'til', 'start', 'knockout', 'antalKampe'];

const UGEDAG_KORT = ['søn', 'man', 'tir', 'ons', 'tor', 'fre', 'lør'];
const UGEDAG_LANG = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
const MAANED = ['januar', 'februar', 'marts', 'april', 'maj', 'juni', 'juli', 'august',
  'september', 'oktober', 'november', 'december'];

/** 'YYYY-MM-DD', og en dato der findes (ikke 2027-02-30). */
function gyldigDato(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/** 'YYYY-MM-DD' + n kalenderdage (UTC-regning på en ren dato — ingen sommertid). */
function plusDage(dato, n) {
  const [y, m, d] = dato.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/**
 * Hvad er der galt med kalenderen? Tom liste = intet. Bruges af
 * scripts/games.test.mjs (før seed) og af `harFaseKalender` (ved hver læsning).
 * @param {unknown} faser
 * @returns {string[]}
 */
export function faseKalenderFejl(faser) {
  if (!Array.isArray(faser) || faser.length === 0) return ['faser skal være en ikke-tom liste'];
  const fejl = [];
  let forrige = null;
  faser.forEach((f, i) => {
    const hvor = `fase ${i + 1}`;
    if (!f || typeof f !== 'object' || Array.isArray(f)) {
      fejl.push(`${hvor}: ikke et objekt`);
      forrige = null;
      return;
    }
    for (const k of Object.keys(f)) {
      if (!FASE_NOEGLER.includes(k)) fejl.push(`${hvor}: ukendt nøgle "${k}"`);
    }
    if (typeof f.navn !== 'string' || !f.navn.trim()) fejl.push(`${hvor}: navn mangler`);
    if (f.bestemt !== undefined && (typeof f.bestemt !== 'string' || !f.bestemt.trim())) {
      fejl.push(`${hvor}: bestemt skal være en tekst`);
    }
    const fraOk = Number.isInteger(f.fra) && f.fra >= 1;
    if (!fraOk) fejl.push(`${hvor}: fra skal være et rundenummer ≥ 1`);
    if (!(Number.isInteger(f.til) && fraOk && f.til >= f.fra)) fejl.push(`${hvor}: til skal være et rundenummer ≥ fra`);
    if (!gyldigDato(f.start)) fejl.push(`${hvor}: start skal være en dato (YYYY-MM-DD)`);
    if (f.knockout !== undefined && typeof f.knockout !== 'boolean') fejl.push(`${hvor}: knockout skal være true/false`);
    if (f.antalKampe !== undefined && !(Number.isInteger(f.antalKampe) && f.antalKampe > 0)) {
      fejl.push(`${hvor}: antalKampe skal være et positivt heltal`);
    }
    if (i === 0 && fraOk && f.fra !== 1) fejl.push(`${hvor}: første fase skal starte i runde 1 (ikke ${f.fra})`);
    if (forrige) {
      if (fraOk && Number.isInteger(forrige.til) && f.fra !== forrige.til + 1) {
        fejl.push(`${hvor}: starter i runde ${f.fra}, men forrige fase sluttede i runde ${forrige.til} — ingen huller eller overlap`);
      }
      // ÉN RUNDE PR. DAG. Kalenderen FORUDSÆTTER, at en runde er én
      // spilledag ("Dag 7 af 17"), så en fase på 7 runder fra 20/1 har sin
      // sidste dag tidligst 26/1, og næste fase kan tidligst starte 27/1. En
      // fase fra 21/1 efter den ville være en tastefejl i enten `start` eller
      // `til` — og ventelinjen ville love en dato midt i forrige fase.
      // Hviledage er tilladt (senere start), tætpakning er ikke. Kontrollen
      // dækker også "start skal stige", for hver fase har mindst én dag. Er
      // forrige fases fra/til ugyldige, er det allerede meldt ovenfor.
      const forrigeOk = Number.isInteger(forrige.fra) && Number.isInteger(forrige.til) && forrige.til >= forrige.fra;
      if (forrigeOk && gyldigDato(f.start) && gyldigDato(forrige.start)) {
        const dageFoer = forrige.til - forrige.fra + 1;
        const tidligst = plusDage(forrige.start, dageFoer);
        if (f.start < tidligst) {
          fejl.push(`${hvor}: start ${f.start} ligger før ${tidligst} — forrige fase har ${dageFoer} ${dageFoer === 1 ? 'dag' : 'dage'} fra ${forrige.start} (én runde pr. dag)`);
        }
      }
    }
    forrige = f;
  });
  return fejl;
}

// Kalenderen slås op ved hver gentegning af Tip-fladen — formkontrollen huskes
// pr. liste. WeakMap: et nyt spil-dokument giver en ny liste og en ny kontrol.
const gyldigCache = new WeakMap();

/** EVNEN: har spillet en gyldig fasekalender? Alle flader gater på den. */
export function harFaseKalender(game) {
  const faser = game?.faser;
  if (!Array.isArray(faser)) return false;
  if (!gyldigCache.has(faser)) gyldigCache.set(faser, faseKalenderFejl(faser).length === 0);
  return gyldigCache.get(faser);
}

/**
 * HAR SPILLET EN KALENDER, DER IKKE TÆLLER? `harFaseKalender` falder med vilje
 * tilbage til ligaens tekster — men tavst var det farligt: botten ville sige
 * "sæsonen er slut" efter den indledende runde, og ingen ville se hvorfor.
 *   null      → spillet har intet `faser`-felt (en liga: intet at advare om),
 *               eller kalenderen er gyldig.
 *   [fejl…]   → formkontrollens fejl. Serveren logger dem (Runde-Botten), og
 *               admin ser dem under Spil-tidsplan.
 */
export function faseKalenderAdvarsel(game) {
  if (game?.faser == null) return null;
  if (harFaseKalender(game)) return null;
  return faseKalenderFejl(game.faser);
}

/** Kalenderens sidste runde (sidste fases `til`), eller null uden kalender. */
export function sidsteKalenderRunde(game) {
  if (!harFaseKalender(game)) return null;
  return game.faser[game.faser.length - 1].til;
}

/**
 * Fasen, en runde hører til — med dagens nummer inden i fasen.
 * @returns {{navn:string, bestemt:string, fra:number, til:number, start:string,
 *   knockout:boolean, antalKampe:number|null, dag:number, dage:number, nummer:number}|null}
 */
export function faseFor(game, round) {
  if (!harFaseKalender(game) || !Number.isInteger(round)) return null;
  const i = game.faser.findIndex((f) => round >= f.fra && round <= f.til);
  if (i < 0) return null;
  const f = game.faser[i];
  return {
    navn: f.navn,
    bestemt: f.bestemt || f.navn,
    fra: f.fra,
    til: f.til,
    start: f.start,
    knockout: f.knockout === true,
    antalKampe: Number.isInteger(f.antalKampe) ? f.antalKampe : null,
    dag: round - f.fra + 1,
    dage: f.til - f.fra + 1,
    nummer: i + 1,
  };
}

/** Er runden en knockout-runde? Uden kalender: aldrig. */
export function erKnockout(game, round) {
  return faseFor(game, round)?.knockout === true;
}

/** Navneordet for en runde: 'runde' (liga) eller 'dag' (turnering). */
export function rundeNavneord(game) {
  return harFaseKalender(game) ? 'dag' : 'runde';
}

/** Flertal: 'runder' (liga) eller 'dage' (turnering). */
export function rundeFlertal(game) {
  return harFaseKalender(game) ? 'dage' : 'runder';
}

/** Kort form med stort: "Runde 7" / "Dag 7". Til knapper og kolonner. */
export function rundeKort(game, round) {
  return harFaseKalender(game) ? `Dag ${round}` : `Runde ${round}`;
}

/** Kort form inde i en sætning: "runde 7" / "dag 7". */
export function rundeOrd(game, round) {
  return `${rundeNavneord(game)} ${round}`;
}

/**
 * Kolonne-overskriften for en runde, hvor pladsen er knap: "R7" (liga) /
 * "Dag 7" (turnering). "R7" er en forkortelse af et ord, ingen bruger i en
 * turnering ("runde" er et fase-ord dér), og "D7" kan ingen tyde. Uden
 * kalender: præcis som før.
 */
export function rundeKolonne(game, round) {
  return harFaseKalender(game) ? `Dag ${round}` : `R${round}`;
}

// Ordene i en sætning om runder. Frosset: listen deles af alle kald.
// Forholdsordet følger med ("i runden", men "på dagen") — det kan ikke
// sættes foran et ord, der skifter.
const ORDENE_LIGA = Object.freeze({
  runde: 'runde', runden: 'runden', rundens: 'rundens', runder: 'runder', runderne: 'runderne',
  Runde: 'Runde', Runden: 'Runden', Rundens: 'Rundens', saesonen: 'sæsonen', saesonens: 'sæsonens',
  i: 'i', iRunden: 'i runden', iDenneRunde: 'i denne runde',
});
const ORDENE_TURNERING = Object.freeze({
  runde: 'dag', runden: 'dagen', rundens: 'dagens', runder: 'dage', runderne: 'dagene',
  Runde: 'Dag', Runden: 'Dagen', Rundens: 'Dagens', saesonen: 'turneringen', saesonens: 'turneringens',
  i: 'på', iRunden: 'på dagen', iDenneRunde: 'på denne dag',
});

/**
 * Ordene for "runde" i alle de bøjninger, en sætning skal bruge — og hvad
 * hele forløbet hedder ("sæsonen" / "turneringen"). Dansk bøjning kan ikke
 * udledes af grundformen, så de står skrevet. Uden kalender: ligaens ord,
 * præcis som teksterne altid har stået.
 * @returns {runde:string, runden:string, rundens:string, runder:string, runderne:string,
 *   Runde:string, Runden:string, Rundens:string, saesonen:string, saesonens:string,
 *   i:string, iRunden:string, iDenneRunde:string}
 *   `i` er forholdsordet alene («i»/«på»); `iRunden` og `iDenneRunde` er
 *   færdige led med forholdsord («i runden»/«på dagen», «i denne runde»/«på denne dag»).
 */
export function rundeOrdene(game) {
  return harFaseKalender(game) ? ORDENE_TURNERING : ORDENE_LIGA;
}

/**
 * Har turneringen knockout-faser? Til tekster, der gælder HELE spillet
 * (invitationen, guiden) — en enkelt kamp spørger erKnockout(game, round).
 */
export function harKnockout(game) {
  return harFaseKalender(game) && game.faser.some((f) => f.knockout === true);
}

/** Copenhagen-datoen for et tidspunkt som [år, måned (1-12), dag, ugedag (0=søn)]. */
function kbhDel(ms) {
  const dele = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Copenhagen', year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short',
  }).formatToParts(new Date(ms));
  const v = (type) => dele.find((p) => p.type === type)?.value;
  const ugedag = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(v('weekday'));
  return [Number(v('year')), Number(v('month')), Number(v('day')), ugedag];
}

/** "tor 14/1" — dansk ugedag og dato for et kickoff (dansk tid). */
export function kortDato(ms) {
  if (!Number.isFinite(ms)) return '';
  const [, m, d, u] = kbhDel(ms);
  return `${UGEDAG_KORT[u]} ${d}/${m}`;
}

/** 'YYYY-MM-DD' for dagen, et tidspunkt falder på i dansk tid. */
export function kbhDato(ms) {
  const [y, m, d] = kbhDel(ms);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** "søndag 18. januar" — en fases startdato i en sætning. */
export function fmtFaseStart(start) {
  if (!gyldigDato(start)) return '';
  const [y, m, d] = start.split('-').map(Number);
  const u = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${UGEDAG_LANG[u]} ${d}. ${MAANED[m - 1]}`;
}

/**
 * Hvad runden hedder.
 *   uden kalender:  "Runde 7"                         (præcis som før)
 *   med kalender:   "Indledende runde · dag 2"        (fase over flere dage)
 *                   "Finaledag"                       (fase på én dag)
 *                   + " · tor 14/1", når kickoffMs gives
 *   uden for den:   "Dag 18"                          (bør ikke ske; data-fejl)
 * @param {object} game
 * @param {number} round
 * @param {number} [kickoffMs] rundens første kickoff — giver datoen med
 */
export function rundeEtiket(game, round, kickoffMs) {
  if (!harFaseKalender(game)) return `Runde ${round}`;
  const f = faseFor(game, round);
  if (!f) return `Dag ${round}`;
  const navn = f.dage > 1 ? `${f.navn} · dag ${f.dag}` : f.navn;
  return Number.isFinite(kickoffMs) ? `${navn} · ${kortDato(kickoffMs)}` : navn;
}

/**
 * Tælleren over rundevælgeren.
 *   uden kalender: "Runde 7 af 22"  — nævneren er sidste OPRETTEDE runde (som før)
 *   med kalender:  "Dag 7 af 17"    — nævneren er KALENDERENS sidste dag, så
 *                  den ikke siger "6 af 6", før hovedrunden er lagt ind.
 */
export function dagTaeller(game, round, sidsteOprettede) {
  if (!harFaseKalender(game)) return `Runde ${round} af ${sidsteOprettede}`;
  return `Dag ${round} af ${sidsteKalenderRunde(game)}`;
}

/**
 * Næste runde ifølge kalenderen — også når dens kampe ikke er oprettet.
 * null, når kalenderen er udtømt, eller når spillet ikke har en.
 */
export function naesteKalenderRunde(game, round) {
  const sidste = sidsteKalenderRunde(game);
  if (sidste == null || !Number.isInteger(round)) return null;
  return round + 1 <= sidste ? round + 1 : null;
}

/**
 * Den runde, der VENTER: kalenderens næste efter den sidst oprettede. Findes
 * den, er turneringen ikke slut — dens kampe er bare ikke lagt ind endnu.
 * Kræver en OPRETTET runde (heltal ≥ 1): uden kampe har Tip intet at stå på
 * (den viser "ingen kampe" før dette kaldes), så der er ingen "før dag 1"-tekst.
 * @returns {{runde:number, fase:object, foersteDag:boolean}|null}
 */
export function ventendeRunde(game, sidsteOprettede) {
  if (!Number.isInteger(sidsteOprettede) || sidsteOprettede < 1) return null;
  const runde = naesteKalenderRunde(game, sidsteOprettede);
  if (runde == null) return null;
  const fase = faseFor(game, runde);
  return { runde, fase, foersteDag: fase.dag === 1 };
}

/**
 * Teksten på Tip, når der ikke er flere kampe at tippe, men kalenderen siger,
 * at der kommer flere. null, når der ikke venter noget (eller ingen kalender).
 *   "Hovedrunden lægges ind, så snart holdene kendes. Første kamp søndag 18. januar."
 * Er fasens startdag passeret, lover teksten ikke en dato, der er gået.
 */
export function ventetekst(game, sidsteOprettede, nowMs) {
  const v = ventendeRunde(game, sidsteOprettede);
  if (!v) return null;
  if (!v.foersteDag) {
    return `${v.fase.navn} · dag ${v.fase.dag} lægges ind, så snart kampene er klar.`;
  }
  const dato = fmtFaseStart(v.fase.start);
  if (Number.isFinite(nowMs) && v.fase.start < kbhDato(nowMs)) {
    return `${v.fase.bestemt} skulle være begyndt ${dato}, men kampene er ikke lagt ind endnu.`;
  }
  return `${v.fase.bestemt} lægges ind, så snart holdene kendes. Første kamp ${dato}.`;
}

/**
 * Kalenderens næste fase set fra et tidspunkt: den første, hvis startdag
 * (dansk dato) er i dag eller senere. På startdagen er fasen stadig "næste" —
 * dens første kamp er ikke spillet. Til automatikken (D9), der skal vide,
 * hvilken fase den venter på, uden at kende de oprettede kampe.
 * @returns {object|null} samme form som faseFor (dag = 1)
 */
export function naesteFase(game, nowMs) {
  if (!harFaseKalender(game) || !Number.isFinite(nowMs)) return null;
  const idag = kbhDato(nowMs);
  const f = game.faser.find((x) => x.start >= idag);
  return f ? faseFor(game, f.fra) : null;
}
