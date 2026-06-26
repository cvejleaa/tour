// ---------------------------------------------------------------------------
// functions/scoring.test.js — Tests for functions/scoring.js (CommonJS-udgave).
// Kører med vitest UDEN emulator-afhængigheder.
// Kør med: npx vitest run scoring.test.js (fra functions/) eller npm test
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { POINTS, outcome, scoreMatch, scoreKnockout, scoreBonus, fuzzyNameMatch, bonusPoints } = require('./scoring.js');

// ---------------------------------------------------------------------------
// POINTS-konstanter
// ---------------------------------------------------------------------------
describe('POINTS konstanter', () => {
  it('har de korrekte værdier', () => {
    expect(POINTS.EXACT).toBe(5);
    expect(POINTS.GOAL_DIFF).toBe(3);
    expect(POINTS.OUTCOME).toBe(2);
    expect(POINTS.WRONG).toBe(0);
    expect(POINTS.KNOCKOUT_ADVANCE).toBe(2);
    expect(POINTS.BONUS).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// outcome()
// ---------------------------------------------------------------------------
describe('outcome()', () => {
  it('returnerer "home" ved hjemmesejr', () => {
    expect(outcome(2, 1)).toBe('home');
    expect(outcome(3, 0)).toBe('home');
    expect(outcome(1, 0)).toBe('home');
  });

  it('returnerer "away" ved udesejr', () => {
    expect(outcome(0, 1)).toBe('away');
    expect(outcome(1, 3)).toBe('away');
  });

  it('returnerer "draw" ved uafgjort', () => {
    expect(outcome(0, 0)).toBe('draw');
    expect(outcome(2, 2)).toBe('draw');
    expect(outcome(1, 1)).toBe('draw');
  });
});

// ---------------------------------------------------------------------------
// scoreMatch()
// ---------------------------------------------------------------------------
describe('scoreMatch()', () => {
  it('giver EXACT (5) ved eksakt korrekt score', () => {
    expect(scoreMatch({ home: 2, away: 1 }, { home: 2, away: 1 })).toBe(5);
    expect(scoreMatch({ home: 0, away: 0 }, { home: 0, away: 0 })).toBe(5);
    expect(scoreMatch({ home: 3, away: 2 }, { home: 3, away: 2 })).toBe(5);
  });

  it('giver GOAL_DIFF (3) ved korrekt udfald OG målforskel, men forkert score', () => {
    // Begge vinder 1-0, men tip er 2-1 (MF = 1, resultat MF = 0 — forkert)
    // Faktisk: 2-1 vs 3-2 → begge hjemmesejr, MF = 1 → GOAL_DIFF
    expect(scoreMatch({ home: 2, away: 1 }, { home: 3, away: 2 })).toBe(3);
    // 0-2 vs 1-3 → begge udesejr, MF = -2 → GOAL_DIFF
    expect(scoreMatch({ home: 0, away: 2 }, { home: 1, away: 3 })).toBe(3);
    // Uafgjort: 1-1 vs 2-2 → begge draw, MF = 0 → GOAL_DIFF
    expect(scoreMatch({ home: 1, away: 1 }, { home: 2, away: 2 })).toBe(3);
  });

  it('giver OUTCOME (2) ved korrekt udfald men forkert målforskel', () => {
    // Hjemmesejr, forskellig MF
    expect(scoreMatch({ home: 1, away: 0 }, { home: 3, away: 1 })).toBe(2);
    expect(scoreMatch({ home: 2, away: 0 }, { home: 1, away: 0 })).toBe(2);
    // Udesejr, forskellig MF
    expect(scoreMatch({ home: 0, away: 2 }, { home: 0, away: 1 })).toBe(2);
  });

  it('giver WRONG (0) ved forkert udfald', () => {
    // Tip hjemmesejr, resultat udesejr
    expect(scoreMatch({ home: 2, away: 1 }, { home: 0, away: 1 })).toBe(0);
    // Tip uafgjort, resultat hjemmesejr
    expect(scoreMatch({ home: 1, away: 1 }, { home: 2, away: 1 })).toBe(0);
    // Tip udesejr, resultat uafgjort
    expect(scoreMatch({ home: 0, away: 1 }, { home: 2, away: 2 })).toBe(0);
  });

  it('giver 0 ved null/undefined input', () => {
    expect(scoreMatch(null, { home: 1, away: 0 })).toBe(0);
    expect(scoreMatch({ home: 1, away: 0 }, null)).toBe(0);
    expect(scoreMatch(null, null)).toBe(0);
    expect(scoreMatch(undefined, undefined)).toBe(0);
  });

  it('giver 0 ved ikke-tal input', () => {
    expect(scoreMatch({ home: 'a', away: 0 }, { home: 1, away: 0 })).toBe(0);
    expect(scoreMatch({ home: 1, away: 0 }, { home: NaN, away: 0 })).toBe(0);
    expect(scoreMatch({ home: Infinity, away: 0 }, { home: 1, away: 0 })).toBe(0);
  });

  it('håndterer 0-0 uafgjort korrekt', () => {
    expect(scoreMatch({ home: 0, away: 0 }, { home: 0, away: 0 })).toBe(5);
    expect(scoreMatch({ home: 1, away: 1 }, { home: 0, away: 0 })).toBe(3); // GOAL_DIFF: begge draw, MF = 0
    expect(scoreMatch({ home: 2, away: 1 }, { home: 0, away: 0 })).toBe(0); // forkert udfald
  });
});

// ---------------------------------------------------------------------------
// scoreKnockout()
// ---------------------------------------------------------------------------
describe('scoreKnockout()', () => {
  it('giver score-point + advance-point ved begge korrekte', () => {
    const bet    = { home: 2, away: 1, advance: 'BRA' };
    const result = { home: 2, away: 1, advance: 'BRA' };
    // EXACT (5) + KNOCKOUT_ADVANCE (2) = 7
    expect(scoreKnockout(bet, result)).toBe(7);
  });

  it('giver kun score-point ved forkert advance', () => {
    const bet    = { home: 2, away: 1, advance: 'ARG' };
    const result = { home: 2, away: 1, advance: 'BRA' };
    expect(scoreKnockout(bet, result)).toBe(5); // EXACT kun
  });

  it('giver advance-point selvom score er delvist korrekt', () => {
    const bet    = { home: 1, away: 0, advance: 'BRA' };
    const result = { home: 2, away: 1, advance: 'BRA' }; // GOAL_DIFF (3) + advance (2) = 5
    expect(scoreKnockout(bet, result)).toBe(5);
  });

  it('giver kun advance-point ved forkert score men korrekt advance', () => {
    const bet    = { home: 2, away: 1, advance: 'BRA' };
    const result = { home: 0, away: 1, advance: 'BRA' }; // WRONG (0) + advance (2) = 2
    expect(scoreKnockout(bet, result)).toBe(2);
  });

  it('giver 0 ved forkert alt', () => {
    const bet    = { home: 2, away: 1, advance: 'ARG' };
    const result = { home: 0, away: 2, advance: 'BRA' };
    expect(scoreKnockout(bet, result)).toBe(0);
  });

  it('håndterer manglende advance-felt', () => {
    const bet    = { home: 2, away: 1 };
    const result = { home: 2, away: 1, advance: 'BRA' };
    expect(scoreKnockout(bet, result)).toBe(5); // EXACT, intet advance-point
  });

  it('håndterer null input som scoreMatch', () => {
    expect(scoreKnockout(null, { home: 1, away: 0, advance: 'BRA' })).toBe(0);
    expect(scoreKnockout({ home: 1, away: 0, advance: 'BRA' }, null)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// scoreBonus()
// ---------------------------------------------------------------------------
describe('scoreBonus()', () => {
  it('giver BONUS (10) ved korrekt svar', () => {
    expect(scoreBonus('BRA', 'BRA')).toBe(10);
    expect(scoreBonus('Mbappe', 'Mbappe')).toBe(10);
  });

  it('sammenligner som strenge', () => {
    expect(scoreBonus(42, '42')).toBe(10); // konverteres til streng
    expect(scoreBonus('42', 42)).toBe(10);
  });

  it('giver 0 ved forkert svar', () => {
    expect(scoreBonus('ARG', 'BRA')).toBe(0);
  });

  it('er tolerant: ufølsom for store/små bogstaver og mellemrum', () => {
    expect(scoreBonus('mbappe', 'Mbappe')).toBe(10);
    expect(scoreBonus('  HAALAND ', 'haaland')).toBe(10);
    expect(scoreBonus('   ', 'Haaland')).toBe(0); // tomt svar
  });

  it('giver 0 ved null/undefined', () => {
    expect(scoreBonus(null, 'BRA')).toBe(0);
    expect(scoreBonus('BRA', null)).toBe(0);
    expect(scoreBonus(null, null)).toBe(0);
    expect(scoreBonus(undefined, 'BRA')).toBe(0);
    expect(scoreBonus('BRA', undefined)).toBe(0);
  });
});

describe('fuzzyNameMatch + bonusPoints', () => {
  it('topscorer matcher accenter og små stavefejl', () => {
    expect(fuzzyNameMatch('Mbappe', 'Mbappé')).toBe(true);
    expect(fuzzyNameMatch('Halland', 'Haaland')).toBe(true);
    expect(fuzzyNameMatch('Kane', 'Sane')).toBe(false);
  });
  it('bonusPoints: fuzzy topscorer', () => {
    expect(bonusPoints({ answer: 'mbappe', facit: 'Mbappé', type: 'topScorer' })).toBe(POINTS.BONUS);
    expect(bonusPoints({ answer: 'Haaland', facit: 'Mbappé', type: 'topScorer' })).toBe(0);
  });
  it('bonusPoints: admin-godkendt svar tæller', () => {
    expect(bonusPoints({ answer: 'Embappe', facit: 'Mbappé', type: 'topScorer', acceptedAnswers: ['Embappe'] })).toBe(POINTS.BONUS);
  });
  it('bonusPoints: gruppevinder kræver eksakt kode', () => {
    expect(bonusPoints({ answer: 'BRA', facit: 'BRA', type: 'groupWinner' })).toBe(POINTS.BONUS);
    expect(bonusPoints({ answer: 'BRC', facit: 'BRA', type: 'groupWinner' })).toBe(0);
  });
});
