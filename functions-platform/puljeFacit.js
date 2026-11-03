'use strict';
// functions-platform/puljeFacit.js — HVORNÅR PULJEN ER AFGJORT (CommonJS).
//
// SPEJL af src/lib/puljeFacit.js. De to filer skal følges ad (CLAUDE.md), og
// pariteten er testdækket i puljeFacit.test.js. Serveren bruger den i
// settlePuljeBets; klienten i PuljeTip og under Spil-tidsplan.
//
// ÉT PRÆDIKAT, TO ENDER. Serveren afregner puljen (settlePuljeBets), og fladen
// viser facit-kortet (PuljeTip). Spørger de hver sit, kan fladen vise et facit,
// serveren aldrig har afregnet — eller serveren afregne, mens fladen stadig
// siger "intet er afgjort". Derfor bor spørgsmålet "må puljen afgøres nu?"
// HER, og begge ender kalder `puljeKanAfregnes`.
//
// TO SLAGS PULJE.
//   En LIGA-pulje (Superligaen, Premier League) afgøres af slutstillingen, og
//   den kendes først, når hver eneste kamp har mål: `alleKampeSpillet`.
//
//   En RUNDE-pulje (`facitKilde: 'runde'`, fx "semifinalisterne") afgøres af,
//   HVILKE hold der står i en bestemt fases kampe. Her er "alle kampe har mål"
//   det FORKERTE kriterium, og det fejler begge veje: efter kvartfinalerne
//   har alle OPRETTEDE kampe mål, før semifinalerne er lagt ind (for tidligt,
//   og facit ville blive en tabel over hele turneringen) — og når
//   semifinalerne er oprettet, mangler de mål til efter finalen (for sent).
//   Kriteriet er i stedet, at facit-fasen findes i kalenderen (`game.faser`)
//   med `antalKampe`, og at netop så mange kampe ligger i fasens runder med
//   begge hold kendt. En halvt lagt fase giver intet facit.

const { harFaseKalender, faseFor, fmtFaseStart, kbhDato } = require('./faser');
const { puljeKonfig } = require('./superligaScoring');

/** Har HVER kamp mål? Liga-puljens kriterium (og kun dens). */
function alleKampeSpillet(matches) {
  const goalOf = (g) => (g == null || g === '' ? NaN : Number(g));
  return (matches || []).length > 0 && matches.every(
    (m) => Number.isFinite(goalOf(m.homeGoals)) && Number.isFinite(goalOf(m.awayGoals)),
  );
}

/**
 * Fasen, en runde-pulje afgøres af, slået op på NAVN i kalenderen.
 * Præcis én fase med navnet — to med samme navn er en tastefejl, og så hellere
 * intet facit end et gæt. null uden gyldig kalender.
 * @returns {object|null} samme form som faseFor (dag = 1)
 */
function facitFase(game, navn) {
  if (!harFaseKalender(game) || typeof navn !== 'string' || !navn.trim()) return null;
  const hits = game.faser.filter((f) => f.navn === navn.trim());
  if (hits.length !== 1) return null;
  return faseFor(game, hits[0].fra);
}

