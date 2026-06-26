// ---------------------------------------------------------------------------
// footballData.js — tynd klient til football-data.org (v4) + rene hjælpere.
//
// VIGTIGT (på opfordring fra football-data.org): klienten læser rate-limit-
// headerne (X-Requests-Available-Minute / X-RequestCounter-Reset) og throttler
// selv, så vi ikke rammer grænsen. Ét kald pr. synk-tick holder os langt under
// 30 kald/min.
// ---------------------------------------------------------------------------
'use strict';

// FIFA-VM hos football-data.org bruger konkurrencekoden "WC".
const COMPETITION_CODE = process.env.FD_COMPETITION || 'WC';
const BASE = 'https://api.football-data.org/v4';

// Statusser hvor vi IKKE skriver resultatet blindt, men beder admin kigge.
const REVIEW_STATUSES = new Set(['SUSPENDED', 'POSTPONED', 'CANCELLED', 'AWARDED']);

/** Kortlæg football-data.org-status → vores match-status. */
function mapStatus(fdStatus) {
  switch (fdStatus) {
    case 'IN_PLAY':
    case 'PAUSED':
      return 'live';
    case 'FINISHED':
    case 'AWARDED':
      return 'finished';
    default: // SCHEDULED, TIMED, POSTPONED, SUSPENDED, CANCELLED
      return 'scheduled';
  }
}

/** Udtræk fuldtidsscore. Returnerer { home, away, winner } eller null.
 *  Bemærk: football-data v4's `fullTime` er resultatet efter ordinær/forlænget
 *  tid og INDEHOLDER IKKE straffesparkene. Ved straffesparkskonkurrence er
 *  `fullTime` typisk uafgjort, mens `score.winner` peger på den der gik videre —
 *  derfor bruges `winner` til knockout-"advance" (se decideUpdate). */
function extractScore(fdMatch) {
  const ft = fdMatch && fdMatch.score && fdMatch.score.fullTime;
  if (!ft || ft.home == null || ft.away == null) return null;
  return {
    home: Number(ft.home),
    away: Number(ft.away),
    winner: (fdMatch.score && fdMatch.score.winner) || null, // HOME_TEAM | AWAY_TEAM | DRAW | null
  };
}

/** Læs rate-limit-headere fra et Response.headers (eller almindeligt objekt). */
function parseRateLimit(headers) {
  const get = (k) => {
    if (!headers) return null;
    if (typeof headers.get === 'function') return headers.get(k);
    return headers[k] != null ? headers[k] : headers[k.toLowerCase()];
  };
  const toNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
  return {
    available: toNum(get('X-Requests-Available-Minute')),
    resetSeconds: toNum(get('X-RequestCounter-Reset')),
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Opret en klient. fetch/sleep injiceres for testbarhed.
 * @param {{token:string, fetchImpl?:Function, sleepImpl?:Function, minRemaining?:number}} opts
 */
function createClient({ token, fetchImpl, sleepImpl = sleep, minRemaining = 3 } = {}) {
  const doFetch = fetchImpl || (typeof globalThis.fetch === 'function' ? globalThis.fetch : null);
  if (!doFetch) throw new Error('Ingen fetch tilgængelig (kræver Node 18+ eller injiceret fetch).');

  async function request(path) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await doFetch(`${BASE}${path}`, { headers: { 'X-Auth-Token': token } });
      const rl = parseRateLimit(res.headers);

      if (res.status === 429) {
        // Ramt grænsen — vent til counteren nulstilles, og prøv igen.
        const wait = (rl.resetSeconds != null ? rl.resetSeconds : 60) + 1;
        await sleepImpl(wait * 1000);
        continue;
      }
      if (!res.ok) throw new Error(`football-data ${res.status}`);

      const data = await res.json();

      // Defensiv throttling: er vi tæt på grænsen, så vent til reset før næste kald.
      if (rl.available != null && rl.available <= minRemaining && rl.resetSeconds != null) {
        await sleepImpl((rl.resetSeconds + 1) * 1000);
      }
      return data;
    }
    throw new Error('football-data: gav op efter gentagne 429-svar.');
  }

  return {
    competitionCode: COMPETITION_CODE,
    getMatchesInRange: (dateFrom, dateTo, code = COMPETITION_CODE) =>
      request(`/competitions/${code}/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`),
    getSeasonMatches: (season, code = COMPETITION_CODE) =>
      request(`/competitions/${code}/matches?season=${season}`),
    getScorers: (limit = 20, code = COMPETITION_CODE) =>
      request(`/competitions/${code}/scorers?limit=${limit}`),
    getStandings: (code = COMPETITION_CODE) =>
      request(`/competitions/${code}/standings`),
    getCompetition: (code = COMPETITION_CODE) =>
      request(`/competitions/${code}`),
    getFinishedMatches: (code = COMPETITION_CODE) =>
      request(`/competitions/${code}/matches?status=FINISHED`),
    getMatch: (id) => request(`/matches/${id}`),
  };
}

