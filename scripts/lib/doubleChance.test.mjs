import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import {
  findDobbelteChancer, beviserMekanismen, byggRettelsesplan, lagtTidspunkt,
  kickoffMs, minutter,
} from './doubleChance.mjs';

// Den ÆGTE pointregel — ingen kopi og ingen fake. Planens tal skal være dem,
// afregningen selv ville nå frem til.
const require = createRequire(import.meta.url);
const { scoreBet } = require('../../functions-platform/superligaScoring');

const T = (iso) => Date.parse(iso);
const ts = (ms) => ({ toMillis: () => ms });

// Runde 3 i Superligaen 2026/27 — det faktiske fund fra produktionen.
const KAMPE = [
  { id: 'sdj-vff', data: { round: 3, home: 'Sønderjyske Fodbold', away: 'Viborg FF', kickoff: T('2026-08-07T17:00:00Z'), result: '2', odds: { 1: 2.2, X: 3.4, 2: 3.1 } } },
  { id: 'ach-bif', data: { round: 3, home: 'AC Horsens', away: 'Brøndby IF', kickoff: T('2026-08-09T16:00:00Z'), result: '2', odds: { 1: 4.5, X: 3.6, 2: 1.8 } } },
  { id: 'agf-fcm', data: { round: 4, home: 'AGF', away: 'FC Midtjylland', kickoff: T('2026-08-16T16:00:00Z'), result: '1', odds: { 1: 2.5, X: 3.3, 2: 2.7 } } },
];
const NAVNE = new Map([['u1', 'Forza Bif'], ['u2', 'Anden Spiller']]);

const bet = (uid, matchId, extra = {}) => ({
  id: `${uid}_${matchId}`,
  data: { uid, matchId, pick: '1', ...extra },
});

describe('kickoffMs', () => {
  it('læser Timestamp, tal og streng — og giver null for vrøvl', () => {
    expect(kickoffMs({ kickoff: ts(42) })).toBe(42);
    expect(kickoffMs({ kickoff: 1000 })).toBe(1000);
    expect(kickoffMs({ kickoff: '2026-08-07T17:00:00Z' })).toBe(T('2026-08-07T17:00:00Z'));
    expect(kickoffMs({ kickoff: { seconds: 5 } })).toBe(5000);
    expect(kickoffMs({ kickoff: 'på lørdag' })).toBe(null);
    expect(kickoffMs({})).toBe(null);
  });
});

describe('lagtTidspunkt', () => {
  it('foretrækker chanceSatAt — updatedAt rykker med hver rettelse af 1X2-valget', () => {
    const r = lagtTidspunkt({ chanceSatAt: 1000, updatedAt: ts(9999) });
    expect(r).toEqual({ ms: 1000, kilde: 'chanceSatAt' });
  });
  it('falder tilbage til updatedAt for historikken, hvor feltet ikke findes', () => {
    expect(lagtTidspunkt({ updatedAt: ts(500) })).toEqual({ ms: 500, kilde: 'updatedAt' });
  });
  it('melder ukendt frem for at gætte', () => {
    expect(lagtTidspunkt({})).toEqual({ ms: null, kilde: 'ukendt' });
    expect(lagtTidspunkt(null)).toEqual({ ms: null, kilde: 'ukendt' });
    expect(lagtTidspunkt({ chanceSatAt: 'i går' })).toEqual({ ms: null, kilde: 'ukendt' });
  });
});

