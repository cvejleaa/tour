// ---------------------------------------------------------------------------
// functions-platform/liveMaal.js — MÅLSCORERE, MENS KAMPEN SPILLES (regnedelen).
//
// Delopgave 3 og 5 i planen for live-mål (opgave #78). `liveMaalAf` er den
// rene regnedel; `syncLiveMaalCore` er løkken, der henter incidents for kampe
// i gang og skriver `liveMaal` — kaldt hvert minut af sit EGET job
// (index.js: syncLiveMaal), aldrig af facit-synken. Kortet (delopgave 6)
// tegner feltet.
//
// EGET JOB, IKKE EN HALE PÅ MINUT-SYNKEN. Samme grund som xG-kontrakten i
// syncProviders.js: en fremmed kilde må aldrig kunne koste facit. Efter-
// facit-vejen (PR #204) er den bundne undtagelse — ét kald-sæt i det minut,
// facit lander. Dette kører HVERT minut, mens kampe spilles, så det får egen
// timeout, eget budget, eget driftlog-kort ('livemaal') og deler kun
// kredsløbsafbryderen og alarmen (`detaljerLukket`) med de andre.
//
// SAMME REGEL SOM FACIT-LISTEN, MED LIVE I FACITS ROLLE. `maalAf` udleder mål
// af stillingskæden (Sc efter hvert mål), og `kaedeOk` kræver kæden ubrudt
// 1..N pr. side — men N er her VORES levende stilling (`match.live`, skrevet
// af minut-synken), ikke slutresultatet. Er kilderne uenige om stillingen,
// skrives INTET: en liste, der modsiger tallet lige over den, er værre end
// ingen liste (Quality Control-fund: "første N i kæden" kunne vise 1–0, 2–0
// under et 1–1). Uenighed varer typisk et minut; næste kørsel heler det.
//
// ANNULLEREDE MÅL VISES, MARKERET. Ejerens beslutning (2/9): et mål, VAR
// tager tilbage, skal ikke forsvinde fra listen, det skal stå der som
// annulleret. Livescore bærer koden (IT 62, IR "VAR:…"), og hændelsen bærer
// den UÆNDREDE stilling, så den falder ud af kæden af sig selv — kæden og
// de annullerede er to lister, og kun kæden tæller mod stillingen.
//
// EGEN FROSSEN FELTLISTE. `liveMaal` står med vilje IKKE i kampDetaljer.js'
// SKRIVBARE_FELTER: facit-stien plukker af den liste, og et live-felt dér
// kunne blive skrevet af den forkerte vej. Én vagt pr. skrivesti.
// ---------------------------------------------------------------------------

const {
  maalAf, kaedeOk, heltal, fladeHaendelser, navn,
  hentJson, gyldigEid, KildenLukkerOs,
} = require('./kampDetaljer');
const { erIGang, pendingMatches } = require('./superligaSync');
const { SYNCED_GAMES } = require('./syncProviders');

/** Hændelseskoden for et annulleret mål (VAR). Se filhovedet i kampDetaljer.js. */
const ANNULLERET_IT = 62;

/**
 * Højst så mange annullerede mål pr. kamp. `maal` er bundet af kæden mod
 * vores egen stilling og kan ikke sprænges — `annullerede` tælles ikke mod
 * noget, og Security viste med en kørt PoC, at 20.000 IT-62-hændelser gav en
 * liste på 1,58 MB: over Firestores 1 MiB pr. dokument, så hele batchen
 * (flere kampe) ville fejle. Loftet står HER, hvor listen laves, ikke hos
 * den, der skriver den. 25 er langt over alt, der er set i en fodboldkamp.
 */
const ANNULLERET_LOFT = 25;

/**
 * Det eneste felt, live-stien må skrive. Bundet af en mutationstest — af
 * listens INDHOLD; selve plukket er en ækvivalent mutation, så længe `skriv`
 * kun bærer literale nøgler (samme form som forbudslisten i kampDetaljer.js).
 */
