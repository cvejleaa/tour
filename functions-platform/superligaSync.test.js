import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  outcomeFromScore, matchDocId, resultsUrl, syncResultsCore, pendingMatches, WINDOW_MS,
  standingsUrl, syncStandingsCore, runScheduledSync, strandedMatches,
} = require('./superligaSync');

const FieldValue = { serverTimestamp: () => '@ts' };

// Fake-Firestore: games/{g}/matches med get()/doc(id)/where() + batch.set/commit,
// og selve spil-dokumentet (stilling-synken sammenligner med det, der står).
function makeDb(matchDocs, gameData = {}) {
  const docs = new Map(matchDocs.map((m) => [m.id, { ...m.data }]));
  const spil = { ...gameData };
  const alle = () => [...docs.entries()].map(([id, data]) => ({ id, data: () => data }));
  // where() samler filtre op og anvender dem først ved get() — som Firestore.
  const medFiltre = (filtre) => ({
    where: (felt, op, vaerdi) => medFiltre([...filtre, { felt, op, vaerdi }]),
    async get() {
      const passer = (d) => filtre.every(({ felt, op, vaerdi }) => {
        const v = d.data()[felt];
        // Firestore udelader dokumenter uden feltet fra en range-query.
        if (v == null) return false;
        switch (op) {
          case '>=': return v >= vaerdi;
          case '<=': return v <= vaerdi;
          case '>': return v > vaerdi;
          case '<': return v < vaerdi;
          case '==': return v === vaerdi;
          // Faldt vi tilbage til lighed her, ville en mutation af >= til >
          // "dø" af den forkerte grund: to Date-objekter er aldrig strikt ens,
          // så ENHVER ukendt operator ville give tom liste og se rigtig ud.
          default: throw new Error(`faken kender ikke operatoren ${op}`);
        }
      });
      return { docs: alle().filter(passer) };
    },
  });
  const matchesCol = {
    async get() { return { docs: alle() }; },
    where: (felt, op, vaerdi) => medFiltre([{ felt, op, vaerdi }]),
    doc: (id) => ({ __id: id }),
  };
  const gameDoc = {
    collection: () => matchesCol,
    async get() { return { data: () => spil }; },
    async set(patch) { Object.assign(spil, patch); },
  };
  return {
    _spil: spil,
    collection(name) {
      if (name !== 'games') throw new Error(`uventet ${name}`);
      return {
        doc: (id) => {
          // Uden denne vagt er det usynligt for testene, om gameId overhovedet
          // bliver ført igennem — faken svarede ens på ethvert spil-id.
          if (id !== undefined && id !== 'superliga2627') throw new Error(`uventet spil ${id}`);
          return gameDoc;
        },
      };
    },
    batch() {
      return {
        _ops: [],
        set(ref, data) { this._ops.push({ id: ref.__id, data }); },
        async commit() {
          for (const op of this._ops) docs.set(op.id, { ...(docs.get(op.id) || {}), ...op.data });
        },
      };
    },
    _docs: docs,
  };
}

function fakeFetch(events, ok = true) {
  return async () => ({ ok, status: ok ? 200 : 500, json: async () => ({ events }) });
}

describe('outcomeFromScore', () => {
  it('mapper mål til 1X2', () => {
    expect(outcomeFromScore(2, 0)).toBe('1');
    expect(outcomeFromScore(1, 1)).toBe('X');
    expect(outcomeFromScore(1, 2)).toBe('2');
    expect(outcomeFromScore(null, 1)).toBeNull();
  });
});

describe('matchDocId', () => {
  it('genskaber seed-id-formatet (danske bogstaver)', () => {
    expect(matchDocId(1, 'Viborg FF', 'OB')).toBe('r1-viborgff-ob');
    expect(matchDocId(1, 'F.C. København', 'Lyngby Boldklub')).toBe('r1-fckobenhavn-lyngbyboldklub');
  });
  it('matcher superligaSeed.matchId', async () => {
    const seed = await import('../src/lib/superligaSeed.js');
    for (const [round, home, away] of [
      [1, 'Viborg FF', 'OB'], [5, 'Sønderjyske Fodbold', 'AGF'], [22, 'Brøndby IF', 'AC Horsens'],
    ]) {
      expect(matchDocId(round, home, away)).toBe(seed.matchId({ round, home, away }));
    }
  });
});

