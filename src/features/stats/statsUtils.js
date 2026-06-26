// ---------------------------------------------------------------------------
// Rene statistik-funktioner (ingen Firebase). Bruges af Statistik-siden.
// ---------------------------------------------------------------------------
import { outcome, scoreMatch, scoreKnockout, POINTS } from '../../lib/scoring';
import { ROUNDS } from '../../lib/constants';
import { TEAMS, teamName } from '../../lib/teams';

/**
 * Beregner statistik for én afgjort kamp ud fra spillernes tips.
 * @param {object} match  kamp med .result {home,away,advance?} og .round
 * @param {Array<object>} bets  tips for kampen: {uid, home, away, advance?}
 * @returns {{
 *   total:number, exact:number, exactPct:number,
 *   correctOutcome:number, outcomePct:number,
 *   avgPoints:number, popular:{home:number,away:number,count:number}|null,
 *   exactUids:string[]
 * }}
 */
export function computeMatchStats(match, bets) {
  const result = match?.result;
  const list = Array.isArray(bets) ? bets : [];
  const total = list.length;
  if (!result || total === 0) {
    return { total, exact: 0, exactPct: 0, correctOutcome: 0, outcomePct: 0, avgPoints: 0, popular: null, exactUids: [] };
  }

  const isKnockout = match.round && match.round !== ROUNDS.GROUP;
  const resOutcome = outcome(result.home, result.away);

  let exact = 0;
  let correctOutcome = 0;
  let pointsSum = 0;
  const exactUids = [];
  const tally = new Map(); // "h-a" -> count

  for (const b of list) {
    const pts = isKnockout ? scoreKnockout(b, result) : scoreMatch(b, result);
    pointsSum += pts;

    if (b.home === result.home && b.away === result.away) {
      exact += 1;
      if (b.uid) exactUids.push(b.uid);
    }
    if (
      Number.isFinite(b.home) && Number.isFinite(b.away) &&
      outcome(b.home, b.away) === resOutcome
    ) {
      correctOutcome += 1;
    }
    if (Number.isFinite(b.home) && Number.isFinite(b.away)) {
      const key = `${b.home}-${b.away}`;
      tally.set(key, (tally.get(key) ?? 0) + 1);
    }
  }

  // Mest populære tip
  let popular = null;
  for (const [key, count] of tally) {
    if (!popular || count > popular.count) {
      const [h, a] = key.split('-').map(Number);
      popular = { home: h, away: a, count };
    }
  }

  const pct = (n) => Math.round((n / total) * 100);
  return {
    total,
    exact,
    exactPct: pct(exact),
    correctOutcome,
    outcomePct: pct(correctOutcome),
    avgPoints: Math.round((pointsSum / total) * 10) / 10,
    pointsSum,
    popular,
    exactUids,
  };
}

/**
 * Point pr. spiller for et givent sæt kampe (kun afsluttede tæller).
 * @param {Array<object>} matches
 * @param {Map<string,Array>|{get?:Function}} betsByMatch  matchId -> bets[]
 * @returns {Record<string,number>} uid -> point
 */
export function pointsByUidForMatches(matches, betsByMatch) {
  const out = {};
  for (const m of finishedWithResult(matches)) {
    const isKo = m.round && m.round !== ROUNDS.GROUP;
    for (const b of betsByMatch?.get?.(m.id) ?? []) {
      if (!b.uid) continue;
      out[b.uid] = (out[b.uid] ?? 0) + (isKo ? scoreKnockout(b, m.result) : scoreMatch(b, m.result));
    }
  }
  return out;
}

/**
 * Find de spillere der fik flest point i dag.
 * @param {Record<string,number>} pointsByUid
 * @param {Record<string,object>} usersById  uid -> {displayName}
 * @param {number} [limit]
 * @returns {Array<{uid:string, name:string, points:number}>}
 */
export function topScorersOfDay(pointsByUid, usersById, limit = 3) {
  return Object.entries(pointsByUid ?? {})
    .filter(([, p]) => p > 0)
    .map(([uid, points]) => ({ uid, points, name: usersById?.[uid]?.displayName || 'Spiller' }))
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, 'da'))
    .slice(0, limit);
}

/** Maksimalt mulige point for en kamp (til "X af Y"-visning). */
export function maxPointsForMatch(match) {
  const isKnockout = match?.round && match.round !== ROUNDS.GROUP;
  return isKnockout ? POINTS.EXACT + POINTS.KNOCKOUT_ADVANCE : POINTS.EXACT;
}

// ─── Sæson-statistik (hele turneringen) ─────────────────────────────────────

/** Kun afsluttede kampe med gyldigt resultat. */
function finishedWithResult(matches) {
  return (matches ?? []).filter((m) => m && m.result);
}

