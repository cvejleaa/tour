import { describe, it, expect } from 'vitest';
import { sortBonusQuestions, isBonusLocked, formatDeadline } from './bonusHelpers';

// ---------------------------------------------------------------------------
// sortBonusQuestions
// ---------------------------------------------------------------------------
describe('sortBonusQuestions', () => {
  it('sorterer efter deadline (tidligst først)', () => {
    const input = [
      { id: 'c', deadline: new Date('2026-07-10T10:00:00Z') },
      { id: 'a', deadline: new Date('2026-07-01T10:00:00Z') },
      { id: 'b', deadline: new Date('2026-07-05T10:00:00Z') },
    ];
    const out = sortBonusQuestions(input).map((q) => q.id);
    expect(out).toEqual(['a', 'b', 'c']);
  });

  it('placerer spørgsmål uden deadline til sidst', () => {
    const input = [
      { id: 'ingen', deadline: null },
      { id: 'med', deadline: new Date('2026-07-01T10:00:00Z') },
    ];
    const out = sortBonusQuestions(input).map((q) => q.id);
    expect(out).toEqual(['med', 'ingen']);
  });

  it('sorterer efter tekst når deadlines er ens', () => {
    const dl = new Date('2026-07-01T10:00:00Z');
    const input = [
      { id: '2', text: 'B-spørgsmål', deadline: dl },
      { id: '1', text: 'A-spørgsmål', deadline: dl },
    ];
    const out = sortBonusQuestions(input).map((q) => q.id);
    expect(out).toEqual(['1', '2']);
  });

  it('håndterer Firestore-timestamp (toDate)', () => {
    const input = [
      { id: 'b', deadline: { toDate: () => new Date('2026-07-05T10:00:00Z') } },
      { id: 'a', deadline: { toDate: () => new Date('2026-07-01T10:00:00Z') } },
    ];
    const out = sortBonusQuestions(input).map((q) => q.id);
    expect(out).toEqual(['a', 'b']);
  });

  it('muterer ikke input-arrayet', () => {
    const input = [
      { id: 'b', deadline: new Date('2026-07-05T10:00:00Z') },
      { id: 'a', deadline: new Date('2026-07-01T10:00:00Z') },
    ];
    const copy = [...input];
    sortBonusQuestions(input);
    expect(input).toEqual(copy);
  });

  it('håndterer tomt array', () => {
    expect(sortBonusQuestions([])).toEqual([]);
  });

  it('håndterer undefined input', () => {
    expect(sortBonusQuestions(undefined)).toEqual([]);
  });

  it('håndterer null input', () => {
    expect(sortBonusQuestions(null)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// isBonusLocked
// ---------------------------------------------------------------------------
describe('isBonusLocked', () => {
  const now = new Date('2026-06-11T12:00:00Z');

  it('er låst når deadline er passeret', () => {
    expect(isBonusLocked(new Date('2026-06-11T11:00:00Z'), now)).toBe(true);
  });

  it('er åben før deadline', () => {
    expect(isBonusLocked(new Date('2026-06-11T13:00:00Z'), now)).toBe(false);
  });

  it('er låst præcis ved deadline', () => {
    expect(isBonusLocked(now, now)).toBe(true);
  });

  it('håndterer Firestore-timestamp (toDate)', () => {
    const ts = { toDate: () => new Date('2026-06-11T10:00:00Z') };
    expect(isBonusLocked(ts, now)).toBe(true);
  });

  it('returnerer false for null deadline', () => {
    expect(isBonusLocked(null)).toBe(false);
  });

  it('returnerer false for undefined deadline', () => {
    expect(isBonusLocked(undefined)).toBe(false);
  });

  it('1 ms før deadline er IKKE låst', () => {
    const deadline = new Date('2026-06-11T12:00:00.000Z');
    const justBefore = new Date('2026-06-11T11:59:59.999Z');
    expect(isBonusLocked(deadline, justBefore)).toBe(false);
  });

  it('1 ms efter deadline ER låst', () => {
    const deadline = new Date('2026-06-11T12:00:00.000Z');
    const justAfter = new Date('2026-06-11T12:00:00.001Z');
    expect(isBonusLocked(deadline, justAfter)).toBe(true);
  });

  it('håndterer deadline som millisekunder', () => {
    const deadlineMs = new Date('2026-06-11T12:00:00Z').getTime();
    const before = new Date('2026-06-11T11:00:00Z');
    const after = new Date('2026-06-11T13:00:00Z');
    expect(isBonusLocked(deadlineMs, before)).toBe(false);
    expect(isBonusLocked(deadlineMs, after)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// formatDeadline
// ---------------------------------------------------------------------------
describe('formatDeadline', () => {
  it('returnerer "Ukendt" for null', () => {
    expect(formatDeadline(null)).toBe('Ukendt');
  });

  it('returnerer "Ukendt" for undefined', () => {
    expect(formatDeadline(undefined)).toBe('Ukendt');
  });

  it('returnerer en non-tom streng for en dato', () => {
    const result = formatDeadline(new Date('2026-06-11T18:00:00Z'));
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('indeholder tidspunkt i den returnerede streng', () => {
    // 18:00 UTC = 20.00 CEST i København (dansk locale bruger "." som separator)
    const result = formatDeadline(new Date('2026-06-11T18:00:00Z'));
    // dansk locale bruger "." som tidseparator og tilføjer "kl."
    expect(result).toMatch(/\d{2}[:.]\d{2}/);
  });

  it('håndterer Firestore Timestamp (toDate)', () => {
    const ts = { toDate: () => new Date('2026-06-11T18:00:00Z') };
    const result = formatDeadline(ts);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});
