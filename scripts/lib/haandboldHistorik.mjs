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
//                finalen). Den side er ikke hentet, så kampen er IKKE med.
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
  findHandballboxe, laesBox, sidensForskydning, transklusioner, infoboksKampe,
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
  { noegle: 'em2026', titel: "2026 European Men's Handball Championship" },
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
 * @param {{minSpillede?: number, kraevKamptal?: boolean}} [o]  kun testene sænker gulvet og
 *   slår kravet om infoboksens kamptal fra (en beskåret fixture har ingen infoboks)
 * @returns {{kampe: Array, afviste: Array<{nr, sektion, grund, art}>, ikkeSpillet: number,
 *   ukendteFelter: Record<string, number>, infoboksKampe: number|null}}
 */
export function udtraekKampe(wikitekst, turnering, { minSpillede = MIN_SPILLEDE, kraevKamptal = true } = {}) {
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
      grund: `kampen står ikke på siden, men transkluderes fra «${t.side}» (${t.skabelon}) — den side er ikke hentet, så kampen er IKKE med`,
      art: 'andenSide',
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
  return { kampe, afviste, ikkeSpillet, ukendteFelter, infoboksKampe: tal.antal };
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
 * @returns {Record<string, string>} nøgle → filnavn
 */
export function gemteFiler(filnavne, noegler) {
  const ud = {};
  const mangler = [];
  for (const n of noegler) {
    const fundne = filnavne.filter((f) => new RegExp(`^${n}\\.(json|wikitext|txt)$`, 'i').test(f));
    if (fundne.length > 1) throw new Error(`${n} har ${fundne.length} filer i mappen (${fundne.join(', ')}) — hvilken er siden? Fjern de andre.`);
    if (!fundne.length) mangler.push(n);
    else ud[n] = fundne[0];
  }
  if (mangler.length) {
    throw new Error(`mappen mangler ${mangler.map((n) => `${n}.json/.wikitext`).join(', ')}. Intet er læst. `
      + 'Hent dem, eller vælg færre med --turneringer.');
  }
  return ud;
}
