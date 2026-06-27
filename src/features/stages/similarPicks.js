// ---------------------------------------------------------------------------
// similarPicks – find spillerens allerede-tippede etaper af SAMME type som den
// aktuelle (flad/kuperet/bjerg/enkeltstart/holdtidskørsel). Bruges til "hent tip
// fra en lignende etape": på en bjergetape vil man typisk genbruge sine valg fra
// en anden bjergetape. Ren funktion — kaldes fra StagesPage.
// ---------------------------------------------------------------------------
import { STAGE_FIELDS } from '../../lib/tourScoring';

/** True hvis et bet har mindst ét udfyldt holdvalg. */
function hasAnyPick(bet) {
  return !!bet && STAGE_FIELDS.some(({ key }) => bet[key] != null && bet[key] !== '');
}

/** Træk de fire holdvalg ud af et bet (manglende felter bliver tom streng). */
function picksFromBet(bet) {
  const picks = {};
  for (const { key } of STAGE_FIELDS) picks[key] = bet[key] ?? '';
  return picks;
}

/**
 * Alle spillerens allerede-tippede etaper af SAMME type som den aktuelle
 * (ekskl. etapen selv), sorteret efter etapenummer. Hvert element har de
 * holdvalg der kan kopieres, så UI'et kan vise en menu og kopiere direkte.
 *
 * @param {{id:string, number:number, type?:string}} stage  den aktuelle etape
 * @param {Array<{id:string, number:number, type?:string, startCity?:string, finishCity?:string}>} stages
 * @param {Record<string, object>} betsByStage  map stageId → bet
 * @returns {Array<{id, number, startCity, finishCity, picks}>}
 */
export function similarStagesFor(stage, stages, betsByStage) {
  if (!stage || !stage.type) return [];
  return (stages || [])
    .filter((s) => s && s.id !== stage.id && s.type === stage.type
      && hasAnyPick(betsByStage?.[s.id]))
    .sort((a, b) => a.number - b.number)
    .map((s) => ({
      id: s.id,
      number: s.number,
      startCity: s.startCity ?? '',
      finishCity: s.finishCity ?? '',
      picks: picksFromBet(betsByStage[s.id]),
    }));
}
