import { describe, it, expect } from 'vitest';
import {
  formatKickoff, formatTime, relativeDeadline, formatDateRange, relativeTime,
} from './daDate';

const D = (iso) => new Date(iso);

describe('relativeTime', () => {
  const now = new Date('2026-08-09T18:00:00Z');
  it('viser dansk fortid', () => {
    expect(relativeTime(new Date('2026-08-09T17:59:40Z'), now)).toBe('nu');
    expect(relativeTime(new Date('2026-08-09T17:45:00Z'), now)).toBe('for 15 min siden');
    expect(relativeTime(new Date('2026-08-09T15:00:00Z'), now)).toBe('for 3 t siden');
    expect(relativeTime(new Date('2026-08-07T18:00:00Z'), now)).toBe('for 2 dage siden');
  });
  it('håndterer Firestore-timestamp og tom værdi', () => {
    expect(relativeTime({ seconds: Math.floor(now.getTime() / 1000) - 120 }, now)).toBe('for 2 min siden');
    expect(relativeTime(null, now)).toBe('');
  });
});

describe('formatKickoff', () => {
  it('formaterer dansk med punktum-tid', () => {
    const s = formatKickoff('2026-08-09T16:00:00Z'); // 18.00 dansk sommertid
    expect(s).toMatch(/·/);
    expect(s).toMatch(/aug/);
    expect(s).toMatch(/\d{2}\.\d{2}/); // 18.00
  });
  it('tom ved ugyldig', () => {
    expect(formatKickoff(null)).toBe('');
  });
});

describe('relativeDeadline', () => {
  const now = D('2026-08-09T12:00:00Z');
  it('minutter/timer/dage', () => {
    expect(relativeDeadline(D('2026-08-09T12:30:00Z'), now)).toBe('om 30 min');
    expect(relativeDeadline(D('2026-08-09T16:00:00Z'), now)).toBe('om 4 t');
    expect(relativeDeadline(D('2026-08-11T12:00:00Z'), now)).toBe('om 2 dage');
  });
  it('lukket når passeret', () => {
    expect(relativeDeadline(D('2026-08-09T11:00:00Z'), now)).toBe('lukket');
  });
});

describe('formatDateRange', () => {
  it('samme dag → én dato', () => {
    expect(formatDateRange('2026-08-09T14:00:00Z', '2026-08-09T18:00:00Z')).toMatch(/aug/);
    expect(formatDateRange('2026-08-09T14:00:00Z', '2026-08-09T18:00:00Z')).not.toMatch(/–/);
  });
  it('forskellige dage → spænd', () => {
    expect(formatDateRange('2026-08-08T14:00:00Z', '2026-08-10T18:00:00Z')).toMatch(/–/);
  });
  it('kun formatTime', () => {
    expect(formatTime('2026-08-09T16:00:00Z')).toMatch(/\d{2}\.\d{2}/);
  });
});