describe('findDobbelteChancer', () => {
  it('finder det faktiske fund fra runde 3 og sorterer ÆLDST FØRST', () => {
    const bets = [
      bet('u1', 'sdj-vff', { chanceStake: 2, points: -2, updatedAt: ts(T('2026-08-05T18:59:05Z')) }),
      bet('u1', 'ach-bif', { chanceStake: 2, points: 3.9, updatedAt: ts(T('2026-08-08T07:17:01Z')) }),
    ];
    const fund = findDobbelteChancer({ bets, matches: KAMPE, navne: NAVNE });
    expect(fund).toHaveLength(1);
    expect(fund[0]).toMatchObject({ uid: 'u1', navn: 'Forza Bif', runde: '3' });
    // Rækkefølgen er hele pointen: den første i listen er den, der BEHOLDES.
    expect(fund[0].chancer.map((c) => c.matchId)).toEqual(['sdj-vff', 'ach-bif']);
    expect(fund[0].chancer[0].kampNavn).toBe('Sønderjyske Fodbold–Viborg FF');
  });

  it('melder ikke ÉN chance pr. runde som et fund', () => {
    const bets = [
      bet('u1', 'sdj-vff', { chanceStake: 2, updatedAt: ts(1) }),
      bet('u1', 'agf-fcm', { chanceStake: 5, updatedAt: ts(2) }), // anden runde
      bet('u1', 'ach-bif', { updatedAt: ts(3) }),                 // ingen chance
    ];
    expect(findDobbelteChancer({ bets, matches: KAMPE, navne: NAVNE })).toEqual([]);
  });

  it('blander ikke to spilleres chancer sammen', () => {
    const bets = [
      bet('u1', 'sdj-vff', { chanceStake: 2, updatedAt: ts(1) }),
      bet('u2', 'ach-bif', { chanceStake: 2, updatedAt: ts(2) }),
    ];
    expect(findDobbelteChancer({ bets, matches: KAMPE, navne: NAVNE })).toEqual([]);
  });

  it('grupperer på kampens RUNDE, ikke på datoer — en udsat kamp beholder sin runde', () => {
    // Samme runde, men kickoff næsten en måned fra hinanden (den splittede runde).
    const matches = [
      KAMPE[0],
      { id: 'sen', data: { round: 3, home: 'OB', away: 'FCK', kickoff: T('2026-09-03T17:00:00Z') } },
    ];
    const bets = [
      bet('u1', 'sdj-vff', { chanceStake: 2, updatedAt: ts(1) }),
      bet('u1', 'sen', { chanceStake: 3, updatedAt: ts(2) }),
    ];
    const fund = findDobbelteChancer({ bets, matches, navne: NAVNE });
    expect(fund).toHaveLength(1);
    expect(fund[0].chancer).toHaveLength(2);
  });

  it('springer tips over, hvis kampen ikke har et dokument eller mangler runde', () => {
    const bets = [
      bet('u1', 'findes-ikke', { chanceStake: 2, updatedAt: ts(1) }),
      bet('u1', 'sdj-vff', { chanceStake: 2, updatedAt: ts(2) }),
      bet('u1', 'ingen-runde', { chanceStake: 2, updatedAt: ts(3) }),
    ];
    const matches = [...KAMPE, { id: 'ingen-runde', data: { home: 'A', away: 'B' } }];
    expect(findDobbelteChancer({ bets, matches, navne: NAVNE })).toEqual([]);
  });

  it('grupperer IKKE to kampe uden runde sammen som "runde undefined"', () => {
    // Uden round-tjekket ville begge havne i nøglen "u1|undefined" og blive
    // meldt som en falsk dobbelt-chance. Der skal TO til for at vise det —
    // med kun én filtreres den væk af længde-kravet uanset.
    const matches = [
      { id: 'a', data: { home: 'A', away: 'B' } },
      { id: 'b', data: { home: 'C', away: 'D' } },
    ];
    const bets = [
      bet('u1', 'a', { chanceStake: 2, updatedAt: ts(1) }),
      bet('u1', 'b', { chanceStake: 2, updatedAt: ts(2) }),
    ];
    expect(findDobbelteChancer({ bets, matches, navne: NAVNE })).toEqual([]);
  });

  it('sorterer en chance UDEN tidsstempel sidst, så den aldrig bliver "den første"', () => {
    // Ellers kunne et manglende felt gøre en vilkårlig chance til den, der
    // beholdes — og rettelsen ville fjerne den forkerte.
    const bets = [
      bet('u1', 'sdj-vff', { chanceStake: 2 }),                     // intet stempel
      bet('u1', 'ach-bif', { chanceStake: 2, updatedAt: ts(500) }),
    ];
    const fund = findDobbelteChancer({ bets, matches: KAMPE, navne: NAVNE });
    expect(fund[0].chancer.map((c) => c.matchId)).toEqual(['ach-bif', 'sdj-vff']);
  });

  it('falder tilbage til uid, når brugeren ikke har et navn', () => {
    const bets = [
      bet('ukendt', 'sdj-vff', { chanceStake: 2, updatedAt: ts(1) }),
      bet('ukendt', 'ach-bif', { chanceStake: 2, updatedAt: ts(2) }),
    ];
    expect(findDobbelteChancer({ bets, matches: KAMPE, navne: NAVNE })[0].navn).toBe('ukendt');
  });
});

