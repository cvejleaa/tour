import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  outcomeFromScore, matchDocId, resultsUrl, syncResultsCore, pendingMatches, WINDOW_MS,
  liveUrl, liveStatus, syncLiveCore,
  standingsUrl, syncStandingsCore, runScheduledSync, strandedMatches,
} = require('./superligaSync');

// '@delete' står for FieldValue.delete(). Faken fjerner ikke feltet, men
// sentinel-værdien gør det synligt i testene, at rydningen FAKTISK sendes med.
const FieldValue = { serverTimestamp: () => '@ts', delete: () => '@delete' };

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
    async set(patch, opts) {
      // Uden merge OVERSKRIVER Firestore hele dokumentet. På spil-dokumentet
      // ville det slette navn, teamStyles, standings … hvert minut, der
      // spilles. Faken skal derfor mærke det, ikke bare flette alligevel.
      if (opts?.merge !== true) throw new Error('set() uden { merge: true } ville overskrive spil-dokumentet');
      Object.assign(spil, patch);
    },
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
        set(ref, data, opts) {
          // Samme her: uden merge ville en live-skrivning slette kickoff,
          // odds og holdnavnene på hver kamp i gang.
          if (opts?.merge !== true) throw new Error('batch.set() uden { merge: true } ville overskrive kampdokumentet');
          this._ops.push({ id: ref.__id, data });
        },
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

  // Sweep'et bruger listen til at lade være med at melde en kamp strandet i
  // samme åndedrag, som den lige har reddet den. Uden id'erne måtte det hente
  // et friskt billede af alle 132 kampe.
  it('fortæller HVILKE kampe der fik facit', async () => {
    const db = makeDb([
      { id: 'r1-viborgff-ob', data: { round: 1 } },
      { id: 'r1-agf-brondbyif', data: { round: 1, result: '1', homeGoals: 2, awayGoals: 0 } },
    ]);
    const events = [
      { statusType: 'finished', round: 1, homeName: 'Viborg FF', awayName: 'OB', score: { home: 1, away: 0 } },
      { statusType: 'finished', round: 1, homeName: 'AGF', awayName: 'Brøndby IF', score: { home: 2, away: 0 } },
    ];
    const res = await syncResultsCore(db, FieldValue, { fetchFn: fakeFetch(events) });
    expect(res.rettede).toEqual(['r1-viborgff-ob']);   // kun den, der faktisk ændrede sig
    expect(res.updated).toBe(res.rettede.length);
  });

  it('melder ingen rettede, når intet ændrede sig', async () => {
    const db = makeDb([
      { id: 'r1-viborgff-ob', data: { round: 1, result: '1', homeGoals: 1, awayGoals: 0 } },
    ]);
    const events = [
      { statusType: 'finished', round: 1, homeName: 'Viborg FF', awayName: 'OB', score: { home: 1, away: 0 } },
    ];
    expect((await syncResultsCore(db, FieldValue, { fetchFn: fakeFetch(events) })).rettede).toEqual([]);
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

  /** Fetch der svarer på ALLE TRE endpoints og tæller kaldene pr. slags. */
  function fakeApi({ events = [], live = [], standings = [] } = {}) {
    const kald = { resultater: 0, live: 0, stilling: 0 };
    const fn = async (url) => {
      const u = String(url);
      if (u.includes('/standings')) {
        kald.stilling += 1;
        return { ok: true, status: 200, json: async () => standings };
      }
      if (u.includes('status=inprogress')) {
        kald.live += 1;
        return { ok: true, status: 200, json: async () => ({ events: live }) };
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
    expect(out).toEqual({ pending: 0, updated: 0, live: null, standings: null, fejl: null });
    expect(fetchFn.kald).toEqual({ resultater: 0, live: 0, stilling: 0 }); // ingen API-kald
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

  // Listen `venter` er hentet FØR gen-synken. Får en kamp facit i samme
  // kørsel, mens live-endpointet stadig melder den i gang — hvilket er
  // realistisk, de to opdateres ikke samtidig — ville vi uden filteret skrive
  // en live-stilling oven på en kamp, der lige er afgjort. Kortet ville sige
  // "DIREKTE" om en færdig kamp.
  it('skriver IKKE live på en kamp, der lige har fået facit', async () => {
    const db = makeDb([{ id: 'r1-viborgff-ob', data: { round: 1, kickoff: iGang } }]);
    const fetchFn = fakeApi({
      events: [{ statusType: 'finished', round: 1, homeName: 'Viborg FF', awayName: 'OB', score: { home: 2, away: 1 } }],
      live: [{ statusType: 'inprogress', round: 1, homeName: 'Viborg FF', awayName: 'OB', score: { home: 2, away: 1 }, statusFull: '2nd half' }],
      standings: [{ rank: 1, teamName: 'Viborg FF', points: 3, matchesPlayed: 1 }],
    });
    const out = await runScheduledSync(db, FieldValue, NU, { fetchFn });
    expect(out.updated).toBe(1);
    expect(out.live.skrevet).toBe(0);
    const dok = db._docs.get('r1-viborgff-ob');
    expect(dok.result).toBe('1');
    expect(dok.live).toBe('@delete');   // ryddet af facit-skrivningen, ikke genskabt
  });

  // Stillingen kan kun have flyttet sig, hvis en kamp lige blev afgjort.
  it('springer stillingen over, når intet facit landede', async () => {
    const db = makeDb([{ id: 'r1-viborgff-ob', data: { round: 1, kickoff: iGang } }]);
    const fetchFn = fakeApi({ events: [] }); // kampen er ikke færdig endnu
    const out = await runScheduledSync(db, FieldValue, NU, { fetchFn });
    expect(out.updated).toBe(0);
    expect(out.standings).toBeNull();
    // Live spørges der stadig om — det er netop en kamp midt i spillet.
    expect(fetchFn.kald).toEqual({ resultater: 1, live: 1, stilling: 0 });
  });

  // Doc-kommentaren lover, at et fejlende led ikke forhindrer det næste i at
  // prøve. Det var bevist for resultat-leddet, ikke for live.
  it('henter stadig live, når resultat-kaldet fejler', async () => {
    const db = makeDb([{ id: 'r1-viborgff-ob', data: { round: 1, kickoff: iGang } }]);
    const fetchFn = async (url) => {
      const u = String(url);
      if (u.includes('status=inprogress')) {
        return { ok: true, status: 200, json: async () => ({ events: [
          { statusType: 'inprogress', round: 1, homeName: 'Viborg FF', awayName: 'OB', score: { home: 1, away: 0 }, statusFull: '1st half' },
        ] }) };
      }
      return { ok: false, status: 503, json: async () => ({}) };
    };
    const out = await runScheduledSync(db, FieldValue, NU, { fetchFn });
    expect(out.fejl).toMatch(/resultater/);
    expect(out.live.skrevet).toBe(1);                       // live kom alligevel igennem
    expect(db._docs.get('r1-viborgff-ob').live.home).toBe(1);
  });

  it('melder en live-fejl, uden at vælte kørslen', async () => {
    const db = makeDb([{ id: 'r1-viborgff-ob', data: { round: 1, kickoff: iGang } }]);
    const fetchFn = async (url) => {
      if (String(url).includes('status=inprogress')) return { ok: false, status: 503, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ events: [] }) };
    };
    const out = await runScheduledSync(db, FieldValue, NU, { fetchFn });
    expect(out.fejl).toMatch(/live/);
    expect(out.live).toBeNull();
  });

  // out.live er dét, index.js logger — tabes den i det tidlige exit, står der
  // ingenting i loggen om en kamp, der kører.
  it('bærer live-tallene med ud, også når intet facit landede', async () => {
    const db = makeDb([{ id: 'r1-viborgff-ob', data: { round: 1, kickoff: iGang } }]);
    const fetchFn = fakeApi({
      events: [],
      live: [{ statusType: 'inprogress', round: 1, homeName: 'Viborg FF', awayName: 'OB', score: { home: 0, away: 1 }, statusFull: '2nd half' }],
    });
    const out = await runScheduledSync(db, FieldValue, NU, { fetchFn });
    expect(out.updated).toBe(0);
    expect(out.live).toEqual({ live: 1, skrevet: 1 });
  });

  it('bruger den tid, den får ind — ikke uret', async () => {
    const db = makeDb([{ id: 'r1-viborgff-ob', data: { round: 1, kickoff: iGang } }]);
    const fetchFn = fakeApi({
      events: [],
      live: [{ statusType: 'inprogress', round: 1, homeName: 'Viborg FF', awayName: 'OB', score: { home: 0, away: 0 }, statusFull: '1st half' }],
    });
    await runScheduledSync(db, FieldValue, NU, { fetchFn });
    expect(db._docs.get('r1-viborgff-ob').live.at).toBe(NU);
    expect(db._spil.liveHeartbeatAt).toBe(NU);
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
  /** Ren funktion: sweep'et deler ét opslag mellem gen-synken og alarmen. */
  const strandet = (data) => strandedMatches([{ id: 'r1-a-b', data }], NU).map((m) => m.id);

  it('finder en kamp, der for længst er begyndt uden at få facit', () => {
    expect(strandet({ kickoff: forSiden(5) })).toEqual(['r1-a-b']);
  });

  it('råber ikke op om en kamp, der stadig er i gang', () => {
    expect(strandet({ kickoff: forSiden(1) })).toEqual([]);
  });

  it('råber ikke op om en kamp, der HAR fået facit', () => {
    expect(strandet({ kickoff: forSiden(5), result: '1' })).toEqual([]);
  });

  it('råber ikke op om kampe, der ikke er spillet endnu', () => {
    expect(strandet({ kickoff: new Date(NU + 3600e3) })).toEqual([]);
  });

  it('forstår et Firestore-Timestamp lige så godt som en Date', () => {
    expect(strandet({ kickoff: { toMillis: () => NU - 5 * 3600e3 } })).toEqual(['r1-a-b']);
  });

  it('tæller tomt facit som manglende', () => {
    expect(strandet({ kickoff: forSiden(5), result: '' })).toEqual(['r1-a-b']);
  });

  // Alt, vi ikke kan læse et tidspunkt ud af, skal RAPPORTERES. Fejler alarmen
  // den anden vej, tier den netop dér, hvor data ser mistænkelige ud — og en
  // kamp med ubrugeligt kickoff kan aldrig komme i et vindue, så den ville
  // stå uafregnet for evigt.
  it.each([
    ['helt uden kickoff-felt', { round: 1 }],
    ['kickoff: null', { kickoff: null }],
    ['kickoff: tom streng', { kickoff: '' }],
    ['kickoff: uparsebar tekst', { kickoff: 'i går' }],
    ['kickoff: råt {_seconds}-objekt fra en backup', { kickoff: { _seconds: 1 } }],
  ])('råber op om en kamp med %s', (_navn, data) => {
    expect(strandet(data)).toEqual(['r1-a-b']);
  });

  it('sorterer kun de strandede fra en blandet liste', () => {
    const kampe = [
      { id: 'gammel-uden-facit', data: { kickoff: forSiden(5) } },
      { id: 'gammel-med-facit', data: { kickoff: forSiden(5), result: 'X' } },
      { id: 'i-gang', data: { kickoff: forSiden(1) } },
      { id: 'uden-kickoff', data: { round: 3 } },
    ];
    expect(strandedMatches(kampe, NU).map((m) => m.id))
      .toEqual(['gammel-uden-facit', 'uden-kickoff']);
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

// ---------------------------------------------------------------------------
// Skemaet mod kampprogrammet.
//
// Cron-udtrykkene er det eneste her, ingen enhedstest normalt rører — og
// fejlen ville være tavs: en kamp uden for tidsrummet får aldrig sit facit
// fra minut-synken. Læses som TEKST ud af index.js, fordi filen ikke kan
// importeres uden firebase-functions.
// ---------------------------------------------------------------------------
describe('skemaet dækker kampprogrammet', () => {
  const fs = require('fs');
  const path = require('path');
  const kilde = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
  const fixtures = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'scripts', 'superliga-fixtures.json'), 'utf8'),
  ).fixtures;

  const skema = (navn) => {
    const m = kilde.match(new RegExp(`exports\\.${navn} = onSchedule\\(\\s*\\{ schedule: '([^']+)'`));
    if (!m) throw new Error(`fandt ikke skemaet for ${navn} — er funktionen omdøbt?`);
    return m[1];
  };
  /** Alle timer, et cron-timefelt dækker ("12-23", "2,13-23", "*"). */
  const timer = (udtryk) => {
    const felt = udtryk.split(' ')[1];
    if (felt === '*') return Array.from({ length: 24 }, (_, i) => i);
    return felt.split(',').flatMap((del) => {
      if (!del.includes('-')) return [Number(del)];
      const [fra, til] = del.split('-').map(Number);
      return Array.from({ length: til - fra + 1 }, (_, i) => fra + i);
    }).sort((a, b) => a - b);
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
    const t = timer(skema('syncSuperligaResults'));
    const udenfor = fixtures.filter((f) => !t.includes(dkTime(f.kickoff)));
    expect(udenfor.map((f) => `${f.home}-${f.away} ${f.kickoff}`)).toEqual([]);
  });

  // Bagkanten er den asymmetriske: et vindue, der klippes ved midnat, betyder
  // at kampen først fanges af sweep'et.
  it('hvert kampvindue LUKKER også inden for tidsrummet', () => {
    const t = timer(skema('syncSuperligaResults'));
    const sidste = Math.max(...t);
    const klippet = fixtures.filter((f) => {
      const slut = new Date(new Date(f.kickoff).getTime() + WINDOW_MS).toISOString();
      return dkTime(slut) > sidste || dkTime(slut) < dkTime(f.kickoff);
    });
    expect(klippet.map((f) => `${f.home}-${f.away} ${f.kickoff}`)).toEqual([]);
  });

  it('sweep\'et kører efter dagens sidste kampvindue', () => {
    const senesteSlut = Math.max(...fixtures.map(
      (f) => dkTime(new Date(new Date(f.kickoff).getTime() + WINDOW_MS).toISOString()),
    ));
    expect(Math.max(...timer(skema('syncSuperligaSweep')))).toBeGreaterThanOrEqual(senesteSlut);
  });

  // Nattevagten. Uden en time efter midnat ville en kamp, der bliver færdig
  // kl. 00.30, vente fra 23.25 til 13.25 — og det er præcis det scenarie,
  // sweep'et findes for. Måles som det største hul mellem to kørsler.
  it('der går aldrig mere end 12 timer mellem to sweep', () => {
    const t = timer(skema('syncSuperligaSweep'));
    const huller = t.map((time, i) => (i === 0
      ? time + 24 - t[t.length - 1]   // hullet hen over midnat
      : time - t[i - 1]));
    expect(Math.max(...huller)).toBeLessThanOrEqual(12);
  });
});

// ---------------------------------------------------------------------------
// Levende stilling.
//
// Den ufravigelige regel: live-skrivningen må ALDRIG røre result, homeGoals,
// awayGoals eller status. matchOutcome() i gameScoring udleder facit FRA
// MÅLENE, når result mangler — en levende 1-0 i homeGoals ville flytte Elo på
// en halvlegsstilling, standse friske odds og få runden til at se afgjort ud,
// hvorefter snapshotRoundRanks og Runde-Botten fyrer idempotent. Det rigtige
// snapshot ville aldrig blive taget.
// ---------------------------------------------------------------------------
describe('liveUrl', () => {
  it('spørger kun om kampe, der er i gang', () => {
    const u = liveUrl(35802);
    expect(u).toContain('seasonId=35802');
    expect(u).toContain('status=inprogress');
    // Ikke det samme kald som resultaterne — ellers ville sweep'et og den
    // manuelle synk komme til at skrive live-felter på hele sæsonen.
    expect(u).not.toContain('status=finished');
  });
});

describe('liveStatus', () => {
  it('oversætter halvlegene til dansk', () => {
    expect(liveStatus('1st half')).toBe('foerste');
    expect(liveStatus('Halftime')).toBe('pause');
    expect(liveStatus('2nd half')).toBe('anden');
  });

  it('er ligeglad med store bogstaver og mellemrum', () => {
    expect(liveStatus('  2ND HALF ')).toBe('anden');
  });

  // En afbrudt kamp har stadig statusType 'inprogress'. Kaldte vi den
  // "DIREKTE", ville vi påstå, der spilles.
  it('skelner en AFBRUDT kamp fra en, der er i gang', () => {
    expect(liveStatus('Abandoned')).toBe('afbrudt');
    expect(liveStatus('Interrupted')).toBe('afbrudt');
    expect(liveStatus('Postponed')).toBe('afbrudt');
  });

  it('falder tilbage til "ukendt" i stedet for at vælte', () => {
    expect(liveStatus('Sudden Death')).toBe('ukendt');
    expect(liveStatus(undefined)).toBe('ukendt');
    expect(liveStatus('')).toBe('ukendt');
  });
});

describe('syncLiveCore', () => {
  const NU = 1_754_150_000_000;
  const kamp = { id: 'r2-brondbyif-viborgff', data: { round: 2 } };
  const hændelse = (score, statusFull = '1st half') => ({
    statusType: 'inprogress', round: 2, homeName: 'Brøndby IF', awayName: 'Viborg FF',
    score, statusFull,
  });
  const fetchLive = (events) => async () => ({ ok: true, status: 200, json: async () => ({ events }) });

  it('skriver den levende stilling', async () => {
    const db = makeDb([kamp]);
    const res = await syncLiveCore(db, FieldValue, {
      fetchFn: fetchLive([hændelse({ home: 1, away: 0 })]), only: [kamp], nowMs: NU,
    });
    expect(res).toEqual({ live: 1, skrevet: 1 });
    expect(db._docs.get('r2-brondbyif-viborgff').live).toEqual({
      home: 1, away: 0, status: 'foerste', statusRaw: '1st half', at: NU,
    });
  });

  // DEN VIGTIGSTE TEST I FILEN.
  it('rører ALDRIG facit-felterne', async () => {
    const db = makeDb([kamp]);
    await syncLiveCore(db, FieldValue, {
      fetchFn: fetchLive([hændelse({ home: 2, away: 1 })]), only: [kamp], nowMs: NU,
    });
    const dok = db._docs.get('r2-brondbyif-viborgff');
    // Præcis ét nyt felt — hverken result, homeGoals, awayGoals eller status.
    expect(Object.keys(dok).sort()).toEqual(['live', 'round']);
    for (const felt of ['result', 'homeGoals', 'awayGoals', 'status']) {
      expect(dok[felt]).toBeUndefined();
    }
  });

  it('viser 0-0 som en rigtig stilling', async () => {
    const db = makeDb([kamp]);
    await syncLiveCore(db, FieldValue, {
      fetchFn: fetchLive([hændelse({ home: 0, away: 0 })]), only: [kamp], nowMs: NU,
    });
    expect(db._docs.get('r2-brondbyif-viborgff').live).toMatchObject({ home: 0, away: 0 });
  });

  // Hver skrivning koster én læsning pr. åben browser, og under en kamp
  // sidder folk der.
  it('skriver IKKE, når hverken stilling eller halvleg har flyttet sig', async () => {
    const uændret = { id: kamp.id, data: { round: 2, live: { home: 1, away: 0, status: 'foerste', statusRaw: '1st half', at: 1 } } };
    const db = makeDb([uændret]);
    const res = await syncLiveCore(db, FieldValue, {
      fetchFn: fetchLive([hændelse({ home: 1, away: 0 })]), only: [uændret], nowMs: NU,
    });
    expect(res.skrevet).toBe(0);
    expect(db._docs.get(kamp.id).live.at).toBe(1); // urørt
  });

  it('skriver ved MÅL', async () => {
    const før = { id: kamp.id, data: { round: 2, live: { home: 1, away: 0, status: 'foerste', statusRaw: '1st half', at: 1 } } };
    const db = makeDb([før]);
    const res = await syncLiveCore(db, FieldValue, {
      fetchFn: fetchLive([hændelse({ home: 1, away: 1 })]), only: [før], nowMs: NU,
    });
    expect(res.skrevet).toBe(1);
    expect(db._docs.get(kamp.id).live).toMatchObject({ home: 1, away: 1, at: NU });
  });

  it('skriver ved skift af halvleg, selv om stillingen står stille', async () => {
    const før = { id: kamp.id, data: { round: 2, live: { home: 0, away: 0, status: 'foerste', statusRaw: '1st half', at: 1 } } };
    const db = makeDb([før]);
    const res = await syncLiveCore(db, FieldValue, {
      fetchFn: fetchLive([hændelse({ home: 0, away: 0 }, 'Halftime')]), only: [før], nowMs: NU,
    });
    expect(res.skrevet).toBe(1);
    expect(db._docs.get(kamp.id).live.status).toBe('pause');
  });

  it('rører ikke en kamp, der allerede HAR facit', async () => {
    const afgjort = { id: kamp.id, data: { round: 2, result: '1', homeGoals: 2, awayGoals: 1 } };
    const db = makeDb([afgjort]);
    const res = await syncLiveCore(db, FieldValue, {
      fetchFn: fetchLive([hændelse({ home: 2, away: 1 })]), only: [afgjort], nowMs: NU,
    });
    expect(res.skrevet).toBe(0);
    expect(db._docs.get(kamp.id).live).toBeUndefined();
  });

  // Serverens finite-tjek er den ENESTE vagt mod en tom stilling. På fronten
  // er Number.isFinite(Number(null)) sandt, så en null-score ville blive vist
  // som et rødt "0 – 0 DIREKTE", der aldrig har eksisteret — præcis den
  // Number(null)-fælde, som blev lukket i visningen, bare på serversiden.
  it.each([
    ['null-mål', { home: null, away: null }],
    ['tomt score-objekt', {}],
    ['kun hjemmemål', { home: 1 }],
    ['mål som tekst', { home: '1', away: '0' }],
  ])('springer en hændelse med %s over', async (_navn, score) => {
    const db = makeDb([kamp]);
    const res = await syncLiveCore(db, FieldValue, {
      fetchFn: fetchLive([hændelse(score)]), only: [kamp], nowMs: NU,
    });
    expect(res.skrevet).toBe(0);
    expect(db._docs.get(kamp.id).live).toBeUndefined();
  });

  it('springer en hændelse over, der slet ikke er i gang', async () => {
    const db = makeDb([kamp]);
    const færdig = { ...hændelse({ home: 2, away: 1 }), statusType: 'finished' };
    const res = await syncLiveCore(db, FieldValue, {
      fetchFn: fetchLive([færdig]), only: [kamp], nowMs: NU,
    });
    expect(res).toEqual({ live: 0, skrevet: 0 });
    expect(db._spil.liveHeartbeatAt).toBeUndefined(); // heller ingen puls
  });

  it('klipper en overlang statusRaw af', async () => {
    const db = makeDb([kamp]);
    await syncLiveCore(db, FieldValue, {
      fetchFn: fetchLive([hændelse({ home: 0, away: 0 }, 'x'.repeat(500))]),
      only: [kamp], nowMs: NU,
    });
    // Feltet udleveres til alle klienter og renderes ikke i dag — men et
    // ubegrænset felt fra en fremmed kilde er en fælde for den, der en dag
    // beslutter at vise det.
    expect(db._docs.get(kamp.id).live.statusRaw.length).toBeLessThanOrEqual(40);
  });

  it('fører seasonId med over i kaldet', async () => {
    const set = [];
    const fetchFn = async (u) => { set.push(String(u)); return { ok: true, status: 200, json: async () => ({ events: [] }) }; };
    await syncLiveCore(makeDb([]), FieldValue, { fetchFn, only: [], seasonId: 12345 });
    expect(set[0]).toContain('seasonId=12345');
  });

  it('springer kampe over, den ikke kender', async () => {
    const db = makeDb([kamp]);
    const fremmed = { ...hændelse({ home: 1, away: 0 }), homeName: 'Ukendt', awayName: 'Hold' };
    const res = await syncLiveCore(db, FieldValue, { fetchFn: fetchLive([fremmed]), only: [kamp], nowMs: NU });
    expect(res.skrevet).toBe(0);
  });

  it('kaster ved API-fejl (og fanges tavst af runScheduledSync)', async () => {
    const db = makeDb([kamp]);
    await expect(syncLiveCore(db, FieldValue, {
      fetchFn: async () => ({ ok: false, status: 503, json: async () => ({}) }), only: [kamp],
    })).rejects.toThrow(/live HTTP 503/);
  });

  // Pulsen gør kortet ærligt: står stillingen stille, kan brugeren stadig se,
  // at vi har kigget for et øjeblik siden.
  it('sætter en puls på spil-dokumentet, mens der spilles', async () => {
    const db = makeDb([kamp]);
    await syncLiveCore(db, FieldValue, {
      fetchFn: fetchLive([hændelse({ home: 0, away: 0 })]), only: [kamp], nowMs: NU,
    });
    expect(db._spil.liveHeartbeatAt).toBe(NU);
  });

  it('sætter pulsen OGSÅ når stillingen står stille', async () => {
    const uændret = { id: kamp.id, data: { round: 2, live: { home: 0, away: 0, status: 'foerste', statusRaw: '1st half', at: 1 } } };
    const db = makeDb([uændret]);
    const res = await syncLiveCore(db, FieldValue, {
      fetchFn: fetchLive([hændelse({ home: 0, away: 0 })]), only: [uændret], nowMs: NU,
    });
    expect(res.skrevet).toBe(0);            // ingen kamp-skrivning
    expect(db._spil.liveHeartbeatAt).toBe(NU); // men pulsen slår
  });

  it('sætter INGEN puls, når ingen kamp er i gang', async () => {
    const db = makeDb([kamp]);
    await syncLiveCore(db, FieldValue, { fetchFn: fetchLive([]), only: [kamp], nowMs: NU });
    expect(db._spil.liveHeartbeatAt).toBeUndefined();
  });

  it('har en timeout på kaldet', async () => {
    const set = [];
    const fetchFn = async (_u, opt) => { set.push(opt); return { ok: true, status: 200, json: async () => ({ events: [] }) }; };
    await syncLiveCore(makeDb([]), FieldValue, { fetchFn, only: [] });
    expect(set[0]?.signal).toBeInstanceOf(AbortSignal);
  });
});

describe('facit rydder den levende stilling', () => {
  it('sender en delete med, når facit skrives', async () => {
    const db = makeDb([{
      id: 'r1-viborgff-ob',
      data: { round: 1, live: { home: 1, away: 0, status: 'anden', statusRaw: '2nd half', at: 1 } },
    }]);
    const events = [{ statusType: 'finished', round: 1, homeName: 'Viborg FF', awayName: 'OB', score: { home: 2, away: 0 } }];
    await syncResultsCore(db, FieldValue, { fetchFn: fakeFetch(events) });
    expect(db._docs.get('r1-viborgff-ob').live).toBe('@delete');
  });

  // Uden det sidste led i guarden ville en kamp, hvor facit og den sidste
  // live-skrivning landede i samme kørsel, stå med BÅDE slutresultat og
  // "DIREKTE" for evigt.
  it('rydder også op på en kamp, der allerede har korrekt facit', async () => {
    const db = makeDb([{
      id: 'r1-viborgff-ob',
      data: { round: 1, result: '1', homeGoals: 2, awayGoals: 0, live: { home: 2, away: 0, status: 'anden', statusRaw: '2nd half', at: 1 } },
    }]);
    const events = [{ statusType: 'finished', round: 1, homeName: 'Viborg FF', awayName: 'OB', score: { home: 2, away: 0 } }];
    const res = await syncResultsCore(db, FieldValue, { fetchFn: fakeFetch(events) });
    expect(res.updated).toBe(1);
    expect(db._docs.get('r1-viborgff-ob').live).toBe('@delete');
  });

  it('rører ikke en kamp, der hverken har live eller ændret facit', async () => {
    const db = makeDb([{ id: 'r1-viborgff-ob', data: { round: 1, result: '1', homeGoals: 2, awayGoals: 0 } }]);
    const events = [{ statusType: 'finished', round: 1, homeName: 'Viborg FF', awayName: 'OB', score: { home: 2, away: 0 } }];
    expect((await syncResultsCore(db, FieldValue, { fetchFn: fakeFetch(events) })).updated).toBe(0);
  });
});
