// ---------------------------------------------------------------------------
// Tests for synk-provider-SNITTET: registret, den statiske spil-liste og
// dens paritet med scripts/games.mjs — samt flerspils-kørslen.
//
// Selve superliga-providerens parsing er dækket af superligaSync.test.js:
// kernerne kalder provideren som default, så alle 117 eksisterende tests
// løber igennem den. Her testes det, snittet TILFØJEDE.
// ---------------------------------------------------------------------------
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { readFileSync } from 'node:fs';
import { GAMES } from '../scripts/games.mjs';

const require = createRequire(import.meta.url);
const { PROVIDERS, SYNCED_GAMES } = require('./syncProviders');
const { runScheduledSyncAll, syncResultsCore, syncLiveCore, syncKickoffsCore } = require('./superligaSync');

const FieldValue = {
  serverTimestamp: () => ({ __ts: true }),
  delete: () => ({ __delete: true }),
};

/**
 * Mindste skrivbare db: games/{id}/matches med batch og spil-dokument.
 * Superliga-suitens fake er bundet til superliga2627 — denne er spil-agnostisk,
 * for pointen HERUNDER er netop et spil, der ikke er Superligaen.
 */
function fakeDb(matchDocs, gameInit = {}) {
  const docs = new Map(Object.entries(matchDocs));
  const spil = { ...gameInit };
  const metoder = []; // hvilken skrive-metode hver batch-operation brugte
  const matchesCol = {
    async get() { return { docs: [...docs.entries()].map(([id, data]) => ({ id, data: () => data })) }; },
    doc: (id) => ({ __id: id }),
  };
  return {
    _docs: docs,
    _spil: spil,
    _metoder: metoder,
    collection: () => ({
      doc: () => ({
        collection: () => matchesCol,
        async get() { return { exists: true, data: () => spil }; },
        async set(patch, opts) {
          if (opts?.merge !== true) throw new Error('set() uden merge');
          Object.assign(spil, patch);
        },
      }),
    }),
    batch() {
      return {
        _ops: [],
        set(ref, data, opts) {
          if (opts?.merge !== true) throw new Error('batch.set() uden merge');
          this._ops.push({ id: ref.__id, data, metode: 'set' });
        },
        update(ref, data) {
          // Som Firestore: update på et dokument, der ikke findes, fejler —
          // kickoff-synken må aldrig kunne OPRETTE kampe.
          if (!docs.has(ref.__id)) throw new Error(`update på ukendt dokument ${ref.__id}`);
          this._ops.push({ id: ref.__id, data, metode: 'update' });
        },
        async commit() {
          for (const op of this._ops) {
            metoder.push(op.metode);
            docs.set(op.id, { ...(docs.get(op.id) || {}), ...op.data });
          }
        },
      };
    },
  };
}

// KONTRAKTENS BÆRENDE KLAUSUL: kernen SKAL bruge providerens resolveDocs.
// For Superligaen er sourceKey og dokument-id identiske, så oversættelsen er
// en identitet, alle superligaSync-tests løber usynligt igennem — mutationen
// "drop resolveDocs" overlevede hele suiten. Denne provider har med vilje
// sourceKey ≠ dokument-id (pl-N ↔ r1-N), så identiteten ikke kan snyde.
// fetchFn kaster på ethvert kald: bruges der en RIGTIG provider i stedet for
// den injicerede (providerAfOpts-mutationen), fejler testen allerede dér.
const fetchEksploderer = async () => { throw new Error('kernen må ikke selv hente — det gør provideren'); };
const oversaetter = {
  resolveDocs(sourceKeys, docIds) {
    const kendte = new Set(docIds);
    const map = new Map();
    for (const k of sourceKeys) {
      const id = `r1-${String(k).slice(3)}`;
      if (kendte.has(id)) map.set(k, id);
    }
    return map;
  },
};

describe('kernerne bruger providerens resolveDocs — sourceKey er ikke dokument-id', () => {
  it('facit lander på det OVERSATTE dokument-id', async () => {
    const db = fakeDb({ 'r1-101': { kickoff: new Date('2026-08-21T19:00:00Z') } });
    const provider = {
      ...oversaetter,
      async hentFaerdige() { return [{ sourceKey: 'pl-101', homeGoals: 2, awayGoals: 0 }]; },
    };
    const ud = await syncResultsCore(db, FieldValue, {
      gameId: 'pl-test', provider, sync: {}, fetchFn: fetchEksploderer,
    });
    expect(ud.updated).toBe(1);
    expect(ud.rettede).toEqual(['r1-101']);
    expect(db._docs.get('r1-101').result).toBe('1');
    expect(db._docs.get('r1-101').homeGoals).toBe(2);
  });

  it('live-skrivning OG slut-markering rammer de oversatte dokumenter', async () => {
    const toTimerSiden = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const iGang = { kickoff: toTimerSiden, live: { home: 0, away: 0, status: 'foerste', at: 1 } };
    const forsvundet = { kickoff: toTimerSiden, live: { home: 1, away: 1, status: 'anden', at: 1 } };
    const db = fakeDb({ 'r1-101': iGang, 'r1-102': forsvundet });
    const provider = {
      ...oversaetter,
      async hentLive() {
        return {
          events: [{ sourceKey: 'pl-101', home: 1, away: 0, status: 'anden', statusRaw: 'x' }],
          // pl-102 er væk fra kildens liste → r1-102 skal markeres 'slut'.
          // Sammenlignes der på RÅ sourceKeys i stedet for oversatte id'er,
          // markeres r1-101 OGSÅ slut — og det er præcis mutationen, der
          // overlevede uden denne test.
          stadigIGang: new Set(['pl-101']),
        };
      },
    };
    const ud = await syncLiveCore(db, FieldValue, {
      gameId: 'pl-test',
      provider,
      sync: {},
      fetchFn: fetchEksploderer,
      nowMs: Date.now(),
      only: [
        { id: 'r1-101', data: iGang },
        { id: 'r1-102', data: forsvundet },
      ],
    });
    expect(ud.skrevet).toBe(1);
    expect(ud.sluttede).toEqual(['r1-102']);
    expect(db._docs.get('r1-101').live.status).toBe('anden'); // IKKE slut
    expect(db._docs.get('r1-102').live.status).toBe('slut');
  });
});