describe('resultsUrl', () => {
  it('indeholder sæson + status=finished', () => {
    const u = resultsUrl(35802);
    expect(u).toContain('seasonId=35802');
    expect(u).toContain('status=finished');
  });
});

describe('syncResultsCore', () => {
  it('sætter nye facit og springer uændrede over', async () => {
    const db = makeDb([
      { id: 'r1-viborgff-ob', data: { round: 1, home: 'Viborg FF', away: 'OB' } }, // intet facit
      // Allerede sat — MED mål, så der reelt intet er at opdatere.
      { id: 'r1-agf-brondbyif', data: { round: 1, home: 'AGF', away: 'Brøndby IF', result: '1', homeGoals: 2, awayGoals: 0 } },
    ]);
    const events = [
      { statusType: 'finished', round: 1, homeName: 'Viborg FF', awayName: 'OB', score: { home: 1, away: 2 } },
      { statusType: 'finished', round: 1, homeName: 'AGF', awayName: 'Brøndby IF', score: { home: 2, away: 0 } }, // uændret
    ];
    const res = await syncResultsCore(db, FieldValue, { fetchFn: fakeFetch(events) });
    expect(res.checked).toBe(2);
    expect(res.updated).toBe(1);
    expect(db._docs.get('r1-viborgff-ob').result).toBe('2'); // udesejr
    expect(db._docs.get('r1-viborgff-ob').homeGoals).toBe(1);
  });

  // Før sammenlignede guarden KUN på facit, så en rettet score med samme 1X2
  // aldrig kunne komme ind — heller ikke ved manuel synk. Usynligt dengang
  // målene ikke blev vist; synligt nu, hvor de står på kampkortet.
  it('retter en ÆNDRET score, selv om 1X2 er det samme', async () => {
    const db = makeDb([
      { id: 'r1-viborgff-ob', data: { round: 1, result: '1', homeGoals: 2, awayGoals: 1 } },
    ]);
    const events = [
      { statusType: 'finished', round: 1, homeName: 'Viborg FF', awayName: 'OB', score: { home: 3, away: 1 } },
    ];
    const res = await syncResultsCore(db, FieldValue, { fetchFn: fakeFetch(events) });
    expect(res.updated).toBe(1);
    expect(db._docs.get('r1-viborgff-ob').homeGoals).toBe(3);
    expect(db._docs.get('r1-viborgff-ob').result).toBe('1'); // facit uændret
  });

  // Spejlvendt af ovenstående: ude-halvdelen af guarden var ubevist, så
  // `cur.awayGoals === e.score.away` kunne fjernes uden en eneste rød test.
  it('retter en ændret score, når kun UDEholdets mål er rettet', async () => {
    const db = makeDb([
      { id: 'r1-viborgff-ob', data: { round: 1, result: '1', homeGoals: 3, awayGoals: 1 } },
    ]);
    const events = [
      { statusType: 'finished', round: 1, homeName: 'Viborg FF', awayName: 'OB', score: { home: 3, away: 2 } },
    ];
    const res = await syncResultsCore(db, FieldValue, { fetchFn: fakeFetch(events) });
    expect(res.updated).toBe(1);
    expect(db._docs.get('r1-viborgff-ob').awayGoals).toBe(2);
  });

  it('bagfylder mål på en kamp, der har facit men mangler dem', async () => {
    const db = makeDb([{ id: 'r1-viborgff-ob', data: { round: 1, result: '1' } }]);
    const events = [
      { statusType: 'finished', round: 1, homeName: 'Viborg FF', awayName: 'OB', score: { home: 2, away: 0 } },
    ];
    const res = await syncResultsCore(db, FieldValue, { fetchFn: fakeFetch(events) });
    expect(res.updated).toBe(1);
    expect(db._docs.get('r1-viborgff-ob').awayGoals).toBe(0);
  });

  // opts.only er dét, der gør ét kald i minuttet billigt: uden den læses alle
  // 132 kampdokumenter hver gang.
  it('læser IKKE hele sæsonen, når opts.only er givet', async () => {
    const db = makeDb([
      { id: 'r1-viborgff-ob', data: { round: 1 } },
      { id: 'r1-agf-brondbyif', data: { round: 1 } },
    ]);
    let heleSaesonenLaest = 0;
    const col = db.collection('games').doc().collection();
    const oprindelig = col.get.bind(col);
    col.get = async () => { heleSaesonenLaest += 1; return oprindelig(); };

    const events = [
      { statusType: 'finished', round: 1, homeName: 'Viborg FF', awayName: 'OB', score: { home: 1, away: 0 } },
      { statusType: 'finished', round: 1, homeName: 'AGF', awayName: 'Brøndby IF', score: { home: 0, away: 1 } },
    ];
    const res = await syncResultsCore(db, FieldValue, {
      fetchFn: fakeFetch(events),
      only: [{ id: 'r1-viborgff-ob', data: { round: 1 } }],
    });
    expect(heleSaesonenLaest).toBe(0);
    expect(res.updated).toBe(1);                                  // kun kampen i vinduet
    expect(db._docs.get('r1-agf-brondbyif').result).toBeUndefined();
  });

  it('ignorerer ukendte kampe og ikke-færdige', async () => {
    const db = makeDb([{ id: 'r1-viborgff-ob', data: { round: 1 } }]);
    const events = [
      { statusType: 'finished', round: 9, homeName: 'Ukendt', awayName: 'Hold', score: { home: 1, away: 0 } },
      { statusType: 'live', round: 1, homeName: 'Viborg FF', awayName: 'OB', score: { home: 0, away: 0 } },
    ];
    const res = await syncResultsCore(db, FieldValue, { fetchFn: fakeFetch(events) });
    expect(res.updated).toBe(0);
  });

  it('kaster ved API-fejl', async () => {
    const db = makeDb([]);
    await expect(syncResultsCore(db, FieldValue, { fetchFn: fakeFetch([], false) }))
      .rejects.toThrow(/HTTP 500/);
  });
});

