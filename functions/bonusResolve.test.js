import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { resolveGroupWinners, isUnset } = require('./bonusResolve');

// Hjælper: 6 kampe i en 4-holds gruppe. `wins` angiver hvor mange sejre hvert
// hold får — her laver vi bare et entydigt resultat hvor BRA vinder alt.
function groupMatches(groupName, teams, scoreFor) {
  const [a, b, c, d] = teams;
  const pairs = [[a, b], [c, d], [a, c], [b, d], [a, d], [b, c]];
  return pairs.map(([home, away]) => ({
    groupName,
    round: 'group',
    status: 'finished',
    homeTeam: home,
    awayTeam: away,
    result: scoreFor(home, away),
  }));
}

describe('isUnset', () => {
  it('genkender tomme facit', () => {
    expect(isUnset(null)).toBe(true);
    expect(isUnset(undefined)).toBe(true);
    expect(isUnset('')).toBe(true);
    expect(isUnset('  ')).toBe(true);
  });
  it('genkender satte facit', () => {
    expect(isUnset('BRA')).toBe(false);
  });
});

describe('resolveGroupWinners', () => {
  const teams = ['BRA', 'MAR', 'HAI', 'SCO'];
  const q = { id: 'groupWinner_C', type: 'groupWinner', groupName: 'C', facit: null, options: teams };
  // BRA vinder hver kamp den spiller, ellers 1-1.
  const braWinsAll = (home, away) => {
    if (home === 'BRA') return { home: 2, away: 0 };
    if (away === 'BRA') return { home: 0, away: 2 };
    return { home: 1, away: 1 };
  };

  it('afgør vinderen når gruppen er færdigspillet', () => {
    const res = resolveGroupWinners([q], groupMatches('C', teams, braWinsAll));
    expect(res).toEqual([{ questionId: 'groupWinner_C', groupName: 'C', facit: 'BRA' }]);
  });

  it('afgør IKKE en gruppe der mangler kampe', () => {
    const partial = groupMatches('C', teams, braWinsAll).slice(0, 5);
    expect(resolveGroupWinners([q], partial)).toEqual([]);
  });

  it('rører ikke et spørgsmål der allerede har facit (fx manuelt sat)', () => {
    const locked = { ...q, facit: 'MAR' };
    expect(resolveGroupWinners([locked], groupMatches('C', teams, braWinsAll))).toEqual([]);
  });

  it('ignorerer ikke-gruppevinder-spørgsmål', () => {
    const top = { id: 'topScorer', type: 'topScorer', groupName: null, facit: null };
    expect(resolveGroupWinners([top], [])).toEqual([]);
  });

  it('kan afgøre flere grupper på én gang', () => {
    const teamsD = ['USA', 'PAR', 'AUS', 'TUR'];
    const qD = { id: 'groupWinner_D', type: 'groupWinner', groupName: 'D', facit: null, options: teamsD };
    const usaWinsAll = (home, away) => {
      if (home === 'USA') return { home: 3, away: 0 };
      if (away === 'USA') return { home: 0, away: 3 };
      return { home: 0, away: 0 };
    };
    const all = [...groupMatches('C', teams, braWinsAll), ...groupMatches('D', teamsD, usaWinsAll)];
    const res = resolveGroupWinners([q, qD], all);
    expect(res).toEqual([
      { questionId: 'groupWinner_C', groupName: 'C', facit: 'BRA' },
      { questionId: 'groupWinner_D', groupName: 'D', facit: 'USA' },
    ]);
  });
});