// Spejlfils-pariteten. games.mjs er kilden til, hvad der SEEDES på
// spil-dokumenterne (klienten læser provider-navnet derfra til kildelinjen);
// SYNCED_GAMES er, hvad serveren faktisk SYNKER. Driver de to fra hinanden,
// synker serveren mod en anden konfiguration, end skærmen påstår.
describe('SYNCED_GAMES ⇄ scripts/games.mjs', () => {
  it('hver synket konfiguration står ordret i games.mjs', () => {
    for (const g of SYNCED_GAMES) {
      const game = GAMES.find((x) => x.id === g.gameId);
      expect(game, `${g.gameId} findes ikke i games.mjs`).toBeTruthy();
      expect(game.sync?.provider, `${g.gameId}: provider`).toBe(g.provider);
      for (const [k, v] of Object.entries(g.sync)) {
        expect(game.sync[k], `${g.gameId}: sync.${k}`).toBe(v);
      }
    }
  });

  // TRIPWIREN for næste delopgave: i samme øjeblik en provider implementeres
  // i PROVIDERS (fx pulselive), KRÆVER denne test, at spillene med den
  // provider også kommer med i SYNCED_GAMES. En implementeret kilde, ingen
  // synker fra, er præcis den slags halve tilstand, der ellers opdages ved,
  // at point aldrig afregnes.
  it('hvert games.mjs-spil med en IMPLEMENTERET provider er med i synken', () => {
    const burde = GAMES
      .filter((x) => x.sync && PROVIDERS[x.sync.provider])
      .map((x) => x.id)
      .sort();
    expect(SYNCED_GAMES.map((g) => g.gameId).sort()).toEqual(burde);
  });

  it('hver post i SYNCED_GAMES peger på en provider, der findes', () => {
    for (const g of SYNCED_GAMES) {
      expect(PROVIDERS[g.provider], `${g.gameId}: "${g.provider}"`).toBeTruthy();
    }
  });
});

// --- pulselive (Premier League) — mod de RÅ fixtures fra probe-scriptet ----

const fxMatches = require('./testdata/pulselive-matches.json');
const fxStandings = require('./testdata/pulselive-standings.json');

/** fetch-fake, der svarer pr. URL-mønster og logger kaldene. */
function fetchRuter(ruter) {
  const kald = [];
  const fn = async (url, opt) => {
    kald.push({ url, opt });
    const match = ruter.find(([moenster]) => url.includes(moenster));
    if (!match) throw new Error(`uventet URL: ${url}`);
    return { ok: true, status: 200, json: async () => match[1](url) };
  };
  fn.kald = kald;
  return fn;
}

describe('pulselive-provideren', () => {
  const sync = { competitionId: 8, season: 2026 };
  const fuldtid = fxMatches.perPeriod.FullTime[0]; // ægte shape fra API'et
  const foerKamp = fxMatches.perPeriod.PreMatch[0];

  it('henter færdige kampe over ALLE sider og filtrerer ufærdige/ubrugelige fra', async () => {
    const udenScore = { ...fuldtid, matchId: '999', homeTeam: { ...fuldtid.homeTeam, score: null } };
    // DEN FARLIGE: en kamp I GANG har mål på tavlen (finite scorer), men
    // period ≠ FullTime. Blev den til facit, ville pointafregningen fyre midt
    // i kampen — score-filtret alene kan ikke skelne den fra en færdig kamp,
    // KUN period-grenen kan. Mutationen "fjern period-tjekket" overlevede
    // hele suiten, netop fordi ingen fixture-kamp havde den kombination.
    const iGangMedMaal = { ...fuldtid, matchId: '888', period: 'FirstHalf' };
    // Kun ANDEN bogstavering: facit-vagten deler normalisering med live-vejen
    // (plPeriodNorm), så en ren stavemåde-ændring fra kilden ikke kan gøre
    // kampen stum i begge ender på én gang.
    const stavemaade = { ...fuldtid, matchId: '666', period: 'FULLTIME' };
    const fetchFn = fetchRuter([
      ['_next=', () => ({ pagination: { _next: null }, data: [{ ...fuldtid, matchId: '777' }, udenScore, iGangMedMaal, stavemaade] })],
      ['/matches', () => ({ pagination: { _next: 'side2' }, data: [fuldtid, foerKamp] })],
    ]);
    const ud = await PROVIDERS.pulselive.hentFaerdige(sync, fetchFn);
    // Begge sider læst; PreMatch, null-score OG kampen i gang udeladt.
    expect(ud).toEqual([
      { sourceKey: String(fuldtid.matchId), homeGoals: fuldtid.homeTeam.score, awayGoals: fuldtid.awayTeam.score },
      { sourceKey: '777', homeGoals: fuldtid.homeTeam.score, awayGoals: fuldtid.awayTeam.score },
      { sourceKey: '666', homeGoals: fuldtid.homeTeam.score, awayGoals: fuldtid.awayTeam.score },
    ]);
    expect(ud.map((e) => e.sourceKey)).not.toContain('888');
    expect(fetchFn.kald.length).toBe(2);
    // Origin-headeren er adgangsbilletten — uden den svarer API'et 403.
    expect(fetchFn.kald[0].opt.headers.Origin).toBe('https://www.premierleague.com');
  });

  it('en cursor i ring afbrydes af side-loftet — aldrig et halvt facit-billede', async () => {
    const fetchFn = fetchRuter([
      ['/matches', () => ({ pagination: { _next: 'rundt-i-ring' }, data: [] })],
    ]);
    await expect(PROVIDERS.pulselive.hentFaerdige(sync, fetchFn)).rejects.toThrow(/10 sider/);
    expect(fetchFn.kald.length).toBe(10);
  });

  it('henter tabellen fra v5 (sitets eget endpoint) og normaliserer felterne', async () => {
    // Fixturets rækker er præ-sæson (lutter nuller) — dér er en ombytning af
    // won/lost eller en glemt Number() usynlig. Den syntetiske række har et
    // FORSKELLIGT, ikke-nul tal i hvert felt, så enhver forveksling bliver rød.
    const talrig = {
      overall: { position: 5, played: 6, won: 3, drawn: 2, lost: 1, goalsFor: 9, goalsAgainst: 4, points: 11 },
      team: { name: 'Testholdet', abbr: 'TST', id: '99' },
    };
    const fetchFn = fetchRuter([
      ['/standings', () => ({ matchweek: 1, tables: [{ entries: [...fxStandings.entries, talrig] }] })],
    ]);
    const rows = await PROVIDERS.pulselive.hentStandings(sync, fetchFn);
    expect(fetchFn.kald[0].url).toContain('/v5/competitions/8/seasons/2026/standings');
    expect(rows.find((r) => r.teamName === 'Testholdet')).toEqual({
      rank: 5, teamName: 'Testholdet', teamShortName: 'TST',
      points: 11, played: 6, won: 3, draw: 2, lost: 1, gf: 9, ga: 4, rankType: null,
    });
    expect(rows.length).toBe(fxStandings.entries.length + 1);
    // v5 leverer rækkerne USORTERET (fixturet er råt og beviser det) —
    // output SKAL være i rank-orden, ellers deler FootballTable forkert.
    expect(rows.map((r) => r.rank)).toEqual([...rows.map((r) => r.rank)].sort((a, b) => a - b));
    expect(rows.map((r) => r.rank)).not.toEqual(fxStandings.entries.map((e) => e.overall.position).concat(5));
  });

  it('hentLive: period afgør i-gang, oversættes til det lukkede sæt — og hviletilstande holdes helt ude', async () => {
    const iGangAf = (period, matchId, ekstra = {}) => ({
      ...fuldtid, matchId, period, ...ekstra,
    });
    const fetchFn = fetchRuter([
      ['/matches', () => ({
        pagination: { _next: null },
        data: [
          foerKamp, // PreMatch → hverken event eller stadigIGang
          fuldtid, // FullTime → samme (facit-vejen ejer den)
          iGangAf('FirstHalf', '801'),
          iGangAf('HalfTime', '802'),
          iGangAf('SecondHalf', '803'),
          // Ukendt token: SKAL regnes i gang ('ukendt' → blot "DIREKTE") —
          // et nyt ord fra kilden må aldrig kunne blive et falsk slutfløjt.
          // 'Constructor' rammer samtidig prototype-fælden fra superligaens
          // liveStatus: et alm. opslag gav en FUNKTION, ikke null.
          iGangAf('Constructor', '804'),
          // I gang, men uden brugbar stilling: UDE af events, MED i
          // stadigIGang — vores eget score-filter må ikke ligne slutfløjt.
          iGangAf('SecondHalf', '805', { homeTeam: { ...fuldtid.homeTeam, score: null } }),
          // NUMERISK matchId: kilden leverer strenge i praksis, men
          // String()-coercionen er selve garantien for, at Set-nøglen og
          // resolveDocs-opslaget aldrig kan skille ad på typen. Uden denne
          // kamp var mutationen "drop String()" grøn i hele suiten.
          iGangAf('FirstHalf', 806),
          // GIFTIG period: {toString: null} er JSON-nåbart og fik String()
          // til at KASTE — én skæv kamp væltede hele minuttets kørsel for
          // spillet (Security-fund). Skal regnes i gang (aldrig falsk Slut)
          // og vises som 'ukendt', mens de raske kampe kører videre.
          iGangAf({ toString: null }, '807'),
        ],
      })],
    ]);
    const ud = await PROVIDERS.pulselive.hentLive(sync, fetchFn);
    expect(ud.events).toEqual([
      { sourceKey: '801', home: fuldtid.homeTeam.score, away: fuldtid.awayTeam.score, status: 'foerste', statusRaw: 'FirstHalf' },
      { sourceKey: '802', home: fuldtid.homeTeam.score, away: fuldtid.awayTeam.score, status: 'pause', statusRaw: 'HalfTime' },
      { sourceKey: '803', home: fuldtid.homeTeam.score, away: fuldtid.awayTeam.score, status: 'anden', statusRaw: 'SecondHalf' },
      { sourceKey: '804', home: fuldtid.homeTeam.score, away: fuldtid.awayTeam.score, status: 'ukendt', statusRaw: 'Constructor' },
      { sourceKey: '806', home: fuldtid.homeTeam.score, away: fuldtid.awayTeam.score, status: 'foerste', statusRaw: 'FirstHalf' },
      { sourceKey: '807', home: fuldtid.homeTeam.score, away: fuldtid.awayTeam.score, status: 'ukendt', statusRaw: 'ikke-streng' },
    ]);
    expect([...ud.stadigIGang].sort()).toEqual(['801', '802', '803', '804', '805', '806', '807']);
    expect(ud.stadigIGang.has(806)).toBe(false); // strengen, aldrig tallet
    expect(ud.stadigIGang.has(String(fuldtid.matchId))).toBe(false);
    expect(ud.stadigIGang.has(String(foerKamp.matchId))).toBe(false);
  });

  it('hentLive KASTER på et 200 uden data-liste — fravær er et skrive-signal, ikke "ingen kampe"', async () => {
    // `data.data || []` ville her betyde: hver spillende kamp markeres slut,
    // fordi et afkortet/ændret svar lignede en tom liste. Guarden i
    // plAlleKampe dækker også facit og kickoffs (halvt billede → rød log).
    const fetchFn = fetchRuter([['/matches', () => ({})]]);
    await expect(PROVIDERS.pulselive.hentLive(sync, fetchFn)).rejects.toThrow(/uden data-liste/);
    await expect(PROVIDERS.pulselive.hentFaerdige(sync, fetchFn)).rejects.toThrow(/uden data-liste/);
  });

  it('resolveDocs genfinder kilde-id som suffiks — og læser docIds som engangs-iterator', () => {
    // En generator kan kun løbes igennem ÉN gang — to gennemløb ville give
    // tom anden runde og et tavst tab af alle opslag (kontrakt-kravet).
    function* docIds() { yield 'r1-101'; yield 'r14-2645195'; }
    const map = PROVIDERS.pulselive.resolveDocs(['2645195', '101', '999'], docIds());
    expect([...map.entries()].sort()).toEqual([['101', 'r1-101'], ['2645195', 'r14-2645195']]);
  });
});

