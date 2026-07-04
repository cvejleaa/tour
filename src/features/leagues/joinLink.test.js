import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  joinLinkFor, setPendingJoinCode, getPendingJoinCode, clearPendingJoinCode,
  CANONICAL_ORIGIN,
} from './joinLink';

describe('joinLinkFor', () => {
  it('bygger /tilmeld-linket med normaliseret (versaliseret) kode', () => {
    expect(joinLinkFor(' x4kr2m ', 'https://tour.vejleaa.dk'))
      .toBe('https://tour.vejleaa.dk/tilmeld?kode=X4KR2M');
  });
  it('URL-enkoder specialtegn i koden', () => {
    expect(joinLinkFor('A&B', 'https://t.dk')).toBe('https://t.dk/tilmeld?kode=A%26B');
  });
  it('bruger den KANONISKE adresse som standard (matcher serverens validering)', () => {
    expect(joinLinkFor('ABC123')).toBe(`${CANONICAL_ORIGIN}/tilmeld?kode=ABC123`);
    expect(CANONICAL_ORIGIN).toBe('https://tour.vejleaa.dk');
  });
});

describe('pendingJoinCode (localStorage)', () => {
  beforeEach(() => clearPendingJoinCode());
  afterEach(() => vi.useRealTimers());

  it('gemmer, henter og rydder koden (versaliseret)', () => {
    setPendingJoinCode(' abc123 ');
    expect(getPendingJoinCode()).toBe('ABC123');
    clearPendingJoinCode();
    expect(getPendingJoinCode()).toBe('');
  });

  it('gemmer ikke en tom kode', () => {
    setPendingJoinCode('   ');
    expect(getPendingJoinCode()).toBe('');
  });

  it('koden udløber efter 7 dage', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-04T12:00:00Z'));
    setPendingJoinCode('OLD123');
    vi.setSystemTime(new Date('2026-07-10T12:00:00Z')); // 6 dage → stadig gyldig
    expect(getPendingJoinCode()).toBe('OLD123');
    vi.setSystemTime(new Date('2026-07-12T12:00:01Z')); // >7 dage → udløbet + ryddet
    expect(getPendingJoinCode()).toBe('');
    expect(localStorage.getItem('tour.pendingJoinCode')).toBeNull();
  });

  it('læser det GAMLE format (ren streng) uden fejl', () => {
    localStorage.setItem('tour.pendingJoinCode', 'LEGACY');
    expect(getPendingJoinCode()).toBe('LEGACY');
  });
});
