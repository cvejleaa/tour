// ---------------------------------------------------------------------------
// Delte, rene tekst-/navnehjælpere til bonus-svar (ingen Firebase-afhængigheder).
// Bruges af frontend og spejles i Cloud Functions. Hold dem identiske!
//
// Bemærk: etape-pointlogikken (de fire hold-spørgsmål) bor i tourScoring.js.
// Her ligger kun den fleksible svar-matchning, som bonus-spørgsmål bruger.
// ---------------------------------------------------------------------------

/** Point pr. korrekt bonus-svar. */
export const POINTS = {
  BONUS: 10,
};

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
// Fleksibel navnematchning (til fri-tekst-bonus): ufølsom for store/små
// bogstaver, accenter (é→e, ø→o), mellemrum/bindestreg/apostrof, + tolerance
// for stavefejl via Levenshtein-afstand. Plus admin-godkendte svar.
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
 * - type 'exact': kræver eksakt match (fx en holdkode fra en fast liste).
 * - ellers: fuzzy-match mod facit ELLER mod et admin-godkendt svar.
 * @param {{answer:string, facit:string, type?:string, acceptedAnswers?:string[]}} o
 */
export function bonusPoints({ answer, facit, type, acceptedAnswers = [] }) {
  if (answer == null) return 0;
  const accepted = Array.isArray(acceptedAnswers) ? acceptedAnswers : [];

  // Værdier fra en fast liste (fx holdkoder) → kræv eksakt match.
  if (type === 'exact') {
    return scoreBonus(answer, facit);
  }

  // Fri tekst: fuzzy mod facit ELLER mod et admin-godkendt svar.
  const candidates = [facit, ...accepted].filter((c) => c != null && String(c).trim() !== '');
  for (const c of candidates) {
    if (fuzzyNameMatch(answer, c)) return POINTS.BONUS;
  }
  return 0;
}
