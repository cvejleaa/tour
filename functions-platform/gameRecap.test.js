import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  sanitizeName, isSurprise, buildRoundRecapFacts, runGameRoundRecap,
  opdaterGamleRundeOpslag, RETTET_TEKST, FEJL_FOER_MS,
} = require('./gameRecap');
// Stillingens egen vej til combi. Botten og stillingen SKAL sige samme tal.
const { opdelPoint, buildRoundContext } = require('./pointOpdeling');

const FieldValue = {
  arrayUnion: (v) => ({ __arrayUnion: [v] }),
  serverTimestamp: () => ({ __ts: true }),
};

describe('sanitizeName', () => {
  it('fjerner kontroltegn og kontekst-brydende tegn, klipper længde', () => {
    expect(sanitizeName('Bo\nBendtsen')).toBe('Bo Bendtsen');
    expect(sanitizeName('X<{`}>Y')).toBe('XY');
    expect(sanitizeName('x'.repeat(60))).toHaveLength(40);
    expect(sanitizeName('')).toBe('Spiller');
    expect(sanitizeName(null)).toBe('Spiller');
  });
});

describe('isSurprise', () => {
  it('true ved udfalds-odds ≥ 3.5, ellers false', () => {
    expect(isSurprise({ result: '2', odds: { 1: 1.5, X: 3.2, 2: 5.1 } })).toBe(true);
    expect(isSurprise({ result: '1', odds: { 1: 1.5, X: 3.2, 2: 5.1 } })).toBe(false);
    expect(isSurprise({ result: '1' })).toBe(false);
  });
});

// Botten skal kunne sige, at runden IKKE er færdigspillet — men kun når det
// passer. En kamp rykket FREM til ugen før ligger også uden for rundens uge,
// og den er spillet; havner den i "udsatte", skriver botten det modsatte af,
// hvad der står på skærmen.
describe('buildRoundRecapFacts — udsatte kampe', () => {
  const spillere = [{ uid: 'A', name: 'Anna', totalPoints: 10, rank: 1 }];
  const facts = (udsatte) => buildRoundRecapFacts({
    round: 3,
    roundMatches: [{ id: 'a', round: 3, home: 'AGF', away: 'OB', homeGoals: 1, awayGoals: 0, result: '1', odds: { 1: 2, X: 4, 2: 4 } }],
    players: spillere,
    betsByUid: new Map([['A', [{ matchId: 'a', pick: '1', points: 3 }]]]),
    udsatte,
  });

  it('tager de uspillede kampe med, så botten ved at runden mangler', () => {
    const f = facts([{ id: 'e', home: 'FCK', away: 'FCM', result: null }]);
    expect(f.udsatte).toEqual([{ home: 'FCK', away: 'FCM' }]);
  });

  it('sender kun hold-navne — ingen uid, stilling eller resultat', () => {
    const f = facts([{ id: 'e', home: 'FCK', away: 'FCM', result: null, uid: 'hemmelig' }]);
    expect(Object.keys(f.udsatte[0])).toEqual(['home', 'away']);
  });

  it('er tom, når hele runden ligger i sin egen uge', () => {
    expect(facts([]).udsatte).toEqual([]);
  });

  // En kamp rykket FREM er også uden for rundens uge — men den er spillet.
  it('tager IKKE en kamp med, der ligger udenfor men allerede er spillet', () => {
    const f = facts([
      { id: 'frem', home: 'SIF', away: 'VFF', result: '1' },
      { id: 'e', home: 'FCK', away: 'FCM', result: null },
    ]);
    expect(f.udsatte).toEqual([{ home: 'FCK', away: 'FCM' }]);
  });
});

