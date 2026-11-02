// ---------------------------------------------------------------------------
// FACIT I HÅNDEN — kernen bag saetFacitManuelt og frigivFacitTilSynk.
//
// Det her er en vej, der skriver point i produktion. Testene binder derfor
// tre ting hver for sig: at tør-kørslen IKKE skriver, at den skriver PRÆCIS
// facit-kontrakten + mærket (og intet andet), og at prognosen regner som
// afregningen — 1X2-delta, Chancen, combi og Runde-Botten.
// ---------------------------------------------------------------------------
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { saetFacitCore, frigivFacitCore, tilHttpsFejl, kampAftryk } = require('./manuelFacit');
const { scoreBet } = require('./superligaScoring');

const FieldValue = { serverTimestamp: () => '@ts', delete: () => '@delete' };
const NU = Date.parse('2026-11-02T20:00:00Z');
const FOER = new Date(NU - 3 * 3600 * 1000); // spillet for tre timer siden
const SENERE = new Date(NU + 3600 * 1000);   // ikke begyndt

const ODDS = { 1: 2.0, X: 3.5, 2: 4.0 };

/**
 * Fake-Firestore: games/{g} + matches + bets(where matchId in).
 * `stale` lader en kamp være ændret efter læsningen → update kaster som
 * firebase-admin ved en fejlet precondition.
 */
function makeDb({ game, matches, bets = [], stale = false, gameId = 'g1' }) {
  const docs = new Map(Object.entries(matches).map(([id, d]) => [id, { ...d }]));
  const writes = [];
  const inKald = [];
  const kampSnap = (id) => ({
    id,
    data: () => docs.get(id),
    updateTime: `t-${id}`,
    ref: {
      async update(data, pre) {
        if (stale) { const e = new Error('9 FAILED_PRECONDITION: stale'); e.code = 9; throw e; }
        writes.push({ id, data, pre });
        const cur = { ...docs.get(id) };
        for (const [k, v] of Object.entries(data)) {
          if (v === '@delete') delete cur[k]; else cur[k] = v;
        }
        docs.set(id, cur);
      },
    },
  });
  const db = {
    collection(name) {
      if (name !== 'games') throw new Error(`uventet ${name}`);
      return {
        doc: (id) => ({
          async get() {
            if (id !== gameId || !game) return { exists: false, data: () => undefined };
            return { exists: true, data: () => game };
          },
          collection(sub) {
            if (id !== gameId) throw new Error(`uventet spil ${id}`);
            if (sub === 'matches') return { async get() { return { docs: [...docs.keys()].map(kampSnap) }; } };
            if (sub === 'bets') {
              return {
                where(felt, op, vaerdi) {
                  if (felt !== 'matchId' || op !== 'in') throw new Error(`faken kender ikke ${felt} ${op}`);
                  if (vaerdi.length > 30) throw new Error('Firestore tager højst 30 i en in-forespørgsel');
                  inKald.push(vaerdi);
                  return { async get() { return { docs: bets.filter((b) => vaerdi.includes(b.matchId)).map((b) => ({ data: () => b })) }; } };
                },
              };
            }
            throw new Error(`uventet samling ${sub}`);
          },
        }),
      };
    },
  };
  return { db, docs, writes, inKald };
}

const SL = { type: 'football', status: 'live', name: 'Superligaen' };

/**
 * Sådan skriver fladen: tør-kørsel først, så skrive-kaldet med tør-kørslens
 * aftryk. Et skrive-kald uden aftryk afvises (testet for sig nedenfor).
 */
async function toerOgSkriv(db, args) {
  const toer = await saetFacitCore(db, FieldValue, { ...args, dryRun: true });
  return saetFacitCore(db, FieldValue, { ...args, dryRun: false, aftryk: toer.aftryk });
}

describe('saetFacitCore — tør-kørsel er standard og skriver intet', () => {
  it('uden dryRun: regner, men skriver ikke', async () => {
    const { db, writes } = makeDb({
      game: SL,
      matches: { k1: { round: 1, home: 'AGF', away: 'OB', kickoff: FOER, odds: ODDS } },
    });
    const ud = await saetFacitCore(db, FieldValue, { gameId: 'g1', matchId: 'k1', homeGoals: 2, awayGoals: 1, nowMs: NU });
    expect(ud.dryRun).toBe(true);
    expect(ud.skrevet).toBe(false);
    expect(writes).toEqual([]);
    expect(ud.efter.result).toBe('1');
    // Holdnavne og tid står i svaret — fladen viser aldrig kun id'et.
    expect(ud.kamp).toEqual({ id: 'k1', home: 'AGF', away: 'OB', round: 1, kickoff: FOER.getTime() });
  });
});

