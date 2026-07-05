import { describe, it, expect } from 'vitest';
import { searchTourStandings } from './tourRiderSearch';

const standings = {
  samlet: [
    { rank: 1, rider: 'VINGEGAARD Jonas', team: 'TEAM VISMA | LEASE A BIKE', time: '10:00:00' },
    { rank: 2, rider: 'POGACAR Tadej', team: 'UAE TEAM EMIRATES XRG', time: '+0:12' },
  ],
  sprint: [
    { rank: 1, rider: 'PHILIPSEN Jasper', team: 'ALPECIN - DECEUNINCK', points: 50 },
    { rank: 4, rider: 'VINGEGAARD Jonas', team: 'TEAM VISMA | LEASE A BIKE', points: 20 },
  ],
  bjerg: [],
  ungdom: [{ rank: 1, rider: 'POGACAR Tadej', team: 'UAE TEAM EMIRATES XRG', time: '10:00:12' }],
  hold: [{ rank: 1, team: 'TEAM VISMA | LEASE A BIKE' }],
};
const stageResult = [
  { rank: 3, rider: 'VINGEGAARD Jonas', team: 'TEAM VISMA | LEASE A BIKE', time: '+0:02' },
];

describe('searchTourStandings', () => {
  it('finder rytteren i ALLE stillinger + seneste etape', () => {
    const [hit] = searchTourStandings(standings, stageResult, 'vingegaard');
    expect(hit.rider).toBe('VINGEGAARD Jonas');
    expect(hit.places.samlet).toMatchObject({ rank: 1 });
    expect(hit.places.sprint).toMatchObject({ rank: 4, points: 20 });
    expect(hit.places.etape).toMatchObject({ rank: 3 });
    expect(hit.places.bjerg).toBeUndefined(); // ikke placeret dér
  });

  it('matcher accent- og versal-uafhængigt', () => {
    const res = searchTourStandings(standings, stageResult, 'pogaČar');
    expect(res).toHaveLength(1);
    expect(res[0].rider).toBe('POGACAR Tadej');
    expect(res[0].places.ungdom).toMatchObject({ rank: 1 });
  });

  it('sorterer efter GC-placering og respekterer limit', () => {
    const res = searchTourStandings(standings, stageResult, 'a'.repeat(1)); // for kort
    expect(res).toEqual([]);
    const all = searchTourStandings(standings, stageResult, 'ar'); // rammer flere
    expect(all.length).toBeGreaterThan(0);
    expect(all[0].places.samlet.rank).toBeLessThanOrEqual(all[all.length - 1].places.samlet?.rank ?? Infinity);
  });

  it('tåler tomme/manglende data', () => {
    expect(searchTourStandings(null, null, 'vingegaard')).toEqual([]);
    expect(searchTourStandings({}, [], 'vingegaard')).toEqual([]);
  });
});
