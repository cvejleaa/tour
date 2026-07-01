import { describe, it, expect } from 'vitest';
import { stageAnswerRows } from './stageAnswerRows';

// Flad etape: winnerTeam, gcTeam og sprintTeam er aktive (ikke mountainTeam).
const stage = { id: '2026-stage-5', type: 'flat' };
const result = {
  winnerTeam: 'A', gcTeam: 'B', sprintTeam: 'C',
  podium: { winnerTeam: ['A', 'B', 'C'], gcTeam: ['B', 'A'], sprintTeam: ['C'] },
};

const bets = [
  { id: 'me_s', uid: 'me', winnerTeam: 'A', gcTeam: 'B', sprintTeam: 'C' }, // alt rigtigt
  { id: 'u2_s', uid: 'u2', winnerTeam: 'B', gcTeam: 'B', sprintTeam: 'X' }, // delvist
  { id: 'u3_s', uid: 'u3', winnerTeam: 'A', gcTeam: 'A', sprintTeam: 'C' }, // uden for liga
];
const names = { me: 'Mig', u2: 'To', u3: 'Tre' };
const nameOf = (uid) => names[uid] || uid;

describe('stageAnswerRows', () => {
  it('afgrænser til liga (visibleUids + mig) og sorterer efter point', () => {
    const rows = stageAnswerRows(bets, {
      stage, result, visibleUids: new Set(['me', 'u2']), meUid: 'me', nameOf,
    });
    expect(rows.map((r) => r.bet.uid)).toEqual(['me', 'u2']); // u3 filtreret fra
    expect(rows[0].bet.uid).toBe('me'); // flest point øverst
    expect(rows[0].scored.points).toBeGreaterThan(rows[1].scored.points);
  });

  it('admin ser alle uanset liga', () => {
    const rows = stageAnswerRows(bets, {
      stage, result, visibleUids: new Set(['me']), meUid: 'me', isAdmin: true, nameOf,
    });
    expect(rows).toHaveLength(3);
  });

  it('scorer kun aktive spørgsmål (mountainTeam ignoreres på flad etape)', () => {
    const withMountain = [{ id: 'x', uid: 'me', winnerTeam: 'A', mountainTeam: 'Z' }];
    const rows = stageAnswerRows(withMountain, { stage, result, visibleUids: null, meUid: 'me', nameOf });
    expect(rows[0].scored.breakdown.mountainTeam).toBeUndefined();
    expect(rows[0].scored.points).toBeGreaterThan(0); // fik point for winnerTeam
  });

  it('tåler tomt input', () => {
    expect(stageAnswerRows(null, { stage, result })).toEqual([]);
    expect(stageAnswerRows([], { stage, result })).toEqual([]);
  });
});
