// Tests for admin-medlemsstyringen (#61).
//
// De bærer tre ting, ingen anden test kan se:
//  1. At vagten er SNÆVRERE end svar-status-vagten: der er ingen medlems-gren.
//     Medlemskab afgør, hvem der ser hvis tips.
//  2. At spilleren OPRETTES frem for afvises — applyMembershipDelta springer
//     tavst over en uid uden players-dokument, og så ville brugeren stå i
//     memberUids uden leagueIds.
//  3. At kun memberUids skrives. syncPlayerLeagues spejler selv videre; to
//     skrivepunkter om samme sandhed betyder, at den sidste vinder.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  tjekMedlemsstyringAdgang, saetLigaMedlemCore, hentLigaMedlemmer, LEAGUE_ERR,
} = require('./gameLeagues');

const FieldValue = {
  arrayUnion: (...v) => ({ __op: 'union', v }),
  arrayRemove: (...v) => ({ __op: 'remove', v }),
  serverTimestamp: () => 'TS',
};

/** Firestore-attrap med users, games/{g}/leagues og games/{g}/players. */
function fakeDb({ users = {}, ligaer = {}, spillere = [], spilFindes = true } = {}) {
  const log = { opdateringer: [], oprettede: [] };
  const docSnap = (id, data) => ({ id, exists: !!data, data: () => data });
  const ligaDoc = (id) => ({
    get: async () => docSnap(id, ligaer[id]),
    update: async (f) => { log.opdateringer.push({ id, f }); },
  });
  const db = {
    log,
    collection(navn) {
      if (navn === 'users') {
        return {
          doc: (id) => ({
            get: async () => docSnap(id, users[id]),
            update: async (f) => { log.opdateringer.push({ id, f }); },
          }),
        };
      }
      return {
        doc: () => ({
          get: async () => docSnap('g', spilFindes ? {} : null),
          collection: (sub) => {
            if (sub === 'leagues') {
              return {
                doc: ligaDoc,
                get: async () => ({
                  docs: Object.entries(ligaer).map(([id, d]) => docSnap(id, d)),
                }),
              };
            }
            return {
              doc: (id) => ({
                get: async () => docSnap(id, spillere.includes(id) ? { uid: id } : null),
                set: async (d) => { log.oprettede.push(d); spillere.push(id); },
              }),
              get: async () => ({ docs: spillere.map((id) => docSnap(id, { uid: id })) }),
            };
          },
        }),
      };
    },
  };
  return db;
}

const ADMIN = { status: 'approved', role: 'globalAdmin' };
const EJER = { status: 'approved', role: 'owner' };
const MENIG = { status: 'approved', role: 'user' };

describe('tjekMedlemsstyringAdgang', () => {
  it('slipper globalAdmin og owner igennem', () => {
    expect(() => tjekMedlemsstyringAdgang(ADMIN)).not.toThrow();
    expect(() => tjekMedlemsstyringAdgang(EJER)).not.toThrow();
  });

  it('afviser en menig bruger — også selv om han er godkendt', () => {
    // Bevidst SNÆVRERE end tjekSvarStatusAdgang, som har en medlems-gren.
    expect(() => tjekMedlemsstyringAdgang(MENIG)).toThrow('not-admin');
  });

  it('afviser en ikke-godkendt admin FØR rollen læses', () => {
    expect(() => tjekMedlemsstyringAdgang({ status: 'pending', role: 'globalAdmin' }))
      .toThrow('not-approved');
    expect(() => tjekMedlemsstyringAdgang(null)).toThrow('not-approved');
  });
});

