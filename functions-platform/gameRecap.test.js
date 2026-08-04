import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  sanitizeName, isSurprise, buildRoundRecapFacts, runGameRoundRecap,
} = require('./gameRecap');
// Stillingens egen vej til combi. Botten og stillingen SKAL sige samme tal.
const { opdelPoint, buildRoundContext } = require('./pointOpdeling');
// Loftet afhænger nu af kuponens størrelse — hent det frem for at skrive et
// tal af, så testen følger stigen i stedet for at fryse ét trin.
const { combiLoft } = require('./superligaScoring');

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
    // 1,6 + 3,7 i tip-point, plus combi. Kuponen er på TO kampe, og 1,6×3,7
    // = 5,9 ligger over loftet for en to-kamps kupon — så combien loftes.
    expect(anna.roundPoints).toBe(Math.round((1.6 + 3.7 + combiLoft(2)) * 10) / 10);
    // 1,6×3,7 = 5,9, men kuponen er på to kampe og loftes.
    expect(f.combi).toEqual([{ name: 'Anna', bonus: combiLoft(2) }]);
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
  const leagueDocs = leagues.map((l, i) => ({
    id: `L${i}`,
    data: () => l,
    ref: { collection: () => ({ add: async (doc) => { posted.push(doc); } }) },
  }));
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
    collection: (name) => {
      if (name === 'games') return { doc: () => gameDoc };
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
  // SEKS kampe, som i virkeligheden. Med to kampe binder loftet (1,5 for en
  // to-kamps kupon), og testen ville kun bevise, at begge sider lofter ens —
  // ikke at de ganger ens.
  const kampe = [0, 1, 2, 3, 4, 5].map((i) => ({
    id: `m${i}`, round: 2, home: `H${i}`, away: `U${i}`,
    homeGoals: 1, awayGoals: 0, result: '1', odds: { 1: 1.5, X: 4.0, 2: 6.0 },
  }));
  const tilfaelde = [
    // 1,5^6 = 11,4 — under loftet på 25, så produktet er synligt.
    ['alle ramt', { forkerte: 0, forventet: 11.4 }],
    // 1,5^5 = 7,6 — under loftet på 12 for én fejl.
    ['én fejl', { forkerte: 1, forventet: 7.6 }],
    ['to fejl', { forkerte: 2, forventet: 0 }],
  ];
  for (const [navn, { forkerte, forventet }] of tilfaelde) {
    it(`regner ens: ${navn}`, () => {
      const bets = kampe.map((m, i) => ({
        matchId: m.id, pick: i < forkerte ? 'X' : '1', points: i < forkerte ? 0 : 1.5,
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

describe('runGameRoundRecap', () => {
  it('poster på liga-vægge med ≥2 medlemmer og markerer runden', async () => {
    const db = makeDb(base);
    const out = await runGameRoundRecap(db, FieldValue, fakeAnthropic(), 'g1', null);
    expect(out.round).toBe(1);
    expect(out.posted).toBe(1); // kun ligaen med 2 medlemmer
    expect(db._posted[0]).toMatchObject({
      uid: 'runde-bot', displayName: 'Runde-Botten', system: true, text: 'Sikke en runde! 🎉',
    });
    expect(db._game.recappedRounds).toEqual([1]);
  });

  it('dryRun returnerer teksten uden at poste', async () => {
    const db = makeDb(base);
    const out = await runGameRoundRecap(db, FieldValue, fakeAnthropic('preview'), 'g1', null, { dryRun: true });
    expect(out).toMatchObject({ dryRun: true, round: 1, text: 'preview', posted: 0 });
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