const LIVE_SKRIVBARE = Object.freeze(['liveMaal']);

/** Højst så mange kampe pr. kørsel — ét incidents-kald hver. Ejerens valg (2/9). */
const LIVE_LOFT = 10;

/**
 * Målene i en kamp, der er i gang — bundet til vores levende stilling.
 *
 * @param {object} incidents  rå svar fra incidents/soccer/{Eid}
 * @param {{home:number, away:number}} live  VORES live-stilling (match.live)
 * @returns {{maal:Array, annullerede:Array}|{afvist:'uenig'|'uparset'}}
 *
 * Returnerer med vilje IKKE stillingen. Når funktionen ikke afviser, er
 * kildens Tr1/Tr2 lig `live.home`/`live.away` pr. konstruktion, så en kopi
 * her ville være en anden skrivning af det samme tal — og to skrivninger med
 * hver sin kadence (minut-synken skriver `live`, live-mål-jobbet ville skrive
 * kopien) driver fra hinanden. Kortet læser stillingen af `match.live` og
 * tæller målene i `maal`, hvis det vil vide, om listen er nået frem til den.
 */
function liveMaalAf(incidents, live) {
  const t1 = heltal(incidents?.Tr1);
  const t2 = heltal(incidents?.Tr2);
  const lh = heltal(live?.home);
  const la = heltal(live?.away);
  if (t1 == null || t2 == null || lh == null || la == null) return { afvist: 'uenig' };
  if (t1 !== lh || t2 !== la) return { afvist: 'uenig' };

  const alle = maalAf(incidents?.Incs);
  if (!kaedeOk(alle.filter((m) => m.hold === 'home'), t1)
    || !kaedeOk(alle.filter((m) => m.hold === 'away'), t2)) return { afvist: 'uparset' };

  const maal = alle.map((m) => {
    const ud = { hold: m.hold, minut: m.minut, selvmaal: m.selvmaal === true };
    if (m.scorer != null) ud.scorer = m.scorer;
    if (m.oplaeg != null) ud.oplaeg = m.oplaeg;
    return ud;
  });

  const annullerede = [];
  for (const h of fladeHaendelser(incidents?.Incs)) {
    if (h?.IT !== ANNULLERET_IT || (h.Nm !== 1 && h.Nm !== 2)) continue;
    const minut = heltal(h.Min);
    if (minut == null) continue;
    const post = { hold: h.Nm === 1 ? 'home' : 'away', minut };
    const s = navn(h.Pn);
    if (s != null) post.scorer = s;
    annullerede.push(post);
  }
  annullerede.sort((a, b) => a.minut - b.minut);

  return { maal, annullerede: annullerede.slice(0, ANNULLERET_LOFT) };
}


/** Er de to lister ens? `at` tælles ikke med — den er tidsstemplet, ikke indholdet. */
function sammeListe(a, b) {
  const kerne = (v) => JSON.stringify({ maal: v?.maal ?? [], annullerede: v?.annullerede ?? [] });
  return kerne(a) === kerne(b);
}

/** Et kald mod livescore kan højst tage så længe (hentOpt i kampDetaljer.js). */
const { KALD_TIMEOUT_MS } = require('./kampDetaljer');

/** Jobbets timeout (index.js: syncLiveMaal). */
const LIVE_TIMEOUT_S = 60;

/**
 * Wall-clock-budget for ÉN kørsel for ÉT spil — med OVERLØBET indregnet.
 *
 * Et budget-tjek i toppen af løkken kan ikke afbryde et await, så det
 * reelle loft pr. spil er budget + ét kald (KALD_TIMEOUT_MS). Første udgave
 * tog to tredjedele af timeouten delt på spillene og glemte overløbet:
 * loftet var præcis 60 s ved to spil og 70 s ved tre — den afledte konstant
 * SKJULTE overskridelsen i stedet for at forhindre den (Security målte).
 * Nu: (timeout − N kald − 5 s til opslag og driftlog) / N. To spil: 17,5 s
 * hver, loft 55 s. Målt (scripts/maal-livescore-detaljer.mjs --live,
 * 2/9-2026): incidents 140 ms under kampen, så budgettet binder kun, når
 * kilden hænger.
 */