describe('beviserMekanismen', () => {
  it('beviser sagen fra runde 3: nr. 2 blev lagt EFTER nr. 1s kamp gik i gang', () => {
    const bets = [
      bet('u1', 'sdj-vff', { chanceStake: 2, updatedAt: ts(T('2026-08-05T18:59:05Z')) }),
      bet('u1', 'ach-bif', { chanceStake: 2, updatedAt: ts(T('2026-08-08T07:17:01Z')) }),
    ];
    const { chancer } = findDobbelteChancer({ bets, matches: KAMPE, navne: NAVNE })[0];
    const bevis = beviserMekanismen(chancer);
    expect(bevis.nr).toBe(2);
    expect(bevis.efter.kampNavn).toBe('Sønderjyske Fodbold–Viborg FF');
    // 7/8 kl. 19.00 dansk → 8/8 kl. 09.17 dansk = 14 t 17 min.
    expect(minutter(bevis.forsinkelseMs)).toBe('14 t 17 min');
  });

  it('beviser INTET, når begge chancer blev lagt før begge kampe — og siger det', () => {
    // Her kunne spilleren have fjernet den første selv. Uden denne gren ville
    // scriptet påstå en mekanisme, der ikke var i spil.
    const bets = [
      bet('u1', 'sdj-vff', { chanceStake: 2, updatedAt: ts(T('2026-08-01T10:00:00Z')) }),
      bet('u1', 'ach-bif', { chanceStake: 2, updatedAt: ts(T('2026-08-02T10:00:00Z')) }),
    ];
    const { chancer } = findDobbelteChancer({ bets, matches: KAMPE, navne: NAVNE })[0];
    expect(beviserMekanismen(chancer)).toBe(null);
  });

  it('beviser intet uden tidsstempler', () => {
    const bets = [
      bet('u1', 'sdj-vff', { chanceStake: 2 }),
      bet('u1', 'ach-bif', { chanceStake: 2 }),
    ];
    const { chancer } = findDobbelteChancer({ bets, matches: KAMPE, navne: NAVNE })[0];
    expect(beviserMekanismen(chancer)).toBe(null);
  });
});

describe('minutter', () => {
  it('skifter enhed ved 90 min og 48 timer', () => {
    expect(minutter(45 * 60e3)).toBe('45 min');
    expect(minutter(89 * 60e3)).toBe('89 min');
    expect(minutter(90 * 60e3)).toBe('1 t 30 min');
    expect(minutter(47 * 3600e3)).toBe('47 t 0 min');
    expect(minutter(49 * 3600e3)).toBe('2 d 1 t');
  });
});

