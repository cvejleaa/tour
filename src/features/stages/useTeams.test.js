// useTeams — tip-dropdown'en skal vise PRÆCIS holdsidens officielle 2026-liste
// (ingen historisk støj fra teams-kollektionen: nedlagte hold, 2025-navne,
// ALL-CAPS-varianter fra resultattabellerne).
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTeams } from './useTeams';
import { TOUR_TEAMS, TEAMS } from '../../data/tourTeams2026';

describe('useTeams', () => {
  const { result } = renderHook(() => useTeams(2026));

  it('viser præcis holdsidens 23 officielle hold — hverken flere eller færre', () => {
    expect(result.current.teams).toHaveLength(TEAMS.length);
    expect([...result.current.teams].sort()).toEqual([...TOUR_TEAMS].sort());
  });

  it('er sorteret alfabetisk (dansk)', () => {
    const t = result.current.teams;
    expect(t).toEqual([...t].sort((a, b) => a.localeCompare(b, 'da')));
  });

  it('indeholder INGEN nedlagte hold eller navnevarianter', () => {
    const t = result.current.teams;
    expect(t).not.toContain('ARKEA-B&B HOTELS');
    expect(t).not.toContain('Israel - Premier Tech');
    expect(t.every((n) => TOUR_TEAMS.includes(n))).toBe(true);
  });

  it('er klar med det samme (ingen loading)', () => {
    expect(result.current.loading).toBe(false);
  });
});
