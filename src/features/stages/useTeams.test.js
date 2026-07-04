// mergeTeamNames — de syncede resultat-navne (ALL-CAPS/varianter) skal blive
// til seed-listens officielle navne i dropdowns, så <select>-værdier matcher
// de gemte tips præcist.
import { describe, it, expect } from 'vitest';
import { mergeTeamNames } from './useTeams';
import { TOUR_TEAMS } from '../../data/tourTeams2026';

describe('mergeTeamNames', () => {
  it('oversætter resultattabellens ALL-CAPS-navne til seed-navne', () => {
    const out = mergeTeamNames(['TEAM VISMA | LEASE A BIKE', 'COFIDIS']);
    for (const name of out) {
      expect(TOUR_TEAMS).toContain(name);
    }
    expect(out).toHaveLength(2);
  });

  it('alias-varianter (Ineos) rammer det officielle navn og dedupleres', () => {
    const out = mergeTeamNames([
      'INEOS GRENADIERS',
      'NETCOMPANY INEOS CYCLING TEAM',
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].toLowerCase()).toContain('netcompany');
    expect(TOUR_TEAMS).toContain(out[0]);
  });

  it('ukendte hold beholdes råt (nyt/omdøbt hold kan stadig tippes)', () => {
    const out = mergeTeamNames(['HELT NYT HOLD 2027']);
    expect(out).toContain('HELT NYT HOLD 2027');
  });

  it('tom synced liste → seed-listen uændret', () => {
    expect(mergeTeamNames([])).toEqual(TOUR_TEAMS);
    expect(mergeTeamNames(null)).toEqual(TOUR_TEAMS);
  });

  it('resultatet er sorteret dansk', () => {
    const out = mergeTeamNames(['MOVISTAR TEAM', 'COFIDIS']);
    expect(out).toEqual([...out].sort((a, b) => a.localeCompare(b, 'da')));
  });
});