/** Holdnavnet, trimmet — eller '' for alt, der ikke er et navn. */
function holdNavn(v) {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * ER EN FASE HELT LAGT IND — og hvilke hold står i den? Kernen bag både
 * puljens facit (faseHold) og «stadig med»-pulsen (stadigMed), så de to aldrig
 * kan være uenige om, hvornår en fase er hel.
 *
 * Hel betyder: fasen har `antalKampe`, netop så mange kampe ligger i dens
 * runder, begge hold er navngivet i hver kamp — og FORDELINGEN passer:
 *   hverHoldEnGang  hvert hold præcis én gang (puljens facit-fase — reglen,
 *                   faseHold altid har haft), ellers
 *   knockout        hvert hold præcis én gang,
 *   gruppefase      hvert hold LIGE MANGE gange (32 × 3 i den indledende
 *                   runde, 24 × 3 i hovedrunden).
 * Fordelingen er QC-fundet på pulsen (B1): et delmængde-tjek fanger kun et
 * hold, der ikke var med før. Står levende Y som X (der også er med), er
 * mængden stadig rigtig — men X står 4 gange og Y 2, og så er fasen IKKE hel.
 * Restrisikoen (alle tre af Y's kampe byttet med samme Z) kan ikke ses uden
 * grupper; den er accepteret i planen.
 *
 * @returns {{hold:string[]|null, fejl:string|null}}
 *   hold: holdene i kampenes rækkefølge, når fasen er hel; ellers null.
 *   fejl: kun når ANTALLET passer, men et navn eller fordelingen ikke gør —
 *   det er en tastefejl, ikke «ikke lagt ind endnu».
 */
function faseKampeKomplette(matches, fase, { hverHoldEnGang = false } = {}) {
  const ud = { hold: null, fejl: null };
  if (!fase || !fase.antalKampe) return ud;
  const kampe = (matches || []).filter((m) => {
    const r = Number(m?.round);
    return Number.isInteger(r) && r >= fase.fra && r <= fase.til;
  });
  if (kampe.length !== fase.antalKampe) return ud;
  const antal = new Map();
  for (const m of kampe) {
    const hjemme = holdNavn(m.home);
    const ude = holdNavn(m.away);
    if (!hjemme || !ude) {
      ud.fejl = `«${fase.navn}» har ${kampe.length} kampe, men et hold mangler i en af dem`;
      return ud;
    }
    for (const h of [hjemme, ude]) antal.set(h, (antal.get(h) || 0) + 1);
  }
  const gange = [...antal.values()];
  // I en gruppefase er kravet det antal, FLEST hold har — så en forbytning
  // nævner de to skæve hold, ikke alle de andre.
  const hyppighed = new Map();
  for (const n of gange) hyppighed.set(n, (hyppighed.get(n) || 0) + 1);
  const typisk = [...hyppighed].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
  const krav = hverHoldEnGang || fase.knockout ? 1 : typisk;
  if (gange.some((n) => n !== krav)) {
    const skaev = [...antal].filter(([, n]) => n !== krav).map(([h, n]) => `${h} ${n}`);
    ud.fejl = `«${fase.navn}» har ${kampe.length} kampe, men holdene står ikke lige mange gange (${skaev.join(', ')} — forventet ${krav})`;
    return ud;
  }
  ud.hold = [...antal.keys()];
  return ud;
}

/**
 * Holdene i fasens kampe, eller null, når fasen ikke er HELT lagt ind:
 * kalenderen kender ikke fasen, fasen har intet `antalKampe`, der ligger et
 * andet antal kampe i dens runder, et hold mangler, eller et hold står to
 * gange. Rækkefølgen er kampenes.
 * @returns {string[]|null}
 */
function faseHold(game, matches, navn) {
  return faseKampeKomplette(matches, facitFase(game, navn), { hverHoldEnGang: true }).hold;
}

/**
 * «STADIG MED»-PULSEN: hvilke hold er stadig med i turneringen ifølge de
 * faser, der er HELT lagt ind? Kun for en runde-pulje uden konfigurationsfejl
 * (ellers null). Ikke point — den afgør intet.
 *
 * Reglen: et hold er med, så længe det står i den seneste HELE fase til og
 * med facit-fasen (semifinalerne). Finaledagen tæller ALDRIG — ellers blev
 * semifinaletaberne streget over, når bronzen og finalen lægges ind. Vi regner
 * ingen matematik inden i en fase (grupperne gemmes ikke, og det ville være at
 * genudlede IHF's afgørelse af vores egen håndtastede facit): pulsen halter
 * 0-3 dage efter virkeligheden, og teksten nævner derfor fasen.
 *
 * KUN FALDENDE — OG FEJLER LUKKET. Hver hel fase skal være en delmængde af
 * den forrige; står der et hold, der ikke var med, stopper den og svarer med
 * fejlen — holdene er så den sidste gode fases. Det samme ved en fase, hvis
 * antal passer, men hvis fordeling ikke gør (faseKampeKomplette). Intet
 * streges over på et forkert grundlag.
 *
 * @param {{tilRunde?:number}} [opts] kun faser, der begynder senest i den runde
 * @returns {{hold:Set<string>, fase:{navn:string, bestemt:string, fra:number}|null,
 *   fejl:string|null}|null}
 */
function stadigMed(game, matches, { tilRunde } = {}) {
  const konfig = puljeKonfig(game);
  if (konfig?.facitKilde !== 'runde' || puljeKonfigFejl(game).length) return null;
  const slut = facitFase(game, konfig.facitFase);
  let hold = new Set((Array.isArray(game.teams) ? game.teams : []).map((t) => holdNavn(t?.name)).filter(Boolean));
  let fase = null;
  for (const f of game.faser) {
    if (f.fra > slut.fra) break;
    if (Number.isInteger(tilRunde) && f.fra > tilRunde) break;
    const p = faseFor(game, f.fra);
    const { hold: s, fejl } = faseKampeKomplette(matches, p);
    if (fejl) return { hold, fase, fejl };
    if (!s) continue;
    const fremmede = s.filter((h) => !hold.has(h));
    if (fremmede.length) {
      return {
        hold,
        fase,
        fejl: `${fremmede.join(', ')} står i «${p.navn}», men ${fremmede.length === 1 ? 'var' : 'var de'} ikke med ${fase ? `i «${fase.navn}»` : 'i spillets holdliste'}`,
      };
    }
    hold = new Set(s);
    fase = { navn: p.navn, bestemt: p.bestemt, fra: p.fra };
  }
  return { hold, fase, fejl: null };
}

/**
 * Ét tips puls: hvor mange af de valgte hold er stadig med, og hvilke er ude
 * (i tippets rækkefølge). null uden puls.
 * @returns {{med:number, af:number, ude:string[]}|null}
 */
function pulsFor(picks, puls) {
  if (!puls || !Array.isArray(picks)) return null;
  const ude = picks.filter((h) => !puls.hold.has(h));
  return { med: picks.length - ude.length, af: picks.length, ude };
}

/**
 * Facit for en runde-pulje: holdene i facit-fasen. null for alle andre
 * puljer (de har deres egen facit-kilde) og for en fase, der ikke er klar.
 * @param {object|null} konfig  puljeKonfig(game)
 */
function rundeFacit(konfig, game, matches) {
  if (konfig?.facitKilde !== 'runde') return null;
  return faseHold(game, matches, konfig.facitFase);
}

/**
 * DET ÉNE PRÆDIKAT: må puljen afgøres nu? Serveren afregner kun, når det er
 * sandt, og fladen viser kun facit, når det er sandt.
 * Uden konfiguration (spillet har ingen pulje) gælder liga-kriteriet — så
 * svarer serveren præcis som før for et spil uden pulje.
 */
function puljeKanAfregnes(konfig, game, matches) {
  if (konfig?.facitKilde === 'runde') {
    // EN KONFIGURATIONSFEJL AFGØR INTET — heller ikke når fasens kampe ser
    // rigtige ud. Ellers kunne Spil-tidsplan sige «bliver aldrig afregnet»
    // (puljeKonfigFejl: forkert poolSize, et bundspørgsmål) i samme række,
    // som serveren afregnede puljen mod fasens hold (QC-fund).
    if (puljeKonfigFejl(game).length) return false;
    return rundeFacit(konfig, game, matches) != null;
  }
  return alleKampeSpillet(matches);
}

/**
 * Hvad er der galt med en runde-pulje? Tom liste = intet (også for alle andre
 * puljer og for et spil uden pulje). En fejl her betyder, at puljen ALDRIG
 * kan afgøres — og det ville ingen opdage før semifinalerne. Derfor tjekkes
 * den før seed (puljeSeedFejl, i seed-games.mjs og games.test.mjs), vises
 * under Spil-tidsplan og afgør intet (puljeKanAfregnes er falsk).
 * @returns {string[]}
 */
function puljeKonfigFejl(game) {
  const p = game?.pulje;
  if (!p || p.facitKilde !== 'runde') return [];
  const fejl = [];
  const navn = typeof p.facitFase === 'string' ? p.facitFase.trim() : '';
  if (!navn) return ['facitFase mangler — puljen ved ikke, hvilken fase der afgør den'];
  if (!harFaseKalender(game)) return [`spillet har ingen gyldig fasekalender, så fasen «${navn}» kan ikke slås op`];
  const antal = game.faser.filter((f) => f.navn === navn).length;
  if (antal === 0) return [`fasen «${navn}» findes ikke i kalenderen`];
  if (antal > 1) return [`fasen «${navn}» står ${antal} gange i kalenderen`];
  const fase = facitFase(game, navn);
  if (!fase.antalKampe) {
    fejl.push(`fasen «${navn}» har intet antalKampe, så det kan ikke afgøres, hvornår den er lagt ind`);
  } else if (puljeKonfig(game).poolSize !== 2 * fase.antalKampe) {
    // poolSize gennem normalizeren: et manglende felt er 6 dér, og det er
    // det tal, fladen beder spilleren om.
    fejl.push(`puljen beder om ${puljeKonfig(game).poolSize} hold, men «${navn}» har ${2 * fase.antalKampe} (${fase.antalKampe} kampe)`);
  }
  // Rå værdi, ikke normalizerens: den sætter nedSize til 0 for en runde-pulje,
  // og så ville en bund, nogen HAVDE skrevet ind, forsvinde uden et ord.
  if (Number(p.nedSize) > 0) fejl.push('en runde-pulje har intet bundspørgsmål (nedSize skal være 0)');
  return fejl;
}

/**
 * Hvad der forhindrer et spil i at blive SEEDET med sin pulje: puljeKonfigFejl
 * plus kravet om en EKSPLICIT puljegrænse på en runde-pulje (ejeren 2/11:
 * «ingen ny tavs default» — standarden 3 er SL/PL's). Tom liste = må seedes.
 * Kaldes af scripts/seed-games.mjs (via scripts/lib/seedGames.mjs), der afviser HELE kørslen ved en fejl,
 * og af scripts/games.test.mjs — vagten bor her, ikke i testen, så den også
 * gælder den kørsel, der skriver (seedet skriver med merge, og merge fjerner
 * aldrig et felt: den første kørsel er den eneste gode chance).
 * @returns {string[]}
 */
function puljeSeedFejl(game) {
  const fejl = puljeKonfigFejl(game);
  const v = game?.pulje?.maksStartRunde;
  if (game?.pulje?.facitKilde === 'runde' && !(Number.isInteger(v) && v >= 1)) {
    fejl.push('maksStartRunde skal sættes eksplicit på en runde-pulje (ejerens valg — håndbold-VM: 1)');
  }
  return fejl;
}

/** Er fasens startdag (dansk dato) PASSERET? På selve dagen er den ikke. */
function faseBegyndt(fase, nowMs) {
  return Boolean(fase) && Number.isFinite(nowMs) && fase.start < kbhDato(nowMs);
}

/**
 * Hvad er der galt med facit-fasens KAMPE? null = intet (også for alle andre
 * puljer, for en konfiguration med fejl — den meldes af puljeKonfigFejl — og
 * for en fase, der bare ikke er lagt ind endnu).
 *
 * HVORFOR. `faseHold` svarer null både for "ikke lagt ind endnu" og for
 * "lagt forkert ind" — tre kampe, et hold to gange, et tomt holdnavn. Den
 * første er normal, de andre er en tavs fejl: puljen afgøres aldrig, og
 * fladen bliver ved med at love en dato, der er gået (modstander-fund R4b).
 * Her skilles de ad:
 *   - for mange kampe eller et hold i to kampe er en fejl med det samme;
 *   - et manglende hold eller for få kampe er først en fejl, når fasens
 *     startdag er passeret — før dét er fasen bare ikke færdig.
 * Hver gang faseHold er null EFTER startdagen, giver denne en grund
 * (puljeFacit.test.js beviser det på en matrix).
 * @returns {string|null}
 */
function puljeFaseFejl(game, matches, nowMs) {
  const konfig = puljeKonfig(game);
  if (konfig?.facitKilde !== 'runde' || puljeKonfigFejl(game).length) return null;
  const fase = facitFase(game, konfig.facitFase);
  const navn = `«${fase.navn}»`;
  const kampe = (matches || []).filter((m) => {
    const r = Number(m?.round);
    return Number.isInteger(r) && r >= fase.fra && r <= fase.til;
  });
  if (kampe.length > fase.antalKampe) {
    return `${navn} har ${kampe.length} kampe, men kalenderen siger ${fase.antalKampe}`;
  }
  const set = new Set();
  let udenHold = 0;
  for (const m of kampe) {
    for (const h of [holdNavn(m.home), holdNavn(m.away)]) {
      if (!h) { udenHold += 1; continue; }
      if (set.has(h)) return `${h} står i to kampe i ${navn}`;
      set.add(h);
    }
  }
  if (!faseBegyndt(fase, nowMs)) return null;
  const dato = fmtFaseStart(fase.start);
  if (udenHold) return `${navn} skulle være begyndt ${dato}, men ${udenHold === 1 ? 'et hold mangler' : `${udenHold} hold mangler`} i fasens kampe`;
  if (kampe.length < fase.antalKampe) {
    return `${navn} skulle være begyndt ${dato}, men kun ${kampe.length} af ${fase.antalKampe} kampe er lagt ind`;
  }
  return null;
}

const ANTAL_ORD = ['nul', 'ét', 'to', 'tre', 'fire', 'fem', 'seks', 'syv', 'otte', 'ni', 'ti'];

/** "fire" for 4 — tallet med bogstaver op til ti, ellers cifre. */
function antalOrd(n) {
  return Number.isInteger(n) && n >= 0 && n < ANTAL_ORD.length ? ANTAL_ORD[n] : String(n);
}

/**
 * Teksterne for en RUNDE-pulje ("hvem når semifinalerne?"), afledt af
 * KALENDEREN — fasens bestemte form og dens startdato står ét sted
 * (game.faser), og en kopi i puljens labels ville drive fra den.
 * null for alle andre puljer: så bruger fladen sine liga-tekster uændret.
 *
 *   spoergsmaal  "Hvilke fire hold når semifinalerne?"
 *   afgoeres     "Puljen afgøres, når semifinalerne er lagt ind — de spilles fredag 29. januar."
 *
 * Er fasen ikke i kalenderen (en konfigurationsfejl, som Spil-tidsplan
 * melder), lover teksten ingen dato.
 *
 * DATOEN ER ÉN FUNKTION, rundePuljeDato: "fredag 29. januar", "fra mandag
 * 20. januar" for en fase over flere dage, null uden fasen. Invitationen
 * (inviteTemplate.js) bruger den samme — den havde før sin egen kopi af
 * logikken, og intet bandt de to (modstander-bemærkning M25).
 */
function rundePuljeDato(game, konfig) {
  if (konfig?.facitKilde !== 'runde') return null;
  const fase = facitFase(game, konfig.facitFase);
  const dato = fase ? fmtFaseStart(fase.start) : '';
  if (!dato) return null;
  return `${fase.dage > 1 ? 'fra ' : ''}${dato}`;
}

/**
 * Teksterne (se ovenfor) — og med `nowMs`, når fasens startdag er PASSERET uden et facit, siger
 * teksten det i stedet for at love en dato, der er gået (modstander-fund R4b):
 *   "Puljen afgøres, når semifinalerne er lagt ind — de skulle være begyndt fredag 29. januar."
 * Kalderen giver kun `nowMs`, når facit IKKE findes (PuljeTip): med facit er
 * fasen lagt ind, og sætningen er bare reglen.
 */
function rundePuljeTekster(game, konfig, nowMs) {
  if (konfig?.facitKilde !== 'runde') return null;
  const fase = facitFase(game, konfig.facitFase);
  const ord = konfig.labels.top;
  const dato = rundePuljeDato(game, konfig);
  let afgoeres = `Puljen afgøres, når ${ord} er lagt ind.`;
  if (dato && faseBegyndt(fase, nowMs)) {
    afgoeres = `Puljen afgøres, når ${ord} er lagt ind — de skulle være begyndt ${fmtFaseStart(fase.start)}.`;
  } else if (dato) {
    afgoeres = `Puljen afgøres, når ${ord} er lagt ind — de spilles ${dato}.`;
  }
  return {
    spoergsmaal: `Hvilke ${antalOrd(konfig.poolSize)} hold når ${ord}?`,
    afgoeres,
  };
}

module.exports = {
  alleKampeSpillet, facitFase, faseHold, rundeFacit, puljeKanAfregnes, puljeKonfigFejl, puljeSeedFejl,
  puljeFaseFejl, faseKampeKomplette, stadigMed, pulsFor, antalOrd,
  rundePuljeDato, rundePuljeTekster,
};
