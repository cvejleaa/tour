'use strict';
// ---------------------------------------------------------------------------
// functions-platform/faseKampe.js — NÆSTE FASES KAMPE (D9).
//
// HVORFOR DEN FINDES. En turnering kender kun sin første fase, når den
// seedes: hovedrundens og knockoutfasernes kampe findes først, når holdene
// kendes. Der er ingen kilde, serveren kan hente dem fra i januar (IHF afviser
// Googles net, Highlightly har ikke VM 2027, og Wikipedias bokse for
// hovedrunde og knockout har ingen tider — planen D9 §0). Uden denne kerne
// var spillet dødt efter den indledende runde.
//
// ÉN KERNE, ALLE VEJE. I dag fodres den af knappen «📥 Læg næste fases kampe
// ind» (Admin → 🗓️ Spil-tidsplan): ejeren taster dato, tid (dansk tid) og
// vælger de to hold fra spillets holdliste. Senere kan en kilde (D8) fodre
// den samme kerne. Serveren er eneste autoritet: klienten sender kun de rå
// felter, og hver regel håndhæves her.
//
// REGLERNE (planen D9.2 — hver har sin egen røde test i faseKampe.test.js):
//   V1  spillet forventer fasekampe (forventerFaseKampe: et åbent eller
//       igangværende kampspil med gyldig fasekalender) og har en kendt sport.
//   V2  holdet findes i game.teams med en elo, der er et tal, og en entydig
//       hbKode. Navnet SKRIVES fra holdlisten — aldrig en stille 1500.
//   V3  hjemme ≠ ude, og et hold højst én gang pr. dag (også mod kampe, der
//       allerede findes) — i en KNOCKOUT-fase højst én gang i hele fasen
//       (QC på D9, Bør 1: kvartfinalerne har to dage, og Danmark på begge
//       kunne ellers oprettes og aldrig slettes i appen).
//   V4  dagen (runden) udledes af den danske dato: fase.start + dage. Det
//       forudsætter, at en fases dage ligger i træk — bundet af en test mod
//       Wikipedias program.
//   V5  kickoff ligger efter nu + låsemarginen (aldrig en kamp, der ikke kan
//       tippes, og aldrig en kamp uden kickoff).
//   V6  CREATE-ONLY: én atomisk batch af create — hele listen eller intet.
//       En eksisterende kamp overskrives aldrig.
//   V7  en dag er åben for nye kampe, indtil dens første kamp går i gang
//       (ejerens valg 3/11) — så kan Runde-Botten aldrig poste en halv dag.
//   V8  en fase får højst `antalKampe` kampe — og bliver fasen HEL ved
//       oprettelsen, skal fordelingen passe (puljeFacit.faseKampeKomplette,
//       samme regel som pulsen læser med — QC på D9, Bør 1): en forbytning
//       i hovedrunden (4/2 i stedet for 3/3) afvises, før den skrives, i
//       stedet for at blive en advarsel bagefter, som intet kan rette.
//   V9  hvert hold HAR EN KAMP i fasen før (QC B8 — ikke «har facit», så
//       hovedrunden kan tørkøres før den indledende runde er spillet). Er
//       fasen før knockout (data, ikke navnet), skal alle dens kampe have en
//       vinder (facit.kampVinder), og en kamp parrer to vindere — eller to
//       tabere, men kun når fasen rummer ALLE forrige fases hold (bronzen).
//       Dermed kan semifinalerne kun bestå af kvartfinalernes vindere.
//   V10 kamp-id'et er r{dag}-{hbKode}-{hbKode} med små bogstaver, som
//       programmet (scripts/lib/haandboldProgram.mjs) — bundet af en
//       paritetstest mod de 48 id'er i den indledende runde.
//   V11 prisen er outcomeOdds på den LEVENDE, UAFRUNDEDE Elo
//       (gameScoring.levendeElo) med sportens parametre (loftet 25 i
//       håndbold) — samme tal, recomputeSeasonElo ompriser af. Ikke
//       game.eloCurrent: den er afrundet, og så ville næste facit ompris de
//       nye kampe med småforskelle (planen §1; en afvigelse fra §11.6, sagt
//       til ejeren).
//   V12 kernen skriver KUN matches/{id} med {round, home, away, kickoff,
//       eloHome, eloAway, odds, updatedAt}. Spil-dokumentet røres ikke.
//       ÉN NAVNGIVEN UNDTAGELSE (QC B3): fuldender oprettelsen runde-puljens
//       facit-fase (semifinalerne), kaldes settlePuljeBets straks bagefter.
//       Ellers viste puljekortet «afgjort» i op til 40 timer, mens stillingen
//       manglede bonussen — at oprette en kamp udløser ingen trigger
//       (index.js: recomputeGameMatch springer over, når result er uændret).
//
// RET KICKOFF (QC B1). Kickoff er tip-låsen. En tastefejl (20:30 for 18:00)
// eller en tid, IHF flytter, ville ellers kun kunne rettes i konsollen. Samme
// kerne har derfor en rette-vej: kun på en kamp uden facit, der ikke er gået i
// gang, på samme dato (dagen må ikke skifte — id'et bærer den), med
// tør-kørsel og aftryk.
//
// UDEBLIVELSES-VAGTEN (D9.4) bor også her (faseVagtTilstand), så kernen og
// vagten er enige om, hvad en dag forventer, og hvornår den er åben.
// ---------------------------------------------------------------------------

const { createHash } = require('node:crypto');
const { forventerFaseKampe, kampVinder } = require('./facit');
const {
  harFaseKalender, faseFor, kbhDato, kortDato, rundeEtiket,
} = require('./faser');
const {
  sportProfil, ukendtSport, visSport, outcomeOdds, oddsParametre, sportOrd, puljeKonfig,
} = require('./superligaScoring');
const {
  levendeElo, LAAS_MARGIN_MS, settlePuljeBets, rundePuljeTilstand,
} = require('./gameScoring');
const { kickoffMs: kampKickoffMs, matchOutcome } = require('./pointOpdeling');
const { kampAftryk, stabil } = require('./manuelFacit');
const { faseKampeKomplette } = require('./puljeFacit');