//
// GULV på ét kald: med seks spil eller flere bliver brøken negativ, løkken
// bryder straks, og `liveMaalNiveau` melder ok, fordi intet blev forsøgt —
// den eneste vej, Security fandt, hvor jobbet gør intet og lyser grønt.
// Gulvet gør, at der altid prøves mindst én kamp; og testen på summen
// (liveMaal.test.js) bliver rød, den dag et sjette spil kommer til, så
// LIVE_TIMEOUT_S må hæves med vilje i stedet for at budgettet krymper tavst.
const LIVE_BUDGET_MS = Math.max(KALD_TIMEOUT_MS, Math.floor(
  (LIVE_TIMEOUT_S * 1000 - SYNCED_GAMES.length * KALD_TIMEOUT_MS - 5000) / Math.max(1, SYNCED_GAMES.length),
));

/**
 * Så længe holder jobbet sig væk fra kilden efter et 429/403. Afbryderen er
 * pr. kørsel, men jobbet kommer igen næste minut — og 720 kald i døgnet mod
 * en kilde, der lige har sagt nej, er præcis det, den delte NAT ikke tåler
 * (Security). Feltet `livescoreLukketTil` på spil-dokumentet bærer pausen.
 */
const LIVE_NEDKOELING_MS = 60 * 60 * 1000;

const TOM_LIVE = Object.freeze({
  iGang: 0, valgte: 0, forsoegt: 0, skrevet: 0, uaendrede: 0,
  uenige: 0, uparsede: 0, utilgaengelige: 0, ukendte: 0, afbrudt: false,
});

/**
 * Målscorere for kampe, der er I GANG — ét incidents-kald pr. kamp, og
 * ALDRIG stage-listen.
 *
 * Kortlægningen (`livescoreEid`) er sweep'ets opgave: hele sæsonen, ét
 * stage-kald i timen (kortlaegEids). Første udgave slog id'et op HER, når
 * det manglede, og slettede det ved 404 — og Security målte, hvad det
 * kostede: én kamp, der ikke kunne kobles, gav 150 stage-kald à 260 KB pr.
 * kampvindue, fordi opslaget aldrig konvergerede. Nøjagtig den adfærd,
 * cachen blev bygget for at undgå. Så: en kamp uden gyldigt id tælles
 * "ukendt" (synligt på kortet) og får sin liste, når sweep'et har kortlagt
 * den — normalt dage før kickoff. Et id, kilden svarer 404 på, tælles
 * "kilden svarede ikke" og RØRES ikke her: sweep'et sletter og
 * genkortlægger det (opgave #82), ét kald i timen, ikke ét i minuttet.
 *
 * `only` er kampene fra pendingMatches (2,5-timers vinduet uden facit); her
 * vælges dem, der ER i gang (erIGang — samme prædikat som puls-alarmen), og
 * højst `loft` af dem. Pr. kamp: incidents → liveMaalAf mod kampens EGEN
 * live-stilling → skriv KUN ved ændring (hvert kampdokument lyttes på af
 * hver åben browser), plukket gennem LIVE_SKRIVBARE.
 *
 * Kredsløbsafbryderen (429/403) stopper kørslen — det, der allerede ligger i
 * batchen, skrives. ÉN vagt om et giftigt dokument eller et ugyldigt svar:
 * hver kamp har sin egen try, og den er den eneste. Første udgave havde en
 * indre try om liveMaalAf oveni — to vagter om samme regel, hvor den ene
 * kunne fjernes med grøn suite (Security). Den ydre dækker også et
 * `res.json()`, der kaster, og et kast fra batch.update.
 *
 * @param {{gameId:string, livescore:{land:string,liga:string},
 *          only:Array<{id:string,data:object}>, fetchFn?:Function, nowMs?:number,
 *          klokke?:Function, budgetMs?:number, loft?:number}} opts
 */
