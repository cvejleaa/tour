// ---------------------------------------------------------------------------
// scripts/lib/haandboldMaaling.mjs — målingen bag håndboldprofilen (D4).
//
// Rene funktioner over scripts/haandbold-historik.json (677 kampe fra VM/EM
// 2019-2026). scripts/maal-haandbold.mjs kører gitteret og skriver tabellerne;
// testene (haandboldMaaling.test.mjs) efterprøver, at de committede konstanter
// i SPORT_PROFILER.haandbold faktisk er det, målingen giver.
//
// HVAD DER MÅLES PÅ: `efter60` — stillingen efter ordinær tid. Det er det, der
// tippes på, også i knockout (ejerens beslutning §11.1). En kvartfinale, der
// står 30-30 efter 60 min og vindes i forlængelsen, er et X her.
//
// MODELLEN ER SPILLETS EGEN. Elo opdateres med updateElo, og sandsynlighederne
// kommer af outcomeProbabilities — de samme funktioner, seed og server bruger.
// En måling med sin egen formel kunne finde tal, der passer til en anden model.
//
// METODE (samme som fodboldens, scripts/maal-uafgjort.mjs): kampene køres
// kronologisk; hver kamp vurderes med de ratings, holdene havde FØR kampen;
// gitteret vælger de parametre, der giver lavest log-loss over hver enkelt
// kamp (ikke over et gennemsnit). Brier rapporteres ved siden af.
// ---------------------------------------------------------------------------

import { updateElo, outcomeProbabilities, OUTCOME, outcomeFromScore } from '../../src/lib/superligaScoring.js';

/** Elo-skalaens midte: alle hold starter her i den første turnering. */
export const MIDTE = 1500;

/**
 * Turneringerne, der kun er opvarmning: de giver ratings, men indgår ikke i
 * log-loss. I VM 2019 starter ALLE hold i 1500, så dens forudsigelser er
 * meningsløse; EM 2020 er stadig præget af det.
 *
 * TO er et VALG, ikke en måling (log-loss over forskellige kampe kan ikke
 * sammenlignes). Hvad det giver, er talt i scripts/maal-haandbold.mjs
 * (afsnit 1b, erfaringVedStart): af de 33 hold i VM 2021-EM 2026, der også
 * var med i 2019-2020, har 27 mindst 7 kampe bag sig — men 6 har kun EM
 * 2020's 3 (BIH, MNE, NED, POL, SUI, UKR), og Polen er med i 2027.
 * Deres første målte kampe hviler altså på 3 kampe; det er accepteret, og
 * testen (haandboldMaaling.test.mjs) holder tallene her fast.
 */
export const OPVARMNING = ['vm2019', 'em2020'];

/**
 * Værtsnationerne, som de står i infoboksens `country`/`country2`/`country3`
 * på hver af de 8 sider (scripts/haandbold-historik.json → kilder[].fil).
 *
 * TILNÆRMELSE, SOM ER VÆRD AT KENDE: en vært regnes som hjemme i ALLE sine
 * kampe. Ved delt værtskab spiller en vært en sjælden gang i medværtens land
 * (VM 2019: Tysklands bronzekamp i Herning; VM 2025: finalen DEN-CRO i Oslo).
 * Spillestedet står ikke i historikken, så det kan ikke gøres bedre her. Det
 * trækker den målte værtsfordel en anelse NED, ikke op.
 */
export const VAERTER = {
  vm2019: ['DEN', 'GER'],
  em2020: ['AUT', 'NOR', 'SWE'],
  vm2021: ['EGY'],
  em2022: ['HUN', 'SVK'],
  vm2023: ['POL', 'SWE'],
  em2024: ['GER'],
  vm2025: ['CRO', 'DEN', 'NOR'],
  em2026: ['DEN', 'NOR', 'SWE'],
};

/**
 * Samme hold i Elo-forstand, to koder i historikken. TOM MED VILJE.
 *
 * Kandidaten var COR → KOR: det fælles koreanske hold ved VM 2019. Siden
 * bruger KOR som nøgle i sin gruppetabel, men holdet havde spillere fra både
 * Syd- og Nordkorea (scripts/lib/wikiHandball.mjs, SAERLIGE_HOLD). MÅLT i
 * scripts/maal-haandbold.mjs (afsnit 7b): at kæde dem sammen gør log-loss en
 * anelse DÅRLIGERE og flytter ingen 2027-rating mærkbart. Så forbliver COR
 * sit eget hold — data giver ingen grund til at påstå, de er ét.
 * (Færøernes FAR/FRO er rettet i selve historikken, haandboldHistorik.mjs.)
 */
