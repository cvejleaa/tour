// ---------------------------------------------------------------------------
// scripts/lib/haandboldHistorik.mjs — færdigspillede kampe fra VM/EM-siderne
// på Wikipedia → måledata til håndboldprofilen (D4: Elo, uafgjort-model,
// startstyrker).
//
// Rene funktioner; scripts/haandbold-historik.mjs henter og skriver.
//
// HVAD EN KAMP ER I DATAENE:
//   {turnering, dato, tid, sektion, hjemme, ude, efter60:{h,u}, slut:{h,u}, afgjort}
//   efter60  stillingen efter ordinær tid. DET er, hvad der tippes på — også
//            i knockout (ejerens beslutning §11.1) — og derfor det, D4 måler på.
//   slut     slutstillingen inkl. forlængelse og straffekast (= sidens score).
//   afgjort  null | 'forlaenget' | 'straffe'.
//   hjemme/ude er Wikipedias holdkoder (DEN, GER …), ikke danske navne:
//   historikken har hold, der ikke er med i 2027. To hold står ikke som
//   {{hb|KODE}} på siderne: det fælles koreanske hold (VM 2019) får COR, og
//   «Russian Handball Federation» (VM 2021) er RUS — begrundelsen står ved
//   SAERLIGE_HOLD i wikiHandball.mjs.
//   dato/tid er turneringens LOKALE tid, som siden skriver den. Forskydningen
//   står pr. side i kilder[].forskydningMin (VM 2021 i Egypten var UTC+2) —
//   null, hvis siden ikke siger det entydigt. Tiden bruges kun til
//   rækkefølgen inden for en dag, aldrig som deadline.
//
// AFVIST ER IKKE TAVST. En kamp, der ikke kan læses (ukendt scoreform, FT uden
// forlængelse, pladsholder med en score …), tælles og står med sin grund i
// outputtet og i scriptets udskrift. Én mærkelig kamp på en gammel side skal
// ikke vælte målingen — men ingen må tro, at den er med.
//
// En afvist kamp har en `art`:
//   'walkover'   tildelt ved bordet, ikke spillet (VM 2021: Kap Verdes seks).
//                RIGTIGT afvist — der er intet at måle på.
//   'andenSide'  kampen står på en anden side, der er transkluderet (EM 2026:
//                finalen), og den side er ikke givet med. Kampen er IKKE med.
//
// TRANSKLUDEREDE SIDER. EM 2026-siden har ingen kasse for finalen, kun
// «{{#section:2026 European Men's Handball Championship final|Final}}».
// Gives den anden sides wikitekst med (`andreSider`; scriptet læser den fra
// --filer-mappen under nøglen i TURNERINGER[].transklusioner), erstattes
// transklusionen med PRÆCIS det navngivne afsnit (<section begin="Final" />
// … <section end="Final" />) FØR kampene læses — så finalen er en kamp som
// alle andre, i sektionen, hvor transklusionen stod. Kun {{#section:Side|
// Afsnit}} og {{#lst:Side|Afsnit}} (samme funktion, to navne). Alt andet —
// en side, der ikke er givet med, eller en anden form — afvises som før
// ('andenSide'), aldrig tavst. Og et afsnit, der mangler eller står to gange
// på den anden side, eller en given side, der aldrig bruges, KASTER.
//   'ulaeselig'  alt andet: en form, parseren ikke kender. Læs siden.
//
// STRUKTUR-VAGTER. (1) En side med færre end MIN_SPILLEDE spillede kampe
// kaster. Så har siden skiftet form (fx kampene flyttet til undersider), og
// en måling på en brøkdel ville se rigtig ud. (2) REGNSKABET: siden siger
// selv, hvor mange kampe der blev spillet (infoboksens «matches=»). Læste +
// afviste (undtagen walkovers, som ikke er spillet) skal give PRÆCIS det tal,
// ellers kastes der. Gulvet fangede ikke EM 2026's tabte finale (64 > 60);
// regnskabet gør — også for en form, vi endnu ikke har set.
// ---------------------------------------------------------------------------

import {
  findHandballboxe, laesBox, sidensForskydning, transklusioner, infoboksKampe, fjernKommentarer,
  overskrifter, sektionVed,
} from './wikiHandball.mjs';

