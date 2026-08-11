// ---------------------------------------------------------------------------
// SPEJLINGEN AF START-GATEN.
//
// `src/lib/startGate.js` og `functions-platform/startGate.js` skal give SAMME
// svar. Gør de ikke det, viser fladen andre kampe, end serveren giver point
// for — og ingen af de to ville fejle, de ville bare være uenige.
//
// Grenene her er valgt, så hver af dem kan drive fra hinanden alene: en runde
// spredt over en måned, en kamp uden rundenummer, et gammelt startAt midt i en
// runde, og et tidspunkt efter sidste runde.
// ---------------------------------------------------------------------------
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const server = require('./startGate');

const SPREDT_RUNDE = [
  { id: 'r2a', round: 2, kickoff: Date.parse('2026-08-01T16:00:00Z') },
  { id: 'r3a', round: 3, kickoff: Date.parse('2026-08-07T17:00:00Z') },
  { id: 'r3b', round: 3, kickoff: Date.parse('2026-08-10T15:00:00Z') },
  { id: 'r3e', round: 3, kickoff: Date.parse('2026-09-02T16:00:00Z') },
  { id: 'r4a', round: 4, kickoff: Date.parse('2026-08-14T17:00:00Z') },
  { id: 'uden', kickoff: Date.parse('2026-08-20T17:00:00Z') },
];

describe('spejling mod src/lib', () => {
  const tilfaelde = [
    ['spredt runde, startrunde midt i', { game: { startRound: 3 } }],
    ['spredt runde, hele runden ude', { game: { startRound: 4 } }],
    ['ingen gate', { game: {} }],
    ['gammelt startAt før første kamp', { game: { startAt: Date.parse('2026-07-01T00:00:00Z') } }],
    ['gammelt startAt midt i en spredt runde', { game: { startAt: Date.parse('2026-08-12T00:00:00Z') } }],
    ['gammelt startAt = Superligaens faktiske', { game: { startAt: Date.parse('2026-08-01T15:59:00Z') } }],
    ['gammelt startAt efter sidste runde', { game: { startAt: Date.parse('2027-01-01T00:00:00Z') } }],
    ['startRound vinder over startAt', { game: { startAt: 0, startRound: 4 } }],
    ['startRound 0', { game: { startRound: 0 } }],
  ];

  for (const [navn, { game }] of tilfaelde) {
    it(`server-spejlet matcher src-udgaven: ${navn}`, async () => {
      const src = await import('../src/lib/startGate.js');
      const s = server.startRundeFor(game, SPREDT_RUNDE);
      expect(s).toEqual(src.startRundeFor(game, SPREDT_RUNDE));
      expect([...server.gatedeKampe(SPREDT_RUNDE, s)].sort())
        .toEqual([...src.gatedeKampe(SPREDT_RUNDE, s)].sort());
      expect(server.fraStartRunde(SPREDT_RUNDE, s).map((m) => m.id))
        .toEqual(src.fraStartRunde(SPREDT_RUNDE, s).map((m) => m.id));
    });
  }

  it('server-spejlet matcher src-udgaven på kampe uden runde', async () => {
    const src = await import('../src/lib/startGate.js');
    for (const kamp of [{ round: null }, {}, { round: undefined }, { round: 1 }]) {
      expect(server.foerStart(kamp, 3)).toBe(src.foerStart(kamp, 3));
    }
  });
});