export const ELO_SAMME = new Map();

/** Historikkens kampe i kronologisk rækkefølge (turnering, dato, tid, filorden). */
export function kronologisk(historik, samme = ELO_SAMME) {
  const kode = (k) => samme.get(k) || k;
  const orden = new Map(historik.turneringer.map((t, i) => [t, i]));
  return historik.kampe
    .map((m, i) => ({ ...m, hjemme: kode(m.hjemme), ude: kode(m.ude), _i: i }))
    .sort((a, b) => (orden.get(a.turnering) - orden.get(b.turnering))
      || a.dato.localeCompare(b.dato)
      || String(a.tid ?? '').localeCompare(String(b.tid ?? ''))
      || a._i - b._i);
}

/** Udfaldet efter 60 min ('1' | 'X' | '2'), eller null uden gyldig stilling. */
export function udfald60(m) {
  return outcomeFromScore(m.efter60?.h, m.efter60?.u);
}

/**
 * Hvor mange kampe havde hvert hold bag sig, da målingen begyndte? For hvert
 * hold, der spiller i en målt turnering (ikke OPVARMNING) OG var med i
 * opvarmningen: antal opvarmningskampe. Det er grundlaget for at kalde to
 * turneringer nok (se OPVARMNING).
 * @returns {Array<{kode: string, kampe: number}>} sorteret med færrest først
 */
export function erfaringVedStart(historik, opvarmning = OPVARMNING) {
  const foer = new Map();
  const maalt = new Set();
  for (const m of historik.kampe) {
    for (const h of [m.hjemme, m.ude]) {
      if (opvarmning.includes(m.turnering)) foer.set(h, (foer.get(h) || 0) + 1);
      else maalt.add(h);
    }
  }
  return [...maalt].filter((h) => foer.has(h)).map((kode) => ({ kode, kampe: foer.get(kode) }))
    .sort((a, b) => a.kampe - b.kampe || a.kode.localeCompare(b.kode));
}

/**
 * Flest kampe ét hold har spillet i én turnering, pr. turnering (alle
 * sektioner i historikken, også placeringskampe).
 * @returns {Object<string, number>} turnering → maks
 */
export function flestKampePrTurnering(historik) {
  const n = new Map();
  for (const m of historik.kampe) {
    for (const h of [m.hjemme, m.ude]) {
      const k = `${m.turnering}\u0000${h}`;
      n.set(k, (n.get(k) || 0) + 1);
    }
  }
  const ud = {};
  for (const [k, v] of n) {
    const t = k.split('\u0000')[0];
    ud[t] = Math.max(ud[t] || 0, v);
  }
  return ud;
}

/**
 * Kør Elo kronologisk over kampene.
 *
 * @param {Array} kampe        fra kronologisk()
 * @param {object} p
 * @param {number} p.k         opdateringshastighed (som profilens K)
 * @param {number} [p.kOpvarmning=k] K i opvarmnings-turneringerne. I VM 2019
 *                             står alle hold i 1500, og ratings skal nå ud
 *                             over et spænd på ~1000 point på få kampe; en
 *                             højere K dér er indsvingning, ikke en model
 *                             for, hvor hurtigt et holds styrke ændrer sig
 * @param {string[]} [p.opvarmning=OPVARMNING]
 * @param {number} [p.carry=1] andel af afvigelsen fra MIDTE, et hold beholder
 *                             fra én turnering til den næste (fodbold: 0,75
 *                             mellem sæsoner, scripts/compute-superliga-elo.mjs)
 * @param {number} [p.nyStart=MIDTE] rating for et hold, der dukker op første
 *                             gang EFTER den første turnering
 * @param {number} [p.vaert=0] værtsfordel i Elo-point; lægges til værtens side
 *                             (hjemme +, ude −) i både forventning og opdatering
 * @returns {{obs: Array, ratings: Map<string, number>, kampeProHold: Map<string, number>,
 *            sidst: Map<string, string>}}
 *   obs: én pr. kamp {turnering, sektion, hjemme, ude, eloHjemme, eloUde, hfa, udfald}
 *   med ratings FØR kampen.
 */
