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
//   historikken har hold, der ikke er med i 2027.
//
// AFVIST ER IKKE TAVST. En kamp, der ikke kan læses (ukendt scoreform, FT uden
// forlængelse, pladsholder med en score …), tælles og står med sin grund i
// outputtet og i scriptets udskrift. Én mærkelig kamp på en gammel side skal
// ikke vælte målingen — men ingen må tro, at den er med.
//
// STRUKTUR-VAGT: en side med færre end MIN_SPILLEDE spillede kampe kaster. Så
// har siden skiftet form (fx kampene flyttet til undersider), og en måling
// på en brøkdel ville se rigtig ud.
// ---------------------------------------------------------------------------

import { findHandballboxe, laesBox } from './wikiHandball.mjs';

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

/**
 * Én sides kampe.
 * @param {string} wikitekst
 * @param {string} turnering  nøglen, fx 'vm2025'
 * @param {{minSpillede?: number}} [o]  kun testene sænker gulvet (en beskåret fixture)
 * @returns {{kampe: Array, afviste: Array<{nr, sektion, grund}>, ikkeSpillet: number, ukendteFelter: Record<string, number>}}
 */
export function udtraekKampe(wikitekst, turnering, { minSpillede = MIN_SPILLEDE } = {}) {
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
      afviste.push({ nr: b.nr, sektion, grund: e.message });
      continue;
    }
    if (!k.facit) { ikkeSpillet += 1; continue; }
    if (!k.hjemme?.kode || !k.ude?.kode) {
      afviste.push({ nr: b.nr, sektion, grund: 'kampen har en score, men et af holdene er ikke et land ({{hb|KODE}})' });
      continue;
    }
    if (!k.dato) {
      afviste.push({ nr: b.nr, sektion, grund: 'kampen har ingen dato' });
      continue;
    }
    kampe.push({
      turnering,
      dato: k.dato,
      tid: k.tid,
      sektion,
      hjemme: k.hjemme.kode,
      ude: k.ude.kode,
      efter60: k.facit.efter60,
      slut: k.facit.slut,
      afgjort: k.facit.afgjort,
    });
  }
  if (kampe.length < minSpillede) {
    throw new Error(`${turnering}: kun ${kampe.length} spillede kampe på siden (${boxe.length} {{handballbox}}, `
      + `${afviste.length} afvist) — under ${minSpillede}. Siden har skiftet form; intet er skrevet.`);
  }
  kampe.sort((a, b) => a.dato.localeCompare(b.dato) || String(a.tid).localeCompare(String(b.tid)) || a.hjemme.localeCompare(b.hjemme));
  return { kampe, afviste, ikkeSpillet, ukendteFelter };
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