describe('buildRoundRecapFacts', () => {
  const roundMatches = [
    { id: 'm1', round: 2, home: 'FCK', away: 'Vejle', homeGoals: 2, awayGoals: 1, result: '1', odds: { 1: 1.6, X: 3.6, 2: 6.0 } },
    { id: 'm2', round: 2, home: 'AGF', away: 'Brøndby', homeGoals: 0, awayGoals: 0, result: 'X', odds: { 1: 2.4, X: 3.7, 2: 2.6 } },
  ];
  const players = [
    { uid: 'A', name: 'Anna', totalPoints: 10, rank: 1, previousRank: 2 },
    { uid: 'B', name: 'Bo', totalPoints: 8, rank: 2, previousRank: 1 },
  ];
  const betsByUid = new Map([
    ['A', [
      { matchId: 'm1', pick: '1', points: 1.6 },
      { matchId: 'm2', pick: 'X', points: 3.7 },
      { matchId: 'old', pick: '1', points: 99 }, // anden runde — må ikke tælle
    ]],
    ['B', [{ matchId: 'm1', pick: '2', points: 0 }]],
  ]);

  it('bygger runde-fakta: roundPoints inkl. combi, standout, leadChanged', () => {
    const f = buildRoundRecapFacts({ round: 2, roundMatches, players, betsByUid, nextRound: 3 });
    expect(f.round).toBe(2);
    expect(f.matches).toEqual([
      { home: 'FCK', away: 'Vejle', score: '2-1', surprise: false },
      { home: 'AGF', away: 'Brøndby', score: '0-0', surprise: true }, // X @ 3.7
    ]);
    // Anna tippede hele runden og ramte alt → combi = 1.6×3.7 = 5.9 (afrundet).
    const anna = f.standings.find((r) => r.name === 'Anna');
    expect(anna.points).toBe(10);
    // 1,6 + 3,7 i 1X2, plus combi = 2·√(1,6×3,7)
    expect(anna.roundPoints).toBe(Math.round((1.6 + 3.7 + 2 * Math.sqrt(1.6 * 3.7)) * 10) / 10);
    expect(f.combi).toEqual([{ name: 'Anna', bonus: Math.round(2 * Math.sqrt(1.6 * 3.7) * 10) / 10 }]);
    expect(f.standout).toBe('Anna');
    expect(f.standoutTie).toBe(false);
    expect(f.leader).toBe('Anna');
    expect(f.previousLeader).toBe('Bo');
    expect(f.leadChanged).toBe(true);
    expect(f.nextRound).toBe(3);
  });

  it('standoutTie når flere deler rundens bedste', () => {
    const tie = new Map([
      ['A', [{ matchId: 'm1', pick: '1', points: 2 }]],
      ['B', [{ matchId: 'm2', pick: 'X', points: 2 }]],
    ]);
    const f = buildRoundRecapFacts({ round: 2, roundMatches, players, betsByUid: tie });
    expect(f.standout).toBe(null);
    expect(f.standoutTie).toBe(true);
    expect(f.roundWinners.sort()).toEqual(['Anna', 'Bo']);
  });
});

