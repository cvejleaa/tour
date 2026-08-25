/**
 * holdStatistik.js — tal om HOLD og om ÉN kamp.
 *
 * REN BEREGNING, ingen Firebase og ingen React: alt regnes af de kampe,
 * `useGame` allerede har live, så fladen kan bevises uden at rendere noget.
 *
 * TRE AFGØRELSER, DER ER TRUFFET ANDRE STEDER OG SOM HER SKAL HOLDES:
 *
 * 1. FAVORITTEN KOMMER AF ODDSENE, ALDRIG AF ELO. `MatchElo.jsx` viser med
 *    vilje IKKE forskellen mellem to holds rating, fordi oddsene lægger
 *    hjemmebanefordelen (`ELO.HFA`) oveni: et "hvem er stærkest" udledt af
 *    rating ville modsige de 1X2-knapper, der står lige nedenunder på samme
 *    kort. `oddsUdfald` tager derfor laveste odds og rører aldrig `eloHome`
 *    eller `eloAway`.
 *
 * 2. INGEN PROCENTER OM NAVNGIVNE ANDRE. Præcedensen står i `h2h.js` ("mål
 *    valg, ikke evne") og i `Pokaler.test.jsx` ("viser ALDRIG en procent");
 *    modstykket er `TipsHistorik`, hvor en procent OM DIG SELV er fri.
 *    `ensomRet` returnerer derfor ANTAL og navne — aldrig en rate — og den
 *    fremhæver kun dem, der havde RET. En optælling af hvem der rammer
 *    mindst, hører ikke hjemme i denne fil.
 *
 * 3. INGEN SÆSON-AGGREGATER AF ODDSENE. `recomputeSeasonElo` genpriser kun
 *    ikke-låste kampe, så spillede kampe bærer oddsene fra den model, der var
 *    gældende ved seedingen — og `ELO.DRAW_BASE` er ændret midt i en sæson.
 *    Et gennemsnit over en sæson ville blande to modeller og fremvise
 *    resultatet som modellens kalibrering. Alt her regnes PR. KAMP.
 */

import { OUTCOME, OUTCOMES } from '../../../lib/superligaScoring';

/** Er værdien et gyldigt 1X2-udfald? */
function erUdfald(x) {
  return x === OUTCOME.HOME || x === OUTCOME.DRAW || x === OUTCOME.AWAY;
}

/**
 * Runde → tidligste kendte kickoff i den runde, bygget af HELE kampprogrammet.
 *
 * Findes, fordi en kamp uden kickoff ikke kan placeres i tid af sig selv — men
 * dens naboer i samme runde kan placere den. En bagfyldt kamp uden tidsstempel
 * får dermed sin rundes tid og lander det rigtige sted i formen.
 */
function rundeTider(matches) {
  const map = new Map();
  for (const m of matches) {
    const k = Number(m?.kickoff);
    const r = Number(m?.round);
    if (!Number.isFinite(k) || !Number.isFinite(r)) continue;
    const kendt = map.get(r);
    if (kendt === undefined || k < kendt) map.set(r, k);
  }
  return map;
}

/**
 * Kronologisk nøgle for en kamp: `[lag, tid, runde]`.
 *
 * Kickoff er sandheden, når den findes — runder spilles ikke altid i
 * rækkefølge, og en udsat kamp hører hjemme dér, hvor den blev spillet.
 *
 * DEN FÆLDE, DER VAR HER FØR: uden kickoff faldt nøglen tilbage på RUNDEN, og
 * de to tal er ikke samme skala. Runde 30 er astronomisk mindre end en ægte
 * epoch (~1,69 billioner), så en kommende kamp uden tidsstempel sorterede før
 * alle spillede kampe. Fejlen var usynlig, fordi testene havde enten
 * alle-med eller alle-uden kickoff — aldrig blandet.
 *
 * Den nærliggende rettelse — "sammenlign på kickoff, når BEGGE har det, ellers
 * på runde" — er værre: den er IKKE transitiv. Med A(r2, k100), B(r8, intet)
 * og C(r30, k50) giver den C<A, A<B og B<C, altså en cyklus, og `sort` må
 * returnere hvad som helst. Derfor får hver kamp ÉN samlet nøgle:
 *
 *   lag 0 — kampen har en tid (egen kickoff, eller rundens tidligste)
 *   lag 1 — ingen af delene: runden er ikke berammet endnu, så kampen ligger
 *           i fremtiden og sorteres bagest efter rundenummer
 */
