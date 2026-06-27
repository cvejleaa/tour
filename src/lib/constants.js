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
  FULL: 'full',                 // alt tæller (standard)
  BONUS_ONLY: 'bonusOnly',      // kun bonus-spørgsmål
  KNOCKOUT_ONLY: 'knockoutOnly',// kun slutspil
  GROUP_ONLY: 'groupOnly',      // kun grundspil
  DOUBLE_KNOCKOUT: 'doubleKnockout', // alt, men slutspil tæller dobbelt
};

// Typer af individuelle liga-bonusspørgsmål
export const LEAGUE_BONUS_TYPE = {
  TEXT: 'text',     // fritekst
  CHOICE: 'choice', // vælg én af flere
  TOPLIST: 'toplist', // ordnet liste (fx top 5)
  YESNO: 'yesno',   // ja/nej
};

// Firestore-collections
export const COL = {
  USERS: 'users',
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
  TIP_PARTICIPATION: 'tipParticipation', // hvem har tippet pr. kamp (uden at afsløre tips)
  LEAGUE_ACTIVITY: 'leagueActivity', // aktivitets-feed pr. liga
  LEAGUE_BONUS: 'leagueBonus', // individuelle bonus-spørgsmål pr. liga
  LEAGUE_BONUS_ANSWERS: 'leagueBonusAnswers', // svar på liga-bonusspørgsmål
  CONFIG: 'config',
  EMAIL_LOG: 'emailLog', // log over udsendte mails (kun admin-læsning)
};

export const TIMEZONE = 'Europe/Copenhagen';
