// ---------------------------------------------------------------------------
// reminders.test.js — hvilke kampe der overhovedet må rykkes for.
// ---------------------------------------------------------------------------
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { upcomingMatches } = require('./reminders.js');

/** Firestore-agtigt Timestamp. */
const ts = (ms) => ({ toDate: () => new Date(ms), toMillis: () => ms });

const NOW = Date.UTC(2026, 6, 27, 12, 0, 0);
const H = 3600 * 1000;
const now = new Date(NOW);
const windowEnd = new Date(NOW + 24 * H);

const { gatedeKampe, startRundeFor } = require('./startGate');

describe('upcomingMatches', () => {
  const matches = [
    { id: 'past', kickoff: ts(NOW - 2 * H) },
    { id: 'soon', kickoff: ts(NOW + 3 * H) },
    { id: 'later', kickoff: ts(NOW + 20 * H) },
    { id: 'next-week', kickoff: ts(NOW + 200 * H) },
    { id: 'no-kickoff' },
  ];

  it('tager kun kampe i det næste døgn', () => {
    expect(upcomingMatches(matches, now, windowEnd).map((m) => m.id)).toEqual(['soon', 'later']);
  });

  // GATEN ER ET SÆT AF KAMPE, IKKE ET TIDSPUNKT. Den kommer fra `startGate`,
  // altså nøjagtig den samme mængde, pointgivningen bruger — så en spiller
  // ikke kan blive rykket for en kamp, der ikke giver point. Da den var et
  // tidspunkt, kunne de to svare forskelligt på en runde, der lå spredt.
  it('springer gatede kampe over', () => {
    expect(upcomingMatches(matches, now, windowEnd, new Set(['soon'])).map((m) => m.id))
      .toEqual(['later']);
  });

  it('uden gate rykkes der for alt i vinduet', () => {
    expect(upcomingMatches(matches, now, windowEnd, null).map((m) => m.id)).toEqual(['soon', 'later']);
    expect(upcomingMatches(matches, now, windowEnd, new Set()).map((m) => m.id)).toEqual(['soon', 'later']);
  });

  it('er hele runden gatet, rykkes der slet ikke', () => {
    expect(upcomingMatches(matches, now, windowEnd, new Set(['soon', 'later']))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// …OG GATEN SKAL KOMME FRA SPILLET, ikke fra et tal, kaldestedet fandt på.
//
// `upcomingMatches` kan ikke selv se, om sættet er rigtigt. Den her test går
// gennem `startGate` med et spil-dokument, som kaldestederne gør.
// ---------------------------------------------------------------------------
describe('påmindelser bruger spillets startrunde', () => {
  const kampe = [
    { id: 'r1', round: 1, kickoff: ts(NOW + 3 * H) },
    { id: 'r2', round: 2, kickoff: ts(NOW + 20 * H) },
  ];

  it('rykker ikke for en runde under startrunden', () => {
    const gatede = gatedeKampe(kampe, startRundeFor({ startRound: 2 }, kampe));
    expect(upcomingMatches(kampe, now, windowEnd, gatede).map((m) => m.id)).toEqual(['r2']);
  });

  it('rykker for alt, når spillet ingen startrunde har', () => {
    const gatede = gatedeKampe(kampe, startRundeFor({}, kampe));
    expect(upcomingMatches(kampe, now, windowEnd, gatede).map((m) => m.id)).toEqual(['r1', 'r2']);
  });
});

// ---------------------------------------------------------------------------
// byggTipStatus (opgave #37) — kortet må ALDRIG modsige 'Send påmindelser
// nu'-knappen lige under det: "haster" og rammesAfKnappenNu bruger knappens
// EGET vindue (upcomingMatches, 24 t). Og grænsen: output kender kun OM der
// er tippet — aldrig valget.
// ---------------------------------------------------------------------------
describe('byggTipStatus — hvem mangler at tippe', () => {
  const { byggTipStatus } = require('./reminders.js');
  const matches = [
    { id: 'k3', round: 4, home: 'BIF', away: 'FCM', kickoff: ts(NOW - 2 * H) },  // spillet
    { id: 'k1', round: 4, home: 'FCK', away: 'AGF', kickoff: ts(NOW + 3 * H) },  // haster (24t)
    { id: 'k2', round: 4, home: 'OB', away: 'Vejle', kickoff: ts(NOW + 30 * H) },// senere i runden
    { id: 'k5', round: 5, home: 'SIF', away: 'VFF', kickoff: ts(NOW + 5 * H) },  // ANDEN runde, men i 24t-vinduet
  ];
  const emails = new Map([['a', 'a@x.dk'], ['b', 'b@x.dk'], ['c', 'c@x.dk']]);
  const brugere = new Map([
    ['a', { displayName: 'Anna' }],
    ['b', { displayName: 'Bo', emailOptOut: true }],
    ['c', { displayName: 'Carla' }],
  ]);
  const byg = (betByUid) => byggTipStatus({
    game: {}, matches, memberUids: ['a', 'b', 'c'], betByUid, brugere, emails, round: 4, now,
  });
  const bets = new Map([
    ['a', new Set(['k1', 'k2', 'k3'])], // alt tippet
    ['b', new Set(['k1'])],             // mangler k2 (senere) + k3 (spillet)
    // c: intet tippet
  ]);

  it('dækning pr. spiller — flest ÅBNE mangler først, og spillede kampe er "nåede det ikke"', () => {
    const ud = byg(bets);
    expect(ud.kampeIRunden).toBe(3); // k5 er runde 5 — usynlig her, selv om den er i 24t-vinduet
    expect(ud.spillere.map((s) => s.navn)).toEqual(['Carla', 'Bo', 'Anna']);
    const carla = ud.spillere[0];
    expect(carla.tippet).toBe(0);
    expect(carla.ialt).toBe(3);
    // Manglende følger kickoff-orden: spillet kamp først, så haster, så senere.
    expect(carla.manglende).toEqual([
      { id: 'k3', kamp: 'BIF – FCM', kickoff: NOW - 2 * H, naaedeDetIkke: true, haster: false },
      { id: 'k1', kamp: 'FCK – AGF', kickoff: NOW + 3 * H, naaedeDetIkke: false, haster: true },
      { id: 'k2', kamp: 'OB – Vejle', kickoff: NOW + 30 * H, naaedeDetIkke: false, haster: false },
    ]);
    const anna = ud.spillere.find((s) => s.navn === 'Anna');
    expect(anna.tippet).toBe(3);
    expect(anna.manglende).toEqual([]);
    // Bo kan ikke nås af knappen (emailOptOut) — det skal fladen kunne vise.
    expect(ud.spillere.find((s) => s.navn === 'Bo').kanRykkes).toBe(false);
    expect(carla.kanRykkes).toBe(true);
  });

  it('rammesAfKnappenNu er PRÆCIS knappens modtagerkreds — ikke rundens mangler-tal', () => {
    const ud = byg(bets);
    // Carla mangler k1 (24t-vinduet) og kan nås → tælles. Bo mangler kun k2
    // (30 t ude — uden for knappens vindue), så knappen ville springe ham
    // over UANSET optOut. Anna mangler intet. Kortet må aldrig love flere.
    expect(ud.rammesAfKnappenNu).toBe(1);
  });

  it('en NÅBAR spiller, der kun mangler kampe UDEN FOR døgnet, tælles ikke af knappen', () => {
    // TM-fund: mutationen 'tæl alle med manglende' overlevede, fordi enhver
    // nåbar spiller i fixtures også manglede en hastende kamp. Ditte kan nås
    // og mangler k2 (30 t ude) — men knappen ville springe hende over, så
    // kortet må ikke tælle hende. UI-teksten lover præcis dét skel.
    const ud = byggTipStatus({
      game: {},
      matches,
      memberUids: ['a', 'c', 'd'],
      betByUid: new Map([
        ['a', new Set(['k1', 'k2', 'k3'])],
        ['d', new Set(['k1', 'k3'])], // mangler KUN k2 — uden for vinduet
        // c mangler alt, herunder k1 (haster)
      ]),
      brugere: new Map([...brugere, ['d', { displayName: 'Ditte' }]]),
      emails: new Map([...emails, ['d', 'd@x.dk']]),
      round: 4,
      now,
    });
    expect(ud.spillere.find((s2) => s2.navn === 'Ditte').manglende.map((m) => m.id)).toEqual(['k2']);
    expect(ud.rammesAfKnappenNu).toBe(1); // kun Carla — IKKE Ditte
  });

  it('optOut fjerner en spiller fra knappens tal, selv når han mangler i vinduet', () => {
    const ud = byg(new Map()); // ingen har tippet noget
    // Anna + Carla mangler k1 og kan nås; Bo mangler k1 men er opt-out.
    expect(ud.rammesAfKnappenNu).toBe(2);
  });

  it('gaten: runder før spillets startrunde har ingen kampe at mangle', () => {
    const ud = byggTipStatus({
      game: { startRound: 4 },
      matches: [{ id: 'g1', round: 3, home: 'A', away: 'B', kickoff: ts(NOW + 3 * H) }, ...matches],
      memberUids: ['a'], betByUid: new Map(), brugere, emails, round: 3, now,
    });
    expect(ud.kampeIRunden).toBe(0);
    expect(ud.spillere[0].manglende).toEqual([]);
  });

  it('grænsen står i selve datastrukturen: intet pick/valg kan optræde i svaret', () => {
    const ud = byg(bets);
    expect(JSON.stringify(ud)).not.toMatch(/"pick"|"valg"|"1"\s*:\s*"[1X2]"/);
  });
});
