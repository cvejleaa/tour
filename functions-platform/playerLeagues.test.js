// ---------------------------------------------------------------------------
// playerLeagues.test.js — denormaliseret liga-medlemskab på players-docs.
// ---------------------------------------------------------------------------
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  memberUidsOf, membershipDelta, applyMembershipDelta, applyBetLeagueDelta,
  rebuildGamePlayerLeagues,
} = require('./playerLeagues.js');

const FieldValue = {
  arrayUnion: (...v) => ({ union: v }),
  arrayRemove: (...v) => ({ remove: v }),
};

/** Minimal db-stub: games/{g}/players + games/{g}/leagues + games/{g}/bets. */
function makeDb({ players = {}, leagues = {}, bets = {} } = {}) {
  const updates = [];     // skrivninger på players
  const betUpdates = [];  // skrivninger på bets
  const playerDoc = (uid) => ({
    id: uid,
    get: async () => ({ exists: Object.hasOwn(players, uid), id: uid, data: () => players[uid] }),
    update: async (patch) => { updates.push({ uid, patch }); Object.assign(players[uid], patch); },
  });
  const betDoc = (id) => ({
    id,
    data: () => bets[id],
    ref: { _betId: id },
  });
  const snapDocs = (obj, mk) => Object.keys(obj).map(mk);
  const betsSnap = (ids) => ({
    size: ids.length,
    empty: ids.length === 0,
    docs: ids.map(betDoc),
  });
  const db = {
    // Batches i produktionen; her samler vi bare skrivningerne.
    batch: () => ({
      update: (ref, patch) => { betUpdates.push({ id: ref._betId, patch }); Object.assign(bets[ref._betId], patch); },
      commit: async () => {},
    }),
    collection: () => ({
      doc: () => ({
        collection: (name) => {
          if (name === 'players') {
            return {
              doc: playerDoc,
              get: async () => ({
                size: Object.keys(players).length,
                docs: snapDocs(players, (uid) => ({ id: uid, data: () => players[uid], ref: playerDoc(uid) })),
              }),
            };
          }
          if (name === 'bets') {
            return {
              where: (field, op, val) => ({
                get: async () => betsSnap(Object.keys(bets).filter((id) => bets[id][field] === val)),
              }),
              get: async () => betsSnap(Object.keys(bets)),
            };
          }
          return {
            get: async () => ({
              docs: snapDocs(leagues, (id) => ({ id, data: () => leagues[id] })),
            }),
          };
        },
      }),
    }),
  };
  return { db, updates, betUpdates, players, bets };
}

describe('memberUidsOf', () => {
  it('tolererer manglende og forkerte felter', () => {
    expect(memberUidsOf(null)).toEqual([]);
    expect(memberUidsOf({})).toEqual([]);
    expect(memberUidsOf({ memberUids: 'nej' })).toEqual([]);
    expect(memberUidsOf({ memberUids: ['a', '', 3, 'b'] })).toEqual(['a', 'b']);
  });
});

describe('membershipDelta', () => {
  it('finder tilføjede og fjernede medlemmer', () => {
    const d = membershipDelta({ memberUids: ['a', 'b'] }, { memberUids: ['b', 'c'] });
    expect(d).toEqual({ added: ['c'], removed: ['a'] });
  });

  it('en ny liga tilføjer alle medlemmer', () => {
    expect(membershipDelta(null, { memberUids: ['a'] })).toEqual({ added: ['a'], removed: [] });
  });

  it('en slettet liga fjerner alle medlemmer', () => {
    expect(membershipDelta({ memberUids: ['a', 'b'] }, null)).toEqual({ added: [], removed: ['a', 'b'] });
  });

  it('uændret medlemsliste giver ingen ændringer', () => {
    const d = membershipDelta({ memberUids: ['a'] }, { memberUids: ['a'], name: 'nyt navn' });
    expect(d).toEqual({ added: [], removed: [] });
  });
});

describe('applyMembershipDelta', () => {
  it('skriver union/remove på de berørte spillere', async () => {
    const { db, updates } = makeDb({ players: { a: { uid: 'a' }, b: { uid: 'b' } } });
    const out = await applyMembershipDelta(db, FieldValue, 'g1', 'L1', { added: ['a'], removed: ['b'] });
    expect(out).toEqual({ updated: 2, added: 1, removed: 1, bets: 0 });
    expect(updates).toEqual([
      { uid: 'a', patch: { leagueIds: { union: ['L1'] } } },
      { uid: 'b', patch: { leagueIds: { remove: ['L1'] } } },
    ]);
  });

  // VIGTIGT: stub'en SKAL have tips. Uden dem er testen grøn, selv hvis hele
  // propageringen til tippene fjernes — og så beviser den ingenting.
  // (Samme fælde som pulje-testen, der kørte med et tomt bet-sæt.)
  it('slår også igennem på spillerens TIPS — ellers ser liga-kammeraterne dem aldrig', async () => {
    const { db, betUpdates } = makeDb({
      players: { a: { uid: 'a' }, b: { uid: 'b' } },
      bets: {
        a_m1: { uid: 'a', matchId: 'm1' },
        b_m1: { uid: 'b', matchId: 'm1', leagueIds: ['L1'] },
      },
    });
    const out = await applyMembershipDelta(db, FieldValue, 'g1', 'L1', { added: ['a'], removed: ['b'] });
    expect(out).toEqual({ updated: 2, added: 1, removed: 1, bets: 2 });
    expect(betUpdates).toEqual([
      { id: 'a_m1', patch: { leagueIds: { union: ['L1'] } } },
      { id: 'b_m1', patch: { leagueIds: { remove: ['L1'] } } },
    ]);
  });

  it('springer spillere over, der ikke deltager i spillet', async () => {
    const { db, updates } = makeDb({ players: {} });
    const out = await applyMembershipDelta(db, FieldValue, 'g1', 'L1', { added: ['ukendt'], removed: [] });
    expect(out.updated).toBe(0);
    expect(updates).toEqual([]);
  });
});