async function syncLiveMaalCore(db, FieldValue, opts = {}) {
  const tom = { ...TOM_LIVE };
  const livescore = opts.livescore;
  if (!livescore?.land || !livescore?.liga) return tom;
  const gameId = opts.gameId;
  const fetchFn = opts.fetchFn || fetch;
  const nowMs = Number.isFinite(opts.nowMs) ? opts.nowMs : Date.now();
  const klokke = typeof opts.klokke === 'function' ? opts.klokke : Date.now;
  const loft = Number.isInteger(opts.loft) && opts.loft > 0 ? opts.loft : LIVE_LOFT;
  const budgetMs = Number.isFinite(Number(opts.budgetMs)) && Number(opts.budgetMs) > 0
    ? Number(opts.budgetMs) : LIVE_BUDGET_MS;
  const udloeb = klokke() + budgetMs;

  const iGang = (opts.only || []).filter((m) => erIGang(m?.data));
  if (!iGang.length) return tom;
  const valgte = iGang.slice(0, loft);
  const ud = { ...tom, iGang: iGang.length, valgte: valgte.length };

  const matchesCol = db.collection('games').doc(gameId).collection('matches');
  const batch = db.batch();
  let iBatch = 0;
  try {
    for (const m of valgte) {
      if (klokke() >= udloeb) break;
      try {
        const eid = gyldigEid(m.data?.livescoreEid) ? m.data.livescoreEid : null;
        if (!eid) { ud.ukendte += 1; continue; }
        ud.forsoegt += 1;
        const incidents = await hentJson(`incidents/soccer/${eid}`, fetchFn);
        if (!incidents) { ud.utilgaengelige += 1; continue; }
        const svar = liveMaalAf(incidents, m.data.live);
        if (svar.afvist) {
          if (svar.afvist === 'uenig') ud.uenige += 1; else ud.uparsede += 1;
          continue;
        }
        if (sammeListe(m.data.liveMaal, svar)) { ud.uaendrede += 1; continue; }
        const skriv = { liveMaal: { maal: svar.maal, annullerede: svar.annullerede, at: nowMs } };
        // Plukket af den frosne liste — et forbudt felt kan ikke følge med.
        const plukket = {};
        for (const felt of LIVE_SKRIVBARE) {
          if (Object.hasOwn(skriv, felt)) plukket[felt] = skriv[felt];
        }
        batch.update(matchesCol.doc(m.id), plukket);
        iBatch += 1;
        ud.skrevet += 1;
      } catch (err) {
        if (err instanceof KildenLukkerOs) throw err;
        // Ét giftigt dokument eller ét ugyldigt svar koster én kamp, ikke
        // aftenen for de andre.
        ud.uparsede += 1;
        console.warn(`Live-mål ${gameId}/${m.id} sprunget over:`, err?.message || err);
      }
    }
  } catch (err) {
    if (!(err instanceof KildenLukkerOs)) throw err;
    ud.afbrudt = true;
  }
  if (iBatch > 0) await batch.commit();
  return ud;
}

/**
 * Hele kørslen for ét spil: kampene i vinduet (pendingMatches — samme opslag
 * som minut-synken, én tom range-forespørgsel uden for kampvinduet) → er
 * nogen i gang? → nedkølingen → løkken ovenfor → nedkølingen sættes, hvis
 * kilden lukkede os ude. index.js kalder KUN denne, så alt, der kan tage
 * fejl, ligger i en fil, der kan unit-testes.
 *
 * Spil-dokumentet læses KUN, når der er kampe i gang — et stille minut skal
 * ikke koste en læsning ud over den tomme forespørgsel.
 *
 * @returns kernens tal + `sprunget`/`lukketTil`, når nedkølingen gjaldt
 */
