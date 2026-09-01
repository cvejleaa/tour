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

// ---------------------------------------------------------------------------
// KRAV TIL TRIN 2, skrevet ned mens beslutningerne er friske (Security
// Reviewer, aug. 2026). Trin 2 er selve synken: målscorere, halvleg,
// tilskuertal. Endpointerne er `incidents/soccer/{Eid}` (1,3 KB — Tr1/Tr2,
// Trh1/Trh2, Incs) og `info/soccer/{Eid}` (182 B — Vnm, Vsp, Refs[0].Nm).
//
//  1. LIVESCORE MÅ ALDRIG SKRIVE `result`, `homeGoals` ELLER `awayGoals`.
//     Det er den dyreste regel i hele projektet. `matchOutcome()` udleder
//     facit AF MÅLENE, når `result` mangler (superligaSync.js:206-217), og
//     `recomputeGameMatch` rescorer alle bets, Elo og Runde-Botten, når
//     `result` ændrer sig. En halvlegsstilling i det forkerte felt afgør
//     altså runden på halvtidsresultatet — uigenkaldeligt, fordi snapshot og
//     bot fyrer idempotent. Brug i stedet `Tr1`/`Tr2` som KRYDSVALIDERING:
//     antal mål pr. side skal stemme, og `Trh_i <= Tr_i`. Uenighed → skriv
//     intet, meld alarm.
//  2. LIVESCORE MÅ ALDRIG SKRIVE `kickoff`. Tip-vinduet ER
//     `request.time < kickoff` i firestore.rules, så en fremflytning
//     genåbner vinduet på en spillet kamp. `Esd` er nøglens felt, og netop
//     derfor er det fristende at "rette" vores tid efter den. Lad være.
//  3. `Eid` whitelistes (`/^\d{1,12}$/`), før den går i en URL eller et
//     doc-id.
//  4. `Pn`, `Vnm` og `Refs[].Nm` er FREMMED FRITEKST på vej ud i fladen:
//     typetjek, længdeklip, gennem rensTekst.js — og ude af AI-prompter og
//     mail-HTML, medmindre der escapes ved INDSÆTTELSEN. Validér pr. POST,
//     ikke pr. felt: `{"toString":null}` er JSON-nåbart og får String() til
//     at kaste, så én giftig post ellers vælter hele partiet.
//  5. WHITELIST `IT`. Observeret: 36 = mål, 63 = oplæg, 43 = gult. Alt andet
//     er ukendt — straffe, selvmål og VAR-annullering har vi ikke set. En
//     ukendt kode må ALDRIG falde igennem til "mål".
//  6. GENNEMLØB `Incs` REKURSIVT. Mål+oplæg ligger i en nestet liste inde i
//     et container-objekt uden `IT`; kort ligger fladt. En flad løkke taber
//     mål — i eksempelkampen 1 af 3 — og krydsvalideringen i punkt 1 er dét,
//     der fanger den.
//  7. Byg objektet felt for felt og skriv med `batch.update`, ikke
//     `set(merge:true)`: en fremmed post må ikke kunne oprette et
//     kampdokument. `syncXgCore` er den rene skabelon.
//  8. VOLUMEN: 380 + 132 = 512 kampe × ét kald er en fuldskanning. Aldrig i
//     sweep'et uden eget wall-clock-budget OG et "har-vi-det-allerede"-filter
//     — `XG_LOFT` var et loft på ØNSKER, ikke på KALD, og 600 dubletter gav
//     601 fetch. Cloud Functions egresser desuden gennem delt NAT: bliver vi
//     rate-limited, rammer det nabo-synken.
//  9. Driftlog-kort og alarm fra fødslen, PR. SPIL.
// 10. Fejl bliver KORRELEREDE med én fælles kilde: ét udfald blanker begge
//     spils felter samtidig, hvor de to gamle kilder fejlede uafhængigt.
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
  // Object.hasOwn og ikke AFVIGER[kode]: 'constructor', '__proto__',
  // 'toString' m.fl. arves fra Object.prototype, og opslaget ville svare med
  // en funktion i stedet for at falde tilbage. Ikke nåbart i dag — koderne
  // kommer fra vores egne datafiler — men det er husets kendte fælde i ny
  // forklædning, og prisen for at lukke den er ét ord.
  return Object.hasOwn(AFVIGER, kode) ? AFVIGER[kode] : kode;
}