// ── runGameRoundRecap: fake db + fake anthropic ─────────────────────────────
function makeDb({
  game = {}, matches = [], players = {}, users = {}, bets = [], leagues = [], messages = {},
} = {}) {
  const posted = []; // beskeder postet på liga-vægge
  const g = { ...game };
  // Beskeder, der ALLEREDE står på væggene, pr. liga-id. De skrives i, når
  // gamle bot-opslag rettes, så testen kan se hvad der landede på dokumentet.
  const vaegge = {};
  const leagueDocs = leagues.map((l, i) => {
    const id = `L${i}`;
    vaegge[id] = (messages[id] || []).map((m) => ({ ...m }));
    const docs = vaegge[id].map((m) => ({
      id: m.id,
      data: () => m,
      ref: {
        // MERGE ER IKKE PYNT. Uden `{ merge: true }` erstattes hele
        // dokumentet, og `createdAt` forsvinder — væggen henter beskeder med
        // orderBy('createdAt'), så opslaget ryger helt ud af listen. En attrap,
        // der kaster andet argument væk, kan ikke se forskel på de to.
        set: async (data, opts) => {
          if (!opts?.merge) throw new Error('set() uden { merge: true } ville slette createdAt og afsender');
          if (Object.values(data).some((v) => v === undefined)) {
            throw new Error('Cannot use undefined as a Firestore value');
          }
          Object.assign(m, data);
        },
      },
    }));
    return {
      id,
      data: () => l,
      ref: {
        collection: (name) => {
          if (name !== 'messages') throw new Error(`uventet subcollection ${name}`);
          return {
            add: async (doc) => { posted.push(doc); },
            where: (field, op, val) => ({
              get: async () => ({ docs: docs.filter((d) => op === '==' && d.data()[field] === val) }),
            }),
          };
        },
      },
    };
  });
  const gameDoc = {
    get: async () => ({ exists: true, data: () => g }),
    set: async (data) => {
      for (const [k, v] of Object.entries(data)) {
        if (v && v.__arrayUnion) g[k] = [...(g[k] || []), ...v.__arrayUnion];
        else g[k] = v;
      }
    },
    collection: (name) => {
      if (name === 'matches') return { get: async () => ({ docs: matches.map((m) => ({ id: m.id, data: () => m })) }) };
      if (name === 'players') return { get: async () => ({ docs: Object.entries(players).map(([uid, d]) => ({ id: uid, data: () => d })) }) };
      if (name === 'bets') {
        return {
          get: async () => ({ docs: bets.map((b) => ({ data: () => b })) }),
          // Botten henter kun rundens tips: where('matchId','in',[...]).
          where: (field, op, vals) => ({
            get: async () => ({
              docs: bets.filter((b) => op === 'in' && vals.includes(b[field]))
                .map((b) => ({ data: () => b })),
            }),
          }),
        };
      }
      if (name === 'leagues') return { get: async () => ({ docs: leagueDocs }) };
      throw new Error(`uventet subcollection ${name}`);
    },
  };
  return {
    _posted: posted,
    _game: g,
    _vaegge: vaegge,
    collection: (name) => {
      // Dokument-id'et skal RAMME. Ignorerede attrappen det, kunne koden rette
      // i et helt andet spil uden at én test blev rød.
      if (name === 'games') {
        return { doc: (id) => { if (id !== 'g1') throw new Error(`ukendt spil ${id}`); return gameDoc; } };
      }
      if (name === 'users') {
        return {
          get: async () => ({ docs: Object.entries(users).map(([uid, d]) => ({ id: uid, data: () => d })) }),
          doc: (uid) => ({ __user: uid }),
        };
      }
      throw new Error(`uventet collection ${name}`);
    },
    // Admin SDK's getAll: hent netop de profiler der skal bruges.
    getAll: async (...refs) => refs.map((r) => ({
      id: r.__user, exists: users[r.__user] != null, data: () => users[r.__user],
    })),
  };
}

const fakeAnthropic = (text = 'Sikke en runde! 🎉') => ({
  messages: { create: async () => ({ content: [{ type: 'text', text }] }) },
});

// ---------------------------------------------------------------------------
// Botten og stillingen skal sige SAMME combi-tal.
//
// De to flader regnede før hver sit sted: gameRecap kaldte en dublet i
// gameScoring, stillingen kaldte pointOpdeling. Dubletten er væk, men en ny kan
// snige sig ind. Denne test er uafhængig af HVILKEN funktion de kalder — den
// fodrer begge veje med samme runde og kræver samme tal. Begge tal låses
// desuden til en konkret værdi, så en fælles nul-fejl ikke består "parvis".
// ---------------------------------------------------------------------------
describe('combi: botten og stillingen', () => {
  const kampe = [
    { id: 'm1', round: 2, home: 'FCK', away: 'Vejle', homeGoals: 2, awayGoals: 1, result: '1', odds: { 1: 1.6, X: 3.6, 2: 6.0 } },
    { id: 'm2', round: 2, home: 'AGF', away: 'Brøndby', homeGoals: 0, awayGoals: 0, result: 'X', odds: { 1: 2.4, X: 3.7, 2: 2.6 } },
  ];
  const tilfaelde = [
    // 2·√(1,6×3,7) = 4,9
    ['alle ramt', { picks: { m1: '1', m2: 'X' }, forventet: 4.9 }],
    // ÉN fejl i en to-kamps runde efterlader ét ramt tip — og ét tip er ingen
    // kupon at gange. Derfor 0, ikke 1,6.
    ['én fejl', { picks: { m1: '1', m2: '1' }, forventet: 0 }],
    ['to fejl', { picks: { m1: '2', m2: '1' }, forventet: 0 }],
  ];
  for (const [navn, { picks, forventet }] of tilfaelde) {
    it(`regner ens: ${navn}`, () => {
      const bets = kampe.map((m) => ({
        matchId: m.id, pick: picks[m.id], points: picks[m.id] === m.result ? m.odds[m.result] : 0,
      }));
      const fakta = buildRoundRecapFacts({
        round: 2,
        roundMatches: kampe,
        players: [{ uid: 'A', name: 'Anna', totalPoints: 10, rank: 1 }],
        betsByUid: new Map([['A', bets]]),
      });
      const botten = (fakta.combi.find((c) => c.name === 'Anna') || { bonus: 0 }).bonus;
      const stillingen = opdelPoint({
        bets, roundCtx: buildRoundContext(kampe), nowMs: 0,
      }).combi;
      expect(botten).toBe(forventet);
      expect(stillingen).toBe(forventet);
      expect(botten).toBe(stillingen);
    });
  }
});

