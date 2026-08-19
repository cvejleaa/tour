import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  sanitizeName, isSurprise, buildRoundRecapFacts, runGameRoundRecap, RECAP_SYSTEM,
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

// Botten skriver for ALLE fodbold-spil — prompten må ikke binde sig til én
// liga. "en Superliga-rundes egen uge" ville få den til at kalde en Premier
// League-runde noget forkert. Indholds-assertion, ikke visnings-assertion.
describe('RECAP_SYSTEM — liga-neutral', () => {
  it('nævner ingen konkret liga', () => {
    expect(RECAP_SYSTEM).not.toContain('Superliga');
    expect(RECAP_SYSTEM).not.toContain('Premier League');
    // Kernen i formuleringen, der ERSTATTEDE liga-navnet, skal stå der.
    expect(RECAP_SYSTEM).toContain('en rundes egen uge');
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
function makeDb({ game = {}, matches = [], players = {}, users = {}, bets = [], leagues = [] } = {}) {
  const posted = []; // beskeder postet på liga-vægge
  const g = { ...game };
  const leagueDocs = leagues.map((l, i) => {
    const id = `L${i}`;
    return {
      id,
      data: () => l,
      ref: {
        // Navnet skal RAMME. Ignorerede attrappen det, kunne botten poste i en
        // helt anden subcollection uden at én test blev rød.
        collection: (name) => {
          if (name !== 'messages') throw new Error(`uventet subcollection ${name}`);
          // HVILKEN vægs beskeden landede på skal med. Uden `leagueId` kan alle
          // opslag sendes til den første ligas væg uden en rød test — samme
          // påstand som den oprindelige fejl, blot i skrive-enden.
          return { add: async (doc) => { posted.push({ leagueId: id, ...doc }); } };
        },
      },
    };
  });
  const gameDoc = {
    get: async () => ({ exists: true, data: () => g }),
    // MERGE ER IKKE PYNT. Botten skriver kun ét felt på spil-dokumentet
    // (`recappedRounds`). Uden `{ merge: true }` reduceres HELE dokumentet til
    // netop det felt — væk er `startAt`, invarianten der gater både visning,
    // pointgivning og påmindelser, plus `status`, `aiRecaps` og `name`. En
    // attrap, der kaster andet argument væk, kan ikke se forskel på de to.
    set: async (data, opts) => {
      if (!opts?.merge) throw new Error('set() uden { merge: true } ville nulstille spillets øvrige felter (bl.a. startAt)');
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

  // Modellen kan få de rigtige navne og teksten alligevel havne det forkerte
  // sted. Fejlen var, at ÉN tekst gik ud til alle vægge — den påstand skal
  // også holdes i skrive-enden, ikke kun i det, der sendes til modellen.
  it('lægger hver ligas egen tekst på dens egen væg', async () => {
    const db = makeDb(opsaetning);
    const a = {
      messages: {
        create: async ({ messages }) => {
          const f = JSON.parse(messages[0].content);
          // Teksten navngiver ligaens egen fører, så den kan spores til væggen.
          return { content: [{ type: 'text', text: `Opslag om ${f.leader}` }] };
        },
      },
    };
    await runGameRoundRecap(db, FieldValue, a, 'g1', 1);
    const perVaeg = Object.fromEntries(db._posted.map((p) => [p.leagueId, p.text]));
    // Familien = A+B (Anna fører), Kollegerne = C+D (Cecilie fører).
    expect(Object.values(perVaeg).sort()).toEqual(['Opslag om Anna', 'Opslag om Cecilie']);
    // …og de to tekster må ikke ligge på samme væg.
    expect(Object.keys(perVaeg)).toHaveLength(2);
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

// ---------------------------------------------------------------------------
// LIGAENS STARTRUNDE HOS BOTTEN.
//
// En liga fra runde 20 har ingen runde 3: botten må hverken skrive et opslag
// om den eller regne dens point med. Og totalerne i opslaget skal være
// LIGAENS — regnet af runde-vektoren med `ligaPoint`, samme modul som fladen.
// ---------------------------------------------------------------------------
describe('runGameRoundRecap — ligaens startrunde', () => {
  const KAMPE = [
    { id: 'm1', round: 2, home: 'FCK', away: 'Vejle', kickoff: 100, result: '1', homeGoals: 2, awayGoals: 0, odds: { 1: 1.6, X: 3.6, 2: 6 } },
    { id: 'm2', round: 2, home: 'AGF', away: 'OB', kickoff: 200, result: 'X', homeGoals: 1, awayGoals: 1, odds: { 1: 2.4, X: 3.4, 2: 2.6 } },
  ];
  const SPILLERE = {
    A: { totalPoints: 30, rank: 1, perRound: { 1: 20, 2: 10 }, bonusPoints: 0 },
    B: { totalPoints: 24, rank: 2, perRound: { 1: 2, 2: 22 }, bonusPoints: 0 },
  };
  const USERS = { A: { displayName: 'Anna' }, B: { displayName: 'Bo' } };

  /** fakeAnthropic, der OPTAGER fakta-beskeden, modellen får.
   *  Selve user-beskeden, IKKE JSON.stringify af hele kaldet — det ville
   *  escape fakta-strengens citationstegn, og assertions på '"points":22'
   *  ville aldrig matche, selv når tallet står der. */
  const optager = () => {
    const set = [];
    return {
      set,
      messages: {
        create: async (arg) => {
          set.push(arg.messages.map((m) => m.content).join(' '));
          return { content: [{ type: 'text', text: 'Opslag! 🎉' }] };
        },
      },
    };
  };

  it('springer en liga over, hvis runden ligger før dens start', async () => {
    const db = makeDb({
      matches: KAMPE, players: SPILLERE, users: USERS, bets: [],
      leagues: [{ name: 'Kontoret', memberUids: ['A', 'B'], startRound: 3 }],
    });
    const out = await runGameRoundRecap(db, FieldValue, fakeAnthropic(), 'g1', 2);
    expect(out.posted).toBe(0);
  });

  it('bruger LIGAENS totaler i fakta — ikke spillets', async () => {
    const ai = optager();
    const db = makeDb({
      matches: KAMPE, players: SPILLERE, users: USERS,
      bets: [{ uid: 'A', matchId: 'm1', pick: '1', points: 1.6 }],
      leagues: [{ name: 'Kontoret', memberUids: ['A', 'B'], startRound: 2 }],
    });
    const out = await runGameRoundRecap(db, FieldValue, ai, 'g1', 2);
    expect(out.posted).toBe(1);
    const fakta = ai.set.join(' ');
    // Ligaens skala: Anna 10, Bo 22 — Bo fører. Spillets 30/24 må IKKE optræde.
    expect(fakta).toContain('"points":22');
    expect(fakta).toContain('"points":10');
    expect(fakta).not.toContain('"points":30');
    expect(fakta).not.toContain('"points":24');
  });

  // Puljebonussen kan ikke skelnes fra 0 i fixturerne ovenfor — alle spillere
  // har bonusPoints: 0, så omregningen kunne droppe den med grøn suite. Her
  // HAR Bo puljen, og ligaen (startrunde 2 ≤ grænsen på 3) skal tælle den med.
  it('tager puljebonussen med, når ligaens startrunde tillader den', async () => {
    const ai = optager();
    const db = makeDb({
      matches: KAMPE, users: USERS,
      players: { ...SPILLERE, B: { ...SPILLERE.B, bonusPoints: 34 } },
      bets: [{ uid: 'A', matchId: 'm1', pick: '1', points: 1.6 }],
      leagues: [{ name: 'Kontoret', memberUids: ['A', 'B'], startRound: 2 }],
    });
    const out = await runGameRoundRecap(db, FieldValue, ai, 'g1', 2);
    expect(out.posted).toBe(1);
    const fakta = ai.set.join(' ');
    // Bo: runde 2 (22) + pulje (34) = 56. Uden bonussen stod der 22 — og et
    // ligamedlem med pulje ville mangle den i Runde-Bottens opslag.
    expect(fakta).toContain('"points":56');
    expect(fakta).not.toContain('"points":22');
  });

  it('poster som hidtil for en liga uden startrunde', async () => {
    const db = makeDb({
      matches: KAMPE, players: SPILLERE, users: USERS,
      bets: [{ uid: 'A', matchId: 'm1', pick: '1', points: 1.6 }],
      leagues: [{ name: 'Familien', memberUids: ['A', 'B'] }],
    });
    const out = await runGameRoundRecap(db, FieldValue, fakeAnthropic(), 'g1', 2);
    expect(out.posted).toBe(1);
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
      // senere nedtagning må afgrænse groft på tidspunkt i stedet for at ramme
      // præcist på runde.
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

  // DEN HER TEST BESKREV FØR FEJLEN SOM ØNSKET ADFÆRD. Der stod ordret:
  // "Runde 1 består nu kun af m2 (kickoff 200) — stadig afgjort, så den
  // recappes", og den forventede `round: 1, posted: 1`. Altså: botten skrev et
  // opslag om en runde, den havde set HALVDELEN af, fordi startAt lå mellem
  // dens to kampe. Det er ikke en kant — det er hele grunden til, at gaten nu
  // følger runder.
  it('gater HELE runden, når det gamle startAt lå midt i den', async () => {
    const db = makeDb({ ...base, game: { startAt: 150 } }); // midt i runde 1
    const out = await runGameRoundRecap(db, FieldValue, fakeAnthropic(), 'g1', null);
    expect(out.posted).toBe(0);
    expect(out.round).toBeUndefined();
  });

  // …og ligger datoen FØR runden, er hele runden med. Gaten runder altid OP til
  // en hel runde: en kamp, der blev spillet før spillet fandtes, må aldrig give
  // point, for ingen kunne have tippet den.
  it('tager hele runden med, når startAt ligger før dens første kamp', async () => {
    const db = makeDb({ ...base, game: { startAt: 50 } });
    const out = await runGameRoundRecap(db, FieldValue, fakeAnthropic(), 'g1', null);
    expect(out.round).toBe(1);
    expect(out.posted).toBe(1);
  });

  it('respekterer en startrunde direkte', async () => {
    const db = makeDb({ ...base, game: { startRound: 2 } });
    const out = await runGameRoundRecap(db, FieldValue, fakeAnthropic(), 'g1', null);
    expect(out.posted).toBe(0);
  });

  it('springer over når aiRecaps er slået fra', async () => {
    const db = makeDb({ ...base, game: { aiRecaps: false } });
    const out = await runGameRoundRecap(db, FieldValue, fakeAnthropic(), 'g1', null);
    expect(out).toMatchObject({ posted: 0, reason: 'disabled' });
  });
});

// ---------------------------------------------------------------------------
// Chancen i fakta (opgave #29, spilfører-rådgivet): odds/valg/ramt/netto pr.
// chance, forudberegnet største gevinst/tab, kollektivt ingenChancer — og
// SAMME tal som PointOpdeling (væggen må aldrig sige ét tal og fladen et andet).
// ---------------------------------------------------------------------------
describe('buildRoundRecapFacts — Chancen', () => {
  const roundMatches = [
    { id: 'm1', round: 2, home: 'FCK', away: 'Vejle', homeGoals: 2, awayGoals: 1, result: '1', odds: { 1: 1.6, X: 3.6, 2: 6.0 } },
    { id: 'm2', round: 2, home: 'AGF', away: 'Brøndby', homeGoals: 0, awayGoals: 0, result: 'X', odds: { 1: 2.4, X: 3.7, 2: 2.6 } },
  ];
  const players = [
    { uid: 'A', name: 'Anna', totalPoints: 10, rank: 1 },
    { uid: 'B', name: 'Bo', totalPoints: 8, rank: 2 },
  ];
  // Anna: ramt chance (indsats 3 @ 1.6 → +2 oven i 1X2-pointene).
  // Bo: tabt chance (indsats 3 → −3).
  const betsByUid = new Map([
    ['A', [{ matchId: 'm1', pick: '1', points: 3.6, chanceStake: 3 }]],
    ['B', [{ matchId: 'm1', pick: '2', points: -3, chanceStake: 3 }]],
  ]);

  it('bygger chancer med kamp, valg, odds, ramt og netto — og forudberegner største', () => {
    const f = buildRoundRecapFacts({ round: 2, roundMatches, players, betsByUid });
    expect(f.chancer).toEqual([
      { name: 'Anna', kamp: 'FCK–Vejle', valg: '1', odds: 1.6, indsats: 3, ramt: true, netto: 2 },
      { name: 'Bo', kamp: 'FCK–Vejle', valg: '2', odds: 6.0, indsats: 3, ramt: false, netto: -3 },
    ]);
    expect(f.stoersteGevinst).toEqual({ name: 'Anna', netto: 2 });
    expect(f.stoersteTab).toEqual({ name: 'Bo', netto: -3 });
    expect(f.ingenChancer).toBe(false);
  });

  it('ramt afspejler 1X2-tippet, ikke det samlede netto', () => {
    // TM-fund: mutationen 'ramt: netto > 0' overlevede, fordi tip og netto
    // havde samme fortegn i alle fixtures. Virkelighedens kant: indsats 1 på
    // odds 1.3 rammer, men gevinsten runder til 0 — chancen ER ramt, netto 0.
    const kanter = [
      { id: 'm9', round: 2, home: 'OB', away: 'Silkeborg', homeGoals: 1, awayGoals: 0, result: '1', odds: { 1: 1.3, X: 4.0, 2: 8.0 } },
    ];
    const lavOdds = new Map([['A', [{ matchId: 'm9', pick: '1', points: 1.3, chanceStake: 1 }]]]);
    const f = buildRoundRecapFacts({
      round: 2, roundMatches: [...roundMatches, ...kanter], players, betsByUid: lavOdds,
    });
    const c = f.chancer.find((x) => x.name === 'Anna');
    expect(c.netto).toBe(0);
    expect(c.ramt).toBe(true); // tippet RAMTE — nettoen er bare rund(1×0.3)=0
  });

  it('siger SAMME netto som PointOpdeling — bottens tal er fladens tal', () => {
    const ctx = buildRoundContext(roundMatches);
    const f = buildRoundRecapFacts({ round: 2, roundMatches, players, betsByUid });
    for (const [uid, navn] of [['A', 'Anna'], ['B', 'Bo']]) {
      const fladen = opdelPoint({ bets: betsByUid.get(uid), roundCtx: ctx }).chance;
      const botten = f.chancer.filter((c) => c.name === navn).reduce((a, c) => a + c.netto, 0);
      expect(botten).toBe(fladen);
    }
  });

  it('uden chancer: tom liste, ingenChancer true og ingen største', () => {
    const uden = new Map([['A', [{ matchId: 'm1', pick: '1', points: 1.6 }]]]);
    const f = buildRoundRecapFacts({ round: 2, roundMatches, players, betsByUid: uden });
    expect(f.chancer).toEqual([]);
    expect(f.ingenChancer).toBe(true);
    expect(f.stoersteGevinst).toBeNull();
    expect(f.stoersteTab).toBeNull();
  });

  it('delt største gevinst → null (som standout: botten må ikke selv kåre)', () => {
    const delt = new Map([
      ['A', [{ matchId: 'm1', pick: '1', points: 3.6, chanceStake: 3 }]],
      ['B', [{ matchId: 'm1', pick: '1', points: 3.6, chanceStake: 3 }]],
    ]);
    const f = buildRoundRecapFacts({ round: 2, roundMatches, players, betsByUid: delt });
    expect(f.stoersteGevinst).toBeNull();
    expect(f.ingenChancer).toBe(false);
  });

  it('en uafgjort kamp giver INGEN chance-post — og en chance uden for ligaen er usynlig', () => {
    const aabne = [{ id: 'm3', round: 2, home: 'OB', away: 'Silkeborg', result: null, odds: { 1: 2.0, X: 3.3, 2: 3.4 } }];
    const medFremmed = new Map([
      ['A', [{ matchId: 'm3', pick: '1', points: 0, chanceStake: 5 }]],
      // 'C' er IKKE i players (anden liga) — må aldrig optræde i fakta.
      ['C', [{ matchId: 'm1', pick: '1', points: 3.6, chanceStake: 3 }]],
    ]);
    const f = buildRoundRecapFacts({
      round: 2, roundMatches: [...roundMatches, ...aabne], players, betsByUid: medFremmed,
    });
    expect(f.chancer).toEqual([]);
    expect(f.ingenChancer).toBe(true);
  });
});

describe('RECAP_SYSTEM — Chancens tone-grænser (spilfører-krav)', () => {
  it('forklarer felterne og sætter de tre ufravigelige grænser', () => {
    for (const s of ['"chancer"', '"stoersteGevinst"', '"ingenChancer"', 'ODDS, ikke i netto']) {
      expect(RECAP_SYSTEM).toContain(s);
    }
    expect(RECAP_SYSTEM).toContain('ÉN ledsætning om en tabt chance');
    expect(RECAP_SYSTEM).toContain('kostede placeringen');
    expect(RECAP_SYSTEM).toContain('ALDRIG med navne');
    expect(RECAP_SYSTEM).toContain('loftet afhænger af spillerens saldo');
  });
});