describe('saetFacitCore — skrivningen er facit-kontrakten + mærket, intet andet', () => {
  it('skriver result, mål, status, resultatKilde, hvem/hvornår og rydder live, liveMaal og slut', async () => {
    const { db, writes, docs } = makeDb({
      game: SL,
      matches: {
        k1: {
          round: 1, home: 'AGF', away: 'OB', kickoff: FOER, odds: ODDS,
          live: { home: 1, away: 1, status: 'slut' }, liveMaal: [{ min: 3 }],
        },
      },
    });
    const ud = await toerOgSkriv(db, {
      gameId: 'g1', matchId: 'k1', homeGoals: 0, awayGoals: 2, uid: 'admin1', nowMs: NU,
    });
    expect(ud.skrevet).toBe(true);
    expect(writes).toHaveLength(1);
    expect(writes[0].data).toEqual({
      result: '2', homeGoals: 0, awayGoals: 2, status: 'finished',
      resultatKilde: 'manuel', facitSatAf: 'admin1', facitSatAt: '@ts',
      live: '@delete', liveMaal: '@delete', slut: '@delete',
    });
    // Precondition: kun hvis kampen er uændret siden læsningen.
    expect(writes[0].pre).toEqual({ lastUpdateTime: 't-k1' });
    expect(docs.get('k1').resultatKilde).toBe('manuel');
  });

  it('afviser at skrive oven i en kamp, der blev ændret imens — med en besked, der siger det', async () => {
    const { db } = makeDb({
      game: SL, stale: true,
      matches: { k1: { round: 1, kickoff: FOER, odds: ODDS } },
    });
    const p = toerOgSkriv(db, { gameId: 'g1', matchId: 'k1', homeGoals: 1, awayGoals: 0, nowMs: NU });
    await expect(p).rejects.toMatchObject({ kode: 'failed-precondition' });
    await expect(p).rejects.toThrow(/ændret, mens du kiggede.*Intet er skrevet/);
  });

  it('skriver intet, når facit allerede står præcis sådan i hånden', async () => {
    const { db, writes } = makeDb({
      game: SL,
      matches: { k1: { round: 1, kickoff: FOER, odds: ODDS, result: '1', homeGoals: 2, awayGoals: 1, resultatKilde: 'manuel' } },
    });
    const ud = await toerOgSkriv(db, { gameId: 'g1', matchId: 'k1', homeGoals: 2, awayGoals: 1, nowMs: NU });
    expect(ud.ingenAendring).toBe(true);
    expect(ud.skrevet).toBe(false);
    expect(writes).toEqual([]);
  });

  // Synken satte 2-1; admin bekræfter 2-1 i hånden. Ingen point flytter sig,
  // men mærket SKAL skrives — det er selve låsen mod synken.
  it('samme facit som synken satte: skriver mærket (låsen), men ingen point flytter', async () => {
    const { db, writes } = makeDb({
      game: SL,
      matches: { k1: { round: 1, kickoff: FOER, odds: ODDS, result: '1', homeGoals: 2, awayGoals: 1 } },
    });
    const ud = await toerOgSkriv(db, { gameId: 'g1', matchId: 'k1', homeGoals: 2, awayGoals: 1, nowMs: NU });
    expect(ud.ingenAendring).toBe(false);
    expect(ud.udfaldSkifter).toBe(false);
    expect(writes).toHaveLength(1);
    expect(writes[0].data.resultatKilde).toBe('manuel');
  });
});

describe('saetFacitCore — vagterne', () => {
  const kald = (over, matches = { k1: { round: 1, kickoff: FOER, odds: ODDS } }, game = SL) => {
    const { db, writes } = makeDb({ game, matches });
    return { writes, p: toerOgSkriv(db, { gameId: 'g1', matchId: 'k1', homeGoals: 1, awayGoals: 0, nowMs: NU, ...over }) };
  };

  it('afviser en kamp, der ikke er begyndt — tips kan stadig afgives', async () => {
    const { p, writes } = kald({}, { k1: { round: 1, kickoff: SENERE, odds: ODDS } });
    await expect(p).rejects.toMatchObject({ kode: 'failed-precondition' });
    await expect(p).rejects.toThrow(/ikke begyndt/);
    expect(writes).toEqual([]);
  });

  // Grænsen: kickoff præcis NU er begyndt (reglerne låser tips ved kickoff).
  it('accepterer en kamp, hvis kickoff er præcis nu', async () => {
    const { p } = kald({}, { k1: { round: 1, kickoff: new Date(NU), odds: ODDS } });
    await expect(p).resolves.toMatchObject({ skrevet: true });
  });

  it('afviser en kamp uden læseligt kickoff — og siger, at kickoff er remediet', async () => {
    const { p } = kald({}, { k1: { round: 1, kickoff: null, odds: ODDS } });
    await expect(p).rejects.toThrow(/intet læseligt kickoff.*Ret kickoff/);
  });

  it('afviser mål, der ikke er hele tal', async () => {
    await expect(kald({ homeGoals: '2' }).p).rejects.toMatchObject({ kode: 'invalid-argument' });
    await expect(kald({ awayGoals: 1.5 }).p).rejects.toMatchObject({ kode: 'invalid-argument' });
    await expect(kald({ homeGoals: -1 }).p).rejects.toMatchObject({ kode: 'invalid-argument' });
  });

  it('afviser et slutresultat på en kamp uden knockout (SL har ingen faser)', async () => {
    const p = kald({ homeGoals: 1, awayGoals: 1, slut: { home: 2, away: 1, afgjort: 'forlaenget' } }).p;
    await expect(p).rejects.toThrow(/ikke en knockout-kamp/);
  });

  it('afviser et ikke-kampspil og et ukendt spil og en ukendt kamp', async () => {
    await expect(kald({}, undefined, { type: 'cycling', name: 'Touren' }).p).rejects.toThrow(/ikke et kampspil/);
    await expect(kald({ gameId: 'findes-ikke' }).p).rejects.toMatchObject({ kode: 'not-found' });
    await expect(kald({ matchId: 'kx' }).p).rejects.toMatchObject({ kode: 'not-found' });
    await expect(kald({ matchId: '' }).p).rejects.toMatchObject({ kode: 'invalid-argument' });
  });
});