describe('syncLiveCore når kilden ikke kan levere live (stadigIGang null)', () => {
  // Kontraktens null-gren er stadig en gren, en fremtidig kilde kan bruge —
  // pulselive leverer nu selv, så grenen bevises med en fake-provider.
  it('markerer ALDRIG slut — en kamp uden livssignal beholder sin stilling', async () => {
    const toTimerSiden = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const kamp = { kickoff: toTimerSiden, live: { home: 1, away: 0, status: 'anden', at: 1 } };
    const db = fakeDb({ 'r1-101': kamp });
    const ud = await syncLiveCore(db, FieldValue, {
      gameId: 'pl-test',
      provider: { ...oversaetter, async hentLive() { return { events: [], stadigIGang: null }; } },
      sync: {},
      fetchFn: async () => { throw new Error('må ikke hente'); },
      nowMs: Date.now(),
      only: [{ id: 'r1-101', data: kamp }],
    });
    expect(ud.sluttet).toBe(0);
    expect(db._docs.get('r1-101').live.status).toBe('anden'); // urørt
  });
});

describe('PL-live hele vejen igennem kernen — den ÆGTE provider, r{runde}-{matchId}-opløsning', () => {
  it('skriver live på det oversatte dokument og markerer den forsvundne kamp slut', async () => {
    const toTimerSiden = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const fuldtid = fxMatches.perPeriod.FullTime[0];
    const spiller = { kickoff: toTimerSiden };
    const forsvundet = { kickoff: toTimerSiden, live: { home: 1, away: 1, status: 'anden', at: 1 } };
    const db = fakeDb({ 'r1-901': spiller, 'r1-902': forsvundet });
    const fetchFn = fetchRuter([
      ['/matches', () => ({
        pagination: { _next: null },
        // 901 spiller (2-0 i første halvleg); 902 er VÆK fra kildens liste.
        data: [{ ...fuldtid, matchId: '901', period: 'FirstHalf', homeTeam: { ...fuldtid.homeTeam, score: 2 }, awayTeam: { ...fuldtid.awayTeam, score: 0 } }],
      })],
    ]);
    const ud = await syncLiveCore(db, FieldValue, {
      gameId: 'pl-test',
      provider: PROVIDERS.pulselive,
      sync: { competitionId: 8, season: 2026 },
      fetchFn,
      nowMs: Date.now(),
      only: [{ id: 'r1-901', data: spiller }, { id: 'r1-902', data: forsvundet }],
    });
    expect(ud.skrevet).toBe(1);
    expect(ud.sluttede).toEqual(['r1-902']);
    expect(db._docs.get('r1-901').live).toMatchObject({ home: 2, away: 0, status: 'foerste' });
    expect(db._docs.get('r1-902').live.status).toBe('slut');
    // Skrivningen rører PRÆCIS live-feltet, og live-objektet har PRÆCIS de
    // fem kendte nøgler — et API-svar med result/homeGoals/status i sig må
    // aldrig kunne smugle andet ind (Security-PoC ophøjet til regression:
    // matchOutcome() udleder facit FRA MÅLENE, så en smuglet homeGoals
    // ville flytte Elo på en halvlegsstilling).
    expect(Object.keys(db._docs.get('r1-901')).sort()).toEqual(['kickoff', 'live']);
    expect(Object.keys(db._docs.get('r1-901').live).sort()).toEqual(['at', 'away', 'home', 'status', 'statusRaw']);
    // Pulsen slog: mindst én hændelse hørte til spillet.
    expect(db._spil.liveHeartbeatAt).toBeTypeOf('number');
  });

  it('en fremmed kamp (uden dokument i spillet) holder ALDRIG pulsen i live', async () => {
    // Kildens liste er hele ligaen. En kamp fra en anden rundes weekend må
    // ikke kunne holde liveHeartbeatAt falsk-frisk for DETTE spil — så slog
    // klientens "forældet"-dæmpning aldrig til på en strandet stilling.
    const fuldtid = fxMatches.perPeriod.FullTime[0];
    const omToTimer = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const ikkeStartet = { kickoff: omToTimer };
    const db = fakeDb({ 'r1-901': ikkeStartet });
    const fetchFn = fetchRuter([
      ['/matches', () => ({
        pagination: { _next: null },
        data: [{ ...fuldtid, matchId: '999999', period: 'SecondHalf' }], // findes ikke i spillet
      })],
    ]);
    const ud = await syncLiveCore(db, FieldValue, {
      gameId: 'pl-test',
      provider: PROVIDERS.pulselive,
      sync: { competitionId: 8, season: 2026 },
      fetchFn,
      nowMs: Date.now(),
      only: [{ id: 'r1-901', data: ikkeStartet }],
    });
    expect(ud.live).toBe(1); // hændelsen SES…
    expect(ud.skrevet).toBe(0); // …men intet dokument rammes…
    expect(db._spil.liveHeartbeatAt).toBeUndefined(); // …og pulsen står stille
  });
});

