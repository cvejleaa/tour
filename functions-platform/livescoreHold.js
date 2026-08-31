// ---------------------------------------------------------------------------
// functions-platform/livescoreHold.js — VORES HOLDKODER ⇄ LIVESCORES.
//
// Livescore bruger sine egne kortkoder, og de er IKKE vores. Målt med
// scripts/maal-livescore.mjs (31/8-2026): Premier League matcher 19 af 20,
// Superligaen kun 5 af 12. Otte hold har hver sin kode de to steder.
//
// TABELLEN ER SKREVET I HÅNDEN MED VILJE. Et gæt ud fra navnelighed ville
// have ramt fire af de syv danske — "F.C. København" mod "FC Copenhagen" og
// "Sønderjyske Fodbold" mod "SoenderjyskE" deler ikke nok bogstaver til, at
// en heuristik kan bære dem. En kortlægning, der gætter, fejler tavst på det
// ene hold, ingen kigger efter.
//
// KUN AFVIGELSERNE STÅR HER. De 24 hold, hvis kode er den samme begge steder,
// nævnes ikke — så kan tabellen ikke drive fra sig selv, og en ny liga uden
// afvigelser koster ingen linjer. `livescoreKode` falder tilbage på vores egen
// kode, og paritetstesten efterprøver, at fald-tilbagen er rigtig for hver
// eneste af dem.
//
// NÅR LIVESCORE OMDØBER ET HOLD, er det denne fil, der skal rettes — og
// livescoreHold.test.js, der siger det. Testen læser den LEVENDE kilde, så
// den fejler dagen efter en omdøbning i stedet for i næste sæson.
// ---------------------------------------------------------------------------

/**
 * Vores kortkode → livescores kode, KUN hvor de er forskellige.
 * Målt 31/8-2026. Rækkefølgen er spil, så en liga kan læses i ét blik.
 */
const AFVIGER = {
  // Premier League — én af tyve.
  NFO: 'FOR', // Nottingham Forest

  // Superligaen — syv af tolv. Deres navne er anglificerede, hvilket er
  // grunden til, at koderne følger med: "Broendby", "FC Copenhagen".
  BIF: 'BRO', // Brøndby IF
  FCK: 'COP', // F.C. København
  LBK: 'LYN', // Lyngby Boldklub
  RFC: 'RAN', // Randers FC
  SIF: 'SIL', // Silkeborg IF
  SJF: 'SOE', // Sønderjyske Fodbold
  VFF: 'VIB', // Viborg FF
};

/**
 * Livescores kode for et af vores hold.
 *
 * Fald-tilbagen er ikke dovenskab: 24 af 32 hold HAR samme kode, og at skrive
 * dem alle ville gøre tabellen til en kopi, der kan drive. Paritetstesten
 * efterprøver hver enkelt fald-tilbage mod den levende kilde.
 *
 * @param {string} kode  vores `short` (fx 'VFF')
 * @returns {string|null}
 */
function livescoreKode(kode) {
  if (typeof kode !== 'string' || kode === '') return null;
  return AFVIGER[kode] || kode;
}

/**
 * Nøglen, en af vores kampe kobles til livescore med.
 *
 * KICKOFF + BEGGE HOLD, og ikke ét af dem alene: tre Premier League-kampe
 * starter rutinemæssigt i samme minut. Målt er nøglen entydig for begge
 * spils fulde sæson (380 og 132 kampe, nul dubletter) — den måling er hele
 * grunden til, at kortlægningen kan automatiseres.
 *
 * `Esd` er livescores eget format: 20260831190000 (UTC, uden separatorer).
 *
 * @param {number|string} esd    kickoff som livescore skriver det
 * @param {string} hjemmeKode    vores kortkode
 * @param {string} udeKode       vores kortkode
 * @returns {string|null}
 */
function kampNoegle(esd, hjemmeKode, udeKode) {
  const h = livescoreKode(hjemmeKode);
  const u = livescoreKode(udeKode);
  if (!h || !u) return null;
  const t = String(esd ?? '');
  // 14 cifre, ikke "noget der ligner": en afkortet eller tom tid ville give
  // en nøgle, der matcher forkert frem for slet ikke at matche.
  if (!/^\d{14}$/.test(t)) return null;
  return `${t}|${h}|${u}`;
}

module.exports = { AFVIGER, livescoreKode, kampNoegle };
