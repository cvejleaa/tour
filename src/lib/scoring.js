// ---------------------------------------------------------------------------
// Delt, ren pointlogik (ingen Firebase-afhængigheder).
// Bruges af frontend til at vise mulige point, OG spejles 1:1 i Cloud Functions
// (functions/scoring.js) som den autoritative beregning. Hold dem identiske!
// ---------------------------------------------------------------------------

export const POINTS = {
  EXACT: 5, // helt korrekt score
  GOAL_DIFF: 3, // korrekt udfald + korrekt målforskel (men ikke eksakt)
  OUTCOME: 2, // korrekt udfald (1-X-2), forkert målforskel
  WRONG: 0,
  KNOCKOUT_ADVANCE: 2, // korrekt "hvem går videre" i knockout
  BONUS: 10, // pr. korrekt bonus-svar (topscorer / gruppevinder)
};

/** Returnerer 'home' | 'draw' | 'away' for en score. */
export function outcome(home, away) {
  if (home > away) return 'home';
  if (home < away) return 'away';
  return 'draw';
}

/**
 * Beregner point for et score-tip mod et facit.
 * @param {{home:number, away:number}} bet  spillerens tip
 * @param {{home:number, away:number}} result  det faktiske resultat (ordinær tid)
 * @returns {number}
 */
export function scoreMatch(bet, result) {
  if (!bet || !result) return 0;
  if (
    !Number.isFinite(bet.home) || !Number.isFinite(bet.away) ||
    !Number.isFinite(result.home) || !Number.isFinite(result.away)
  ) return 0;

  if (bet.home === result.home && bet.away === result.away) return POINTS.EXACT;

  const sameOutcome = outcome(bet.home, bet.away) === outcome(result.home, result.away);
  if (!sameOutcome) return POINTS.WRONG;

  const sameDiff = bet.home - bet.away === result.home - result.away;
  return sameDiff ? POINTS.GOAL_DIFF : POINTS.OUTCOME;
}

/**
 * Samlet point for en knockout-kamp: score-point + evt. point for korrekt
 * "hvem går videre".
 * @param {{home:number, away:number, advance?:string}} bet
 * @param {{home:number, away:number, advance?:string}} result
 */
export function scoreKnockout(bet, result) {
  let pts = scoreMatch(bet, result);
  if (bet?.advance && result?.advance && bet.advance === result.advance) {
    pts += POINTS.KNOCKOUT_ADVANCE;
  }
  return pts;
}

/** Normaliser et bonus-svar: trim + små bogstaver (tolerant matchning). */
function normalizeAnswer(v) {
  return String(v).trim().toLowerCase();
}

/** Point for et bonus-svar (ufølsomt for store/små bogstaver og mellemrum). */
export function scoreBonus(answer, facit) {
  if (answer == null || facit == null) return 0;
  if (normalizeAnswer(answer) === '' || normalizeAnswer(facit) === '') return 0;
  return normalizeAnswer(answer) === normalizeAnswer(facit) ? POINTS.BONUS : 0;
}

// ---------------------------------------------------------------------------
// Fleksibel navnematchning (til topscorer): ufølsom for store/små bogstaver,
// accenter (é→e, ø→o), mellemrum/bindestreg/apostrof, + tolerance for stavefejl
// via Levenshtein-afstand. Plus admin-godkendte svar (acceptedAnswers).
// ---------------------------------------------------------------------------

/** Reducerer et navn til kun a-z0-9 (accenter strippes). */
export function normalizeName(v) {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // fjern diakritiske tegn
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ''); // fjern mellemrum, bindestreg, apostrof osv.
}

/** Levenshtein-afstand mellem to strenge. */
export function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let cur = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

/**
 * Er to navne "tæt nok" på hinanden? Tolerancen skalerer med navnets længde:
 * korte navne kræver eksakt/næsten-eksakt, længere tillader et par stavefejl.
 */
export function fuzzyNameMatch(a, b) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // tillad delvis match for sammensatte navne (fx kun efternavn)
  if (na.length >= 4 && nb.length >= 4 && (na.includes(nb) || nb.includes(na))) return true;
  const dist = levenshtein(na, nb);
  const minLen = Math.min(na.length, nb.length);
  const tol = minLen <= 4 ? 0 : minLen <= 7 ? 1 : 2;
  return dist <= tol;
}

/**
 * Beregner point for et bonus-svar med fuld fleksibilitet.
 * @param {{answer:string, facit:string, type?:string, acceptedAnswers?:string[]}} o
 */
export function bonusPoints({ answer, facit, type, acceptedAnswers = [] }) {
  if (answer == null) return 0;
  const accepted = Array.isArray(acceptedAnswers) ? acceptedAnswers : [];

  // Gruppevinder vælges fra en fast liste (holdkoder) → kræv eksakt match.
  if (type === 'groupWinner') {
    return scoreBonus(answer, facit);
  }

  // Topscorer / fri tekst: fuzzy mod facit ELLER mod et admin-godkendt svar.
  const candidates = [facit, ...accepted].filter((c) => c != null && String(c).trim() !== '');
  for (const c of candidates) {
    if (fuzzyNameMatch(answer, c)) return POINTS.BONUS;
  }
  return 0;
}