describe('byggRettelsesplan', () => {
  const plan = (fund, bets, ekstra = {}) => byggRettelsesplan({
    fund,
    pickAf: new Map(bets.map((b) => [b.id, b.data.pick])),
    totalFoer: new Map([['u1', 100]]),
    scoreBet,
    ...ekstra,
  });

  // De ÆGTE tidsstempler fra produktionen: nr. 2 blev lagt efter nr. 1's kamp
  // gik i gang, så mekanismen er bevist, og planen må rette.
  const BEVIST = [
    bet('u1', 'sdj-vff', { chanceStake: 2, points: -2, updatedAt: ts(T('2026-08-05T18:59:05Z')) }),
    bet('u1', 'ach-bif', { chanceStake: 2, points: 3.9, updatedAt: ts(T('2026-08-08T07:17:01Z')) }),
  ];

  it('regner det fjernede tips nye point med den ÆGTE pointregel', () => {
    const bets = BEVIST;
    const fund = findDobbelteChancer({ bets, matches: KAMPE, navne: NAVNE });
    const { rettelser, totaler } = plan(fund, bets);
    expect(rettelser).toHaveLength(1);
    expect(rettelser[0].beholdes.matchId).toBe('sdj-vff');
    // pick '1' mod result '2' = forkert → uden chancen er pointet 0.
    expect(rettelser[0].fjernes[0]).toMatchObject({ matchId: 'ach-bif', nyPoint: 0, delta: -3.9 });
    expect(totaler.get('u1')).toEqual({ foer: 100, efter: 96.1, delta: -3.9 });
  });

  it('AKKUMULERER over flere runder for samme spiller', () => {
    // Fejlen, der blev fundet: hver runde regnede fra spillerens OPRINDELIGE
    // total, så to runder gav to tal, hvoraf ingen var slutstillingen.
    const matches = [
      ...KAMPE,
      { id: 'r7a', data: { round: 7, home: 'E', away: 'F', kickoff: T('2026-09-20T16:00:00Z'), result: '2', odds: { 1: 3, X: 3, 2: 2 } } },
      { id: 'r7b', data: { round: 7, home: 'G', away: 'H', kickoff: T('2026-09-21T16:00:00Z'), result: '2', odds: { 1: 3, X: 3, 2: 2 } } },
    ];
    const bets = [
      ...BEVIST,
      bet('u1', 'r7a', { chanceStake: 3, points: -3, updatedAt: ts(T('2026-09-19T10:00:00Z')) }),
      // Lagt EFTER r7a's kickoff (20/9 kl. 16.00 UTC) — bevist i runde 7 med.
      bet('u1', 'r7b', { chanceStake: 3, points: 5, updatedAt: ts(T('2026-09-20T18:00:00Z')) }),
    ];
    const fund = findDobbelteChancer({ bets, matches, navne: NAVNE });
    expect(fund).toHaveLength(2);
    const { totaler } = plan(fund, bets);
    // −3,9 fra runde 3 OG −5 fra runde 7 = 91,1. Ikke 96,1 og ikke 95.
    expect(totaler.get('u1')).toEqual({ foer: 100, efter: 91.1, delta: -8.9 });
  });

  it('advarer om en GATED kamp — rescoreAllBets ville springe pointet over', () => {
    const bets = BEVIST;
    const fund = findDobbelteChancer({ bets, matches: KAMPE, navne: NAVNE });
    const { advarsler } = plan(fund, bets, { gatede: new Set(['ach-bif']) });
    expect(advarsler).toHaveLength(1);
    expect(advarsler[0]).toContain('gated');
    expect(advarsler[0]).toContain('AC Horsens–Brøndby IF');
  });

  it('AFVISER en runde, hvor rækkefølgen ikke kan bevises af kickoff-tiderne', () => {
    // Indtil trin 3 er live, nævner firestore.rules ikke ordet "chance", så en
    // spiller kan selv skrive chanceSatAt. Uden kickoff-beviset ville han
    // dermed selv vælge, hvilken af sine chancer rettelsen lader stå.
    const bets = [
      bet('u1', 'sdj-vff', { chanceStake: 2, points: -2, updatedAt: ts(T('2026-08-01T10:00:00Z')) }),
      bet('u1', 'ach-bif', { chanceStake: 2, points: 3.9, updatedAt: ts(T('2026-08-02T10:00:00Z')) }),
    ];
    const fund = findDobbelteChancer({ bets, matches: KAMPE, navne: NAVNE });
    const { rettelser, totaler, advarsler } = plan(fund, bets);
    expect(rettelser[0].afvist).toBe(true);
    expect(rettelser[0].fjernes).toEqual([]);
    // Slet ingen total-post: en afvist runde flytter intet, og så skal der
    // heller ikke udskrives en TOTAL-linje, der antyder, at noget skete.
    expect(totaler.has('u1')).toBe(false);
    expect(advarsler[0]).toContain('kan ikke bevises');
  });

  it('retter den alligevel, hvis beviskravet slås fra med vilje', () => {
    const bets = [
      bet('u1', 'sdj-vff', { chanceStake: 2, points: -2, updatedAt: ts(T('2026-08-01T10:00:00Z')) }),
      bet('u1', 'ach-bif', { chanceStake: 2, points: 3.9, updatedAt: ts(T('2026-08-02T10:00:00Z')) }),
    ];
    const fund = findDobbelteChancer({ bets, matches: KAMPE, navne: NAVNE });
    const { rettelser } = plan(fund, bets, { kraevBevis: false });
    expect(rettelser[0].afvist).toBe(false);
    expect(rettelser[0].fjernes).toHaveLength(1);
  });

  it('advarer i stedet for at udskrive et tal, når 1X2-valget mangler', () => {
    const bets = [
      BEVIST[0],
      { id: 'u1_ach-bif', data: { uid: 'u1', matchId: 'ach-bif', chanceStake: 2, points: 3.9, updatedAt: ts(T('2026-08-08T07:17:01Z')) } },
    ];
    const fund = findDobbelteChancer({ bets, matches: KAMPE, navne: NAVNE });
    const { rettelser, advarsler, totaler } = plan(fund, bets);
    expect(advarsler[0]).toContain('mangler 1X2-valg');
    expect(rettelser[0].fjernes[0].nyPoint).toBe(null);
    // Uden et troværdigt tal må totalen ikke rykke sig.
    expect(totaler.get('u1').delta).toBe(0);
  });
});