describe('rebuildGamePlayerLeagues', () => {
  it('genopbygger leagueIds ud fra ligaernes medlemmer', async () => {
    const { db, updates, players } = makeDb({
      players: { a: { uid: 'a' }, b: { uid: 'b', leagueIds: ['gammel'] }, c: { uid: 'c' } },
      leagues: { L1: { memberUids: ['a', 'b'] }, L2: { memberUids: ['b'] } },
    });
    const out = await rebuildGamePlayerLeagues(db, 'g1');
    // c har hverken ligaer eller felt i forvejen → intet at skrive.
    expect(out).toEqual({ players: 3, changed: 2, bets: 0, betsChanged: 0 });
    expect(players.a.leagueIds).toEqual(['L1']);
    expect(players.b.leagueIds).toEqual(['L1', 'L2']);
    expect(players.c.leagueIds).toBeUndefined();
    expect(updates.map((u) => u.uid)).toEqual(['a', 'b']);
  });

  it('rører ikke spillere der allerede er korrekte', async () => {
    const { db, updates } = makeDb({
      players: { a: { uid: 'a', leagueIds: ['L1'] } },
      leagues: { L1: { memberUids: ['a'] } },
    });
    expect(await rebuildGamePlayerLeagues(db, 'g1'))
      .toEqual({ players: 1, changed: 0, bets: 0, betsChanged: 0 });
    expect(updates).toEqual([]);
  });
});

// ── leagueIds på TIPPENE ────────────────────────────────────────────────────
// Reglen for "må jeg se dette tip?" afgøres ud fra tippets eget leagueIds.
// Ændrer et medlemskab sig efter tippene er skrevet, skal de følge med —
// ellers kan nye liga-kammerater ikke se ens gamle tips, og en, man har smidt
// ud, kan blive ved med at se dem.

describe('applyBetLeagueDelta', () => {
  it('skriver union/remove på den berørte spillers tips', async () => {
    const { db, betUpdates } = makeDb({
      bets: {
        a_m1: { uid: 'a', matchId: 'm1' },
        a_m2: { uid: 'a', matchId: 'm2' },
        b_m1: { uid: 'b', matchId: 'm1' },
      },
    });
    const touched = await applyBetLeagueDelta(db, FieldValue, 'g1', 'L1', { added: ['a'], removed: ['b'] });
    expect(touched).toBe(3);
    expect(betUpdates).toEqual([
      { id: 'a_m1', patch: { leagueIds: { union: ['L1'] } } },
      { id: 'a_m2', patch: { leagueIds: { union: ['L1'] } } },
      { id: 'b_m1', patch: { leagueIds: { remove: ['L1'] } } },
    ]);
  });

  it('rører kun den berørte spillers tips', async () => {
    const { db, betUpdates } = makeDb({
      bets: { a_m1: { uid: 'a', matchId: 'm1' }, c_m1: { uid: 'c', matchId: 'm1' } },
    });
    await applyBetLeagueDelta(db, FieldValue, 'g1', 'L1', { added: ['a'], removed: [] });
    expect(betUpdates.map((u) => u.id)).toEqual(['a_m1']);
  });

  it('klarer en spiller uden tips', async () => {
    const { db, betUpdates } = makeDb({ bets: {} });
    expect(await applyBetLeagueDelta(db, FieldValue, 'g1', 'L1', { added: ['a'], removed: [] })).toBe(0);
    expect(betUpdates).toEqual([]);
  });
});

describe('rebuildGamePlayerLeagues — tips', () => {
  it('bagfylder leagueIds på tips skrevet før feltet fandtes', async () => {
    const { db, bets } = makeDb({
      players: { a: { uid: 'a' } },
      leagues: { L1: { memberUids: ['a'] } },
      bets: { a_m1: { uid: 'a', matchId: 'm1' } }, // ingen leagueIds
    });
    const out = await rebuildGamePlayerLeagues(db, 'g1');
    expect(out).toEqual({ players: 1, changed: 1, bets: 1, betsChanged: 1 });
    expect(bets.a_m1.leagueIds).toEqual(['L1']);
  });

  it('fjerner et medlemskab igen fra tippene', async () => {
    const { db, bets } = makeDb({
      players: { a: { uid: 'a', leagueIds: [] } },
      leagues: {},
      bets: { a_m1: { uid: 'a', matchId: 'm1', leagueIds: ['L1'] } },
    });
    await rebuildGamePlayerLeagues(db, 'g1');
    expect(bets.a_m1.leagueIds).toEqual([]);
  });

  it('rører ikke tips der allerede er korrekte', async () => {
    const { db, betUpdates } = makeDb({
      players: { a: { uid: 'a', leagueIds: ['L1'] } },
      leagues: { L1: { memberUids: ['a'] } },
      bets: { a_m1: { uid: 'a', matchId: 'm1', leagueIds: ['L1'] } },
    });
    const out = await rebuildGamePlayerLeagues(db, 'g1');
    expect(out.betsChanged).toBe(0);
    expect(betUpdates).toEqual([]);
  });
});