async function syncLiveMaalForSpil(db, FieldValue, opts = {}) {
  const nowMs = Number.isFinite(opts.nowMs) ? opts.nowMs : Date.now();
  const only = await pendingMatches(db, nowMs, { gameId: opts.gameId });
  const iGang = only.filter((m) => erIGang(m?.data)).length;
  if (iGang === 0) return { ...TOM_LIVE };

  const gameRef = db.collection('games').doc(opts.gameId);
  const spil = await gameRef.get();
  const lukketTil = Number(spil?.exists ? spil.data()?.livescoreLukketTil : NaN);
  if (Number.isFinite(lukketTil) && lukketTil > nowMs) {
    return { ...TOM_LIVE, iGang, sprunget: true, lukketTil };
  }

  const ud = await syncLiveMaalCore(db, FieldValue, { ...opts, nowMs, only });
  if (ud.afbrudt) {
    ud.lukketTil = nowMs + LIVE_NEDKOELING_MS;
    await gameRef.set({ livescoreLukketTil: ud.lukketTil }, { merge: true });
  }
  return ud;
}

/** Klokkeslæt i dansk tid, til kortet. */
function klokkeslaet(ms) {
  return new Intl.DateTimeFormat('da-DK', { timeZone: 'Europe/Copenhagen', hour: '2-digit', minute: '2-digit' })
    .format(new Date(ms));
}

/** Driftlog-linjen for én kørsel. Ren funktion, så INDHOLDET kan testes. */
function liveMaalLinje(d) {
  if (d.sprunget) {
    return `Live-mål: pause efter 429/403 fra kilden — ${d.iGang} kamp${d.iGang === 1 ? '' : 'e'} i gang, `
      + `prøver igen kl. ${klokkeslaet(d.lukketTil)}.`;
  }
  const dele = [`${d.iGang} kamp${d.iGang === 1 ? '' : 'e'} i gang`];
  dele.push(`${d.skrevet} liste${d.skrevet === 1 ? '' : 'r'} skrevet`);
  if (d.uaendrede) dele.push(`${d.uaendrede} uændret${d.uaendrede === 1 ? '' : 'e'}`);
  if (d.uenige) dele.push(`${d.uenige} uenige om stillingen`);
  if (d.uparsede) dele.push(`${d.uparsede} kunne ikke parses`);
  if (d.utilgaengelige) dele.push(`${d.utilgaengelige} hvor kilden ikke svarede`);
  if (d.ukendte) dele.push(`${d.ukendte} uden id hos kilden`);
  if (d.iGang > d.valgte) dele.push(`${d.iGang - d.valgte} over loftet`);
  return `Live-mål: ${dele.join(', ')}.${d.afbrudt
    ? ` Kilden lukkede os ude (429/403) — pause til kl. ${klokkeslaet(d.lukketTil ?? 0)}.` : ''}`;
}

/**
 * Hvor alvorlig var kørslen? ÉN regel, ét sted. Advarsel, når kilden lukkede
 * os ude (eller pausen efter det gælder), eller når vi prøvede og INTET kom
 * igennem — hverken nyt eller uændret. "Uenig" alene er ikke en advarsel:
 * kilderne skifter minut-forskudt, og næste kørsel heler det.
 */
function liveMaalNiveau(d) {
  if (d.afbrudt || d.sprunget) return 'advarsel';
  if (d.forsoegt > 0 && d.skrevet + d.uaendrede === 0) return 'advarsel';
  return 'ok';
}

module.exports = {
  liveMaalAf, syncLiveMaalCore, syncLiveMaalForSpil, liveMaalLinje, liveMaalNiveau, sammeListe,
  LIVE_SKRIVBARE, LIVE_LOFT, LIVE_TIMEOUT_S, LIVE_BUDGET_MS, LIVE_NEDKOELING_MS,
  ANNULLERET_IT, ANNULLERET_LOFT,
};