/**
 * Samlet overblik på tværs af alle afsluttede kampe.
 * @returns {{matches:number, tips:number, exact:number, correctOutcome:number,
 *            exactPct:number, outcomePct:number, totalPoints:number, avgPoints:number}}
 */
export function computeSeasonOverview(matches, betsByMatch) {
  const finished = finishedWithResult(matches);
  let tips = 0, exact = 0, correctOutcome = 0, totalPoints = 0;
  for (const m of finished) {
    const s = computeMatchStats(m, betsByMatch?.get?.(m.id) ?? []);
    tips += s.total;
    exact += s.exact;
    correctOutcome += s.correctOutcome;
    totalPoints += s.pointsSum;
  }
  const pct = (n) => (tips ? Math.round((n / tips) * 100) : 0);
  return {
    matches: finished.length,
    tips,
    exact,
    correctOutcome,
    exactPct: pct(exact),
    outcomePct: pct(correctOutcome),
    totalPoints,
    avgPoints: tips ? Math.round((totalPoints / tips) * 10) / 10 : 0,
  };
}

/**
 * Per-spiller træfsikkerhed over hele turneringen.
 * @returns {Array<{uid,name,tips,exact,correctOutcome,points,exactPct,outcomePct,avgPoints}>}
 */
export function computePlayerAccuracy(matches, betsByMatch, usersById) {
  const finished = finishedWithResult(matches);
  const byUid = new Map();
  for (const m of finished) {
    const isKo = m.round && m.round !== ROUNDS.GROUP;
    const res = m.result;
    for (const b of betsByMatch?.get?.(m.id) ?? []) {
      if (!b.uid) continue;
      const row = byUid.get(b.uid) ?? { uid: b.uid, tips: 0, exact: 0, correctOutcome: 0, points: 0 };
      row.tips += 1;
      row.points += isKo ? scoreKnockout(b, res) : scoreMatch(b, res);
      if (b.home === res.home && b.away === res.away) row.exact += 1;
      if (Number.isFinite(b.home) && Number.isFinite(b.away) && outcome(b.home, b.away) === outcome(res.home, res.away)) {
        row.correctOutcome += 1;
      }
      byUid.set(b.uid, row);
    }
  }
  return [...byUid.values()]
    .map((r) => ({
      ...r,
      name: usersById?.[r.uid]?.displayName || 'Spiller',
      exactPct: r.tips ? Math.round((r.exact / r.tips) * 100) : 0,
      outcomePct: r.tips ? Math.round((r.correctOutcome / r.tips) * 100) : 0,
      avgPoints: r.tips ? Math.round((r.points / r.tips) * 10) / 10 : 0,
    }))
    .sort((a, b) => b.points - a.points || b.exact - a.exact || a.name.localeCompare(b.name, 'da'));
}

/**
 * Mest overraskende resultat: den afsluttede kamp hvor færrest ramte udfaldet
 * (mindst `minTips` tips). Returnerer {match, stats} eller null.
 */
export function mostSurprising(matches, betsByMatch, minTips = 3) {
  let best = null;
  for (const m of finishedWithResult(matches)) {
    const stats = computeMatchStats(m, betsByMatch?.get?.(m.id) ?? []);
    if (stats.total < minTips) continue;
    if (!best || stats.outcomePct < best.stats.outcomePct ||
        (stats.outcomePct === best.stats.outcomePct && stats.exactPct < best.stats.exactPct)) {
      best = { match: m, stats };
    }
  }
  return best;
}

/**
 * Bedst forudsagte kamp: flest ramte eksakt score (mindst `minTips` tips).
 * Returnerer {match, stats} eller null.
 */
export function bestPredicted(matches, betsByMatch, minTips = 3) {
  let best = null;
  for (const m of finishedWithResult(matches)) {
    const stats = computeMatchStats(m, betsByMatch?.get?.(m.id) ?? []);
    if (stats.total < minTips) continue;
    if (!best || stats.exactPct > best.stats.exactPct ||
        (stats.exactPct === best.stats.exactPct && stats.outcomePct > best.stats.outcomePct)) {
      best = { match: m, stats };
    }
  }
  return best;
}

/**
 * Disciplin-statistik (kort) ud fra kampdetaljer (match.details.bookings).
 * Røde vægter tungest. Returnerer top-hold og top-spillere samt totaler.
 * @param {Array<object>} matches  kampe med evt. .details.bookings[] og .homeTeam/.awayTeam
 * @returns {{ teams: Array, players: Array, totals: {yellow:number, red:number} }}
 */
