import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { forladSpilCore, FORLAD_ERR, erForladt, aktiveSpillere } = require('./forladSpil');

const FieldValue = { arrayRemove: (...v) => ({ __op: 'remove', v }), serverTimestamp: () => 'TS' };
const NU = 1_000_000;

/**
 * Firestore-attrap, der logger HVAD der blev skrevet. Kampe har kickoff i
 * millisekunder; tips peger på en kamp via matchId.
 */
function fakeDb({ spil = { status: 'open' }, spiller = { uid: 'me' }, kampe = {}, bets = [], ligaer = [] } = {}) {
  const log = [];
  const ref = (sti) => ({ sti, delete: async () => { log.push(`delete ${sti}`); }, update: async (f) => { log.push(`update ${sti} ${JSON.stringify(f)}`); } });
  const snap = (id, data, sti) => ({ id, exists: !!data, data: () => data, ref: ref(sti) });
  return {
    log,
    batch() {
      const refs = [];
      return { delete: (r) => refs.push(r), commit: async () => { refs.forEach((r) => log.push(`delete ${r.sti}`)); } };
    },
    collection(navn) {
      if (navn !== 'games') throw new Error(`uventet collection ${navn}`);
      return {
        doc: (gameId) => ({
          get: async () => snap(gameId, spil, `games/${gameId}`),
          collection: (sub) => {
            const base = `games/${gameId}/${sub}`;
            if (sub === 'players') {
              return { doc: (uid) => ({ get: async () => snap(uid, spiller, `${base}/${uid}`), update: async (f) => { log.push(`update ${base}/${uid} ${JSON.stringify(f)}`); } }) };
            }
            if (sub === 'matches') {
              // En kamp er enten et kickoff-tal eller et helt dokument ({kickoff, result, live}).
              return { get: async () => ({ docs: Object.entries(kampe).map(([id, k]) => snap(id, typeof k === 'object' ? k : { kickoff: k }, `${base}/${id}`)) }) };
            }
            if (sub === 'bets') {
              return { where: (f, op, v) => ({ get: async () => { const hits = bets.filter((b) => b[f] === v); return { docs: hits.map((b) => snap(b.id, b, `${base}/${b.id}`)), size: hits.length }; } }) };
            }
            if (sub === 'leagues') {
              return { where: (f, op, v) => ({ get: async () => {
                const hits = ligaer.filter((l) => (op === 'array-contains' ? (l[f] || []).includes(v) : l[f] === v));
                return { docs: hits.map((l) => snap(l.id, l, `${base}/${l.id}`)), size: hits.length };
              } }) };
            }
            throw new Error(`uventet sub ${sub}`);
          },
        }),
      };
    },
  };
}

const kald = (db, uid = 'me') => forladSpilCore(db, FieldValue, { uid, gameId: 'sl', nowMs: NU });

describe('forladSpilCore — vagterne', () => {
  it('afviser uden login, uden spil, uden medlemskab, og når spillet ikke er åbent', async () => {
    await expect(forladSpilCore(fakeDb(), FieldValue, { uid: null, gameId: 'sl' })).rejects.toThrow('unauthenticated');
    await expect(forladSpilCore(fakeDb(), FieldValue, { uid: 'me', gameId: '' })).rejects.toThrow('no-game');
    await expect(kald(fakeDb({ spil: null }))).rejects.toThrow('no-game');
    await expect(kald(fakeDb({ spiller: null }))).rejects.toThrow('not-member');
    await expect(kald(fakeDb({ spil: { status: 'live' } }))).rejects.toThrow('not-open');
    await expect(kald(fakeDb({ spil: { status: 'finished' } }))).rejects.toThrow('not-open');
  });

  it('en spiller, der allerede har forladt spillet, kan ikke forlade det igen', async () => {
    await expect(kald(fakeDb({ spiller: { uid: 'me', forladt: true } }))).rejects.toThrow('not-member');
  });

  it('afviser, når spilleren EJER en liga i spillet — og skriver INTET', async () => {
    const db = fakeDb({ bets: [{ id: 'me_k1', uid: 'me', matchId: 'k1' }], ligaer: [{ id: 'l1', name: 'Mine venner', ownerUid: 'me', memberUids: ['me', 'du'] }] });
    await expect(kald(db)).rejects.toThrow('owns-league');
    expect(db.log).toEqual([]);
  });

  it('afviser også, når ejeren har fjernet SIG SELV fra medlemslisten — ejerskab er ikke medlemskab', async () => {
    // Reglerne lader en ejer forlade sin egen medlemsliste; hun ejer stadig
    // ligaen (startRound, navn, sletning). Security kørte det i emulatoren.
    const db = fakeDb({ ligaer: [{ id: 'l1', name: 'Mine venner', ownerUid: 'me', memberUids: ['du'] }] });
    const err = await kald(db).catch((e) => e);
    expect(err.message).toBe('owns-league');
    expect(err.ligaer).toEqual(['Mine venner']);
    expect(db.log).toEqual([]);
  });

  it('alle fejlnøgler har en dansk tekst og en HttpsError-kode', () => {
    for (const key of ['unauthenticated', 'no-game', 'not-member', 'not-open', 'owns-league']) {
      expect(FORLAD_ERR[key]).toHaveLength(2);
      expect(FORLAD_ERR[key][1]).toMatch(/[a-zæøå]/);
    }
  });
});

