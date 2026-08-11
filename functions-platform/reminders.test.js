// ---------------------------------------------------------------------------
// reminders.test.js — hvilke kampe der overhovedet må rykkes for.
// ---------------------------------------------------------------------------
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { upcomingMatches } = require('./reminders.js');

/** Firestore-agtigt Timestamp. */
const ts = (ms) => ({ toDate: () => new Date(ms), toMillis: () => ms });

const NOW = Date.UTC(2026, 6, 27, 12, 0, 0);
const H = 3600 * 1000;
const now = new Date(NOW);
const windowEnd = new Date(NOW + 24 * H);

const { gatedeKampe, startRundeFor } = require('./startGate');

describe('upcomingMatches', () => {
  const matches = [
    { id: 'past', kickoff: ts(NOW - 2 * H) },
    { id: 'soon', kickoff: ts(NOW + 3 * H) },
    { id: 'later', kickoff: ts(NOW + 20 * H) },
    { id: 'next-week', kickoff: ts(NOW + 200 * H) },
    { id: 'no-kickoff' },
  ];

  it('tager kun kampe i det næste døgn', () => {
    expect(upcomingMatches(matches, now, windowEnd).map((m) => m.id)).toEqual(['soon', 'later']);
  });

  // GATEN ER ET SÆT AF KAMPE, IKKE ET TIDSPUNKT. Den kommer fra `startGate`,
  // altså nøjagtig den samme mængde, pointgivningen bruger — så en spiller
  // ikke kan blive rykket for en kamp, der ikke giver point. Da den var et
  // tidspunkt, kunne de to svare forskelligt på en runde, der lå spredt.
  it('springer gatede kampe over', () => {
    expect(upcomingMatches(matches, now, windowEnd, new Set(['soon'])).map((m) => m.id))
      .toEqual(['later']);
  });

  it('uden gate rykkes der for alt i vinduet', () => {
    expect(upcomingMatches(matches, now, windowEnd, null).map((m) => m.id)).toEqual(['soon', 'later']);
    expect(upcomingMatches(matches, now, windowEnd, new Set()).map((m) => m.id)).toEqual(['soon', 'later']);
  });

  it('er hele runden gatet, rykkes der slet ikke', () => {
    expect(upcomingMatches(matches, now, windowEnd, new Set(['soon', 'later']))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// …OG GATEN SKAL KOMME FRA SPILLET, ikke fra et tal, kaldestedet fandt på.
//
// `upcomingMatches` kan ikke selv se, om sættet er rigtigt. Den her test går
// gennem `startGate` med et spil-dokument, som kaldestederne gør.
// ---------------------------------------------------------------------------
describe('påmindelser bruger spillets startrunde', () => {
  const kampe = [
    { id: 'r1', round: 1, kickoff: ts(NOW + 3 * H) },
    { id: 'r2', round: 2, kickoff: ts(NOW + 20 * H) },
  ];

  it('rykker ikke for en runde under startrunden', () => {
    const gatede = gatedeKampe(kampe, startRundeFor({ startRound: 2 }, kampe));
    expect(upcomingMatches(kampe, now, windowEnd, gatede).map((m) => m.id)).toEqual(['r2']);
  });

  it('rykker for alt, når spillet ingen startrunde har', () => {
    const gatede = gatedeKampe(kampe, startRundeFor({}, kampe));
    expect(upcomingMatches(kampe, now, windowEnd, gatede).map((m) => m.id)).toEqual(['r1', 'r2']);
  });
});
