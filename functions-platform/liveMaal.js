// ---------------------------------------------------------------------------
// functions-platform/liveMaal.js — MÅLSCORERE, MENS KAMPEN SPILLES (regnedelen).
//
// Delopgave 3 i planen for live-mål (opgave #78). Ren funktion: ingen kald,
// ingen skrivning. Serveren (delopgave 5) henter incidents for kampe i gang
// og skriver resultatet i `liveMaal`; kortet (delopgave 6) tegner det.
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
} = require('./kampDetaljer');

/** Hændelseskoden for et annulleret mål (VAR). Se filhovedet i kampDetaljer.js. */
const ANNULLERET_IT = 62;

/** Det eneste felt, live-stien må skrive. Bundet af en mutationstest. */
const LIVE_SKRIVBARE = Object.freeze(['liveMaal']);

/**
 * Målene i en kamp, der er i gang — bundet til vores levende stilling.
 *
 * @param {object} incidents  rå svar fra incidents/soccer/{Eid}
 * @param {{home:number, away:number}} live  VORES live-stilling (match.live)
 * @returns {{maal:Array, annullerede:Array, home:number, away:number}
 *          |{afvist:'uenig'|'uparset'}}
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

  return { maal, annullerede, home: t1, away: t2 };
}

module.exports = { liveMaalAf, LIVE_SKRIVBARE, ANNULLERET_IT };
