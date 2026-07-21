import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { normalizeCode, redeemLeagueCodeCore } = require('./gameLeagues');

const FieldValue = { arrayUnion: (v) => ({ __arrayUnion: v }) };

// Minimal fake-Firestore for redeemLeagueCodeCore.
function makeDb({ user, isPlayer, leagues }) {
  const leagueDocs = (leagues || []).map((l) => ({ id: l.id, data: { ...l } }));
  leagueDocs.forEach((d) => { d.ref = { __league: d, update: async (u) => Object.assign(d.data, u) }; });
  return {
    _leagues: leagueDocs,
    collection(name) {
      if (name === 'users') {
        return { doc: () => ({ async get() { return { exists: !!user, data: () => user }; } }) };
      }
      if (name === 'games') {
        return {
          doc: () => ({
            collection(sub) {
              if (sub === 'players') {
                return { doc: () => ({ async get() { return { exists: !!isPlayer }; } }) };
              }
              // leagues
              return {
                where: (field, _op, val) => ({
                  limit: () => ({
                    async get() {
                      const matches = leagueDocs.filter((d) => d.data[field] === val);
                      return {
                        empty: matches.length === 0,
                        docs: matches.map((d) => ({ id: d.id, data: () => d.data, ref: d.ref })),
                      };
                    },
                  }),
                }),
              };
            },
          }),
        };
      }
      throw new Error(`uventet collection ${name}`);
    },
  };
}

describe('normalizeCode', () => {
  it('trimmer + STORE bogstaver', () => {
    expect(normalizeCode('  x4kr2m ')).toBe('X4KR2M');
  });
});

describe('redeemLeagueCodeCore', () => {
  const approved = { status: 'approved' };
  const league = { id: 'L1', name: 'Vennerne', code: 'X4KR2M', memberUids: ['owner'] };

  it('tilføjer godkendt deltager til ligaen via kode', async () => {
    const db = makeDb({ user: approved, isPlayer: true, leagues: [league] });
    const res = await redeemLeagueCodeCore(db, FieldValue, { uid: 'me', gameId: 'g1', code: 'x4kr2m' });
    expect(res).toEqual({ leagueId: 'L1', name: 'Vennerne', already: false });
    expect(db._leagues[0].data.memberUids).toEqual({ __arrayUnion: 'me' });
  });

  it('allerede-medlem → already:true, ingen skrivning', async () => {
    const db = makeDb({ user: approved, isPlayer: true, leagues: [{ ...league, memberUids: ['owner', 'me'] }] });
    const res = await redeemLeagueCodeCore(db, FieldValue, { uid: 'me', gameId: 'g1', code: 'X4KR2M' });
    expect(res.already).toBe(true);
    expect(Array.isArray(db._leagues[0].data.memberUids)).toBe(true); // urørt
  });

  it('afviser ukendt kode', async () => {
    const db = makeDb({ user: approved, isPlayer: true, leagues: [league] });
    await expect(redeemLeagueCodeCore(db, FieldValue, { uid: 'me', gameId: 'g1', code: 'ZZZZZZ' }))
      .rejects.toThrow('not-found');
  });

  it('afviser ikke-godkendt bruger og ikke-deltager', async () => {
    await expect(redeemLeagueCodeCore(makeDb({ user: { status: 'pending' }, isPlayer: true, leagues: [league] }),
      FieldValue, { uid: 'me', gameId: 'g1', code: 'X4KR2M' })).rejects.toThrow('not-approved');
    await expect(redeemLeagueCodeCore(makeDb({ user: approved, isPlayer: false, leagues: [league] }),
      FieldValue, { uid: 'me', gameId: 'g1', code: 'X4KR2M' })).rejects.toThrow('not-member');
  });

  it('afviser for kort kode', async () => {
    const db = makeDb({ user: approved, isPlayer: true, leagues: [league] });
    await expect(redeemLeagueCodeCore(db, FieldValue, { uid: 'me', gameId: 'g1', code: 'ab' }))
      .rejects.toThrow('bad-code');
  });
});