function noegle(m, rundeTid) {
  const k = Number(m?.kickoff);
  const r = Number(m?.round);
  const runde = Number.isFinite(r) ? r : 0;
  if (Number.isFinite(k)) return [0, k, runde];
  const fraRunden = Number.isFinite(r) ? rundeTid.get(r) : undefined;
  if (fraRunden !== undefined) return [0, fraRunden, runde];
  return [1, runde, runde];
}

/** Sammenlign to nøgler felt for felt. Runden bryder uafgjorte tider. */
function sammenlign(a, b) {
  return (a[0] - b[0]) || (a[1] - b[1]) || (a[2] - b[2]);
}

/** Sortér kampe kronologisk, ældst først. */
function kronologisk(kampe, alle) {
  const rundeTid = rundeTider(alle);
  return kampe
    .map((m) => ({ m, k: noegle(m, rundeTid) }))
    .sort((x, y) => sammenlign(x.k, y.k))
    .map((x) => x.m);
}

/** Spiller holdet med i kampen — og i så fald hjemme eller ude? */
function siden(m, hold) {
  if (m?.home === hold) return 'hjemme';
  if (m?.away === hold) return 'ude';
  return null;
}

/**
 * Holdets kampe i DETTE spil, ældst først. Ikke "sæsonen": Premier
 * League-spillet er runde 1-18 af 38, og forårsspillet bliver et andet
 * games-dokument.
 * @param {Array<object>} matches
 * @param {string} hold – EKSAKT `name`, som kampene bruger det
 * @returns {Array<object>}
 */
export function holdetsKampe(matches, hold) {
  if (!Array.isArray(matches) || !hold) return [];
  // Rundetiderne udledes af HELE programmet, ikke kun holdets egne kampe: en
  // runde uden kickoff på holdets kamp kan sagtens have det på naboernes.
  return kronologisk(matches.filter((m) => siden(m, hold) !== null), matches);
}

/**
 * Formen: de seneste n AFGJORTE kampe, ældst først (sådan læses en formkurve
 * — V U T V V går fra venstre mod højre i tid).
 *
 * Mål tælles kun med, når BEGGE måltal findes. En kamp med facit men uden
 * måltal er en data-mangel, ikke et 0-0, og den må ikke pynte målscoren.
 * Den tæller stadig i V/U/T, for dét afgøres af `result`.
 *
 * @param {Array<object>} matches
 * @param {string} hold
 * @param {number} [n=5]
 * @returns {{raekke:Array<{matchId:string, round:number, modstander:string,
 *   hjemme:boolean, udfald:'V'|'U'|'T', maal:number|null, imod:number|null}>,
 *   v:number, u:number, t:number, maal:number, imod:number, ialt:number}}
 */
export function holdForm(matches, hold, n = 5) {
  const afgjorte = holdetsKampe(matches, hold).filter((m) => erUdfald(m?.result));
  const valgte = n > 0 ? afgjorte.slice(-n) : [];

  const raekke = valgte.map((m) => {
    const hjemme = siden(m, hold) === 'hjemme';
    const udfald = m.result === OUTCOME.DRAW ? 'U'
      : (m.result === OUTCOME.HOME) === hjemme ? 'V' : 'T';
    const egne = Number(hjemme ? m.homeGoals : m.awayGoals);
    const andres = Number(hjemme ? m.awayGoals : m.homeGoals);
    const kendt = Number.isFinite(egne) && Number.isFinite(andres);
    return {
      matchId: m.id,
      round: m.round,
      modstander: hjemme ? m.away : m.home,
      hjemme,
      udfald,
      maal: kendt ? egne : null,
      imod: kendt ? andres : null,
    };
  });

  return {
    raekke,
    v: raekke.filter((r) => r.udfald === 'V').length,
    u: raekke.filter((r) => r.udfald === 'U').length,
    t: raekke.filter((r) => r.udfald === 'T').length,
    maal: raekke.reduce((s, r) => s + (r.maal || 0), 0),
    imod: raekke.reduce((s, r) => s + (r.imod || 0), 0),
    // Grundlaget skal kunne stå på skærmen. "3-1-1" uden n er en påstand, og
    // et hold med én spillet kamp må ikke se ud som et hold med fem.
    ialt: afgjorte.length,
  };
}

/**
 * De to holds indbyrdes kampe i dette spil — også dem, der endnu ikke er
 * spillet: "de mødes igen i runde 21" er halvdelen af pointen.
 *
 * @param {Array<object>} matches
 * @param {string} a
 * @param {string} b
 * @returns {{kampe:Array<object & {afgjort:boolean}>, aVandt:number,
 *   bVandt:number, uafgjort:number, spillet:number}}
 */
