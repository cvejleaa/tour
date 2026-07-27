// ---------------------------------------------------------------------------
// playerLeagues.test.js — denormaliseret liga-medlemskab på players-docs.
// ---------------------------------------------------------------------------
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { memberUidsOf, membershipDelta, applyMembershipDelta, rebuildGamePlayerLeagues } = require('./playerLeagues.js');

const FieldValue = {
  arrayUnion: (...v) => ({ union: v }),
  arrayRemove: (...v) => ({ remove: v }),
};

/** Minimal db-stub: games/{g}/players + games/{g}/leagues. */
function makeDb({ players = {}, leagues = {} } = {}) {
  const updates = [];
  const playerDoc = (uid) => ({
    id: uid,
    get: async () => ({ exists: Object.hasOwn(players, uid), id: uid, data: () => players[uid] }),
    update: async (patch) => { updates.push({ uid, patch }); Object.assign(players[uid], patch); },
  });
  const snapDocs = (obj, mk) => Object.keys(obj).map(mk);
  const db = {
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
          return {
            get: async () => ({
              docs: snapDocs(leagues, (id) => ({ id, data: () => leagues[id] })),
            }),
          };
        },
      }),
    }),
  };
  return { db, updates, players };
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
    expect(out).toEqual({ updated: 2, added: 1, removed: 1 });
    expect(updates).toEqual([
      { uid: 'a', patch: { leagueIds: { union: ['L1'] } } },
      { uid: 'b', patch: { leagueIds: { remove: ['L1'] } } },
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
    expect(out).toEqual({ players: 3, changed: 2 });
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
    expect(await rebuildGamePlayerLeagues(db, 'g1')).toEqual({ players: 1, changed: 0 });
    expect(updates).toEqual([]);
  });
});