export function computeDiscipline(matches) {
  const byTeam = {};
  const byPlayer = {};
  for (const m of matches ?? []) {
    const bookings = m?.details?.bookings;
    if (!Array.isArray(bookings)) continue;
    for (const b of bookings) {
      const teamCode = b.side === 'home' ? m.homeTeam : b.side === 'away' ? m.awayTeam : null;
      const isRed = b.card === 'RED' || b.card === 'YELLOW_RED';
      const isYellow = b.card === 'YELLOW';
      if (teamCode) {
        byTeam[teamCode] = byTeam[teamCode] || { code: teamCode, yellow: 0, red: 0 };
        if (isYellow) byTeam[teamCode].yellow++;
        if (isRed) byTeam[teamCode].red++;
      }
      if (b.player) {
        byPlayer[b.player] = byPlayer[b.player] || { name: b.player, team: teamCode, yellow: 0, red: 0 };
        if (isYellow) byPlayer[b.player].yellow++;
        if (isRed) byPlayer[b.player].red++;
      }
    }
  }
  const score = (x) => x.red * 2 + x.yellow; // røde kort vægter tungest
  const bySeverity = (a, b) => score(b) - score(a) || b.red - a.red
    || teamName(a.code).localeCompare(teamName(b.code), 'da');
  const teams = Object.values(byTeam).sort(bySeverity);
  const players = Object.values(byPlayer).sort(bySeverity);
  const totals = teams.reduce(
    (acc, t) => ({ yellow: acc.yellow + t.yellow, red: acc.red + t.red }),
    { yellow: 0, red: 0 },
  );

  // Alle deltagende nationer (gyldige landekoder fra kampene) med deres kort —
  // også dem med 0, så man kan se hele feltet.
  const nationCodes = new Set();
  for (const m of matches ?? []) {
    for (const code of [m?.homeTeam, m?.awayTeam]) {
      if (code && TEAMS[code]) nationCodes.add(code);
    }
  }
  const allTeams = [...nationCodes]
    .map((code) => byTeam[code] || { code, yellow: 0, red: 0 })
    .sort(bySeverity);

  return { teams, players, totals, allTeams };
}

// ─── Turnerings-fakta (uafhængigt af vores tip-spil) ────────────────────────

/** Alle mål på tværs af kampe (fra details.goals), evt. beriget med kampens hold. */
function allGoals(matches) {
  const out = [];
  for (const m of matches ?? []) {
    const goals = m?.details?.goals;
    if (!Array.isArray(goals)) continue;
    for (const g of goals) out.push({ ...g, home: m.homeTeam, away: m.awayTeam, matchId: m.id });
  }
  return out;
}

const INTERVAL_BINS = ['0-15', '16-30', '31-45', '45+', '46-60', '61-75', '76-90', '90+'];

/** Hvilket minut-interval hører et mål til? Returnerer en label fra INTERVAL_BINS eller null. */
function goalBin(minute, injuryTime) {
  if (minute == null) return null;
  if (injuryTime > 0 && minute <= 45) return '45+';
  if (injuryTime > 0 && minute >= 46) return '90+';
  if (minute > 90) return '90+';
  if (minute <= 15) return '0-15';
  if (minute <= 30) return '16-30';
  if (minute <= 45) return '31-45';
  if (minute <= 60) return '46-60';
  if (minute <= 75) return '61-75';
  return '76-90';
}

/**
 * Fordel alle mål på minut-intervaller (bins) på tværs af alle kampe.
 * @param {Array<object>} matches
 * @returns {{ bins: Array<{label:string,count:number,pct:number}>, total:number, peak:object|null }}
 */
export function computeGoalsByInterval(matches) {
  const counts = Object.fromEntries(INTERVAL_BINS.map((b) => [b, 0]));
  let total = 0;
  for (const g of allGoals(matches)) {
    const bin = goalBin(g.minute, g.injuryTime);
    if (!bin) continue;
    counts[bin] += 1;
    total += 1;
  }
  const bins = INTERVAL_BINS.map((label) => ({
    label, count: counts[label], pct: total ? Math.round((counts[label] / total) * 100) : 0,
  }));
  let peak = null;
  for (const b of bins) if (b.count > 0 && (!peak || b.count > peak.count)) peak = b;
  return { bins, total, peak };
}

/**
 * Samlede turnerings-nøgletal ud fra afsluttede kampe + kampdetaljer.
 * @param {Array<object>} matches
 */
