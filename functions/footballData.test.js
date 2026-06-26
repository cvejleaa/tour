import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  mapStatus, extractScore, parseRateLimit, createClient,
  mapScorers, summarizeScorers, summarizeMatchDetail, summarizeStandings,
  mapGoals, mapBookings, mapSubstitutions, mapLineups, mapMatchDetails, mapStandings, mapCompetition,
} = require('./footballData');

function makeRes(status, body, headerEntries = []) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Map(headerEntries),
    json: async () => body,
  };
}

describe('mapStatus', () => {
  it('kortlægger live/finished/scheduled', () => {
    expect(mapStatus('IN_PLAY')).toBe('live');
    expect(mapStatus('PAUSED')).toBe('live');
    expect(mapStatus('FINISHED')).toBe('finished');
    expect(mapStatus('AWARDED')).toBe('finished');
    expect(mapStatus('TIMED')).toBe('scheduled');
    expect(mapStatus('SCHEDULED')).toBe('scheduled');
    expect(mapStatus('SUSPENDED')).toBe('scheduled');
  });
});

describe('extractScore', () => {
  it('udtrækker fuldtidsscore + vinder', () => {
    expect(extractScore({ score: { winner: 'HOME_TEAM', fullTime: { home: 2, away: 1 } } }))
      .toEqual({ home: 2, away: 1, winner: 'HOME_TEAM' });
  });
  it('returnerer null uden score', () => {
    expect(extractScore({ score: { fullTime: { home: null, away: null } } })).toBeNull();
    expect(extractScore({})).toBeNull();
  });
});

describe('parseRateLimit', () => {
  it('læser headere fra et Map-lignende objekt', () => {
    const h = new Map([['X-Requests-Available-Minute', '12'], ['X-RequestCounter-Reset', '34']]);
    expect(parseRateLimit(h)).toEqual({ available: 12, resetSeconds: 34 });
  });
  it('læser headere fra et almindeligt objekt', () => {
    expect(parseRateLimit({ 'X-Requests-Available-Minute': '5' }))
      .toEqual({ available: 5, resetSeconds: null });
  });
});

