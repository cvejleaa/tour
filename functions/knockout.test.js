// Rene tests for knockout-bracket-logikken (ingen emulator).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pkg from './knockout.js';

const { R32_SPEC, computeR32Assignments, buildR32FromGroupMatches, EXPECTED_GROUPS } = pkg;

const __dirname = dirname(fileURLToPath(import.meta.url));

// Byg syntetiske grupperangering: hver gruppe har 4 hold "<G>1".."<G>4"
function fakeStandings() {
  const gs = {};
  for (const g of EXPECTED_GROUPS) {
    gs[g] = [1, 2, 3, 4].map((n) => ({ team: `${g}${n}` }));
  }
  return gs;
}
// Alle 12 3'ere kvalificerer (så getThird altid finder et hold)
function fakeThirds() {
  return EXPECTED_GROUPS.map((g) => ({ team: `${g}3`, groupName: g }));
}

describe('R32_SPEC', () => {
  it('definerer præcis 16 kampe med id ko_r32_1..16', () => {
    expect(R32_SPEC).toHaveLength(16);
    const ids = R32_SPEC.map((s) => s.id).sort();
    const expected = Array.from({ length: 16 }, (_, i) => `ko_r32_${i + 1}`).sort();
    expect(ids).toEqual(expected);
  });

  it('matcher de faktiske r32-id\'er i data/group-stage.json', () => {
    const data = JSON.parse(readFileSync(join(__dirname, '../data/group-stage.json'), 'utf8'));
    const dataR32 = data.matches.filter((m) => m.round === 'r32').map((m) => m.id).sort();
    const specIds = R32_SPEC.map((s) => s.id).sort();
    expect(specIds).toEqual(dataR32);
  });
});

describe('computeR32Assignments', () => {
  it('placerer gruppevindere og 2\'ere korrekt', () => {
    const a = computeR32Assignments(fakeStandings(), fakeThirds());
    const m1 = a.find((x) => x.id === 'ko_r32_1');
    expect(m1).toEqual({ id: 'ko_r32_1', home: 'A1', away: 'B2' }); // 1A vs 2B
    const m4 = a.find((x) => x.id === 'ko_r32_4');
    expect(m4).toEqual({ id: 'ko_r32_4', home: 'D1', away: 'C2' }); // 1D vs 2C
  });

  it('udfylder alle 16 kampe med hold når alle 3\'ere kvalificerer', () => {
    const a = computeR32Assignments(fakeStandings(), fakeThirds());
    expect(a).toHaveLength(16);
    for (const m of a) {
      expect(m.home).toBeTruthy();
      expect(m.away).toBeTruthy();
    }
  });

  it('vælger 3\'er fra en af de tilladte grupper', () => {
    const a = computeR32Assignments(fakeStandings(), fakeThirds());
    const m2 = a.find((x) => x.id === 'ko_r32_2'); // 1C vs 3 fra D/E/F
    expect(m2.home).toBe('C1');
    expect(['D3', 'E3', 'F3']).toContain(m2.away);
  });
});

describe('buildR32FromGroupMatches', () => {
  // Lav 6 kampe pr. gruppe (round-robin med 4 hold) hvor hold 1 vinder mest osv.
  function groupMatches(g) {
    const t = [`${g}1`, `${g}2`, `${g}3`, `${g}4`];
    const pairs = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
    return pairs.map(([h, aw], i) => ({
      groupName: g,
      homeTeam: t[h],
      awayTeam: t[aw],
      // lavere index vinder → giver klar rangering 1>2>3>4
      result: { home: h < aw ? 3 : 0, away: h < aw ? 0 : 3 },
      round: 'group',
      status: 'finished',
      id: `grp_${g}_${i + 1}`,
    }));
  }

  it('rapporterer manglende grupper når der ikke er nok kampe', () => {
    const only = groupMatches('A'); // kun gruppe A
    const { missingGroups } = buildR32FromGroupMatches(only);
    expect(missingGroups).toContain('B');
    expect(missingGroups).not.toContain('A');
  });

  it('bygger 16 r32-kampe uden manglende grupper når alle 12 er spillet', () => {
    const all = EXPECTED_GROUPS.flatMap(groupMatches);
    const { assignments, missingGroups } = buildR32FromGroupMatches(all);
    expect(missingGroups).toHaveLength(0);
    expect(assignments).toHaveLength(16);
    // gruppevinderen i A er A1 → ko_r32_1 home
    expect(assignments.find((x) => x.id === 'ko_r32_1').home).toBe('A1');
  });
});