// Sidenavnene. Fundet 2/11 2026; API-kaldet følger omdirigeringer (redirects=1),
// så en omdøbning af siden fanges af sidens nye titel i outputtet.
export const TURNERINGER = [
  { noegle: 'vm2019', titel: "2019 World Men's Handball Championship" },
  { noegle: 'em2020', titel: "2020 European Men's Handball Championship" },
  { noegle: 'vm2021', titel: "2021 World Men's Handball Championship" },
  { noegle: 'em2022', titel: "2022 European Men's Handball Championship" },
  { noegle: 'vm2023', titel: "2023 World Men's Handball Championship" },
  { noegle: 'em2024', titel: "2024 European Men's Handball Championship" },
  { noegle: 'vm2025', titel: "2025 World Men's Handball Championship" },
  {
    noegle: 'em2026',
    titel: "2026 European Men's Handball Championship",
    // Finalen står på sin egen side (se TRANSKLUDEREDE SIDER øverst).
    // Sidetitel → filnøgle i --filer-mappen (em2026-finale.wikitext/.json).
    transklusioner: { "2026 European Men's Handball Championship final": 'em2026-finale' },
  },
];

// VM 2019 og EM 2020-2026 har 24 hold (≈ 65-84 kampe); VM 2021+ har 32 (108).
// 60 er under dem alle og over en side, der kun har sine knockout-kampe.
export const MIN_SPILLEDE = 60;

// ÉT HOLD, TO KODER. Siderne er skrevet af forskellige hænder: Færøerne står
// som {{hb|FRO}} på EM 2024-siden og som {{hb|FAR}} på EM 2026-siden (hentet
// 3/11 2026). Uden omkodning er det to hold i Elo-forstand, og Færøernes
// seneste EM forsvinder fra det hold, der hedder FRO i VM 2027-holdfilen
// (src/data/haandboldVm2027Hold.js). Kun koder, der er SET på siderne, står
// her; målet er holdfilens hbKode.
export const SAMME_HOLD = new Map([['FAR', 'FRO']]);

/**
 * Én sides kampe.
 * @param {string} wikitekst
 * @param {string} turnering  nøglen, fx 'vm2025'
 * @param {{minSpillede?: number, kraevKamptal?: boolean, andreSider?: Record<string, string>}} [o]
 *   kun testene sænker gulvet og slår kravet om infoboksens kamptal fra (en
 *   beskåret fixture har ingen infoboks). `andreSider`: sidetitel → wikitekst
 *   for de transkluderede sider, der er givet med (indsaetTransklusioner).
 * @returns {{kampe: Array, afviste: Array<{nr, sektion, grund, art}>, ikkeSpillet: number,
 *   ukendteFelter: Record<string, number>, infoboksKampe: number|null,
 *   transkluderet: Array<{side: string, afsnit: string, sektion: string}>}}
 */