describe('createClient', () => {
  it('henter data og throttler ikke når der er rigeligt tilbage', async () => {
    const sleepImpl = vi.fn(() => Promise.resolve());
    const fetchImpl = vi.fn(async () => makeRes(200, { matches: [] }, [
      ['X-Requests-Available-Minute', '50'], ['X-RequestCounter-Reset', '30'],
    ]));
    const client = createClient({ token: 't', fetchImpl, sleepImpl });
    const data = await client.getMatchesInRange('2026-06-11', '2026-06-11');
    expect(data).toEqual({ matches: [] });
    expect(sleepImpl).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    // Sender auth-header
    expect(fetchImpl.mock.calls[0][1].headers['X-Auth-Token']).toBe('t');
  });

  it('venter når kvoten er ved at være brugt', async () => {
    const sleepImpl = vi.fn(() => Promise.resolve());
    const fetchImpl = vi.fn(async () => makeRes(200, { ok: true }, [
      ['X-Requests-Available-Minute', '1'], ['X-RequestCounter-Reset', '5'],
    ]));
    const client = createClient({ token: 't', fetchImpl, sleepImpl, minRemaining: 3 });
    await client.getSeasonMatches(2026);
    expect(sleepImpl).toHaveBeenCalledWith(6000); // (5 + 1) * 1000
  });

  it('respekterer 429 og prøver igen efter reset', async () => {
    const sleepImpl = vi.fn(() => Promise.resolve());
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(makeRes(429, {}, [['X-RequestCounter-Reset', '2']]))
      .mockResolvedValueOnce(makeRes(200, { matches: [1] }, [
        ['X-Requests-Available-Minute', '50'], ['X-RequestCounter-Reset', '30'],
      ]));
    const client = createClient({ token: 't', fetchImpl, sleepImpl });
    const data = await client.getMatchesInRange('a', 'b');
    expect(data).toEqual({ matches: [1] });
    expect(sleepImpl).toHaveBeenCalledWith(3000); // (2 + 1) * 1000
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('kaster ved vedvarende fejlstatus', async () => {
    const fetchImpl = vi.fn(async () => makeRes(403, {}));
    const client = createClient({ token: 't', fetchImpl, sleepImpl: vi.fn(() => Promise.resolve()) });
    await expect(client.getSeasonMatches(2026)).rejects.toThrow(/403/);
  });
});

describe('mapScorers', () => {
  const data = {
    scorers: [
      { player: { id: 1, name: 'Haaland', nationality: 'Norway' }, team: { id: 9, name: 'Norway' }, goals: 6, assists: 2, penalties: 1 },
      { player: { id: 2, name: 'Mbappé' }, team: { id: 4, name: 'France' }, goals: 5 },
    ],
  };

  it('normaliserer med rank og talfelter', () => {
    const list = mapScorers(data);
    expect(list[0]).toMatchObject({ rank: 1, playerName: 'Haaland', teamName: 'Norway', goals: 6, assists: 2, penalties: 1 });
    expect(list[1]).toMatchObject({ rank: 2, playerName: 'Mbappé', goals: 5, assists: null, penalties: null });
  });

  it('håndterer tomt/manglende svar', () => {
    expect(mapScorers(null)).toEqual([]);
    expect(mapScorers({})).toEqual([]);
  });

  it('summarizeScorers rapporterer felt-tilgængelighed', () => {
    const s = summarizeScorers(data);
    expect(s).toMatchObject({ count: 2, hasAssists: true, hasPenalties: true, hasNationality: true });
    expect(s.sample).toEqual({ playerName: 'Haaland', goals: 6 });
  });

  it('summarizeScorers: assists/penalties falske når de mangler', () => {
    const s = summarizeScorers({ scorers: [{ player: { name: 'X' }, team: { name: 'Y' }, goals: 1 }] });
    expect(s).toMatchObject({ count: 1, hasAssists: false, hasPenalties: false, hasNationality: false });
  });
});

describe('summarizeMatchDetail', () => {
  it('rapporterer detaljefelter (udpakker { match }, inkl. opstillinger)', () => {
    const m = { match: {
      goals: [{ minute: 23, scorer: { name: 'A' } }],
      bookings: [], referees: [{ name: 'Dommer' }],
      homeTeam: { lineup: [{ name: 'Keeper' }] },
      score: { halfTime: { home: 1, away: 0 }, penalties: { home: 4, away: 3 } },
      attendance: 50000, venue: 'Stadion',
    } };
    expect(summarizeMatchDetail(m)).toMatchObject({
      hasGoals: true, hasLineups: true, hasBookings: false, hasReferees: true,
      hasHalfTime: true, hasPenaltiesScore: true, attendance: 50000, venue: 'Stadion',
    });
  });

  it('håndterer fladt match-objekt og manglende felter', () => {
    expect(summarizeMatchDetail({ score: {} })).toMatchObject({
      hasGoals: false, hasLineups: false, hasHalfTime: false, hasPenaltiesScore: false,
    });
  });
});

describe('summarizeStandings', () => {
  it('rapporterer form og målforskel', () => {
    const data = { standings: [{ table: [{ form: 'WWD', goalDifference: 4 }] }] };
    expect(summarizeStandings(data)).toEqual({ tableCount: 1, hasForm: true, hasGoalDiff: true });
  });
  it('håndterer tomt', () => {
    expect(summarizeStandings({})).toEqual({ tableCount: 0, hasForm: false, hasGoalDiff: false });
  });
});

describe('mapGoals / mapBookings / mapLineups / mapMatchDetails', () => {
  const detail = { match: {
    homeTeam: { id: 10, formation: '4-3-3', coach: { name: 'Hjemmetræner' },
      lineup: [{ name: 'Keeper', position: 'Goalkeeper', shirtNumber: 1 }],
      bench: [{ name: 'Reserve', shirtNumber: 12 }] },
    awayTeam: { id: 20, formation: '4-4-2', coach: { name: 'Udetræner' }, lineup: [{ name: 'Spiller', shirtNumber: 7 }] },
    goals: [
      { minute: 23, type: 'REGULAR', team: { id: 10 }, scorer: { name: 'A' }, assist: { name: 'B' } },
      { minute: 67, type: 'PENALTY', team: { id: 20 }, scorer: { name: 'C' }, assist: null },
    ],
    bookings: [{ minute: 40, team: { id: 20 }, player: { name: 'D' }, card: 'YELLOW' }],
    substitutions: [{ minute: 71, team: { id: 10 }, playerOut: { name: 'A' }, playerIn: { name: 'E' } }],
    referees: [{ name: 'Dommer', type: 'REFEREE' }, { name: 'Linje', type: 'ASSISTANT_REFEREE_N1' }],
    score: { halfTime: { home: 1, away: 0 }, penalties: { home: 4, away: 3 } },
    minute: 67, injuryTime: 2,
    attendance: 62471,
  } };

  it('mapGoals udleder side, scorer, assist og type', () => {
    const g = mapGoals(detail);
    expect(g[0]).toEqual({ minute: 23, injuryTime: null, type: 'REGULAR', side: 'home', scorer: 'A', assist: 'B' });
    expect(g[1]).toMatchObject({ side: 'away', type: 'PENALTY', scorer: 'C', assist: null });
  });

  it('mapBookings udleder side, spiller og korttype', () => {
    expect(mapBookings(detail)).toEqual([{ minute: 40, side: 'away', player: 'D', card: 'YELLOW' }]);
  });

  it('mapSubstitutions udleder side, ind- og ud-spiller', () => {
    expect(mapSubstitutions(detail)).toEqual([
      { minute: 71, injuryTime: null, side: 'home', playerIn: 'E', playerOut: 'A' },
    ]);
  });

  it('mapLineups giver formation, træner, startopstilling og bænk', () => {
    const l = mapLineups(detail);
    expect(l.home).toMatchObject({ formation: '4-3-3', coach: 'Hjemmetræner' });
    expect(l.home.lineup[0]).toEqual({ name: 'Keeper', position: 'Goalkeeper', shirt: 1 });
    expect(l.home.bench[0]).toEqual({ name: 'Reserve', position: null, shirt: 12 });
  });

  it('mapMatchDetails samler alt og vælger hoveddommer', () => {
    const d = mapMatchDetails(detail);
    expect(d.goals).toHaveLength(2);
    expect(d.bookings).toHaveLength(1);
    expect(d.substitutions).toHaveLength(1);
    expect(d.lineups).not.toBeNull();
    expect(d.halfTime).toEqual({ home: 1, away: 0 });
    expect(d.penalties).toEqual({ home: 4, away: 3 });
    expect(d.attendance).toBe(62471);
    expect(d.referee).toBe('Dommer');
    expect(d.minute).toBe(67);
    expect(d.injuryTime).toBe(2);
  });

  it('mapMatchDetails: lineups=null når der ingen opstillinger er', () => {
    const d = mapMatchDetails({ match: { homeTeam: { id: 1 }, awayTeam: { id: 2 }, score: {} } });
    expect(d.lineups).toBeNull();
    expect(d.goals).toEqual([]);
    expect(d.halfTime).toBeNull();
  });
});

describe('mapStandings', () => {
  const data = { standings: [
    { type: 'TOTAL', stage: 'GROUP_STAGE', group: 'GROUP_A', table: [
      { position: 1, team: { name: 'Brasilien', crest: 'x', tla: 'BRA' }, playedGames: 3, won: 3, draw: 0, lost: 0, points: 9, goalsFor: 7, goalsAgainst: 1, goalDifference: 6, form: 'W,W,W' },
    ] },
    { type: 'HOME', stage: 'GROUP_STAGE', group: 'GROUP_A', table: [ { position: 1, team: { name: 'X' } } ] },
  ] };
  it('beholder kun TOTAL og normaliserer rækker med form', () => {
    const out = mapStandings(data);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ stage: 'GROUP_STAGE', group: 'GROUP_A' });
    expect(out[0].table[0]).toMatchObject({ position: 1, teamName: 'Brasilien', points: 9, goalDifference: 6, form: 'W,W,W' });
  });
  it('håndterer tomt', () => { expect(mapStandings({})).toEqual([]); });
});

