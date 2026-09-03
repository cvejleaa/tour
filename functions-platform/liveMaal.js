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
  hentJson, hentNoegler, noegleAfKamp, gyldigEid, KildenLukkerOs,
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
 * De eneste felter, live-stien må skrive. Bundet af en mutationstest.
 * `livescoreEid` er med, fordi løkken slår id'et op, når cachen mangler det
 * (en kamp seedet samme dag, eller et id slettet af selvhelingen), og så skal
 * næste minut ikke koste stage-listen igen.
 */
const LIVE_SKRIVBARE = Object.freeze(['liveMaal', 'livescoreEid']);

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

/**
 * Målscorere for kampe, der er I GANG — ét incidents-kald pr. kamp.
 *
 * `only` er kampene fra pendingMatches (2,5-timers vinduet uden facit); her
 * vælges dem, der ER i gang (erIGang — samme prædikat som puls-alarmen), og
 * højst `loft` af dem. Pr. kamp: cachet `livescoreEid` → incidents →
 * liveMaalAf mod kampens EGEN live-stilling → skriv KUN ved ændring (hvert
 * kampdokument lyttes på af hver åben browser).
 *
 * Stage-listen hentes KUN, når en valgt kamp mangler sit id — og så gemmes
 * det fundne id, så næste minut koster ét kald. Et cachet id, kilden svarer
 * 404/5xx på, SLETTES (opgave #82): næste minut slås det op igen, så en kamp
 * med et forældet id er tilbage inden for to minutter i stedet for at stå død
 * hele aftenen.
 *
 * Kredsløbsafbryderen (429/403) stopper kørslen — det, der allerede ligger i
 * batchen, skrives. ÉT giftigt dokument må aldrig vælte løkken for de andre
 * kampe (Security): hver kamp har sin egen try.
 *
 * @param {{gameId:string, livescore:{land:string,liga:string},
 *          only:Array<{id:string,data:object}>, fetchFn?:Function, nowMs?:number,
 *          klokke?:Function, budgetMs?:number, loft?:number}} opts
 */