// --- Officiel stilling-synk --------------------------------------------------
function makeGameDb() {
  const game = {};
  return {
    collection(name) {
      if (name !== 'games') throw new Error(`uventet ${name}`);
      return {
        doc: () => ({
          // get() bruges nu til at afgøre, om tabellen overhovedet har flyttet sig.
          get: async () => ({ data: () => game }),
          set: (data) => Object.assign(game, data),
        }),
      };
    },
    _game: game,
  };
}
const fakeStandingsFetch = (rows, ok = true) => async () => ({ ok, status: ok ? 200 : 500, json: async () => rows });

describe('syncStandingsCore (officiel stilling)', () => {
  it('bygger URL med stage + form', () => {
    const u = standingsUrl(35802, 935487);
    expect(u).toContain('/tournaments/46/standings');
    expect(u).toContain('seasonId=35802');
    expect(u).toContain('stageId=935487');
    expect(u).toContain('form=last5');
  });

  it('gemmer trimmet, rang-sorteret stilling på spillet', async () => {
    const db = makeGameDb();
    const rows = [
      { rank: 2, teamName: 'B', teamShortName: 'B', points: 1, matchesPlayed: 1, matchesWon: 0, matchesDraw: 1, matchesLost: 0, goalsScored: 1, goalsConceded: 1, rankType: 'championship_playoff' },
      { rank: 1, teamName: 'A', teamShortName: 'A', points: 3, matchesPlayed: 1, matchesWon: 1, matchesDraw: 0, matchesLost: 0, goalsScored: 2, goalsConceded: 0, rankType: 'championship_playoff' },
    ];
    const res = await syncStandingsCore(db, FieldValue, { fetchFn: fakeStandingsFetch(rows) });
    expect(res.rows).toBe(2);
    expect(db._game.standings.map((r) => r.teamName)).toEqual(['A', 'B']); // sorteret på rank
    expect(db._game.standings[0]).toMatchObject({ rank: 1, points: 3, played: 1, won: 1, gf: 2, ga: 0 });
  });

  it('kaster ved API-fejl', async () => {
    await expect(syncStandingsCore(makeGameDb(), FieldValue, { fetchFn: fakeStandingsFetch([], false) }))
      .rejects.toThrow(/HTTP 500/);
  });
});

