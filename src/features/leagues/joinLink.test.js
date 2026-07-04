import { describe, it, expect, beforeEach } from 'vitest';
import {
  joinLinkFor, setPendingJoinCode, getPendingJoinCode, clearPendingJoinCode,
} from './joinLink';

describe('joinLinkFor', () => {
  it('bygger /tilmeld-linket med normaliseret (versaliseret) kode', () => {
    expect(joinLinkFor(' x4kr2m ', 'https://tour.vejleaa.dk'))
      .toBe('https://tour.vejleaa.dk/tilmeld?kode=X4KR2M');
  });
  it('URL-enkoder specialtegn i koden', () => {
    expect(joinLinkFor('A&B', 'https://t.dk')).toBe('https://t.dk/tilmeld?kode=A%26B');
  });
});

describe('pendingJoinCode (localStorage)', () => {
  beforeEach(() => clearPendingJoinCode());

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
});
