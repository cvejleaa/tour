// ---------------------------------------------------------------------------
// stageAnswerRows – ren logik bag "alles svar" pr. etape: liga-afgrænsning,
// scoring af hver spillers tip mod facit, og sortering (flest point øverst =
// etapens top). UI'et ligger i StageAnswers.jsx.
// ---------------------------------------------------------------------------
import { scoreStageBet, activeQuestionsForStage } from '../../lib/tourScoring';

/**
 * Byg de sorterede rækker til etape-svar-visningen.
 * @param {Array<object>} bets  alle etape-tips for etapen (fra useStageBets)
 * @param {object} opts
 * @param {object} opts.stage  etapen (til aktive spørgsmål)
 * @param {object} opts.result  facit inkl. podium (typisk stage.result)
 * @param {object} [opts.points]  point-config
 * @param {Set<string>|null} [opts.visibleUids]  uids man må se (liga); null = alle
 * @param {boolean} [opts.isAdmin]  admin ser alle uanset liga
 * @param {string} [opts.meUid]  egen uid (ses altid)
 * @param {(uid:string)=>string} [opts.nameOf]  navneopslag til sortering
 * @returns {Array<{bet:object, scored:{points:number,breakdown:object,untipped:boolean}}>}
 */
export function stageAnswerRows(bets, {
  stage, result, points, visibleUids = null, isAdmin = false, meUid = '', nameOf,
} = {}) {
  const active = activeQuestionsForStage(stage);
  const name = typeof nameOf === 'function' ? nameOf : (uid) => uid;
  const visible = (Array.isArray(bets) ? bets : []).filter(
    (b) => b && (isAdmin || !visibleUids || b.uid === meUid || visibleUids.has(b.uid)),
  );
  return visible
    .map((bet) => ({ bet, scored: scoreStageBet(bet, result, points, active) }))
    .sort((a, b) => (
      (b.scored.points - a.scored.points)
      || String(name(a.bet.uid)).localeCompare(String(name(b.bet.uid)), 'da')
    ));
}

/**
 * "Etapens top": spillere med point > 0, sorteret faldende. Skærer IKKE
 * uafgjorte placeringer fra — er der flere spillere lige med den `limit`.
 * placering, kommer de alle med (så alle på delt sidsteplads vises).
 * @param {Array<{scored:{points:number}}>} rows  fra stageAnswerRows (sorteret)
 * @param {number} [limit=3]
 * @returns {Array}
 */
export function stageTop(rows, limit = 3) {
  const scored = (Array.isArray(rows) ? rows : []).filter((r) => r.scored.points > 0);
  if (scored.length <= limit) return scored;
  const cutoff = scored[limit - 1].scored.points; // pointtal på limit-pladsen
  return scored.filter((r) => r.scored.points >= cutoff);
}
