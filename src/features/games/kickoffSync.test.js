import { describe, it, expect } from 'vitest';
import { KICKOFF_PROVIDERE, harKickoffSynk } from './kickoffSync';

describe('harKickoffSynk', () => {
  it('er sand for de kilder, der har en daglig kickoff-synk (pulselive, superliga)', () => {
    expect(harKickoffSynk({ sync: { provider: 'pulselive' } })).toBe(true);
    expect(harKickoffSynk({ sync: { provider: 'superliga' } })).toBe(true);
  });

  it('er falsk for et spil uden synk eller med en kilde uden kickoff-synk', () => {
    expect(harKickoffSynk({})).toBe(false);
    expect(harKickoffSynk({ sync: {} })).toBe(false);
    expect(harKickoffSynk({ sync: { provider: 'en-anden' } })).toBe(false);
    expect(harKickoffSynk(null)).toBe(false);
  });

  it('sættet indeholder præcis de to kendte kilder', () => {
    expect([...KICKOFF_PROVIDERE].sort()).toEqual(['pulselive', 'superliga']);
  });
});