/**
 * Normalisér football-data /scorers-svaret til en kompakt liste til leaderboard.
 * Robust over for manglende felter (assists/penalties findes ikke på alle tiers).
 * @param {object} data  – rå respons fra getScorers()
 * @returns {Array<object>}
 */
function mapScorers(data) {
  const arr = (data && Array.isArray(data.scorers)) ? data.scorers : [];
  return arr.map((s, i) => ({
    rank: i + 1,
    playerId: s.player?.id ?? null,
    playerName: s.player?.name ?? '(ukendt)',
    nationality: s.player?.nationality ?? null,
    position: s.player?.position ?? s.player?.section ?? null,
    dateOfBirth: s.player?.dateOfBirth ?? null,
    teamId: s.team?.id ?? null,
    teamName: s.team?.name ?? null,
    playedMatches: s.playedMatches != null ? Number(s.playedMatches) : null,
    goals: Number(s.goals ?? 0),
    assists: s.assists != null ? Number(s.assists) : null,
    penalties: s.penalties != null ? Number(s.penalties) : null,
  }));
}

/** Findes mindst ét element i listen med et udfyldt (ikke-null) felt? */
function anyHas(list, key) {
  return Array.isArray(list) && list.some((x) => x && x[key] != null);
}

/** Kompakt felt-rapport for /scorers (til tier-verificering). */
function summarizeScorers(data) {
  const list = mapScorers(data);
  return {
    count: list.length,
    hasAssists: anyHas(list, 'assists'),
    hasPenalties: anyHas(list, 'penalties'),
    hasNationality: anyHas(list, 'nationality'),
    sample: list[0] ? { playerName: list[0].playerName, goals: list[0].goals } : null,
  };
}

/** Kompakt felt-rapport for et /matches/{id}-svar (til tier-verificering). */
function summarizeMatchDetail(m) {
  const match = (m && m.match) ? m.match : m; // v4 pakker nogle gange i { match: {...} }
  const score = (match && match.score) || {};
  const homeLineup = match?.homeTeam?.lineup;
  return {
    hasGoals: Array.isArray(match?.goals) && match.goals.length > 0,
    hasLineups: Array.isArray(homeLineup) && homeLineup.length > 0,
    hasBookings: Array.isArray(match?.bookings) && match.bookings.length > 0,
    hasSubstitutions: Array.isArray(match?.substitutions) && match.substitutions.length > 0,
    hasReferees: Array.isArray(match?.referees) && match.referees.length > 0,
    hasHalfTime: score.halfTime?.home != null,
    hasExtraTime: score.extraTime?.home != null,
    hasPenaltiesScore: score.penalties?.home != null,
    hasHead2Head: !!match?.head2head,
    attendance: match?.attendance ?? null,
    venue: match?.venue ?? null,
  };
}

/** Kompakt felt-rapport for /standings (til tier-verificering). */
function summarizeStandings(data) {
  const tables = Array.isArray(data?.standings) ? data.standings : [];
  const firstRow = tables[0]?.table?.[0] || null;
  return {
    tableCount: tables.length,
    hasForm: firstRow ? firstRow.form != null : false,
    hasGoalDiff: firstRow ? firstRow.goalDifference != null : false,
  };
}

/**
 * Normalisér /standings til tabeller med form. Beholder kun den SAMLEDE tabel
 * (type TOTAL) pr. gruppe/stage, så vi ikke får hjemme/ude-dubletter.
 * @param {object} data
 * @returns {Array<{stage:string|null, group:string|null, table:Array<object>}>}
 */
function mapStandings(data) {
  const tables = Array.isArray(data?.standings) ? data.standings : [];
  return tables
    .filter((t) => !t.type || t.type === 'TOTAL')
    .map((t) => ({
      stage: t.stage ?? null,
      group: t.group ?? null,
      table: (Array.isArray(t.table) ? t.table : []).map((r) => ({
        position: r.position ?? null,
        teamName: r.team?.name ?? r.team?.shortName ?? '?',
        crest: r.team?.crest ?? null,
        tla: r.team?.tla ?? null,
        played: r.playedGames ?? 0,
        won: r.won ?? 0,
        draw: r.draw ?? 0,
        lost: r.lost ?? 0,
        points: r.points ?? 0,
        goalsFor: r.goalsFor ?? 0,
        goalsAgainst: r.goalsAgainst ?? 0,
        goalDifference: r.goalDifference ?? 0,
        form: r.form ?? null, // fx "W,D,L,W,W"
      })),
    }));
}