export function udtraekKampe(raaTekst, turnering, { minSpillede = MIN_SPILLEDE, kraevKamptal = true, andreSider = {} } = {}) {
  const { tekst: wikitekst, indsat } = indsaetTransklusioner(raaTekst, andreSider, turnering);
  const kampe = [];
  const afviste = [];
  const ukendteFelter = {};
  let ikkeSpillet = 0;
  const boxe = findHandballboxe(wikitekst);
  for (const b of boxe) {
    for (const u of b.ukendte) ukendteFelter[u] = (ukendteFelter[u] || 0) + 1;
    const sektion = b.sektion.join(' › ');
    let k;
    try {
      k = laesBox(b);
    } catch (e) {
      afviste.push({ nr: b.nr, sektion, grund: e.message, art: e.art === 'walkover' ? 'walkover' : 'ulaeselig' });
      continue;
    }
    if (!k.facit) { ikkeSpillet += 1; continue; }
    if (!k.hjemme?.kode || !k.ude?.kode) {
      afviste.push({ nr: b.nr, sektion, grund: 'kampen har en score, men et af holdene er ikke et land ({{hb|KODE}})', art: 'ulaeselig' });
      continue;
    }
    if (!k.dato) {
      afviste.push({ nr: b.nr, sektion, grund: 'kampen har ingen dato', art: 'ulaeselig' });
      continue;
    }
    kampe.push({
      turnering,
      dato: k.dato,
      tid: k.tid,
      sektion,
      hjemme: SAMME_HOLD.get(k.hjemme.kode) ?? k.hjemme.kode,
      ude: SAMME_HOLD.get(k.ude.kode) ?? k.ude.kode,
      efter60: k.facit.efter60,
      slut: k.facit.slut,
      afgjort: k.facit.afgjort,
    });
  }
  for (const t of transklusioner(wikitekst)) {
    afviste.push({
      nr: null,
      sektion: t.sektion.join(' › '),
      grund: `kampen står ikke på siden, men transkluderes fra «${t.side}» (${t.skabelon}) — den side er ikke givet med, så kampen er IKKE med`,
      art: 'andenSide',
      // Sidens titel for sig: scriptet nægter --skriv, når siden er ERKLÆRET
      // (TURNERINGER[].transklusioner) og alligevel endte her.
      side: t.side,
    });
  }
  if (kampe.length < minSpillede) {
    throw new Error(`${turnering}: kun ${kampe.length} spillede kampe på siden (${boxe.length} {{handballbox}}, `
      + `${afviste.length} afvist) — under ${minSpillede}. Siden har skiftet form; intet er skrevet.`);
  }
  const tal = infoboksKampe(wikitekst);
  if (tal.antal === null && kraevKamptal) {
    throw new Error(`${turnering}: ${tal.fejl} — kampenes antal kan ikke efterprøves, og en tabt kamp ville ikke ses. Intet er skrevet.`);
  }
  if (tal.antal !== null) {
    const spilledeAfviste = afviste.filter((a) => a.art !== 'walkover').length;
    if (kampe.length + spilledeAfviste !== tal.antal) {
      throw new Error(`${turnering}: siden siger ${tal.antal} kampe (infoboksens «matches=»), men parseren gør rede for `
        + `${kampe.length + spilledeAfviste} (${kampe.length} læst + ${spilledeAfviste} afvist; walkovers tæller ikke). `
        + 'En kamp er tabt eller talt to gange — find den, før noget bruges. Intet er skrevet.');
    }
  }
  kampe.sort((a, b) => a.dato.localeCompare(b.dato) || String(a.tid).localeCompare(String(b.tid)) || a.hjemme.localeCompare(b.hjemme));
  return { kampe, afviste, ikkeSpillet, ukendteFelter, infoboksKampe: tal.antal, transkluderet: indsat };
}