describe('pulselive.hentKickoffs — den ÆGTE metode, mod de rå fixtures', () => {
  it('konverterer London-tid til UTC og lader manglende tid være null', async () => {
    const foerKamp = fxMatches.perPeriod.PreMatch[0]; // kickoff "2026-08-21 20:00:00" (BST)
    const udenTid = { ...foerKamp, matchId: '555', kickoff: null };
    const fetchFn = fetchRuter([
      ['/matches', () => ({ pagination: { _next: null }, data: [foerKamp, udenTid] })],
    ]);
    const ud = await PROVIDERS.pulselive.hentKickoffs({ competitionId: 8, season: 2026 }, fetchFn);
    expect(ud).toEqual([
      { sourceKey: String(foerKamp.matchId), kickoff: '2026-08-21T19:00:00.000Z' },
      { sourceKey: '555', kickoff: null },
    ]);
  });

  it('en uventet tidszone fra kilden KASTER — en times stille skred er værre end en rød log', async () => {
    const fremmed = { ...fxMatches.perPeriod.PreMatch[0], kickoffTimezoneString: 'America/New_York' };
    const fetchFn = fetchRuter([
      ['/matches', () => ({ pagination: { _next: null }, data: [fremmed] })],
    ]);
    await expect(PROVIDERS.pulselive.hentKickoffs({ competitionId: 8, season: 2026 }, fetchFn))
      .rejects.toThrow(/uventet tidszone/);
  });

  it('kampe uden for spillets runder droppes FØR tolkning — også når de er ulæselige', async () => {
    // En forårskamp (runde 19+) med skrald i tidsfeltet må ikke kunne vælte
    // efterårsspillets daglige kørsel — den er ikke vores at tolke.
    const vores = fxMatches.perPeriod.PreMatch[0]; // matchWeek 1
    const fremmedOgUlaeselig = {
      ...vores, matchId: '777', matchWeek: 19, kickoffTimezoneString: 'America/New_York', kickoff: 'skrald',
    };
    const fetchFn = fetchRuter([
      ['/matches', () => ({ pagination: { _next: null }, data: [vores, fremmedOgUlaeselig] })],
    ]);
    const ud = await PROVIDERS.pulselive.hentKickoffs({ competitionId: 8, season: 2026 }, fetchFn, new Set([1]));
    expect(ud.map((f) => f.sourceKey)).toEqual([String(vores.matchId)]);
  });
});