// ---------------------------------------------------------------------------
// Kampdetaljer — mål, kort og opstillinger fra et /matches/{id}-svar.
// Alle robuste over for manglende felter (afhænger af tier/kampens fase).
// ---------------------------------------------------------------------------

/** Afgør om et hold-id hører til hjemme ('home') eller ude ('away'). */
function sideOf(teamId, match) {
  if (teamId == null) return null;
  if (match?.homeTeam?.id === teamId) return 'home';
  if (match?.awayTeam?.id === teamId) return 'away';
  return null;
}

function unwrap(m) { return (m && m.match) ? m.match : m; }

/** Mål med minut, scorer, assist og side. */
function mapGoals(m) {
  const match = unwrap(m);
  const arr = Array.isArray(match?.goals) ? match.goals : [];
  return arr.map((g) => ({
    minute: g.minute ?? null,
    injuryTime: g.injuryTime ?? null,
    type: g.type ?? 'REGULAR', // REGULAR | OWN | PENALTY
    side: sideOf(g.team?.id, match),
    scorer: g.scorer?.name ?? null,
    assist: g.assist?.name ?? null,
  }));
}

/** Kort (gule/røde) med minut, spiller og side. */
function mapBookings(m) {
  const match = unwrap(m);
  const arr = Array.isArray(match?.bookings) ? match.bookings : [];
  return arr.map((b) => ({
    minute: b.minute ?? null,
    side: sideOf(b.team?.id, match),
    player: b.player?.name ?? null,
    card: b.card ?? null, // YELLOW | RED | YELLOW_RED
  }));
}

/** Udskiftninger med minut, ind/ud-spiller og side. */
function mapSubstitutions(m) {
  const match = unwrap(m);
  const arr = Array.isArray(match?.substitutions) ? match.substitutions : [];
  return arr.map((s) => ({
    minute: s.minute ?? null,
    injuryTime: s.injuryTime ?? null,
    side: sideOf(s.team?.id, match),
    playerIn: s.playerIn?.name ?? null,
    playerOut: s.playerOut?.name ?? null,
  }));
}

/** Startopstilling + bænk + formation + træner pr. hold. */
function mapLineups(m) {
  const match = unwrap(m);
  const mapPlayers = (list) => (Array.isArray(list) ? list.map((p) => ({
    name: p.name ?? '?', position: p.position ?? null, shirt: p.shirtNumber ?? null,
  })) : []);
  const team = (t) => ({
    formation: t?.formation ?? null,
    coach: t?.coach?.name ?? null,
    lineup: mapPlayers(t?.lineup),
    bench: mapPlayers(t?.bench),
  });
  return { home: team(match?.homeTeam), away: team(match?.awayTeam) };
}

/** Saml alle kampdetaljer til ét kompakt objekt, der gemmes på kamp-doc'et. */
function mapMatchDetails(m) {
  const match = unwrap(m);
  const score = (match && match.score) || {};
  const refs = Array.isArray(match?.referees) ? match.referees : [];
  const mainRef = refs.find((r) => /REFEREE/i.test(r.type || '')) || refs[0] || null;
  const lineups = mapLineups(m);
  const hasLineups = lineups.home.lineup.length > 0 || lineups.away.lineup.length > 0;
  return {
    goals: mapGoals(m),
    bookings: mapBookings(m),
    substitutions: mapSubstitutions(m),
    lineups: hasLineups ? lineups : null,
    halfTime: score.halfTime?.home != null ? { home: score.halfTime.home, away: score.halfTime.away } : null,
    penalties: score.penalties?.home != null ? { home: score.penalties.home, away: score.penalties.away } : null,
    minute: match?.minute ?? null,        // spilleminut (live)
    injuryTime: match?.injuryTime ?? null, // tillægstid (live)
    attendance: match?.attendance ?? null,
    referee: mainRef?.name ?? null,
  };
}

/** Normalisér /competitions/{code} til turneringsmeta (logo, navn, spilledag). */
function mapCompetition(data) {
  const d = data || {};
  return {
    name: d.name ?? null,
    code: d.code ?? null,
    emblem: d.emblem ?? null,
    area: d.area?.name ?? null,
    currentMatchday: d.currentSeason?.currentMatchday ?? null,
    seasonStart: d.currentSeason?.startDate ?? null,
    seasonEnd: d.currentSeason?.endDate ?? null,
  };
}

module.exports = {
  COMPETITION_CODE, BASE, REVIEW_STATUSES,
  mapStatus, extractScore, parseRateLimit, createClient,
  mapScorers, summarizeScorers, summarizeMatchDetail, summarizeStandings,
  mapGoals, mapBookings, mapSubstitutions, mapLineups, mapMatchDetails, mapStandings, mapCompetition,
};