describe('saetFacitCore — knockout (ejerens beslutning: 60 minutter, X er muligt)', () => {
  const HB = {
    type: 'football', status: 'live', sport: 'haandbold', name: 'Håndbold-VM',
    // GYLDIG kalender (faseKalenderFejl): knockout læses af faser.erKnockout.
    faser: [
      { navn: 'Indledende runde', fra: 1, til: 3, start: '2027-01-13' },
      { navn: 'Kvartfinaler', fra: 4, til: 4, start: '2027-01-16', knockout: true },
    ],
  };
  const KO = { k1: { round: 4, home: 'Danmark', away: 'Sverige', kickoff: FOER, odds: ODDS } };

  it('uafgjort efter 60 min kræver slutresultat og afgørelse', async () => {
    const { db } = makeDb({ game: HB, matches: KO });
    await expect(saetFacitCore(db, FieldValue, { gameId: 'g1', matchId: 'k1', homeGoals: 30, awayGoals: 30, nowMs: NU }))
      .rejects.toThrow(/Uafgjort efter ordinær tid i en knockout-kamp/);
  });

  it('X står som facit (det, der tippes på), og slut skrives separat', async () => {
    const { db, writes } = makeDb({ game: HB, matches: KO });
    const ud = await toerOgSkriv(db, {
      gameId: 'g1', matchId: 'k1', homeGoals: 30, awayGoals: 30,
      slut: { home: 35, away: 34, afgjort: 'forlaenget' }, nowMs: NU,
    });
    expect(ud.knockout).toBe(true);
    expect(writes[0].data.result).toBe('X');
    expect(writes[0].data.homeGoals).toBe(30);
    expect(writes[0].data.slut).toEqual({ home: 35, away: 34, afgjort: 'forlaenget' });
  });

  it('rettes en KO-kamp til et facit i ordinær tid, slettes det gamle slut', async () => {
    const { db, writes } = makeDb({
      game: HB,
      matches: { k1: { ...KO.k1, result: 'X', homeGoals: 30, awayGoals: 30, slut: { home: 35, away: 34, afgjort: 'forlaenget' } } },
    });
    const ud = await toerOgSkriv(db, { gameId: 'g1', matchId: 'k1', homeGoals: 31, awayGoals: 30, nowMs: NU });
    expect(writes[0].data.slut).toBe('@delete');
    expect(ud.foer.slut).toEqual({ home: 35, away: 34, afgjort: 'forlaenget' });
    expect(ud.efter.slut).toBeNull();
  });

  // M5: sammeSlut. En RETTELSE af kun slutresultatet (samme ordinære
  // stilling, samme 1X2) på en kamp, der allerede står i hånden, er noget at
  // skrive — ellers kunne "35-34 e.f." aldrig rettes til "35-33".
  it('ret KUN slutresultatet på en manuel KO-kamp: der er noget at skrive', async () => {
    const sat = { ...KO.k1, result: 'X', homeGoals: 30, awayGoals: 30, slut: { home: 35, away: 34, afgjort: 'forlaenget' }, resultatKilde: 'manuel' };
    for (const nyt of [{ home: 35, away: 33, afgjort: 'forlaenget' }, { home: 31, away: 34, afgjort: 'forlaenget' }, { home: 35, away: 34, afgjort: 'straffe' }]) {
      const { db, writes } = makeDb({ game: HB, matches: { k1: sat } });
      const ud = await toerOgSkriv(db, { gameId: 'g1', matchId: 'k1', homeGoals: 30, awayGoals: 30, slut: nyt, nowMs: NU });
      expect(ud.ingenAendring).toBe(false);
      expect(ud.udfaldSkifter).toBe(false);
      expect(writes).toHaveLength(1);
      expect(writes[0].data.slut).toEqual(nyt);
    }
    // ...og præcis det samme slut er stadig intet at skrive.
    const { db, writes } = makeDb({ game: HB, matches: { k1: sat } });
    const ud = await toerOgSkriv(db, { gameId: 'g1', matchId: 'k1', homeGoals: 30, awayGoals: 30, slut: { home: 35, away: 34, afgjort: 'forlaenget' }, nowMs: NU });
    expect(ud.ingenAendring).toBe(true);
    expect(writes).toEqual([]);
  });

  // En kalender, der ikke består formkontrollen (her: Kvartfinaler starter
  // FØR den indledende runde er spillet), tæller ingen steder — heller ikke
  // her. Samme svar som fladen (ManuelFacit.test.jsx), og admin ser fejlen
  // under Spil-tidsplan.
  it('en UGYLDIG kalender kender ingen knockout: slut afvises, X skrives uden slut', async () => {
    const UGYLDIG = { ...HB, faser: [HB.faser[0], { ...HB.faser[1], start: '2027-01-14' }] };
    const { db } = makeDb({ game: UGYLDIG, matches: KO });
    await expect(saetFacitCore(db, FieldValue, {
      gameId: 'g1', matchId: 'k1', homeGoals: 30, awayGoals: 30, slut: { home: 35, away: 34, afgjort: 'forlaenget' }, nowMs: NU,
    })).rejects.toThrow(/ikke en knockout-kamp/);

    const ny = makeDb({ game: UGYLDIG, matches: KO });
    const ud = await toerOgSkriv(ny.db, { gameId: 'g1', matchId: 'k1', homeGoals: 30, awayGoals: 30, nowMs: NU });
    expect(ud.knockout).toBe(false);
    expect(ny.writes[0].data.result).toBe('X');
    expect(ny.writes[0].data.slut).toBe('@delete');
    expect(ud.efter.slut).toBeNull();
  });

  it('en kamp i en ikke-knockout-fase af samme spil kender ikke slut', async () => {
    const { db } = makeDb({ game: HB, matches: { k1: { ...KO.k1, round: 2 } } });
    await expect(saetFacitCore(db, FieldValue, {
      gameId: 'g1', matchId: 'k1', homeGoals: 30, awayGoals: 30, slut: { home: 31, away: 30, afgjort: 'straffe' }, nowMs: NU,
    })).rejects.toThrow(/ikke en knockout-kamp/);
  });
});

