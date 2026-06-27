// Sikrer at hvert af de 23 hold har en kurateret profil, og at formen er gyldig.
import { describe, it, expect } from 'vitest';
import { TEAMS } from './tourTeams2026';
import { TEAM_PROFILES, teamProfile } from './teamProfiles2026';

describe('teamProfiles2026', () => {
  it('har en profil + mindst ét hovednavn for hvert hold (matchende holdkoder)', () => {
    for (const t of TEAMS) {
      const p = teamProfile(t.code);
      expect(p, `mangler profil for ${t.code} (${t.name})`).toBeTruthy();
      expect(typeof p.profile).toBe('string');
      expect(p.profile.length).toBeGreaterThan(0);
      expect(Array.isArray(p.stars)).toBe(true);
      expect(p.stars.length, `mangler hovednavne for ${t.code}`).toBeGreaterThan(0);
      for (const s of p.stars) expect(typeof s.name).toBe('string');
    }
  });

  it('indeholder ingen profiler for ukendte holdkoder', () => {
    const codes = new Set(TEAMS.map((t) => t.code));
    for (const code of Object.keys(TEAM_PROFILES)) {
      expect(codes.has(code), `ukendt holdkode i profiler: ${code}`).toBe(true);
    }
  });

  it('returnerer null for en ukendt kode', () => {
    expect(teamProfile('ZZZ')).toBeNull();
  });
});