export function koerElo(kampe, { k, kOpvarmning = k, opvarmning = OPVARMNING, carry = 1, nyStart = MIDTE, vaert = 0 } = {}) {
  const ratings = new Map();
  const kampeProHold = new Map();
  const sidst = new Map();
  const obs = [];
  let turnering = null;
  let foersteTurnering = null;
  for (const m of kampe) {
    if (m.turnering !== turnering) {
      if (turnering !== null) {
        for (const [h, r] of ratings) ratings.set(h, MIDTE + carry * (r - MIDTE));
      } else {
        foersteTurnering = m.turnering;
      }
      turnering = m.turnering;
    }
    const start = m.turnering === foersteTurnering ? MIDTE : nyStart;
    for (const h of [m.hjemme, m.ude]) if (!ratings.has(h)) ratings.set(h, start);
    // ÉN VAGT: en kamp uden gyldig stilling efter 60 min må ikke falde ud i
    // stilhed — så ville målingen og startstyrkerne regnes på færre kampe end
    // historikken siger. Historikken afviser sådanne kampe FØR de skrives
    // (kilder[].afviste); står der alligevel én, er filen forkert.
    const u = udfald60(m);
    if (!u) throw new Error(`Kamp uden gyldig stilling efter 60 min: ${m.turnering} ${m.dato} ${m.hjemme}-${m.ude} (${JSON.stringify(m.efter60)})`);
    const vaerter = VAERTER[m.turnering] || [];
    const hfa = (vaerter.includes(m.hjemme) ? vaert : 0) - (vaerter.includes(m.ude) ? vaert : 0);
    const eh = ratings.get(m.hjemme);
    const ea = ratings.get(m.ude);
    obs.push({ turnering: m.turnering, sektion: m.sektion, hjemme: m.hjemme, ude: m.ude, eloHjemme: eh, eloUde: ea, hfa, udfald: u });
    const actual = u === OUTCOME.HOME ? 1 : u === OUTCOME.DRAW ? 0.5 : 0;
    const r = updateElo(eh, ea, actual, { hfa, k: opvarmning.includes(m.turnering) ? kOpvarmning : k });
    ratings.set(m.hjemme, r.home);
    ratings.set(m.ude, r.away);
    for (const h of [m.hjemme, m.ude]) {
      kampeProHold.set(h, (kampeProHold.get(h) || 0) + 1);
      sidst.set(h, m.turnering);
    }
  }
  return { obs, ratings, kampeProHold, sidst };
}

/** Kun de kampe, der tæller i målingen (efter opvarmningen). */
export function maaltePaa(obs, opvarmning = OPVARMNING) {
  return obs.filter((o) => !opvarmning.includes(o.turnering));
}

/** Modellens 1X2 for én observation. */
export function sandsynligheder(o, { drawBase, drawDecay, medVaert = true }) {
  return outcomeProbabilities({
    eloHome: o.eloHjemme, eloAway: o.eloUde, hfa: medVaert ? o.hfa : 0, drawBase, drawDecay,
  });
}

/**
 * Log-loss (gennemsnitlig −ln p(udfald)) og 3-vejs Brier over observationerne.
 * @returns {{logLoss: number, brier: number, n: number}}
 */
export function score(obs, model) {
  let ll = 0;
  let br = 0;
  for (const o of obs) {
    const p = sandsynligheder(o, model);
    ll -= Math.log(Math.max(1e-12, p[o.udfald]));
    for (const u of [OUTCOME.HOME, OUTCOME.DRAW, OUTCOME.AWAY]) br += ((u === o.udfald ? 1 : 0) - p[u]) ** 2;
  }
  return { logLoss: ll / obs.length, brier: br / obs.length, n: obs.length };
}

/** Skævheden, uafgjort-modellen ser (samme formel som outcomeProbabilities). */
export function skew(o) {
  const eLevel = 1 / (1 + 10 ** (-(o.eloHjemme - o.eloUde) / 400));
  return Math.abs(2 * eLevel - 1);
}

/**
 * NLL for uafgjort-indikatoren alene. 3-vejs log-loss = denne + et led, der
 * ikke afhænger af drawBase/drawDecay (fordelingen af sejrene), så de to
 * fits giver PRÆCIS samme drawBase/drawDecay. Bruges, fordi den er hurtig.
 */
export function uafgjortNll(obs, base, decay) {
  let s = 0;
  for (const o of obs) {
    const p = Math.min(0.9999, Math.max(0.0001, base * Math.exp(-decay * skew(o) * 2)));
    s -= o.udfald === OUTCOME.DRAW ? Math.log(p) : Math.log(1 - p);
  }
  return s;
}