async function syncLiveMaalCore(db, FieldValue, opts = {}) {
  const tom = {
    iGang: 0, valgte: 0, forsoegt: 0, skrevet: 0, uaendrede: 0,
    uenige: 0, uparsede: 0, utilgaengelige: 0, ukendte: 0, idSlettet: 0, afbrudt: false,
  };
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

  const gameRef = db.collection('games').doc(gameId);
  const matchesCol = gameRef.collection('matches');
  const batch = db.batch();
  let iBatch = 0;
  let noegler = null;
  let kodeAfNavn = null;
  try {
    // Stage-listen og holdlisten KUN, når en valgt kamp mangler id. Med fuld
    // cache (sweep'et kortlægger hele sæsonen) koster et minut N kald, ikke N+1.
    if (valgte.some((m) => !gyldigEid(m.data?.livescoreEid))) {
      if (klokke() >= udloeb) return ud;
      const gameSnap = await gameRef.get();
      const teams = gameSnap.exists ? gameSnap.data().teams : null;
      if (Array.isArray(teams) && teams.length) {
        kodeAfNavn = new Map(teams.map((t) => [t.name, t.short]));
        noegler = await hentNoegler(livescore, fetchFn);
      }
    }
    for (const m of valgte) {
      if (klokke() >= udloeb) break;
      try {
        const cached = gyldigEid(m.data?.livescoreEid) ? m.data.livescoreEid : null;
        let eid = cached;
        if (!eid && noegler && kodeAfNavn) {
          const n = noegleAfKamp(m.data, kodeAfNavn);
          eid = n ? (noegler.get(n) || null) : null;
        }
        if (!eid) { ud.ukendte += 1; continue; }
        ud.forsoegt += 1;
        const incidents = await hentJson(`incidents/soccer/${eid}`, fetchFn);
        const skriv = {};
        if (!incidents) {
          ud.utilgaengelige += 1;
          if (cached) {
            // Forældet id? Slet det — næste minut slås det op igen (#82).
            batch.update(matchesCol.doc(m.id), { livescoreEid: FieldValue.delete() });
            iBatch += 1;
            ud.idSlettet += 1;
          }
          continue;
        }
        if (!cached) skriv.livescoreEid = eid;
        let svar;
        try {
          svar = liveMaalAf(incidents, m.data.live);
        } catch {
          svar = { afvist: 'uparset' };
        }
        if (svar.afvist) {
          if (svar.afvist === 'uenig') ud.uenige += 1; else ud.uparsede += 1;
        } else if (sammeListe(m.data.liveMaal, svar)) {
          ud.uaendrede += 1;
        } else {
          skriv.liveMaal = { maal: svar.maal, annullerede: svar.annullerede, at: nowMs };
          ud.skrevet += 1;
        }
        // Plukket af den frosne liste — et forbudt felt kan ikke følge med.
        const plukket = {};
        for (const felt of LIVE_SKRIVBARE) {
          if (Object.hasOwn(skriv, felt)) plukket[felt] = skriv[felt];
        }
        if (Object.keys(plukket).length) {
          batch.update(matchesCol.doc(m.id), plukket);
          iBatch += 1;
        }
      } catch (err) {
        if (err instanceof KildenLukkerOs) throw err;
        // Ét giftigt dokument koster én kamp, ikke aftenen for de andre.
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
 * Wall-clock-budget for ÉN kørsel for ÉT spil. To tredjedele af jobbets
 * 60 s (index.js: LIVE_TIMEOUT_S), delt på spillene — afledt, ikke skrevet
 * af, så et tredje spil skrumper budgettet i stedet for at sprænge loftet.
 * Målt (scripts/maal-livescore-detaljer.mjs --live, 2/9-2026): incidents
 * 140 ms under kampen, så budgettet binder kun, når kilden hænger.
 */
const LIVE_TIMEOUT_S = 60;
const LIVE_BUDGET_MS = Math.floor(((LIVE_TIMEOUT_S * 1000) * 2) / 3 / Math.max(1, SYNCED_GAMES.length));

/**
 * Hele kørslen for ét spil: kampene i vinduet (pendingMatches — samme opslag
 * som minut-synken, én tom range-forespørgsel uden for kampvinduet) →
 * løkken ovenfor. index.js kalder KUN denne, så alt, der kan tage fejl, ligger
 * i en fil, der kan unit-testes.
 */
async function syncLiveMaalForSpil(db, FieldValue, opts = {}) {
  const nowMs = Number.isFinite(opts.nowMs) ? opts.nowMs : Date.now();
  const only = await pendingMatches(db, nowMs, { gameId: opts.gameId });
  return syncLiveMaalCore(db, FieldValue, { ...opts, nowMs, only });
}

/** Driftlog-linjen for én kørsel. Ren funktion, så INDHOLDET kan testes. */
function liveMaalLinje(d) {
  const dele = [`${d.iGang} kamp${d.iGang === 1 ? '' : 'e'} i gang`];
  dele.push(`${d.skrevet} liste${d.skrevet === 1 ? '' : 'r'} skrevet`);
  if (d.uaendrede) dele.push(`${d.uaendrede} uændret${d.uaendrede === 1 ? '' : 'e'}`);
  if (d.uenige) dele.push(`${d.uenige} uenige om stillingen`);
  if (d.uparsede) dele.push(`${d.uparsede} kunne ikke parses`);
  if (d.utilgaengelige) dele.push(`${d.utilgaengelige} hvor kilden ikke svarede`);
  if (d.idSlettet) dele.push(`${d.idSlettet} forældede id'er slettet`);
  if (d.ukendte) dele.push(`${d.ukendte} uden id hos kilden`);
  if (d.iGang > d.valgte) dele.push(`${d.iGang - d.valgte} over loftet`);
  return `Live-mål: ${dele.join(', ')}.${d.afbrudt ? ' Kilden lukkede os ude (429/403) — kørslen stoppede sig selv.' : ''}`;
}

/**
 * Hvor alvorlig var kørslen? ÉN regel, ét sted. Advarsel, når kilden lukkede
 * os ude, eller når vi prøvede og INTET kom igennem — hverken nyt eller
 * uændret. "Uenig" alene er ikke en advarsel: kilderne skifter minut-
 * forskudt, og næste kørsel heler det.
 */
function liveMaalNiveau(d) {
  if (d.afbrudt) return 'advarsel';
  if (d.forsoegt > 0 && d.skrevet + d.uaendrede === 0) return 'advarsel';
  return 'ok';
}

module.exports = {
  liveMaalAf, syncLiveMaalCore, syncLiveMaalForSpil, liveMaalLinje, liveMaalNiveau, sammeListe,
  LIVE_SKRIVBARE, LIVE_LOFT, LIVE_TIMEOUT_S, LIVE_BUDGET_MS, ANNULLERET_IT, ANNULLERET_LOFT,
};