describe('saetFacitCore — prognosen regner som afregningen', () => {
  // Runde 1: k1 (rettes) og k2 (afgjort). Tre spillere.
  //   a: tippede 1 på k1 (har 2,0 point for et 1-facit) → facit rettes til 2 → 0
  //   b: tippede 2 på k1 med Chancen 5 → får 4,0 + Chancens gevinst
  //   c: tippede kun k2 — rammes kun af combi, hvis runden ændrer sig
  const game = { ...SL, snapshottedRounds: [] };
  const matches = {
    k1: { round: 1, kickoff: FOER, odds: ODDS, result: '1', homeGoals: 1, awayGoals: 0 },
    k2: { round: 1, kickoff: FOER, odds: ODDS, result: '1', homeGoals: 2, awayGoals: 0 },
    k3: { round: 2, kickoff: SENERE, odds: ODDS },
  };
  const betA = { uid: 'a', matchId: 'k1', pick: '1', points: scoreBet({ pick: '1' }, '1', ODDS) };
  const betB = { uid: 'b', matchId: 'k1', pick: '2', chanceStake: 5, points: scoreBet({ pick: '2', chanceStake: 5 }, '1', ODDS) };
  const betB2 = { uid: 'b', matchId: 'k2', pick: '1', points: scoreBet({ pick: '1' }, '1', ODDS) };
  const betC = { uid: 'c', matchId: 'k2', pick: '1', points: scoreBet({ pick: '1' }, '1', ODDS) };

  it('1X2 skifter: tips, spillere og point-delta = scoreBet efter − gemt før', async () => {
    const { db } = makeDb({ game, matches, bets: [betA, betB, betB2, betC] });
    const ud = await saetFacitCore(db, FieldValue, { gameId: 'g1', matchId: 'k1', homeGoals: 0, awayGoals: 1, nowMs: NU });
    expect(ud.udfaldSkifter).toBe(true);
    expect(ud.foer.result).toBe('1');
    expect(ud.efter.result).toBe('2');
    expect(ud.point.tips).toBe(2);
    expect(ud.point.aendredeTips).toBe(2);
    // Tallene er regnet med de samme funktioner som afregningen (scoreBet og
    // combiPerRunde):
    //   a: 1X2  2,0 → 0     (−2,0); combi 0 → 0 (ét træf giver ingen combi)
    //   b: 1X2 −5,0 → 19,0 (+24,0, Chancen vendt); combi 0 → 5,7 (to træf)
    //   c: intet tip på k1; combi 0 → 0 → flytter sig ikke
    // I alt +27,7, heraf combi +5,7, to spillere.
    expect(scoreBet(betA, '2', ODDS) - betA.points).toBe(-2);
    expect(scoreBet(betB, '2', ODDS) - betB.points).toBe(24);
    expect(ud.point.combi).toBe(5.7);
    expect(ud.point.iAlt).toBe(27.7);
    expect(ud.point.spillere).toBe(2);
    expect(ud.eloFlytter).toBe(true);
  });

  it('henter bets for HELE runden (combi) — men ikke for andre runder', async () => {
    const { db, inKald } = makeDb({ game, matches, bets: [betA] });
    await saetFacitCore(db, FieldValue, { gameId: 'g1', matchId: 'k1', homeGoals: 0, awayGoals: 1, nowMs: NU });
    expect(inKald.flat().sort()).toEqual(['k1', 'k2']);
  });

  it('kun målene rettes (1X2 uændret): intet flytter sig, og der hentes ingen bets', async () => {
    const { db, inKald } = makeDb({ game, matches, bets: [betA, betB] });
    const ud = await saetFacitCore(db, FieldValue, { gameId: 'g1', matchId: 'k1', homeGoals: 3, awayGoals: 0, nowMs: NU });
    expect(ud.udfaldSkifter).toBe(false);
    expect(ud.eloFlytter).toBe(false);
    expect(ud.botPoster).toBe(false);
    expect(ud.point).toEqual({ tips: 0, aendredeTips: 0, spillere: 0, iAlt: 0, combi: 0 });
    expect(inKald).toEqual([]);
  });

  it('Runde-Botten poster, når kampen fuldender runden — og ikke, når runden er gjort op før', async () => {
    const aaben = { ...matches, k1: { round: 1, kickoff: FOER, odds: ODDS } }; // k1 mangler facit
    const r1 = makeDb({ game, matches: aaben, bets: [betC] });
    const ud = await saetFacitCore(r1.db, FieldValue, { gameId: 'g1', matchId: 'k1', homeGoals: 1, awayGoals: 1, nowMs: NU });
    expect(ud.botPoster).toBe(true);

    const r2 = makeDb({ game: { ...game, snapshottedRounds: [1] }, matches: aaben, bets: [betC] });
    expect((await saetFacitCore(r2.db, FieldValue, { gameId: 'g1', matchId: 'k1', homeGoals: 1, awayGoals: 1, nowMs: NU })).botPoster).toBe(false);
  });

  it('Runde-Botten poster ikke, når runden stadig mangler en kamp', async () => {
    const toAabne = { ...matches, k1: { round: 1, kickoff: FOER, odds: ODDS }, k2: { round: 1, kickoff: FOER, odds: ODDS } };
    const { db } = makeDb({ game, matches: toAabne });
    expect((await saetFacitCore(db, FieldValue, { gameId: 'g1', matchId: 'k1', homeGoals: 1, awayGoals: 0, nowMs: NU })).botPoster).toBe(false);
  });

  it('en kamp før spillets startrunde scores aldrig — prognosen siger 0', async () => {
    const { db, inKald } = makeDb({ game: { ...game, startRound: 2 }, matches, bets: [betA, betB] });
    const ud = await saetFacitCore(db, FieldValue, { gameId: 'g1', matchId: 'k1', homeGoals: 0, awayGoals: 1, nowMs: NU });
    expect(ud.gatet).toBe(true);
    expect(ud.point.iAlt).toBe(0);
    expect(ud.botPoster).toBe(false);
    expect(inKald).toEqual([]);
  });
});