const twoMatches = [
  { id: 'm1', round: 1, home: 'FCK', away: 'Vejle', kickoff: 100, result: '1', homeGoals: 2, awayGoals: 0, odds: { 1: 1.6, X: 3.6, 2: 6 } },
  { id: 'm2', round: 1, home: 'AGF', away: 'OB', kickoff: 200, result: 'X', homeGoals: 1, awayGoals: 1, odds: { 1: 2.4, X: 3.4, 2: 2.6 } },
];
const base = {
  matches: twoMatches,
  players: { A: { totalPoints: 5, rank: 1 }, B: { totalPoints: 3, rank: 2 } },
  users: { A: { displayName: 'Anna' }, B: { displayName: 'Bo' } },
  bets: [{ uid: 'A', matchId: 'm1', pick: '1', points: 1.6 }],
  leagues: [{ memberUids: ['A', 'B'] }, { memberUids: ['A'] }], // kun den første postes
};

// ---------------------------------------------------------------------------
// EN LIGA MÅ KUN HØRE OM SINE EGNE MEDLEMMER.
//
// Fejlen, det her fanger: botten byggede fakta af HELE spillets spillere,
// kaldte modellen ÉN gang og sendte samme tekst til hver ligavæg. På
// "Familien"s væg — syv medlemmer — stod der derfor navne og point fra fire
// spillere, dens medlemmer ikke deler liga med, og en påstand om at én førte
// med 40 point, mens ligaens egen stilling viste en anden i spidsen.
//
// Det brød hele spillets synlighedsmodel. Testen fanger, hvilke NAVNE der
// overhovedet når frem til modellen, ikke hvad den svarer.
// ---------------------------------------------------------------------------
describe('runGameRoundRecap — én liga må kun høre om sine egne', () => {
  const kampe = [
    { id: 'm1', round: 1, home: 'FCK', away: 'Vejle', kickoff: 100, result: '1', homeGoals: 2, awayGoals: 0, odds: { 1: 1.6, X: 3.6, 2: 6 } },
    { id: 'm2', round: 1, home: 'AGF', away: 'OB', kickoff: 200, result: 'X', homeGoals: 1, awayGoals: 1, odds: { 1: 2.4, X: 3.4, 2: 2.6 } },
  ];
  // To ligaer UDEN fælles medlemmer.
  const opsaetning = {
    matches: kampe,
    players: {
      A: { totalPoints: 40, rank: 1, previousRank: 1 },
      B: { totalPoints: 30, rank: 2, previousRank: 2 },
      C: { totalPoints: 20, rank: 3, previousRank: 3 },
      D: { totalPoints: 10, rank: 4, previousRank: 4 },
    },
    users: {
      A: { displayName: 'Anna' }, B: { displayName: 'Bo' },
      C: { displayName: 'Cecilie' }, D: { displayName: 'David' },
    },
    bets: [
      { uid: 'A', matchId: 'm1', pick: '1', points: 2.6 },
      { uid: 'C', matchId: 'm1', pick: '1', points: 2.6 },
    ],
    leagues: [
      { name: 'Familien', memberUids: ['A', 'B'] },
      { name: 'Kollegerne', memberUids: ['C', 'D'] },
    ],
  };

  /** Fanger den JSON, der faktisk sendes til modellen — ét kald pr. liga. */
  const optagende = () => {
    const kald = [];
    return {
      kald,
      messages: {
        create: async ({ messages }) => {
          kald.push(JSON.parse(messages[0].content));
          return { content: [{ type: 'text', text: 'ok' }] };
        },
      },
    };
  };

  it('kalder modellen én gang PR. LIGA, ikke én gang for spillet', async () => {
    const db = makeDb(opsaetning);
    const a = optagende();
    await runGameRoundRecap(db, FieldValue, a, 'g1', 1);
    expect(a.kald).toHaveLength(2);
    expect(db._posted).toHaveLength(2);
  });

  it('sender ALDRIG en fremmed spillers navn med til modellen', async () => {
    const db = makeDb(opsaetning);
    const a = optagende();
    await runGameRoundRecap(db, FieldValue, a, 'g1', 1);
    const navne = a.kald.map((f) => f.standings.map((r) => r.name).sort());
    expect(navne).toContainEqual(['Anna', 'Bo']);
    expect(navne).toContainEqual(['Cecilie', 'David']);
    // Ingen af de to opslag må kende alle fire.
    for (const n of navne) expect(n).toHaveLength(2);
  });

  it('regner placeringen INDEN FOR ligaen, ikke i hele spillet', async () => {
    const db = makeDb(opsaetning);
    const a = optagende();
    await runGameRoundRecap(db, FieldValue, a, 'g1', 1);
    // Cecilie er nr. 3 i spillet, men nr. 1 blandt Kollegerne — og det er
    // dét, hendes egen liga kan se på skærmen.
    const kolleger = a.kald.find((f) => f.standings.some((r) => r.name === 'Cecilie'));
    expect(kolleger.standings.map((r) => [r.name, r.rank]))
      .toEqual([['Cecilie', 1], ['David', 2]]);
    expect(kolleger.leader).toBe('Cecilie');
  });

  it('springer en liga over, hvis under to af dens medlemmer er spillere', async () => {
    const db = makeDb({
      ...opsaetning,
      leagues: [{ name: 'Alene', memberUids: ['A', 'ukendt-uid'] }],
    });
    const a = optagende();
    const out = await runGameRoundRecap(db, FieldValue, a, 'g1', 1);
    expect(a.kald).toHaveLength(0);
    expect(out.posted).toBe(0);
  });
});