describe('superliga.hentKickoffs — den ÆGTE metode', () => {
  const sync = { seasonId: 35802 };
  const ev = (round, home, away, startDate) => ({ round, homeName: home, awayName: away, startDate });

  it('henter KUN notstarted og mapper startDate (allerede UTC) uden zone-omregning', async () => {
    const fetchFn = fetchRuter([
      ['status=notstarted', () => ({ events: [
        ev(5, 'AGF', 'OB', '2026-08-23T12:00:00.000Z'),
        ev(5, 'Viborg FF', 'F.C. København', '2026-08-23T16:00:00.000Z'),
      ] })],
    ]);
    const ud = await PROVIDERS.superliga.hentKickoffs(sync, fetchFn);
    // sourceKey ER dokument-id'et (r{runde}-{slug}-{slug}); startDate står uændret.
    expect(ud).toEqual([
      { sourceKey: 'r5-agf-ob', kickoff: '2026-08-23T12:00:00.000Z' },
      { sourceKey: 'r5-viborgff-fckobenhavn', kickoff: '2026-08-23T16:00:00.000Z' },
    ]);
    // Beviser at vi rammer notstarted-endpointet — ALDRIG finished, så et facit
    // aldrig kan blive flyttet af kickoff-synken.
    expect(fetchFn.kald[0].url).toContain('status=notstarted');
    expect(fetchFn.kald[0].url).not.toContain('status=finished');
  });

  it('manglende startDate giver kickoff:null (den delte kickoffPlan-vagt afgør resten)', async () => {
    const fetchFn = fetchRuter([
      ['status=notstarted', () => ({ events: [ev(5, 'AGF', 'OB', null)] })],
    ]);
    expect(await PROVIDERS.superliga.hentKickoffs(sync, fetchFn))
      .toEqual([{ sourceKey: 'r5-agf-ob', kickoff: null }]);
  });

  it('en UGYLDIG startDate KASTER med kampens id — en forkert deadline er værre end en rød log', async () => {
    const fetchFn = fetchRuter([
      ['status=notstarted', () => ({ events: [ev(5, 'AGF', 'OB', 'ikke-en-dato')] })],
    ]);
    await expect(PROVIDERS.superliga.hentKickoffs(sync, fetchFn))
      .rejects.toThrow(/ugyldig startDate.*r5-agf-ob/);
  });

  it('kampe uden for spillets runder droppes FØR tolkning — også når tiden er ulæselig', async () => {
    // En kamp i en runde, spillet ikke har, med skrald i tidsfeltet må ikke
    // kunne vælte kørslen — den er ikke vores at tolke.
    const fetchFn = fetchRuter([
      ['status=notstarted', () => ({ events: [
        ev(5, 'AGF', 'OB', '2026-08-23T12:00:00.000Z'),
        ev(99, 'X', 'Y', 'skrald'),
      ] })],
    ]);
    const ud = await PROVIDERS.superliga.hentKickoffs(sync, fetchFn, new Set([5]));
    expect(ud.map((f) => f.sourceKey)).toEqual(['r5-agf-ob']);
  });

  it('HTTP-fejl KASTER (intet skrives)', async () => {
    const fetchFn = async () => ({ ok: false, status: 503, json: async () => ({}) });
    await expect(PROVIDERS.superliga.hentKickoffs(sync, fetchFn)).rejects.toThrow(/kickoffs HTTP 503/);
  });

  it('et 200 uden events-liste KASTER — {} må ikke tolkes som "nul kickoffs"', async () => {
    const fetchFn = fetchRuter([['status=notstarted', () => ({})]]);
    await expect(PROVIDERS.superliga.hentKickoffs(sync, fetchFn)).rejects.toThrow(/uden events-liste/);
  });
});

