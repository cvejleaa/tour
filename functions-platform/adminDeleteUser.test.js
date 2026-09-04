import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { adminDeleteUserCore, SLET_ERR, sletFejl } = require('./adminDeleteUser');

const FieldValue = { arrayRemove: (...v) => ({ __op: 'remove', v }), serverTimestamp: () => 'TS' };
const NU = 1_000_000;

/**
 * Firestore-attrap over flere spil. Logger hver skrivning som en linje, så
 * testene kan sige præcis, hvad der blev slettet, opdateret — og ikke rørt.
 * spil: { [gameId]: { name, spiller|null, kampe, bets, ligaer } }
 */
function fakeDb(spil = {}) {
  const log = [];
  const ref = (sti) => ({
    sti,
    delete: async () => { log.push(`delete ${sti}`); },
    update: async (f) => { log.push(`update ${sti} ${JSON.stringify(f)}`); },
    collection: (sub) => ({ doc: (id) => ref(`${sti}/${sub}/${id}`) }),
  });
  const snap = (id, data, sti) => ({ id, exists: !!data, data: () => data, ref: ref(sti) });
  const gameRef = (gameId) => {
    const g = spil[gameId];
    const base = `games/${gameId}`;
    return {
      ...ref(base),
      collection: (sub) => {
        const b = `${base}/${sub}`;
        if (sub === 'players') return { doc: (uid) => ({ ...ref(`${b}/${uid}`), get: async () => snap(uid, g.spiller, `${b}/${uid}`) }) };
        if (sub === 'matches') return { get: async () => ({ docs: Object.entries(g.kampe || {}).map(([id, k]) => snap(id, typeof k === 'object' ? k : { kickoff: k }, `${b}/${id}`)) }) };
        if (sub === 'bets') return { where: (f, op, v) => ({ get: async () => { const hits = (g.bets || []).filter((x) => x[f] === v); return { docs: hits.map((x) => snap(x.id, x, `${b}/${x.id}`)), size: hits.length }; } }) };
        if (sub === 'leagues') return { where: (f, op, v) => ({ get: async () => {
          const hits = (g.ligaer || []).filter((l) => (op === 'array-contains' ? (l[f] || []).includes(v) : l[f] === v));
          return { docs: hits.map((l) => snap(l.id, l, `${b}/${l.id}`)), size: hits.length };
        } }) };
        throw new Error(`uventet sub ${sub}`);
      },
    };
  };
  return {
    log,
    batch() {
      const refs = [];
      return { delete: (r) => refs.push(r), commit: async () => { refs.forEach((r) => log.push(`delete ${r.sti}`)); } };
    },
    collection(navn) {
      if (navn === 'users' || navn === 'userContacts') return { doc: (uid) => ref(`${navn}/${uid}`) };
      if (navn === 'games') {
        return {
          get: async () => ({ docs: Object.entries(spil).map(([id, g]) => ({ id, data: () => ({ name: g.name }), ref: gameRef(id) })) }),
          doc: gameRef,
        };
      }
      throw new Error(`uventet collection ${navn}`);
    },
  };
}

const auth = () => { const kaldt = []; return { kaldt, slet: async (uid) => { kaldt.push(uid); } }; };
const kald = (db, p = {}) => {
  const a = auth();
  return { a, res: adminDeleteUserCore(db, FieldValue, { uid: 'x', callerUid: 'ejer', callerRole: 'owner', sletAuth: a.slet, nowMs: NU, ...p }) };
};

describe('adminDeleteUserCore — vagterne, FØR nogen skrivning', () => {
  it('afviser: ikke ejer, uden uid, sig selv', async () => {
    await expect(kald(fakeDb(), { callerRole: 'globalAdmin' }).res).rejects.toThrow('not-owner');
    await expect(kald(fakeDb(), { uid: '  ' }).res).rejects.toThrow('no-uid');
    await expect(kald(fakeDb(), { uid: 'ejer' }).res).rejects.toThrow('self');
  });

  it('afviser med point uden force — og navngiver spillet; Auth-kontoen røres ikke', async () => {
    const db = fakeDb({ sl: { name: 'Superligaen', spiller: { uid: 'x', totalPoints: 4.5 } } });
    const { a, res } = kald(db);
    await expect(res).rejects.toThrow('has-points');
    await res.catch((e) => { expect(e.navn).toBe('Superligaen'); expect(e.details).toEqual({ kanForceres: true }); });
    expect(a.kaldt).toEqual([]);
    expect(db.log).toEqual([]);
  });

  it('afviser ALTID, når brugeren ejer en liga — også med force', async () => {
    const db = fakeDb({ sl: { name: 'Superligaen', spiller: { uid: 'x', totalPoints: 0 }, ligaer: [{ id: 'L', ownerUid: 'x', memberUids: ['x'] }] } });
    const { a, res } = kald(db, { force: true });
    await expect(res).rejects.toThrow('owns-league');
    await res.catch((e) => { expect(e.navn).toBe('Superligaen'); expect(e.details).toBeUndefined(); });
    expect(a.kaldt).toEqual([]);
    expect(db.log).toEqual([]);
  });
});

