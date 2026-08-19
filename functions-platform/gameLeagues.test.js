import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { normalizeCode, redeemLeagueCodeCore, LEAGUE_ERR } = require('./gameLeagues');
const KILDE = require('fs').readFileSync(new URL('./gameLeagues.js', import.meta.url), 'utf8');

const FieldValue = {
  arrayUnion: (v) => ({ __arrayUnion: v }),
  serverTimestamp: () => ({ __ts: true }),
};

// Minimal fake-Firestore for redeemLeagueCodeCore. `state` opsamler side-effekter
// (auto-godkend + auto-tilmeld), så testene kan verificere dem.
function makeDb({ user, isPlayer, leagues }) {
  const leagueDocs = (leagues || []).map((l) => ({ id: l.id, data: { ...l } }));
  leagueDocs.forEach((d) => { d.ref = { __league: d, update: async (u) => Object.assign(d.data, u) }; });
  // leagueQueries tæller opslag på koden — så en test kan vise, at en afvist
  // bruger stoppes FØR opslaget og altså ikke kan bruge funktionen til at
  // afgøre, om en kode findes.
  const state = {
    userUpdates: null, playerSet: null, userExists: !!user, isPlayer: !!isPlayer,
    leagueQueries: 0,
  };
  return {
    _leagues: leagueDocs,
    _state: state,
    collection(name) {
      if (name === 'users') {
        return {
          doc: () => ({
            async get() { return { exists: state.userExists, data: () => user }; },
            async update(u) { state.userUpdates = { ...(state.userUpdates || {}), ...u }; if (user) Object.assign(user, u); },
          }),
        };
      }
      if (name === 'games') {
        return {
          doc: () => ({
            collection(sub) {
              if (sub === 'players') {
                return {
                  doc: () => ({
                    async get() { return { exists: state.isPlayer }; },
                    async set(d) { state.playerSet = d; state.isPlayer = true; },
                  }),
                };
              }
              // leagues
              return {
                where: (field, _op, val) => ({
                  limit: () => ({
                    async get() {
                      state.leagueQueries += 1;
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

// LEAGUE_ERR oversætter fejlkoderne til danske beskeder. Uden denne test kunne
// en ny throw glemme sin post og ende som "Kunne ikke deltage i ligaen." —
// index.js kan ikke importeres uden firebase-functions, så den vej er lukket.
describe('LEAGUE_ERR', () => {
  it('har en dansk besked for HVER fejlkode, kernen kaster', () => {
    const kastet = [...KILDE.matchAll(/throw new Error\('([^']+)'\)/g)].map((m) => m[1]);
    expect(kastet.length).toBeGreaterThan(0);
    expect([...new Set(kastet)].sort()).toEqual(Object.keys(LEAGUE_ERR).sort());
  });

  it('en afvist bruger får at vide HVORFOR, ikke bare at det gik galt', () => {
    expect(LEAGUE_ERR.rejected).toEqual(
      ['permission-denied', 'Din adgang er afvist. Kontakt en administrator.'],
    );
  });
});

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

  it('afviser ukendt kode (og auto-godkender IKKE)', async () => {
    const db = makeDb({ user: { status: 'pending' }, isPlayer: false, leagues: [league] });
    await expect(redeemLeagueCodeCore(db, FieldValue, { uid: 'me', gameId: 'g1', code: 'ZZZZZZ' }))
      .rejects.toThrow('not-found');
    // Ugyldig kode må aldrig auto-godkende eller auto-tilmelde.
    expect(db._state.userUpdates).toBe(null);
    expect(db._state.playerSet).toBe(null);
  });

  it('invitation: auto-godkender pending bruger og tilmelder spillet + ligaen', async () => {
    const db = makeDb({ user: { status: 'pending' }, isPlayer: false, leagues: [league] });
    const res = await redeemLeagueCodeCore(db, FieldValue, { uid: 'me', gameId: 'g1', code: 'X4KR2M' });
    expect(res).toEqual({ leagueId: 'L1', name: 'Vennerne', already: false });
    expect(db._state.userUpdates).toEqual({ status: 'approved' });
    expect(db._state.playerSet).toEqual({ uid: 'me', joinedAt: { __ts: true } });
    expect(db._leagues[0].data.memberUids).toEqual({ __arrayUnion: 'me' });
  });

  it('godkendt deltager: rører hverken status eller player-doc', async () => {
    const db = makeDb({ user: approved, isPlayer: true, leagues: [league] });
    await redeemLeagueCodeCore(db, FieldValue, { uid: 'me', gameId: 'g1', code: 'X4KR2M' });
    expect(db._state.userUpdates).toBe(null);
    expect(db._state.playerSet).toBe(null);
  });

  it('afviser hvis brugerprofilen ikke findes', async () => {
    const db = makeDb({ user: null, isPlayer: false, leagues: [league] });
    await expect(redeemLeagueCodeCore(db, FieldValue, { uid: 'me', gameId: 'g1', code: 'X4KR2M' }))
      .rejects.toThrow('no-user');
  });

  it('afviser for kort kode', async () => {
    const db = makeDb({ user: approved, isPlayer: true, leagues: [league] });
    await expect(redeemLeagueCodeCore(db, FieldValue, { uid: 'me', gameId: 'g1', code: 'ab' }))
      .rejects.toThrow('bad-code');
  });

  // En bortvist bruger kender ligaens kode — hen var selv medlem. Uden dette
  // værn kunne hen gen-godkende sig selv og komme ind igen, og moderering var
  // uden virkning. Tour-udgaven har haft værnet hele tiden.
  it('en AFVIST bruger kan ikke gen-godkende sig selv med en gyldig kode', async () => {
    const db = makeDb({ user: { status: 'rejected' }, isPlayer: false, leagues: [league] });
    await expect(redeemLeagueCodeCore(db, FieldValue, { uid: 'ude', gameId: 'g1', code: 'X4KR2M' }))
      .rejects.toThrow('rejected');
    expect(db._state.userUpdates).toBe(null);   // ikke gen-godkendt
    expect(db._state.playerSet).toBe(null);     // ikke tilmeldt spillet
    expect(db._leagues[0].data.memberUids).toEqual(['owner']); // ikke tilbage i ligaen
  });

  it('en AFVIST bruger stoppes FØR kode-opslaget (kan ikke afprøve koder)', async () => {
    const db = makeDb({ user: { status: 'rejected' }, isPlayer: false, leagues: [league] });
    await expect(redeemLeagueCodeCore(db, FieldValue, { uid: 'ude', gameId: 'g1', code: 'X4KR2M' }))
      .rejects.toThrow('rejected');
    expect(db._state.leagueQueries).toBe(0);
  });

  it('en PENDING bruger rammes ikke af værnet (invitation virker stadig)', async () => {
    const db = makeDb({ user: { status: 'pending' }, isPlayer: false, leagues: [league] });
    await expect(redeemLeagueCodeCore(db, FieldValue, { uid: 'ny', gameId: 'g1', code: 'X4KR2M' }))
      .resolves.toMatchObject({ leagueId: 'L1' });
  });
});

// ---------------------------------------------------------------------------
// Hvem mangler at svare? (opgave #38) — "åbent" er SKRIVEREGLEN, eks-medlem
// kan ikke tælle med, og svar-data forlader aldrig databasen.
// ---------------------------------------------------------------------------
const { byggSpoergsmaalStatus, hentSpoergsmaalStatus } = require('./gameLeagues.js');

describe('byggSpoergsmaalStatus', () => {
  const NU = 1_000_000;
  const brugere = new Map([
    ['a', { displayName: 'Anna' }],
    ['b', { displayName: 'Bo' }],
    ['c', { displayName: 'Carla' }],
  ]);

  it('åbent følger skrivereglen: facit lukker, passeret deadline lukker — uden deadline er åbent', () => {
    const ud = byggSpoergsmaalStatus({
      spoergsmaal: [
        { id: 'q1', label: 'Topscorer?', deadline: NU + 100 },      // åbent
        { id: 'q2', label: 'Lukket af facit', facit: 'Haaland' },   // lukket
        { id: 'q3', label: 'Deadline passeret', deadline: NU - 1 }, // lukket
        { id: 'q4', label: 'Uden deadline' },                        // åbent, sidst
      ],
      memberUids: ['a', 'b'],
      harSvaret: new Map([['q1', new Set(['a'])]]),
      brugere,
      nowMs: NU,
    });
    expect(ud.map((q) => q.id)).toEqual(['q1', 'q4']); // sorteret: deadline før ingen-deadline
    expect(ud[0]).toMatchObject({ besvaret: 1, ialt: 2 });
    expect(ud[0].mangler).toEqual([{ uid: 'b', navn: 'Bo' }]);
    expect(ud[1].deadline).toBeNull();
  });

  it('kun NUVÆRENDE medlemmer tæller — et eks-medlems svar kan ikke give "5 af 4"', () => {
    const ud = byggSpoergsmaalStatus({
      spoergsmaal: [{ id: 'q1', label: 'x', deadline: NU + 100 }],
      memberUids: ['a', 'b'],
      // 'vaek' har et gammelt svar — men er ikke medlem og må hverken tælle
      // i besvaret eller optræde i mangler.
      harSvaret: new Map([['q1', new Set(['a', 'vaek'])]]),
      brugere,
      nowMs: NU,
    });
    expect(ud[0].besvaret).toBe(1);
    expect(ud[0].ialt).toBe(2);
    expect(ud[0].mangler.map((m) => m.uid)).toEqual(['b']);
  });
});

describe('hentSpoergsmaalStatus — svar-data forlader ALDRIG databasen', () => {
  function fakeDb() {
    const kaldteData = [];
    const svarDoc = (id) => ({
      exists: id === 'q1_a', // kun Anna har svaret
      data: () => { kaldteData.push(id); return { answer: 'HEMMELIGT SVAR' }; },
    });
    const leagueRef = {
      get: async () => ({ exists: true, data: () => ({ name: 'Buddy', memberUids: ['a', 'b'] }) }),
      collection: (navn) => ({
        get: async () => ({
          docs: navn === 'questions'
            ? [{ id: 'q1', data: () => ({ label: 'Topscorer?', deadline: 9999999 }) }]
            : [],
        }),
        doc: (id) => ({ __svarId: id }),
      }),
    };
    return {
      _kaldteData: kaldteData,
      collection: (navn) => ({
        doc: (id) => (navn === 'users'
          ? { get: async () => ({ id, exists: true, data: () => ({ displayName: `Navn-${id}` }) }), __uid: id }
          : { ...leagueRef, collection: () => ({ doc: () => leagueRef }) }),
      }),
      getAll: async (...args) => {
        const sidste = args[args.length - 1];
        const harOpts = sidste && !sidste.__svarId && !sidste.__uid && !sidste.get;
        const refs = harOpts ? args.slice(0, -1) : args;
        if (harOpts) {
          // fieldMask SKAL være tom på svar-opslagene — garantien for, at
          // felterne aldrig hentes fra databasen.
          expect(sidste.fieldMask).toEqual([]);
        }
        return Promise.all(refs.map(async (r) => (r.__svarId ? svarDoc(r.__svarId) : r.get())));
      },
    };
  }

  it('eksistens afgør besvaret — .data() kaldes aldrig på et svar', async () => {
    const db = fakeDb();
    const ud = await hentSpoergsmaalStatus(db, { gameId: 'g', leagueId: 'l', nowMs: 1000 });
    expect(ud.spoergsmaal[0]).toMatchObject({ besvaret: 1, ialt: 2 });
    expect(ud.spoergsmaal[0].mangler.map((m) => m.uid)).toEqual(['b']);
    expect(JSON.stringify(ud)).not.toContain('HEMMELIGT');
    expect(db._kaldteData).toEqual([]); // ingen svar-data rørt
  });
});