// ---------------------------------------------------------------------------
// pendingMatches — det tidlige exit, der gør ét kald i minuttet billigere end
// det gamle kvarters-raster. Svarer den tomt, røres hverken API eller resten
// af databasen.
// ---------------------------------------------------------------------------
describe('pendingMatches', () => {
  const NU = Date.parse('2026-08-02T18:30:00Z');
  const kickoff = (minutterSiden) => new Date(NU - minutterSiden * 60000);

  it('finder en kamp, der er i gang og mangler facit', async () => {
    const db = makeDb([{ id: 'r1-a-b', data: { kickoff: kickoff(30) } }]);
    const venter = await pendingMatches(db, NU);
    expect(venter.map((m) => m.id)).toEqual(['r1-a-b']);
  });

  it('holder op med at spørge, så snart kampen HAR facit', async () => {
    const db = makeDb([{ id: 'r1-a-b', data: { kickoff: kickoff(30), result: '1' } }]);
    expect(await pendingMatches(db, NU)).toEqual([]);
  });

  it('ser bort fra kampe, der endnu ikke er sat i gang', async () => {
    const db = makeDb([{ id: 'r1-a-b', data: { kickoff: new Date(NU + 60 * 60000) } }]);
    expect(await pendingMatches(db, NU)).toEqual([]);
  });

  // ABSOLUT tid, ikke WINDOW_MS. Regnede fixturet ud fra konstanten selv, kunne
  // testen aldrig fejle — et vindue på 24 timer ville stå lige så grønt, og så
  // var hele besparelsen væk uden at nogen opdagede det.
  it('en kamp fra for 2 timer siden er stadig med', async () => {
    const db = makeDb([{ id: 'r1-a-b', data: { kickoff: kickoff(120) } }]);
    expect((await pendingMatches(db, NU)).map((m) => m.id)).toEqual(['r1-a-b']);
  });

  // Selve luften. Et vindue på præcis 2 timer ville stå grønt uden denne:
  // en kamp med lang tillægstid slutter efter 2 timer, og API'et er selv et
  // par minutter bagefter. Uden slæk ville sådan en kamp falde ud og først
  // blive afregnet af nattens sweep.
  it('en kamp med lang tillægstid er stadig med efter 2 timer og 20 minutter', async () => {
    const db = makeDb([{ id: 'r1-a-b', data: { kickoff: kickoff(140) } }]);
    expect((await pendingMatches(db, NU)).map((m) => m.id)).toEqual(['r1-a-b']);
  });

  it('en kamp fra for 3 timer siden er ude af vinduet', async () => {
    const db = makeDb([{ id: 'r1-a-b', data: { kickoff: kickoff(180) } }]);
    expect(await pendingMatches(db, NU)).toEqual([]);
  });

  // Begge grænser er INKLUSIVE (>= og <=). Uden disse to kunne >= byttes til >
  // uden at noget blev rødt.
  it('tager en kamp, der begynder præcis nu', async () => {
    const db = makeDb([{ id: 'r1-a-b', data: { kickoff: new Date(NU) } }]);
    expect((await pendingMatches(db, NU)).map((m) => m.id)).toEqual(['r1-a-b']);
  });

  it('tager en kamp, der ligger præcis på vinduets bagkant', async () => {
    const db = makeDb([{ id: 'r1-a-b', data: { kickoff: new Date(NU - WINDOW_MS) } }]);
    expect((await pendingMatches(db, NU)).map((m) => m.id)).toEqual(['r1-a-b']);
  });

  it('ser bort fra en kamp helt uden kickoff-felt', async () => {
    // Firestore udelader dokumenter uden feltet fra en range-query. Sådan en
    // kamp fanges kun af sweep'et — derfor findes sweep'et.
    const db = makeDb([{ id: 'r1-a-b', data: { round: 1 } }]);
    expect(await pendingMatches(db, NU)).toEqual([]);
  });

  it('tæller tomt facit som manglende facit', async () => {
    const db = makeDb([{ id: 'r1-a-b', data: { kickoff: kickoff(30), result: '' } }]);
    expect((await pendingMatches(db, NU)).map((m) => m.id)).toEqual(['r1-a-b']);
  });
});

