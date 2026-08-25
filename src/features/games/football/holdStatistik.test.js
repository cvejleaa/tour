import { describe, it, expect } from 'vitest';
import {
  holdetsKampe, holdForm, indbyrdesHold, oddsUdfald, ensomRet,
} from './holdStatistik';

/**
 * Kamp-fixture. `kickoff` er valgfri med vilje — kronologien skal kunne
 * bevises BÅDE med og uden den.
 */
function kamp(id, round, home, away, extra = {}) {
  return { id, round, home, away, ...extra };
}

describe('holdetsKampe', () => {
  it('tager både hjemme- og udekampe og sorterer ældst først', () => {
    const matches = [
      kamp('c', 3, 'AGF', 'FCK'),
      kamp('a', 1, 'FCK', 'BIF'),
      kamp('b', 2, 'FCM', 'FCK'),
      kamp('x', 9, 'AGF', 'BIF'), // FCK er ikke med
    ];
    expect(holdetsKampe(matches, 'FCK').map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });

  it('lader KICKOFF slå runden, så en udsat kamp står hvor den blev spillet', () => {
    // Runde 5 blev udsat og spillet EFTER runde 6. Sorteres der på runde,
    // kommer den fejlagtigt først.
    const matches = [
      kamp('udsat', 5, 'FCK', 'AGF', { kickoff: 2_000 }),
      kamp('r6', 6, 'BIF', 'FCK', { kickoff: 1_000 }),
    ];
    expect(holdetsKampe(matches, 'FCK').map((m) => m.id)).toEqual(['r6', 'udsat']);
  });

  it('giver tom liste uden hold eller uden kampe', () => {
    expect(holdetsKampe(null, 'FCK')).toEqual([]);
    expect(holdetsKampe([kamp('a', 1, 'FCK', 'BIF')], '')).toEqual([]);
  });
});

describe('holdForm', () => {
  // Seks afgjorte kampe for FCK, skiftevis hjemme og ude, i runde 1-6.
  // Facit er valgt så V/U/T er FORSKELLIGT for hjemme og ude: en mapning,
  // der glemmer siden, giver et andet bogstav på hver anden kamp.
  const matches = [
    kamp('r1', 1, 'FCK', 'BIF', { result: '1', homeGoals: 2, awayGoals: 0 }), // hjemme V
    kamp('r2', 2, 'AGF', 'FCK', { result: '1', homeGoals: 3, awayGoals: 1 }), // ude   T
    kamp('r3', 3, 'FCK', 'FCM', { result: '2', homeGoals: 0, awayGoals: 1 }), // hjemme T
    kamp('r4', 4, 'OB', 'FCK', { result: '2', homeGoals: 1, awayGoals: 4 }), // ude   V
    kamp('r5', 5, 'FCK', 'SIF', { result: 'X', homeGoals: 1, awayGoals: 1 }), // hjemme U
    kamp('r6', 6, 'VB', 'FCK', { result: 'X', homeGoals: 2, awayGoals: 2 }), // ude   U
    kamp('r7', 7, 'FCK', 'RFC'), // endnu ikke spillet
  ];

  it('bruger de SENESTE n og viser dem ældst først', () => {
    const f = holdForm(matches, 'FCK', 5);
    // r1 er droppet (ældst af seks), og rækken læses venstre mod højre i tid.
    expect(f.raekke.map((r) => r.matchId)).toEqual(['r2', 'r3', 'r4', 'r5', 'r6']);
    expect(f.raekke.map((r) => r.udfald)).toEqual(['T', 'T', 'V', 'U', 'U']);
  });

  it('vender udfaldet efter hvilken side holdet spillede på', () => {
    // Samme facit '1' giver V hjemme (r1) og T ude (r2). Uden siden ville
    // begge blive V.
    const f = holdForm(matches, 'FCK', 6);
    expect(f.raekke.find((r) => r.matchId === 'r1')).toMatchObject({ hjemme: true, udfald: 'V', modstander: 'BIF' });
    expect(f.raekke.find((r) => r.matchId === 'r2')).toMatchObject({ hjemme: false, udfald: 'T', modstander: 'AGF' });
    expect(f.v).toBe(2);
    expect(f.u).toBe(2);
    expect(f.t).toBe(2);
  });

  it('tæller mål set fra holdets egen side', () => {
    // r4: OB 1-4 FCK. Set fra FCK er det 4 scorede og 1 indkasseret — bytter
    // man om, bliver totalen 8/12 i stedet for 12/8.
    const f = holdForm(matches, 'FCK', 6);
    expect(f.raekke.find((r) => r.matchId === 'r4')).toMatchObject({ maal: 4, imod: 1 });
    expect(f.maal).toBe(2 + 1 + 0 + 4 + 1 + 2); // 10
    expect(f.imod).toBe(0 + 3 + 1 + 1 + 1 + 2); // 8
  });

  it('tæller en kamp UDEN måltal i V/U/T, men ikke i målscoren', () => {
    const uden = [kamp('m', 1, 'FCK', 'BIF', { result: '1' })];
    const f = holdForm(uden, 'FCK', 5);
    expect(f.v).toBe(1);
    expect(f.raekke[0]).toMatchObject({ maal: null, imod: null });
    expect(f.maal).toBe(0);
    expect(f.imod).toBe(0);
  });

  it('holder ikke-afgjorte kampe ude', () => {
    const f = holdForm(matches, 'FCK', 10);
    expect(f.raekke.map((r) => r.matchId)).not.toContain('r7');
    expect(f.raekke).toHaveLength(6);
  });

  it('oplyser GRUNDLAGET, så en form på én kamp ikke ligner en på fem', () => {
    // ialt er alle afgjorte kampe, ikke rækkens længde — ellers kunne "3-1-1"
    // stå uden at nogen kunne se, at der kun var spillet tre.
    expect(holdForm(matches, 'FCK', 5).ialt).toBe(6);
    expect(holdForm(matches, 'FCK', 2).ialt).toBe(6);
    expect(holdForm([matches[0]], 'FCK', 5)).toMatchObject({ ialt: 1 });
  });

  it('giver tom form for n = 0 og for et ukendt hold', () => {
    expect(holdForm(matches, 'FCK', 0).raekke).toEqual([]);
    expect(holdForm(matches, 'Findes Ikke', 5)).toMatchObject({ raekke: [], v: 0, ialt: 0 });
  });
});

describe('indbyrdesHold', () => {
  const matches = [
    kamp('h', 2, 'FCK', 'BIF', { result: '1' }), // FCK vandt hjemme
    kamp('u', 8, 'BIF', 'FCK', { result: '1' }), // BIF vandt hjemme
    kamp('x', 15, 'FCK', 'BIF', { result: 'X' }),
    kamp('kommende', 30, 'BIF', 'FCK'),
    kamp('andre', 3, 'AGF', 'FCK', { result: '1' }),
  ];

  it('tæller sejre for BEGGE orienteringer af samme opgør', () => {
    // Begge kampe har facit '1', men vinderen er forskellig, fordi hjemmeholdet
    // er det. Læses facit uden hjemmeholdet, står FCK til 2-0.
    const r = indbyrdesHold(matches, 'FCK', 'BIF');
    expect(r).toMatchObject({ aVandt: 1, bVandt: 1, uafgjort: 1, spillet: 3 });
  });

  it('vender tællingen, når holdene byttes om', () => {
    const r = indbyrdesHold(matches, 'BIF', 'FCK');
    expect(r).toMatchObject({ aVandt: 1, bVandt: 1, uafgjort: 1 });
    expect(indbyrdesHold(matches, 'AGF', 'FCK')).toMatchObject({ aVandt: 1, bVandt: 0 });
    expect(indbyrdesHold(matches, 'FCK', 'AGF')).toMatchObject({ aVandt: 0, bVandt: 1 });
  });

  it('tager den kommende kamp med i LISTEN, men ikke i tællingen', () => {
    const r = indbyrdesHold(matches, 'FCK', 'BIF');
    expect(r.kampe.map((m) => m.id)).toEqual(['h', 'u', 'x', 'kommende']);
    expect(r.kampe.map((m) => m.afgjort)).toEqual([true, true, true, false]);
    expect(r.spillet).toBe(3);
  });

  it('holder andre holds kampe ude', () => {
    expect(indbyrdesHold(matches, 'FCK', 'BIF').kampe.map((m) => m.id)).not.toContain('andre');
  });

  it('giver tomt for det samme hold to gange', () => {
    // Filteret kræver BEGGE hold i samme kamp. Løsnes det til
    // `home === a || away === b`, ville AGF-FCK slippe med her.
    expect(indbyrdesHold(matches, 'FCK', 'FCK')).toMatchObject({ kampe: [], spillet: 0 });
  });
});

describe('oddsUdfald', () => {
  it('vælger favoritten ud fra LAVESTE ODDS — ikke ud fra Elo', () => {
    // Hjemmeholdet har klart højest Elo, men oddsene gør udeholdet til
    // favorit. Udledes favoritten af rating, bliver svaret '1' i stedet for
    // '2'. Det er præcis den fejl, MatchElo.jsx er skrevet for at undgå:
    // oddsene lægger hjemmebanefordelen oveni, rating gør ikke.
    const m = {
      eloHome: 1750, eloAway: 1500,
      odds: { 1: 3.4, X: 3.8, 2: 1.9 },
      result: '2',
    };
    expect(oddsUdfald(m)).toMatchObject({ favorit: '2', favoritOdds: 1.9, ramte: true });
  });

  it('siger at favoritten IKKE ramte, når et andet udfald faldt', () => {
    const m = { odds: { 1: 1.6, X: 4.0, 2: 5.5 }, result: 'X' };
    expect(oddsUdfald(m)).toMatchObject({ favorit: '1', ramte: false, overraskelse: 4.0 });
  });

  it('måler overraskelsen som oddsene på det udfald, der FALDT', () => {
    // Ikke favorittens odds: den store historie er, hvad der kom ind.
    const m = { odds: { 1: 1.5, X: 4.2, 2: 7.1 }, result: '2' };
    expect(oddsUdfald(m).overraskelse).toBe(7.1);
    expect(oddsUdfald(m).favoritOdds).toBe(1.5);
  });

  it('nægter at udpege en favorit, når to udfald deler laveste odds', () => {
    const m = { odds: { 1: 2.5, X: 3.9, 2: 2.5 }, result: '1' };
    expect(oddsUdfald(m)).toMatchObject({ favorit: null, favoritOdds: null, ramte: null });
  });

  it('lader ramte stå ÅBEN før kampen er afgjort', () => {
    // null, ikke false: "favoritten tabte" må ikke stå på en kamp uden facit.
    expect(oddsUdfald({ odds: { 1: 1.8, X: 3.5, 2: 4.4 } }))
      .toMatchObject({ favorit: '1', ramte: null, overraskelse: null });
  });

  it('klarer manglende og ugyldige odds', () => {
    expect(oddsUdfald({ result: '1' })).toMatchObject({ favorit: null, ramte: null });
    expect(oddsUdfald({ odds: { 1: 0, X: null, 2: 3.2 }, result: '2' }))
      .toMatchObject({ favorit: '2', favoritOdds: 3.2, ramte: true });
    expect(oddsUdfald(null)).toMatchObject({ favorit: null, overraskelse: null });
  });
});

describe('ensomRet', () => {
  const bets = [
    { uid: 'mig', pick: '2', name: 'Morten' },
    { uid: 'a', pick: '1', name: 'Anne' },
    { uid: 'b', pick: '1', name: 'Bo' },
    { uid: 'c', pick: 'X', name: 'Cille' },
  ];

  it('finder den ENE, der stod alene med det rigtige', () => {
    const r = ensomRet(bets, '2');
    expect(r.ensom).toBe(true);
    expect(r.antal).toBe(1);
    expect(r.ramte.map((b) => b.name)).toEqual(['Morten']);
    expect(r.ialt).toBe(4);
  });

  it('tæller ens EGET tip med — ellers er ens egen ensomme ret usynlig', () => {
    // Fjernes ens eget tip (som LeagueBets gør i sin egen visning), falder
    // antallet til 0, og linjen ville sige "ingen så den her" til den, der så den.
    expect(ensomRet(bets, '2').ramte[0].uid).toBe('mig');
  });

  it('er IKKE ensom, når flere ramte', () => {
    const r = ensomRet(bets, '1');
    expect(r).toMatchObject({ antal: 2, ensom: false, ingen: false });
    expect(r.ramte.map((b) => b.name)).toEqual(['Anne', 'Bo']);
  });

  it('siger "ingen", når der VAR tips, men ingen ramte', () => {
    const kunEt = [{ uid: 'a', pick: '1' }, { uid: 'b', pick: '1' }];
    expect(ensomRet(kunEt, 'X')).toMatchObject({ antal: 0, ensom: false, ingen: true });
  });

  it('siger IKKE "ingen", når der slet ikke var tips', () => {
    // Tavshed er kun en pointe, hvis der var nogen til at tage fejl.
    expect(ensomRet([], '1')).toMatchObject({ ingen: false, ialt: 0 });
    expect(ensomRet(null, '1')).toMatchObject({ ingen: false, ialt: 0 });
  });

  it('ser bort fra tips uden gyldigt valg, også i grundlaget', () => {
    const rodet = [
      { uid: 'a', pick: '1' },
      { uid: 'b', pick: null },
      { uid: 'c', pick: 'ja' },
      { uid: 'd' },
    ];
    expect(ensomRet(rodet, '1')).toMatchObject({ antal: 1, ialt: 1, ensom: true });
  });

  it('melder hverken ensom eller ingen, før kampen er afgjort', () => {
    expect(ensomRet(bets, null)).toMatchObject({ antal: 0, ensom: false, ingen: false, ialt: 4 });
    expect(ensomRet(bets, 'ukendt')).toMatchObject({ ensom: false, ingen: false });
  });
});
