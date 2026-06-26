// ---------------------------------------------------------------------------
// pipeline.integration.test.js — end-to-end-test af resultat-kæden uden
// Firebase/emulator. Følger en realistisk football-data.org-payload hele vejen:
//   football-data → decideUpdate → patch → scoreMatch/scoreKnockout → point
//   færdigspillet gruppe → computeGroupStandings → resolveGroupWinners → bonus
// Formålet er at fange brud i sammenhængen mellem modulerne før turneringen.
// ---------------------------------------------------------------------------
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { decideUpdate } = require('./resultsSync');
const { scoreMatch, scoreKnockout, bonusPoints, POINTS } = require('./scoring');
const { computeGroupStandings } = require('./standings');
const { resolveGroupWinners } = require('./bonusResolve');

const NOW = new Date('2026-06-25T21:00:00Z');

// Et football-data v4-match (forenklet, men med de felter koden læser).
const fd = (homeTla, awayTla, h, a, { status = 'FINISHED', winner, duration } = {}) => ({
  status,
  utcDate: '2026-06-25T19:00:00Z',
  homeTeam: { tla: homeTla, name: homeTla },
  awayTeam: { tla: awayTla, name: awayTla },
  score: { winner, duration, fullTime: { home: h, away: a } },
});

describe('resultat-kæden: gruppekamp → point', () => {
  const our = { round: 'group', groupName: 'C', homeTeam: 'BRA', awayTeam: 'MAR', status: 'scheduled' };

  it('en afsluttet kamp giver det rigtige resultat og point til spillerne', () => {
    const decision = decideUpdate(our, fd('BRA', 'MAR', 2, 0, { winner: 'HOME_TEAM' }), NOW);
    expect(decision.action).toBe('finish');
    expect(decision.patch.status).toBe('finished');
    expect(decision.patch.result).toEqual({ home: 2, away: 0 });

    const result = decision.patch.result;
    // Eksakt tip → 5, rigtigt udfald + målforskel → 3, rigtigt udfald men
    // forkert målforskel → 2, forkert udfald → 0.
    expect(scoreMatch({ home: 2, away: 0 }, result)).toBe(POINTS.EXACT);
    expect(scoreMatch({ home: 3, away: 1 }, result)).toBe(POINTS.GOAL_DIFF);
    expect(scoreMatch({ home: 3, away: 0 }, result)).toBe(POINTS.OUTCOME);
    expect(scoreMatch({ home: 0, away: 1 }, result)).toBe(POINTS.WRONG);
  });

  it('live-kamp giver foreløbig score uden at afslutte', () => {
    const decision = decideUpdate(our, fd('BRA', 'MAR', 1, 0, { status: 'IN_PLAY' }), NOW);
    expect(decision.action).toBe('live');
    expect(decision.patch.status).toBe('live');
    expect(decision.patch.result).toEqual({ home: 1, away: 0 });
  });
});

describe('resultat-kæden: knockout på straffespark', () => {
  const our = { round: 'qf', homeTeam: 'ESP', awayTeam: 'FRA', status: 'scheduled' };

  it('uafgjort fuldtid + winner → advance, og advance-bonus til den der ramte', () => {
    const decision = decideUpdate(
      our,
      fd('ESP', 'FRA', 1, 1, { winner: 'AWAY_TEAM', duration: 'PENALTY_SHOOTOUT' }),
      NOW,
    );
    expect(decision.action).toBe('finish');
    expect(decision.patch.needsReview).toBeUndefined();
    expect(decision.patch.result).toEqual({ home: 1, away: 1, advance: 'FRA' });

    const result = decision.patch.result;
    // Ramte uafgjort 1-1 OG at FRA gik videre → eksakt (5) + advance (2).
    expect(scoreKnockout({ home: 1, away: 1, advance: 'FRA' }, result)).toBe(POINTS.EXACT + POINTS.KNOCKOUT_ADVANCE);
    // Ramte scoren men forkert «videre» → kun score-point.
    expect(scoreKnockout({ home: 1, away: 1, advance: 'ESP' }, result)).toBe(POINTS.EXACT);
  });
});

describe('resultat-kæden: færdigspillet gruppe → gruppevinder-bonus', () => {
  const teams = ['BRA', 'MAR', 'HAI', 'SCO'];

  // 6 finished kampe hvor BRA vinder alt, resten uafgjort → BRA bliver etter.
  const matches = (() => {
    const pairs = [['BRA', 'MAR'], ['HAI', 'SCO'], ['BRA', 'HAI'], ['MAR', 'SCO'], ['BRA', 'SCO'], ['MAR', 'HAI']];
    return pairs.map(([h, a]) => ({
      groupName: 'C', round: 'group', status: 'finished', homeTeam: h, awayTeam: a,
      result: h === 'BRA' ? { home: 2, away: 0 } : { home: 1, away: 1 },
    }));
  })();

  it('rangerer korrekt og afgør vinderen som facit', () => {
    const standings = computeGroupStandings(teams, matches);
    expect(standings[0].team).toBe('BRA');

    const q = { id: 'groupWinner_C', type: 'groupWinner', groupName: 'C', facit: null, options: teams };
    const resolutions = resolveGroupWinners([q], matches);
    expect(resolutions).toEqual([{ questionId: 'groupWinner_C', groupName: 'C', facit: 'BRA' }]);

    // Bonus-point: rigtigt gæt (BRA) → 10, forkert (MAR) → 0.
    const facit = resolutions[0].facit;
    expect(bonusPoints({ answer: 'BRA', facit, type: 'groupWinner' })).toBe(POINTS.BONUS);
    expect(bonusPoints({ answer: 'MAR', facit, type: 'groupWinner' })).toBe(0);
  });

  it('afgør ikke gruppevinderen før alle kampe er spillet', () => {
    const q = { id: 'groupWinner_C', type: 'groupWinner', groupName: 'C', facit: null, options: teams };
    expect(resolveGroupWinners([q], matches.slice(0, 5))).toEqual([]);
  });
});
