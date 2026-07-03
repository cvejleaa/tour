// Rene hjælpefunktioner til forsidens "egen statistik" og "seneste resultater".
// Hold-baseret Tour de France-udgave: bygger på etaper + etape-tip.
import { scoreStageBet, STAGE_FIELDS, isUntipped, stageTipComplete, activeQuestionsForStage } from '../../lib/tourScoring';
import { stageStatus } from '../../lib/tourStages';

function kickoffMs(kickoff) {
  if (!kickoff) return 0;
  const d = typeof kickoff?.toDate === 'function' ? kickoff.toDate() : new Date(kickoff);
  const t = d.getTime();
  return Number.isNaN(t) ? 0 : t;
}

/** Er etapen afgjort (har et resultat)? */
function isDone(stage) {
  return stageStatus(stage, Date.now()) === 'done';
}

/**
 * Antal ÅBNE etaper (tip stadig muligt) hvor brugeren mangler at tippe helt
 * eller kun har tippet delvist. "Komplet" = alle AKTIVE spørgsmål for etapen er
 * besvaret (en holdtidskørsel kræver fx kun ét). Bruges til forsidens
 * "Mine opgaver" — samme definition som etape-listen, så de altid stemmer.
 * @param {Array<object>} stages
 * @param {Record<string, object>} betsByStage  stageId -> bet
 * @returns {number}
 */
export function countUntippedOpenStages(stages, betsByStage = {}) {
  return (stages ?? []).filter(
    (s) => stageStatus(s, Date.now()) === 'scheduled' && !stageTipComplete(s, betsByStage[s.id]),
  ).length;
}

/**
 * Brugerens egen statistik over alle afgjorte etaper, hvor han har tippet.
 * @param {Array<object>} stages
 * @param {Record<string, object>} betsByStage  stageId -> bet
 * @param {object} [points]  point-config (flettes med standard)
 * @returns {{tips:number, hits:number, points:number, avgPoints:number, hitPct:number}}
 */
export function computeMyStats(stages, betsByStage = {}, points = {}) {
  let tips = 0;   // antal afgjorte etaper med et (ikke-tomt) tip
  let hits = 0;   // antal holdvalg der gav point (podietræf)
  let fields = 0; // antal afgjorte AKTIVE felter (facit findes) på tippede etaper
  let total = 0;  // optjente point i alt
  for (const s of stages ?? []) {
    if (!isDone(s) || !s.result) continue;
    const bet = betsByStage[s.id];
    if (isUntipped(bet)) continue;
    tips += 1;
    const scored = scoreStageBet(bet, s.result, points, s);
    total += scored.points;
    // Kun spørgsmål der faktisk STILLES på etapen tæller i træfprocenten —
    // et inaktivt spørgsmål (fx bjerg på en holdtidskørsel) kunne brugeren
    // aldrig tippe, så det må ikke tælle som en forbier. Et "træf" er et
    // podietræf (gav point), så procenten matcher de point man ser.
    const active = activeQuestionsForStage(s);
    for (const { key } of STAGE_FIELDS) {
      if (!active[key]) continue;
      const facit = s.result[key];
      if (facit == null || facit === '') continue;
      fields += 1;
      if ((scored.breakdown[key] ?? 0) > 0) hits += 1;
    }
  }
  return {
    tips,
    hits,
    points: total,
    avgPoints: tips ? Math.round((total / tips) * 10) / 10 : 0,
    hitPct: fields ? Math.round((hits / fields) * 100) : 0,
  };
}

/**
 * De seneste afgjorte etaper (nyeste først) med de point brugeren fik på hver.
 * @param {Array<object>} stages
 * @param {Record<string, object>} betsByStage  stageId -> bet
 * @param {object} [points]
 * @param {number} [limit]
 * @returns {Array<{stage:object, points:number|null, bet:object|null}>}
 */
export function recentResults(stages, betsByStage = {}, points = {}, limit = 5) {
  return (stages ?? [])
    .filter((s) => isDone(s) && s.result)
    .sort((a, b) => kickoffMs(b.kickoff) - kickoffMs(a.kickoff))
    .slice(0, limit)
    .map((s) => {
      const bet = betsByStage[s.id];
      const has = !isUntipped(bet);
      return {
        stage: s,
        points: has ? scoreStageBet(bet, s.result, points, s).points : null,
        bet: has ? bet : null,
      };
    });
}