// MODSTANDER-FUNDET (blokerende): prognosen gav combi til ALLE med tip i
// runden, men triggeren genberegner kun dem med tip på DENNE kamp
// (gameScoring.spillereTriggerenGenberegner). Tør-kørslen lovede altså point,
// der ikke kom. Nu tælles kun dem, triggeren rører — resten står for sig i
// `senere`, så fladen kan sige det.
describe('saetFacitCore — prognosen tæller kun dem, triggeren genberegner', () => {
  //   Runde 1: k1 (uden facit, sættes til 1-0), k2 (1, 2-0), k3 (2, 0-1).
  //   d: ramte k2 og k3 — INTET tip på k1. combi 0 → 5,7 (2,0 · … to træf)
  //   e: tippede 1 på k1 og 1 på k2. 1X2 +2,0 på k1; combi 0 → 4,0
  // Før rettelsen: { spillere: 2, combi: 9,7, iAlt: 11,7 } — d talt med.
  // Efter:         { spillere: 1, combi: 4,0, iAlt: 6,0 }, senere { 1, 5,7 }.
  const matches = {
    k1: { round: 1, home: 'AGF', away: 'OB', kickoff: FOER, odds: ODDS },
    k2: { round: 1, kickoff: FOER, odds: ODDS, result: '1', homeGoals: 2, awayGoals: 0 },
    k3: { round: 1, kickoff: FOER, odds: ODDS, result: '2', homeGoals: 0, awayGoals: 1 },
  };
  const bets = [
    { uid: 'd', matchId: 'k2', pick: '1', points: scoreBet({ pick: '1' }, '1', ODDS) },
    { uid: 'd', matchId: 'k3', pick: '2', points: scoreBet({ pick: '2' }, '2', ODDS) },
    { uid: 'e', matchId: 'k1', pick: '1', points: 0 },
    { uid: 'e', matchId: 'k2', pick: '1', points: scoreBet({ pick: '1' }, '1', ODDS) },
  ];

  it('d (uden tip på kampen) er IKKE i point-tallene — men står i `senere`', async () => {
    const { db } = makeDb({ game: { ...SL, snapshottedRounds: [] }, matches, bets });
    const ud = await saetFacitCore(db, FieldValue, { gameId: 'g1', matchId: 'k1', homeGoals: 1, awayGoals: 0, nowMs: NU });
    expect(ud.point).toEqual({ tips: 1, aendredeTips: 1, spillere: 1, iAlt: 6, combi: 4 });
    expect(ud.senere).toEqual({ spillere: 1, combi: 5.7 });
    expect(ud.botPoster).toBe(true);
  });

  // f har tippet runden, men IKKE k1, og f's combi flytter sig ikke (ét
  // træf før og efter → 0 → 0). f må ikke tælles i `senere` — ellers lovede
  // fladen "2 spillere får ændret combi" om en, der intet får. Uden
  // `if (c1 === c0) continue;` blev tallet 2 (fundet ved mutation).
  it('en spiller uden tip på kampen, hvis combi IKKE flytter sig, står ikke i `senere`', async () => {
    const f = { uid: 'f', matchId: 'k2', pick: '1', points: scoreBet({ pick: '1' }, '1', ODDS) };
    const { db } = makeDb({ game: { ...SL, snapshottedRounds: [] }, matches, bets: [...bets, f] });
    const ud = await saetFacitCore(db, FieldValue, { gameId: 'g1', matchId: 'k1', homeGoals: 1, awayGoals: 0, nowMs: NU });
    expect(ud.senere).toEqual({ spillere: 1, combi: 5.7 });
    expect(ud.point).toEqual({ tips: 1, aendredeTips: 1, spillere: 1, iAlt: 6, combi: 4 });
  });

  it('uden nogen uden for kampen er `senere` 0 — også når 1X2 er uændret', async () => {
    const { db } = makeDb({ game: SL, matches, bets: bets.filter((b) => b.uid === 'e') });
    const ud = await saetFacitCore(db, FieldValue, { gameId: 'g1', matchId: 'k1', homeGoals: 1, awayGoals: 0, nowMs: NU });
    expect(ud.senere).toEqual({ spillere: 0, combi: 0 });
    const r2 = makeDb({ game: SL, matches: { ...matches, k1: { ...matches.k1, result: '1', homeGoals: 1, awayGoals: 0 } }, bets });
    const ud2 = await saetFacitCore(r2.db, FieldValue, { gameId: 'g1', matchId: 'k1', homeGoals: 2, awayGoals: 0, nowMs: NU });
    expect(ud2.senere).toEqual({ spillere: 0, combi: 0 });
  });

  // Udvælgelsen er DELT, ikke kopieret: kopierede man den, kunne de to drive
  // fra hinanden igen uden en rød test. Bevogtes som tekst (mønstret fra
  // ledningstesten nedenfor) — og gameScoring.test.js binder selve funktionen.
  it('prognosen og triggeren bruger SAMME udvælgelses-funktion', () => {
    const kode = (f) => readFileSync(new URL(f, import.meta.url), 'utf8')
      .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    expect(kode('./manuelFacit.js')).toMatch(/const berorte = spillereTriggerenGenberegner\(bets, kamp\.id\);/);
    expect(kode('./gameScoring.js')).toMatch(/const berorteUids = spillereTriggerenGenberegner\(betsSnap\.docs\.map\(\(d\) => d\.data\(\)\), matchId\);/);
  });
});