// ---------------------------------------------------------------------------
// Stilling-synken skriver til spil-dokumentet, som HVER åben browser lytter på
// (useGame). En skrivning uden ændring koster derfor én læsning pr. klient.
// ---------------------------------------------------------------------------
describe('syncStandingsCore — skriver kun ved ændring', () => {
  const raekker = [
    { rank: 1, teamName: 'F.C. København', points: 6, matchesPlayed: 2 },
    { rank: 2, teamName: 'AGF', points: 3, matchesPlayed: 2 },
  ];
  const fetchStanding = (rows) => async () => ({ ok: true, status: 200, json: async () => rows });

  it('skriver tabellen første gang', async () => {
    const db = makeDb([]);
    const res = await syncStandingsCore(db, FieldValue, { fetchFn: fetchStanding(raekker) });
    expect(res).toEqual({ rows: 2, changed: true });
    expect(db._spil.standings[0].teamName).toBe('F.C. København');
  });

  it('rører IKKE dokumentet, når tabellen er uændret', async () => {
    const db = makeDb([]);
    await syncStandingsCore(db, FieldValue, { fetchFn: fetchStanding(raekker) });
    const foer = db._spil.standingsSyncedAt;
    db._spil.standingsSyncedAt = 'urørt';

    const res = await syncStandingsCore(db, FieldValue, { fetchFn: fetchStanding(raekker) });
    expect(res.changed).toBe(false);
    expect(db._spil.standingsSyncedAt).toBe('urørt'); // ingen skrivning
    expect(foer).toBe('@ts');
  });

  // Det almindeligste tilfælde: samme point, anden målscore (3-0 mod 1-0).
  // Uden denne kunne gf/ga falde ud af sammenligningen ubemærket.
  it('skriver igen, når kun målscoren har flyttet sig', async () => {
    const db = makeDb([]);
    await syncStandingsCore(db, FieldValue, { fetchFn: fetchStanding(raekker) });
    db._spil.standingsSyncedAt = 'urørt';

    const nye = [{ ...raekker[0], goalsScored: 7 }, raekker[1]];
    const res = await syncStandingsCore(db, FieldValue, { fetchFn: fetchStanding(nye) });
    expect(res.changed).toBe(true);
    expect(db._spil.standingsSyncedAt).toBe('@ts');
  });

  it('skriver igen, når et hold har fået point', async () => {
    const db = makeDb([]);
    await syncStandingsCore(db, FieldValue, { fetchFn: fetchStanding(raekker) });
    db._spil.standingsSyncedAt = 'urørt';

    const nye = [{ ...raekker[0], points: 9 }, raekker[1]];
    const res = await syncStandingsCore(db, FieldValue, { fetchFn: fetchStanding(nye) });
    expect(res.changed).toBe(true);
    expect(db._spil.standingsSyncedAt).toBe('@ts');
  });
});

