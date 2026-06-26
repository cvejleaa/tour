// Konsistens-tests for kampdata (data/group-stage.json).
// Fanger bl.a. den fejlklasse, hvor knockout-id'er skifter og kommer ud af
// trit med Cloud Functions (buildKnockout) — hvilket tidligere efterlod
// forældede dokumenter i databasen og gav forkerte kamp-tællere.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(
  readFileSync(join(__dirname, '../../data/group-stage.json'), 'utf8'),
);
const matches = data.matches.filter((m) => m.id);

// De knockout-id'er som functions/buildKnockout udfylder (r32) skal findes.
const EXPECTED_R32 = Array.from({ length: 16 }, (_, i) => `ko_r32_${i + 1}`);

describe('group-stage.json — dataintegritet', () => {
  it('har 104 kampe i alt', () => {
    expect(matches.length).toBe(104);
  });

  it('har unikke id\'er', () => {
    const ids = matches.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gruppekampe bruger grp_-præfiks, knockout bruger ko_-præfiks', () => {
    for (const m of matches) {
      if (m.round === 'group') expect(m.id.startsWith('grp_')).toBe(true);
      else expect(m.id.startsWith('ko_')).toBe(true);
    }
  });

  it('indeholder præcis de 16 r32-kampe som buildKnockout forventer', () => {
    const r32 = matches.filter((m) => m.round === 'r32').map((m) => m.id).sort();
    expect(r32).toEqual([...EXPECTED_R32].sort());
  });

  it('har 72 gruppekampe og 32 knockout-kampe', () => {
    const group = matches.filter((m) => m.round === 'group').length;
    const ko = matches.filter((m) => m.round !== 'group').length;
    expect(group).toBe(72);
    expect(ko).toBe(32);
  });
});