describe('runGameRoundRecap', () => {
  it('poster på liga-vægge med ≥2 medlemmer og markerer runden', async () => {
    const db = makeDb(base);
    const out = await runGameRoundRecap(db, FieldValue, fakeAnthropic(), 'g1', null);
    expect(out.round).toBe(1);
    expect(out.posted).toBe(1); // kun ligaen med 2 medlemmer
    expect(db._posted[0]).toMatchObject({
      uid: 'runde-bot', displayName: 'Runde-Botten', system: true, text: 'Sikke en runde! 🎉',
      // Rundenummeret SKAL med. Uden det kan opslaget ikke findes igen, og en
      // senere rettelse må gætte sig frem på rækkefølge.
      round: 1,
    });
    expect(db._game.recappedRounds).toEqual([1]);
  });

  it('dryRun returnerer ét udkast PR. LIGA uden at poste', async () => {
    const db = makeDb(base);
    const out = await runGameRoundRecap(db, FieldValue, fakeAnthropic('preview'), 'g1', null, { dryRun: true });
    expect(out).toMatchObject({ dryRun: true, round: 1, posted: 0 });
    // Teksten er ikke længere ÉN — hver liga har sin egen, fordi hver liga
    // kun må høre om sine egne medlemmer.
    expect(out.udkast.length).toBeGreaterThan(0);
    expect(out.udkast[0]).toMatchObject({ text: 'preview' });
    expect(out.udkast[0].leagueId).toBeTruthy();
    expect(db._posted).toHaveLength(0);
    expect(db._game.recappedRounds).toBeUndefined();
  });

  it('idempotent: poster ikke to gange for samme runde', async () => {
    const db = makeDb({ ...base, game: { recappedRounds: [1] } });
    const out = await runGameRoundRecap(db, FieldValue, fakeAnthropic(), 'g1', 1);
    expect(out).toMatchObject({ posted: 0, reason: 'already', round: 1 });
  });

  it('nægter at skrive om en ikke-afgjort runde', async () => {
    const unsettled = [...twoMatches.map((m) => ({ ...m })), { id: 'm3', round: 2, kickoff: 300 }];
    const db = makeDb({ ...base, matches: unsettled });
    const out = await runGameRoundRecap(db, FieldValue, fakeAnthropic(), 'g1', 2);
    expect(out).toMatchObject({ posted: 0, reason: 'round-not-settled', round: 2 });
  });

  it('respekterer start-gaten: runde før startAt findes ikke for botten', async () => {
    const db = makeDb({ ...base, game: { startAt: 150 } }); // m1 (kickoff 100) gated væk
    const out = await runGameRoundRecap(db, FieldValue, fakeAnthropic(), 'g1', null);
    // Runde 1 består nu kun af m2 (kickoff 200) — stadig afgjort, så den recappes.
    expect(out.round).toBe(1);
    expect(out.posted).toBe(1);
  });

  it('springer over når aiRecaps er slået fra', async () => {
    const db = makeDb({ ...base, game: { aiRecaps: false } });
    const out = await runGameRoundRecap(db, FieldValue, fakeAnthropic(), 'g1', null);
    expect(out).toMatchObject({ posted: 0, reason: 'disabled' });
  });
});