// ---------------------------------------------------------------------------
// runScheduledSync — én skemalagt kørsel. Rækkefølgen ER besparelsen, så den
// skal bevises: et stille minut må hverken ringe til API'et eller røre noget.
// ---------------------------------------------------------------------------
describe('runScheduledSync', () => {
  const NU = Date.parse('2026-08-02T18:30:00Z');
  const iGang = new Date(NU - 30 * 60000);

  /** Fetch der svarer på BEGGE endpoints og tæller kaldene pr. slags. */
  function fakeApi({ events = [], standings = [] } = {}) {
    const kald = { resultater: 0, stilling: 0 };
    const fn = async (url) => {
      if (String(url).includes('/standings')) {
        kald.stilling += 1;
        return { ok: true, status: 200, json: async () => standings };
      }
      kald.resultater += 1;
      return { ok: true, status: 200, json: async () => ({ events }) };
    };
    fn.kald = kald;
    return fn;
  }

  it('rører INTET, når ingen kamp er i gang', async () => {
    const db = makeDb([{ id: 'r1-a-b', data: { kickoff: new Date(NU + 3600e3) } }]);
    const fetchFn = fakeApi();
    const out = await runScheduledSync(db, FieldValue, NU, { fetchFn });
    expect(out).toEqual({ pending: 0, updated: 0, standings: null, fejl: null });
    expect(fetchFn.kald).toEqual({ resultater: 0, stilling: 0 }); // ingen API-kald
  });

  it('rører INTET, når kampene i gang allerede har facit', async () => {
    const db = makeDb([{ id: 'r1-a-b', data: { kickoff: iGang, result: '1' } }]);
    const fetchFn = fakeApi();
    await runScheduledSync(db, FieldValue, NU, { fetchFn });
    expect(fetchFn.kald.resultater).toBe(0);
  });

  it('henter resultater, når en kamp er i gang uden facit', async () => {
    const db = makeDb([
      { id: 'r1-viborgff-ob', data: { round: 1, kickoff: iGang } },
    ]);
    const fetchFn = fakeApi({
      events: [{ statusType: 'finished', round: 1, homeName: 'Viborg FF', awayName: 'OB', score: { home: 2, away: 1 } }],
      standings: [{ rank: 1, teamName: 'Viborg FF', points: 3, matchesPlayed: 1 }],
    });
    const out = await runScheduledSync(db, FieldValue, NU, { fetchFn });
    expect(out.updated).toBe(1);
    expect(db._docs.get('r1-viborgff-ob')).toMatchObject({ result: '1', homeGoals: 2, awayGoals: 1 });
    expect(out.standings.changed).toBe(true);
  });

  // Uden at `only` sendes videre, læser syncResultsCore hele sæsonen — og
  // skriver så også kampe, der ligger helt uden for vinduet. Det er både
  // regningen (132 læsninger pr. minut) og en overraskelse: en gammel kamp
  // kunne pludselig blive afregnet midt i en anden runde.
  it('rører KUN kampene i vinduet — ikke resten af sæsonen', async () => {
    const db = makeDb([
      { id: 'r1-viborgff-ob', data: { round: 1, kickoff: iGang } },
      { id: 'r1-agf-brondbyif', data: { round: 1, kickoff: new Date(NU - 30 * 86400e3) } },
    ]);
    const fetchFn = fakeApi({
      events: [
        { statusType: 'finished', round: 1, homeName: 'Viborg FF', awayName: 'OB', score: { home: 2, away: 1 } },
        { statusType: 'finished', round: 1, homeName: 'AGF', awayName: 'Brøndby IF', score: { home: 0, away: 3 } },
      ],
      standings: [{ rank: 1, teamName: 'Viborg FF', points: 3, matchesPlayed: 1 }],
    });
    const out = await runScheduledSync(db, FieldValue, NU, { fetchFn });
    expect(out.updated).toBe(1);
    expect(db._docs.get('r1-viborgff-ob').result).toBe('1');
    expect(db._docs.get('r1-agf-brondbyif').result).toBeUndefined();
  });

  // Stillingen kan kun have flyttet sig, hvis en kamp lige blev afgjort.
  it('springer stillingen over, når intet facit landede', async () => {
    const db = makeDb([{ id: 'r1-viborgff-ob', data: { round: 1, kickoff: iGang } }]);
    const fetchFn = fakeApi({ events: [] }); // kampen er ikke færdig endnu
    const out = await runScheduledSync(db, FieldValue, NU, { fetchFn });
    expect(out.updated).toBe(0);
    expect(out.standings).toBeNull();
    expect(fetchFn.kald).toEqual({ resultater: 1, stilling: 0 });
  });

  it('fejler tavst, når kilden er nede', async () => {
    const db = makeDb([{ id: 'r1-a-b', data: { round: 1, kickoff: iGang } }]);
    const nede = async () => ({ ok: false, status: 503, json: async () => ({}) });
    const out = await runScheduledSync(db, FieldValue, NU, { fetchFn: nede });
    expect(out.fejl).toMatch(/resultater/);
    expect(out.updated).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// De fejl-tavse grene i runScheduledSync. "Fejler tavst" må ikke betyde
// "fejler usynligt" — derfor skal hver gren rapportere sig.
// ---------------------------------------------------------------------------
describe('runScheduledSync — fejl i hvert led', () => {
  const NU = Date.parse('2026-08-02T18:30:00Z');
  const iGang = new Date(NU - 30 * 60000);

  it('et fejlende opslag vælter ikke kørslen', async () => {
    const db = makeDb([{ id: 'r1-a-b', data: { kickoff: iGang } }]);
    db.collection('games').doc().collection().where = () => ({
      where: () => ({ get: async () => { throw new Error('databasen svarer ikke'); } }),
    });
    const out = await runScheduledSync(db, FieldValue, NU, { fetchFn: async () => { throw new Error('må ikke kaldes'); } });
    expect(out.fejl).toMatch(/opslag/);
    expect(out.pending).toBe(0);
  });

  it('en nede stilling skjuler ikke, at facit landede', async () => {
    const db = makeDb([{ id: 'r1-viborgff-ob', data: { round: 1, kickoff: iGang } }]);
    const fetchFn = async (url) => {
      if (String(url).includes('/standings')) return { ok: false, status: 503, json: async () => [] };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          events: [{ statusType: 'finished', round: 1, homeName: 'Viborg FF', awayName: 'OB', score: { home: 2, away: 1 } }],
        }),
      };
    };
    const out = await runScheduledSync(db, FieldValue, NU, { fetchFn });
    expect(out.updated).toBe(1);              // facit landede
    expect(out.fejl).toMatch(/stilling/);     // men vi hører om stillingen
    expect(db._docs.get('r1-viborgff-ob').result).toBe('1');
  });
});

// ---------------------------------------------------------------------------
// strandedMatches — alarmen. Minut-synken ser kun ind i sit vindue, så uden
// denne ville "ingen kampe i gang" og "kampen bliver aldrig afregnet" se ens
// ud. Puljebonussen kræver mål på ALLE kampe, så én strandet kamp blokerer
// hele sæsonafregningen.
// ---------------------------------------------------------------------------
describe('strandedMatches', () => {
  const NU = Date.parse('2026-08-02T18:30:00Z');
  const forSiden = (t) => new Date(NU - t * 3600e3);

  it('finder en kamp, der for længst er begyndt uden at få facit', async () => {
    const db = makeDb([{ id: 'r1-a-b', data: { kickoff: forSiden(5) } }]);
    expect((await strandedMatches(db, NU)).map((m) => m.id)).toEqual(['r1-a-b']);
  });

  it('råber ikke op om en kamp, der stadig er i gang', async () => {
    const db = makeDb([{ id: 'r1-a-b', data: { kickoff: forSiden(1) } }]);
    expect(await strandedMatches(db, NU)).toEqual([]);
  });

  it('råber ikke op om en kamp, der HAR fået facit', async () => {
    const db = makeDb([{ id: 'r1-a-b', data: { kickoff: forSiden(5), result: '1' } }]);
    expect(await strandedMatches(db, NU)).toEqual([]);
  });

  it('råber ikke op om kampe, der ikke er spillet endnu', async () => {
    const db = makeDb([{ id: 'r1-a-b', data: { kickoff: new Date(NU + 3600e3) } }]);
    expect(await strandedMatches(db, NU)).toEqual([]);
  });

  // Uden kickoff kan kampen aldrig komme i et vindue — den ville stå strandet
  // for evigt, og minut-synken ville aldrig se den.
  it('tager en kamp helt uden kickoff med', async () => {
    const db = makeDb([{ id: 'r1-a-b', data: { round: 1 } }]);
    expect((await strandedMatches(db, NU)).map((m) => m.id)).toEqual(['r1-a-b']);
  });

  it('forstår et Firestore-Timestamp lige så godt som en Date', async () => {
    const ms = NU - 5 * 3600e3;
    const db = makeDb([{ id: 'r1-a-b', data: { kickoff: { toMillis: () => ms } } }]);
    expect((await strandedMatches(db, NU)).map((m) => m.id)).toEqual(['r1-a-b']);
  });

  it('tæller tomt facit som manglende', async () => {
    const db = makeDb([{ id: 'r1-a-b', data: { kickoff: forSiden(5), result: '' } }]);
    expect((await strandedMatches(db, NU)).map((m) => m.id)).toEqual(['r1-a-b']);
  });
});

// ---------------------------------------------------------------------------
// Skemaet mod kampprogrammet.
//
// Cron-udtrykkene er den ene ting, ingen enhedstest normalt rører — og fejlen
// ville være tavs: en kamp uden for tidsrummet får aldrig sit facit fra
// minut-synken. Læses som TEKST ud af index.js, fordi filen ikke kan
// importeres uden firebase-functions.
// ---------------------------------------------------------------------------
describe('skemaet dækker kampprogrammet', () => {
  const fs = require('fs');
  const path = require('path');
  const kilde = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
  const fixtures = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'scripts', 'superliga-fixtures.json'), 'utf8'),
  ).fixtures;

  /** Timerne i et cron-felt som "12-23" eller "*". */
  function cronTimer(udtryk) {
    const felt = udtryk.split(' ')[1];
    if (felt === '*') return { fra: 0, til: 23 };
    const [fra, til] = felt.split('-').map(Number);
    return { fra, til: til ?? fra };
  }
  const skema = (navn) => {
    const m = kilde.match(new RegExp(`exports\\.${navn} = onSchedule\\(\\s*\\{ schedule: '([^']+)'`));
    if (!m) throw new Error(`fandt ikke skemaet for ${navn} — er funktionen omdøbt?`);
    return m[1];
  };

  /** Time på døgnet i dansk tid (sommertid marts-oktober). */
  const dkTime = (iso) => {
    const t = new Date(iso);
    const off = t.getUTCMonth() > 2 && t.getUTCMonth() < 10 ? 2 : 1;
    return new Date(t.getTime() + off * 3600e3).getUTCHours();
  };

  it('kampprogrammet findes og er komplet', () => {
    expect(fixtures.length).toBe(132);
    expect(fixtures.every((f) => f.kickoff)).toBe(true);
  });

  it('hver kamp begynder inden for minut-synkens tidsrum', () => {
    const { fra, til } = cronTimer(skema('syncSuperligaResults'));
    const udenfor = fixtures.filter((f) => dkTime(f.kickoff) < fra || dkTime(f.kickoff) > til);
    expect(udenfor.map((f) => `${f.home}-${f.away} ${f.kickoff}`)).toEqual([]);
  });

  // Bagkanten er den asymmetriske: et vindue, der klippes ved midnat, betyder
  // at kampen først fanges af sweep'et næste dag.
  it('hvert kampvindue LUKKER også inden for tidsrummet', () => {
    const { til } = cronTimer(skema('syncSuperligaResults'));
    const klippet = fixtures.filter((f) => {
      const slut = new Date(new Date(f.kickoff).getTime() + WINDOW_MS);
      // Krydser vinduet midnat, er dagens sidste kørsel passeret.
      return dkTime(slut.toISOString()) > til || dkTime(slut.toISOString()) < dkTime(f.kickoff);
    });
    expect(klippet.map((f) => `${f.home}-${f.away} ${f.kickoff}`)).toEqual([]);
  });

  it('sweep\'et kører efter dagens sidste kampvindue', () => {
    const senesteSlut = Math.max(...fixtures.map(
      (f) => dkTime(new Date(new Date(f.kickoff).getTime() + WINDOW_MS).toISOString()),
    ));
    const { til } = cronTimer(skema('syncSuperligaSweep'));
    expect(til).toBeGreaterThanOrEqual(senesteSlut);
  });
});