/**
 * Bedste drawBase/drawDecay på et gitter + 95 %-profilinterval for decay
 * (likelihood-forhold, χ²₁/2 = 1,92 — samme grænse som maal-uafgjort.mjs).
 */
export function fitUafgjort(obs, {
  baser = trin(0.02, 0.40, 0.002), decays = trin(0, 3, 0.02),
} = {}) {
  let best = null;
  const profil = [];
  for (const dec of decays) {
    let b = null;
    for (const base of baser) {
      const l = uafgjortNll(obs, base, dec);
      if (!b || l < b.l) b = { l, base };
    }
    profil.push({ decay: dec, base: b.base, l: b.l });
    if (!best || b.l < best.l) best = { l: b.l, base: b.base, decay: dec };
  }
  const inden = profil.filter((r) => r.l <= best.l + 1.92);
  return {
    base: best.base, decay: best.decay, nll: best.l,
    decayInterval: [inden[0].decay, inden[inden.length - 1].decay],
    decayVedKant: inden[0].decay === decays[0] || inden[inden.length - 1].decay === decays[decays.length - 1],
    profil,
  };
}

/** Bedste drawBase med decay LÅST. */
export function fitBase(obs, decay, baser = trin(0.02, 0.40, 0.001)) {
  let b = null;
  for (const base of baser) {
    const l = uafgjortNll(obs, base, decay);
    if (!b || l < b.l) b = { l, base };
  }
  return b;
}

/** 95 %-profilinterval for base med decay låst. */
export function baseInterval(obs, decay, baser = trin(0.02, 0.40, 0.001)) {
  const r = baser.map((base) => ({ base, l: uafgjortNll(obs, base, decay) }));
  const min = Math.min(...r.map((x) => x.l));
  const inden = r.filter((x) => x.l <= min + 1.92);
  return [inden[0].base, inden[inden.length - 1].base];
}

/** Talrække fra..til (inkl.) med trin — afrundet, så 0,1 + 0,2 ikke bliver 0,30000000000000004. */
export function trin(fra, til, step) {
  const ud = [];
  const n = Math.round((til - fra) / step);
  for (let i = 0; i <= n; i += 1) ud.push(Math.round((fra + i * step) * 1e6) / 1e6);
  return ud;
}

/** Uafgjort-andel efter 60 min. */
export function uafgjortAndel(kampe) {
  const d = kampe.filter((m) => udfald60(m) === OUTCOME.DRAW).length;
  return { uafgjort: d, kampe: kampe.length, andel: d / kampe.length };
}

/**
 * Er kampen en knockout-kamp om en plads i finalerne (kvart, semi, bronze,
 * finale)? Placeringskampe (5.-8. plads) og Presidents Cup tæller ikke —
 * de er ikke med i spillet (ejerens beslutning §11.4).
 */
// Præcis de sektionsnavne, siderne bruger (set i historikken 3/11 2026). En
// ny form tælles IKKE med — her er det kun rapportens knockout-tal, der
// påvirkes, og hellere for få end en «5–8th place semifinals» med.
const KNOCKOUT_SEKTION = /^(Final round|Knockout stage) › (Quarterfinals|Semifinals|Semi-finals|Third place game|Final)$/;

export function erKnockout(m) {
  return KNOCKOUT_SEKTION.test(String(m.sektion || ''));
}

// --- Gitteret ---------------------------------------------------------------

/**
 * Gitteret over Elo-parametrene. K er profilens; de fire andre styrer kun,
 * hvordan STARTSTYRKERNE regnes ud af historikken (de findes ikke i spillet).
 * Grænserne er valgt, så bedste værdi ikke ligger på kanten — scriptet siger
 * fra, hvis den gør (vedKant).
 */
export const GITTER = {
  k: trin(20, 200, 10),
  kOpvarmning: trin(100, 300, 50),
  carry: trin(0.6, 1, 0.1),
  nyStart: trin(900, 1500, 50),
  vaert: trin(0, 150, 25),
};

/**
 * Alle kombinationer af gitteret, scoret med uafgjort-modellen `model`
 * ({drawBase, drawDecay}). Sorteret med lavest log-loss først.
 */
export function gitterElo(kampe, model, gitter = GITTER) {
  const ud = [];
  for (const k of gitter.k) for (const kOpvarmning of gitter.kOpvarmning) for (const carry of gitter.carry) {
    for (const nyStart of gitter.nyStart) for (const vaert of gitter.vaert) {
      const p = { k, kOpvarmning, carry, nyStart, vaert };
      ud.push({ ...p, ...score(maaltePaa(koerElo(kampe, p).obs), model) });
    }
  }
  return ud.sort((a, b) => a.logLoss - b.logLoss);
}

