import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  joinLinkFor, gameJoinLinkFor, setPendingJoinCode, getPendingJoinCode,
  getPendingJoinGameId, clearPendingJoinCode, CANONICAL_ORIGIN, PLATFORM_ORIGIN,
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
    expect(getPendingJoinGameId()).toBe(''); // gammelt format har intet spil-id
  });
});

describe('gameJoinLinkFor (platform-spil-ligaer)', () => {
  it('bygger /tilmeld-linket med spil-id + normaliseret kode på tip.vejleaa.dk', () => {
    expect(gameJoinLinkFor('spil-1', ' x4kr2m '))
      .toBe('https://tip.vejleaa.dk/tilmeld?spil=spil-1&kode=X4KR2M');
    expect(PLATFORM_ORIGIN).toBe('https://tip.vejleaa.dk');
  });
  it('URL-enkoder spil-id og kode', () => {
    expect(gameJoinLinkFor('a b', 'A&B', 'https://t.dk')).toBe('https://t.dk/tilmeld?spil=a%20b&kode=A%26B');
  });
});

describe('pendingJoinGameId (localStorage)', () => {
  beforeEach(() => clearPendingJoinCode());

  it('gemmer og henter både kode og spil-id', () => {
    setPendingJoinCode('abc123', 'spil-7');
    expect(getPendingJoinCode()).toBe('ABC123');
    expect(getPendingJoinGameId()).toBe('spil-7');
  });

  it('uden spil-id er gameId tomt', () => {
    setPendingJoinCode('abc123');
    expect(getPendingJoinCode()).toBe('ABC123');
    expect(getPendingJoinGameId()).toBe('');
  });
});
