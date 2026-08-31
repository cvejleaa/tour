// ---------------------------------------------------------------------------
// EN LIGAS POINT, NÅR DEN STARTER SENERE END SPILLET.
//
// Tallene er ikke opfundet: `perRound` skrives af serveren sammen med totalen,
// og summen herunder skal give NØJAGTIG spillets total, når ligaen ikke har en
// startrunde. Gør den ikke det, står den samme spiller med to forskellige tal
// på to faner — den fejl, hele formen blev valgt for at undgå.
// ---------------------------------------------------------------------------
import { describe, it, expect } from 'vitest';
import {
  ligaPoint, puljenTaeller, harRundeVektor, vektorStemmer, DRIFT_LOFT,
  PULJE_MAKS_STARTRUNDE, UDEN_RUNDE,
} from './ligaPoint';
import { opdelPoint, buildRoundContext } from './pointOpdeling';

describe('ligaPoint', () => {
  const VEKTOR = { 1: 10, 2: 5, 3: -2, 4: 8 };

  it('lægger alle runder sammen uden en startrunde', () => {
    expect(ligaPoint(VEKTOR, null)).toBe(21);
    expect(ligaPoint(VEKTOR, undefined)).toBe(21);
  });

  it('udelader runderne FØR startrunden', () => {
    expect(ligaPoint(VEKTOR, 2)).toBe(11);
    expect(ligaPoint(VEKTOR, 3)).toBe(6);
    expect(ligaPoint(VEKTOR, 4)).toBe(8);
    expect(ligaPoint(VEKTOR, 5)).toBe(0);
  });

  it('tager startrunden SELV med', () => {
    // `r < startRunde` og ikke `<=`. Ligaen starter VED runde 2, ikke efter.
    expect(ligaPoint({ 2: 7 }, 2)).toBe(7);
  });

  // Samme beslutning som gatens: `foerStart` rører aldrig en kamp uden runde,
  // fordi `null < n` og `undefined < n` ikke svarer ens. Point fra sådan en
  // kamp må ikke forsvinde, bare fordi en liga starter sent.
  it('tager kampe uden rundenummer med, uanset startrunde', () => {
    const v = { 1: 10, [UDEN_RUNDE]: 3 };
    expect(ligaPoint(v, null)).toBe(13);
    expect(ligaPoint(v, 99)).toBe(3);
  });

  it('gulver ved 0 ÉN gang, på summen', () => {
    // En tabt Chancen i runde 5 må trække fra runde 4's gevinst. Gulvedes hver
    // runde for sig, ville ligaens total blive HØJERE end spillets.
    expect(ligaPoint({ 4: 8, 5: -20 }, null)).toBe(0);
    expect(ligaPoint({ 4: 8, 5: -3 }, null)).toBe(5);
  });

  it('ser bort fra nøgler, der ikke er runder', () => {
    expect(ligaPoint({ 1: 5, pulje: 34, ukendt: 100 }, null)).toBe(5);
  });

  it('tåler at vektoren mangler', () => {
    expect(ligaPoint(null, 2)).toBe(0);
    expect(ligaPoint(undefined, null, 5)).toBe(5);
  });
});

