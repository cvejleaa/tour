import { describe, it, expect } from 'vitest';
import { groupLabel, formatGap, ridersForBibs, groupSummary } from './liveMapUtils';

describe('groupLabel', () => {
  it('oversætter racecenterets gruppenavne til dansk', () => {
    expect(groupLabel('Front of the Race')).toBe('Udbrud');
    expect(groupLabel('Tête de la course')).toBe('Udbrud');
    expect(groupLabel('Peloton')).toBe('Hovedfeltet');
    expect(groupLabel('Chasing group')).toBe('Forfølgere');
  });
  it('ukendte navne beholdes råt', () => {
    expect(groupLabel('Group 3')).toBe('Group 3');
    expect(groupLabel('')).toBe('Gruppe');
  });
});

describe('formatGap', () => {
  it('formaterer sekunder som +m.ss (og timer ved behov)', () => {
    expect(formatGap(221)).toBe('+3.41');
    expect(formatGap(59)).toBe('+0.59');
    expect(formatGap(3723)).toBe('+1.02.03');
  });
  it('0/ugyldig → tom streng', () => {
    expect(formatGap(0)).toBe('');
    expect(formatGap(null)).toBe('');
  });
});

describe('ridersForBibs', () => {
  it('slår navne op via startnummer og markerer danskere', () => {
    // Bib 11 = Jonas Vingegaard (Visma) i letours 2026-rytterfil.
    const [r] = ridersForBibs([11]);
    expect(r.name).toMatch(/vingegaard/i);
    expect(r.danish).toBe(true);
  });
  it('ukendt bib → "#<bib>" i stedet for at mangle', () => {
    expect(ridersForBibs([999])[0]).toEqual({ bib: 999, name: '#999', danish: false });
  });
});

describe('groupSummary', () => {
  it('samler etiket, størrelse, gab og fart', () => {
    expect(groupSummary({ name: 'Front of the Race', size: 3, gapSec: 0, speed: 49 }))
      .toBe('Udbrud (3) · 49 km/t');
    expect(groupSummary({ name: 'Peloton', size: 0, gapSec: 221, speed: 50 }))
      .toBe('Hovedfeltet · +3.41 · 50 km/t');
  });
});
