/**
 * Liga-scoring: hvilke dele tæller i en ligas stilling. Delene kan KOMBINERES
 * frit (fx bonus + slutspil). Point-fordelingen (group/knockout/bonus) beregnes
 * server-side; liga-bonus beregnes klient-side og er liga-lokal.
 */
import { LEAGUE_FORMAT } from '../../lib/constants';

// Standard: alt tæller, slutspil ikke fordoblet
export const DEFAULT_SCORING = {
  group: true,
  knockout: true,
  bonus: true,
  leagueBonus: true,
  doubleKnockout: false,
};

// Komponenter der kan slås til/fra i liga-opsætningen
export const SCORING_COMPONENTS = [
  { key: 'group',       label: 'Grundspil' },
  { key: 'knockout',    label: 'Slutspil' },
  { key: 'bonus',       label: 'Officiel bonus (topscorer/gruppevindere)' },
  { key: 'leagueBonus', label: 'Liga-bonus (ligaens egne spørgsmål)' },
];

// Oversæt et gammelt enum-format til den nye kombinerbare model (bagudkompat.)
function fromLegacyFormat(format) {
  switch (format) {
    case LEAGUE_FORMAT.BONUS_ONLY:
      return { group: false, knockout: false, bonus: true, leagueBonus: true, doubleKnockout: false };
    case LEAGUE_FORMAT.KNOCKOUT_ONLY:
      return { group: false, knockout: true, bonus: false, leagueBonus: true, doubleKnockout: false };
    case LEAGUE_FORMAT.GROUP_ONLY:
      return { group: true, knockout: false, bonus: false, leagueBonus: true, doubleKnockout: false };
    case LEAGUE_FORMAT.DOUBLE_KNOCKOUT:
      return { group: true, knockout: true, bonus: true, leagueBonus: true, doubleKnockout: true };
    case LEAGUE_FORMAT.FULL:
    default:
      return { ...DEFAULT_SCORING };
  }
}

/**
 * Udled scoring-objektet fra et liga-dokument (ny `scoring` eller gammelt `format`).
 * @param {object} league
 * @returns {{group:boolean,knockout:boolean,bonus:boolean,leagueBonus:boolean,doubleKnockout:boolean}}
 */
export function normalizeScoring(league) {
  if (league && league.scoring && typeof league.scoring === 'object') {
    return { ...DEFAULT_SCORING, ...league.scoring };
  }
  if (league && league.format) return fromLegacyFormat(league.format);
  return { ...DEFAULT_SCORING };
}

/** Kort, læsbar beskrivelse af et scoring-valg, fx "Slutspil (×2) + Bonus". */
export function scoringLabel(scoring) {
  const s = scoring || DEFAULT_SCORING;
  const parts = [];
  if (s.group) parts.push('Grundspil');
  if (s.knockout) parts.push(`Slutspil${s.doubleKnockout ? ' (×2)' : ''}`);
  if (s.bonus) parts.push('Bonus');
  if (s.leagueBonus) parts.push('Liga-bonus');
  if (parts.length === 0) return 'Intet valgt';
  if (s.group && s.knockout && s.bonus && s.leagueBonus && !s.doubleKnockout) return 'Fuld (alt tæller)';
  return parts.join(' + ');
}

/** Er scoring lig standard (alt tæller, ikke fordoblet)? */
export function isFullScoring(scoring) {
  const s = scoring || DEFAULT_SCORING;
  return s.group && s.knockout && s.bonus && s.leagueBonus && !s.doubleKnockout;
}

/**
 * Beregn en spillers point i en liga ud fra dens scoring-valg.
 * @param {object} user – med groupPoints/knockoutPoints/bonusPoints
 * @param {object} scoring – kombinerbart scoring-objekt
 * @param {number} [leagueBonusPoints] – spillerens point fra ligaens egne bonusspørgsmål
 * @returns {number}
 */
export function leagueScore(user, scoring, leagueBonusPoints = 0) {
  const s = scoring || DEFAULT_SCORING;
  const group = user?.groupPoints ?? 0;
  const knockout = user?.knockoutPoints ?? 0;
  const bonus = user?.bonusPoints ?? 0;
  let total = 0;
  if (s.group) total += group;
  if (s.knockout) total += knockout * (s.doubleKnockout ? 2 : 1);
  if (s.bonus) total += bonus;
  if (s.leagueBonus) total += leagueBonusPoints;
  return total;
}

/**
 * Opdel en spillers liga-point i "kampe" og "bonus" (samme grundlag som
 * leagueScore, så match + bonus === total). Respekterer ligaens scoring-valg:
 * dele der er slået fra tæller 0.
 * @param {object} user – med groupPoints/knockoutPoints/bonusPoints
 * @param {object} scoring – kombinerbart scoring-objekt
 * @param {number} [leagueBonusPoints] – point fra ligaens egne bonusspørgsmål
 * @returns {{match:number, bonus:number, total:number}}
 */
export function leagueBreakdown(user, scoring, leagueBonusPoints = 0) {
  const s = scoring || DEFAULT_SCORING;
  const group = user?.groupPoints ?? 0;
  const knockout = user?.knockoutPoints ?? 0;
  const officialBonus = user?.bonusPoints ?? 0;
  let match = 0;
  if (s.group) match += group;
  if (s.knockout) match += knockout * (s.doubleKnockout ? 2 : 1);
  let bonus = 0;
  if (s.bonus) bonus += officialBonus;
  if (s.leagueBonus) bonus += leagueBonusPoints;
  return { match, bonus, total: match + bonus };
}
