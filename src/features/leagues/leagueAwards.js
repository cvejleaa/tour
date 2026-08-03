/**
 * leagueAwards — ren logik for manuelle liga-point på FÆLLES bonusspørgsmål.
 *
 * En tildeling er ét dokument pr. (liga, spørgsmål):
 *   { leagueId, questionId, label, awards: {uid: points}, updatedBy }
 * Pointene tæller kun i den pågældende liga (under liga-bonus-delen af
 * scoringen), oven i medlemmernes normale point.
 */

/** Dokument-id for en tildeling — SKAL matche security rules. */
export function awardDocId(leagueId, questionId) {
  return `${leagueId}_${questionId}`;
}

/**
 * Rens et awards-map: kun endelige tal ≠ 0, uid'er trimmet. Ikke-tal og 0
 * fjernes (0 = "ingen tildeling" → feltet udelades helt).
 * @param {object} awards  uid → points (rå input, fx fra formularfelter)
 * @returns {object}
 */
export function normalizeAwards(awards) {
  const out = {};
  for (const [uid, v] of Object.entries(awards || {})) {
    const key = String(uid || '').trim();
    const n = Number(v);
    if (!key || !Number.isFinite(n) || n === 0) continue;
    out[key] = n;
  }
  return out;
}

/**
 * Summér tildelinger pr. uid på tværs af en ligas award-dokumenter.
 * @param {Array<{awards?: object}>} docs
 * @returns {object} uid → sum
 */
export function awardsByUidFromDocs(docs) {
  const totals = {};
  for (const d of docs || []) {
    for (const [uid, v] of Object.entries((d && d.awards) || {})) {
      const n = Number(v);
      if (!Number.isFinite(n)) continue;
      totals[uid] = (totals[uid] || 0) + n;
    }
  }
  return totals;
}
