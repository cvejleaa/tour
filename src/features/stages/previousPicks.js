// ---------------------------------------------------------------------------
// previousPicks – find spillerens holdvalg fra den SENESTE tidligere etape de
// har tippet (højeste stage.number < den aktuelle etapes number, med mindst ét
// udfyldt felt). Ren funktion — bruges fra StagesPage til "Kopiér fra forrige
// etape".
// ---------------------------------------------------------------------------
import { STAGE_FIELDS } from '../../lib/tourScoring';

/** True hvis et bet har mindst ét udfyldt holdvalg. */
function hasAnyPick(bet) {
  return !!bet && STAGE_FIELDS.some(({ key }) => bet[key] != null && bet[key] !== '');
}

/**
 * Find de fire holdvalg fra den seneste tidligere tippede etape.
 * @param {{number:number}} stage  den aktuelle etape
 * @param {Array<{id:string, number:number}>} stages  hele etapelisten
 * @param {Record<string, object>} betsByStage  map stageId → bet
 * @returns {{winnerTeam,gcTeam,mountainTeam,sprintTeam}|null} picks eller null
 */
export function previousPicksFor(stage, stages, betsByStage) {
  if (!stage || stage.number == null) return null;
  const earlier = (stages || [])
    .filter((s) => s && s.number != null && s.number < stage.number && hasAnyPick(betsByStage?.[s.id]))
    .sort((a, b) => b.number - a.number);
  const prev = earlier[0];
  if (!prev) return null;
  const bet = betsByStage[prev.id];
  const picks = {};
  for (const { key } of STAGE_FIELDS) picks[key] = bet[key] ?? '';
  return picks;
}