/** Højst så mange kampe pr. kald — en fase er højst 36, og batchen tager 500. */
const MAKS_KAMPE = 48;

/** Påmindelses-jobbet kører kl. 09:00 dansk tid (index.js: '0 9 * * *'). */
const PAAMINDELSE_KL = '09:00';

/** Fejl med en HttpsError-kode — oversættes af manuelFacit.tilHttpsFejl i callablen. */
function fejl(kode, besked) {
  const e = new Error(besked);
  e.kode = kode;
  return e;
}

/** 'YYYY-MM-DD', og en dato der findes. */
function gyldigDato(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/** 'HH:MM' (00:00-23:59). */
function gyldigTid(s) {
  return typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

/** 'YYYY-MM-DD' + n kalenderdage (ren dato — ingen sommertid). */
function plusDage(dato, n) {
  const [y, m, d] = dato.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Antal dage fra a til b ('YYYY-MM-DD'). */
function dageMellem(a, b) {
  const ms = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((ms(b) - ms(a)) / 86_400_000);
}

/** Klokken i dansk tid, 'HH:MM'. */
function kbhKlokke(ms) {
  const dele = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Copenhagen', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(ms));
  const v = (t) => dele.find((p) => p.type === t)?.value;
  return `${v('hour')}:${v('minute')}`;
}

/**
 * Dansk dato + dansk klokkeslæt → ms. Ejeren taster det, IHF og TV viser
 * (dansk tid); serveren regner det om. null for et tidspunkt, der ikke findes
 * (forårets spring), eller for ugyldigt input. Ved efterårets dobbelttime
 * vælges den FØRSTE — så lukker tippet aldrig for sent.
 */
function kbhTilMs(dato, tid) {
  if (!gyldigDato(dato) || !gyldigTid(tid)) return null;
  for (const forskydning of ['+02:00', '+01:00']) {
    const ms = Date.parse(`${dato}T${tid}:00${forskydning}`);
    if (Number.isFinite(ms) && kbhDato(ms) === dato && kbhKlokke(ms) === tid) return ms;
  }
  return null;
}

/** "ons 20/1 kl. 18.00" — det, tør-kørslen viser, så tastningen kan kontrolleres. */
function visTid(ms) {
  return `${kortDato(ms)} kl. ${kbhKlokke(ms).replace(':', '.')}`;
}

/** Datoen (dansk) for en kalenderdag. */
function dagDato(fase, runde) {
  return plusDage(fase.start, runde - fase.fra);
}

/**
 * Hvilken dag (runde) en dansk dato er ifølge kalenderen — V4. null uden for
 * kalenderen (en hviledag mellem to faser eller en dato uden for turneringen).
 */
function rundeForDato(game, dato) {
  if (!gyldigDato(dato) || !harFaseKalender(game)) return null;
  for (const f of game.faser) {
    const i = dageMellem(f.start, dato);
    if (i >= 0 && i <= f.til - f.fra) return f.fra + i;
  }
  return null;
}

/**
 * Kampe pr. dag i en fase, UDLEDT af kalenderen (QC B2, ejerens valg 3/11):
 * antalKampe / antal dage, når det går op (hovedrunden 36/6 = 6,
 * kvartfinalerne 4/2 = 2). null, når det ikke går op (den indledende runde
 * 48/7) eller fasen intet antal har — så kender kalenderen ikke en dags
 * antal, og vagten nøjes med «mindst én kamp» og fasens total.
 */
function kampePrDag(fase) {
  if (!fase?.antalKampe) return null;
  const n = fase.antalKampe / fase.dage;
  return Number.isInteger(n) ? n : null;
}

const harFacit = (m) => matchOutcome(m) != null;

/** Kampene pr. runde. */
function perRunde(matches) {
  const ud = new Map();
  for (const m of matches || []) {
    const r = Number(m?.round);
    if (!Number.isInteger(r)) continue;
    if (!ud.has(r)) ud.set(r, []);
    ud.get(r).push(m);
  }
  return ud;
}

/**
 * Er dagen ÅBEN for nye kampe? V7: indtil dens første kamp går i gang. En dag
 * uden kampe er åben, så længe en kamp på datoen stadig kan nå at blive tippet
 * (før midnat dansk tid minus låsemarginen).
 */
function dagAaben(dato, kampeIDagen, nowMs) {
  const kickoffs = (kampeIDagen || []).map(kampKickoffMs).filter((k) => Number.isFinite(k));
  if (kickoffs.length) return Math.min(...kickoffs) > nowMs + LAAS_MARGIN_MS;
  const slut = kbhTilMs(plusDage(dato, 1), '00:00');
  return slut != null && slut > nowMs + LAAS_MARGIN_MS;
}

/**
 * Status for HVER kalenderdag — det, både knappen og vagten bygger på (QC B7:
 * status regnes af de dage, der mangler kampe og stadig er åbne, ikke af
 * «næste fase», der fra fasens anden dag peger på den næste).
 *
 * forventet: kampePrDag, ellers 1 (mindst én kamp) — og på fasens SIDSTE dag
 * resten af fasens antal, så en fase uden et tal pr. dag stadig bliver hel.
 * @returns {Array<{runde:number, fase:object, dato:string, etiket:string, har:number,
 *   forventet:number, aaben:boolean, alarmFraMs:number}>}
 */
function dageStatus(game, matches, nowMs) {
  if (!harFaseKalender(game)) return [];
  const pr = perRunde(matches);
  const ud = [];
  for (const f of game.faser) {
    const fase = faseFor(game, f.fra);
    const fast = kampePrDag(fase);
    let foerSidste = 0;
    for (let r = fase.fra; r <= fase.til; r += 1) {
      const kampe = pr.get(r) || [];
      const sidste = r === fase.til;
      let forventet = fast ?? 1;
      if (fast == null && sidste && fase.antalKampe) forventet = Math.max(1, fase.antalKampe - foerSidste);
      foerSidste += kampe.length;
      const dato = dagDato(fase, r);
      ud.push({
        runde: r,
        fase,
        dato,
        etiket: rundeEtiket(game, r),
        har: kampe.length,
        forventet,
        aaben: dagAaben(dato, kampe, nowMs),
        alarmFraMs: kbhTilMs(plusDage(dato, -1), '12:00'),
        venterPaa: r === fase.fra ? forrigeFaseVenter(game, fase, pr) : null,
      });
    }
  }
  return ud;
}

/**
 * Kan en fases FØRSTE dag overhovedet lægges ind endnu? Ikke før fasen før er
 * afgjort — så kendes holdene ikke (QC på D9, Bør 2: hovedrundens dag 1
 * alarmerede 19/1 kl. 13.25, mens den indledende runds sidste kamp først
 * starter 20.30; kvartfinalerne ligeså). Alarmen må kun stå, mens løsningen
 * er mulig — også i startenden. Afgjort = hver kamp i fasen før har facit, og
 * ved knockout en vinder (som V9 kræver). En fase før uden kampe venter vi
 * ikke på: den har sin egen alarm. Mangler et facit længe, melder facit-vagten
 * det selv («uden facit længe efter kickoff») — så venter denne ikke tavst.
 * @returns {{fase:string, uden:number}|null} fasen før (bestemt, lille begyndelsesbogstav)
 *   og antallet af kampe uden facit — eller null, når intet ventes på
 */
function forrigeFaseVenter(game, fase, pr) {
  const foer = forrigeFase(game, fase);
  if (!foer) return null;
  const kampe = [];
  for (let r = foer.fra; r <= foer.til; r += 1) kampe.push(...(pr.get(r) || []));
  const uden = kampe.filter((m) => (foer.knockout ? kampVinder(m) == null : !harFacit(m)));
  if (!uden.length) return null;
  return { fase: foer.bestemt.toLowerCase(), uden: uden.length };
}

/** "Hovedrunde · dag 1 (ons 20/1)" — dagen, som ejeren kender den. */
function dagTekst(d) {
  return `${d.etiket} (${kortDato(Date.parse(`${d.dato}T12:00:00Z`))})`;
}

/**
 * Status til fladen (serveren tæller — klienten tæller ikke selv):
 *   faser      pr. fase: har / antalKampe
 *   aabneDage  de dage, der MANGLER kampe og stadig kan få dem (QC B7)
 *   linjer     de samme som sætninger
 */
function faseStatus(game, matches, nowMs) {
  const dage = dageStatus(game, matches, nowMs);
  const faser = [];
  for (const d of dage) {
    let f = faser.find((x) => x.navn === d.fase.navn);
    if (!f) { f = { navn: d.fase.navn, har: 0, antalKampe: d.fase.antalKampe }; faser.push(f); }
    f.har += d.har;
  }
  const aabneDage = dage.filter((d) => d.aaben && d.har < d.forventet)
    .map((d) => ({ runde: d.runde, etiket: dagTekst(d), dato: d.dato, har: d.har, forventet: d.forventet }));
  const linjer = faser
    .filter((f) => f.antalKampe && f.har < f.antalKampe)
    .map((f) => `${f.navn}: ${f.har} af ${f.antalKampe} kampe er lagt ind.`);
  if (aabneDage.length) {
    linjer.push(`Dage, der mangler kampe og stadig kan få dem: ${aabneDage.map((d) => `${d.etiket} ${d.har} af ${d.forventet}`).join('; ')}.`);
  } else if (!linjer.length) {
    linjer.push('Alle kalenderens kampe er lagt ind.');
  }
  return { faser, aabneDage, linjer };
}

/**
 * Holdlisten som opslag, med V2's krav: entydige navne, en hbKode på tre
 * store bogstaver, der er entydig (QC B9: id'et bygges af hbKode, kildens
 * nøgle — ikke af short, der i dag tilfældigvis er ens), og en elo, der er
 * et tal.
 * @returns {{perNavn:Map<string,object>, fejlFor:(navn:string)=>string|null}}
 */
function holdOpslag(game) {
  const hold = Array.isArray(game?.teams) ? game.teams.filter((t) => t && typeof t.name === 'string') : [];
  const perNavn = new Map();
  const navnTal = new Map();
  const kodeTal = new Map();
  for (const t of hold) {
    navnTal.set(t.name, (navnTal.get(t.name) || 0) + 1);
    if (typeof t.hbKode === 'string') kodeTal.set(t.hbKode, (kodeTal.get(t.hbKode) || 0) + 1);
    if (!perNavn.has(t.name)) perNavn.set(t.name, t);
  }
  function fejlFor(navn) {
    if (typeof navn !== 'string' || !navn.trim()) return 'et hold mangler';
    const t = perNavn.get(navn);
    if (!t) return `«${navn}» står ikke i spillets holdliste`;
    if (navnTal.get(navn) > 1) return `«${navn}» står ${navnTal.get(navn)} gange i spillets holdliste`;
    if (typeof t.hbKode !== 'string' || !/^[A-Z]{3}$/.test(t.hbKode)) {
      return `«${navn}» har ingen hbKode (tre store bogstaver) i spillets holdliste — kamp-id'et bygges af den`;
    }
    if (kodeTal.get(t.hbKode) > 1) return `hbKode «${t.hbKode}» står på ${kodeTal.get(t.hbKode)} hold — id'et ville være tvetydigt`;
    if (!Number.isFinite(t.elo)) return `«${navn}» har ingen elo, der er et tal — kampen ville blive prist som et ukendt hold`;
    return null;
  }
  return { perNavn, fejlFor };
}

/** Næste påmindelses-kørsel (kl. 09:00 dansk tid) efter et tidspunkt. */
function naestePaamindelseMs(nowMs) {
  const idag = kbhDato(nowMs);
  const t = kbhTilMs(idag, PAAMINDELSE_KL);
  return t != null && t > nowMs ? t : kbhTilMs(plusDage(idag, 1), PAAMINDELSE_KL);
}

/** Kampens id (V10) — som programmet: r{dag}-{hbKode}-{hbKode}, små bogstaver. */
function kampId(runde, hjemme, ude) {
  return `r${runde}-${hjemme.hbKode.toLowerCase()}-${ude.hbKode.toLowerCase()}`;
}

/** Fasen FØR en fase i kalenderen, eller null for den første. */
function forrigeFase(game, fase) {
  const i = game.faser.findIndex((f) => f.fra === fase.fra);
  return i > 0 ? faseFor(game, game.faser[i - 1].fra) : null;
}

/**
 * V9's grundlag for en fase: holdene i fasen før — og ved knockout, hvem der
 * vandt og tabte, eller hvorfor det ikke kan afgøres endnu.
 */
function forrigeFaseGrundlag(game, fase, pr) {
  const foer = forrigeFase(game, fase);
  if (!foer) return null;
  const kampe = [];
  for (let r = foer.fra; r <= foer.til; r += 1) kampe.push(...(pr.get(r) || []));
  const hold = new Set();
  for (const m of kampe) { hold.add(m.home); hold.add(m.away); }
  const g = { foer, hold, vindere: null, tabere: null, blokeret: null };
  if (!foer.knockout) return g;
  if (foer.antalKampe && kampe.length !== foer.antalKampe) {
    g.blokeret = `${foer.bestemt} er ikke lagt helt ind (${kampe.length} af ${foer.antalKampe} kampe) — ${fase.bestemt.toLowerCase()} kan først lægges ind, når alle vindere kendes`;
    return g;
  }
  const uden = kampe.filter((m) => kampVinder(m) == null);
  if (uden.length) {
    const ord = sportOrd(game).ordinaerTid;
    g.blokeret = `${foer.bestemt} er ikke afgjort: ${uden.map((m) => {
      const stod = Number.isFinite(Number(m.homeGoals)) && m.homeGoals !== null && m.homeGoals !== ''
        && Number(m.homeGoals) === Number(m.awayGoals);
      return stod ? `${m.home}–${m.away} stod lige efter ${ord} og mangler slutresultatet efter forlængelse (sæt det under ✍️)`
        : `${m.home}–${m.away} mangler facit (sæt det under ✍️)`;
    }).join('; ')}`;
    return g;
  }
  g.vindere = new Set(kampe.map(kampVinder));
  g.tabere = new Set([...hold].filter((h) => !g.vindere.has(h)));
  return g;
}

/**
 * PLANEN — ren. Hvad ville blive oprettet, hvad er galt, og hvad skal ejeren
 * vide, før han trykker? Skriver intet.
 *
 * @param {object} game  spil-dokumentet (med id)
 * @param {Array<object>} eksisterende  alle spillets kampe (med id)
 * @param {Array<{dato:string, tid:string, hjemme:string, ude:string}>} kampe
 *   dato 'YYYY-MM-DD' og tid 'HH:MM' i DANSK tid; hjemme/ude = holdnavnet fra
 *   spillets holdliste (formularens rullelister).
 * @param {number} nowMs
 * @returns {{nye:Array<object>, fejl:Array<{linje:number, tekst:string}>, advarsler:string[],
 *   status:object, aftryk:string, puljeAfgoeres:boolean}}
 */
function planFaseKampe(game, eksisterende, kampe, nowMs) {
  // V1 — hele kaldet afvises, ikke en linje.
  if (!forventerFaseKampe(game)) {
    throw fejl('failed-precondition', `«${game?.name || game?.id || '?'}» kan ikke få kampe lagt ind her: det skal være et åbent eller igangværende kampspil med en gyldig fasekalender.`);
  }
  if (ukendtSport(game)) {
    throw fejl('failed-precondition', `Spillet har sport ${visSport(game.sport)}, som ikke er en kendt sport — kampene ville blive prist som fodbold. Intet er oprettet.`);
  }
  if (!Array.isArray(kampe)) throw fejl('invalid-argument', 'Kampene mangler (en liste med dato, tid og to hold).');
  if (kampe.length > MAKS_KAMPE) throw fejl('invalid-argument', `Højst ${MAKS_KAMPE} kampe ad gangen.`);

  const alle = (eksisterende || []).filter(Boolean);
  const pr = perRunde(alle);
  const { perNavn, fejlFor } = holdOpslag(game);
  const profil = sportProfil(game);
  const { get } = levendeElo(game.teams, alle, profil);

  const fejlListe = [];
  const nye = [];
  const nyePrRunde = new Map(); // runde → [kamp]
  const grundlag = new Map(); // fase.fra → forrigeFaseGrundlag
  kampe.forEach((k, i) => {
    const linje = i + 1;
    const f = (tekst) => fejlListe.push({ linje, tekst });
    const dato = k?.dato;
    const tid = k?.tid;
    if (!gyldigDato(dato)) return f('datoen mangler eller er ugyldig');
    if (!gyldigTid(tid)) return f('tiden mangler eller er ugyldig (TT:MM, dansk tid)');
    const kickoff = kbhTilMs(dato, tid);
    if (kickoff == null) return f(`kl. ${tid} findes ikke ${dato} i dansk tid (sommertid)`);
    // V4
    const runde = rundeForDato(game, dato);
    if (runde == null) return f(`${dato} er ikke en spilledag i kalenderen`);
    const fase = faseFor(game, runde);
    // V2
    for (const navn of [k?.hjemme, k?.ude]) {
      const t = fejlFor(navn);
      if (t) return f(t);
    }
    const hjemme = perNavn.get(k.hjemme);
    const ude = perNavn.get(k.ude);
    // V3
    if (hjemme.name === ude.name) return f(`${hjemme.name} kan ikke møde sig selv`);
    // I knockout er grænsen hele fasen, ellers dagen.
    const runder = [];
    for (let r = fase.knockout ? fase.fra : runde; r <= (fase.knockout ? fase.til : runde); r += 1) runder.push(r);
    const iSamme = runder.flatMap((r) => [...(pr.get(r) || []), ...(nyePrRunde.get(r) || [])]);
    for (const t of [hjemme, ude]) {
      const mod = iSamme.find((m) => m.home === t.name || m.away === t.name);
      if (!mod) continue;
      return f(fase.knockout
        ? `${t.name} spiller allerede i ${fase.bestemt.toLowerCase()} (${mod.home}–${mod.away}, ${rundeEtiket(game, mod.round)}) — et hold spiller højst én kamp i en knockout-fase`
        : `${t.name} spiller allerede ${rundeEtiket(game, runde)}`);
    }
    // V5
    if (kickoff <= nowMs + LAAS_MARGIN_MS) return f(`${visTid(kickoff)} er passeret — en kamp skal kunne tippes, før den går i gang`);
    // V7
    if (!dagAaben(dato, pr.get(runde) || [], nowMs)) {
      return f(`${rundeEtiket(game, runde)} er gået i gang — der kan ikke lægges flere kampe ind på dagen (Runde-Botten gør dagen op, når dens kampe er afgjort). Mangler en kamp, så tal med udvikleren (konsollen).`);
    }
    // V10. V6 (create-only) har INGEN forhåndstjek her: samme id er samme
    // dag og samme to hold, og det afviser V3 ovenfor. Et ekstra «findes
    // allerede» kunne ikke nås og kunne fjernes med grøn suite (fundet ved
    // mutation) — én vagt pr. regel. Skrivningen er batch.create, der fejler
    // HELT, hvis kampen er kommet til imens.
    const id = kampId(runde, hjemme, ude);
    // V9
    if (!grundlag.has(fase.fra)) grundlag.set(fase.fra, forrigeFaseGrundlag(game, fase, pr));
    const g = grundlag.get(fase.fra);
    if (g) {
      if (g.blokeret) return f(g.blokeret);
      for (const t of [hjemme, ude]) {
        if (!g.hold.has(t.name)) return f(`${t.name} har ingen kamp i ${g.foer.bestemt.toLowerCase()}`);
      }
      if (g.vindere) {
        const vandt = (t) => g.vindere.has(t.name);
        if (vandt(hjemme) !== vandt(ude)) return f(`${hjemme.name}–${ude.name} parrer en vinder med en taber fra ${g.foer.bestemt.toLowerCase()}`);
        const rummerAlle = fase.antalKampe && 2 * fase.antalKampe >= g.hold.size;
        if (!vandt(hjemme) && !rummerAlle) {
          return f(`${hjemme.name} og ${ude.name} tabte i ${g.foer.bestemt.toLowerCase()} — kun vinderne går videre til ${fase.bestemt.toLowerCase()}`);
        }
      }
    }
    // V11
    const eloHome = get(hjemme.name);
    const eloAway = get(ude.name);
    const odds = outcomeOdds({ eloHome, eloAway, ...oddsParametre(profil) });
    const ny = {
      id, round: runde, home: hjemme.name, away: ude.name, kickoff, eloHome, eloAway, odds,
      etiket: rundeEtiket(game, runde), tid: visTid(kickoff),
    };
    if (!nyePrRunde.has(runde)) nyePrRunde.set(runde, []);
    nyePrRunde.get(runde).push(ny);
    nye.push(ny);
    return undefined;
  });

  // V8 — pr. fase, efter alle linjerne.
  const iFase = new Map();
  for (const n of nye) {
    const fase = faseFor(game, n.round);
    iFase.set(fase.navn, [...(iFase.get(fase.navn) || []), n]);
  }
  for (const [navn, liste] of iFase) {
    const fase = faseFor(game, liste[0].round);
    if (!fase.antalKampe) continue;
    let har = 0;
    for (let r = fase.fra; r <= fase.til; r += 1) har += (pr.get(r) || []).length;
    if (har + liste.length > fase.antalKampe) {
      fejlListe.push({ linje: 0, tekst: `${navn} har ${har} kampe, og ${liste.length} til giver ${har + liste.length} — kalenderen siger ${fase.antalKampe}` });
    } else if (har + liste.length === fase.antalKampe) {
      const { fejl: skaev } = faseKampeKomplette([...alle, ...liste], fase);
      if (skaev) fejlListe.push({ linje: 0, tekst: `${skaev}. Ret tastningen — en oprettet kamp kan ikke slettes i appen.` });
    }
  }

  // Det, ejeren skal vide, FØR han trykker (Spilfører på D9).
  const advarsler = [];
  const efter = [...alle, ...nye];
  const efterPr = perRunde(efter);
  if (nye.length) {
    const naeste = naestePaamindelseMs(nowMs);
    const udenPaamindelse = nye.filter((n) => n.kickoff < naeste);
    if (udenPaamindelse.length) {
      advarsler.push(`Ingen automatisk påmindelse når de nye kampe (${udenPaamindelse.map((n) => `${n.home}–${n.away} ${n.tid}`).join('; ')}): påmindelsen kører kl. 9, og den næste er efter kampstart. Send den fra Admin → 🔔 Påmindelser.`);
    }
    for (const d of dageStatus(game, efter, nowMs)) {
      if (!nyePrRunde.has(d.runde) || d.har >= d.forventet) continue;
      advarsler.push(`${dagTekst(d)}: ${d.har} af ${d.forventet} kampe efter denne oprettelse. Læg helst hele dagen ind ad gangen — Tip-siden ser færdig ud med en halv dag.`);
    }
    // Pulsen og Runde-Botten fortæller først om udskilte hold, når en fase er
    // HEL (QC på pulsen, B3a). Kun for en runde-pulje.
    const konfig = puljeKonfig(game);
    if (konfig?.facitKilde === 'runde') {
      for (const [navn, liste] of iFase) {
        const fase = faseFor(game, liste[0].round);
        if (!fase.antalKampe || navn === konfig.facitFase) continue;
        let har = 0;
        for (let r = fase.fra; r <= fase.til; r += 1) har += (efterPr.get(r) || []).length;
        if (har < fase.antalKampe) {
          advarsler.push(`${fase.navn}: ${har} af ${fase.antalKampe} efter denne oprettelse. «Stadig med»-linjen i puljen og Runde-Botten fortæller først, hvilke pulje-hold der er ude, når alle ${fase.antalKampe} er lagt ind.`);
        }
      }
    }
  }
  // QC B3: fuldender oprettelsen runde-puljens facit-fase?
  const foerTilstand = rundePuljeTilstand(game, alle, nowMs);
  const efterTilstand = rundePuljeTilstand(game, efter, nowMs);
  const puljeAfgoeres = Boolean(nye.length && foerTilstand && !foerTilstand.kan && efterTilstand?.kan);
  if (puljeAfgoeres) {
    advarsler.push(`Når du opretter disse, afgøres ${puljeKonfig(game).labels.overskrift}, og bonussen skrives på stillingen med det samme.`);
  }

  const aftryk = createHash('sha256').update(stabil({
    nye: nye.map((n) => ({
      id: n.id, round: n.round, home: n.home, away: n.away, kickoff: n.kickoff,
      odds: n.odds, eloHome: n.eloHome, eloAway: n.eloAway,
    })),
  })).digest('hex').slice(0, 32);

  return {
    nye, fejl: fejlListe, advarsler, status: faseStatus(game, alle, nowMs), aftryk, puljeAfgoeres,
  };
}

/** Kampen, som fladen viser den — aldrig kun id'et. */
function nyVisning(n) {
  return {
    id: n.id, round: n.round, etiket: n.etiket, home: n.home, away: n.away,
    kickoff: n.kickoff, tid: n.tid, odds: n.odds,
  };
}

async function hentSpil(db, gameId) {
  if (typeof gameId !== 'string' || !gameId.trim()) throw fejl('invalid-argument', 'Mangler spil-id.');
  const gameRef = db.collection('games').doc(gameId);
  const gameSnap = await gameRef.get();
  if (!gameSnap.exists) throw fejl('not-found', `Spillet "${gameId}" findes ikke.`);
  const game = { ...gameSnap.data(), id: gameId };
  const snap = await gameRef.collection('matches').get();
  return { gameRef, game, snap, matches: snap.docs.map((d) => ({ ...d.data(), id: d.id })) };
}

/**
 * Læg kampe ind — kernen bag callablen opretFaseKampe.
 *
 * dryRun: default SAND (callablen bruger dryRunFraKald). Tør-kørslen svarer
 * med planen og et aftryk; skrive-kaldet skal sende aftrykket med, og passer
 * det ikke med planen NU (et facit er sat imellem, så Elo og odds er andre;
 * en kamp er lagt ind af en anden), afvises det: «noget er ændret — vis igen».
 *
 * @param {{gameId:string, kampe:Array<object>, aftryk?:string|null, dryRun?:boolean,
 *   nowMs?:number, tilTimestamp?:(ms:number)=>*, settle?:Function}} args
 *   tilTimestamp: ms → Firestore-Timestamp (index.js). Kræves for at skrive —
 *   reglerne låser tip med `request.time < kickoff`, og et tal er ikke et tidspunkt.
 */
async function opretFaseKampeCore(db, FieldValue, {
  gameId, kampe, aftryk = null, dryRun = true, nowMs = Date.now(), tilTimestamp, settle = settlePuljeBets,
} = {}) {
  const { gameRef, game, matches } = await hentSpil(db, gameId);
  const plan = planFaseKampe(game, matches, kampe, nowMs);
  const svar = {
    dryRun, skrevet: false,
    nye: plan.nye.map(nyVisning), fejl: plan.fejl, advarsler: plan.advarsler,
    status: plan.status, aftryk: plan.aftryk, puljeAfgoeres: plan.puljeAfgoeres,
  };
  if (dryRun) return svar;

  if (plan.fejl.length) throw fejl('invalid-argument', 'Kampene har fejl — ret dem og vis igen. Intet er oprettet.');
  if (!plan.nye.length) throw fejl('invalid-argument', 'Der er ingen kampe at oprette.');
  if (aftryk !== plan.aftryk) {
    throw fejl('failed-precondition', typeof aftryk === 'string' && aftryk
      ? 'Noget er ændret siden tør-kørslen (et facit, en pris eller en kamp) — vis igen. Intet er oprettet.'
      : 'Kampene oprettes kun efter en tør-kørsel — tryk "Vis hvad der oprettes" først. Intet er oprettet.');
  }
  if (typeof tilTimestamp !== 'function') throw new Error('opretFaseKampeCore: tilTimestamp mangler — et kickoff skal skrives som et tidspunkt.');

  // V6: ÉN atomisk batch af create. Findes ét af dokumenterne (en anden admin
  // var hurtigere), fejler HELE batchen, og intet er skrevet.
  const batch = db.batch();
  for (const n of plan.nye) {
    batch.create(gameRef.collection('matches').doc(n.id), {
      round: n.round,
      home: n.home,
      away: n.away,
      kickoff: tilTimestamp(n.kickoff),
      eloHome: n.eloHome,
      eloAway: n.eloAway,
      odds: n.odds,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  try {
    await batch.commit();
  } catch (err) {
    // 6 = ALREADY_EXISTS i gRPC-koderne, som firebase-admin kaster med.
    if (err?.code === 6 || /ALREADY_EXISTS/i.test(String(err?.message))) {
      throw fejl('failed-precondition', 'En af kampene blev oprettet imens — vis igen. Intet er oprettet.');
    }
    throw err;
  }
  svar.skrevet = true;

  // V12's ENE undtagelse (QC B3): fuldendte oprettelsen puljens facit-fase,
  // afregnes puljen nu. settlePuljeBets er self-guardet og idempotent; den
  // regner på kamplisten, som den står EFTER skrivningen. Fejler den, er
  // kampene stadig oprettet — så siger svaret det, og 🎖️ Afregn puljen
  // (eller næste facit) gør resten.
  if (plan.puljeAfgoeres) {
    try {
      const efter = (await gameRef.collection('matches').get()).docs.map((d) => ({ ...d.data(), id: d.id }));
      const res = await settle(db, FieldValue, gameId, efter, { nowMs });
      svar.puljeAfregnet = { settled: res?.settled ?? 0 };
    } catch (err) {
      console.error(`opretFaseKampe(${gameId}): puljen kunne ikke afregnes efter oprettelsen:`, err?.message || err);
      svar.puljeAfregnet = { settled: 0, fejl: err?.message || String(err) };
    }
  }
  return svar;
}

/**
 * RET KICKOFF på én kamp (QC B1) — kernen bag callablen retFaseKampKickoff.
 *
 * Kun når det er sikkert:
 *   - kampen har intet facit (et facit afgør tips — dem må en tid ikke flytte),
 *   - kampen er ikke gået i gang (tips er låst, og et senere kickoff ville
 *     åbne for tip efter kampstart),
 *   - den nye tid er på SAMME dato (dagen bærer id'et og runden),
 *   - den nye tid ligger efter nu + låsemarginen — ELLER før den gamle:
 *     at flytte et kickoff TIDLIGERE kan kun lukke for tips, aldrig åbne.
 *     Er den nye tid passeret, lukkes tippet med det samme, og svaret siger,
 *     at tips afgivet efter den rigtige kampstart stadig står.
 * Tør-kørsel er standard; skrivningen kræver tør-kørslens aftryk
 * (manuelFacit.kampAftryk: facit, odds, runde og kickoff — plus den nye tid).
 */
async function retKickoffCore(db, FieldValue, {
  gameId, matchId, tid, aftryk = null, dryRun = true, nowMs = Date.now(), tilTimestamp,
} = {}) {
  const { game, snap } = await hentSpil(db, gameId);
  if (!forventerFaseKampe(game)) {
    throw fejl('failed-precondition', `«${game.name || gameId}» kan ikke få kickoff rettet her: det skal være et åbent eller igangværende kampspil med en gyldig fasekalender.`);
  }
  if (typeof matchId !== 'string' || !matchId.trim()) throw fejl('invalid-argument', 'Mangler kamp-id.');
  const kampDoc = snap.docs.find((d) => d.id === matchId);
  if (!kampDoc) throw fejl('not-found', `Kampen "${matchId}" findes ikke i "${game.name || gameId}".`);
  const kamp = { ...kampDoc.data(), id: matchId };
  if (harFacit(kamp)) throw fejl('failed-precondition', `${kamp.home}–${kamp.away} har facit — kickoff kan ikke rettes på en afgjort kamp.`);
  const gammel = kampKickoffMs(kamp);
  if (!Number.isFinite(gammel)) throw fejl('failed-precondition', `${kamp.home}–${kamp.away} har intet læseligt kickoff — det rettes i konsollen.`);
  if (gammel <= nowMs + LAAS_MARGIN_MS) {
    throw fejl('failed-precondition', `${kamp.home}–${kamp.away} er gået i gang (${visTid(gammel)}) — tips er låst. Et nyt kickoff ville åbne for tip efter kampstart.`);
  }
  if (!gyldigTid(tid)) throw fejl('invalid-argument', 'Den nye tid mangler eller er ugyldig (TT:MM, dansk tid).');
  const dato = kbhDato(gammel);
  const ny = kbhTilMs(dato, tid);
  if (ny == null) throw fejl('invalid-argument', `kl. ${tid} findes ikke ${dato} i dansk tid (sommertid).`);
  if (ny === gammel) throw fejl('invalid-argument', `${kamp.home}–${kamp.away} står allerede til ${visTid(gammel)}.`);
  // Et SENERE kickoff ligger efter det gamle, og det gamle er ikke gået i
  // gang (tjekket ovenfor) — så kan tippes. Et TIDLIGERE kan være passeret;
  // det lukker blot tippet nu. Ingen egen vagt for «senere og passeret»: den
  // kunne ikke nås (fundet ved mutation).
  const advarsler = [];
  if (ny <= nowMs + LAAS_MARGIN_MS) {
    advarsler.push(`${visTid(ny)} er passeret: tippet på kampen lukker i samme øjeblik, du skriver. Tips, der blev afgivet efter den rigtige kampstart, står stadig — de kan ikke trækkes tilbage i appen.`);
  }
  // Aftrykket binder kampen OG den nye tid (Security på D9, Bør 1): ellers
  // kunne skrive-kaldet sende en anden tid end den, tør-kørslen viste.
  const nuAftryk = createHash('sha256').update(stabil({ kamp: kampAftryk(kamp), ny })).digest('hex').slice(0, 32);
  const svar = {
    dryRun, skrevet: false, advarsler,
    kamp: { id: matchId, home: kamp.home, away: kamp.away, round: kamp.round ?? null, etiket: rundeEtiket(game, kamp.round) },
    foer: { kickoff: gammel, tid: visTid(gammel) },
    efter: { kickoff: ny, tid: visTid(ny) },
    aftryk: nuAftryk,
  };
  if (dryRun) return svar;
  if (aftryk !== nuAftryk) {
    throw fejl('failed-precondition', typeof aftryk === 'string' && aftryk
      ? 'Kampen er ændret siden tør-kørslen — vis igen. Intet er skrevet.'
      : 'Kickoff rettes kun efter en tør-kørsel — tryk "Vis rettelsen" først. Intet er skrevet.');
  }
  if (typeof tilTimestamp !== 'function') throw new Error('retKickoffCore: tilTimestamp mangler.');
  try {
    await kampDoc.ref.update(
      { kickoff: tilTimestamp(ny), updatedAt: FieldValue.serverTimestamp() },
      { lastUpdateTime: kampDoc.updateTime },
    );
  } catch (err) {
    if (err?.code === 9 || /FAILED_PRECONDITION/i.test(String(err?.message))) {
      throw fejl('failed-precondition', 'Kampen blev ændret, mens du kiggede. Intet er skrevet — vis igen.');
    }
    throw err;
  }
  svar.skrevet = true;
  return svar;
}

// ---------------------------------------------------------------------------
// UDEBLIVELSES-VAGTEN (D9.4).
//
// Ingen kilde lægger næste fase ind af sig selv — et menneske skal. Glemmer
// det, er der ingen kamp og dermed intet resultat, og intet andet maskineri
// ville opdage det. Vagten kører i times-sweep'et (facitVagt.js) for hvert
// spil, der forventer fasekampe, og melder:
//   ALARM `faseKampe` (hast «haster»), én pr. DAG (kampId 'r{dag}', QC B6 —
//     ellers dæmpede dag 8's åbne alarm meldingen om dag 9), når dagen
//     mangler kampe efter kl. 12 dagen før, OG den stadig kan få dem (QC B2:
//     en alarm må kun stå, mens løsningen er mulig). En fases FØRSTE dag
//     alarmerer desuden først, når fasen før er afgjort (forrigeFaseVenter)
//     — før det kendes holdene ikke; så står det som en linje på kortet.
//   ADVARSEL på kortet, når en dag mangler kampe og ikke længere kan få dem
//     (gået i gang eller passeret) — en aflyst kamp er en mulig, varig
//     tilstand og hører på kortet, ikke i en alarm, der mailes hver 6. time.
// ---------------------------------------------------------------------------

/**
 * @returns {{alarmer:Array<{kampId:string, besked:string}>, advarsler:string[],
 *   linjer:string[], udtoemt:boolean}}
 */
function faseVagtTilstand(game, matches, nowMs) {
  const dage = dageStatus(game, matches, nowMs);
  const navn = game?.name || game?.id || '?';
  const alarmer = [];
  const advarsler = [];
  const venter = [];
  for (const d of dage) {
    if (d.har >= d.forventet) continue;
    if (d.aaben && d.venterPaa && d.alarmFraMs != null && nowMs >= d.alarmFraMs) {
      const v = d.venterPaa;
      venter.push(`${dagTekst(d)} mangler kampe, men ${v.fase} mangler facit i ${v.uden} ${v.uden === 1 ? 'kamp' : 'kampe'} — holdene kendes ikke endnu. Alarmen går, så snart ${v.fase} er afgjort.`);
    } else if (d.aaben && d.alarmFraMs != null && nowMs >= d.alarmFraMs) {
      alarmer.push({
        kampId: `r${d.runde}`,
        besked: `«${navn}» · ${dagTekst(d)}: ${d.har} af ${d.forventet} kampe er lagt ind. `
          + 'Læg resten ind før dagens første kamp: Admin → 🗓️ Spil-tidsplan → 📥 Læg næste fases kampe ind (tør-kørsel først). '
          + 'Uden kampene kan dagen ikke tippes.',
      });
    } else if (!d.aaben && d.alarmFraMs != null && nowMs >= d.alarmFraMs) {
      advarsler.push(`${dagTekst(d)} mangler ${d.forventet - d.har} ${d.forventet - d.har === 1 ? 'kamp' : 'kampe'} (${d.har} af ${d.forventet}) og kan ikke længere få dem i appen. Er en kamp aflyst, er det i orden; ellers tal med udvikleren.`);
    }
  }
  const status = faseStatus(game, matches, nowMs);
  const linjer = [...status.linjer, ...venter];
  const naeste = dage.find((d) => d.aaben && d.har < d.forventet && d.alarmFraMs != null && nowMs < d.alarmFraMs);
  if (naeste && !alarmer.length) {
    const efterAfgjort = naeste.venterPaa ? ` — dog tidligst, når ${naeste.venterPaa.fase} er afgjort` : '';
    linjer.push(`Næste dag uden alle kampe: ${dagTekst(naeste)} — alarmen går fra ${visTid(naeste.alarmFraMs)}, hvis kampene ikke er lagt ind${efterAfgjort}.`);
  }
  return { alarmer, advarsler, linjer, udtoemt: dage.length > 0 && dage.every((d) => !d.aaben) };
}

module.exports = {
  MAKS_KAMPE, kbhTilMs, kbhKlokke, visTid, rundeForDato, kampePrDag, dageStatus, faseStatus,
  holdOpslag, naestePaamindelseMs, kampId, planFaseKampe, opretFaseKampeCore, retKickoffCore,
  faseVagtTilstand,
};