describe('puljen', () => {
  it('tæller med til og med den valgte grænse', () => {
    expect(ligaPoint({ 5: 10 }, 3, 34)).toBe(44);
    expect(ligaPoint({ 5: 10 }, 4, 34)).toBe(10);
  });

  it('tæller altid med for en liga uden startrunde', () => {
    expect(puljenTaeller(null)).toBe(true);
    expect(ligaPoint({ 1: 10 }, null, 34)).toBe(44);
  });

  it('følger grænsen på begge sider', () => {
    expect(puljenTaeller(PULJE_MAKS_STARTRUNDE)).toBe(true);
    expect(puljenTaeller(PULJE_MAKS_STARTRUNDE + 1)).toBe(false);
  });

  // GRÆNSEN ER ET VALG MED ET SLÆK — og slækket skal stå sort på hvidt.
  //
  // Superligaens `puljeLockAt` er 1. august 15:59 UTC, altså LIGE FØR runde 2
  // (første kamp 16:00 UTC). Strengt taget kunne kun en liga fra runde 2 have
  // haft alle medlemmer inde før deadline. Ejeren har valgt 3, altså ét rundes
  // slæk.
  //
  // TESTEN DOKUMENTERER — DEN BINDER IKKE. `puljeLockAt` er admin-sat
  // produktionsdata; flyttes deadlinen i admin, bliver intet her rødt. Datoen
  // herunder er en afskrift af, hvad der stod, da grænsen blev valgt, så
  // regnestykket bag slækket kan efterprøves — ikke en vagt mod ændringer.
  it('giver præcis ét rundes slæk i forhold til puljens deadline', () => {
    const PULJE_LUKKER = Date.parse('2026-08-01T15:59:00Z');
    const RUNDE_2_START = Date.parse('2026-08-01T16:00:00Z');
    expect(PULJE_LUKKER).toBeLessThan(RUNDE_2_START);
    // Deadline ligger før runde 2 → den "rene" grænse ville være 2.
    const RENE_GRAENSE = 2;
    expect(PULJE_MAKS_STARTRUNDE).toBe(RENE_GRAENSE + 1);
    // …og slækket er præcis én runde: en liga fra runde 3 beholder puljen,
    // en fra runde 4 gør ikke.
    expect(puljenTaeller(3)).toBe(true);
    expect(puljenTaeller(4)).toBe(false);
  });
});

