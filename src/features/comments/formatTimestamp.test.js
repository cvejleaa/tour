import { describe, it, expect } from 'vitest';
import { formatTimestamp } from './formatTimestamp';

describe('formatTimestamp', () => {
  it('returnerer tom streng for null', () => {
    expect(formatTimestamp(null)).toBe('');
  });

  it('viser kun klokkeslæt for samme dag', () => {
    const now = new Date('2026-06-04T15:00:00+02:00');
    const ts = { toDate: () => new Date('2026-06-04T14:32:00+02:00') };
    const out = formatTimestamp(ts, now);
    expect(out).toMatch(/14[.:]32/);
    expect(out).not.toMatch(/jun/);
  });

  it('viser dato + tid for en anden dag', () => {
    const now = new Date('2026-06-04T15:00:00+02:00');
    const ts = { toDate: () => new Date('2026-06-02T09:05:00+02:00') };
    const out = formatTimestamp(ts, now);
    expect(out).toMatch(/jun/);
  });

  it('accepterer rå Date', () => {
    const now = new Date('2026-06-04T15:00:00+02:00');
    const out = formatTimestamp(new Date('2026-06-04T10:00:00+02:00'), now);
    expect(out).toMatch(/10[.:]00/);
  });
});