// BØR-FUNDET: låsen (opdaterUaendret) beskyttede kun INDEN FOR ét kald. Nu
// bærer tør-kørslen et aftryk, som skrive-kaldet skal sende tilbage.
describe('saetFacitCore — tør-kørslens aftryk binder skrivningen', () => {
  const matches = { k1: { round: 1, home: 'AGF', away: 'OB', kickoff: FOER, odds: ODDS } };
  const args = { gameId: 'g1', matchId: 'k1', homeGoals: 2, awayGoals: 1, nowMs: NU };

  it('et skrive-kald UDEN aftryk afvises — og skriver intet', async () => {
    const { db, writes } = makeDb({ game: SL, matches });
    const p = saetFacitCore(db, FieldValue, { ...args, dryRun: false });
    await expect(p).rejects.toMatchObject({ kode: 'failed-precondition' });
    await expect(p).rejects.toThrow('Facit skrives kun efter en tør-kørsel — tryk "Vis hvad der ændrer sig" først. Intet er skrevet.');
    expect(writes).toEqual([]);
  });

  it('har synken sat facit siden tør-kørslen, afvises skrivningen med en dansk besked', async () => {
    const { db, writes, docs } = makeDb({ game: SL, matches });
    const toer = await saetFacitCore(db, FieldValue, args);
    expect(toer.aftryk).toMatch(/^[0-9a-f]{32}$/);
    // Synken (eller en anden admin) når at skrive imellem.
    docs.set('k1', { ...docs.get('k1'), result: '1', homeGoals: 3, awayGoals: 1, status: 'finished' });
    const p = saetFacitCore(db, FieldValue, { ...args, dryRun: false, aftryk: toer.aftryk });
    await expect(p).rejects.toMatchObject({ kode: 'failed-precondition' });
    await expect(p).rejects.toThrow('Kampen er ændret siden tør-kørslen — kør tør-kørslen igen. Intet er skrevet.');
    await expect(p).rejects.not.toThrow(/kun efter en tør-kørsel/);
    expect(writes).toEqual([]);
  });

  it('nye odds eller et nyt mærke siden tør-kørslen afviser også', async () => {
    for (const aendr of [{ odds: { 1: 1.5, X: 4, 2: 6 } }, { resultatKilde: 'manuel' }, { round: 2 }]) {
      const { db, writes, docs } = makeDb({ game: SL, matches });
      const toer = await saetFacitCore(db, FieldValue, args);
      docs.set('k1', { ...docs.get('k1'), ...aendr });
      await expect(saetFacitCore(db, FieldValue, { ...args, dryRun: false, aftryk: toer.aftryk }))
        .rejects.toThrow(/ændret siden tør-kørslen/);
      expect(writes).toEqual([]);
    }
  });

  // Ikke updateTime: en live-skrivning hvert minut må ikke gøre det umuligt
  // at nå at trykke "Skriv facit".
  it('en live-stilling, der skrives imens, afviser IKKE', async () => {
    const { db, writes, docs } = makeDb({ game: SL, matches });
    const toer = await saetFacitCore(db, FieldValue, args);
    docs.set('k1', { ...docs.get('k1'), live: { home: 2, away: 1, status: '2. halvleg' }, xgHome: 1.2 });
    const ud = await saetFacitCore(db, FieldValue, { ...args, dryRun: false, aftryk: toer.aftryk });
    expect(ud.skrevet).toBe(true);
    expect(writes).toHaveLength(1);
  });

  it('aftrykket afhænger ikke af nøglernes rækkefølge', () => {
    const a = kampAftryk({ round: 1, kickoff: FOER, odds: { 1: 2, X: 3, 2: 4 }, slut: { home: 1, away: 0, afgjort: 'straffe' } });
    const b = kampAftryk({ slut: { afgjort: 'straffe', away: 0, home: 1 }, odds: { 2: 4, X: 3, 1: 2 }, kickoff: FOER, round: 1 });
    expect(a).toBe(b);
    expect(kampAftryk({ round: 1, kickoff: FOER, odds: { 1: 2, X: 3, 2: 4 } })).not.toBe(a);
  });
});