describe('adminDeleteUserCore — oprydningen', () => {
  const kampe = { aaben: NU + 3600e3, spillet: { kickoff: NU - 3600e3, result: '1' } };

  it('dublet uden tips: Auth + users + userContacts + players-dokumentet slettes; ingen bets at røre', async () => {
    const db = fakeDb({ sl: { name: 'Superligaen', spiller: { uid: 'x' }, kampe } });
    const { a, res } = kald(db);
    const r = await res;
    expect(a.kaldt).toEqual(['x']);
    expect(db.log).toEqual([
      'delete users/x', 'delete userContacts/x',
      'delete games/sl/players/x/detalje/opdeling', 'delete games/sl/players/x',
    ]);
    expect(r.spil).toEqual([{ spil: 'sl', navn: 'Superligaen', slettedeTips: 0, beholdteTips: 0, ligaer: 0, dokument: 'slettet' }]);
  });

  it('med point (force): kommende tips slettes, spillede tips bliver, ligaerne mister hende — og dokumentet ARKIVERES, ikke slettes', async () => {
    const db = fakeDb({ sl: {
      name: 'Superligaen', spiller: { uid: 'x', totalPoints: 7 }, kampe,
      bets: [{ id: 'x_aaben', uid: 'x', matchId: 'aaben' }, { id: 'x_spillet', uid: 'x', matchId: 'spillet' }, { id: 'y_aaben', uid: 'y', matchId: 'aaben' }],
      ligaer: [{ id: 'L', ownerUid: 'y', memberUids: ['x', 'y'] }],
    } });
    const r = await kald(db, { force: true }).res;
    expect(db.log).toContain('delete games/sl/bets/x_aaben');
    expect(db.log).not.toContain('delete games/sl/bets/x_spillet');
    expect(db.log).not.toContain('delete games/sl/bets/y_aaben');
    expect(db.log).toContain('update games/sl/leagues/L {"memberUids":{"__op":"remove","v":["x"]}}');
    // GENOPSTANDELSEN: dokumentet må ikke slettes, når der er tips tilbage —
    // recalcPlayerTotal ville ellers skrive det tilbage uden navn.
    expect(db.log).not.toContain('delete games/sl/players/x');
    expect(db.log).toContain('update games/sl/players/x {"forladt":true,"forladtAt":"TS","slettet":true}');
    expect(r.spil[0]).toMatchObject({ slettedeTips: 1, beholdteTips: 1, ligaer: 1, dokument: 'arkiveret' });
  });

  it('flere spil: kun dem, hun er med i, røres — og hvert for sig', async () => {
    const db = fakeDb({
      sl: { name: 'Superligaen', spiller: { uid: 'x' }, kampe },
      pl: { name: 'PL', spiller: null },
      vm: { name: 'VM', spiller: { uid: 'x' }, kampe, bets: [{ id: 'x_spillet', uid: 'x', matchId: 'spillet' }] },
    });
    const r = await kald(db).res;
    expect(r.spil.map((s) => `${s.spil}:${s.dokument}`)).toEqual(['sl:slettet', 'vm:arkiveret']);
    expect(db.log.some((l) => l.includes('games/pl/'))).toBe(false);
  });

  it('en Auth-konto, der allerede er væk, stopper ikke oprydningen — enhver anden Auth-fejl gør', async () => {
    const db = fakeDb({ sl: { name: 'S', spiller: { uid: 'x' }, kampe } });
    const vaek = async () => { const e = new Error('nope'); e.code = 'auth/user-not-found'; throw e; };
    await expect(adminDeleteUserCore(db, FieldValue, { uid: 'x', callerUid: 'ejer', callerRole: 'owner', sletAuth: vaek, nowMs: NU })).resolves.toMatchObject({ ok: true });
    const db2 = fakeDb({ sl: { name: 'S', spiller: { uid: 'x' }, kampe } });
    await expect(adminDeleteUserCore(db2, FieldValue, { uid: 'x', callerUid: 'ejer', callerRole: 'owner', sletAuth: async () => { throw new Error('boom'); }, nowMs: NU })).rejects.toThrow('auth');
    expect(db2.log).toEqual([]);
  });
});

describe('sletFejl — oversættelsen til HttpsError', () => {
  it('indsætter spillets navn og bærer kanForceres KUN for point-fejlen', () => {
    const e = new Error('has-points'); e.navn = 'Superligaen'; e.details = { kanForceres: true };
    expect(sletFejl(e)).toEqual(['failed-precondition', 'Brugeren har point i "Superligaen". Bekræft med force for at slette alligevel.', { kanForceres: true }]);
    const l = new Error('owns-league'); l.navn = 'VM';
    expect(sletFejl(l)).toEqual(['failed-precondition', 'Brugeren ejer en liga i "VM". Slet eller overdrag ligaen først.', undefined]);
    expect(sletFejl(new Error('whatever'))).toEqual(['internal', 'Kunne ikke slette brugeren.', undefined]);
    expect(Object.keys(SLET_ERR)).toContain('self');
  });
});