/** Ligger en parameter på gitterets kant? (Så er gitteret for smalt.) */
export function vedKant(bedst, gitter = GITTER) {
  return Object.keys(gitter).filter((p) => {
    const v = gitter[p];
    // carry = 1 er gitterets øverste værdi, men en NATURLIG grænse (et hold
    // beholder højst hele sin afvigelse). At 1 også er et ægte minimum og ikke
    // bare loftet, er MÅLT: carry 1,05 er dårligere (scripts/maal-haandbold.mjs
    // afsnit 2, og testen). vaert = 0 er en naturlig nedre grænse. Dem tæller
    // vi ikke som kant.
    if (p === 'carry' && bedst[p] === 1) return false;
    if (p === 'vaert' && bedst[p] === 0) return false;
    return bedst[p] === v[0] || bedst[p] === v[v.length - 1];
  });
}

/**
 * DECAY LÅSES — og her er grunden i kode, så den kan efterprøves.
 *
 * Med under 50 uafgjorte i de målte kampe er decay umålelig: 95 %-intervallet
 * går fra 0 (uafgjort lige sandsynligt i alle kampe) til næsten 0,9. Data kan
 * ikke skelne mellem de to former. Låsen er fodboldens 0,55, fordi den er
 * MÅLT (6.143 kampe, 95 % 0,35-0,63, scripts/maal-uafgjort.mjs) og ligger
 * inden for håndboldens eget interval — og fordi 0 modsiges af det, data godt
 * kan se: uafgjort-raten falder fra de jævne til de skæve kampe (båndene i
 * scripts/maal-haandbold.mjs). Kun BASE fittes — samme greb som fodboldens
 * ("Én parameter er nok"). Udelukker intervallet en dag 0,55, bliver testen
 * rød (haandboldMaaling.test.mjs), og låsen skal tages op igen.
 */
export const DECAY_LAAS = 0.55;

const PARAMS = ['k', 'kOpvarmning', 'carry', 'nyStart', 'vaert'];
const pick = (r) => Object.fromEntries(PARAMS.map((p) => [p, r[p]]));
const samme = (a, b) => PARAMS.every((p) => a[p] === b[p]);

/** Base afrundet til 3 decimaler (samme opløsning som fodboldens 0,305). */
export function basePaa(obs) {
  return Math.round(fitBase(obs, DECAY_LAAS).base * 1000) / 1000;
}

/**
 * Hele målingen: gitter over Elo → fit base (decay låst) → gitter igen med
 * den nye base, til valget står stille (højst `runder` gange).
 */
export function maal(historik, { gitter = GITTER, runder = 4, startBase = 0.09 } = {}) {
  const kampe = kronologisk(historik);
  let base = startBase;
  const forloeb = [];
  let resultater = null;
  let bedst = null;
  for (let i = 0; i < runder; i += 1) {
    resultater = gitterElo(kampe, { drawBase: base, drawDecay: DECAY_LAAS }, gitter);
    const ny = resultater[0];
    const nyBase = basePaa(maaltePaa(koerElo(kampe, ny).obs));
    forloeb.push({ runde: i + 1, ...pick(ny), base: nyBase, logLoss: ny.logLoss });
    const stille = bedst !== null && samme(bedst, ny) && nyBase === base;
    bedst = ny;
    base = nyBase;
    if (stille) break;
  }
  const obs = maaltePaa(koerElo(kampe, bedst).obs);
  return { elo: pick(bedst), base, decay: DECAY_LAAS, fri: fitUafgjort(obs), forloeb, resultater, kampe, obs };
}

/**
 * Er `p` et lokalt minimum i gitteret? Hver parameter flyttes ét trin op og
 * ned, med de andre stående. Billig nok til en test (≤ 11 Elo-kørsler) —
 * det fulde gitter er scriptets.
 * @returns {Array<{param, vaerdi, logLoss}>} naboer, der er BEDRE end p (tom = minimum)
 */
export function bedreNaboer(kampe, p, model, gitter = GITTER) {
  const egen = score(maaltePaa(koerElo(kampe, p).obs), model).logLoss;
  const bedre = [];
  for (const param of PARAMS) {
    const v = gitter[param];
    const i = v.indexOf(p[param]);
    if (i < 0) throw new Error(`${param} = ${p[param]} ligger ikke i gitteret`);
    for (const j of [i - 1, i + 1]) {
      if (j < 0 || j >= v.length) continue;
      const q = { ...p, [param]: v[j] };
      const l = score(maaltePaa(koerElo(kampe, q).obs), model).logLoss;
      if (l < egen) bedre.push({ param, vaerdi: v[j], logLoss: l });
    }
  }
  return bedre;
}

