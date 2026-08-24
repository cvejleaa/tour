/**
 * rundeSejre.js — SÆSONENS ANDEN POKAL: hvem tog flest runder?
 *
 * IKKE i src/lib/ligaPoint.js, selv om den regner på det samme `perRound`.
 * Den fil er SPEJLET mod functions-platform/ligaPoint.js (CLAUDE.md), og
 * serveren har ingen brug for rundesejre. Lagde vi dem der, ville den næste,
 * der spejler filen, enten kopiere død kode til serveren eller lade de to
 * drive fra hinanden. Her er de rent klient-side, og det er synligt.
 *
 * Til gengæld SKAL afgrænsningen være den samme som ligaens point: en liga,
 * der tæller fra runde 20, må ikke arve sejre fra runde 3. Derfor importeres
 * `harRundeVektor` herfra, og `sammeRunderSomLigaPoint`-testen binder de to
 * begreber sammen, så en fremtidig ændring af det ene bliver rød i det andet.
 *
 * HVORFOR EN POKAL MERE. Tabellen er ofte afgjort i december. Rundesejre
 * skifter hånd hver uge, og føreren har dem tit ikke: man kan vinde fire runder
 * og stadig ligge nummer fem, fordi man taber de øvrige stort. Nummer sidst i
 * november får noget at spille om i marts.
 */
import { harRundeVektor } from '../../lib/ligaPoint';

/**
 * Hvilke runder er FÆRDIGSPILLEDE?
 *
 * `perRound` har point, så snart ÉN kamp i runden er afgjort, så en "sejr" i
 * en halvspillet runde ville skifte hver dag. Færdigheden afgøres derfor af
 * KAMPPROGRAMMET, ikke af pointvektoren — og en runde tæller først, når hver
 * eneste af dens kampe har facit. Det gælder også den udsatte: Superligaens
 * runde 3 strakte sig 7. august til 3. september, og rundekongen må ikke
 * kåres, før den sidste kamp er spillet.
 *
 * @param {Array<{round:number, result?:string|null}>} matches
 * @returns {Array<number>} stigende
 */
export function faerdigeRunder(matches) {
  const pr = new Map();
  for (const m of matches || []) {
    const r = Number(m?.round);
    if (!Number.isFinite(r)) continue;
    const afgjort = m.result != null && m.result !== '';
    pr.set(r, (pr.get(r) ?? true) && afgjort);
  }
  return [...pr.entries()].filter(([, alle]) => !alle).map(([r]) => r).sort((a, b) => a - b);
}

/**
 * Rundesejre pr. spiller.
 *
 * UAFGJORT DELES. To spillere med samme rundepoint får begge sejren.
 * Alternativet — at ingen får den — ville lade en pokal forsvinde, netop når
 * to var lige gode, og det er den mest uforståelige udgave for dem, det
 * handler om.
 *
 * NUL VINDER IKKE. Ramte hele feltet forbi i en runde, er der ingen vinder.
 * Ellers ville en runde, alle tabte, uddele en pokal til samtlige deltagere.
 *
 * EN MANGLENDE NØGLE ER IKKE NUL. Deltog en spiller ikke i runden, står han
 * uden for opgørelsen — han skal hverken vinde den eller trække snittet ned.
 * Det følger af, at Number(undefined) er NaN, sammen med kravet om at en
 * vinder skal have mere end nul. Se vagten i løkken.
 *
 * @param {Array<{uid:string, perRound:object|null}>} spillere
 * @param {number|null} startRunde  ligaens startrunde; null = hele spillet
 * @param {Iterable<number>} runder  fra faerdigeRunder()
 * @returns {Map<string, number>} uid → vundne runder (kun dem med mindst én)
 */
export function rundeSejre(spillere, startRunde, runder) {
  const sejre = new Map();
  for (const raaRunde of runder || []) {
    const runde = Number(raaRunde);
    if (!Number.isFinite(runde)) continue;
    // Samme afgrænsning som ligaPoint: runder før ligaens start tæller ikke.
    if (Number.isFinite(startRunde) && runde < startRunde) continue;

    let bedst = null;
    let vindere = [];
    for (const s of spillere || []) {
      if (!harRundeVektor(s?.perRound)) continue;
      // ÉN vagt: værdien skal være et læseligt tal. En manglende nøgle giver
      // NaN og falder ud her. En eksplicit null ville blive 0 — og nul kan
      // aldrig vinde, fordi en vinder skal have MERE end nul (nedenfor). En
      // ekstra `raa == null`-vagt stod her først; den kunne fjernes uden at
      // ændre et eneste udfald, altså to vagter om samme regel.
      const v = Number(s.perRound[String(runde)]);
      if (!Number.isFinite(v)) continue;
      if (bedst == null || v > bedst) { bedst = v; vindere = [s.uid]; } else if (v === bedst) vindere.push(s.uid);
    }
    if (bedst == null || bedst <= 0) continue;
    for (const uid of vindere) sejre.set(uid, (sejre.get(uid) || 0) + 1);
  }
  return sejre;
}
