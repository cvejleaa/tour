/**
 * leagueQuestionScoring — ren scoring af LIGA-SPØRGSMÅL (liga-ejerens egne
 * spørgsmål i en spil-liga). Ingen Firebase-afhængigheder (testbar).
 *
 * Typer: 'text' (normaliseret match mod facit + acceptedAnswers),
 *        'yesno' ('ja'/'nej'), 'number' (nærmeste svar vinder — alle der deler
 *        den mindste afstand får FULDE point).
 * Et spørgsmål uden facit giver 0 (endnu ikke afgjort).
 */

export const LQ_TYPES = ['text', 'yesno', 'number'];
export const DEFAULT_LQ_POINTS = 5;

/** Normalisér et tekstsvar til sammenligning. */
export function lqNorm(s) {
  return String(s ?? '').toLowerCase().trim().replace(/\s+/g, ' ');
}

/** Spørgsmålets point (positivt tal, ellers default). */
export function lqPoints(q) {
  const p = Number(q?.points);
  return Number.isFinite(p) && p > 0 ? p : DEFAULT_LQ_POINTS;
}

/** Er spørgsmålet afgjort (facit sat)? */
export function lqSettled(q) {
  return q?.facit != null && String(q.facit).trim() !== '';
}

/**
 * Point pr. uid for ÉT spørgsmål. answers = [{uid, answer}].
 * @returns {Record<string, number>}
 */
export function scoreLeagueQuestion(q, answers) {
  const out = {};
  if (!lqSettled(q)) return out;
  const pts = lqPoints(q);

  if (q.type === 'number') {
    const target = Number(String(q.facit).replace(',', '.'));
    if (!Number.isFinite(target)) return out;
    let best = Infinity;
    const dist = [];
    for (const a of answers || []) {
      const n = Number(String(a?.answer ?? '').replace(',', '.'));
      if (!Number.isFinite(n)) continue;
      const d = Math.abs(n - target);
      dist.push({ uid: a.uid, d });
      if (d < best) best = d;
    }
    for (const { uid, d } of dist) if (d === best) out[uid] = pts;
    return out;
  }

  const accepted = new Set([lqNorm(q.facit), ...(q.acceptedAnswers || []).map(lqNorm)].filter(Boolean));
  for (const a of answers || []) {
    if (a?.uid && accepted.has(lqNorm(a.answer))) out[a.uid] = pts;
  }
  return out;
}

/**
 * Samlede liga-spørgsmåls-point pr. uid på tværs af alle spørgsmål.
 * @param {Array<object>} questions
 * @param {Record<string, Array<{uid:string, answer:*}>>} answersByQid
 * @returns {Record<string, number>}
 */
export function leagueQuestionPointsByUid(questions, answersByQid) {
  const totals = {};
  for (const q of questions || []) {
    const per = scoreLeagueQuestion(q, answersByQid?.[q.id] || []);
    for (const [uid, p] of Object.entries(per)) totals[uid] = (totals[uid] || 0) + p;
  }
  return totals;
}

/**
 * Ligaens interne stilling MED liga-spørgsmåls-point: filtrér til medlemmer,
 * læg spørgsmåls-point til, sortér og giv delt rang (1224).
 * @param {Array<{uid:string, name:string, totalPoints:number}>} standings
 * @param {Array<string>} memberUids
 * @param {Record<string, number>} lqByUid
 */
export function leagueRankingWithQuestions(standings, memberUids, lqByUid = {}) {
  const set = new Set(memberUids || []);
  const rows = (standings || [])
    .filter((r) => set.has(r.uid))
    .map((r) => ({
      ...r,
      lqPoints: Math.round((Number(lqByUid[r.uid]) || 0) * 10) / 10,
      totalPoints: Math.round(((Number(r.totalPoints) || 0) + (Number(lqByUid[r.uid]) || 0)) * 10) / 10,
    }))
    .sort((a, b) => b.totalPoints - a.totalPoints
      || String(a.name || '').localeCompare(String(b.name || ''), 'da'));
  let rank = 0;
  let prev = null;
  return rows.map((r, i) => {
    if (r.totalPoints !== prev) { rank = i + 1; prev = r.totalPoints; }
    return { ...r, rank };
  });
}