// Et hængende kald mod tredjeparten holder funktionen kørende, til dens egen
// timeout løber ud — og vi ringer nu 15 gange så ofte som før.
describe('kald mod api.superliga.dk giver op i tide', () => {
  /** Fanger de options, fetch bliver kaldt med. */
  function sporFetch(svar) {
    const set = [];
    const fn = async (_url, opt) => { set.push(opt); return svar; };
    fn.options = set;
    return fn;
  }

  it('resultat-kaldet har en timeout', async () => {
    const fetchFn = sporFetch({ ok: true, status: 200, json: async () => ({ events: [] }) });
    await syncResultsCore(makeDb([]), FieldValue, { fetchFn });
    expect(fetchFn.options[0]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('stilling-kaldet har en timeout', async () => {
    const fetchFn = sporFetch({ ok: true, status: 200, json: async () => [] });
    await syncStandingsCore(makeDb([]), FieldValue, { fetchFn });
    expect(fetchFn.options[0]?.signal).toBeInstanceOf(AbortSignal);
  });

  // Et delt signal ville starte uret ved modul-indlæsning og derefter afbryde
  // hvert eneste kald — funktionen skal lave et nyt pr. gang.
  it('hvert kald får sit EGET signal', async () => {
    const fetchFn = sporFetch({ ok: true, status: 200, json: async () => ({ events: [] }) });
    const db = makeDb([]);
    await syncResultsCore(db, FieldValue, { fetchFn });
    await syncResultsCore(db, FieldValue, { fetchFn });
    expect(fetchFn.options[0].signal).not.toBe(fetchFn.options[1].signal);
  });
});
