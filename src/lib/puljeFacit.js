// src/lib/puljeFacit.js — HVORNÅR PULJEN ER AFGJORT, og hvad facit er.
//
// SPEJLET FIL: functions-platform/puljeFacit.js skal følges ad (CLAUDE.md), og
// pariteten er testdækket i functions-platform/puljeFacit.test.js.
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

import { harFaseKalender, faseFor, fmtFaseStart, kbhDato } from './faser';
import { puljeKonfig } from './superligaScoring';

/** Har HVER kamp mål? Liga-puljens kriterium (og kun dens). */
export function alleKampeSpillet(matches) {
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
export function facitFase(game, navn) {
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
 * Holdene i fasens kampe, eller null, når fasen ikke er HELT lagt ind:
 * kalenderen kender ikke fasen, fasen har intet `antalKampe`, der ligger et
 * andet antal kampe i dens runder, et hold mangler, eller et hold står to
 * gange. Rækkefølgen er kampenes.
 * @returns {string[]|null}
 */
export function faseHold(game, matches, navn) {
  const fase = facitFase(game, navn);
  if (!fase || !fase.antalKampe) return null;
  const kampe = (matches || []).filter((m) => {
    const r = Number(m?.round);
    return Number.isInteger(r) && r >= fase.fra && r <= fase.til;
  });
  if (kampe.length !== fase.antalKampe) return null;
  const hold = [];
  for (const m of kampe) {
    const hjemme = holdNavn(m.home);
    const ude = holdNavn(m.away);
    if (!hjemme || !ude) return null;
    hold.push(hjemme, ude);
  }
  if (new Set(hold).size !== hold.length) return null;
  return hold;
}

/**
 * Facit for en runde-pulje: holdene i facit-fasen. null for alle andre
 * puljer (de har deres egen facit-kilde) og for en fase, der ikke er klar.
 * @param {object|null} konfig  puljeKonfig(game)
 */
export function rundeFacit(konfig, game, matches) {
  if (konfig?.facitKilde !== 'runde') return null;
  return faseHold(game, matches, konfig.facitFase);
}

/**
 * DET ÉNE PRÆDIKAT: må puljen afgøres nu? Serveren afregner kun, når det er
 * sandt, og fladen viser kun facit, når det er sandt.
 * Uden konfiguration (spillet har ingen pulje) gælder liga-kriteriet — så
 * svarer serveren præcis som før for et spil uden pulje.
 */
export function puljeKanAfregnes(konfig, game, matches) {
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
export function puljeKonfigFejl(game) {
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
 * Kaldes af scripts/seed-games.mjs, der afviser HELE kørslen ved en fejl,
 * og af scripts/games.test.mjs — vagten bor her, ikke i testen, så den også
 * gælder den kørsel, der skriver (seedet skriver med merge, og merge fjerner
 * aldrig et felt: den første kørsel er den eneste gode chance).
 * @returns {string[]}
 */
export function puljeSeedFejl(game) {
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
export function puljeFaseFejl(game, matches, nowMs) {
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
export function rundePuljeDato(game, konfig) {
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
export function rundePuljeTekster(game, konfig, nowMs) {
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
