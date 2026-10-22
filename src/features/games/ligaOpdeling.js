/**
 * ligaOpdeling.js — EN LIGAS REGNSKAB: rubrikkerne for de point, der TÆLLER.
 *
 * IKKE i src/lib/ligaPoint.js, selv om den regner på samme `perRound` og
 * samme startrunde. Den fil er SPEJLET mod functions-platform/ligaPoint.js
 * (CLAUDE.md), og serveren har ingen brug for ligaens rubrikker: den gemmer
 * dem pr. runde (`players/{uid}.opdelingPerRunde`) og lader fladen lægge
 * sammen for den liga, man kigger på. Samme begrundelse som rundeSejre.js.
 *
 * HVORFOR IKKE BARE ligaPoint. Den gulver summen ved 0 og lægger puljen på
 * som ét tal. En rubrik må kunne stå i minus (Chancen), og puljen er en
 * rubrik for sig. Til gengæld SKAL afgrænsningen være ligaPoints: samme
 * runder, samme "uden"-nøgle, samme puljeregel. `samme afgrænsning som
 * ligaPoint`-testen binder de to, så en ændring af det ene bliver rød i det
 * andet — modulerne ligger i hver sin fil, netop fordi det ene er spejlet.
 *
 * null OG IKKE NULLER. Mangler feltet, eller mangler en runde, ligaen tæller,
 * HAR vi ikke tallet: spilleren er ikke genberegnet, siden rubrikkerne pr.
 * runde kom til — eller siden den runde blev afgjort, efter en tilbagerulning
 * af functions. Fladen viser en streg og peger på 🔄 Genberegn point. Fire
 * nuller ville påstå, at spilleren ingen point har fået. Samme mønster som
 * `opdeling` og `perRound`.
 *
 * INGEN SUM-VAGT HER — ÉN VAGT PR. REGEL. Om rubrikkerne summer til ligaens
 * total, afgør `opdelingsAfvigelse` på rækken, præcis som for spillets
 * regnskab. En ÅBEN REST (point fra en kamp, opdelingen ikke kunne læse —
 * en slettet kamp lander under nøglen "uden" og tæller i alle ligaer) skal
 * vise rubrikkerne MED stjerne, ikke en streg: stregen siger "kør Genberegn",
 * og det hjælper ikke mod en slettet kamp — resten er permanent. Strukturen
 * vogtes her, summen dér.
 */
import { harRundeVektor, puljenTaeller, UDEN_RUNDE } from '../../lib/ligaPoint';

/** De tre rubrikker, serveren gemmer pr. runde. Puljen er spil-niveau. */
export const RUNDE_RUBRIKKER = ['p1x2', 'chance', 'combi'];

// `|| 0` gør −0 til 0: en sum af negative tal, der går lige op, må ikke stå
// som «−0» i tabellen.
const round1 = (n) => Math.round(n * 10) / 10 || 0;

/**
 * Tæller nøglen med i en liga fra `startRunde`? SAMME regel som ligaPoint:
 * "uden" altid, et ulæseligt rundenummer aldrig, og runder før starten ikke.
 */
function taeller(noegle, startRunde) {
  if (noegle === UDEN_RUNDE) return true;
  const r = Number(noegle);
  if (!Number.isFinite(r)) return false;
  return !(Number.isFinite(startRunde) && r < startRunde);
}

/**
 * En spillers rubrikker i ÉN liga — eller null, når de ikke kan regnes.
 *
 * Det er `perRound`, der afgør, HVILKE runder der tælles (den er grundlaget
 * for ligaens total), og hver talt runde SKAL findes i `opdelingPerRunde`
 * med tre læselige tal. En runde FØR startrunden må gerne mangle: den vedrører
 * ikke denne liga. Nøgler, der kun findes i `opdelingPerRunde`, ignoreres —
 * totalen kender dem ikke.
 *
 * @param {object|null} perRound          runde → point (serverens vektor)
 * @param {object|null} opdelingPerRunde  runde → {p1x2, chance, combi}
 * @param {number|null} startRunde        ligaens startrunde; null = hele spillet
 * @param {number} puljeBonus             players/{uid}.bonusPoints
 * @returns {{p1x2:number, chance:number, combi:number, pulje:number}|null}
 */
export function ligaOpdeling(perRound, opdelingPerRunde, startRunde, puljeBonus = 0) {
  if (!harRundeVektor(perRound) || !harRundeVektor(opdelingPerRunde)) return null;
  const sum = { p1x2: 0, chance: 0, combi: 0 };
  for (const noegle of Object.keys(perRound)) {
    if (!taeller(noegle, startRunde)) continue;
    const rk = opdelingPerRunde[noegle];
    if (!rk || typeof rk !== 'object') return null;
    for (const key of RUNDE_RUBRIKKER) {
      // Afvis ulæselige værdier i stedet for at gøre dem til nul (samme
      // beslutning som rundeSejre): et manglende tal er en manglende runde.
      if (typeof rk[key] !== 'number' || !Number.isFinite(rk[key])) return null;
      sum[key] += rk[key];
    }
  }
  return {
    p1x2: round1(sum.p1x2),
    chance: round1(sum.chance),
    combi: round1(sum.combi),
    // Puljen tæller kun i ligaer fra sæsonens start (puljenTaeller). 0 og ikke
    // null: `opdelingsAfvigelse` summerer alle fire rubrikker, og fladen
    // skjuler kolonnen, når ligaen ikke tæller den.
    pulje: puljenTaeller(startRunde) ? round1(Number(puljeBonus) || 0) : 0,
  };
}