/**
 * Startstyrkerne for 2027: Elo efter ALLE kampe i historikken (også EM 2026),
 * med målingens parametre. Kode → rating (ikke afrundet).
 */
export function startStyrker(historik, eloParam) {
  const { ratings, kampeProHold, sidst } = koerElo(kronologisk(historik), eloParam);
  return { ratings, kampeProHold, sidst };
}

// --- De valgte tal -------------------------------------------------------------

/**
 * Metodens parametre for startstyrkerne — valgt af gitteret i
 * scripts/maal-haandbold.mjs (afsnit 2) og efterprøvet som lokalt minimum i
 * haandboldMaaling.test.mjs. K står IKKE her: den er profilens
 * (SPORT_PROFILER.haandbold.elo.K), så profilen og startstyrkerne ikke kan
 * regnes med hver sin K.
 *
 * nyStart er ratingen for et hold, der dukker op første gang — og den, et
 * hold UDEN historik får i holdfilen (Tyrkiet). Den er ikke profilens START:
 * START er skalaens nulpunkt (MIDTE), som hjælpesiden kalder "det neutrale
 * nulpunkt", og et nyt hold ligger målbart under det.
 */
export const STARTMETODE = Object.freeze({ kOpvarmning: 150, carry: 1, nyStart: 1150, vaert: 25 });

/**
 * VM 2027's vært — kun den får værtsfordelen lagt i sin start-Elo.
 *
 * DET ER ET VALG, IKKE EN MÅLING. vaert = 25 er gitterets punktestimat, og
 * det er det rigtige tal at regne HISTORIKKEN med (som K: punktestimatet
 * forudsiger bedst). Men 95 %-intervallet er 0-140, og vært 0 koster kun
 * ΔNLL ≈ 0,25 (grænsen er 1,92; scripts/maal-haandbold.mjs afsnit 5): data
 * kan ikke skelne 25 fra 0. Efter samme målestok som DECAY_LAAS er værdien
 * altså umålelig. At lægge +25 oven i Tysklands 2027-rating følger planen B5
 * («værtsfordelen lægges i holdets seed-Elo»), men om den skal med, er
 * ejerens beslutning: afsnit 5 viser priserne med og uden.
 */
export const VAERT_2027 = Object.freeze(['GER']);

/** Alle fem Elo-parametre: profilens K + STARTMETODE. */
export function valgteParametre(profil) {
  if (!profil?.elo) throw new Error('Håndboldprofilen mangler — kan ikke regne startstyrker.');
  return { k: profil.elo.K, ...STARTMETODE };
}

/**
 * Start-Elo for hvert hold i holdlisten, PRÆCIS som holdfilen skal have den:
 * målt rating afrundet, + værtsfordel for VM 2027's vært, og metodens nyStart
 * (p.nyStart) for et hold uden kampe i historikken.
 * @param {Array<{hbKode: string, name: string}>} hold
 * @param {{k, kOpvarmning, carry, nyStart, vaert}} p  fx valgteParametre(profil)
 * @returns {Array<{kode, navn, elo, harHistorik, kampe, sidst, vaert}>}
 */
export function holdStartElo(historik, hold, p) {
  const st = startStyrker(historik, p);
  return hold.map((t) => {
    const raa = st.ratings.get(t.hbKode);
    const harHistorik = raa !== undefined;
    const vaert = VAERT_2027.includes(t.hbKode) ? p.vaert : 0;
    return {
      kode: t.hbKode, navn: t.name, harHistorik, vaert,
      elo: harHistorik ? Math.round(raa) + vaert : p.nyStart,
      kampe: st.kampeProHold.get(t.hbKode) || 0, sidst: st.sidst.get(t.hbKode) || '—',
    };
  });
}

/**
 * Medianen: gennemsnittet af de to midterste ved et lige antal. (Scriptet tog
 * før xs[Math.floor(n/2)] — den ØVRE af de to midterste — og skrev 10,02 for
 * top-8-parrene, hvor medianen er 9,81.)
 */
export function median(xs) {
  if (!xs.length) throw new Error('median af ingenting');
  const v = [...xs].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}