/**
 * Nøglen, en af vores kampe kobles til livescore med: DATO + BEGGE HOLD.
 *
 * HOLDPARRET ALENE ER IKKE NOK. Tre Premier League-kampe starter rutinemæssigt
 * i samme minut, og i Superligaens mesterskabsspil mødes to hold igen efter
 * grundspillet. Datoen skiller dem ad.
 *
 * KLOKKESLÆTTET VAR MED FØRST, OG DET VAR EN FEJL — fundet i produktion ved
 * første tryk på knappen. FC Midtjylland–Randers FC (runde 5) stod hos os til
 * 12:00:00 og hos dem til 12:05:00, så nøglen ramte aldrig, og kampen kunne
 * ikke kobles. Fejlen var ikke fem minutter; den var at kræve, at TO
 * UAFHÆNGIGE KILDER er enige på sekundet. Vores tid er den PLANLAGTE fra
 * api.superliga.dk, deres er den, kampen faktisk blev sat i gang på. De to
 * begreber er ikke det samme, og de vil aldrig blive det.
 *
 * MÅLT (scripts/maal-livescore-detaljer.mjs, 1/9-2026), begge fulde sæsoner:
 *
 *                     dubletter hos os   hos dem   ukoblede færdige kampe
 *   dato + holdpar           0              0                0
 *   holdpar alene            0              0                –
 *
 * Holdparret alene er altså entydigt i DAG, men kun fordi vores programfiler
 * rummer grundspillet. Datoen bliver, så et mesterskabsspil ikke kræver en
 * ny nøgle.
 *
 * MIDNAT er den ene måde, en dato-nøgle kan knække: en kamp, der udskydes
 * hen over døgnskiftet, får en anden dato hos den ene kilde. Målt luft i UTC:
 * Superligaens seneste kickoff er 18:00 (6 timer), Premier Leagues 20:00
 * (4 timer). En udskydelse så lang ville uanset hvad kræve et menneske.
 *
 * `Esd` er livescores eget format: 20260831190000, uden separatorer — men
 * IKKE nødvendigvis UTC. Det sidste segment i `stage/.../{OFFSET}` er et
 * UTC-offset i TIMER, ikke en version, og kilden regner `Esd` om efter det.
 * Målt på samme kamp (Arsenal-Coventry, Eid 1793530):
 *
 *     /0 → 20260821190000   ← ægte UTC, og det vi bruger
 *     /2 → 20260821210000
 *     /5 → 20260822000000
 *
 * Offsettet er FAST og følger ikke sommertid, så `/2` faldt tilfældigvis
 * sammen med dansk tid, da koden blev skrevet, og ville være én time forkert
 * fra sidste søndag i oktober. Hent derfor altid med `/0`, og sammenlign mod
 * UTC. Det gælder OGSÅ med en dato-nøgle — faktisk skarpere: et forkert
 * offset flytter en aftenkamp til dagen efter.
 *
 * @param {number|string} esd    kickoff som livescore skriver det (14 cifre)
 * @param {string} hjemmeKode    vores kortkode
 * @param {string} udeKode       vores kortkode
 * @returns {string|null}
 */
function kampNoegle(esd, hjemmeKode, udeKode) {
  const h = livescoreKode(hjemmeKode);
  const u = livescoreKode(udeKode);
  if (!h || !u) return null;
  const t = String(esd ?? '');
  // Der kræves stadig 14 cifre af INPUTTET, selv om kun de otte bruges: en
  // afkortet tid ville ellers slippe igennem som en gyldig dato, og en for
  // lang cifferstreng ville få sin dato læst af de forkerte cifre. Båndet
  // lukker BEGGE ender — det var også dét, trin 1's første udgave manglede.
  if (!/^\d{14}$/.test(t)) return null;
  const dato = t.slice(0, 8);
  // En dato skal være en dato. '00000000' er 14 cifre og ville ellers blive
  // en gyldig nøgle, alle ulæselige tider delte.
  if (!/^(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.test(dato)) return null;
  // Og koderne skal valideres, ikke kun tiden. Uden det kolliderer
  // ('A|B','C') med ('A','B|C') i én og samme nøgle: separatoren kan indgå i
  // et felt, og så betyder nøglen ikke længere ét bestemt kampopslag.
  if (!/^[A-Z0-9]{2,5}$/.test(h) || !/^[A-Z0-9]{2,5}$/.test(u)) return null;
  return `${dato}|${h}|${u}`;
}

module.exports = { AFVIGER, livescoreKode, kampNoegle };