export function computeTournamentFacts(matches) {
  const finished = finishedWithResult(matches);
  const played = finished.length;
  let homeGoals = 0;
  let awayGoals = 0;
  const resultTally = new Map(); // "hi-lo" -> count
  for (const m of finished) {
    homeGoals += Number(m.result.home || 0);
    awayGoals += Number(m.result.away || 0);
    const hi = Math.max(m.result.home, m.result.away);
    const lo = Math.min(m.result.home, m.result.away);
    const key = `${hi}-${lo}`;
    resultTally.set(key, (resultTally.get(key) ?? 0) + 1);
  }
  const totalGoals = homeGoals + awayGoals;

  // Mål-typer fra detaljer
  const typeBreakdown = { regular: 0, penalty: 0, own: 0 };
  let earliest = null;
  let latest = null;
  for (const g of allGoals(matches)) {
    if (g.type === 'PENALTY') typeBreakdown.penalty += 1;
    else if (g.type === 'OWN') typeBreakdown.own += 1;
    else typeBreakdown.regular += 1;
    if (g.minute != null) {
      const key = g.minute * 100 + (g.injuryTime || 0);
      if (!earliest || key < earliest._k) earliest = { ...g, _k: key };
      if (!latest || key > latest._k) latest = { ...g, _k: key };
    }
  }

  const frequentResults = [...resultTally.entries()]
    .map(([score, count]) => ({ score, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  return {
    played,
    totalGoals,
    goalsPerMatch: played ? Math.round((totalGoals / played) * 10) / 10 : 0,
    homeGoals,
    awayGoals,
    typeBreakdown,
    frequentResults,
    earliest,
    latest,
  };
}

/** Udfald (HOME/AWAY/DRAW) af et {home,away}-scoreobjekt. */
function sideOutcome(home, away) {
  if (home > away) return 'HOME';
  if (away > home) return 'AWAY';
  return 'DRAW';
}

/**
 * 2.-halvlegs-statistik: kampe hvor stillingen ændrede sig efter pausen,
 * comebacks (hold bagud ved pausen der endte med at vinde) og clean sheets.
 * @param {Array<object>} matches
 */
export function computeSecondHalfStats(matches) {
  const finished = finishedWithResult(matches);
  let changedAfterHalf = 0;
  let withHalfTime = 0;
  const comebacks = [];
  for (const m of finished) {
    const ht = m.details?.halfTime;
    if (ht && ht.home != null && ht.away != null) {
      withHalfTime += 1;
      const htO = sideOutcome(ht.home, ht.away);
      const ftO = sideOutcome(m.result.home, m.result.away);
      if (htO !== ftO) changedAfterHalf += 1;
      // Comeback: bagud ved pausen, vandt til slut.
      if (htO === 'HOME' && ftO === 'AWAY') comebacks.push({ match: m, team: m.awayTeam });
      if (htO === 'AWAY' && ftO === 'HOME') comebacks.push({ match: m, team: m.homeTeam });
    }
  }

  // Clean sheets pr. hold (afsluttede kampe uden indkasserede mål).
  const cs = {};
  for (const m of finished) {
    if (m.homeTeam && m.result.away === 0) cs[m.homeTeam] = (cs[m.homeTeam] ?? 0) + 1;
    if (m.awayTeam && m.result.home === 0) cs[m.awayTeam] = (cs[m.awayTeam] ?? 0) + 1;
  }
  const cleanSheets = Object.entries(cs)
    .map(([team, count]) => ({ team, count }))
    .sort((a, b) => b.count - a.count);

  return { withHalfTime, changedAfterHalf, comebacks, cleanSheets };
}

/**
 * "Hidsigste" kampe: flest kort (rødt vægter dobbelt). Top `limit`.
 * @param {Array<object>} matches
 * @param {number} [limit]
 */
export function computeFieryMatches(matches, limit = 5) {
  const rows = [];
  for (const m of matches ?? []) {
    const bookings = m?.details?.bookings;
    if (!Array.isArray(bookings) || bookings.length === 0) continue;
    let yellow = 0;
    let red = 0;
    for (const b of bookings) {
      if (b.card === 'YELLOW') yellow += 1;
      else if (b.card === 'RED' || b.card === 'YELLOW_RED') red += 1;
    }
    rows.push({ match: m, yellow, red, weight: red * 2 + yellow });
  }
  return rows.sort((a, b) => b.weight - a.weight || b.red - a.red).slice(0, limit);
}

/**
 * Dommerstatistik: antal kampe + kort pr. dommer (fra details.referee/bookings).
 * @param {Array<object>} matches
 */
export function computeRefereeStats(matches) {
  const byRef = {};
  for (const m of matches ?? []) {
    const ref = m?.details?.referee;
    if (!ref) continue;
    byRef[ref] = byRef[ref] || { name: ref, matches: 0, yellow: 0, red: 0 };
    byRef[ref].matches += 1;
    for (const b of m.details.bookings ?? []) {
      if (b.card === 'YELLOW') byRef[ref].yellow += 1;
      else if (b.card === 'RED' || b.card === 'YELLOW_RED') byRef[ref].red += 1;
    }
  }
  return Object.values(byRef).sort((a, b) => b.matches - a.matches || (b.yellow + b.red) - (a.yellow + a.red));
}
