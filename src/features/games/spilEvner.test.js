import { describe, it, expect } from 'vitest';
import { KICKOFF_PROVIDERE, RESULTAT_PROVIDERE, harKickoffSynk, harResultatSynk } from './spilEvner';
import { GAMES } from '../../../scripts/games.mjs';

describe('harKickoffSynk', () => {
  it('er sand for de kilder, der har en daglig kickoff-synk (pulselive, superliga)', () => {
    expect(harKickoffSynk({ sync: { provider: 'pulselive' } })).toBe(true);
    expect(harKickoffSynk({ sync: { provider: 'superliga' } })).toBe(true);
  });

  it('er falsk for et spil uden synk eller med en kilde uden kickoff-synk', () => {
    expect(harKickoffSynk({})).toBe(false);
    expect(harKickoffSynk({ sync: {} })).toBe(false);
    expect(harKickoffSynk({ sync: { provider: 'en-anden' } })).toBe(false);
    expect(harKickoffSynk(null)).toBe(false);
  });

  it('sættet indeholder præcis de to kendte kilder', () => {
    expect([...KICKOFF_PROVIDERE].sort()).toEqual(['pulselive', 'superliga']);
  });
});

describe('harResultatSynk', () => {
  it('er sand for de implementerede kilder (pulselive, superliga)', () => {
    expect(harResultatSynk({ sync: { provider: 'pulselive' } })).toBe(true);
    expect(harResultatSynk({ sync: { provider: 'superliga' } })).toBe(true);
  });

  // ALLOWLISTE-BEVISET: et spil kan seedes med en provider, serveren endnu
  // ikke har implementeret (games.mjs tillader det udtrykkeligt). En gate på
  // `!!sync.provider` ville vise en knap, hvis kald kun kan fejle med
  // invalid-argument. Muteres allowlisten til en sandheds-gate, bliver
  // 'endnu-ikke-bygget'-linjen rød.
  it('er falsk for et spil uden synk eller med en endnu ikke implementeret provider', () => {
    expect(harResultatSynk({})).toBe(false);
    expect(harResultatSynk({ sync: {} })).toBe(false);
    expect(harResultatSynk({ sync: { provider: 'endnu-ikke-bygget' } })).toBe(false);
    expect(harResultatSynk(null)).toBe(false);
  });

  it('sættet indeholder præcis de to implementerede kilder', () => {
    expect([...RESULTAT_PROVIDERE].sort()).toEqual(['pulselive', 'superliga']);
  });
});

// SPEJLINGS-TRIPWIRE mod den levende spilliste: serverens synk (og dermed
// knappernes berettigelse) afgøres af games.mjs' sync-felt. Får et spil en
// provider — eller mister et den — skal dette billede ændre sig, og testen
// tvinger allowlisterne til at blive taget stilling til i samme PR (spejler
// syncProviders.test.js' games.mjs⇄SYNCED_GAMES-tripwire på klientsiden).
describe('spejling mod scripts/games.mjs', () => {
  it('præcis Superligaen og PL har resultat-synk (og dermed ⬇️-knappen)', () => {
    const med = GAMES.filter((g) => harResultatSynk(g)).map((g) => g.id).sort();
    expect(med).toEqual(['pl2627-efteraar', 'superliga2627']);
  });

  it('præcis Superligaen og PL har kickoff-synk (og dermed 🗓️-knappen + Drift-kort)', () => {
    const med = GAMES.filter((g) => harKickoffSynk(g)).map((g) => g.id).sort();
    expect(med).toEqual(['pl2627-efteraar', 'superliga2627']);
  });
});
