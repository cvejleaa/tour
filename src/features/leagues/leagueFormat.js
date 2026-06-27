/**
 * Liga-scoring: hvilke dele tæller i en ligas stilling. Delene kan KOMBINERES
 * frit. Etape-point og officiel bonus beregnes server-side; liga-bonus beregnes
 * klient-side og er liga-lokal.
 *
 * Felter på en spiller:
 *   stagePoints – point fra de fire hold-spørgsmål på etaperne
 *   bonusPoints – point fra de officielle sæson-/klassements-bonusspørgsmål
 */
import { LEAGUE_FORMAT } from '../../lib/constants';

// Standard: alt tæller
export const DEFAULT_SCORING = {
  stage: true,
  bonus: true,
  leagueBonus: true,
};

// Komponenter der kan slås til/fra i liga-opsætningen
export const SCORING_COMPONENTS = [
  { key: 'stage',       label: 'Etape-point' },
  { key: 'bonus',       label: 'Officiel bonus (sæson/klassement)' },
  { key: 'leagueBonus', label: 'Liga-bonus (ligaens egne spørgsmål)' },
];

// Oversæt et gammelt enum-format til den nye kombinerbare model (bagudkompat.)
function fromLegacyFormat(format) {
  switch (format) {
    case LEAGUE_FORMAT.BONUS_ONLY:
      return { stage: false, bonus: true, leagueBonus: true };
    case LEAGUE_FORMAT.STAGE_ONLY:
      return { stage: true, bonus: false, leagueBonus: true };
    case LEAGUE_FORMAT.FULL:
    default:
      return { ...DEFAULT_SCORING };
  }
}

/**
 * Udled scoring-objektet fra et liga-dokument (ny `scoring` eller gammelt `format`).
 * @param {object} league
 * @returns {{stage:boolean,bonus:boolean,leagueBonus:boolean}}
 */
export function normalizeScoring(league) {
  if (league && league.scoring && typeof league.scoring === 'object') {
    return { ...DEFAULT_SCORING, ...league.scoring };
  }
  if (league && league.format) return fromLegacyFormat(league.format);
  return { ...DEFAULT_SCORING };
}

/** Kort, læsbar beskrivelse af et scoring-valg, fx "Etape-point + Bonus". */
export function scoringLabel(scoring) {
  const s = scoring || DEFAULT_SCORING;
  const parts = [];
  if (s.stage) parts.push('Etape-point');
  if (s.bonus) parts.push('Bonus');
  if (s.leagueBonus) parts.push('Liga-bonus');
  if (parts.length === 0) return 'Intet valgt';
  if (s.stage && s.bonus && s.leagueBonus) return 'Fuld (alt tæller)';
  return parts.join(' + ');
}

/** Er scoring lig standard (alt tæller)? */
export function isFullScoring(scoring) {
  const s = scoring || DEFAULT_SCORING;
  return s.stage && s.bonus && s.leagueBonus;
}

/**
 * Beregn en spillers point i en liga ud fra dens scoring-valg.
 * @param {object} user – med stagePoints/bonusPoints
 * @param {object} scoring – kombinerbart scoring-objekt
 * @param {number} [leagueBonusPoints] – spillerens point fra ligaens egne bonusspørgsmål
 * @returns {number}
 */
export function leagueScore(user, scoring, leagueBonusPoints = 0) {
  const s = scoring || DEFAULT_SCORING;
  const stage = user?.stagePoints ?? 0;
  const bonus = user?.bonusPoints ?? 0;
  let total = 0;
  if (s.stage) total += stage;
  if (s.bonus) total += bonus;
  if (s.leagueBonus) total += leagueBonusPoints;
  return total;
}

/**
 * Opdel en spillers liga-point i "etaper" og "bonus" (samme grundlag som
 * leagueScore, så etaper + bonus === total). Respekterer ligaens scoring-valg:
 * dele der er slået fra tæller 0.
 * @param {object} user – med stagePoints/bonusPoints
 * @param {object} scoring – kombinerbart scoring-objekt
 * @param {number} [leagueBonusPoints] – point fra ligaens egne bonusspørgsmål
 * @returns {{stage:number, bonus:number, total:number}}
 */
export function leagueBreakdown(user, scoring, leagueBonusPoints = 0) {
  const s = scoring || DEFAULT_SCORING;
  const stagePoints = user?.stagePoints ?? 0;
  const officialBonus = user?.bonusPoints ?? 0;
  const stage = s.stage ? stagePoints : 0;
  let bonus = 0;
  if (s.bonus) bonus += officialBonus;
  if (s.leagueBonus) bonus += leagueBonusPoints;
  return { stage, bonus, total: stage + bonus };
}
