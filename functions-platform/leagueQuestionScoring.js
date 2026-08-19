/**
 * leagueQuestionScoring — SERVER-SPEJL af src/features/games/leagueQuestionScoring.js
 * (kun scoringen — klientens rangliste-hjælpere hører ikke hjemme her).
 *
 * SPEJLEDE FILER FØLGES AD: ret aldrig i den ene uden den anden.
 * Paritetstesten i leagueQuestionScoring.test.js importerer klient-udgaven og
 * holder de to op mod hinanden på fælles fixtures.
 *
 * Spejlet findes, fordi Runde-Bottens afsløring skal sige "hvem fik point" —
 * og den må ikke udlede det ad sin egen vej (to steder, der udleder samme tal
 * ad hver sin vej, driver fra hinanden ved næste ændring).
 */

const LQ_TYPES = ['text', 'yesno', 'number', 'team'];
const DEFAULT_LQ_POINTS = 5;

/** Normalisér et tekstsvar til sammenligning. */
function lqNorm(s) {
  // Fjendtligt indhold (fx {toString: null} gemt uden om fladen) må ikke
  // kunne vælte scoringen — String() kaster på den slags. Ikke-konverterbart
  // tæller som tomt svar (Security-fund: ét giftigt svar dræbte både
  // afsløringen og hele spørgsmålsfladen).
  let t;
  try { t = String(s ?? ''); } catch { return ''; }
  return t.toLowerCase().trim().replace(/\s+/g, ' ');
}

/** Spørgsmålets point (positivt tal, ellers default). */
function lqPoints(q) {
  const p = Number(q?.points);
  return Number.isFinite(p) && p > 0 ? p : DEFAULT_LQ_POINTS;
}

/** Er spørgsmålet afgjort (facit sat)? */
function lqSettled(q) {
  if (q?.facit == null) return false;
  try { return String(q.facit).trim() !== ''; } catch { return false; }
}

/**
 * Point pr. uid for ÉT spørgsmål. answers = [{uid, answer}].
 *
 * VIGTIGT (QC-fund): 'number'-typen er SÆT-AFHÆNGIG ("nærmest vinder") —
 * hvem der vinder afhænger af hvilke svar, der er med. Kalderen skal derfor
 * altid give HELE svarsættet for spørgsmålet, også svar fra spillere, der
 * siden har forladt ligaen — ellers kan serveren udnævne en anden vinder end
 * den, fladen viser.
 * @returns {Record<string, number>}
 */
function scoreLeagueQuestion(q, answers) {
  const out = {};
  if (!lqSettled(q)) return out;
  const pts = lqPoints(q);

  if (q.type === 'number') {
    const target = Number(lqNorm(q.facit).replace(',', '.'));
    if (!Number.isFinite(target)) return out;
    let best = Infinity;
    const dist = [];
    for (const a of answers || []) {
      const n = Number(lqNorm(a?.answer).replace(',', '.'));
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

module.exports = {
  LQ_TYPES, DEFAULT_LQ_POINTS, lqNorm, lqPoints, lqSettled, scoreLeagueQuestion,
};
