import { describe, it, expect, vi } from 'vitest';

// useUntippedPenalty.js importerer firebase-moduler på topniveau; vi mocker dem,
// så vi kan enhedsteste den rene readUntippedPenalty-hjælper.
vi.mock('../../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), onSnapshot: vi.fn() }));

import { readUntippedPenalty, DEFAULT_UNTIPPED_PENALTY } from './useUntippedPenalty';

describe('readUntippedPenalty', () => {
  it('læser det autoritative nested points.untippedPenalty', () => {
    expect(readUntippedPenalty({ points: { untippedPenalty: 3 }, untippedPenalty: 9 })).toBe(3);
  });
  it('falder tilbage til gammelt top-niveau-felt', () => {
    expect(readUntippedPenalty({ untippedPenalty: 2 })).toBe(2);
  });
  it('bruger standard når intet er sat', () => {
    expect(readUntippedPenalty(null)).toBe(DEFAULT_UNTIPPED_PENALTY);
    expect(readUntippedPenalty({})).toBe(DEFAULT_UNTIPPED_PENALTY);
  });
  it('tvinger værdien til positiv', () => {
    expect(readUntippedPenalty({ points: { untippedPenalty: -4 } })).toBe(4);
  });
  it('standarden matcher scoringens (1)', () => {
    expect(DEFAULT_UNTIPPED_PENALTY).toBe(1);
  });
});