// ---------------------------------------------------------------------------
// At rette de ALLEREDE POSTEDE opslag.
//
// Vi skriver i noget, tolv mennesker har læst. Tre ting skal derfor holde:
// forhåndsvisningen skal vise PRÆCIS det, der bliver skrevet (ellers godkender
// man tekst A og væggen får tekst B); der må ikke gættes på, hvilket opslag der
// rammes; og den oprindelige tekst skal kunne findes frem igen.
// ---------------------------------------------------------------------------
describe('opdaterGamleRundeOpslag', () => {
  const FOER = FEJL_FOER_MS - 60_000; // postet før udrulningen af #110 → forkert
  const EFTER = FEJL_FOER_MS + 60_000; // postet efter → allerede korrekt pr. liga
  const bot = (id, ms = FOER, extra = {}) => ({
    id, uid: 'runde-bot', text: `gammelt ${id}`, createdAt: { toMillis: () => ms }, ...extra,
  });
  const opsaetning = {
    leagues: [{ name: 'Familien', memberUids: ['A', 'B'] }, { name: 'Kollegerne', memberUids: ['C', 'D'] }],
    messages: { L0: [bot('m2', FOER + 2), bot('m1', FOER + 1)], L1: [bot('m3')] },
  };

  it('dryRun rører intet og viser den tekst, der VIL blive skrevet', async () => {
    const db = makeDb(opsaetning);
    const out = await opdaterGamleRundeOpslag(db, FieldValue, 'g1');
    expect(out).toMatchObject({ dryRun: true, rettede: 0 });
    expect(out.udkast).toHaveLength(3);
    // Forhåndsvisningen er bindende: samme faste tekst i udkast og på væggen.
    for (const u of out.udkast) expect(u.nyTekst).toBe(RETTET_TEKST);
    for (const m of [...db._vaegge.L0, ...db._vaegge.L1]) expect(m.text).toMatch(/^gammelt/);

    const skrevet = await opdaterGamleRundeOpslag(db, FieldValue, 'g1', { dryRun: false });
    expect(skrevet.rettede).toBe(3);
    for (const m of [...db._vaegge.L0, ...db._vaegge.L1]) expect(m.text).toBe(RETTET_TEKST);
  });

  it('gemmer den oprindelige tekst, så rettelsen kan rulles tilbage', async () => {
    const db = makeDb(opsaetning);
    await opdaterGamleRundeOpslag(db, FieldValue, 'g1', { dryRun: false });
    expect(db._vaegge.L0.map((m) => m.oprindeligTekst).sort()).toEqual(['gammelt m1', 'gammelt m2']);
    expect(db._vaegge.L0.every((m) => m.rettetAt)).toBe(true);
  });

  // Beskeden skal FLETTES, ikke erstattes. Uden `createdAt` falder opslaget ud
  // af væggens `orderBy('createdAt')` og forsvinder helt for spillerne — og så
  // står den eneste kopi af originalen i et felt, ingen flade viser.
  it('beholder afsender og tidsstempel på det rettede opslag', async () => {
    const db = makeDb(opsaetning);
    await opdaterGamleRundeOpslag(db, FieldValue, 'g1', { dryRun: false });
    for (const m of [...db._vaegge.L0, ...db._vaegge.L1]) {
      expect(m.uid).toBe('runde-bot');
      expect(m.createdAt).toBeTruthy();
    }
  });

  // Forhåndsvisningen er kun et værn, hvis den viser den tekst, der forsvinder.
  it('viser den gamle tekst i udkastet, så den kan læses før den erstattes', async () => {
    const db = makeDb(opsaetning);
    const out = await opdaterGamleRundeOpslag(db, FieldValue, 'g1');
    expect(out.udkast.map((u) => u.gammelTekst).sort()).toEqual(['gammelt m1', 'gammelt m2', 'gammelt m3']);
    expect(out.udkast.every((u) => u.createdAtMs > 0)).toBe(true);
  });

  // Et opslag uden tekst ville give `oprindeligTekst: undefined`, som Admin
  // SDK'en afviser — MIDT i løkken, efter at andre ligaer er erstattet.
  it('springer et opslag uden tekst over i stedet for at vælte midt i løkken', async () => {
    const db = makeDb({
      ...opsaetning,
      messages: { L0: [bot('m1'), { id: 'm2', uid: 'runde-bot', createdAt: { toMillis: () => FOER } }], L1: [] },
    });
    const out = await opdaterGamleRundeOpslag(db, FieldValue, 'g1', { dryRun: false });
    expect(out.rettede).toBe(1);
    expect(out.udkast.find((u) => u.messageId === 'm2')).toMatchObject({ reason: expect.stringContaining('tekst') });
  });

  // Var den oprindelige tekst tom, må en falsy-test ikke tage opslaget igen og
  // gemme rettelsesteksten som "original".
  it('regner en tom oprindeligTekst som allerede rettet', async () => {
    const db = makeDb({
      ...opsaetning,
      messages: { L0: [bot('m1', FOER, { oprindeligTekst: '' })], L1: [] },
    });
    const out = await opdaterGamleRundeOpslag(db, FieldValue, 'g1', { dryRun: false });
    expect(out).toMatchObject({ reason: 'ingen-gamle-opslag', rettede: 0 });
  });

  // DET FARLIGE TILFÆLDE. Det oplagte greb — "opslag uden `round`-felt er de
  // forkerte" — er forkert: rundenummeret kom først i DENNE branch, ikke i
  // rettelsen af botten (#110). Mellem de to udrulninger poster botten opslag,
  // der er korrekte pr. liga OG mangler `round`. Overskrives et af dem, mister
  // ligaen et rigtigt referat og får en undskyldning, der lyver om det.
  it('rører ikke et korrekt opslag postet efter #110, selv om det mangler rundenummer', async () => {
    const db = makeDb({
      ...opsaetning,
      messages: {
        L0: [bot('m1'), bot('m9', EFTER, { text: 'rigtigt referat, intet rundenummer' })],
        L1: [bot('m8', EFTER, { round: 4, text: 'rigtigt referat med rundenummer' })],
      },
    });
    const out = await opdaterGamleRundeOpslag(db, FieldValue, 'g1', { dryRun: false });
    expect(out.rettede).toBe(1);
    expect(db._vaegge.L0.find((m) => m.id === 'm9').text).toBe('rigtigt referat, intet rundenummer');
    expect(db._vaegge.L1.find((m) => m.id === 'm8').text).toBe('rigtigt referat med rundenummer');
    expect(db._vaegge.L0.find((m) => m.id === 'm1').text).toBe(RETTET_TEKST);
  });

  // Et opslag uden brugbart tidsstempel kan ikke placeres i forhold til
  // udrulningen. Så lad være — men lad det ses.
  it('rører ikke et opslag uden tidsstempel, men melder det', async () => {
    const db = makeDb({
      ...opsaetning,
      messages: { L0: [{ id: 'm1', uid: 'runde-bot', text: 'uden tid' }], L1: [] },
    });
    const out = await opdaterGamleRundeOpslag(db, FieldValue, 'g1', { dryRun: false });
    expect(out.rettede).toBe(0);
    expect(out.udkast).toHaveLength(1);
    expect(out.udkast[0]).toMatchObject({ messageId: 'm1', reason: expect.stringContaining('tidsstempel') });
    expect(db._vaegge.L0[0].text).toBe('uden tid');
  });

  // Kører man to gange, må anden kørsel ikke gemme RETTET_TEKST som
  // "oprindelig" — så var sikkerhedskopien væk.
  it('er idempotent: anden kørsel overskriver ikke sikkerhedskopien', async () => {
    const db = makeDb(opsaetning);
    await opdaterGamleRundeOpslag(db, FieldValue, 'g1', { dryRun: false });
    const igen = await opdaterGamleRundeOpslag(db, FieldValue, 'g1', { dryRun: false });
    expect(igen).toMatchObject({ reason: 'ingen-gamle-opslag', rettede: 0 });
    for (const m of db._vaegge.L0) expect(m.oprindeligTekst).toMatch(/^gammelt/);
  });

  it('rører kun bot-opslag, ikke spillernes egne', async () => {
    const db = makeDb({
      ...opsaetning,
      messages: { L0: [{ id: 'p1', uid: 'A', text: 'min egen besked', createdAt: { toMillis: () => FOER } }], L1: [] },
    });
    const out = await opdaterGamleRundeOpslag(db, FieldValue, 'g1', { dryRun: false });
    expect(out).toMatchObject({ reason: 'ingen-gamle-opslag', rettede: 0 });
    expect(db._vaegge.L0[0].text).toBe('min egen besked');
  });

  it('siger fra på et ukendt spil', async () => {
    const db = makeDb(opsaetning);
    db.collection = (name) => (name === 'games' ? { doc: () => ({ get: async () => ({ exists: false }) }) } : null);
    expect(await opdaterGamleRundeOpslag(db, FieldValue, 'nix')).toMatchObject({ reason: 'no-game', rettede: 0 });
  });
});

