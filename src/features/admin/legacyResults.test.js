import { describe, it, expect, vi } from 'vitest';

vi.mock('../../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({ collection: vi.fn(), getDocs: vi.fn() }));

import { formatTop5Block, applyLegacyResult } from './legacyResults';

const result = {
  name: 'Familie-ligaen',
  top: [
    { rank: 1, name: 'Anna', points: 120 },
    { rank: 2, name: 'Bo', points: 101.5 },
    { rank: 2, name: 'Carla', points: 101.5 },
    { rank: 4, name: 'Dorte', points: 88 },
    { rank: 5, name: 'Erik', points: 70 },
  ],
};

describe('formatTop5Block', () => {
  it('formaterer med medaljer efter RANG (delte pladser = samme medalje) og dansk decimal', () => {
    const block = formatTop5Block(result);
    expect(block).toBe(
      'Sådan endte Familie-ligaen:\n\n'
      + '🥇 Anna – 120 point\n'
      + '🥈 Bo – 101,5 point\n'
      + '🥈 Carla – 101,5 point\n'
      + '4. Dorte – 88 point\n'
      + '5. Erik – 70 point',
    );
  });
});

describe('applyLegacyResult', () => {
  it('erstatter [TOP5], [VINDER] og [LIGANAVN GAMMEL] i emne + besked', () => {
    const { subject, body } = applyLegacyResult({
      subject: 'Bibamus: [VINDER] har titlen fra [LIGANAVN GAMMEL]',
      body: 'Tilbageblik:\n[TOP5]\nKan nogen slå [VINDER]?',
      result,
    });
    expect(subject).toBe('Bibamus: Anna har titlen fra Familie-ligaen');
    expect(body).toContain('🥇 Anna – 120 point');
    expect(body).toContain('Kan nogen slå Anna?');
    expect(body).not.toContain('[TOP5]');
  });

  it('uden [TOP5]-token tilføjes blokken til sidst', () => {
    const { body } = applyLegacyResult({ subject: '', body: 'Hej med dig.', result });
    expect(body.startsWith('Hej med dig.\n\nSådan endte Familie-ligaen:')).toBe(true);
  });
});