describe('mapScorers — position/alder-felter', () => {
  it('tager position (eller section) og dateOfBirth med', () => {
    const data = { scorers: [
      { player: { id: 1, name: 'A', position: 'Centre-Forward', dateOfBirth: '2000-01-01' }, team: { name: 'T' }, goals: 5, playedMatches: 10 },
      { player: { id: 2, name: 'B', section: 'Offence' }, team: { name: 'U' }, goals: 3 },
    ] };
    const out = mapScorers(data);
    expect(out[0]).toMatchObject({ position: 'Centre-Forward', dateOfBirth: '2000-01-01', playedMatches: 10 });
    expect(out[1]).toMatchObject({ position: 'Offence', dateOfBirth: null, playedMatches: null });
  });
});

describe('mapCompetition', () => {
  it('udtrækker logo, navn og spilledag', () => {
    const data = { name: 'FIFA World Cup', code: 'WC', emblem: 'http://x/wc.png',
      area: { name: 'World' }, currentSeason: { currentMatchday: 3, startDate: '2026-06-11', endDate: '2026-07-19' } };
    expect(mapCompetition(data)).toEqual({
      name: 'FIFA World Cup', code: 'WC', emblem: 'http://x/wc.png', area: 'World',
      currentMatchday: 3, seasonStart: '2026-06-11', seasonEnd: '2026-07-19',
    });
  });
  it('håndterer tomt', () => {
    expect(mapCompetition(null)).toMatchObject({ name: null, emblem: null, currentMatchday: null });
  });
});