describe('harRundeVektor', () => {
  it('skelner "ikke beregnet endnu" fra "nul point"', () => {
    // En spiller, der ikke er genberegnet, har feltet slet ikke. Fladen skal
    // kunne sige "ikke klar" i stedet for at påstå nul — samme mønster som
    // `opdeling` allerede har i gameStandings.js.
    expect(harRundeVektor(undefined)).toBe(false);
    expect(harRundeVektor(null)).toBe(false);
    expect(harRundeVektor([])).toBe(false);
    expect(harRundeVektor({})).toBe(true);
    expect(harRundeVektor({ 1: 5 })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// DEN BÆRENDE: SUMMEN SKAL RAMME SPILLETS EGEN TOTAL.
//
// `perRound` og `total` regnes af det samme kald, men ad hver sin vej: totalen
// af `raw + combi + pulje`, vektoren af bets grupperet på runde plus combi pr.
// runde. Driver de fra hinanden, ser en spiller ét tal i stillingen og et
// andet i sin liga — uden at noget fejler.
// ---------------------------------------------------------------------------
describe('runde-vektoren summer til spillets total', () => {
  const NU = Date.parse('2026-09-01T12:00:00Z');
  const KAMPE = [
    { id: 'm1', round: 1, result: '1', odds: { 1: 2.17, X: 4, 2: 4 }, kickoff: 1000 },
    { id: 'm2', round: 1, result: 'X', odds: { 1: 4, X: 3.33, 2: 4 }, kickoff: 1100 },
    { id: 'm3', round: 2, result: '2', odds: { 1: 4, X: 4, 2: 2.5 }, kickoff: 2000 },
    { id: 'm4', round: 2, result: '1', odds: { 1: 1.9, X: 4, 2: 4 }, kickoff: 2100 },
  ];
  const BETS = [
    { matchId: 'm1', pick: '1', points: 5.42 },
    { matchId: 'm2', pick: 'X', points: 4.33 },
    { matchId: 'm3', pick: '2', points: 3.5 },
    { matchId: 'm4', pick: '2', points: -2 }, // tabt Chancen
  ];

  const kald = (puljeBonus = 0) => opdelPoint({
    bets: BETS, roundCtx: buildRoundContext(KAMPE), puljeBonus, nowMs: NU,
  });

  it('rammer totalen uden startrunde', () => {
    const o = kald(12);
    expect(ligaPoint(o.perRunde, null, 12)).toBe(o.total);
  });

  it('rammer totalen også uden pulje', () => {
    const o = kald(0);
    expect(ligaPoint(o.perRunde, null, 0)).toBe(o.total);
  });

  it('bliver MINDRE, når ligaen starter senere', () => {
    const o = kald(0);
    const hele = ligaPoint(o.perRunde, null, 0);
    const fra2 = ligaPoint(o.perRunde, 2, 0);
    expect(fra2).toBeLessThan(hele);
    // …og runde 1's andel er præcis forskellen.
    expect(Math.round((hele - fra2) * 10) / 10).toBe(o.perRunde['1']);
  });

  it('lægger rundens combi i DEN runde, den blev vundet i', () => {
    const o = kald(0);
    // Runde 1: begge ramt → combi. Runde 2: én ramt, én tabt → ingen combi.
    // Runde 1's andel skal derfor være større end de rå bet-point alene.
    expect(o.perRunde['1']).toBeGreaterThan(5.42 + 4.33);
    expect(o.perRunde['2']).toBeCloseTo(3.5 - 2, 1);
    // BÆRENDE: combien må ikke havne i runde 2 — så ville en liga fra runde 2
    // arve en bonus, den ikke var med til at vinde.
    expect(o.perRunde['2']).toBeLessThan(o.perRunde['1']);
  });

  // SPEJLBILLEDET af testen ovenfor — og den er ikke pynt. Fixturet ovenfor
  // vinder kun combi i runde 1, så mutationen "læg AL combi i runde 1" bestod
  // med grøn suite: der var ingen combi andre steder at flytte. Her vindes den
  // i runde 2, og BEGGE runder er sømmet fast med præcise tal.
  it('lægger combien i runde 2, når den vindes DÉR — og runde 1 får intet', () => {
    const bets = [
      { matchId: 'm1', pick: '1', points: 5.42 }, // ramt
      { matchId: 'm2', pick: '1', points: 0 },    // forbi → ingen combi i runde 1
      { matchId: 'm3', pick: '2', points: 3.5 },  // ramt
      { matchId: 'm4', pick: '1', points: 2.9 },  // ramt → combi i runde 2
    ];
    const o = opdelPoint({ bets, roundCtx: buildRoundContext(KAMPE), puljeBonus: 0, nowMs: NU });
    // Runde 1: KUN de rå point — 5,4. Får den så meget som en tiendedel combi,
    // er bonussen havnet i en runde, den ikke blev vundet i.
    expect(o.perRunde['1']).toBe(5.4);
    // Runde 2: rå 3,5 + 2,9 = 6,4 PLUS combi — altså skarpt over 6,4.
    expect(o.perRunde['2']).toBeGreaterThan(6.4);
    // …og en liga fra runde 2 får hele sin combi med.
    expect(ligaPoint(o.perRunde, 2, 0)).toBe(o.perRunde['2']);
  });
});

describe('vektorStemmer — kan vektoren gengive spillets total?', () => {
  it('siger ja, når vektoren summer til spillets total', () => {
    expect(vektorStemmer({ 1: 20, 2: 5, 3: 5 }, 30, 0)).toBe(true);
  });

  it('siger NEJ, når en hel runde mangler — den tavse fejl, vagten findes for', () => {
    // Spilleren har 30 point ifølge serveren, men vektoren kender kun 10.
    // Uden vagten ville ligaen vise ham med 10 og placere ham langt nede,
    // uden en eneste fejlbesked.
    expect(vektorStemmer({ 2: 5, 3: 5 }, 30, 0)).toBe(false);
  });

  it('tåler afrundings-driften, den SKAL tåle', () => {
    // Serveren afrunder ÉN gang på summen; vektoren afrunder hver runde for
    // sig. Med tre runder á 0,05 i drift må svaret stadig være ja — ellers
    // ville en stor del af feltet stå som "ikke klar" af ren afrunding.
    // 3,35 + 3,35 + 3,35 = 10,05 → serveren skriver 10,1; hver runde står
    // afrundet som 3,4 → 10,2. Forskellen er 0,1, inden for slækket.
    expect(vektorStemmer({ 1: 3.4, 2: 3.4, 3: 3.4 }, 10.1, 0)).toBe(true);
  });

  it('slækket vokser IKKE nok til at skjule en manglende runde', () => {
    // Grænsetilfældet, der adskiller de to fejltyper. Fire runder giver et
    // slæk på 0,25 — en manglende runde på 5 point er tyve gange så stor.
    expect(vektorStemmer({ 1: 5, 2: 5, 3: 5, 4: 5 }, 25, 0)).toBe(false);
    // Og lige under slækket er svaret stadig ja.
    expect(vektorStemmer({ 1: 5, 2: 5, 3: 5, 4: 5 }, 20.2, 0)).toBe(true);
  });

  it('regner puljebonussen med — ellers ville hver spiller med pulje være "ikke klar"', () => {
    // Puljen står UDEN FOR vektoren (opdelPoint), men indgår i spillets total.
    expect(vektorStemmer({ 1: 5 }, 39, 34)).toBe(true);
    // Og glemmer man den, stemmer det ikke.
    expect(vektorStemmer({ 1: 5 }, 39, 0)).toBe(false);
  });

  it('siger nej uden vektor og ved et ubrugeligt total', () => {
    expect(vektorStemmer(null, 30, 0)).toBe(false);
    expect(vektorStemmer({}, 30, 0)).toBe(false);
    // `undefined` total: en spiller uden totalPoints kan ikke efterprøves, og
    // et gæt ville være værre end et "ikke klar".
    expect(vektorStemmer({ 1: 30 }, undefined, 0)).toBe(false);
  });

  it('LOFTET binder ved mange runder — Test Managers fund', () => {
    // 30 runder á 1,5 = 45. Uden loft var slækket 0,05 pr. nøgle = 1,55, så
    // ALT under 1,55 så lovligt ud. Med loftet på 1,2 fanges hullet på 1,5.
    //
    // Båndet er skrevet, så det bliver RØDT af den gamle værdi: 1,5 < 1,55
    // (slap igennem før) og 1,5 > 1,2 (fanges nu).
    const tredive = {};
    for (let r = 1; r <= 30; r += 1) tredive[r] = 1.5;
    expect(vektorStemmer(tredive, 46.5, 0)).toBe(false);
    // Og lovlig drift skal stadig slippe igennem. Målt maks ved 38 runder er
    // 0,90 (scripts/maal-vektordrift.mjs).
    expect(vektorStemmer(tredive, 45.9, 0)).toBe(true);
  });

  it('DEN BLINDE VINKEL er kendt og bevidst — ikke overset', () => {
    // Et hul på præcis 1,0 slipper stadig igennem ved 30 runder. Det er ikke
    // en fejl, det er byttehandelen: den målte drift når 0,90, så ethvert loft,
    // der fanger et 1,0-hul, ville også afvise spillere, hvis tal er helt i
    // orden. De to overlapper, og der findes ingen grænse, der adskiller dem.
    //
    // Testen står her, for at valget ikke kan glide ubemærket: hæver eller
    // sænker nogen DRIFT_LOFT, skal de forholde sig til DETTE tilfælde.
    const tredive = {};
    for (let r = 1; r <= 30; r += 1) tredive[r] = 1.5;
    expect(vektorStemmer(tredive, 46, 0)).toBe(true);
  });

  it('loftet er sat OVER den målte drift, ikke under', () => {
    // Båndet, der gør loftet til et valg og ikke en tilfældighed. Sænkes
    // DRIFT_LOFT til den målte maks (0,90) eller derunder, bliver lange
    // sæsoner ramt af falske "ikke klar".
    expect(DRIFT_LOFT).toBeGreaterThan(0.9);
    // Og hæves det til værste-tilfælde-grænsen ved 30 runder (1,55), er
    // loftet holdt op med at binde noget som helst.
    expect(DRIFT_LOFT).toBeLessThan(1.55);
  });

  it('kampe uden rundenummer tæller med, præcis som i ligaPoint', () => {
    expect(vektorStemmer({ 1: 20, uden: 10 }, 30, 0)).toBe(true);
  });
});