describe('syncKickoffsCore', () => {
  const NU = Date.parse('2026-08-01T12:00:00Z');
  const langtUde = '2026-08-21T19:00:00Z'; // 20 dage ude — ingen alarm
  const provider = (fixtures) => ({
    resolveDocs: PROVIDERS.pulselive.resolveDocs, // det ægte suffiks-opslag
    async hentKickoffs() { return fixtures; },
  });
  const kamp = (ms, result) => ({ kickoff: new Date(ms), ...(result ? { result } : {}) });

  it('retter KUN kickoff (+stempel) på ændrede, urørte kampe — aldrig round eller andet', async () => {
    const db = fakeDb({
      'r1-101': kamp(Date.parse('2026-08-21T18:00:00Z')), // flyttes
      'r1-102': kamp(Date.parse(langtUde)), // uændret
      'r1-103': kamp(Date.parse('2026-08-01T10:00:00Z'), '1'), // spillet
    });
    const ud = await syncKickoffsCore(db, FieldValue, {
      gameId: 'pl-test',
      provider: provider([
        { sourceKey: '101', kickoff: langtUde },
        { sourceKey: '102', kickoff: langtUde },
        { sourceKey: '103', kickoff: '2026-08-01T11:00:00Z' },
        { sourceKey: '999', kickoff: langtUde }, // aldrig seedet → alarm
      ]),
      sync: {}, fetchFn: fetchEksploderer, nowMs: NU, dryRun: false,
    });
    expect(ud.aendringer.map((a) => a.id)).toEqual(['r1-101']);
    expect(ud.spillet).toBe(1);
    expect(ud.mangler).toEqual(['999']);
    expect(ud.snart).toEqual([]);
    // INVARIANTEN: skrivningen rører PRÆCIS kickoff + stempel — aldrig round.
    const skrevet = db._docs.get('r1-101');
    expect(skrevet.kickoff.getTime()).toBe(Date.parse(langtUde));
    expect(Object.keys(skrevet).sort()).toEqual(['kickoff', 'kickoffSyncedAt']);
    // …og med UPDATE, aldrig set: set kan oprette kampe, update kan ikke.
    // fakeDb'ens eksistens-vagt fanger det kun for MANGLENDE dokumenter —
    // metode-sporet fanger det også, når alle dokumenter findes.
    expect(db._metoder).toEqual(['update']);
    // Den spillede kamp står urørt.
    expect(db._docs.get('r1-103').kickoff.getTime()).toBe(Date.parse('2026-08-01T10:00:00Z'));
  });

  it('END-TO-END med den ÆGTE superliga-provider: en flyttet kamp skrives gennem kernen', async () => {
    // Beviser hele kæden — superliga.hentKickoffs → resolveDocs → kickoffPlan →
    // skrivning — med den RIGTIGE provider, ikke en fake. Fanger et fremtidigt
    // slug-mismatch mellem hentKickoffs og resolveDocs (begge bygger doc-id'et
    // via matchDocId; her køres de FOR FØRSTE GANG sammen).
    const gammel = Date.parse('2026-08-21T17:00:00Z'); // vores forkerte tid
    const rigtig = '2026-08-23T12:00:00.000Z';         // kildens rettede tid
    const db = fakeDb({ 'r5-agf-ob': { kickoff: new Date(gammel), round: 5 } });
    const fetchFn = fetchRuter([
      ['status=notstarted', () => ({ events: [
        { round: 5, homeName: 'AGF', awayName: 'OB', startDate: rigtig },
      ] })],
    ]);
    const ud = await syncKickoffsCore(db, FieldValue, {
      gameId: 'superliga2627', provider: PROVIDERS.superliga,
      sync: { seasonId: 35802 }, fetchFn, nowMs: NU, dryRun: false,
    });
    expect(ud.aendringer.map((a) => a.id)).toEqual(['r5-agf-ob']);
    const skrevet = db._docs.get('r5-agf-ob');
    expect(skrevet.kickoff.getTime()).toBe(Date.parse(rigtig));
    // Kun kickoff + stempel — round og alt andet urørt (invarianten fra oven).
    expect(Object.keys(skrevet).sort()).toEqual(['kickoff', 'kickoffSyncedAt', 'round']);
    expect(db._metoder).toEqual(['update']);
  });

  it('TØR-KØRSEL er default og fejler lukket: kun eksplicit false skriver', async () => {
    const foer = Date.parse('2026-08-21T18:00:00Z');
    const db = fakeDb({ 'r1-101': kamp(foer) });
    const ud = await syncKickoffsCore(db, FieldValue, {
      gameId: 'pl-test', provider: provider([{ sourceKey: '101', kickoff: langtUde }]),
      sync: {}, fetchFn: fetchEksploderer, nowMs: NU, dryRun: 'nej-tak', // tastefejl → tørkører
    });
    expect(ud.dryRun).toBe(true);
    expect(ud.aendringer.length).toBe(1); // planen VISES…
    expect(db._docs.get('r1-101').kickoff.getTime()).toBe(foer); // …men intet skrives
  });

  it('en ny tid under 48 timer ude udløser alarmen — ændringen gennemføres stadig', async () => {
    const omEtDoegn = '2026-08-02T12:00:00Z';
    const db = fakeDb({ 'r1-101': kamp(Date.parse('2026-08-03T12:00:00Z')) });
    const ud = await syncKickoffsCore(db, FieldValue, {
      gameId: 'pl-test', provider: provider([{ sourceKey: '101', kickoff: omEtDoegn }]),
      sync: {}, fetchFn: fetchEksploderer, nowMs: NU, dryRun: false,
    });
    expect(ud.snart).toEqual(['r1-101']);
    expect(db._docs.get('r1-101').kickoff.getTime()).toBe(Date.parse(omEtDoegn));
  });

  it('GENÅBNER ALDRIG en lukket kamp: passeret kickoff → fremtid afvises og logges', async () => {
    // Security-fund bevist mod regel-emulatoren: request.time < kickoff ville
    // blive sand igen, og tips kunne OPRETTES på en kamp i gang — efter at
    // alles tips har været synlige. Rutinekørslen skal nægte.
    const passeret = Date.parse('2026-08-01T10:00:00Z'); // 2 timer FØR nowMs
    const db = fakeDb({
      'r1-101': kamp(passeret), // i gang, intet facit endnu
      'r1-102': kamp(Date.parse('2026-08-21T18:00:00Z')), // almindelig flytning
    });
    const ud = await syncKickoffsCore(db, FieldValue, {
      gameId: 'pl-test',
      provider: provider([
        { sourceKey: '101', kickoff: '2026-08-12T19:00:00Z' }, // genåbning!
        { sourceKey: '102', kickoff: langtUde },
      ]),
      sync: {}, fetchFn: fetchEksploderer, nowMs: NU, dryRun: false,
    });
    expect(ud.genaabninger).toEqual(['r1-101']);
    expect(ud.aendringer.map((a) => a.id)).toEqual(['r1-102']); // den uskyldige skrives
    expect(db._docs.get('r1-101').kickoff.getTime()).toBe(passeret); // urørt
    expect(db._docs.get('r1-102').kickoff.getTime()).toBe(Date.parse(langtUde));
  });

  it('sender SPILLETS runder til provideren, så kilden filtreres før tolkning', async () => {
    // Uden filteret drukner mangler-alarmen i 200 forårskampe, spillet ikke
    // har — og den ene ægte manglende kamp bliver usynlig.
    let modtagetRunder = null;
    const db = fakeDb({ 'r1-101': { kickoff: new Date(langtUde), round: 1 }, 'r2-102': { kickoff: new Date(langtUde), round: 2 } });
    await syncKickoffsCore(db, FieldValue, {
      gameId: 'pl-test',
      provider: {
        resolveDocs: PROVIDERS.pulselive.resolveDocs,
        async hentKickoffs(sync, fetchFn, runder) { modtagetRunder = runder; return []; },
      },
      sync: {}, fetchFn: fetchEksploderer, nowMs: NU,
    });
    expect([...modtagetRunder].sort()).toEqual([1, 2]);
  });

  it('en provider UDEN hentKickoffs springes over (understoettet:false, uden at hente)', async () => {
    // Superligaen HAR nu hentKickoffs (den synkes), så grenen bevises med en
    // provider uden metoden. fetchEksploderer beviser, at der ikke hentes.
    const udenKickoffs = { resolveDocs: PROVIDERS.superliga.resolveDocs };
    const ud = await syncKickoffsCore(fakeDb({}), FieldValue, {
      gameId: 'x', provider: udenKickoffs, sync: {}, fetchFn: fetchEksploderer,
    });
    expect(ud).toEqual({ understoettet: false });
  });

  // Pulje-deadline UDLEDT af en runde (#8): puljeLockAt = tidligste kickoff i
  // game.puljeLockRound, opdateret hver synk, så den følger kamptiderne.
  describe('runde-udledt pulje-deadline (puljeLockRound)', () => {
    const r3a = Date.parse('2026-09-12T18:30:00Z');
    const r3b = Date.parse('2026-09-11T16:00:00Z'); // TIDLIGST i runde 3

    it('sætter puljeLockAt = tidligste kickoff i runden (og kun for spil MED puljeLockRound)', async () => {
      const db = fakeDb({
        'r2-1': { kickoff: new Date(Date.parse('2026-09-05T18:00:00Z')), round: 2 },
        'r3-1': { kickoff: new Date(r3a), round: 3 },
        'r3-2': { kickoff: new Date(r3b), round: 3 }, // tidligst
        'r4-1': { kickoff: new Date(Date.parse('2026-09-20T18:00:00Z')), round: 4 },
      }, { puljeLockRound: 3 });
      const ud = await syncKickoffsCore(db, FieldValue, {
        gameId: 'pl', provider: provider([]), sync: {}, fetchFn: fetchEksploderer,
        nowMs: Date.parse('2026-08-20T12:00:00Z'), dryRun: false,
      });
      expect(ud.puljeLock).toMatchObject({ tilMs: r3b, runde: 3 });
      expect(db._spil.puljeLockAt.getTime()).toBe(r3b); // runde 4 og 2 tæller ikke
    });

    it('følger en FLYTNING: rykkes runde 3-kampen, følger deadlinen med', async () => {
      const nyereR3b = Date.parse('2026-09-13T16:00:00Z'); // flyttet SENERE end r3a
      const db = fakeDb({
        'r3-1': { kickoff: new Date(r3a), round: 3 },
        'r3-2': { kickoff: new Date(r3b), round: 3 },
      }, { puljeLockRound: 3, puljeLockAt: new Date(r3b) });
      // Kilden flytter r3-2 (sourceKey 2) til efter r3a → r3a bliver tidligst.
      await syncKickoffsCore(db, FieldValue, {
        gameId: 'pl',
        provider: provider([{ sourceKey: '2', kickoff: new Date(nyereR3b).toISOString() }]),
        sync: {}, fetchFn: fetchEksploderer,
        nowMs: Date.parse('2026-08-20T12:00:00Z'), dryRun: false,
      });
      expect(db._spil.puljeLockAt.getTime()).toBe(r3a); // nu tidligst
    });

    it('GENÅBNINGS-FORBUD: en passeret deadline skubbes ALDRIG ud i fremtiden', async () => {
      const NU = Date.parse('2026-09-12T00:00:00Z'); // efter r3b (11/9), før r3a (12/9 18:30)
      const db = fakeDb({
        'r3-2': { kickoff: new Date(r3b), round: 3 },
      }, { puljeLockRound: 3, puljeLockAt: new Date(r3b) }); // deadline PASSERET
      // Kilden flytter r3-2 frem til fremtiden → ville genåbne puljen.
      const ud = await syncKickoffsCore(db, FieldValue, {
        gameId: 'pl',
        provider: provider([{ sourceKey: '2', kickoff: '2026-09-20T18:00:00Z' }]),
        sync: {}, fetchFn: fetchEksploderer, nowMs: NU, dryRun: false,
      });
      expect(ud.puljeLock).toBeNull(); // afvist
      expect(db._spil.puljeLockAt.getTime()).toBe(r3b); // urørt — puljen forbliver lukket
    });

    // TM-hul: testen ovenfor rammer det ÆLDRE kickoff-forbud (r3-2's egen
    // kickoff må ikke flyttes til fremtiden), så kampen aldrig når `skrives`
    // og nyMs === nuMs — puljeLock-vagten (!genaabner) blev aldrig DEN, der
    // afgjorde. Her flyttes INGEN kickoff (provider([])): puljeLockAt er en
    // FORÆLDET, passeret dato (fx efter admin har rykket puljeLockRound til en
    // ny runde), mens rundens kampe I FORVEJEN ligger i fremtiden. Fjernes
    // `!genaabner` fra skrivnings-if'et, skubbes deadlinen frem og puljen
    // genåbnes — denne test bliver rød af netop den mutation.
    it('GENÅBNINGS-FORBUD reelt øvet: en forældet passeret puljeLockAt afvises, selv når rundens kampe I FORVEJEN er fremtidige (ingen kickoff flyttes)', async () => {
      const NU = Date.parse('2026-09-12T00:00:00Z');
      const foraeldet = Date.parse('2026-09-01T00:00:00Z'); // PASSERET, ikke nogen kamps kickoff
      const r3fremtid = Date.parse('2026-09-19T16:00:00Z'); // rundens tidligste, i FREMTIDEN
      const db = fakeDb({
        'r3-1': { kickoff: new Date(Date.parse('2026-09-20T18:00:00Z')), round: 3 },
        'r3-2': { kickoff: new Date(r3fremtid), round: 3 },
      }, { puljeLockRound: 3, puljeLockAt: new Date(foraeldet) });
      const ud = await syncKickoffsCore(db, FieldValue, {
        gameId: 'pl', provider: provider([]), sync: {}, fetchFn: fetchEksploderer,
        nowMs: NU, dryRun: false,
      });
      expect(ud.puljeLock).toBeNull();
      expect(ud.puljeLockAfvist).toMatchObject({ fraMs: foraeldet, tilMs: r3fremtid, runde: 3 });
      expect(db._spil.puljeLockAt.getTime()).toBe(foraeldet); // urørt — forbliver eksponeret/lukket
    });

    // TM-hul (mutation 2): fjernes `nyMs > nowMs` fra genaabner, ville selv en
    // LOVLIG rettelse blive afvist. Er BÅDE den gamle og den nye deadline
    // passeret, eksponeres intet nyt, og rettelsen til rundens rigtige (også
    // passerede) tid er harmløs. Denne test bliver rød af den mutation.
    it('to PASSEREDE deadlines: forældet puljeLockAt rettes til rundens tidligste — ingen genåbning', async () => {
      const NU = Date.parse('2026-09-12T00:00:00Z');
      const foraeldet = Date.parse('2026-09-01T00:00:00Z'); // passeret
      const r3passeret = Date.parse('2026-09-05T16:00:00Z'); // rundens tidligste, OGSÅ passeret
      const db = fakeDb({
        'r3-1': { kickoff: new Date(r3passeret), round: 3 },
      }, { puljeLockRound: 3, puljeLockAt: new Date(foraeldet) });
      const ud = await syncKickoffsCore(db, FieldValue, {
        gameId: 'pl', provider: provider([]), sync: {}, fetchFn: fetchEksploderer,
        nowMs: NU, dryRun: false,
      });
      expect(ud.puljeLock).toMatchObject({ tilMs: r3passeret, runde: 3 });
      expect(db._spil.puljeLockAt.getTime()).toBe(r3passeret); // opdateret — begge passeret
    });

    // TM-hul (mutation 3): grænsen skal være `<=`, ikke `<`. Præcis PÅ now er
    // tips netop blevet eksponeret (rules: request.time < puljeLockAt er falsk),
    // så at skubbe frem ville genåbne. `<` ville lade netop det sekund slippe.
    it('grænse: en deadline PRÆCIS på now regnes passeret (<=), så en fremtidig runde-tid afvises', async () => {
      const NU = Date.parse('2026-09-12T00:00:00Z');
      const r3fremtid = Date.parse('2026-09-19T16:00:00Z');
      const db = fakeDb({
        'r3-1': { kickoff: new Date(r3fremtid), round: 3 },
      }, { puljeLockRound: 3, puljeLockAt: new Date(NU) }); // deadline == now
      const ud = await syncKickoffsCore(db, FieldValue, {
        gameId: 'pl', provider: provider([]), sync: {}, fetchFn: fetchEksploderer,
        nowMs: NU, dryRun: false,
      });
      expect(ud.puljeLock).toBeNull();
      expect(db._spil.puljeLockAt.getTime()).toBe(NU); // urørt
    });

    // Security-hærdning: `nuMs != null` fangede IKKE NaN, så en puljeLockAt sat
    // til null (som rules eksponerer — `is undefined` er falsk for null) slap
    // forbi genaabner og kunne skubbes ud i fremtiden. Number.isFinite lukker
    // hullet. Rød mod den GAMLE `nuMs != null`, grøn mod den hærdede kode.
    it('HÆRDNING: en puljeLockAt sat til null (eksponeret) skubbes ikke ud i fremtiden', async () => {
      const NU = Date.parse('2026-09-12T00:00:00Z');
      const r3fremtid = Date.parse('2026-09-19T16:00:00Z');
      const db = fakeDb({
        'r3-1': { kickoff: new Date(r3fremtid), round: 3 },
      }, { puljeLockRound: 3, puljeLockAt: null });
      const ud = await syncKickoffsCore(db, FieldValue, {
        gameId: 'pl', provider: provider([]), sync: {}, fetchFn: fetchEksploderer,
        nowMs: NU, dryRun: false,
      });
      expect(ud.puljeLock).toBeNull();         // afvist — ikke genåbnet
      expect(db._spil.puljeLockAt).toBeNull(); // urørt (stadig null)
    });

    it('et spil UDEN puljeLockRound (Superligaens faste dato) røres aldrig', async () => {
      const fast = new Date(Date.parse('2027-01-01T00:00:00Z'));
      const db = fakeDb({ 'r3-1': { kickoff: new Date(r3a), round: 3 } }, { puljeLockAt: fast });
      await syncKickoffsCore(db, FieldValue, {
        gameId: 'sl', provider: provider([]), sync: {}, fetchFn: fetchEksploderer,
        nowMs: Date.parse('2026-08-20T12:00:00Z'), dryRun: false,
      });
      expect(db._spil.puljeLockAt.getTime()).toBe(fast.getTime()); // uændret
    });

    it('dryRun beregner men skriver ikke', async () => {
      const db = fakeDb({ 'r3-2': { kickoff: new Date(r3b), round: 3 } }, { puljeLockRound: 3 });
      const ud = await syncKickoffsCore(db, FieldValue, {
        gameId: 'pl', provider: provider([]), sync: {}, fetchFn: fetchEksploderer,
        nowMs: Date.parse('2026-08-20T12:00:00Z'), dryRun: true,
      });
      expect(ud.puljeLock).toMatchObject({ tilMs: r3b });
      expect(db._spil.puljeLockAt).toBeUndefined();
    });
  });
});