describe('frigivFacitCore — lad synken overtage igen', () => {
  it('fjerner mærket og hvem/hvornår, men lader facit stå', async () => {
    const { db, writes, docs } = makeDb({
      game: SL,
      matches: { k1: { round: 1, kickoff: FOER, result: '1', homeGoals: 2, awayGoals: 1, resultatKilde: 'manuel', facitSatAf: 'a', facitSatAt: 1 } },
    });
    const ud = await frigivFacitCore(db, FieldValue, { gameId: 'g1', matchId: 'k1', dryRun: false });
    expect(ud.frigivet).toBe(true);
    expect(writes[0].data).toEqual({ resultatKilde: '@delete', facitSatAf: '@delete', facitSatAt: '@delete' });
    expect(writes[0].pre).toEqual({ lastUpdateTime: 't-k1' });
    expect(docs.get('k1').result).toBe('1');
    expect(docs.get('k1').resultatKilde).toBeUndefined();
  });

  it('tør-kørsel er standard og skriver intet', async () => {
    const { db, writes } = makeDb({ game: SL, matches: { k1: { round: 1, kickoff: FOER, resultatKilde: 'manuel' } } });
    const ud = await frigivFacitCore(db, FieldValue, { gameId: 'g1', matchId: 'k1' });
    expect(ud).toMatchObject({ dryRun: true, varManuel: true, frigivet: false });
    expect(writes).toEqual([]);
  });

  it('rører ikke en kamp, synken allerede ejer', async () => {
    const { db, writes } = makeDb({ game: SL, matches: { k1: { round: 1, kickoff: FOER, result: '1' } } });
    const ud = await frigivFacitCore(db, FieldValue, { gameId: 'g1', matchId: 'k1', dryRun: false });
    expect(ud).toMatchObject({ varManuel: false, frigivet: false });
    expect(writes).toEqual([]);
  });
});

describe('tilHttpsFejl', () => {
  class HttpsError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
  it('oversætter kernens fejl med SAMME besked — og lader programfejl gå uændret igennem', () => {
    const e = Object.assign(new Error('Mangler kamp-id.'), { kode: 'invalid-argument' });
    const h = tilHttpsFejl(e, HttpsError);
    expect(h).toBeInstanceOf(HttpsError);
    expect(h.code).toBe('invalid-argument');
    expect(h.message).toBe('Mangler kamp-id.');
    const raa = new TypeError('x is undefined');
    expect(tilHttpsFejl(raa, HttpsError)).toBe(raa);
  });

  // ALLE tre koder, kernen kaster med. failed-precondition bærer de vigtigste
  // beskeder (kampen er ændret siden tør-kørslen, kampen er ikke begyndt) —
  // slap den uoversat igennem, så admin "internal" i stedet for beskeden.
  for (const kode of ['invalid-argument', 'not-found', 'failed-precondition']) {
    it(`${kode}: koden og beskeden bevares`, () => {
      const besked = `Besked for ${kode}.`;
      const h = tilHttpsFejl(Object.assign(new Error(besked), { kode }), HttpsError);
      expect(h).toBeInstanceOf(HttpsError);
      expect(h.code).toBe(kode);
      expect(h.message).toBe(besked);
    });
  }

  it('en ukendt kode slipper uoversat igennem', () => {
    const e = Object.assign(new Error('x'), { kode: 'permission-denied' });
    expect(tilHttpsFejl(e, HttpsError)).toBe(e);
  });
});

