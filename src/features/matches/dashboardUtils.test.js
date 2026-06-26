import { describe, it, expect } from 'vitest';
import { computeDashboard } from './dashboardUtils';

// Fast "nu": 15. juni 2026 kl. 10:00 dansk tid
const NOW = new Date('2026-06-15T10:00:00+02:00');
const at = (iso) => new Date(iso);

const matches = [
  { id: 'm1', homeTeam: 'BRA', awayTeam: 'ARG', kickoff: at('2026-06-15T18:00:00+02:00') }, // i dag, fremtid
  { id: 'm2', homeTeam: 'FRA', awayTeam: 'ENG', kickoff: at('2026-06-15T20:00:00+02:00') }, // i dag, tippet
  { id: 'm3', homeTeam: 'GER', awayTeam: 'ESP', kickoff: at('2026-06-15T08:00:00+02:00') }, // i dag, låst
  { id: 'm4', homeTeam: 'POR', awayTeam: 'NED', kickoff: at('2026-06-16T18:00:00+02:00') }, // i morgen
  { id: 'm5', homeTeam: null,  awayTeam: null,  kickoff: at('2026-06-15T19:00:00+02:00') }, // ukendte hold
];

const bets = new Set(['m2']);

describe('computeDashboard', () => {
  it('finder dagens kampe med kendte hold', () => {
    const d = computeDashboard(matches, bets, NOW);
    expect(d.todayMatches.map((m) => m.id).sort()).toEqual(['m1', 'm2', 'm3']);
  });

  it('viser kun utippede, ikke-låste kampe i dag som manglende', () => {
    const d = computeDashboard(matches, bets, NOW);
    expect(d.missingToday.map((m) => m.id)).toEqual(['m1']);
  });

  it('tæller alle manglende tips (også fremtidige dage)', () => {
    const d = computeDashboard(matches, bets, NOW);
    expect(d.missingTotal).toBe(2); // m1 + m4
  });

  it('vælger den tidligste kommende kamp som næste', () => {
    const d = computeDashboard(matches, bets, NOW);
    expect(d.nextMatch.id).toBe('m1');
  });

  it('håndterer tom kampliste', () => {
    const d = computeDashboard([], bets, NOW);
    expect(d.todayMatches).toEqual([]);
    expect(d.nextMatch).toBeNull();
    expect(d.missingTotal).toBe(0);
  });
});