describe('forladSpilCore — arkivet', () => {
  const fuldt = () => fakeDb({
    kampe: {
      spillet: NU - 1000, igang: NU, kommende: NU + 1000,
      // Låst på anden vis end kickoff — samme prædikat som Chancen bruger:
      facitFrem: { kickoff: NU + 5000, result: '1' },
      liveFrem: { kickoff: NU + 5000, live: { status: 'inprogress' } },
      udenKickoff: { kickoff: null },
    },
    bets: [
      { id: 'me_spillet', uid: 'me', matchId: 'spillet' },
      { id: 'me_igang', uid: 'me', matchId: 'igang' },
      { id: 'me_kommende', uid: 'me', matchId: 'kommende' },
      { id: 'me_ukendt', uid: 'me', matchId: 'findes-ikke' },
      { id: 'me_facitFrem', uid: 'me', matchId: 'facitFrem' },
      { id: 'me_liveFrem', uid: 'me', matchId: 'liveFrem' },
      { id: 'me_udenKickoff', uid: 'me', matchId: 'udenKickoff' },
      { id: 'du_kommende', uid: 'du', matchId: 'kommende' },
    ],
    ligaer: [{ id: 'l1', name: 'Kontoret', ownerUid: 'du', memberUids: ['du', 'me'] }, { id: 'l2', name: 'Andre', ownerUid: 'x', memberUids: ['x'] }],
  });

  it('sletter KUN hendes tips på kampe, der ikke er låst — låst er Chancens prædikat, og ukendt = låst', async () => {
    const db = fuldt();
    const res = await kald(db);
    expect(res).toEqual({ slettedeTips: 1, beholdteTips: 6, ligaer: 1 });
    expect(db.log).toContain('delete games/sl/bets/me_kommende');
    // Låst på hver sin måde — bliver alle: et slettet tip er en frigivet Chance.
    for (const id of ['me_spillet', 'me_igang', 'me_facitFrem', 'me_liveFrem', 'me_udenKickoff', 'me_ukendt', 'du_kommende']) {
      expect(db.log).not.toContain(`delete games/sl/bets/${id}`);
    }
  });

  it('forlader hendes ligaer, men rører ikke andres', async () => {
    const db = fuldt();
    await kald(db);
    expect(db.log).toContain('update games/sl/leagues/l1 {"memberUids":{"__op":"remove","v":["me"]}}');
    expect(db.log.filter((l) => l.includes('leagues/l2'))).toEqual([]);
  });

  it('sletter ALDRIG players-dokumentet — det får flaget, sidst', async () => {
    const db = fuldt();
    await kald(db);
    expect(db.log.filter((l) => l.startsWith('delete games/sl/players'))).toEqual([]);
    expect(db.log[db.log.length - 1]).toBe('update games/sl/players/me {"forladt":true,"forladtAt":"TS"}');
  });

  it('uden tips og ligaer sættes kun flaget', async () => {
    const db = fakeDb();
    expect(await kald(db)).toEqual({ slettedeTips: 0, beholdteTips: 0, ligaer: 0 });
    expect(db.log).toEqual(['update games/sl/players/me {"forladt":true,"forladtAt":"TS"}']);
  });
});

describe('erForladt / aktiveSpillere — serverens læsere', () => {
  it('kun forladt: true tæller — ikke et manglende felt, ikke en streng', () => {
    expect(erForladt({ forladt: true })).toBe(true);
    expect(erForladt({ forladt: 'true' })).toBe(false);
    expect(erForladt({})).toBe(false);
    expect(erForladt(null)).toBe(false);
  });
  it('filtrerer snapshot-dokumenter, også dem uden data()', () => {
    const docs = [{ id: 'a', data: () => ({ forladt: true }) }, { id: 'b', data: () => ({}) }, { id: 'c' }];
    expect(aktiveSpillere(docs).map((d) => d.id)).toEqual(['b', 'c']);
  });
});
