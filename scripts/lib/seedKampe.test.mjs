import { describe, it, expect } from 'vitest';
import { seedKampe } from './seedKampe.mjs';
import { buildMatches } from '../../src/lib/superligaSeed.js';
import { SPORT_PROFILER } from '../../src/lib/superligaScoring.js';
import { PROEVE, medProeveSport } from '../../src/test/proeveSport.js';

// seed-football.mjs prissætter nye kampe med SPILLETS sportsprofil, læst af
// spil-dokumentet — samme felt, serveren omprisser med. Scriptet selv har
// ingen tests (det kræver en rigtig database), så beslutningen bor her.
const ref = (data) => ({ get: async () => ({ exists: data !== null, data: () => data }) });

const TEAMS = [{ name: 'Stærk', elo: 1900 }, { name: 'Svag', elo: 1300 }];
const FX = [
  { round: 1, home: 'Stærk', away: 'Svag' },
  { round: 1, home: 'Ukendt', away: 'Svag' },
  { round: 1, home: 'Svag', away: 'Ukendt' }, // ukendt UDEhold slås op for sig
];

describe('seedKampe', () => {
  it('et spil uden sport — og et spil, der ikke findes endnu — seedes som fodbold', async () => {
    for (const data of [null, {}, { teams: TEAMS }, { sport: 'fodbold' }]) {
      const { profil, matches } = await seedKampe({ gameRef: ref(data), fixtures: FX, teams: TEAMS });
      expect(profil, JSON.stringify(data)).toBe(SPORT_PROFILER.fodbold);
      expect(matches).toEqual(buildMatches(FX, TEAMS));
    }
  });

  describe('med en prøvesport på spillet', () => {
    medProeveSport();

    it('læser sporten AF SPIL-DOKUMENTET og prissætter med den', async () => {
      const { profil, matches } = await seedKampe({
        gameRef: ref({ sport: 'proeve' }), fixtures: FX, teams: TEAMS,
      });
      expect(profil).toBe(PROEVE);
      // Prøvesportens odds (neutral bane, få uafgjorte, gulv 1,01) — fodbold
      // giver 1,15 / 9,21 / 51,23 for samme kamp.
      expect(matches[0].odds).toEqual({ 1: 1.07, X: 29.11, 2: 33.78 });
      // … og et ukendt hold får sportens neutrale rating, ikke fodboldens.
      expect(matches[1].eloHome).toBe(1000);
      expect(matches[2].eloAway).toBe(1000);
      expect(matches).toEqual(buildMatches(FX, TEAMS, PROEVE));
    });
  });
});
