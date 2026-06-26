import { describe, it, expect } from 'vitest';
import { sortBonusQuestions, isBonusLocked, formatDeadline } from './bonusHelpers';

// ---------------------------------------------------------------------------
// sortBonusQuestions
// ---------------------------------------------------------------------------
describe('sortBonusQuestions', () => {
  it('placerer topscorer øverst og gruppevindere i A→L-rækkefølge', () => {
    const input = [
      { id: 'gw_C', type: 'groupWinner', groupName: 'C' },
      { id: 'gw_A', type: 'groupWinner', groupName: 'A' },
      { id: 'top', type: 'topScorer', groupName: null },
      { id: 'gw_B', type: 'groupWinner', groupName: 'B' },
    ];
    const out = sortBonusQuestions(input).map((q) => q.id);
    expect(out).toEqual(['top', 'gw_A', 'gw_B', 'gw_C']);
  });

  it('muterer ikke input-arrayet', () => {
    const input = [
      { id: 'gw_B', type: 'groupWinner', groupName: 'B' },
      { id: 'top', type: 'topScorer' },
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

  it('topscorer alene returneres korrekt', () => {
    const input = [{ id: 'top', type: 'topScorer' }];
    const out = sortBonusQuestions(input);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('top');
  });

  it('kun gruppevindere sorteres A→L uden topscorer', () => {
    const input = [
      { id: 'gw_D', type: 'groupWinner', groupName: 'D' },
      { id: 'gw_B', type: 'groupWinner', groupName: 'B' },
      { id: 'gw_A', type: 'groupWinner', groupName: 'A' },
      { id: 'gw_C', type: 'groupWinner', groupName: 'C' },
    ];
    const out = sortBonusQuestions(input).map((q) => q.id);
    expect(out).toEqual(['gw_A', 'gw_B', 'gw_C', 'gw_D']);
  });

  it('sorterer grupper L, K, J korrekt (omvendt orden giver rigtig rækkefølge)', () => {
    const input = [
      { id: 'gw_L', type: 'groupWinner', groupName: 'L' },
      { id: 'gw_J', type: 'groupWinner', groupName: 'J' },
      { id: 'gw_K', type: 'groupWinner', groupName: 'K' },
    ];
    const out = sortBonusQuestions(input).map((q) => q.id);
    expect(out).toEqual(['gw_J', 'gw_K', 'gw_L']);
  });

  it('to topscorer-spørgsmål placeres begge øverst', () => {
    const input = [
      { id: 'gw_A', type: 'groupWinner', groupName: 'A' },
      { id: 'top2', type: 'topScorer' },
      { id: 'top1', type: 'topScorer' },
    ];
    const out = sortBonusQuestions(input);
    // begge top-spørgsmål skal komme før gw_A
    const gwAIdx = out.findIndex((q) => q.id === 'gw_A');
    expect(out.slice(0, gwAIdx).every((q) => q.type === 'topScorer')).toBe(true);
  });

  it('gruppevinder uden groupName sorteres stabilt', () => {
    const input = [
      { id: 'gw_nul', type: 'groupWinner', groupName: null },
      { id: 'gw_A', type: 'groupWinner', groupName: 'A' },
    ];
    const out = sortBonusQuestions(input);
    expect(out).toHaveLength(2);
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