describe('provider-kontrakten (superliga)', () => {
  it('resolveDocs udelader nøgler uden dokument — kernen skal kunne springe dem over', () => {
    const map = PROVIDERS.superliga.resolveDocs(['r1-a-b', 'r1-x-y'], ['r1-a-b', 'r1-c-d']);
    expect([...map.entries()]).toEqual([['r1-a-b', 'r1-a-b']]);
  });
});

describe('runScheduledSyncAll', () => {
  // Mindste db, pendingMatches kan løbe tør på: range-forespørgslen svarer tomt.
  const tomDb = {
    collection: () => ({
      doc: () => ({
        collection: () => ({
          where: () => ({ where: () => ({ get: async () => ({ docs: [] }) }) }),
        }),
      }),
    }),
  };

  it('kører hvert spil i listen og mærker resultatet med gameId', async () => {
    const ud = await runScheduledSyncAll(tomDb, {}, Date.now());
    expect(ud.map((o) => o.gameId)).toEqual(SYNCED_GAMES.map((g) => g.gameId));
    for (const o of ud) {
      expect(o.pending).toBe(0);
      expect(o.fejl).toBeNull();
    }
  });

  it('kører ALLE spil i listen — ikke kun det første', async () => {
    const ud = await runScheduledSyncAll(tomDb, {}, Date.now(), {
      games: [
        { gameId: 'spil-a', provider: 'superliga', sync: {} },
        { gameId: 'spil-b', provider: 'superliga', sync: {} },
      ],
    });
    expect(ud.map((o) => o.gameId)).toEqual(['spil-a', 'spil-b']);
  });

  it('en ukendt provider springes over — og vælter ikke de andre spil', async () => {
    const ud = await runScheduledSyncAll(tomDb, {}, Date.now(), {
      games: [
        { gameId: 'fremmed', provider: 'findes-ikke', sync: {} },
        { gameId: 'superliga2627', provider: 'superliga', sync: {} },
      ],
    });
    expect(ud.map((o) => o.gameId)).toEqual(['superliga2627']);
  });
});

