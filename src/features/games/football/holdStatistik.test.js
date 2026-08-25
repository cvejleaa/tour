import { describe, it, expect } from 'vitest';
import {
  holdetsKampe, holdForm, indbyrdesHold, oddsUdfald, ensomRet,
  hjemmeUde, maalforskelFordeling, favoritTal, pointModForventning,
  FORDELING_MINIMUM,
} from './holdStatistik';
import { ELO, outcomeProbabilities } from '../../../lib/superligaScoring';

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

  // Det BLANDEDE tilfælde: nogle kampe har kickoff, andre ikke. Det var her
  // fejlen sad — runde 30 er astronomisk mindre end en epoch, så en kommende
  // kamp uden tidsstempel sorterede foran alt, der var spillet.
  it('lader en KOMMENDE kamp uden kickoff ligge sidst, ikke først', () => {
    const matches = [
      kamp('r2', 2, 'FCK', 'BIF', { kickoff: 1_690_000_000_000, result: '1' }),
      kamp('r8', 8, 'BIF', 'FCK', { kickoff: 1_695_000_000_000, result: '1' }),
      kamp('r30', 30, 'FCK', 'BIF'), // ikke berammet endnu
    ];
    expect(holdetsKampe(matches, 'FCK').map((m) => m.id)).toEqual(['r2', 'r8', 'r30']);
  });

  it('placerer en bagfyldt kamp uden kickoff efter sin RUNDES tid', () => {
    // Kampen mangler tidsstempel, men naboen i samme runde har et. Uden den
    // udledning ville den bagfyldte kamp havne bagest og forgifte formen.
    const matches = [
      kamp('r1-nabo', 1, 'AGF', 'OB', { kickoff: 1_690_000_000_000, result: '1' }),
      kamp('r1-fck', 1, 'FCK', 'BIF', { result: '1' }), // bagfyldt, uden kickoff
      kamp('r5-fck', 5, 'FCK', 'VB', { kickoff: 1_694_000_000_000, result: '1' }),
    ];
    expect(holdetsKampe(matches, 'FCK').map((m) => m.id)).toEqual(['r1-fck', 'r5-fck']);
  });

  it('udleder rundetiden af HELE programmet, ikke kun holdets egne kampe', () => {
    // FCK har ingen kickoff på nogen af sine kampe; runderne dateres af andre
    // holds kampe. Ses kun holdets egne, findes der ingen tid at gå efter.
    const matches = [
      kamp('r9-andre', 9, 'AGF', 'OB', { kickoff: 1_698_000_000_000 }),
      kamp('r3-andre', 3, 'VB', 'SIF', { kickoff: 1_692_000_000_000 }),
      kamp('r9-fck', 9, 'FCK', 'BIF'),
      kamp('r3-fck', 3, 'BIF', 'FCK'),
    ];
    expect(holdetsKampe(matches, 'FCK').map((m) => m.id)).toEqual(['r3-fck', 'r9-fck']);
  });

  it('holder rækkefølgen konsistent, uanset hvilken vej listen kommer ind', () => {
    // En ikke-transitiv sammenligning ville give forskelligt svar på forskellig
    // startrækkefølge. Præcis den fælde blev fravalgt — her holdes den ude.
    const base = [
      kamp('a', 2, 'FCK', 'BIF', { kickoff: 1_690_000_000_000 }),
      kamp('b', 8, 'BIF', 'FCK'),
      kamp('c', 30, 'FCK', 'AGF', { kickoff: 1_688_000_000_000 }),
    ];
    const frem = holdetsKampe(base, 'FCK').map((m) => m.id);
    const bak = holdetsKampe([...base].reverse(), 'FCK').map((m) => m.id);
    expect(frem).toEqual(bak);
    // c ligger tidligst i TID, selv om dens rundenummer er højest.
    expect(frem[0]).toBe('c');
  });

  it('placerer en AFGJORT kamp fra en udateret runde før den daterede runde', () => {
    // Hele runde 1 er bagfyldt uden tidsstempler. Kampen er spillet, men har
    // ingen tid at gå efter — den låner runde 5's og lander foran den, fordi
    // rundenummeret er lavere. Uden laanet ville den sortere BAGEST, og
    // holdForm ville vise sæsonens ældste kamp som den seneste.
    const matches = [
      kamp('r1', 1, 'FCK', 'BIF', { result: '1' }),
      kamp('r5', 5, 'FCK', 'VB', { kickoff: 1_694_000_000_000, result: '2' }),
    ];
    expect(holdetsKampe(matches, 'FCK').map((m) => m.id)).toEqual(['r1', 'r5']);
    expect(holdForm(matches, 'FCK', 1).raekke.map((r) => r.matchId)).toEqual(['r5']);
  });

  it('låner fra den FØRSTE daterede runde over, ikke den sidste', () => {
    // Runde 1 er bagfyldt uden tidsstempel, og der er INGEN dateret runde
    // under den. Så må den låne opad — og det skal være runde 5, ikke
    // runde 10. Låner den runde 10's tid, springer den forbi runde 5.
    const matches = [
      kamp('r1-fck', 1, 'FCK', 'BIF', { result: '1' }),
      kamp('r5-fck', 5, 'FCK', 'AGF', { kickoff: 1_000, result: '1' }),
      kamp('r10-fck', 10, 'FCK', 'OB', { kickoff: 9_000, result: '1' }),
    ];
    expect(holdetsKampe(matches, 'FCK').map((m) => m.id)).toEqual(['r1-fck', 'r5-fck', 'r10-fck']);
  });

  it('bruger rundens TIDLIGSTE kickoff, når runden har flere kampe', () => {
    // Runde 4 spilles fredag-søndag. FCKs egen kamp mangler tidsstempel og
    // låner rundens begyndelse. Vælges rundens SENESTE kickoff i stedet,
    // rykker den forbi søndagskampen i runde 5.
    const matches = [
      kamp('r4-fre', 4, 'AGF', 'OB', { kickoff: 1_000 }),
      kamp('r4-son', 4, 'VB', 'SIF', { kickoff: 9_000 }),
      kamp('r4-fck', 4, 'FCK', 'BIF'),
      kamp('r5-fck', 5, 'FCK', 'AGF', { kickoff: 5_000 }),
    ];
    expect(holdetsKampe(matches, 'FCK').map((m) => m.id)).toEqual(['r4-fck', 'r5-fck']);
  });

  it('KENDT BEGRÆNSNING: en udsat kamp uden eget kickoff bliver ved sin runde', () => {
    // Runde 3 blev udsat og reelt spillet efter runde 5, men kampen har intet
    // tidsstempel. Så findes der ingen sand information, og den placeres ved
    // sin nominelle runde. Testen står her, for at beslutningen er en KENDT
    // begrænsning og ikke en overraskelse den dag, nogen møder den — og for at
    // den bliver rød, hvis nogen ændrer adfærden uden at ville det.
    const matches = [
      kamp('r1', 1, 'FCK', 'AGF', { kickoff: 1_000, result: '1' }),
      kamp('r3-udsat', 3, 'FCK', 'OB', { result: '1' }),
      kamp('r5', 5, 'FCK', 'VB', { kickoff: 5_000, result: '1' }),
    ];
    expect(holdetsKampe(matches, 'FCK').map((m) => m.id)).toEqual(['r1', 'r3-udsat', 'r5']);
    // Får kampen sit kickoff, retter placeringen sig selv.
    const medTid = matches.map((m) => (m.id === 'r3-udsat' ? { ...m, kickoff: 7_000 } : m));
    expect(holdetsKampe(medTid, 'FCK').map((m) => m.id)).toEqual(['r1', 'r5', 'r3-udsat']);
  });

  it('lader RUNDEN skille to kampe, der deler tid', () => {
    // kickoff 0 er en reel sentinel, ikke kun en krølle: begge kampe får
    // nøglen [0, 0, runde], og uden rundeleddet kan de bytte plads.
    const matches = [
      kamp('r9', 9, 'FCK', 'AGF', { kickoff: 0, result: '1' }),
      kamp('r2', 2, 'BIF', 'FCK', { kickoff: 0, result: '2' }),
    ];
    expect(holdetsKampe(matches, 'FCK').map((m) => m.id)).toEqual(['r2', 'r9']);
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

  it('sætter den KOMMENDE indbyrdes kamp sidst, også når de spillede har kickoff', () => {
    // "De mødes igen i runde 30" skal stå til sidst. Med rundenummeret som
    // tidsnøgle sorterede den forrest, foran begge spillede kampe.
    const blandet = [
      kamp('spillet2', 2, 'FCK', 'BIF', { kickoff: 1_690_000_000_000, result: '1' }),
      kamp('spillet8', 8, 'BIF', 'FCK', { kickoff: 1_695_000_000_000, result: '1' }),
      kamp('kommende', 30, 'FCK', 'BIF'),
    ];
    const r = indbyrdesHold(blandet, 'FCK', 'BIF');
    expect(r.kampe.map((m) => m.id)).toEqual(['spillet2', 'spillet8', 'kommende']);
    expect(r.kampe.map((m) => m.afgjort)).toEqual([true, true, false]);
  });

  it('daterer den indbyrdes kamp med et TREDJE holds kickoff', () => {
    // Runde 5 blev UDSAT og spillet efter runde 8. FCK-BIF i runde 5 mangler
    // selv et tidsstempel, men runden er dateret af AGF-OB — så kampen låner
    // den sene tid og lander SIDST, hvilket er den sande kronologi.
    //
    // Udledes rundetiderne kun af parrets egne kampe, findes runde 5 slet
    // ikke; kampen låner så runde 8's tid, og rundeleddet skubber den
    // fejlagtigt FORAN den kamp, der faktisk blev spillet først.
    const matches = [
      kamp('r5-andre', 5, 'AGF', 'OB', { kickoff: 1_697_000_000_000 }),
      kamp('r5-par', 5, 'FCK', 'BIF', { result: '1' }),
      kamp('r8-par', 8, 'BIF', 'FCK', { kickoff: 1_694_000_000_000, result: '2' }),
    ];
    expect(indbyrdesHold(matches, 'FCK', 'BIF').kampe.map((m) => m.id))
      .toEqual(['r8-par', 'r5-par']);
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

  it('behandler et UGYLDIGT facit som intet facit', () => {
    // Vagten `erUdfald(match?.result)` er en bevidst beslutning. Uden den ville
    // en korrupt værdi give ramte: false — altså "favoritten tabte" — hvor
    // svaret skal være ubesvaret.
    const m = { odds: { 1: 1.7, X: 3.6, 2: 4.8 }, result: 'aflyst' };
    expect(oddsUdfald(m)).toMatchObject({ favorit: '1', ramte: null, overraskelse: null });
    expect(oddsUdfald({ odds: { 1: 1.7, X: 3.6, 2: 4.8 }, result: 1 }))
      .toMatchObject({ ramte: null, overraskelse: null });
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

// Odds, hvor FAVORITTEN er entydig. Værdierne bruges kun til at pege på et
// udfald — favoritTal tæller, den lægger aldrig odds sammen (afgørelse 3a).
const HJEMMEFAVORIT = { 1: 1.6, X: 3.8, 2: 5.2 };
const UDEFAVORIT = { 1: 5.2, X: 3.8, 2: 1.6 };
const XFAVORIT = { 1: 3.9, X: 2.1, 2: 3.4 };

describe('hjemmeUde', () => {
  it('holder de to sider adskilt med V/U/T og mål', () => {
    const matches = [
      kamp('h1', 1, 'FCK', 'BIF', { result: '1', homeGoals: 3, awayGoals: 0 }),
      kamp('h2', 2, 'FCK', 'AGF', { result: 'X', homeGoals: 1, awayGoals: 1 }),
      kamp('u1', 3, 'OB', 'FCK', { result: '1', homeGoals: 2, awayGoals: 1 }),
      kamp('u2', 4, 'VB', 'FCK', { result: '2', homeGoals: 0, awayGoals: 4 }),
    ];
    const r = hjemmeUde(matches, 'FCK');
    // Hjemme: én sejr 3-0, én uafgjort 1-1 → 4 mål for, 1 imod.
    expect(r.hjemme).toEqual({ kampe: 2, v: 1, u: 1, t: 0, maal: 4, imod: 1 });
    // Ude: ét nederlag 1-2, én sejr 4-0 → 5 mål for, 2 imod.
    expect(r.ude).toEqual({ kampe: 2, v: 1, u: 0, t: 1, maal: 5, imod: 2 });
  });

  it('tæller en kamp UDEN måltal i V/U/T, men ikke i målscoren', () => {
    // En data-mangel må ikke pynte som et 0-0. Udfaldet står i result og
    // tæller; målene gør ikke.
    const matches = [
      kamp('a', 1, 'FCK', 'BIF', { result: '1', homeGoals: 2, awayGoals: 0 }),
      kamp('b', 2, 'FCK', 'AGF', { result: '1' }),
    ];
    const r = hjemmeUde(matches, 'FCK');
    expect(r.hjemme.kampe).toBe(2);
    expect(r.hjemme.v).toBe(2);
    expect(r.hjemme.maal).toBe(2);
    expect(r.hjemme.imod).toBe(0);
  });

  it('springer kampe uden facit over og giver begge sider samme form', () => {
    const r = hjemmeUde([kamp('k', 1, 'FCK', 'BIF')], 'FCK');
    expect(r.hjemme).toEqual({ kampe: 0, v: 0, u: 0, t: 0, maal: 0, imod: 0 });
    expect(r.ude).toEqual(r.hjemme);
    expect(hjemmeUde(null, 'FCK').ude.kampe).toBe(0);
  });
});

describe('maalforskelFordeling', () => {
  it('tæller kun SEJRE og grupperer på margen', () => {
    const matches = [
      kamp('a', 1, 'FCK', 'BIF', { result: '1', homeGoals: 1, awayGoals: 0 }),
      kamp('b', 2, 'AGF', 'FCK', { result: '2', homeGoals: 0, awayGoals: 1 }),
      kamp('c', 3, 'FCK', 'OB', { result: '1', homeGoals: 4, awayGoals: 1 }),
      kamp('d', 4, 'FCK', 'VB', { result: 'X', homeGoals: 2, awayGoals: 2 }),
      kamp('e', 5, 'FCK', 'SIF', { result: '2', homeGoals: 0, awayGoals: 2 }),
    ];
    const r = maalforskelFordeling(matches, 'FCK');
    expect(r.sejre).toBe(3);
    expect(r.fordeling).toEqual([{ forskel: 1, antal: 2 }, { forskel: 3, antal: 1 }]);
  });

  it('siger nej til grafen under gulvet — og ja præcis PÅ det', () => {
    // Gulvet er sat på SEJRE, ikke på kampe: et hold kan have spillet ti
    // kampe og vundet én, og så er "fordelingen" stadig ét datapunkt.
    const sejr = (i) => kamp(`s${i}`, i, 'FCK', 'BIF', {
      result: '1', homeGoals: 2, awayGoals: 0,
    });
    const under = Array.from({ length: FORDELING_MINIMUM - 1 }, (_, i) => sejr(i));
    expect(maalforskelFordeling(under, 'FCK').nokTilGraf).toBe(false);
    expect(maalforskelFordeling(under, 'FCK').sejre).toBe(FORDELING_MINIMUM - 1);

    const paa = Array.from({ length: FORDELING_MINIMUM }, (_, i) => sejr(i));
    expect(maalforskelFordeling(paa, 'FCK').nokTilGraf).toBe(true);

    // Ti kampe, én sejr: mange kampe er IKKE nok, kun mange sejre er.
    const tabt = Array.from({ length: 9 }, (_, i) => kamp(`t${i}`, i, 'FCK', 'OB', {
      result: '2', homeGoals: 0, awayGoals: 1,
    }));
    expect(maalforskelFordeling([...tabt, sejr(99)], 'FCK').nokTilGraf).toBe(false);
  });

  it('udelader en sejr uden måltal — den har ingen margen', () => {
    const matches = [kamp('a', 1, 'FCK', 'BIF', { result: '1' })];
    expect(maalforskelFordeling(matches, 'FCK')).toEqual({
      fordeling: [], sejre: 0, nokTilGraf: false,
    });
  });
});

describe('favoritTal', () => {
  it('skelner mellem at holde som favorit og at dræbe en', () => {
    const matches = [
      // Favorit hjemme, vandt → banker holdt.
      kamp('a', 1, 'FCK', 'BIF', { result: '1', odds: HJEMMEFAVORIT }),
      // Favorit hjemme, tabte → banker brast.
      kamp('b', 2, 'FCK', 'AGF', { result: '2', odds: HJEMMEFAVORIT }),
      // Udfordrer ude, vandt → favoritdrab.
      kamp('c', 3, 'OB', 'FCK', { result: '2', odds: HJEMMEFAVORIT }),
      // Udfordrer ude, tabte.
      kamp('d', 4, 'VB', 'FCK', { result: '1', odds: HJEMMEFAVORIT }),
    ];
    expect(favoritTal(matches, 'FCK')).toEqual({
      favoritI: 2, favoritHoldt: 1, udfordrerI: 2, draebte: 1,
      harBanker: true, harDraeber: true,
    });
  });

  it('læser favoritten fra HOLDETS side, ikke fra hjemmeholdets', () => {
    // Udehold er favorit: FCK ude er favorit, FCK hjemme er udfordrer.
    const matches = [
      kamp('ude', 1, 'BIF', 'FCK', { result: '2', odds: UDEFAVORIT }),
      kamp('hjemme', 2, 'FCK', 'BIF', { result: '1', odds: UDEFAVORIT }),
    ];
    const r = favoritTal(matches, 'FCK');
    expect(r.favoritI).toBe(1);
    expect(r.favoritHoldt).toBe(1);
    expect(r.udfordrerI).toBe(1);
    expect(r.draebte).toBe(1);
  });

  it('melder FRAVÆR frem for 0 af 0 — Hull City-tilfældet', () => {
    // Et hold, der aldrig er favorit, må ikke få et bankerkort med nævner
    // nul. Fladen skal skjule kortet, ikke vise en tom brøk.
    const matches = [
      kamp('a', 1, 'ARS', 'HUL', { result: '1', odds: HJEMMEFAVORIT }),
      kamp('b', 2, 'HUL', 'ARS', { result: '2', odds: UDEFAVORIT }),
    ];
    const r = favoritTal(matches, 'HUL');
    expect(r.favoritI).toBe(0);
    expect(r.harBanker).toBe(false);
    expect(r.udfordrerI).toBe(2);
    expect(r.harDraeber).toBe(true);
  });

  it('tæller IKKE en kamp, hvor X er favorit eller odds mangler', () => {
    // X-favorit peger ikke på et hold, og uden odds er der ingen favorit at
    // holde eller dræbe. Ingen af delene må tælle som et nederlag som favorit.
    const matches = [
      kamp('x', 1, 'FCK', 'BIF', { result: '1', odds: XFAVORIT }),
      kamp('ingen', 2, 'FCK', 'AGF', { result: '1' }),
      kamp('delt', 3, 'FCK', 'OB', { result: '1', odds: { 1: 2.5, X: 3.5, 2: 2.5 } }),
    ];
    expect(favoritTal(matches, 'FCK')).toEqual({
      favoritI: 0, favoritHoldt: 0, udfordrerI: 0, draebte: 0,
      harBanker: false, harDraeber: false,
    });
  });
});

describe('pointModForventning', () => {
  const seed = { FCK: 1600, BIF: 1400 };

  it('giver et POSITIVT tal, når holdet henter mere end ventet', () => {
    // To sejre som det stærkeste hold hjemme. Forventningen er høj, men under
    // 3 point pr. kamp, så forskellen skal være positiv og under 6.
    const matches = [
      kamp('a', 1, 'FCK', 'BIF', { result: '1' }),
      kamp('b', 2, 'FCK', 'BIF', { result: '1' }),
    ];
    const r = pointModForventning(matches, 'FCK', [], seed);
    expect(r.faktiske).toBe(6);
    expect(r.kampe).toBe(2);
    expect(r.forskel).toBeGreaterThan(0);
    expect(r.forskel).toBeLessThan(6);
    expect(r.ventede).toBeCloseTo(6 - r.forskel, 1);
  });

  it('giver et NEGATIVT tal, når favoritten fejler — fortegnet er hele pointen', () => {
    // Forgængeren, et overraskelsesindeks bygget på odds for det faldne
    // udfald, gav BEGGE hold en høj score for den samme kamp. Her skal det
    // stærke hold ned og det svage op på præcis samme kamp.
    const matches = [kamp('a', 1, 'FCK', 'BIF', { result: '2' })];
    const staerk = pointModForventning(matches, 'FCK', [], seed);
    const svag = pointModForventning(matches, 'BIF', [], seed);
    expect(staerk.forskel).toBeLessThan(0);
    expect(svag.forskel).toBeGreaterThan(0);
    // Og de er ikke ens: samme kamp må ikke belønne begge parter.
    expect(staerk.forskel).not.toBeCloseTo(svag.forskel, 1);
  });

  it('bruger eloHistory FØR runden, ikke seed-ratingen', () => {
    // Historikken siger, at BIF var steget til 1700 før runde 5 — altså
    // stærkere end FCK. Så er en FCK-sejr mere værd end forventet, og
    // forskellen skal være STØRRE end med seed-ratingen alene.
    const matches = [kamp('a', 5, 'FCK', 'BIF', { result: '1' })];
    const udenHistorik = pointModForventning(matches, 'FCK', [], seed);
    const medHistorik = pointModForventning(
      matches, 'FCK', [{ round: 4, elo: { FCK: 1600, BIF: 1700 } }], seed,
    );
    expect(medHistorik.forskel).toBeGreaterThan(udenHistorik.forskel);
  });

  it('tager det SENESTE snapshot før runden, så et hul ikke rammer forkert', () => {
    // Runde 4 er udsat og har intet snapshot. Kampen i runde 5 skal bruge
    // runde 3's tal, ikke runde 1's — og slet ikke runde 6's.
    const matches = [kamp('a', 5, 'FCK', 'BIF', { result: '1' })];
    const historik = [
      { round: 1, elo: { FCK: 1500, BIF: 1500 } },
      { round: 3, elo: { FCK: 1600, BIF: 1700 } },
      { round: 6, elo: { FCK: 1900, BIF: 1200 } },
    ];
    const faktisk = pointModForventning(matches, 'FCK', historik, seed);
    const kunRunde3 = pointModForventning(
      matches, 'FCK', [{ round: 3, elo: { FCK: 1600, BIF: 1700 } }], seed,
    );
    expect(faktisk.ventede).toBe(kunRunde3.ventede);
    // Og IKKE runde 1's eller runde 6's tal.
    const kunRunde1 = pointModForventning(
      matches, 'FCK', [{ round: 1, elo: { FCK: 1500, BIF: 1500 } }], seed,
    );
    expect(faktisk.ventede).not.toBe(kunRunde1.ventede);
  });

  it('regner forventningen af MODELLEN, ikke af kampens frosne odds', () => {
    // Afgørelse 3b: match.odds må aldrig røres. Her bærer kampen odds fra den
    // gamle model (loft 6,0), og de skal ikke kunne flytte tallet.
    const matches = [kamp('a', 1, 'FCK', 'BIF', { result: '1', odds: { 1: 6, X: 6, 2: 6 } })];
    const med = pointModForventning(matches, 'FCK', [], seed);
    const uden = pointModForventning(
      [kamp('a', 1, 'FCK', 'BIF', { result: '1' })], 'FCK', [], seed,
    );
    expect(med).toEqual(uden);

    // Og tallet skal svare til den nuværende model, regnet uafhængigt her.
    const p = outcomeProbabilities({ eloHome: 1600, eloAway: 1400 });
    expect(med.ventede).toBeCloseTo(Math.round(((3 * p['1']) + p.X) * 10) / 10, 5);
  });

  it('falder tilbage på START-ratingen for et hold uden seed', () => {
    const matches = [kamp('a', 1, 'NYT', 'OGSAA_NYT', { result: '1' })];
    const r = pointModForventning(matches, 'NYT', [], {});
    const p = outcomeProbabilities({ eloHome: ELO.START, eloAway: ELO.START });
    expect(r.ventede).toBeCloseTo(Math.round(((3 * p['1']) + p.X) * 10) / 10, 5);
  });

  it('giver ÉT point for uafgjort — ikke nul', () => {
    // Mutationen "uafgjort giver 0 point" overlevede den første suite, fordi
    // ingen test havde en uafgjort kamp overhovedet.
    const matches = [kamp('a', 1, 'FCK', 'BIF', { result: 'X' })];
    expect(pointModForventning(matches, 'FCK', [], seed).faktiske).toBe(1);
    expect(pointModForventning(matches, 'BIF', [], seed).faktiske).toBe(1);
  });

  it('bruger UDE-sandsynligheden for et udehold', () => {
    // Mutationen "sejrssandsynlighed altid hjemme" overlevede, fordi de
    // tidligere fortegns-tests kun krævede positiv/negativ — og begge sider
    // af den fejl gav samme fortegn. Her kræves den præcise værdi.
    const matches = [kamp('a', 1, 'BIF', 'FCK', { result: '2' })];
    const p = outcomeProbabilities({ eloHome: 1400, eloAway: 1600 });
    const r = pointModForventning(matches, 'FCK', [], seed);
    expect(r.ventede).toBeCloseTo(Math.round(((3 * p['2']) + p.X) * 10) / 10, 5);
    // Og den må ikke være hjemmeholdets — de to er tydeligt forskellige her.
    expect(r.ventede).not.toBeCloseTo(Math.round(((3 * p['1']) + p.X) * 10) / 10, 1);
  });

  it('tæller kun AFGJORTE kampe med', () => {
    const matches = [
      kamp('a', 1, 'FCK', 'BIF', { result: '1' }),
      kamp('b', 2, 'FCK', 'BIF'),
    ];
    expect(pointModForventning(matches, 'FCK', [], seed).kampe).toBe(1);
  });
});