// {{#section:Side|Afsnit}} / {{#lst:Side|Afsnit}} — præcis ét afsnit, intet
// andet (ikke #section-h, #lstx eller {{:Side}}: dem afviser transklusioner()).
const SEKTION_TRANSKLUSION = /\{\{\s*#(?:section|lst)\s*:\s*([^|{}]+?)\s*\|\s*([^|{}]+?)\s*\}\}/gi;
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Erstat {{#section:Side|Afsnit}} med afsnittet fra den anden side, når den
 * side er givet med. En side, der IKKE er givet med, røres ikke — så meldes
 * den af transklusioner() og afvises som 'andenSide'.
 * KASTER, når afsnittet ikke står præcis én gang på den anden side, og når en
 * given side aldrig transkluderes (en fil, der lå i mappen uden at blive brugt,
 * ville ellers ligne en kamp, der er med).
 * @param {string} wikitekst
 * @param {Record<string, string>} andreSider  sidetitel → wikitekst
 * @param {string} turnering  til fejlbeskeden
 * @returns {{tekst: string, indsat: Array<{side: string, afsnit: string, sektion: string}>}}
 *   sektion: hvor transklusionen stod — dér står kampene derfra nu
 */
export function indsaetTransklusioner(wikitekst, andreSider, turnering) {
  const titler = Object.keys(andreSider);
  if (!titler.length) return { tekst: wikitekst, indsat: [] };
  const indsat = [];
  const udenKommentarer = fjernKommentarer(wikitekst);
  const overs = overskrifter(udenKommentarer);
  const tekst = udenKommentarer.replace(SEKTION_TRANSKLUSION, (hel, raa, afsnit, pos) => {
    // Titlen slås op NORMALISERET (Security, D4): `…_final` og `…  final` er
    // samme side for Wikipedia og skal også være det her. `side` er den
    // givne titel — den, scriptet kender filen under.
    const side = titler.find((t) => normTitel(t) === normTitel(raa));
    if (side === undefined) return hel;
    indsat.push({ side, afsnit, sektion: sektionVed(overs, pos).join(' › ') });
    return afsnitFra(andreSider[side], side, afsnit, turnering);
  });
  const ubrugte = titler.filter((t) => !indsat.some((x) => x.side === t));
  if (ubrugte.length) {
    throw new Error(`${turnering}: ${ubrugte.map((t) => `«${t}»`).join(', ')} er givet med, men siden transkluderer `
      + 'ikke et afsnit derfra ({{#section:Side|Afsnit}}). Er det den rigtige side? Intet er skrevet.');
  }
  return { tekst, indsat };
}

/** Teksten mellem <section begin="Afsnit" /> og <section end="Afsnit" /> — præcis én gang. */
function afsnitFra(andenTekst, side, afsnit, turnering) {
  const t = fjernKommentarer(andenTekst);
  const navn = `\\s*=\\s*(["']?)${escRe(afsnit)}\\1\\s*\\/?>`;
  const begynd = [...t.matchAll(new RegExp(`<section\\s+begin${navn}`, 'g'))];
  const slut = [...t.matchAll(new RegExp(`<section\\s+end${navn}`, 'g'))];
  const hvor = `${turnering}: afsnittet «${afsnit}» på «${side}»`;
  if (begynd.length !== 1 || slut.length !== 1) {
    throw new Error(`${hvor} står ${begynd.length} gang(e) som begyndelse og ${slut.length} som slutning — `
      + 'præcis én af hver kræves. Intet er skrevet.');
  }
  const fra = begynd[0].index + begynd[0][0].length;
  if (slut[0].index < fra) throw new Error(`${hvor} slutter, før det begynder. Intet er skrevet.`);
  const afsnitTekst = t.slice(fra, slut[0].index);
  // En OVERSKRIFT i afsnittet ville blive en overskrift på turneringssiden:
  // kampene derfra — og kasserne efter transklusionen — fik så dens sektion
  // («Match») i stedet for den, transklusionen står i («Knockout stage ›
  // Final»), og erKnockout ville se finalen som en gruppekamp. Tavst, for
  // kamptallet går stadig op. Derfor højt.
  const overs = overskrifter(afsnitTekst);
  if (overs.length) {
    throw new Error(`${hvor} indeholder en overskrift («${overs[0].titel}») — indsat ville den flytte kampenes sektion `
      + 'væk fra den, hvor transklusionen står. Intet er skrevet.');
  }
  return afsnitTekst;
}

/**
 * Filerne i --filer-mappen, som INGEN turnering eller transkluderet side
 * hedder (en stavefejl som `em2026-final.wikitext`, en `foo.wikitext`) — og
 * dem, der hører til en turnering, der ikke er valgt med --turneringer.
 * Scriptet STOPPER på de første: en fil, der ligger i mappen uden at blive
 * brugt, ligner en side, der er med. De sidste springes over og nævnes.
 * Skjulte filer (`.DS_Store`) tæller ikke.
 * @param {string[]} filnavne  mappens indhold
 * @param {Array<{noegle: string, transklusioner?: Record<string, string>}>} valgte
 * @param {Array<{noegle: string, transklusioner?: Record<string, string>}>} [alle]
 * @returns {{ukendte: string[], ikkeValgte: string[]}}
 */
export function ubrugteFiler(filnavne, valgte, alle = TURNERINGER) {
  const noegler = (ts) => ts.flatMap((t) => [t.noegle, ...Object.values(t.transklusioner ?? {})]);
  const passer = (f, ns) => ns.some((n) => new RegExp(`^${escRe(n)}\\.(json|wikitext|txt)$`, 'i').test(f));
  const synlige = filnavne.filter((f) => !f.startsWith('.'));
  return {
    ukendte: synlige.filter((f) => !passer(f, noegler(alle))),
    ikkeValgte: synlige.filter((f) => passer(f, noegler(alle)) && !passer(f, noegler(valgte))),
  };
}

/**
 * En sidetitel, som MediaWiki selv sammenligner den: understregning =
 * mellemrum, flere mellemrum = ét, intet i enderne, stort forbogstav.
 * `2026_European_Men's_Handball_Championship_final` og `2026 European Men's
 * Handball Championship  final` er SAMME side — en tegn-for-tegn-sammenligning
 * lod en sådan omskrivning på Wikipedia glide forbi den erklærede side.
 * @param {string} titel
 */
export function normTitel(titel) {
  const t = String(titel).replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * ALLE kampe, der endte som 'andenSide' — med, om siden er ERKLÆRET
 * (TURNERINGER[].transklusioner, sammenlignet med normTitel) og i så fald
 * dens fil. --skriv nægter at skrive, når listen ikke er tom, medmindre
 * --tillad-anden-side er givet: ÉN vagt, uanset om siden er erklæret, stavet
 * om på Wikipedia, eller ny (Security, D4). Erklæret/fil bruges kun til
 * beskeden — så den kan sige, hvilken fil der mangler.
 * @returns {Array<{side: string, sektion: string, erklaeret: boolean, fil: string|null}>}
 */
export function andenSideAfvisninger(turnering, afviste) {
  const erklaeret = Object.entries(turnering.transklusioner ?? {});
  return afviste
    .filter((a) => a.art === 'andenSide')
    .map((a) => {
      const hit = erklaeret.find(([titel]) => normTitel(titel) === normTitel(a.side));
      return { side: a.side, sektion: a.sektion, erklaeret: Boolean(hit), fil: hit ? hit[1] : null };
    });
}

/** Et resumé pr. turnering til udskriften og outputtet. */
export function resume(kampe) {
  const n = kampe.length;
  const uafgjort60 = kampe.filter((k) => k.efter60.h === k.efter60.u).length;
  const forlaenget = kampe.filter((k) => k.afgjort === 'forlaenget').length;
  const straffe = kampe.filter((k) => k.afgjort === 'straffe').length;
  const maal = kampe.reduce((s, k) => s + k.efter60.h + k.efter60.u, 0);
  return { kampe: n, uafgjortEfter60: uafgjort60, forlaenget, straffe, maalPrKamp60: n ? Math.round((maal / n) * 10) / 10 : null };
}

/**
 * Sidens tidszone til kilden: {forskydningMin, fejl}. Historikken vælter ikke
 * på en side uden «All times are local (UTC+…)» — tiden er kun rækkefølge —
 * men den gætter heller ikke: null + grunden, som scriptet viser.
 */
export function sidensTidszone(wikitekst) {
  try {
    return { forskydningMin: sidensForskydning(wikitekst), fejl: null };
  } catch (e) {
    return { forskydningMin: null, fejl: e.message };
  }
}

/**
 * NØDVEJEN: siderne gemt i en mappe i stedet for hentet (fx når Wikipedia
 * svarer 429). Filen for en turnering hedder `<nøgle>.json` (API-svaret gemt
 * fra browseren, eller en cachefil) eller `<nøgle>.wikitext`/`.txt` (rå
 * wikitekst). Præcis én pr. valgt turnering — mangler en, eller står der to,
 * kastes der, før noget læses (alt eller intet, som ved hentning).
 * @param {string[]} filnavne  mappens indhold
 * @param {string[]} noegler   de valgte turneringer
 * @param {{valgfri?: boolean}} [o]  valgfri: en manglende fil er ikke en fejl
 *   (de transkluderede sider: mangler den, afvises kampen som 'andenSide')
 * @returns {Record<string, string>} nøgle → filnavn
 */
export function gemteFiler(filnavne, noegler, { valgfri = false } = {}) {
  const ud = {};
  const mangler = [];
  for (const n of noegler) {
    const fundne = filnavne.filter((f) => new RegExp(`^${n}\\.(json|wikitext|txt)$`, 'i').test(f));
    if (fundne.length > 1) throw new Error(`${n} har ${fundne.length} filer i mappen (${fundne.join(', ')}) — hvilken er siden? Fjern de andre.`);
    if (!fundne.length) mangler.push(n);
    else ud[n] = fundne[0];
  }
  if (mangler.length && !valgfri) {
    throw new Error(`mappen mangler ${mangler.map((n) => `${n}.json/.wikitext`).join(', ')}. Intet er læst. `
      + 'Hent dem, eller vælg færre med --turneringer.');
  }
  return ud;
}