describe('saetLigaMedlemCore', () => {
  const base = () => fakeDb({
    users: { adm: ADMIN, ny: { status: 'approved' }, ejer: { status: 'approved' } },
    ligaer: { L1: { name: 'Vennerne', ownerUid: 'ejer', memberUids: ['ejer'] } },
    spillere: ['ejer'],
  });
  const kald = (db, o) => saetLigaMedlemCore(db, FieldValue, {
    uid: 'adm', gameId: 'g', leagueId: 'L1', ...o,
  });

  it('tilføjer og skriver KUN memberUids', async () => {
    const db = base();
    expect(await kald(db, { maalUid: 'ny', medlem: true }))
      .toEqual({ aendret: true, medlem: true });
    const liga = db.log.opdateringer.filter((o) => o.id === 'L1');
    expect(liga).toHaveLength(1);
    expect(Object.keys(liga[0].f)).toEqual(['memberUids']);
    expect(liga[0].f.memberUids).toEqual({ __op: 'union', v: ['ny'] });
  });

  it('OPRETTER spilleren i spillet frem for at afvise', async () => {
    // applyMembershipDelta springer tavst over en uid uden players-dokument.
    const db = base();
    await kald(db, { maalUid: 'ny', medlem: true });
    expect(db.log.oprettede).toEqual([{ uid: 'ny', joinedAt: 'TS' }]);
  });

  it('godkender en afventende bruger — en invitation ER en invitation', async () => {
    const db = fakeDb({
      users: { adm: ADMIN, ny: { status: 'pending' } },
      ligaer: { L1: { ownerUid: 'ejer', memberUids: [] } },
    });
    await kald(db, { maalUid: 'ny', medlem: true });
    expect(db.log.opdateringer.some((o) => o.id === 'ny' && o.f.status === 'approved')).toBe(true);
  });

  it('lukker ALDRIG en afvist bruger ind ad bagdøren', async () => {
    const db = fakeDb({
      users: { adm: ADMIN, ude: { status: 'rejected' } },
      ligaer: { L1: { ownerUid: 'ejer', memberUids: [] } },
    });
    await expect(kald(db, { maalUid: 'ude', medlem: true })).rejects.toThrow('rejected');
    expect(db.log.opdateringer).toHaveLength(0);
  });

  it('er idempotent begge veje — to klik duplikerer ikke', async () => {
    const db = fakeDb({
      users: { adm: ADMIN, med: { status: 'approved' } },
      ligaer: { L1: { ownerUid: 'ejer', memberUids: ['ejer', 'med'] } },
      spillere: ['ejer', 'med'],
    });
    expect(await kald(db, { maalUid: 'med', medlem: true }))
      .toEqual({ aendret: false, medlem: true });
    expect(db.log.opdateringer).toHaveLength(0);
  });

  it('nægter at fjerne ligaens EJER', async () => {
    // En ejerløs liga er en tilstand, ingen flade kan rette.
    const db = base();
    await expect(kald(db, { maalUid: 'ejer', medlem: false })).rejects.toThrow('owner-locked');
    expect(db.log.opdateringer).toHaveLength(0);
  });

  it('fjerner et menigt medlem', async () => {
    const db = fakeDb({
      users: { adm: ADMIN, med: { status: 'approved' } },
      ligaer: { L1: { ownerUid: 'ejer', memberUids: ['ejer', 'med'] } },
    });
    expect(await kald(db, { maalUid: 'med', medlem: false }))
      .toEqual({ aendret: true, medlem: false });
    expect(db.log.opdateringer[0].f.memberUids).toEqual({ __op: 'remove', v: ['med'] });
  });

  it('afviser en IKKE-admin, før noget som helst slås op', async () => {
    const db = fakeDb({
      users: { menig: MENIG, ny: { status: 'approved' } },
      ligaer: { L1: { ownerUid: 'ejer', memberUids: [] } },
    });
    await expect(saetLigaMedlemCore(db, FieldValue, {
      uid: 'menig', gameId: 'g', leagueId: 'L1', maalUid: 'ny', medlem: true,
    })).rejects.toThrow('not-admin');
    expect(db.log.opdateringer).toHaveLength(0);
  });

  it('afviser en liga, der ikke findes i DETTE spil', async () => {
    const db = base();
    await expect(kald(db, { leagueId: 'FINDES_IKKE', maalUid: 'ny', medlem: true }))
      .rejects.toThrow('no-league');
  });

  it('afviser en ukendt bruger', async () => {
    const db = base();
    await expect(kald(db, { maalUid: 'spoegelse', medlem: true })).rejects.toThrow('no-target');
  });
});

describe('hentLigaMedlemmer', () => {
  it('giver ligaer med navne OG spillets deltagere — men ALDRIG koden', async () => {
    // En admin skal kunne styre medlemmer uden at få invitationskoden
    // udleveret i en svar-krop.
    const db = fakeDb({
      users: {
        adm: ADMIN,
        ejer: { status: 'approved', displayName: 'Anne' },
        med: { status: 'approved', displayName: 'Bo' },
        fri: { status: 'approved', displayName: 'Carl' },
      },
      ligaer: { L1: { name: 'Vennerne', code: 'HEMMELIG', ownerUid: 'ejer', memberUids: ['ejer', 'med'] } },
      spillere: ['ejer', 'med', 'fri'],
    });
    const r = await hentLigaMedlemmer(db, { uid: 'adm', gameId: 'g' });
    expect(r.ligaer[0].navn).toBe('Vennerne');
    expect(r.ligaer[0].medlemmer).toEqual([
      { uid: 'ejer', navn: 'Anne' }, { uid: 'med', navn: 'Bo' },
    ]);
    expect(r.deltagere.map((d) => d.navn)).toEqual(['Anne', 'Bo', 'Carl']);
    expect(JSON.stringify(r)).not.toContain('HEMMELIG');
    expect(JSON.stringify(r)).not.toContain('code');
  });

  it('afviser en menig bruger', async () => {
    const db = fakeDb({ users: { menig: MENIG } });
    await expect(hentLigaMedlemmer(db, { uid: 'menig', gameId: 'g' })).rejects.toThrow('not-admin');
  });

  it('afviser et spil, der ikke findes', async () => {
    const db = fakeDb({ users: { adm: ADMIN }, spilFindes: false });
    await expect(hentLigaMedlemmer(db, { uid: 'adm', gameId: 'x' })).rejects.toThrow('no-game');
  });

  it('falder tilbage på "Spiller" ved et ubrugeligt displayName', async () => {
    const db = fakeDb({
      users: { adm: ADMIN, a: { displayName: 42 }, b: { displayName: '  ' } },
      ligaer: { L1: { name: 'X', ownerUid: 'a', memberUids: ['a', 'b'] } },
    });
    const r = await hentLigaMedlemmer(db, { uid: 'adm', gameId: 'g' });
    expect(r.ligaer[0].medlemmer.map((m) => m.navn)).toEqual(['Spiller', 'Spiller']);
  });
});

describe('LEAGUE_ERR', () => {
  it('oversætter hver ny kode — en ukendt kode ville blive til "internal"', () => {
    for (const kode of ['not-admin', 'no-game', 'no-league', 'no-target', 'owner-locked']) {
      expect(LEAGUE_ERR[kode], kode).toBeDefined();
      expect(LEAGUE_ERR[kode][1]).toMatch(/[a-zæøå]/i);
    }
    // Ejer-låsen skal sige HVAD man gør i stedet.
    expect(LEAGUE_ERR['owner-locked'][1]).toMatch(/[Ss]let ligaen/);
  });
});