export function indbyrdesHold(matches, a, b) {
  const tom = { kampe: [], aVandt: 0, bVandt: 0, uafgjort: 0, spillet: 0 };
  if (!Array.isArray(matches) || !a || !b) return tom;

  // ÉN vagt om "er det her et opgør mellem netop de to?": filteret kræver
  // BEGGE hold i samme kamp, i én af de to orienteringer. En ekstra a === b
  // vagt ovenfor stod her og var død kode — ingen kamp har samme hold på
  // begge sider, så den kunne fjernes med hele suiten grøn. Løsnes filteret
  // til `home === a || away === b`, bliver "samme hold to gange" rødt her.
  const kampe = kronologisk(
    matches.filter((m) => (m?.home === a && m?.away === b) || (m?.home === b && m?.away === a)),
    matches,
  ).map((m) => ({ ...m, afgjort: erUdfald(m?.result) }));

  let aVandt = 0;
  let bVandt = 0;
  let uafgjort = 0;
  for (const m of kampe) {
    if (!m.afgjort) continue;
    if (m.result === OUTCOME.DRAW) uafgjort += 1;
    else if ((m.result === OUTCOME.HOME) === (m.home === a)) aVandt += 1;
    else bVandt += 1;
  }
  return { kampe, aVandt, bVandt, uafgjort, spillet: aVandt + bVandt + uafgjort };
}

/**
 * Hvad sagde ODDSENE om kampen, og fik de ret?
 *
 * Favoritten er det udfald med LAVEST odds — aldrig det hold med højest Elo
 * (se afgørelse 1 øverst i filen). Deler to udfald førstepladsen, er der
 * ingen entydig favorit, og så siger vi det i stedet for at vælge det første
 * i rækkefølgen.
 *
 * `overraskelse` er oddsene på det udfald, der FALDT: jo højere, jo mere
 * uventet. Det er samme tal, spilleren fik point for, så fladen kan tale om
 * overraskelsen i den valuta, spillet allerede bruger.
 *
 * @param {object} match
 * @returns {{favorit:('1'|'X'|'2'|null), favoritOdds:(number|null),
 *   ramte:(boolean|null), overraskelse:(number|null)}}
 */
export function oddsUdfald(match) {
  const odds = OUTCOMES
    .map((o) => ({ o, v: Number(match?.odds?.[o]) }))
    .filter((x) => Number.isFinite(x.v) && x.v > 0);

  let favorit = null;
  let favoritOdds = null;
  if (odds.length) {
    const lavest = Math.min(...odds.map((x) => x.v));
    const delte = odds.filter((x) => x.v === lavest);
    if (delte.length === 1) {
      favorit = delte[0].o;
      favoritOdds = lavest;
    }
  }

  const result = erUdfald(match?.result) ? match.result : null;
  const faldt = result ? odds.find((x) => x.o === result) : null;

  return {
    favorit,
    favoritOdds,
    ramte: result && favorit ? result === favorit : null,
    overraskelse: faldt ? faldt.v : null,
  };
}

/**
 * Den ensomme ret: stod præcis ÉN i ligaen med det rigtige?
 *
 * Tager ALLE tips, også ens eget — "kun du så det komme" er den bedste
 * udgave af sætningen, og at filtrere sig selv fra ville gøre en ensom ret
 * til en tom besked hos den, der havde den.
 *
 * Returnerer navne og ANTAL, aldrig en rate, og kun for dem der RAMTE
 * (se afgørelse 2 øverst i filen). `ialt` er grundlaget, så fladen kan
 * skrive brøken frem for en procent.
 *
 * @param {Array<{uid?:string, pick?:string, name?:string}>} bets
 * @param {string} result – kampens facit
 * @returns {{ramte:Array<object>, antal:number, ialt:number, ensom:boolean,
 *   ingen:boolean}}
 */
export function ensomRet(bets, result) {
  const gyldige = (Array.isArray(bets) ? bets : []).filter((b) => erUdfald(b?.pick));
  if (!erUdfald(result)) {
    return { ramte: [], antal: 0, ialt: gyldige.length, ensom: false, ingen: false };
  }
  const ramte = gyldige.filter((b) => b.pick === result);
  return {
    ramte,
    antal: ramte.length,
    ialt: gyldige.length,
    ensom: ramte.length === 1,
    // "Ingen så den her" er kun en historie, hvis der VAR nogen til at tage
    // fejl. Uden tips er tavsheden ikke en pointe.
    ingen: gyldige.length > 0 && ramte.length === 0,
  };
}