// ---------------------------------------------------------------------------
// ÆGTE LIVE-CAPTURE (fixtures/pl-live-runde1.json) — PL runde 1, 23/8-2026 kl.
// ~16.30 dansk tid, hentet fra premierleague.com mens to kampe kørte.
//
// Hvorfor den findes: PL_PERIOD_STATUS blev bygget på kamp-niveauets period
// OBSERVERET kun i hvile (PreMatch/FullTime) — live-værdierne var GÆTTET ud
// fra hændelses-niveauet, og drift.md bad om at tjekke loggen for ukendte
// tokens efter første kampaften. Denne capture lukker det punkt med data:
// hele sæson-listen indeholdt PRÆCIS FirstHalf/SecondHalf/FullTime/PreMatch —
// ingen ukendte tokens. Testen holder tolkningen fast mod ægte kildedata.
// ---------------------------------------------------------------------------
describe('pulselive mod ægte live-capture (PL runde 1)', () => {
  const side = JSON.parse(
    readFileSync(new URL('./fixtures/pl-live-runde1.json', import.meta.url), 'utf8'),
  );
  // Én side, ingen _next — capturen er ét kald mod kildens kampliste.
  const fetchFn = async () => ({ ok: true, status: 200, json: async () => side });
  const sync = { competitionId: 8, season: 2026 };

  it('læser præcis de 6 færdige kampe som facit — med kildens cifre', async () => {
    const f = await PROVIDERS.pulselive.hentFaerdige(sync, fetchFn);
    expect(f.map((x) => `${x.sourceKey}=${x.homeGoals}-${x.awayGoals}`)).toEqual([
      '2645195=3-0', '2645198=2-0', '2645197=2-0', '2645199=2-1', '2645200=0-1', '2645196=3-0',
    ]);
  });

  // KERNEN i capturen: to kampe stod i SecondHalf med rigtige cifre. Muteres
  // PL_PERIOD_STATUS.secondhalf væk (eller til noget andet), bliver status
  // 'ukendt', og kortet ville sige blot "DIREKTE" midt i 2. halvleg.
  it('læser de to kampe i gang som "anden" (2. halvleg) med stillingen', async () => {
    const { events, stadigIGang } = await PROVIDERS.pulselive.hentLive(sync, fetchFn);
    expect(events).toEqual([
      { sourceKey: '2645201', home: 4, away: 0, status: 'anden', statusRaw: 'SecondHalf' },
      { sourceKey: '2645202', home: 0, away: 1, status: 'anden', statusRaw: 'SecondHalf' },
    ]);
    // Kun de to spillende kampe — de færdige og de ikke-startede må ALDRIG
    // med, ellers holder de sig selv kunstigt "i gang".
    expect([...stadigIGang]).toEqual(['2645201', '2645202']);
  });

  // Capturen rummer en PreMatch-kamp med score 0-0 i felterne (2645203) —
  // altså en kamp, der IKKE er begyndt, men bærer cifre. Den må hverken læses
  // som et 0-0-facit eller som en kamp i gang. Uden plIGang/period-vagten
  // ville netop den kamp få et falsk uafgjort og afregne point.
  it('en PreMatch-kamp med 0-0 i felterne bliver hverken facit eller live', async () => {
    const f = await PROVIDERS.pulselive.hentFaerdige(sync, fetchFn);
    const live = await PROVIDERS.pulselive.hentLive(sync, fetchFn);
    expect(f.map((x) => x.sourceKey)).not.toContain('2645203');
    expect(live.events.map((e) => e.sourceKey)).not.toContain('2645203');
    expect([...live.stadigIGang]).not.toContain('2645203');
  });

  it('capturen indeholder INGEN period-tokens, vi ikke kender', async () => {
    const ukendte = side.data
      .map((m) => String(m.period || '').toLowerCase())
      .filter((p) => p && !['prematch', 'fulltime', 'firsthalf', 'secondhalf', 'halftime'].includes(p));
    expect(ukendte).toEqual([]);
  });
});