describe('RETTET_TEKST', () => {
  // Vi skriver ikke om på fortiden i det skjulte — og teksten må ikke selv
  // indeholde tal eller en optakt, der er blevet forkert siden.
  it('siger hvad der gik galt, uden at påstå noget om stillingen', () => {
    expect(RETTET_TEKST).toContain('taget ned');
    expect(RETTET_TEKST).toContain('andre ligaer');
    expect(RETTET_TEKST).not.toMatch(/\d+ point/);
  });

  // Teksten skal ikke love et omskrevet referat, den ikke leverer.
  it('lover ikke et referat, den ikke giver', () => {
    expect(RETTET_TEKST).not.toContain('skrevet om');
  });

  // Samme fejlklasse som "Åbn ligaen →": en tekst, der peger på et klik, der
  // ikke findes. Spillets faner er Tip · 📋 Mine tips · 🏆 Stilling · 🎖️ Pulje
  // · ⚽ Tabel · 📈 Elo · 👥 Ligaer · 🙂 Mit hold · ❓ Guide — ingen "Kampe".
  it('henviser kun til faner, der findes', () => {
    expect(RETTET_TEKST).not.toContain('Kampe');
    expect(RETTET_TEKST).toContain('under Tip');
    expect(RETTET_TEKST).toContain('🏆 Stilling');
  });
});

