// ---------------------------------------------------------------------------
// resultsSync.js — ren beslutnings- og mapningslogik for auto-resultater.
// Ingen Firebase/HTTP — nem at teste isoleret.
// ---------------------------------------------------------------------------
'use strict';

const { mapStatus, extractScore, REVIEW_STATUSES } = require('./footballData');

/** Normalisér navn/kode til sammenligning (accenter væk, kun a-z0-9). */
function norm(s) {
  return String(s == null ? '' : s)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Passer et football-data-hold til vores 3-bogstavskode? */
function teamCodeMatches(ourCode, fdTeam) {
  const c = norm(ourCode);
  if (!c || !fdTeam) return false;
  if (norm(fdTeam.tla) === c) return true;
  const name = norm(fdTeam.name);
  const short = norm(fdTeam.shortName);
  return (!!name && name.startsWith(c)) || (!!short && short.startsWith(c));
}

/** UTC-dato (YYYY-MM-DD) for et tidspunkt (ms/ISO/Date). */
function utcDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** kickoff (Timestamp/Date/ms/ISO) → ms. */
function kickoffMs(kickoff) {
  if (!kickoff) return NaN;
  if (typeof kickoff.toDate === 'function') return kickoff.toDate().getTime();
  const d = new Date(kickoff);
  return d.getTime();
}

// Hvor langt fra vores kickoff en football-data-kamp må ligge og stadig regnes
// som "samme kamp". Et holdpar er entydigt i en VM-turnering, så vinduet skal
// blot rumme upræcise seed-tidspunkter og kampe der falder over UTC-midnat
// (et eksakt dato-match misser ellers kampe der starter sent UTC-tid).
const MATCH_WINDOW_MS = 3 * 24 * 3600 * 1000;

/**
 * Find football-data-kampen der svarer til en af vores kampe: begge hold matcher
 * og kickoff ligger inden for MATCH_WINDOW_MS. Ved flere kandidater vælges den
 * tidsmæssigt nærmeste. Returnerer fd-kampen eller null.
 */
function matchFixture(ourMatch, fdMatches) {
  if (!ourMatch || !ourMatch.homeTeam || !ourMatch.awayTeam) return null;
  const ourMs = kickoffMs(ourMatch.kickoff);
  if (Number.isNaN(ourMs)) return null;
  let best = null;
  let bestDelta = Infinity;
  for (const fd of fdMatches || []) {
    const teamsMatch = teamCodeMatches(ourMatch.homeTeam, fd.homeTeam)
      && teamCodeMatches(ourMatch.awayTeam, fd.awayTeam);
    if (!teamsMatch) continue;
    const fdMs = new Date(fd.utcDate).getTime();
    if (Number.isNaN(fdMs)) continue;
    const delta = Math.abs(fdMs - ourMs);
    if (delta <= MATCH_WINDOW_MS && delta < bestDelta) {
      best = fd;
      bestDelta = delta;
    }
  }
  return best;
}

/** football-data-vinder ('HOME_TEAM'/'AWAY_TEAM') → vores holdkode. */
function winnerToCode(winner, ourMatch) {
  if (winner === 'HOME_TEAM') return ourMatch.homeTeam || null;
  if (winner === 'AWAY_TEAM') return ourMatch.awayTeam || null;
  return null;
}

/**
 * Beslut hvad der skal skrives for én kamp ud fra football-data-svaret.
 * @returns {{action:'skip'|'review'|'live'|'finish', patch?:object, reason?:string}}
 */
function decideUpdate(ourMatch, fdMatch, now = new Date()) {
  if (!ourMatch || !fdMatch) return { action: 'skip', reason: 'missing' };
  if (ourMatch.manualLock) return { action: 'skip', reason: 'manualLock' };

  const fdStatus = fdMatch.status;

  // Afbrudt/udsat/aflyst → skriv ikke score, bed admin kigge.
  if (REVIEW_STATUSES.has(fdStatus) && fdStatus !== 'AWARDED') {
    return { action: 'review', patch: { needsReview: true, providerStatus: fdStatus, autoUpdatedAt: now } };
  }

  const ourStatus = mapStatus(fdStatus);
  if (ourStatus === 'scheduled') return { action: 'skip', reason: 'not-started' };

  const score = extractScore(fdMatch);
  if (!score) return { action: 'skip', reason: 'no-score' };

  const isKnockout = ourMatch.round && ourMatch.round !== 'group';

  if (ourStatus === 'finished') {
    const result = { home: score.home, away: score.away };
    let needsReview = fdStatus === 'AWARDED'; // tildelt resultat → bekræft manuelt
    if (isKnockout) {
      const advance = winnerToCode(score.winner, ourMatch);
      if (advance) result.advance = advance;
      else needsReview = true; // uafgjort/uklar vinder i knockout → admin afgør "videre"
    }
    const patch = { result, status: 'finished', resultSource: 'auto', autoUpdatedAt: now };
    if (needsReview) patch.needsReview = true;
    return { action: 'finish', patch };
  }

  // live — foreløbig score (ingen "advance" endnu)
  const patch = { result: { home: score.home, away: score.away }, status: 'live', resultSource: 'auto', autoUpdatedAt: now };
  return { action: 'live', patch };
}

/** Ændrer patch'en reelt dokumentet? (undgå unødige skrivninger/genberegninger). */
function patchChangesDoc(match, patch) {
  if (!patch) return false;
  if (patch.status && patch.status !== (match && match.status)) return true;
  if (patch.result) {
    const r = (match && match.result) || {};
    if (Number(r.home) !== Number(patch.result.home)) return true;
    if (Number(r.away) !== Number(patch.result.away)) return true;
    if ((r.advance || null) !== (patch.result.advance || null)) return true;
  }
  if (patch.needsReview && !(match && match.needsReview)) return true;
  return false;
}

/**
 * Sammenlign vores kamptider med football-data og find afvigelser.
 * Matcher primært på hold (gruppe-pardannelser er unikke), så selv store
 * tids-fejl fanges. Returnerer kun kampe, hvor tiden afviger > 60 sek.
 * @param {Array<object>} ours       vores kampe (med homeTeam/awayTeam/kickoff/id)
 * @param {Array<object>} fdMatches  football-data-kampe (utcDate, homeTeam, awayTeam, id)
 * @returns {Array<{id,home,away,fromISO,toISO,fdId}>}
 */
function auditKickoffs(ours, fdMatches) {
  const changes = [];
  for (const m of ours || []) {
    if (!m || !m.homeTeam || !m.awayTeam) continue;
    const sameTeams = (fdMatches || []).filter((fd) =>
      teamCodeMatches(m.homeTeam, fd.homeTeam) && teamCodeMatches(m.awayTeam, fd.awayTeam));
    // Præcis ét hold-match → brug det (uanset tid). Ellers disambiguér via vindue.
    const fd = sameTeams.length === 1 ? sameTeams[0] : matchFixture(m, fdMatches);
    if (!fd || !fd.utcDate) continue;
    const ourMs = kickoffMs(m.kickoff);
    const fdMs = new Date(fd.utcDate).getTime();
    if (Number.isNaN(fdMs)) continue;
    if (Number.isNaN(ourMs) || Math.abs(fdMs - ourMs) > 60000) {
      changes.push({
        id: m.id, home: m.homeTeam, away: m.awayTeam,
        fromISO: Number.isNaN(ourMs) ? null : new Date(ourMs).toISOString(),
        toISO: new Date(fdMs).toISOString(),
        fdId: String(fd.id),
      });
    }
  }
  return changes;
}

module.exports = {
  norm, teamCodeMatches, utcDate, kickoffMs,
  matchFixture, winnerToCode, decideUpdate, patchChangesDoc, auditKickoffs,
};
