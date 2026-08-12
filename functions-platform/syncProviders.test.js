// ---------------------------------------------------------------------------
// Tests for synk-provider-SNITTET: registret, den statiske spil-liste og
// dens paritet med scripts/games.mjs — samt flerspils-kørslen.
//
// Selve superliga-providerens parsing er dækket af superligaSync.test.js:
// kernerne kalder provideren som default, så alle 117 eksisterende tests
// løber igennem den. Her testes det, snittet TILFØJEDE.
// ---------------------------------------------------------------------------
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { GAMES } from '../scripts/games.mjs';

const require = createRequire(import.meta.url);
const { PROVIDERS, SYNCED_GAMES } = require('./syncProviders');
const { runScheduledSyncAll } = require('./superligaSync');

// Spejlfils-pariteten. games.mjs er kilden til, hvad der SEEDES på
// spil-dokumenterne (klienten læser provider-navnet derfra til kildelinjen);
// SYNCED_GAMES er, hvad serveren faktisk SYNKER. Driver de to fra hinanden,
// synker serveren mod en anden konfiguration, end skærmen påstår.
describe('SYNCED_GAMES ⇄ scripts/games.mjs', () => {
  it('hver synket konfiguration står ordret i games.mjs', () => {
    for (const g of SYNCED_GAMES) {
      const game = GAMES.find((x) => x.id === g.gameId);
      expect(game, `${g.gameId} findes ikke i games.mjs`).toBeTruthy();
      expect(game.sync?.provider, `${g.gameId}: provider`).toBe(g.provider);
      for (const [k, v] of Object.entries(g.sync)) {
        expect(game.sync[k], `${g.gameId}: sync.${k}`).toBe(v);
      }
    }
  });

  // TRIPWIREN for næste delopgave: i samme øjeblik en provider implementeres
  // i PROVIDERS (fx pulselive), KRÆVER denne test, at spillene med den
  // provider også kommer med i SYNCED_GAMES. En implementeret kilde, ingen
  // synker fra, er præcis den slags halve tilstand, der ellers opdages ved,
  // at point aldrig afregnes.
  it('hvert games.mjs-spil med en IMPLEMENTERET provider er med i synken', () => {
    const burde = GAMES
      .filter((x) => x.sync && PROVIDERS[x.sync.provider])
      .map((x) => x.id)
      .sort();
    expect(SYNCED_GAMES.map((g) => g.gameId).sort()).toEqual(burde);
  });

  it('hver post i SYNCED_GAMES peger på en provider, der findes', () => {
    for (const g of SYNCED_GAMES) {
      expect(PROVIDERS[g.provider], `${g.gameId}: "${g.provider}"`).toBeTruthy();
    }
  });
});

describe('provider-kontrakten (superliga)', () => {
  it('resolveDocs udelader nøgler uden dokument — kernen skal kunne springe dem over', () => {
    const map = PROVIDERS.superliga.resolveDocs(['r1-a-b', 'r1-x-y'], ['r1-a-b', 'r1-c-d']);
    expect([...map.entries()]).toEqual([['r1-a-b', 'r1-a-b']]);
  });
});

describe('runScheduledSyncAll', () => {
  // Mindste db, pendingMatches kan løbe tør på: range-forespørgslen svarer tomt.
  const tomDb = {
    collection: () => ({
      doc: () => ({
        collection: () => ({
          where: () => ({ where: () => ({ get: async () => ({ docs: [] }) }) }),
        }),
      }),
    }),
  };

  it('kører hvert spil i listen og mærker resultatet med gameId', async () => {
    const ud = await runScheduledSyncAll(tomDb, {}, Date.now());
    expect(ud.map((o) => o.gameId)).toEqual(SYNCED_GAMES.map((g) => g.gameId));
    for (const o of ud) {
      expect(o.pending).toBe(0);
      expect(o.fejl).toBeNull();
    }
  });

  it('en ukendt provider springes over — og vælter ikke de andre spil', async () => {
    const ud = await runScheduledSyncAll(tomDb, {}, Date.now(), {
      games: [
        { gameId: 'fremmed', provider: 'findes-ikke', sync: {} },
        { gameId: 'superliga2627', provider: 'superliga', sync: {} },
      ],
    });
    expect(ud.map((o) => o.gameId)).toEqual(['superliga2627']);
  });
});
