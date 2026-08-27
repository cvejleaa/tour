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

/**
 * Firestore-attrap, der husker hvad der blev skrevet.
 *
 * SKELNER PÅ gameId. Første udgave gjorde ikke, og Test Manager fandt det ved
 * at hardkode spillet til 'WRONG_GAME' i begge kerner — hele suiten forblev
 * grøn. En attrap, der ignorerer den nøgle, koden slår op på, kan ikke måle
 * kryds-spil-lækage, og det er netop dét, vagten findes for.
 */
function fakeDb({ users = {}, spil = {} } = {}) {
  const log = { opdateringer: [], oprettede: [] };
  const docSnap = (id, data) => ({ id, exists: !!data, data: () => data });

  const spilDoc = (gameId) => {
    const g = spil[gameId];
    return {
      // Findes spillet ikke i fixturet, findes det ikke — og dets
      // under-collections er TOMME, ikke et andet spils.
      get: async () => docSnap(gameId, g ? {} : null),
      collection: (sub) => {
        const ligaer = g?.ligaer || {};
        const spillere = g?.spillere || [];
        if (sub === 'leagues') {
          return {
            doc: (id) => ({
              get: async () => docSnap(id, ligaer[id]),
              update: async (f) => { log.opdateringer.push({ gameId, id, f }); },
            }),
            get: async () => ({
              docs: Object.entries(ligaer).map(([id, d]) => docSnap(id, d)),
            }),
          };
        }
        return {
          doc: (id) => ({
            get: async () => docSnap(id, spillere.includes(id) ? { uid: id } : null),
            set: async (d) => { log.oprettede.push({ gameId, ...d }); spillere.push(id); },
          }),
          get: async () => ({ docs: spillere.map((id) => docSnap(id, { uid: id })) }),
        };
      },
    };
  };

  return {
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
      return { doc: spilDoc };
    },
  };
}

