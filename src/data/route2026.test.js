// Tests for den officielle 2026-rute (placeholderRoute2026 beholder navnet).
import { describe, it, expect } from 'vitest';
import { placeholderRoute2026 } from './route2026';
import { stageId } from '../lib/tourStages';

describe('placeholderRoute2026', () => {
  const route = placeholderRoute2026(2026);

  it('har 21 etaper', () => {
    expect(route).toHaveLength(21);
  });

  it('hver etape har de nye felter med rigtige data', () => {
    for (const s of route) {
      expect(s).toHaveProperty('typeCode');
      expect(s).toHaveProperty('km');
      expect(s).toHaveProperty('startCity');
      expect(s).toHaveProperty('finishCity');
      expect(s).toHaveProperty('image');
      expect(s).toHaveProperty('description');
      expect(typeof s.km).toBe('number');
      expect(s.image).toContain('http');
    }
  });

  it('etape 1 er holdtidskørsel i Barcelona', () => {
    const s1 = route[0];
    expect(s1.id).toBe(stageId(1, 2026));
    expect(s1.number).toBe(1);
    expect(s1.type).toBe('ttt');
    expect(s1.typeCode).toBe('EQU');
    expect(s1.startCity).toBe('Barcelone');
    expect(s1.finishCity).toBe('Barcelone');
    expect(s1.km).toBe(19.6);
    // Lås-tidspunktet er etapens reelle start (17:05), ikke standard kl. 12.
    expect(s1.startTime).toBe('17:05');
    expect(s1.kickoff).toBe('2026-07-04T17:05:00+02:00');
  });

  it('sidste etape slutter på Champs-Élysées', () => {
    expect(route[20].finishCity).toBe('Paris Champs-Élysées');
  });

  it('respekterer season i id', () => {
    expect(placeholderRoute2026(2027)[0].id).toBe(stageId(1, 2027));
    expect(placeholderRoute2026(2027)[0].season).toBe(2027);
  });
});