// index.js kan ikke importeres uden firebase-functions, så LEDNINGEN
// bevogtes som tekst (mønstret fra gameScoring.test.js): begge callables
// kræver admin, tørkører som standard via dryRunFraKald, går gennem kernen og
// oversætter dens fejl — og sweep'et vogter spillene uden synk.
describe('index.js: ledningen til kernerne', () => {
  const kilde = readFileSync(new URL('./index.js', import.meta.url), 'utf8')
    .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  const krop = (navn) => kilde.split(`exports.${navn} = `)[1].split('\nexports.')[0];

  for (const [navn, kerne] of [['saetFacitManuelt', 'saetFacitCore'], ['frigivFacitTilSynk', 'frigivFacitCore']]) {
    it(`${navn}: requireAdmin, dryRunFraKald, ${kerne} og fejl-oversættelsen`, () => {
      const k = krop(navn);
      expect(k).toMatch(/await requireAdmin\(db, request\);/);
      expect(k).toMatch(/const dryRun = dryRunFraKald\(d\);/);
      expect(k).toMatch(new RegExp(`await ${kerne}\\(db, FieldValue, \\{[\\s\\S]*?\\bdryRun\\b[,\\s]`));
      expect(k).toMatch(/throw facitHttpsFejl\(err, HttpsError\);/);
      // requireAdmin FØR kernen — ellers kunne en ikke-admin få en tør-kørsel.
      expect(k.indexOf('requireAdmin')).toBeLessThan(k.indexOf(kerne));
    });
  }

  it('sweep-løkkens strandede-kort bøjer «1 kamp» (ikke «1 kampe»)', () => {
    expect(kilde).toMatch(/st\.fejl\(`\$\{strandede\.length\} \$\{kampOrd\(strandede\.length\)\} uden facit længe efter kickoff/);
    expect(kilde).not.toMatch(/\$\{strandede\.length\} kampe uden facit/);
  });

  it('saetFacitManuelt sender tør-kørslens aftryk videre til kernen', () => {
    expect(krop('saetFacitManuelt')).toMatch(/aftryk: d\.aftryk \?\? null,/);
  });

  // Prognosen henter hele rundens bets (i bidder af 30) — standardens 60 s
  // er for kort i en fuld runde. Fjernes loftet, bliver denne rød.
  it('saetFacitManuelt har sit eget timeout-loft', () => {
    expect(krop('saetFacitManuelt')).toMatch(/^onCall\(\{ region: REGION, timeoutSeconds: 120 \}, async \(request\) => \{/);
  });

  it('saetFacitManuelt sender kalderens uid — ikke et felt fra klienten', () => {
    expect(krop('saetFacitManuelt')).toMatch(/uid: request\.auth\.uid,/);
    expect(krop('saetFacitManuelt')).not.toMatch(/uid: d\./);
  });

  it('sweep\'et kører facit-vagten for spil uden synk FØR løkken over de synkede', () => {
    const sweep = krop('syncSuperligaSweep');
    const vagt = sweep.indexOf('await facitVagtUdenSynk(db, FieldValue, {');
    expect(vagt).toBeGreaterThan(-1);
    expect(vagt).toBeLessThan(sweep.indexOf('for (const g of SYNCED_GAMES)'));
    expect(sweep).toMatch(/synkedeIds: SYNCED_GAMES\.map\(\(g\) => g\.gameId\)/);
    // Og de synkede spil bruger SAMME kerne, med synk-teksten.
    expect(sweep).toMatch(/await meldStrandede\(db, FieldValue, \{[\s\S]*?harSynk: true,/);
  });

  // Facit-vagtens Drift-kort: kortet skrives gennem skrivDriftStatus (som
  // aldrig vælter kørslen) MED kørslens egen db, og fristen er sweep'ets
  // kadence — som en funktion, så beregningen evalueres inde i try'et.
  // Uden skriv: intet kort (tavs). Uden frist: kortet bliver aldrig rødt af
  // en kørsel, der holdt op.
  it('facit-vagtens Drift-kort er ledt gennem skrivDriftStatus med sweep\'ets frist', () => {
    const sweep = krop('syncSuperligaSweep');
    const kald = sweep.split('await facitVagtUdenSynk(db, FieldValue, {')[1].split('});')[0];
    expect(kald).toMatch(/skriv: \(st, o\) => skrivDriftStatus\(st, db, o\),/);
    expect(kald).toMatch(/naesteForventetFoerMs: \(\) => naesteKoerselFoerMs\(Date\.now\(\), \{ timer: SWEEP_TIMER \}\),/);
  });

  // Kampene, sweep'et LIGE har reddet, står stadig uden facit i listen fra
  // før gen-synken. Uden fradraget meldtes de strandede i samme kørsel, som
  // reddede dem.
  it('sweep\'ets strandede-sti trækker de netop rettede kampe fra', () => {
    const sweep = krop('syncSuperligaSweep');
    expect(sweep).toMatch(/netopRettet = new Set\(rettede\);/);
    expect(sweep).toMatch(/gameId: g\.gameId, kampe: alle\.filter\(\(m\) => !netopRettet\.has\(m\.id\)\), harSynk: true,/);
  });

  it('sweep\'et fører synkens manuelleUenige videre til sit Drift-kort', () => {
    const sweep = krop('syncSuperligaSweep');
    expect(sweep).toMatch(/checked, updated, rettede, manuelleUenige,\s*\} = await syncResultsCore\(db, FieldValue, \{ \.\.\.opts, only: alle \}\);/);
    const kald = sweep.indexOf('meldManuelleUenige(st, manuelleUenige);');
    expect(kald).toBeGreaterThan(-1);
    // I SAMME try som resultat-synken (st er kørslens samlede kort) og før
    // kortet skrives.
    expect(kald).toBeLessThan(sweep.indexOf('Sweep ${g.gameId} fejlede (ignoreret)'));
  });
});
