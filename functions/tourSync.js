// ---------------------------------------------------------------------------
// functions/tourSync.js — ren logik for resultat-sync (testbar, ingen IO).
// Oversætter et proxy-payload (/api/stages/{n}) til den opdatering der skrives
// på et stages-dokument: facit (de fire vinderhold), trøje-indehavere, meta,
// og de hold der skal selv-udfyldes i `teams`.
// ---------------------------------------------------------------------------

const { pcsToStageInput, jerseyHolders, stageMetaFromPcs } = require('./pcsMapping');
const { resolveStageResult } = require('./tourScoring');
const { teamsFromRows } = require('./tourTeams');

/**
 * @param {object} payload  proxy /api/stages/{n}
 * @param {number} [gcTopN] top-N til Q2
 * @returns {{result, jerseys, meta, teams, resultsPresent}}
 */
function buildStageUpdate(payload, gcTopN) {
  // letour leverer sprint/bjerg PÅ etapen (ikke kumulativt), så ingen delta.
  const input = pcsToStageInput(payload, { gcTopN });
  const result = resolveStageResult(input);
  const etapeRows = (payload && payload.classifications && payload.classifications.etape
    && payload.classifications.etape.rows) || [];
  return {
    result,
    jerseys: jerseyHolders(payload),
    meta: stageMetaFromPcs(payload),
    teams: teamsFromRows(etapeRows),
    resultsPresent: Boolean(payload && payload.results_present) || etapeRows.length > 0,
  };
}

module.exports = { buildStageUpdate };