/** Kortform: ét spil med id 'g'. */
function dbMedDoc({ users = {}, ligaer = {}, spillere = [], spilFindes = true } = {}) {
  return fakeDb({ users, spil: spilFindes ? { g: { ligaer, spillere } } : {} });
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
  const base = () => dbMedDoc({
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
    expect(db.log.oprettede).toEqual([{ gameId: 'g', uid: 'ny', joinedAt: 'TS' }]);
  });

  it('godkender en afventende bruger — en invitation ER en invitation', async () => {
    const db = dbMedDoc({
      users: { adm: ADMIN, ny: { status: 'pending' } },
      ligaer: { L1: { ownerUid: 'ejer', memberUids: [] } },
    });
    await kald(db, { maalUid: 'ny', medlem: true });
    expect(db.log.opdateringer.some((o) => o.id === 'ny' && o.f.status === 'approved')).toBe(true);
  });

  it('lukker ALDRIG en afvist bruger ind ad bagdøren', async () => {
    const db = dbMedDoc({
      users: { adm: ADMIN, ude: { status: 'rejected' } },
      ligaer: { L1: { ownerUid: 'ejer', memberUids: [] } },
    });
    await expect(kald(db, { maalUid: 'ude', medlem: true })).rejects.toThrow('rejected');
    expect(db.log.opdateringer).toHaveLength(0);
  });

  it('er idempotent begge veje — to klik duplikerer ikke', async () => {
    const db = dbMedDoc({
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
    const db = dbMedDoc({
      users: { adm: ADMIN, med: { status: 'approved' } },
      ligaer: { L1: { ownerUid: 'ejer', memberUids: ['ejer', 'med'] } },
    });
    expect(await kald(db, { maalUid: 'med', medlem: false }))
      .toEqual({ aendret: true, medlem: false });
    expect(db.log.opdateringer[0].f.memberUids).toEqual({ __op: 'remove', v: ['med'] });
  });

  it('afviser en IKKE-admin, før noget som helst slås op', async () => {
    const db = dbMedDoc({
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

  it('er idempotent i FJERN-retningen — ikke kun ved tilføjelse', async () => {
    // Testen hed "begge veje", men målte kun den ene. Test Manager fjernede
    // fjern-vagten, og suiten forblev grøn.
    const db = dbMedDoc({
      users: { adm: ADMIN, ude: { status: 'approved' } },
      ligaer: { L1: { ownerUid: 'ejer', memberUids: ['ejer'] } },
    });
    expect(await kald(db, { maalUid: 'ude', medlem: false }))
      .toEqual({ aendret: false, medlem: false });
    expect(db.log.opdateringer).toHaveLength(0);
  });

  it('rører ALDRIG et andet spils liga', async () => {
    // Kryds-spil-lækage var HELT udækket, fordi attrappen ignorerede gameId.
    // To spil med hver sin liga af samme navn: et kald mod g2 må ikke kunne
    // ramme g1's medlemsliste.
    const db = fakeDb({
      users: { adm: ADMIN, ny: { status: 'approved' } },
      spil: {
        g1: { ligaer: { L1: { navn: 'A', ownerUid: 'e1', memberUids: ['e1'] } }, spillere: ['e1'] },
        g2: { ligaer: { L2: { navn: 'B', ownerUid: 'e2', memberUids: ['e2'] } }, spillere: ['e2'] },
      },
    });
    await saetLigaMedlemCore(db, FieldValue, {
      uid: 'adm', gameId: 'g2', leagueId: 'L2', maalUid: 'ny', medlem: true,
    });
    expect(db.log.opdateringer.filter((o) => o.gameId === 'g1')).toHaveLength(0);
    expect(db.log.opdateringer.filter((o) => o.gameId === 'g2')).toHaveLength(1);
    expect(db.log.oprettede).toEqual([{ gameId: 'g2', uid: 'ny', joinedAt: 'TS' }]);
  });

  it('finder IKKE en liga, der hører til et andet spil', async () => {
    const db = fakeDb({
      users: { adm: ADMIN, ny: { status: 'approved' } },
      spil: { g1: { ligaer: { L1: { ownerUid: 'e1', memberUids: [] } } }, g2: { ligaer: {} } },
    });
    await expect(saetLigaMedlemCore(db, FieldValue, {
      uid: 'adm', gameId: 'g2', leagueId: 'L1', maalUid: 'ny', medlem: true,
    })).rejects.toThrow('no-league');
  });
});

describe('hentLigaMedlemmer', () => {
  it('giver ligaer med navne OG spillets deltagere — men ALDRIG koden', async () => {
    // En admin skal kunne styre medlemmer uden at få invitationskoden
    // udleveret i en svar-krop.
    const db = dbMedDoc({
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
    const db = dbMedDoc({ users: { menig: MENIG } });
    await expect(hentLigaMedlemmer(db, { uid: 'menig', gameId: 'g' })).rejects.toThrow('not-admin');
  });

  it('læser KUN det spurgte spil', async () => {
    const db = fakeDb({
      users: { adm: ADMIN, a: { displayName: 'Anne' }, b: { displayName: 'Bo' } },
      spil: {
        g1: { ligaer: { L1: { name: 'Ligaen i g1', ownerUid: 'a', memberUids: ['a'] } }, spillere: ['a'] },
        g2: { ligaer: { L2: { name: 'Ligaen i g2', ownerUid: 'b', memberUids: ['b'] } }, spillere: ['b'] },
      },
    });
    const r = await hentLigaMedlemmer(db, { uid: 'adm', gameId: 'g2' });
    expect(r.ligaer.map((l) => l.navn)).toEqual(['Ligaen i g2']);
    expect(r.deltagere.map((d) => d.navn)).toEqual(['Bo']);
    expect(JSON.stringify(r)).not.toContain('g1');
  });

  it('SORTERER ligaer og deltagere på navn — dansk', async () => {
    // Fixturet stod før i alfabetisk indsættelsesrækkefølge, så sorteringen
    // aldrig fik noget at rette: et bånd, der ikke kunne blive rødt.
    const db = dbMedDoc({
      users: {
        adm: ADMIN,
        u1: { displayName: 'Åse' }, u2: { displayName: 'Bo' }, u3: { displayName: 'Anne' },
      },
      ligaer: {
        Z: { name: 'Ærligt talt', ownerUid: 'u1', memberUids: ['u1', 'u2', 'u3'] },
        A: { name: 'Bagerst', ownerUid: 'u2', memberUids: ['u2'] },
      },
      spillere: ['u1', 'u2', 'u3'],
    });
    const r = await hentLigaMedlemmer(db, { uid: 'adm', gameId: 'g' });
    // Å sorterer SIDST på dansk, ikke først som i en ren kodepunkt-sortering.
    expect(r.ligaer.map((l) => l.navn)).toEqual(['Bagerst', 'Ærligt talt']);
    expect(r.deltagere.map((d) => d.navn)).toEqual(['Anne', 'Bo', 'Åse']);
    expect(r.ligaer[1].medlemmer.map((m) => m.navn)).toEqual(['Åse', 'Bo', 'Anne']);
  });

  it('AFKORTER et langt navn og et langt liganavn', async () => {
    const langtNavn = 'N'.repeat(120);
    const langtLiga = 'L'.repeat(200);
    const db = dbMedDoc({
      users: { adm: ADMIN, u1: { displayName: langtNavn } },
      ligaer: { L1: { name: langtLiga, ownerUid: 'u1', memberUids: ['u1'] } },
      spillere: ['u1'],
    });
    const r = await hentLigaMedlemmer(db, { uid: 'adm', gameId: 'g' });
    expect(r.ligaer[0].navn).toHaveLength(80);
    expect(r.ligaer[0].medlemmer[0].navn).toHaveLength(60);
  });

  it('afviser et spil, der ikke findes', async () => {
    const db = dbMedDoc({ users: { adm: ADMIN }, spilFindes: false });
    await expect(hentLigaMedlemmer(db, { uid: 'adm', gameId: 'x' })).rejects.toThrow('no-game');
  });

  it('falder tilbage på "Spiller" ved et ubrugeligt displayName', async () => {
    const db = dbMedDoc({
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
