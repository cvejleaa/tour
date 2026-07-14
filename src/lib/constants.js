// Delte konstanter for datamodel, roller og status.

export const ROLES = {
  OWNER: 'owner', // super-admin (dig): alt, inkl. brugergodkendelse + udpegning af admins
  GLOBAL_ADMIN: 'globalAdmin', // fuld daglig drift, men kan IKKE udpege/fjerne admins
  PLAYER: 'player',
};

export const USER_STATUS = {
  PENDING: 'pending', // afventer godkendelse
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

// Status for en liga (skal godkendes af admin før den kan bruges)
export const LEAGUE_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

// Liga-format: bestemmer hvilke point der tæller i ligaens stilling
export const LEAGUE_FORMAT = {
  FULL: 'full',             // alt tæller (standard)
  BONUS_ONLY: 'bonusOnly',  // kun bonus-spørgsmål
  STAGE_ONLY: 'stageOnly',  // kun etape-point
};

// Typer af individuelle liga-bonusspørgsmål. Identiske med de officielle
// bonus-svartyper (BONUS_ANSWER_TYPES nedenfor), så liga-bonus har samme
// opsætning som officielle bonusspørgsmål. 'number' afgøres relativt pr. liga
// (den/de nærmeste på facit vinder).
export const LEAGUE_BONUS_TYPE = {
  TEXT: 'text',       // fritekst
  TEAM: 'team',       // hold (vælg ét)
  TEAMS: 'teams',     // hold (vælg flere)
  NUMBER: 'number',   // tal — den/de nærmeste på facit i ligaen vinder
  TIME: 'time',       // tidsangivelse
  BOOLEAN: 'boolean', // ja/nej
};

// Svartyper for (sæson-)bonusspørgsmål. Bestemmer både admin-facit-input og
// spillerens svar-input. Default 'text' for ældre spørgsmål uden type.
// Facit/svar gemmes som den naturlige værdi: streng for alle typer undtagen
// 'teams', der gemmes som et array af holdnavne. 'boolean' gemmes som 'ja'|'nej'.
export const BONUS_ANSWER_TYPES = [
  { value: 'text', label: 'Fritekst' },
  { value: 'team', label: 'Hold (vælg ét)' },
  { value: 'teams', label: 'Hold (vælg flere)' },
  { value: 'number', label: 'Tal' },
  { value: 'time', label: 'Tidsangivelse' },
  { value: 'boolean', label: 'Ja/nej' },
];

/** Sættet af gyldige type-værdier. */
export const BONUS_ANSWER_TYPE_VALUES = BONUS_ANSWER_TYPES.map((t) => t.value);

/** Default-type for spørgsmål uden et type-felt (legacy). */
export const DEFAULT_BONUS_ANSWER_TYPE = 'text';

/** Normaliser et spørgsmåls type til en kendt værdi (fallback til default). */
export function bonusAnswerType(question) {
  const t = question?.type;
  return BONUS_ANSWER_TYPE_VALUES.includes(t) ? t : DEFAULT_BONUS_ANSWER_TYPE;
}

// Firestore-collections
export const COL = {
  USERS: 'users',
  USER_CONTACTS: 'userContacts', // privat kontaktinfo (e-mail) — kun bruger selv + admin kan læse
  MATCHES: 'matches',
  BETS: 'bets',
  STAGES: 'stages', // Tour de France-etaper
  STAGE_BETS: 'stageBets', // hold-tip pr. etape (uid_stageId)
  TEAMS: 'teams', // cykelhold (selv-udfyldende fra resultater)
  RIDERS: 'riders', // ryttere (valgfrit, til rytter-/holdside)
  BONUS_QUESTIONS: 'bonusQuestions',
  BONUS_BETS: 'bonusBets',
  LEAGUES: 'leagues',
  LEAGUE_COMMENTS: 'leagueComments', // beskeder på en ligas væg
  MESSAGES: 'messages', // private 1:1-beskeder mellem brugere
  TIP_PARTICIPATION: 'tipParticipation', // hvem har tippet pr. etape (uden at afsløre tips)
  LEAGUE_ACTIVITY: 'leagueActivity', // aktivitets-feed pr. liga
  LEAGUE_BONUS: 'leagueBonus', // individuelle bonus-spørgsmål pr. liga
  LEAGUE_BONUS_ANSWERS: 'leagueBonusAnswers', // svar på liga-bonusspørgsmål
  LEAGUE_BONUS_AWARDS: 'leagueBonusAwards', // manuelle liga-point pr. medlem på FÆLLES bonusspørgsmål
  CONFIG: 'config',
  EMAIL_LOG: 'emailLog', // log over udsendte mails (kun admin-læsning)
  PRESENCE: 'presence', // besøgsstatistik pr. bruger (selv-skrevet, admin-læst)
};

export const TIMEZONE = 'Europe/Copenhagen';
