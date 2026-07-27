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

  it('springer kampe FØR spillets start over', () => {
    // Spillet starter om 10 timer: "soon" ligger før og skal ikke rykkes for.
    const startMs = NOW + 10 * H;
    expect(upcomingMatches(matches, now, windowEnd, startMs).map((m) => m.id)).toEqual(['later']);
  });

  it('uden starttidspunkt gates der ikke', () => {
    expect(upcomingMatches(matches, now, windowEnd, null).map((m) => m.id)).toEqual(['soon', 'later']);
  });

  it('en kamp præcis ved starttidspunktet er med', () => {
    const startMs = NOW + 3 * H;
    expect(upcomingMatches(matches, now, windowEnd, startMs).map((m) => m.id)).toEqual(['soon', 'later']);
  });

  it('starter spillet efter hele vinduet, rykkes der slet ikke', () => {
    expect(upcomingMatches(matches, now, windowEnd, NOW + 100 * H)).toEqual([]);
  });
});
