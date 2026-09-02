// Vagten i scan-scriptet skal sige det samme som reglen: id-felt eller
// ikke-streng navn = frosset. Ren funktion, ingen Firebase.
import { describe, it, expect } from 'vitest';
import { ligaFejl } from './lib/ligaFelter.mjs';

describe('ligaFejl — samme dom som firestore.rules', () => {
  it('rent dokument → ingen fejl', () => {
    expect(ligaFejl({ name: 'Kontoret', ownerUid: 'a' })).toEqual([]);
    expect(ligaFejl({ name: '' })).toEqual([]);   // tom streng er en streng — reglen tager imod
  });
  it('id-felt, manglende navn og map-navn er hver sin fejl', () => {
    expect(ligaFejl({ name: 'x', id: 'TB' })).toEqual(['id-felt ("TB")']);
    expect(ligaFejl({})).toEqual(['name er fraværende']);
    expect(ligaFejl({ name: { a: 1 } })).toEqual(['name er object']);
    expect(ligaFejl({ name: null })).toEqual(['name er object']);
    expect(ligaFejl({ name: 7, id: 'q' })).toHaveLength(2);
  });
});
